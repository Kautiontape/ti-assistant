import "server-only";
// Server side of the Twilight's Fall draft. Drafts share the Milty draft's
// forkDrafts collection (format "twilightsFall"), so the existing read rule
// and TTL cover them. Dealt hands and secret picks live in
// forkDrafts/{id}/private/hands, which browsers can't read (no rule allows
// it); phones ask /api/fork/tfdraft/{id}?player=N for their own cards.
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { POST as dataUpdate } from "../../../app/api/[gameId]/dataUpdate/route";
import { POST as createGame } from "../../../app/api/create-game/route";
import { getFactions } from "../../../server/data/factions";
import { BASE_OPTIONS } from "../../../server/data/options";
import { getFirestoreAdmin, getIntl } from "../../util/server";
import { KINGS } from "./cards";
import {
  apply, cardsOf, deal, fromStored, holding, homeOptions, isTfDraft, kingOf, makePacks, maxPacks, secretFromStored, secretOptions, secretToStored, status, toStored,
  type Action, type SecretStep, type StoredTfDraft, type StoredTfSecret, type TfDraft, type TfRules, type TfSecret,
} from "./draft";
import { layoutFor, playerCounts, type Style } from "./layouts";

const DRAFTS = "forkDrafts";
const PRIVATE = "private";

