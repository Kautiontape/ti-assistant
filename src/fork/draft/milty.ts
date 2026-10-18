// Milty-style draft (task 3): the tile pool, slice generation, the wedge each
// home gets on the map, the snake order and the finished map string. Rules
// follow milty.shenanigans.be: five systems per slice (one blue from each of
// three tiers, two red), limits on optimal value, no two wormholes of a kind,
// no adjacent anomalies. Self-contained (type imports only) so a Node script
// can check it directly.

export type PickKind = "slice" | "faction" | "position";

export interface DraftSystem {
  id: string | number;
  type: string;
  expansion: string;
  planets: string[];
  wormholes?: string[];
}
export interface DraftPlanet {
  resources: number;
  influence: number;
  attributes?: string[];
}

export interface TileInfo {
  id: string;
  red: boolean;
  anomaly: boolean;
  wormholes: string[];
  legendary: number;
  skips: string[];
  optimal: { resources: number; influence: number };
  total: { resources: number; influence: number };
}

export interface DraftLimits {
  minInfluence: number;
  minResources: number;
  minTotal: number;
  maxTotal: number;
  minLegendaries: number;
  wormholePairs: boolean; // at least 2 alpha and 2 beta across the draft
  oneWormhole: boolean; // at most 1 wormhole per slice
}

// Assumed defaults; Milty's page names these limits but gives no values.
export const DEFAULT_LIMITS: DraftLimits = {
  minInfluence: 4,
  minResources: 2.5,
  minTotal: 9,
  maxTotal: 13,
  minLegendaries: 1,
  wormholePairs: true,
  oneWormhole: false,
};

// Upstream's data has no anomaly field. These are the red tiles drawn with
// red corner brackets on their tile art (public/images/systems), which is how
// the game marks anomalies.
export const ANOMALIES = new Set(["41", "42", "43", "44", "45", "67", "68", "79", "80", "113", "114", "115", "116", "117"]);
// Typed BLUE or RED upstream but not draftable: Muaat's supernova (81), the
// Crimson Rebellion home (94), Thunder's Edge Mecatol (112), the Fracture.
const NOT_DRAFTABLE = new Set(["81", "94", "112", "666", "667", "668"]);
export const TILE_EXPANSIONS = ["BASE", "POK", "THUNDERS EDGE"];

// ---------- Values ----------

// Optimal value as Milty counts it: the higher of resources or influence, the
// other as 0; equal values count half to each. Same sum as upstream's
// computeNearbyValues (src/components/MapBuilder/MapBuilder.tsx).
export function tileInfo(system: DraftSystem, planets: Record<string, DraftPlanet | undefined>): TileInfo {
  const id = String(system.id);
  const info: TileInfo = {
    id, red: system.type === "RED", anomaly: ANOMALIES.has(id), wormholes: [...(system.wormholes ?? [])], legendary: 0, skips: [],
    optimal: { resources: 0, influence: 0 }, total: { resources: 0, influence: 0 },
  };
  for (const pid of system.planets) {
    const p = planets[pid];
    if (!p) continue;
    info.total.resources += p.resources;
    info.total.influence += p.influence;
    if (p.resources > p.influence) info.optimal.resources += p.resources;
    else if (p.influence > p.resources) info.optimal.influence += p.influence;
    else { info.optimal.resources += p.resources / 2; info.optimal.influence += p.influence / 2; }
    for (const a of p.attributes ?? []) {
      if (a === "legendary") info.legendary++;
      if (a.endsWith("-skip")) info.skips.push(a.replace("-skip", ""));
    }
  }
  return info;
}

export const optimalTotal = (t: { optimal: { resources: number; influence: number } }) => t.optimal.resources + t.optimal.influence;

export function sliceStats(tiles: TileInfo[]) {
  const sum = (f: (t: TileInfo) => number) => tiles.reduce((n, t) => n + f(t), 0);
  return {
    optimal: { resources: sum((t) => t.optimal.resources), influence: sum((t) => t.optimal.influence) },
    total: { resources: sum((t) => t.total.resources), influence: sum((t) => t.total.influence) },
    legendary: sum((t) => t.legendary),
    skips: tiles.flatMap((t) => t.skips),
    wormholes: tiles.flatMap((t) => t.wormholes),
    anomalies: tiles.filter((t) => t.anomaly).length,
  };
}

