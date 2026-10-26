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

// ---------- Layouts for 3 to 8 players ----------
// milty.shenanigans.be's maps (MAP_3…MAP_8 in its js/generate-map.js) in
// upstream's spiral order from index 1. "Hk" is seat k's home, "k.j" is tile j
// of seat k's slice in Milty's slice order (MILTY_SLOTS), "L" is a hyperlane
// taken from upstream's template, "-1" is no tile. Milty's 4, 5, 7 and 8-player
// maps are upstream's "warp" maps (its 4-player one turned a sixth clockwise),
// so those keep upstream's hyperlane tiles; Milty's own are stand-ins from a
// shorter list. Upstream has no 3-player map with five tiles a seat, so the
// 3-player map is Milty's, hyperlanes and all.

export const PLAYER_COUNTS = [3, 4, 5, 6, 7, 8];
export const MAP_STYLE: Record<number, "standard" | "warp"> = { 3: "standard", 4: "warp", 5: "warp", 6: "standard", 7: "warp", 8: "warp" };
const LAYOUTS: Record<number, string> = {
  3: "0.4 85A4 1.4 85A 2.4 85A2 0.1 87A 0.3 87A4 1.1 87A2 1.3 87A 2.1 87A4 2.3 87A2 H0 0.0 83A1 85A4 83A2 1.2 H1 1.0 83A 85A 83A1 2.2 H2 2.0 83A2 85A2 83A 0.2",
  4: "L 0.4 1.4 L 2.4 3.4 3.3 L 0.1 0.3 1.1 L 1.3 L 2.1 2.3 3.1 L L L 0.2 H0 0.0 1.2 H1 1.0 L L L 2.2 H2 2.0 3.2 H3 3.0 L",
  5: "0.4 1.4 2.4 L 3.4 4.4 0.1 0.3 1.1 1.3 2.1 L 2.3 L 3.1 3.3 4.1 4.3 H0 0.0 1.2 H1 1.0 2.2 H2 2.0 L L L 3.2 H3 3.0 4.2 H4 4.0 0.2",
  6: "0.4 1.4 2.4 3.4 4.4 5.4 0.1 0.3 1.1 1.3 2.1 2.3 3.1 3.3 4.1 4.3 5.1 5.3 H0 0.0 1.2 H1 1.0 2.2 H2 2.0 3.2 H3 3.0 4.2 H4 4.0 5.2 H5 5.0 0.2",
  7: "L 1.4 2.4 L L 5.4 0.4 0.3 1.1 1.3 2.1 2.3 3.4 4.4 4.3 5.1 5.3 6.4 0.1 L 1.2 H1 1.0 2.2 H2 2.0 L 3.1 3.3 4.1 4.0 5.2 L 6.2 6.1 6.3 H0 0.0 -1 -1 -1 -1 -1 -1 -1 -1 -1 3.2 H3 3.0 4.2 H4 -1 -1 H5 5.0 -1 H6 6.0 0.2",
  8: "L L 2.4 L L 6.4 0.4 1.4 1.3 2.1 2.3 3.4 4.4 5.4 5.3 6.1 6.3 7.4 0.1 0.3 1.1 1.0 2.2 L 3.2 3.1 3.3 4.1 4.3 5.1 5.0 6.2 L 7.2 7.1 7.3 H0 0.0 1.2 H1 -1 -1 H2 2.0 -1 H3 3.0 4.2 H4 4.0 5.2 H5 -1 -1 H6 6.0 -1 H7 7.0 0.2",
};

// Milty's slice order, relative to the home with the home at the top of the
// map (as P1 sits): 0 is left of the home as its player sees it, 1 in front of
// it, 2 to its right, 3 further left and 4 furthest in, toward Mecatol.
export const MILTY_SLOTS: Cube[] = [[1, 0, -1], [0, 1, -1], [-1, 1, 0], [1, 1, -2], [0, 2, -2]];

export interface Layout extends Wedges {
  players: number;
  style: "standard" | "warp";
  template: string; // P1…Pn homes and 0 for slice tiles, ready for buildMapString
}

// The map for this many players. `upstream` is getDefaultMapString(players,
// MAP_STYLE[players], te); it gives Mecatol and the hyperlanes, and every other
// place must agree with Milty's map, or this throws (an upstream change).
export function miltyLayout(players: number, upstream: string): Layout {
  const labels = LAYOUTS[players];
  if (!labels) throw new Error(`No Milty map for ${players} players`);
  const up = upstream.trim().split(/\s+/);
  const own = players === 3;
  const tokens = ["M", ...labels.split(" ")];
  if (!own && up.length !== tokens.length) throw new Error(`Upstream's ${players}-player map has ${up.length} places, Milty's ${tokens.length}`);
  const homes: number[] = [];
  const slots: number[][] = Array.from({ length: players }, () => []);
  const out = tokens.map((t, i) => {
    const u = up[i];
    const home = t.match(/^H(\d)$/), slot = t.match(/^(\d)\.(\d)$/);
    let v = t;
    if (i === 0) v = up[0]!;
    else if (home) { homes[Number(home[1])] = i; v = `P${Number(home[1]) + 1}`; }
    else if (slot) { slots[Number(slot[1])]![Number(slot[2])] = i; v = "0"; }
    else if (t === "L") v = u ?? "";
    if (!own && i > 0 && (v !== u || (t === "L" && !/^\d+[AB]\d?$/.test(v)))) throw new Error(`Upstream's ${players}-player map differs from Milty's at ${i}: ${u} for ${t}`);
    return v;
  });
  if (homes.length !== players || slots.some((s) => s.filter((x) => x !== undefined).length !== MILTY_SLOTS.length)) throw new Error(`Milty's ${players}-player map is missing a home or slot`);
  const adjacent: [number, number][] = [];
  for (let a = 0; a < MILTY_SLOTS.length; a++) for (let b = a + 1; b < MILTY_SLOTS.length; b++) if (distance(MILTY_SLOTS[a]!, MILTY_SLOTS[b]!) === 1) adjacent.push([a, b]);
  return { players, style: MAP_STYLE[players]!, template: out.join(" "), homes, slots, canonical: MILTY_SLOTS, adjacent };
}

