import "server-only";
// Server side of the draft: the forkDrafts documents, every change to them in
// a transaction, and creating the game when the draft is done. Browsers only
// read a draft (deploy/ktn/firebase/firestore.rules); all writes come here.
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { POST as createGame } from "../../../app/api/create-game/route";
import { BASE_OPTIONS } from "../../../server/data/options";
import { getFactions } from "../../../server/data/factions";
import { getDefaultMapString } from "../../util/map";
import { getFirestoreAdmin, getIntl } from "../../util/server";
import { buildMapString, fromStored, holdings, pickProblem, toStored, wedges, type Draft, type Pick, type PickKind, type StoredDraft } from "./milty";

export const DRAFTS = "forkDrafts";

export class DraftError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const makeId = () => Array.from({ length: 6 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join("");

function isSlices(x: unknown, players: number): x is string[][] {
  return Array.isArray(x) && x.length >= players && x.length <= 12 && x.every((s) => Array.isArray(s) && s.length === 5 && s.every((t) => typeof t === "string" && /^\d+$/.test(t)));
}
function isOrder(x: unknown, players: number): x is number[] {
  return Array.isArray(x) && x.length === players && [...x].sort((a, b) => a - b).every((v, i) => v === i);
}

// What a phone sends to make or reroll a draft. The phone generates the slices
// from upstream's base data; the server checks their shape.
export function checkSetup(body: Record<string, unknown>) {
  const players = body.players;
  if (!Array.isArray(players) || players.length !== 6 || !players.every((p) => typeof p === "string" && p.length <= 40)) throw new DraftError(400, "A draft needs 6 player names (they can be blank).");
  if (!isSlices(body.slices, 6)) throw new DraftError(400, "The slices aren't valid.");
  if (!isOrder(body.order, 6)) throw new DraftError(400, "The draft order isn't valid.");
  const factions = body.factions;
  if (!Array.isArray(factions) || factions.length < 6 || factions.length > 20 || !factions.every((f) => typeof f === "string")) throw new DraftError(400, "The factions aren't valid.");
  if (new Set(factions).size !== factions.length || new Set((body.slices as string[][]).flat()).size !== (body.slices as string[][]).flat().length) throw new DraftError(400, "Something is listed twice.");
  return { players: players as string[], slices: body.slices, order: body.order, factions: factions as string[] };
}

export async function createDraft(body: Record<string, unknown>) {
  const setup = checkSetup(body);
  const expansions = Array.isArray(body.expansions) ? (body.expansions as string[]).filter((e) => (BASE_OPTIONS.expansions as string[]).includes(e)) : BASE_OPTIONS.expansions;
  const db = await getFirestoreAdmin();
  let id = makeId();
  while ((await db.collection(DRAFTS).doc(id).get()).exists) id = makeId();
  const deleteAt = new Date();
  deleteAt.setDate(deleteAt.getDate() + 30);
  const draft: Draft = {
    id,
    name: typeof body.name === "string" ? body.name.slice(0, 60) : "",
    createdAt: Date.now(),
    ...setup,
    seed: String(body.seed ?? "").slice(0, 40),
    limits: body.limits as Draft["limits"],
    expansions: expansions as string[],
    victoryPoints: body.victoryPoints === 14 ? 14 : 10,
    picks: [],
  };
  await db.collection(DRAFTS).doc(id).set({ ...toStored(draft), deleteAt: Timestamp.fromDate(deleteAt) });
  return id;
}

// Picks, undo and reroll each carry how many picks the phone had seen, so a
// phone that's behind can't pick out of turn or undo someone else's pick.
export async function changeDraft(id: string, body: Record<string, unknown>) {
  const db = await getFirestoreAdmin();
  const ref = db.collection(DRAFTS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DraftError(404, "No draft with that code.");
    const d = fromStored(snap.data() as StoredDraft);
    if (body.seen !== d.picks.length) throw new DraftError(409, "Someone picked since. The draft has been updated; check it and try again.");
    if (d.gameId) throw new DraftError(409, "The game has already been created.");
    switch (body.action) {
      case "pick": {
        const pick = { player: Number(body.player), kind: body.kind as PickKind, value: body.value as number | string };
        if (!["slice", "faction", "position"].includes(pick.kind)) throw new DraftError(400, "Unknown pick.");
        const problem = pickProblem(d, pick);
        if (problem) throw new DraftError(409, problem);
        const entry: Pick = { ...pick, at: Date.now(), ...(typeof body.by === "number" ? { by: body.by } : {}) };
        tx.update(ref, { picks: [...d.picks, entry] });
        return { picks: d.picks.length + 1 };
      }
      case "undo": {
        if (!d.picks.length) throw new DraftError(409, "Nothing to undo.");
        if (d.creating) throw new DraftError(409, "The game is being created.");
        tx.update(ref, { picks: d.picks.slice(0, -1) });
        return { picks: d.picks.length - 1 };
      }
      case "reroll": {
        if (d.picks.length) throw new DraftError(409, "Slices can only change before the first pick.");
        const setup = checkSetup({ ...body, players: d.players });
        tx.update(ref, { slices: toStored(setup).slices, factions: setup.factions, order: setup.order, seed: String(body.seed ?? "").slice(0, 40) });
        return { picks: 0 };
      }
    }
    throw new DraftError(400, "Unknown action.");
  });
}

// Upstream's setup picks a colour the same way (getBestRemainingColor in
// app/[locale]/setup/setup-page.tsx): the faction's colour, then its list.
const ALL_COLORS = ["Red", "Black", "Orange", "Green", "Yellow", "Magenta", "Blue", "Purple"];
function pickColor(f: { color?: string; colorList?: string[] } | undefined, used: Set<string>, pok: boolean) {
  const ok = (c: string) => !used.has(c) && (pok || (c !== "Magenta" && c !== "Orange"));
  if (f?.color && ok(f.color)) return f.color;
  return (f?.colorList ?? []).find(ok) ?? ALL_COLORS.find(ok);
}

export function gamePayload(d: Draft, baseFactions: Record<string, { color?: string; colorList?: string[] } | undefined>) {
  const n = d.players.length;
  const te = d.expansions.includes("THUNDERS EDGE");
  const pok = d.expansions.includes("POK");
  const template = getDefaultMapString(n, "standard", te);
  const w = wedges(template);
  // Position 0 is the speaker and sits at P1; create-game seats factions in
  // array order (P1 first) and counts speaking order clockwise from `speaker`.
  const seated = Array.from({ length: n }, (_, pos) => d.players.findIndex((_, p) => holdings(d.picks, p).position === pos));
  if (seated.some((p) => p < 0)) throw new DraftError(409, "The draft isn't finished.");
  const mapString = buildMapString(template, w, seated.map((p) => d.slices[holdings(d.picks, p).slice!]));
  const used = new Set<string>();
  const factions = seated.map((p) => {
    const id = holdings(d.picks, p).faction!;
    const color = pickColor(baseFactions[id], used, pok);
    if (color) used.add(color);
    return { id, name: id, color, playerName: d.players[p] || undefined };
  });
  const options = { ...BASE_OPTIONS, expansions: d.expansions, "map-style": "standard", "map-string": mapString, "processed-map-string": mapString, "victory-points": d.victoryPoints };
  return { factions, speaker: 0, options, seated, mapString };
}

const CLAIM_MS = 60_000;

export async function startGame(id: string) {
  const db = await getFirestoreAdmin();
  const ref = db.collection(DRAFTS).doc(id);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DraftError(404, "No draft with that code.");
    const d = fromStored(snap.data() as StoredDraft);
    if (d.gameId) return { gameId: d.gameId };
    if (d.picks.length < d.players.length * 3) throw new DraftError(409, "The draft isn't finished.");
    if (d.creating && Date.now() - d.creating < CLAIM_MS) throw new DraftError(409, "Another phone is creating the game.");
    tx.update(ref, { creating: Date.now() });
    return { draft: d };
  });
  if ("gameId" in claimed) return claimed.gameId as string;
  try {
    const intl = await getIntl("en");
    const { factions, speaker, options } = gamePayload(claimed.draft, getFactions(intl) as Record<string, { color?: string; colorList?: string[] }>);
    // Upstream's own create-game handler, called in-process.
    const res = await createGame(new Request("http://localhost/api/create-game", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factions, speaker, options }),
    }));
    const { gameid } = (await res.json()) as { gameid?: string };
    if (!res.ok || !gameid) throw new Error(`create-game answered ${res.status}`);
    await ref.update({ gameId: gameid, creating: FieldValue.delete() });
    return gameid;
  } catch (e) {
    await ref.update({ creating: FieldValue.delete() });
    throw e;
  }
}