export function tilePool(systems: Record<string, DraftSystem | undefined>, planets: Record<string, DraftPlanet | undefined>, expansions: string[]) {
  const blue: TileInfo[] = [];
  const red: TileInfo[] = [];
  for (const s of Object.values(systems)) {
    if (!s || (s.type !== "BLUE" && s.type !== "RED")) continue;
    const id = String(s.id);
    if (!/^\d+$/.test(id) || NOT_DRAFTABLE.has(id)) continue;
    if (s.expansion !== "BASE" && !expansions.includes(s.expansion)) continue;
    if (!TILE_EXPANSIONS.includes(s.expansion)) continue;
    (s.type === "BLUE" ? blue : red).push(tileInfo(s, planets));
  }
  const byId = (a: TileInfo, b: TileInfo) => Number(a.id) - Number(b.id);
  return { blue: blue.sort(byId), red: red.sort(byId) };
}

// Three tiers of blue tiles by optimal value (assumed; Milty keeps its own
// hand-made tier lists): highest third, middle third, lowest third.
export function tiers(blue: TileInfo[]): TileInfo[][] {
  const sorted = [...blue].sort((a, b) => optimalTotal(b) - optimalTotal(a)
    || (b.total.resources + b.total.influence) - (a.total.resources + a.total.influence)
    || b.legendary - a.legendary || Number(a.id) - Number(b.id));
  const size = Math.floor(sorted.length / 3);
  return [sorted.slice(0, size), sorted.slice(size, size * 2), sorted.slice(size * 2)];
}

// ---------- Random ----------

export function rngFor(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}
export const newSeed = () => Math.random().toString(36).slice(2, 10);

// ---------- Map geometry ----------
// Cube coordinates and spiral order as upstream's Hex (src/components/MapBuilder/hexGrid.ts):
// index 0 is the centre, then each ring from 12 o'clock clockwise.

export type Cube = [number, number, number];
const DIRECTIONS: Cube[] = [[1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1], [1, -1, 0]];
const add = (a: Cube, b: Cube): Cube => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const distance = (a: Cube, b: Cube) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const rotate = (c: Cube, steps: number): Cube => { let out = c; for (let i = 0; i < ((steps % 6) + 6) % 6; i++) out = [-out[1], -out[2], -out[0]]; return out; };
const same = (a: Cube, b: Cube) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function spiral(count: number): Cube[] {
  const out: Cube[] = [[0, 0, 0]];
  for (let radius = 1; out.length < count; radius++) {
    let hex: Cube = [0, -radius, radius];
    for (const d of DIRECTIONS) for (let i = 0; i < radius; i++) { out.push(hex); hex = add(hex, d); }
  }
  return out.slice(0, count);
}
// Pixel centre, as Hex.toPixel.
export const toPixel = (c: Cube, size: number) => ({ x: size * 1.5 * c[0], y: size * ((Math.sqrt(3) / 2) * c[0] + Math.sqrt(3) * c[1]) });

export interface Wedges {
  homes: number[]; // map index of P1, P2…
  slots: number[][]; // per home, the map index of each slice slot
  canonical: Cube[]; // slot positions relative to P1's home, for drawing a slice
  adjacent: [number, number][]; // slot pairs that touch
}