export class TfDraftError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const makeId = () => Array.from({ length: 6 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join("");
const shuffled = <T,>(xs: T[]) => { const out = [...xs]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; } return out; };

function checkRules(x: unknown): TfRules {
  const r = (x ?? {}) as Record<string, unknown>;
  if (!["pass", "packs"].includes(r.cards as string) || !["open", "secret"].includes(r.home as string) || !["order", "snake"].includes(r.kings as string) || typeof r.keleres !== "boolean") throw new TfDraftError(400, "The draft rules aren't valid.");
  return { cards: r.cards as TfRules["cards"], home: r.home as TfRules["home"], kings: r.kings as TfRules["kings"], keleres: r.keleres };
}

// What a phone sends to make a draft. The phone generates slices and the
// pre-dealt tiles from upstream's base data; the server checks their shape and
// deals the cards itself, so no phone sees another's hand.
function checkSetup(body: Record<string, unknown>) {
  const style = body.style as Style;
  if (!["nucleus", "milty", "eq"].includes(style)) throw new TfDraftError(400, "Unknown map style.");
  const players = body.players;
  if (!Array.isArray(players) || !playerCounts(style).includes(players.length) || !players.every((p) => typeof p === "string" && p.length <= 40)) throw new TfDraftError(400, `This map style takes ${playerCounts(style).join(" or ")} players.`);
  const n = players.length;
  const layout = layoutFor(style, n);
  const k = layout.slots[0]!.length;
  const tile = (t: unknown) => typeof t === "string" && /^\d+$/.test(t);
  const slices = body.slices;
  if (!Array.isArray(slices) || slices.length < n || slices.length > n + 4 || !slices.every((s) => Array.isArray(s) && s.length === k && s.every(tile))) throw new TfDraftError(400, "The slices aren't valid.");
  const fixed = body.fixed;
  if (!Array.isArray(fixed) || fixed.length !== layout.fixed.length || !fixed.every(tile)) throw new TfDraftError(400, "The map tiles aren't valid.");
  const all = [...(slices as string[][]).flat(), ...(fixed as string[])];
  if (new Set(all).size !== all.length) throw new TfDraftError(400, "A system is listed twice.");
  return { style, players: players as string[], slices: slices as string[][], fixed: fixed as string[] };
}

export async function createTfDraft(body: Record<string, unknown>) {
  const setup = checkSetup(body);
  const rules = checkRules(body.rules);
  const n = setup.players.length;
  const seed = String(body.seed ?? "").slice(0, 40) || Math.random().toString(36).slice(2, 10);
  const packCount = rules.cards === "packs" ? Math.min(maxPacks(rules.keleres), Math.max(n, Number(body.packs) || n)) : 0;
  const db = await getFirestoreAdmin();
  let id = makeId();
  while ((await db.collection(DRAFTS).doc(id).get()).exists) id = makeId();
  const deleteAt = new Date();
  deleteAt.setDate(deleteAt.getDate() + 30);
  const draft: TfDraft = {
    id, format: "twilightsFall", name: typeof body.name === "string" ? body.name.slice(0, 60) : "", createdAt: Date.now(),
    ...setup, rules,
    order: body.keepOrder === true ? Array.from({ length: n }, (_, i) => i) : shuffled(Array.from({ length: n }, (_, i) => i)),
    packs: packCount ? makePacks(packCount, rules.keleres, seed) : [],
    kings: [...KINGS], seed, victoryPoints: body.victoryPoints === 14 ? 14 : 10, log: [], updatedAt: Date.now(),
  };
  const secret: TfSecret = { dealt: rules.cards === "pass" ? deal(n, rules.keleres, Math.random) : [], staged: {} };
  const ref = db.collection(DRAFTS).doc(id);
  const batch = db.batch();
  batch.set(ref, { ...toStored(draft), deleteAt: Timestamp.fromDate(deleteAt) });
  batch.set(ref.collection(PRIVATE).doc("hands"), { ...secretToStored(secret), deleteAt: Timestamp.fromDate(deleteAt) });
  await batch.commit();
  return id;
}

async function read(tx: FirebaseFirestore.Transaction, id: string) {
  const db = await getFirestoreAdmin();
  const ref = db.collection(DRAFTS).doc(id);
  const hands = ref.collection(PRIVATE).doc("hands");
  const [snap, secretSnap] = await Promise.all([tx.get(ref), tx.get(hands)]);
  if (!snap.exists || !isTfDraft(snap.data() as { format?: string })) throw new TfDraftError(404, "No Twilight's Fall draft with that code.");
  return { ref, hands, d: fromStored(snap.data() as StoredTfDraft), secret: secretFromStored((secretSnap.data() ?? { dealt: [], staged: {} }) as StoredTfSecret) };
}

// Turn-based picks and undo carry how many log entries the phone had seen, so
// a phone that's behind can't pick out of turn or undo someone else's pick.
// Secret picks don't: everyone makes them at once.
export async function changeTfDraft(id: string, body: Record<string, unknown>) {
  const db = await getFirestoreAdmin();
  return db.runTransaction(async (tx) => {
    const { ref, hands, d, secret } = await read(tx, id);
    if (body.action !== "secret" && body.seen !== d.log.length) throw new TfDraftError(409, "Someone picked since. The draft has been updated; check it and try again.");
    if (body.action === "undo" && d.creating) throw new TfDraftError(409, "The game is being created.");
    const by = typeof body.by === "number" ? { by: body.by } : {};
    let a: Action;
    switch (body.action) {
      case "pick": a = { action: "pick", player: Number(body.player), kind: body.kind as Extract<Action, { action: "pick" }>["kind"], value: body.value as number | string, ...by }; break;
      case "home": a = { action: "home", player: Number(body.player), value: String(body.value), ...by }; break;
      case "secret": a = { action: "secret", player: Number(body.player), step: body.step as SecretStep, value: String(body.value), ...by }; break;
      case "undo": a = { action: "undo" }; break;
      default: throw new TfDraftError(400, "Unknown action.");
    }
    const r = apply(d, secret, a);
    if ("problem" in r) throw new TfDraftError(409, r.problem);
    tx.update(ref, { log: r.log, updatedAt: Date.now() });
    if (JSON.stringify(r.secret) !== JSON.stringify(secret)) tx.update(hands, { staged: r.secret.staged });
    return { log: r.log.length };
  });
}

// A player's own cards: what they choose from now, what they've kept, and the
// secret pick they've made in the current step.
export async function handOf(id: string, player: number) {
  const db = await getFirestoreAdmin();
  return db.runTransaction(async (tx) => {
    const { d, secret } = await read(tx, id);
    if (!(Number.isInteger(player) && player >= 0 && player < d.players.length)) throw new TfDraftError(400, "No such player.");
    const s = status(d);
    const step = s.step?.type === "secret" ? s.step.id : undefined;
    const hand = cardsOf(d, secret, player);
    return {
      log: d.log.length,
      choose: step ? secretOptions(d, secret, player, step) : s.step?.id === "home" ? homeOptions(d, secret, player) : hand.choose,
      kept: hand.kept,
      staged: step ? secret.staged[step]?.[String(player)] ?? null : null,
      step: step ?? s.step?.id ?? null,
    };
  });
}

// ---------- The game ----------

export function tfGamePayload(d: TfDraft, baseFactions: Record<string, { color?: string } | undefined>) {
  const n = d.players.length;
  const s = status(d);
  if (s.step) throw new TfDraftError(409, "The draft isn't finished.");
  const layout = layoutFor(d.style, n);
  const tokens = [...layout.template];
  layout.fixed.forEach((at, i) => { tokens[at] = d.fixed[i]!; });
  const seated = Array.from({ length: n }, (_, seat) => s.playerAt[seat]!);
  seated.forEach((p, seat) => {
    const slice = d.slices[Number(holding(d.log, p, "slice"))];
    slice?.forEach((tile, j) => { tokens[layout.slots[seat]![j]!] = tile; });
  });
  const mapString = tokens.join(" ");
  const factions = seated.map((p) => {
    const king = kingOf(d, p)!;
    return { id: king, name: king, color: baseFactions[king]?.color, playerName: d.players[p] || undefined };
  });
  const options = {
    ...BASE_OPTIONS, expansions: [...BASE_OPTIONS.expansions, "TWILIGHTS FALL"], events: [], hide: [],
    "map-style": "standard", "map-string": mapString, "processed-map-string": mapString, "victory-points": d.victoryPoints,
  };
  // Each King's home system and starting units, by upstream's CHOOSE_TF_FACTION.
  const choices = seated.flatMap((p) => {
    const king = kingOf(d, p)!;
    const home = s.homes[p]!;
    return [
      { factionId: king, subFaction: home.drawn ?? home.card, type: "Planet" as const },
      { factionId: king, subFaction: s.units[p]!, type: "Unit" as const },
    ];
  });
  return { factions, speaker: s.seatOf[s.speaker!]!, options, choices, mapString };
}

const CLAIM_MS = 60_000;

export async function startTfGame(id: string) {
  const db = await getFirestoreAdmin();
  const claimed = await db.runTransaction(async (tx) => {
    const { ref, d } = await read(tx, id);
    if (d.gameId) return { gameId: d.gameId };
    if (status(d).step) throw new TfDraftError(409, "The draft isn't finished.");
    if (d.creating && Date.now() - d.creating < CLAIM_MS) throw new TfDraftError(409, "Another phone is creating the game.");
    tx.update(ref, { creating: Date.now() });
    return { draft: d, ref };
  });
  if ("gameId" in claimed) return claimed.gameId as string;
  const ref = claimed.ref;
  try {
    const intl = await getIntl("en");
    const { factions, speaker, options, choices } = tfGamePayload(claimed.draft, getFactions(intl) as Record<string, { color?: string }>);
    // Upstream's own create-game and dataUpdate handlers, called in-process.
    const res = await createGame(new Request("http://localhost/api/create-game", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factions, speaker, options }),
    }));
    const { gameid } = (await res.json()) as { gameid?: string };
    if (!res.ok || !gameid) throw new Error(`create-game answered ${res.status}`);
    for (const event of choices) {
      const r = await dataUpdate(new Request(`http://localhost/api/${gameid}/dataUpdate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CHOOSE_TF_FACTION", event, timestamp: Date.now(), gameTime: 0 }),
      }), { params: Promise.resolve({ gameId: gameid }) });
      if (!r.ok) throw new Error(`CHOOSE_TF_FACTION for ${event.factionId} answered ${r.status}`);
    }
    await ref.update({ gameId: gameid, creating: FieldValue.delete() });
    // The hands aren't needed once the game exists: everything is public now.
    await ref.collection(PRIVATE).doc("hands").delete();
    return gameid;
  } catch (e) {
    await ref.update({ creating: FieldValue.delete() });
    throw e;
  }
}
