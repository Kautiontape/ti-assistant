// Map layouts for the Twilight's Fall draft: where each seat's home and slice
// tiles sit on upstream's map templates, and which tiles are dealt onto the map
// before the draft. Pure (type imports and the Milty geometry helpers only),
// so a Node script can check it.
//
// Styles, on the 6-player map (rings 1-3 around Mecatol Rex):
// - Nucleus: a slice is the 3 tiles in front of a home (2 beside it in ring 3,
//   1 in ring 2). The rest of rings 1 and 2, the nucleus, is dealt first.
// - Milty EQ: the Nucleus slice plus the ring-1 tile straight ahead. The ring-2
//   tiles between homes (the equidistants) are dealt first.
// - Milty: the EQ slice plus the equidistant on the clockwise side, the same
//   five tiles as the Milty draft (wedges() in src/fork/draft/milty.ts).
import { distance, spiral, wedges, type Cube } from "../draft/milty";

export type Style = "nucleus" | "milty" | "eq";

export interface Layout {
  style: Style;
  players: number;
  template: string[]; // map tokens: Mecatol, "P1".."Pn" homes, "0" open, hyperlanes, "-1" closed
  homes: number[]; // map index of each seat's home; seat 0 is P1 at the top, then clockwise
  slots: number[][]; // per seat, the map index of each slice tile
  canonical: Cube[]; // slice tile j relative to its home, turned to seat 0, for drawing a slice
  fixed: number[]; // map indices dealt before the draft
  core: number[][]; // per seat, the fixed tiles next to its slice (Nucleus balance)
  sliceRed: number; // red tiles in each slice
}

export const STYLE_NAMES: Record<Style, string> = { nucleus: "Nucleus", milty: "Milty", eq: "Milty EQ" };

export function playerCounts(style: Style): number[] {
  return style === "nucleus" ? [6] : [6];
}

const DIRECTIONS: Cube[] = [[1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1], [1, -1, 0]];
const add = (a: Cube, b: Cube): Cube => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const same = (a: Cube, b: Cube) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const turn = (c: Cube, steps: number): Cube => { let out = c; for (let i = 0; i < ((steps % 6) + 6) % 6; i++) out = [-out[1], -out[2], -out[0]]; return out; };
const ring = (c: Cube) => distance(c, [0, 0, 0]);

// Upstream's 6-player standard map (getDefaultMapString(6, "standard", true)),
// copied so this module stays free of upstream imports.
const SIX = "112 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 P1 0 0 P2 0 0 P3 0 0 P4 0 0 P5 0 0 P6 0 0";

export function layoutFor(style: Style, players: number): Layout {
  if (players !== 6) throw new Error(`No ${STYLE_NAMES[style]} layout for ${players} players yet.`);
  const template = SIX.split(" ");
  const cubes = spiral(template.length);
  const homes: number[] = [];
  template.forEach((t, i) => { const m = t.match(/^P(\d)$/); if (m) homes[Number(m[1]) - 1] = i; });
  const indexOf = (c: Cube) => cubes.findIndex((x) => same(x, c));
  let base: Cube[];
  let slots: number[][];
  if (style === "milty") {
    const w = wedges(SIX);
    slots = w.slots;
    base = w.canonical;
  } else {
    const home = cubes[homes[0]!]!;
    const front = DIRECTIONS.map((d) => add(home, d)).filter((c) => ring(c) <= ring(home)).sort((a, b) => ring(b) - ring(a) || a[0] - b[0]);
    const seat0 = [...front];
    if (style === "eq") seat0.push(cubes.find((c) => ring(c) === 1 && distance(c, home) === 2)!);
    base = seat0.map((c) => [c[0] - home[0], c[1] - home[1], c[2] - home[2]] as Cube);
    slots = homes.map((h) => {
      const steps = [0, 1, 2, 3, 4, 5].find((s) => same(turn(home, s), cubes[h]!))!;
      return seat0.map((c) => indexOf(turn(c, steps)));
    });
  }
  const inSlice = new Set(slots.flat());
  const fixed = template.map((t, i) => (i > 0 && t === "0" && !inSlice.has(i) ? i : -1)).filter((i) => i >= 0);
  const core = slots.map((s) => fixed.filter((f) => s.some((i) => distance(cubes[i]!, cubes[f]!) === 1)));
  return { style, players, template, homes, slots, canonical: base, fixed, core, sliceRed: style === "nucleus" ? 1 : 2 };
}

// Tile index pairs that touch, among a set of map indices.
export function touching(layout: Layout, indices: number[]): [number, number][] {
  const cubes = spiral(layout.template.length);
  const out: [number, number][] = [];
  for (let a = 0; a < indices.length; a++) for (let b = a + 1; b < indices.length; b++) if (distance(cubes[indices[a]!]!, cubes[indices[b]!]!) === 1) out.push([indices[a]!, indices[b]!]);
  return out;
}