// Each home's slice slots: tiles closer to that home than to any other, plus
// the tile shared with the next home clockwise (the player on their left).
export function wedges(template: string): Wedges {
  const tokens = template.trim().split(/\s+/);
  const cubes = spiral(tokens.length);
  const homes: number[] = [];
  tokens.forEach((t, i) => { const m = t.match(/^P(\d)$/); if (m) homes[Number(m[1]) - 1] = i; });
  const n = homes.length;
  const owned: number[][] = homes.map(() => []);
  tokens.forEach((t, i) => {
    if (i === 0 || t !== "0") return;
    const d = homes.map((h) => distance(cubes[i]!, cubes[h]!));
    const min = Math.min(...d);
    const near = d.map((x, k) => (x === min ? k : -1)).filter((k) => k >= 0);
    if (near.length === 1) owned[near[0]!]!.push(i);
    else if (near.length === 2) {
      const [a, b] = near as [number, number];
      if ((a + 1) % n === b) owned[a]!.push(i);
      else if ((b + 1) % n === a) owned[b]!.push(i);
    }
  });
  const size = owned[0]!.length;
  if (!owned.every((o) => o.length === size)) throw new Error(`Uneven wedges: ${owned.map((o) => o.length).join(", ")}`);
  // Slot j of every wedge is P1's slot j turned to that home.
  const base = owned[0]!.map((i) => cubes[i]!);
  const slots = homes.map((h, k) => {
    const steps = [0, 1, 2, 3, 4, 5].find((s) => same(rotate(cubes[homes[0]!]!, s), cubes[h]!));
    if (steps === undefined) throw new Error(`Home ${k + 1} isn't a turn of home 1`);
    return base.map((c) => {
      const idx = cubes.findIndex((x) => same(x, rotate(c, steps)));
      if (!owned[k]!.includes(idx)) throw new Error(`Slot outside wedge ${k + 1}`);
      return idx;
    });
  });
  const home = cubes[homes[0]!]!;
  const canonical = base.map((c) => [c[0] - home[0], c[1] - home[1], c[2] - home[2]] as Cube);
  const adjacent: [number, number][] = [];
  for (let a = 0; a < base.length; a++) for (let b = a + 1; b < base.length; b++) if (distance(base[a]!, base[b]!) === 1) adjacent.push([a, b]);
  return { homes, slots, canonical, adjacent };
}

// ---------- Slices ----------

export type Generated = { slices: string[][]; seed: string } | { error: string };

export function generateSlices(pool: { blue: TileInfo[]; red: TileInfo[] }, count: number, limits: DraftLimits, adjacent: [number, number][], seed: string, attempts = 4000): Generated {
  const [high, mid, low] = tiers(pool.blue) as [TileInfo[], TileInfo[], TileInfo[]];
  const short = [["high", high], ["middle", mid], ["low", low]].find(([, t]) => (t as TileInfo[]).length < count);
  if (short) return { error: `Only ${(short[1] as TileInfo[]).length} blue tiles in the ${short[0]} tier, fewer than ${count} slices. Add an expansion or make fewer slices.` };
  if (pool.red.length < count * 2) return { error: `Only ${pool.red.length} red tiles, fewer than 2 for each of ${count} slices.` };
  const rnd = rngFor(`${seed}:slices`);
  let reason = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const h = shuffle(high, rnd), m = shuffle(mid, rnd), l = shuffle(low, rnd), r = shuffle(pool.red, rnd);
    const slices: TileInfo[][] = [];
    let ok = true;
    for (let i = 0; i < count && ok; i++) {
      const tiles = [h[i]!, m[i]!, l[i]!, r[2 * i]!, r[2 * i + 1]!];
      const st = sliceStats(tiles);
      const total = st.optimal.resources + st.optimal.influence;
      if (st.optimal.influence < limits.minInfluence) { ok = false; reason = "influence"; break; }
      if (st.optimal.resources < limits.minResources) { ok = false; reason = "resources"; break; }
      if (total < limits.minTotal || total > limits.maxTotal) { ok = false; reason = "total"; break; }
      if (new Set(st.wormholes).size < st.wormholes.length) { ok = false; reason = "wormholes"; break; }
      if (limits.oneWormhole && st.wormholes.length > 1) { ok = false; reason = "wormholes"; break; }
      const placed = placeWithoutAdjacentAnomalies(tiles, adjacent, rnd);
      if (!placed) { ok = false; reason = "anomalies"; break; }
      slices.push(placed);
    }
    if (!ok) continue;
    const all = slices.flat();
    const worm = all.flatMap((t) => t.wormholes);
    if (limits.wormholePairs && (worm.filter((w) => w === "ALPHA").length < 2 || worm.filter((w) => w === "BETA").length < 2)) { reason = "wormhole pairs"; continue; }
    if (all.reduce((n, t) => n + t.legendary, 0) < limits.minLegendaries) { reason = "legendaries"; continue; }
    return { slices: slices.map((s) => s.map((t) => t.id)), seed };
  }
  const why: Record<string, string> = {
    influence: "the minimum influence", resources: "the minimum resources", total: "the optimal total range", wormholes: "the wormhole limits",
    anomalies: "keeping anomalies apart", "wormhole pairs": "2 alpha and 2 beta wormholes", legendaries: "the minimum legendary planets",
  };
  return { error: `No slices met every limit after ${attempts} tries; the last one failed on ${why[reason] ?? reason}. Loosen the limits.` };
}

