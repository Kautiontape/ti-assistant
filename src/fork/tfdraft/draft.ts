// The Twilight's Fall draft as a list of steps. Two presets, the rulebook's
// setup and tidraft.com's, differ in four switches (TfRules); everything else
// is shared. Pure, so the server, the phones and a Node check all use it.
//
// Steps, in order:
// 1. Reference cards (rulebook): each player is dealt 3; keep 1 and pass 2 to
//    the next player in the list, keep 1 of those and pass the last on.
//    Two secret rounds ("cards1", "cards2"); the third card arrives on its own.
// 2. Snake: a slice; a seat on a Nucleus map; a pack of 3 cards (tidraft);
//    a King (tidraft). One round per kind.
// 3. Priority: everyone picks a card in secret and all are shown together. The
//    lowest number is speaker. On Milty and Milty EQ maps players sit clockwise
//    in priority order; on Nucleus they keep their drafted seats.
// 4. Home system: open, one at a time from the speaker clockwise (rulebook),
//    or secret and shown together (tidraft). Council Keleres as a home draws a
//    random faction no one holds and uses that home.
// 5. Kings (rulebook): from the player to the speaker's right, counter-clockwise.
// 6. Starting units: each player's last card.
import { rngFor, shuffle } from "../draft/milty";
import { byPriority, deck, KELERES, KINGS, PRIORITY } from "./cards";
import type { Style } from "./layouts";