// ---------- Slices ----------

// The most slices a pool can make: one blue tile from each tier and two red.
export function sliceLimit(pool: { blue: TileInfo[]; red: TileInfo[] }) {
  return Math.min(...tiers(pool.blue).map((t) => t.length), Math.floor(pool.red.length / 2));
}

export type Generated = { slices: string[][]; seed: string } | { error: string };

export function generateSlices(pool: { blue: TileInfo[]; red: TileInfo[] }, count: number, limits: DraftLimits, adjacent: [number, number][], seed: string, attempts = 20000): Generated {
  const [high, mid, low] = tiers(pool.blue) as [TileInfo[], TileInfo[], TileInfo[]];
  const short = [["high", high], ["middle", mid], ["low", low]].find(([, t]) => (t as TileInfo[]).length < count);
  if (short) return { error: `Only ${(short[1] as TileInfo[]).length} blue tiles in the ${short[0]} tier, fewer than ${count} slices. Add an expansion or make fewer slices.` };
  if (pool.red.length < count * 2) return { error: `Only ${pool.red.length} red tiles, fewer than 2 for each of ${count} slices.` };
  const legendaries = [...pool.blue, ...pool.red].reduce((n, t) => n + t.legendary, 0);
  if (legendaries < limits.minLegendaries) return { error: `These tiles have ${legendaries} legendary planet${legendaries === 1 ? "" : "s"}; lower "Legendary planets, at least".` };
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
// The host's chosen factions, as on milty.shenanigans.be: with more chosen than
// the count, the count is drawn from them; with fewer, all of them are in and
// the rest are drawn from the other available factions.
export function drawFactions(available: string[], chosen: string[], count: number, seed: string) {
  const pool = chosen.filter((f) => available.includes(f));
  if (!pool.length) return pickFactions(available, count, seed);
  if (pool.length >= count) return pickFactions(pool, count, seed);
  const rest = pickFactions(available.filter((f) => !pool.includes(f)), count - pool.length, seed);
  return shuffle([...pool, ...rest].sort(), rngFor(`${seed}:pool`));
}

// ---------- Slices entered by hand ----------

// One slice per line, tile numbers separated by commas or spaces, in Milty's
// slice order; leading zeros are dropped, as Milty does.
export function parseSlices(text: string): string[][] {
  return text.split(/\r?\n/).map((line) => line.split(/[,\s]+/).map((t) => t.trim().toUpperCase().replace(/^0+(?=.)/, "")).filter(Boolean)).filter((s) => s.length);
}

const EXPANSION_NAMES: Record<string, string> = { BASE: "the base game", POK: "Prophecy of Kings", "THUNDERS EDGE": "Thunder's Edge", "DISCORDANT STARS": "Discordant Stars", "CODEX THREE": "Codex III" };
export const MAX_SLICES = 15;

// What's wrong with hand-entered slices, in plain words; empty when they're fine.
export function slicesProblems(slices: string[][], systems: Record<string, DraftSystem | undefined>, expansions: string[], players: number): string[] {
  const out: string[] = [];
  if (slices.length < players) out.push(`${slices.length} slice${slices.length === 1 ? "" : "s"} for ${players} players. Enter at least ${players}, one per line.`);
  if (slices.length > MAX_SLICES) out.push(`${slices.length} slices; the most is ${MAX_SLICES}.`);
  const seen = new Map<string, number>();
  slices.forEach((tiles, i) => {
    const name = `Slice ${i + 1}`;
    if (tiles.length !== 5) out.push(`${name} has ${tiles.length} tile${tiles.length === 1 ? "" : "s"}; each needs 5.`);
    for (const id of tiles) {
      const s = systems[id];
      if (!s || !/^\d+$/.test(id)) { out.push(`${name}: there's no system tile ${id}.`); continue; }
      if (s.type === "HOME") out.push(`${name}: tile ${id} is a home system.`);
      else if (s.type === "MECATOL" || id === "112") out.push(`${name}: tile ${id} is Mecatol Rex.`);
      else if ((s.type !== "BLUE" && s.type !== "RED") || NOT_DRAFTABLE.has(id)) out.push(`${name}: tile ${id} can't go in a slice.`);
      else if (s.expansion !== "BASE" && (!expansions.includes(s.expansion) || !TILE_EXPANSIONS.includes(s.expansion))) out.push(`${name}: tile ${id} is from ${EXPANSION_NAMES[s.expansion] ?? s.expansion}, which this draft doesn't use.`);
      const first = seen.get(id);
      if (first !== undefined && first !== i) out.push(`Tile ${id} is in slice ${first + 1} and slice ${i + 1}.`);
      else if (first === i) out.push(`${name} has tile ${id} twice.`);
      else seen.set(id, i);
    }
  });
  return [...new Set(out)];
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
  customSlices?: boolean; // the host entered the slices; a reroll keeps them
  factionPool?: string[]; // the host's chosen factions, drawn from on a reroll
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
