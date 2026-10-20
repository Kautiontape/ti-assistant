// Slices and the pre-dealt map tiles for a Twilight's Fall draft. A seeded
// local search: deal tiles at random, then swap tiles of the same colour until
// every limit holds. Limits, per slice of k tiles:
// - optimal influence at least 0.8k and optimal resources at least 0.5k
//   (the Milty draft's 4 and 2.5 for its 5-tile slices);
// - the best and worst slice within 0.6k + 1 optimal value of each other;
// - no two wormholes of a kind in one slice.
// Across the draft: at least 2 alpha and 2 beta wormholes and 1 legendary
// planet; no two anomalies touching among the pre-dealt tiles. On a Nucleus
// map the pre-dealt tiles next to each seat's slice stay within 3 optimal
// value of each other's. About 40% of the map's systems are red, as in the
// base game's 2 red to 3 blue per player.
import { ANOMALIES, optimalTotal, rngFor, sliceStats, shuffle, type TileInfo } from "../draft/milty";
import { arrangeFor, fixedRed as redOnMap, touching, type Layout } from "./layouts";

export type Generated = { slices: string[][]; fixed: string[] } | { error: string };

export function limitsFor(k: number) {
  return { minInfluence: 0.8 * k, minResources: 0.5 * k, spread: 0.6 * k + 1, coreSpread: 3 };
}

export function generate(pool: { blue: TileInfo[]; red: TileInfo[] }, layout: Layout, sliceCount: number, seed: string, rounds = 40): Generated {
  const k = layout.slots[0]!.length;
  const f = layout.fixed.length;
  const fixedRed = redOnMap(layout);
  const needRed = sliceCount * layout.sliceRed + fixedRed;
  const needBlue = sliceCount * (k - layout.sliceRed) + (f - fixedRed);
  if (pool.red.length < needRed) return { error: `Only ${pool.red.length} red systems for ${needRed} places. Make fewer slices.` };
  if (pool.blue.length < needBlue) return { error: `Only ${pool.blue.length} blue systems for ${needBlue} places. Make fewer slices.` };
  const lim = limitsFor(k);
  const rnd = rngFor(`${seed}:tf`);
  const fixedTouch = touching(layout, layout.fixed).map(([a, b]) => [layout.fixed.indexOf(a), layout.fixed.indexOf(b)] as const);
  const corePos = layout.core.map((c) => c.map((i) => layout.fixed.indexOf(i)));

  // Places: slice s tile j at s * k + j, then the pre-dealt tiles.
  const isRedPlace = (p: number) => (p < sliceCount * k ? p % k < layout.sliceRed : p - sliceCount * k < fixedRed);
  const total = sliceCount * k + f;

  function penalty(at: TileInfo[]) {
    let p = 0;
    const totals: number[] = [];
    for (let s = 0; s < sliceCount; s++) {
      const st = sliceStats(at.slice(s * k, s * k + k));
      p += Math.max(0, lim.minInfluence - st.optimal.influence) + Math.max(0, lim.minResources - st.optimal.resources);
      p += 10 * (st.wormholes.length - new Set(st.wormholes).size) + 10 * Math.max(0, st.anomalies - layout.maxAnomalies);
      totals.push(st.optimal.influence + st.optimal.resources);
    }
    p += 3 * Math.max(0, Math.max(...totals) - Math.min(...totals) - lim.spread);
    const fixedTiles = at.slice(sliceCount * k);
    for (const [a, b] of fixedTouch) if (fixedTiles[a]!.anomaly && fixedTiles[b]!.anomaly) p += 10;
    if (layout.style === "nucleus") {
      const core = corePos.map((c) => c.reduce((sum, i) => sum + optimalTotal(fixedTiles[i]!), 0));
      p += 3 * Math.max(0, Math.max(...core) - Math.min(...core) - lim.coreSpread);
    }
    const worm = at.flatMap((t) => t.wormholes);
    p += 5 * Math.max(0, 2 - worm.filter((w) => w === "ALPHA").length) + 5 * Math.max(0, 2 - worm.filter((w) => w === "BETA").length);
    if (!at.some((t) => t.legendary)) p += 5;
    return p;
  }

  for (let round = 0; round < rounds; round++) {
    const red = shuffle(pool.red, rnd), blue = shuffle(pool.blue, rnd);
    const at: TileInfo[] = [];
    for (let p = 0; p < total; p++) at.push((isRedPlace(p) ? red : blue).pop()!);
    const spare = { red, blue };
    let score = penalty(at);
    for (let step = 0; step < 4000 && score > 0; step++) {
      const a = Math.floor(rnd() * total);
      const colour = isRedPlace(a) ? "red" : "blue";
      const useSpare = rnd() < 0.4 && spare[colour].length > 0;
      if (useSpare) {
        const i = Math.floor(rnd() * spare[colour].length);
        const old = at[a]!;
        at[a] = spare[colour][i]!;
        const next = penalty(at);
        if (next <= score) { spare[colour][i] = old; score = next; } else at[a] = old;
      } else {
        const b = Math.floor(rnd() * total);
        if (a === b || isRedPlace(b) !== isRedPlace(a)) continue;
        [at[a], at[b]] = [at[b]!, at[a]!];
        const next = penalty(at);
        if (next <= score) score = next; else [at[a], at[b]] = [at[b]!, at[a]!];
      }
    }
    if (score > 0) continue;
    // Drawn in seat 1's order; each seat re-orders its slice when it's placed.
    const slices = Array.from({ length: sliceCount }, (_, s) => arrangeFor(layout, 0, at.slice(s * k, s * k + k).map((t) => t.id), [], (id) => ANOMALIES.has(id)));
    return { slices, fixed: at.slice(sliceCount * k).map((t) => t.id) };
  }
  return { error: "No map met every limit. Try again, or make fewer slices." };
}
