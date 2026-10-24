// Map layouts for the Twilight's Fall draft: where each seat's home and slice
// tiles sit, and which tiles are dealt onto the map before the draft. Pure
// (type imports and the Milty draft's helpers only), so a Node script can check
// it; callers pass upstream's template (board.ts does that in the app).
//
// Every style starts from the Milty draft's map for the player count
// (miltyLayout in src/fork/draft/milty.ts: milty.shenanigans.be's maps on
// upstream's templates). A Milty slice has five places, in Milty's order:
// 0 left of the home, 1 in front, 2 right, 3 further left (between two homes),
// 4 furthest in, toward Mecatol Rex.
// - Milty: all five.
// - Milty EQ: places 0, 1, 2 and 4; place 3 (the equidistant) is dealt first.
// - Nucleus: places 0, 1 and 2; places 3 and 4 (the nucleus) are dealt first.
import { distance, MAP_STYLE, MILTY_SLOTS, miltyLayout, spiral, type Cube } from "../draft/milty";

export type Style = "nucleus" | "milty" | "eq";

export interface Layout {
  style: Style;
  players: number;
  mapStyle: "standard" | "warp";
  template: string[]; // map tokens: Mecatol, "P1".."Pn" homes, "0" open, hyperlanes, "-1" closed
  homes: number[]; // map index of each seat's home; seat 0 is P1, then clockwise
  slots: number[][]; // per seat, the map index of each slice tile
  canonical: Cube[]; // slice tile j relative to its home, as seat 0 sits, for drawing a slice
  fixed: number[]; // map indices dealt before the draft
  core: number[][]; // per seat, the fixed tiles next to its slice (Nucleus balance)
  sliceRed: number; // red tiles in each slice
  maxAnomalies: number; // most anomalies a slice can hold without two touching, on every seat
}

export const STYLE_NAMES: Record<Style, string> = { nucleus: "Nucleus", milty: "Milty", eq: "Milty EQ" };
const PLACES: Record<Style, number[]> = { milty: [0, 1, 2, 3, 4], eq: [0, 1, 2, 4], nucleus: [0, 1, 2] };

export function playerCounts(style: Style): number[] {
  return style === "nucleus" ? [6, 8] : [3, 4, 5, 6, 7, 8];
}
// The upstream map style whose template the layout uses (warp maps have hyperlanes).
export const mapStyleFor = (players: number) => MAP_STYLE[players] ?? "standard";

// `upstream` is getDefaultMapString(players, mapStyleFor(players), true).
export function layoutFor(style: Style, players: number, upstream: string): Layout {
  if (!playerCounts(style).includes(players)) throw new Error(`No ${STYLE_NAMES[style]} map for ${players} players.`);
  const m = miltyLayout(players, upstream);
  const keep = PLACES[style];
  const template = m.template.split(" ");
  const cubes = spiral(template.length);
  const slots = m.slots.map((s) => keep.map((j) => s[j]!));
  const inSlice = new Set(slots.flat());
  const fixed = template.map((t, i) => (i > 0 && t === "0" && !inSlice.has(i) ? i : -1)).filter((i) => i >= 0);
  const core = slots.map((s) => fixed.filter((f) => s.some((i) => distance(cubes[i]!, cubes[f]!) === 1)));
  const layout: Layout = {
    style, players, mapStyle: m.style, template, homes: m.homes, slots, canonical: keep.map((j) => MILTY_SLOTS[j]!), fixed, core,
    sliceRed: style === "nucleus" ? 1 : 2, maxAnomalies: 0,
  };
  layout.maxAnomalies = Math.min(...slots.map((_, seat) => largestApart(seatPairs(layout, seat), keep.length)));
  return layout;
}

// Pairs of slice places (by index in the slice) that touch, for one seat.
export function seatPairs(layout: Layout, seat: number): [number, number][] {
  const cubes = spiral(layout.template.length);
  const s = layout.slots[seat]!;
  const out: [number, number][] = [];
  for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) if (distance(cubes[s[a]!]!, cubes[s[b]!]!) === 1) out.push([a, b]);
  return out;
}

// The most places that can be chosen with no two touching.
function largestApart(pairs: [number, number][], k: number) {
  let best = 0;
  for (let mask = 0; mask < 1 << k; mask++) {
    if (pairs.some(([a, b]) => mask & (1 << a) && mask & (1 << b))) continue;
    best = Math.max(best, mask.toString(2).split("1").length - 1);
  }
  return best;
}

// Tile index pairs that touch, among a set of map indices.
export function touching(layout: Layout, indices: number[]): [number, number][] {
  const cubes = spiral(layout.template.length);
  const out: [number, number][] = [];
  for (let a = 0; a < indices.length; a++) for (let b = a + 1; b < indices.length; b++) if (distance(cubes[indices[a]!]!, cubes[indices[b]!]!) === 1) out.push([indices[a]!, indices[b]!]);
  return out;
}

// A slice's tiles in the order that fits this seat: no two anomalies touching
// each other or an anomaly already on the map next to the seat, when possible.
// Keeps the drafted order when it already fits.
export function arrangeFor(layout: Layout, seat: number, tiles: string[], board: string[], isAnomaly: (id: string) => boolean): string[] {
  const cubes = spiral(layout.template.length);
  const s = layout.slots[seat]!;
  const pairs = seatPairs(layout, seat);
  const nextToAnomaly = s.map((at) => layout.fixed.some((f, i) => board[i] && isAnomaly(board[i]!) && distance(cubes[at]!, cubes[f]!) === 1));
  const fits = (order: string[]) => !pairs.some(([a, b]) => isAnomaly(order[a]!) && isAnomaly(order[b]!)) && !order.some((t, j) => isAnomaly(t) && nextToAnomaly[j]);
  const touchingOnly = (order: string[]) => !pairs.some(([a, b]) => isAnomaly(order[a]!) && isAnomaly(order[b]!));
  if (fits(tiles)) return tiles;
  const perms = permutations(tiles);
  return perms.find(fits) ?? perms.find(touchingOnly) ?? tiles;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

// Red tiles dealt before the draft, so about 40% of the map's systems are red,
// as in the base game's 2 red to 3 blue per player.
export function fixedRed(layout: Layout) {
  const k = layout.slots[0]!.length;
  return Math.max(0, Math.min(layout.fixed.length, Math.round(0.4 * (layout.players * k + layout.fixed.length)) - layout.players * layout.sliceRed));
}

// The most slices a pool of tiles can make for this layout.
export function maxSlices(layout: Layout, pool: { blue: unknown[]; red: unknown[] }) {
  const k = layout.slots[0]!.length;
  const red = fixedRed(layout), blue = layout.fixed.length - red;
  return Math.max(0, Math.min(Math.floor((pool.red.length - red) / layout.sliceRed), Math.floor((pool.blue.length - blue) / (k - layout.sliceRed))));
}