export interface TfRules {
  cards: "pass" | "packs";
  home: "open" | "secret";
  kings: "order" | "snake";
  keleres: boolean;
}
export const PRESETS: Record<"rulebook" | "tidraft", TfRules> = {
  rulebook: { cards: "pass", home: "open", kings: "order", keleres: true },
  tidraft: { cards: "packs", home: "secret", kings: "snake", keleres: false },
};
export function presetOf(r: TfRules) {
  return (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((k) => JSON.stringify(PRESETS[k]) === JSON.stringify({ cards: r.cards, home: r.home, kings: r.kings, keleres: r.keleres }));
}

export type SnakeKind = "slice" | "seat" | "pack" | "king";
export type SecretStep = "cards1" | "cards2" | "priority" | "home";
export type Step =
  | { id: "cards1" | "cards2" | "priority" | "home"; type: "secret" }
  | { id: "snake"; type: "snake"; kinds: SnakeKind[] }
  | { id: "home" | "kings"; type: "turns"; seats: number[] };

// The public log. Every change appends one action (entries sharing `act`), and
// undo removes the newest action.
export type Entry =
  | { act: number; kind: SnakeKind; player: number; value: number | string; by?: number }
  | { act: number; kind: "home"; player: number; value: string; drawn?: string; by?: number }
  | { act: number; kind: "ready"; step: SecretStep; player: number; by?: number }
  | { act: number; kind: "reveal"; step: SecretStep; values?: Record<string, string>; drawn?: Record<string, string> }
  | { act: number; kind: "units"; values: Record<string, string> };

export interface TfDraft {
  id: string;
  format: "twilightsFall";
  name: string;
  createdAt: number;
  players: string[];
  style: Style;
  rules: TfRules;
  order: number[]; // snake order
  slices: string[][];
  fixed: string[]; // tiles dealt onto the map before the draft (Layout.fixed)
  packs: string[][]; // tidraft packs; empty under the rulebook
  kings: string[];
  seed: string;
  victoryPoints: number;
  log: Entry[];
  updatedAt: number;
  gameId?: string;
  creating?: number;
}

// Kept server-side only (a subcollection browsers can't read).
export interface TfSecret {
  dealt: string[][]; // rulebook: each player's 3 dealt cards
  staged: Partial<Record<SecretStep, Record<string, string>>>;
}

// Firestore has no arrays of arrays.
export type StoredTfDraft = Omit<TfDraft, "slices" | "packs"> & { slices: { tiles: string[] }[]; packs: { cards: string[] }[] };
export type StoredTfSecret = Omit<TfSecret, "dealt"> & { dealt: { cards: string[] }[] };
export const toStored = (d: TfDraft): StoredTfDraft => ({ ...d, slices: d.slices.map((tiles) => ({ tiles })), packs: d.packs.map((cards) => ({ cards })) });
export const fromStored = (d: StoredTfDraft): TfDraft => ({ ...d, slices: d.slices.map((s) => s.tiles), packs: (d.packs ?? []).map((p) => p.cards) });
export const secretToStored = (s: TfSecret): StoredTfSecret => ({ ...s, dealt: s.dealt.map((cards) => ({ cards })) });
export const secretFromStored = (s: StoredTfSecret): TfSecret => ({ ...s, dealt: (s.dealt ?? []).map((d) => d.cards), staged: s.staged ?? {} });

export const isTfDraft = (d: { format?: string }) => d.format === "twilightsFall";

// ---------- Setup ----------

export function snakeKinds(style: Style, rules: TfRules): SnakeKind[] {
  return ["slice", ...(style === "nucleus" ? ["seat" as const] : []), ...(rules.cards === "packs" ? ["pack" as const] : []), ...(rules.kings === "snake" ? ["king" as const] : [])];
}

export function makePacks(count: number, keleres: boolean, seed: string) {
  const cards = shuffle(deck(keleres), rngFor(`${seed}:packs`));
  return Array.from({ length: count }, (_, i) => cards.slice(i * 3, i * 3 + 3).sort(byPriority));
}
export function deal(players: number, keleres: boolean, rnd: () => number) {
  const cards = shuffle(deck(keleres), rnd);
  return Array.from({ length: players }, (_, i) => cards.slice(i * 3, i * 3 + 3).sort(byPriority));
}
export const maxPacks = (keleres: boolean) => Math.floor(deck(keleres).length / 3);

// ---------- Where the draft stands ----------

export function steps(d: Pick<TfDraft, "style" | "rules" | "players">): Step[] {
  const n = d.players.length;
  const out: Step[] = [];
  if (d.rules.cards === "pass") out.push({ id: "cards1", type: "secret" }, { id: "cards2", type: "secret" });
  out.push({ id: "snake", type: "snake", kinds: snakeKinds(d.style, d.rules) });
  out.push({ id: "priority", type: "secret" });
  // Seat numbers: 0 is the speaker's seat once priority is known.
  const around = Array.from({ length: n }, (_, i) => i);
  out.push(d.rules.home === "open" ? { id: "home", type: "turns", seats: around } : { id: "home", type: "secret" });
  if (d.rules.kings === "order") out.push({ id: "kings", type: "turns", seats: around.map((i) => (n - i) % n).slice(1).concat(0) });
  return out;
}

const revealed = (log: Entry[], step: SecretStep) => log.find((e): e is Extract<Entry, { kind: "reveal" }> => e.kind === "reveal" && e.step === step);

export interface Status {
  step?: Step; // undefined once every step is done
  index: number;
  up?: number; // the player whose turn it is (snake and turns steps)
  ready: number[]; // players who have made the current secret pick
  speaker?: number;
  seatOf: (number | undefined)[]; // player -> seat (0 = P1 at the top of the map)
  playerAt: (number | undefined)[]; // seat -> player
  priority: Record<number, string>;
  homes: Record<number, { card: string; drawn?: string }>;
  units: Record<number, string>;
}

export function snakePicker(order: number[], index: number, rounds: number): number | undefined {
  const n = order.length;
  if (index >= n * rounds) return undefined;
  const r = Math.floor(index / n), i = index % n;
  return r % 2 === 0 ? order[i] : order[n - 1 - i];
}

export function holding(log: Entry[], player: number, kind: SnakeKind) {
  const e = log.find((x) => x.kind === kind && x.player === player);
  return e && "value" in e ? e.value : undefined;
}

export function status(d: TfDraft): Status {
  const n = d.players.length;
  const st = steps(d);
  const priority: Record<number, string> = {};
  const pr = revealed(d.log, "priority");
  if (pr?.values) for (const [p, v] of Object.entries(pr.values)) priority[Number(p)] = v;
  const byPrio = Object.keys(priority).length === n ? Array.from({ length: n }, (_, p) => p).sort((a, b) => byPriority(priority[a]!, priority[b]!)) : undefined;
  const speaker = byPrio?.[0];
  // Seats: drafted on Nucleus, priority order elsewhere.
  const seatOf: (number | undefined)[] = Array.from({ length: n }, (_, p) => {
    if (d.style === "nucleus") return holding(d.log, p, "seat") as number | undefined;
    return byPrio ? byPrio.indexOf(p) : undefined;
  });
  const playerAt: (number | undefined)[] = Array.from({ length: n }, (_, s) => { const p = seatOf.indexOf(s); return p >= 0 ? p : undefined; });
  const homes: Record<number, { card: string; drawn?: string }> = {};
  for (const e of d.log) {
    if (e.kind === "home") homes[e.player] = { card: e.value, ...(e.drawn ? { drawn: e.drawn } : {}) };
    if (e.kind === "reveal" && e.step === "home" && e.values) for (const [p, v] of Object.entries(e.values)) homes[Number(p)] = { card: v, ...(e.drawn?.[p] ? { drawn: e.drawn[p] } : {}) };
  }
  const unitsEntry = d.log.find((e): e is Extract<Entry, { kind: "units" }> => e.kind === "units");
  const units: Record<number, string> = {};
  if (unitsEntry) for (const [p, v] of Object.entries(unitsEntry.values)) units[Number(p)] = v;
  const base = { speaker, seatOf, playerAt, priority, homes, units };

  for (let i = 0; i < st.length; i++) {
    const step = st[i]!;
    if (step.type === "secret") {
      if (revealed(d.log, step.id)) continue;
      const ready = [...new Set(d.log.filter((e) => e.kind === "ready" && e.step === step.id).map((e) => (e as { player: number }).player))];
      return { step, index: i, ready, ...base };
    }
    if (step.type === "snake") {
      const made = d.log.filter((e) => step.kinds.includes(e.kind as SnakeKind)).length;
      const up = snakePicker(d.order, made, step.kinds.length);
      if (up === undefined) continue;
      return { step, index: i, up, ready: [], ...base };
    }
    // Turns: seats counted from the speaker.
    const kind = step.id === "home" ? "home" : "king";
    const made = d.log.filter((e) => e.kind === kind).length;
    if (made >= n) continue;
    const seat = step.seats[made]!;
    const speakerSeat = speaker !== undefined ? seatOf[speaker]! : 0;
    const up = playerAt[(speakerSeat + seat) % n];
    return { step, index: i, up, ready: [], ...base };
  }
  return { index: st.length, ready: [], ...base };
}

// ---------- Hands ----------

// The cards a player holds: all 3 once the card draft is done, or what they
// can choose from now during it.
export function cardsOf(d: TfDraft, secret: TfSecret, player: number): { choose: string[]; kept: string[] } {
  const n = d.players.length;
  if (d.rules.cards === "packs") {
    const pack = holding(d.log, player, "pack");
    return { choose: [], kept: pack === undefined ? [] : [...d.packs[Number(pack)]!] };
  }
  const s1 = secret.staged.cards1 ?? {}, s2 = secret.staged.cards2 ?? {};
  const prev = (k: number) => (player - k + n) % n;
  const r1done = !!revealed(d.log, "cards1"), r2done = !!revealed(d.log, "cards2");
  if (!r1done) return { choose: secret.dealt[player] ?? [], kept: [] };
  const first = s1[String(player)]!;
  const passed = (secret.dealt[prev(1)] ?? []).filter((c) => c !== s1[String(prev(1))]);
  if (!r2done) return { choose: passed, kept: [first] };
  const third = (secret.dealt[prev(2)] ?? []).filter((c) => c !== s1[String(prev(2))] && c !== s2[String(prev(1))]);
  return { choose: [], kept: [first, s2[String(player)]!, ...third].sort(byPriority) };
}

// What a player may pick in a secret step (cards, then priority, then home).
export function secretOptions(d: TfDraft, secret: TfSecret, player: number, step: SecretStep): string[] {
  const h = cardsOf(d, secret, player);
  if (step === "cards1" || step === "cards2") return h.choose;
  const prio = status(d).priority[player] ?? secret.staged.priority?.[String(player)];
  if (step === "priority") return h.kept;
  return h.kept.filter((c) => c !== prio);
}
export function homeOptions(d: TfDraft, secret: TfSecret, player: number) {
  const s = status(d);
  return cardsOf(d, secret, player).kept.filter((c) => c !== s.priority[player]);
}

// Cards nobody holds, for Council Keleres' home.
export function unusedFactions(d: TfDraft, secret: TfSecret, also: string[] = []) {
  const held = new Set([...secret.dealt.flat(), ...d.packs.flat(), ...also]);
  for (const e of d.log) { if (e.kind === "home" && e.drawn) held.add(e.drawn); if (e.kind === "reveal" && e.drawn) Object.values(e.drawn).forEach((f) => held.add(f)); }
  return deck(true).filter((f) => f !== KELERES && !held.has(f));
}
export function drawForKeleres(d: TfDraft, secret: TfSecret, player: number, also: string[] = []) {
  const pool = unusedFactions(d, secret, also);
  return shuffle(pool, rngFor(`${d.seed}:keleres:${player}:${d.log.length}`))[0];
}

// ---------- Changes ----------

export type Action =
  | { action: "pick"; player: number; kind: SnakeKind; value: number | string; by?: number }
  | { action: "home"; player: number; value: string; by?: number }
  | { action: "secret"; player: number; step: SecretStep; value: string; by?: number }
  | { action: "undo" };

// Applies one action, or says why it can't. Returns the new log and secret.
export function apply(d: TfDraft, secret: TfSecret, a: Action): { log: Entry[]; secret: TfSecret } | { problem: string } {
  const n = d.players.length;
  const s = status(d);
  const act = (d.log.at(-1)?.act ?? 0) + 1;
  const by = "by" in a && typeof a.by === "number" ? { by: a.by } : {};
  if (d.gameId) return { problem: "The game has already been created." };

  if (a.action === "undo") {
    const last = d.log.at(-1);
    if (!last) return { problem: "Nothing to undo." };
    const keep = d.log.filter((e) => e.act !== last.act);
    const staged = structuredClone(secret.staged);
    for (const e of d.log) if (e.act === last.act && e.kind === "ready") {
      delete staged[e.step]?.[String(e.player)];
      if (!Object.keys(staged[e.step] ?? {}).length) delete staged[e.step];
    }
    return { log: keep, secret: { ...secret, staged } };
  }
  if (!s.step) return { problem: "The draft is finished." };
  if (!(Number.isInteger(a.player) && a.player >= 0 && a.player < n)) return { problem: "No such player." };

  if (a.action === "pick") {
    const step = s.step;
    const inSnake = step.type === "snake" && step.kinds.includes(a.kind);
    const kingTurn = step.type === "turns" && step.id === "kings" && a.kind === "king";
    if (!inSnake && !kingTurn) return { problem: "That isn't being picked now." };
    if (s.up !== a.player) return { problem: "It's someone else's pick." };
    if (holding(d.log, a.player, a.kind) !== undefined) return { problem: `They already have a ${a.kind}.` };
    if (d.log.some((e) => e.kind === a.kind && "value" in e && e.value === a.value)) return { problem: "That's already taken." };
    if (a.kind === "slice" && !(typeof a.value === "number" && a.value >= 0 && a.value < d.slices.length)) return { problem: "No such slice." };
    if (a.kind === "seat" && !(typeof a.value === "number" && a.value >= 0 && a.value < n)) return { problem: "No such seat." };
    if (a.kind === "pack" && !(typeof a.value === "number" && a.value >= 0 && a.value < d.packs.length)) return { problem: "No such pack." };
    if (a.kind === "king" && !d.kings.includes(String(a.value))) return { problem: "That King isn't in this draft." };
    return finish(d, secret, [...d.log, { act, kind: a.kind, player: a.player, value: a.value, ...by }]);
  }

  if (a.action === "home") {
    if (s.step.type !== "turns" || s.step.id !== "home") return { problem: "Home systems aren't being picked one at a time now." };
    if (s.up !== a.player) return { problem: "It's someone else's turn to pick a home." };
    if (!homeOptions(d, secret, a.player).includes(a.value)) return { problem: "That card isn't one of theirs to use." };
    const drawn = a.value === KELERES ? drawForKeleres(d, secret, a.player) : undefined;
    return finish(d, secret, [...d.log, { act, kind: "home", player: a.player, value: a.value, ...(drawn ? { drawn } : {}), ...by }]);
  }

  // A secret pick: staged privately; when everyone has picked, all are shown.
  if (s.step.type !== "secret" || s.step.id !== a.step) return { problem: "That pick isn't open now." };
  if (!secretOptions(d, secret, a.player, a.step).includes(a.value)) return { problem: "That card isn't one of theirs to pick." };
  const staged = structuredClone(secret.staged);
  staged[a.step] = { ...(staged[a.step] ?? {}), [String(a.player)]: a.value };
  const log = [...d.log];
  if (!s.ready.includes(a.player)) log.push({ act, kind: "ready", step: a.step, player: a.player, ...by });
  const picks = staged[a.step]!;
  const next = { ...secret, staged };
  if (Object.keys(picks).length < n) return { log, secret: next };
  if (a.step === "cards1" || a.step === "cards2") log.push({ act, kind: "reveal", step: a.step });
  else {
    const values = Object.fromEntries(Object.entries(picks));
    const drawn: Record<string, string> = {};
    if (a.step === "home") {
      const taken: string[] = [];
      for (const [p, v] of Object.entries(values)) if (v === KELERES) { const f = drawForKeleres(d, secret, Number(p), taken); if (f) { drawn[p] = f; taken.push(f); } }
    }
    log.push({ act, kind: "reveal", step: a.step, values, ...(Object.keys(drawn).length ? { drawn } : {}) });
  }
  return finish(d, next, log);
}

// When the last step completes, the leftover card gives starting units.
function finish(d: TfDraft, secret: TfSecret, log: Entry[]) {
  const nd = { ...d, log };
  if (status(nd).step) return { log, secret };
  const s = status(nd);
  const act = log.at(-1)!.act;
  const values: Record<string, string> = {};
  for (let p = 0; p < d.players.length; p++) {
    const left = cardsOf(nd, secret, p).kept.filter((c) => c !== s.priority[p] && c !== s.homes[p]?.card);
    values[String(p)] = left[0]!;
  }
  return { log: [...log, { act, kind: "units" as const, values }], secret };
}

// ---------- The game ----------

export const priorityNumber = (f: string) => PRIORITY[f];
export const kingOf = (d: TfDraft, player: number) => holding(d.log, player, "king") as string | undefined;
export { KINGS };