function placeWithoutAdjacentAnomalies(tiles: TileInfo[], adjacent: [number, number][], rnd: () => number): TileInfo[] | undefined {
  for (let i = 0; i < 30; i++) {
    const order = shuffle(tiles, rnd);
    if (!adjacent.some(([a, b]) => order[a]!.anomaly && order[b]!.anomaly)) return order;
  }
}

export function pickFactions(available: string[], count: number, seed: string) {
  return shuffle([...available].sort(), rngFor(`${seed}:factions`)).slice(0, count);
}
export function draftOrder(players: number, seed: string, keep: boolean) {
  const order = Array.from({ length: players }, (_, i) => i);
  return keep ? order : shuffle(order, rngFor(`${seed}:order`));
}

// ---------- The draft ----------

export interface Pick { player: number; kind: PickKind; value: number | string; by?: number; at: number }

// A draft as stored in forkDrafts/{id}. Players are numbered by their place in
// `players`; positions are 0 for the speaker, then clockwise.
export interface Draft {
  id: string;
  name: string;
  createdAt: number;
  players: string[];
  order: number[];
  slices: string[][];
  factions: string[];
  seed: string;
  limits: DraftLimits;
  expansions: string[];
  victoryPoints: number;
  picks: Pick[];
  gameId?: string;
  creating?: number;
}

// Firestore has no arrays of arrays, so each slice is stored as {tiles}.
export type StoredDraft = Omit<Draft, "slices"> & { slices: { tiles: string[] }[] };
export const toStored = <T extends { slices: string[][] }>(d: T) => ({ ...d, slices: d.slices.map((tiles) => ({ tiles })) });
export const fromStored = (d: StoredDraft): Draft => ({ ...d, slices: d.slices.map((s) => s.tiles) });

// Snake order: the draft order, then reversed, then the draft order again.
export function pickerAt(order: number[], index: number): number | undefined {
  const n = order.length;
  if (index >= n * 3) return undefined;
  const round = Math.floor(index / n), i = index % n;
  return round % 2 === 0 ? order[i] : order[n - 1 - i];
}

export function holdings(picks: Pick[], player: number) {
  const of = (kind: PickKind) => picks.find((p) => p.player === player && p.kind === kind)?.value;
  return { slice: of("slice") as number | undefined, faction: of("faction") as string | undefined, position: of("position") as number | undefined };
}

// Why a pick isn't allowed, or undefined when it is.
export function pickProblem(d: { order: number[]; picks: Pick[]; slices: string[][]; factions: string[] }, pick: { player: number; kind: PickKind; value: number | string }): string | undefined {
  const up = pickerAt(d.order, d.picks.length);
  if (up === undefined) return "The draft is finished.";
  if (up !== pick.player) return "It's someone else's pick.";
  if (holdings(d.picks, pick.player)[pick.kind] !== undefined) return `They already have a ${pick.kind}.`;
  if (d.picks.some((p) => p.kind === pick.kind && p.value === pick.value)) return "That's already taken.";
  if (pick.kind === "slice" && !(typeof pick.value === "number" && pick.value >= 0 && pick.value < d.slices.length)) return "No such slice.";
  if (pick.kind === "faction" && !d.factions.includes(String(pick.value))) return "That faction isn't in this draft.";
  if (pick.kind === "position" && !(typeof pick.value === "number" && pick.value >= 0 && pick.value < d.order.length)) return "No such position.";
}

// The map string with each drafted slice in its owner's wedge. Homes stay as
// P1…Pn placeholders: upstream fills them from the factions' order and only
// counts P# tokens when it checks a map string.
export function buildMapString(template: string, w: Wedges, sliceAt: (string[] | undefined)[]) {
  const tokens = template.trim().split(/\s+/);
  sliceAt.forEach((tiles, k) => tiles?.forEach((id, j) => { tokens[w.slots[k]![j]!] = id; }));
  return tokens.join(" ");
}
