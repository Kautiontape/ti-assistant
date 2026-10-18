"use client";
// /draft: make a Milty draft for 6 players, or join one by its code. The
// slices are generated here from upstream's base data and sent to the API.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE_OPTIONS } from "../../../server/data/options";
import { getDefaultMapString } from "../../util/map";
import styles from "../play/play.module.scss";
import { cx } from "../play/ui";
import { kit } from "../ui/kit";
import { DEFAULT_LIMITS, draftOrder, generateSlices, newSeed, pickFactions, tilePool, wedges, type DraftLimits } from "./milty";
import { useBase } from "./useDraft";

const PLAYERS = 6;

export function gameExpansions(pok: boolean, te: boolean) {
  return (BASE_OPTIONS.expansions as string[]).filter((e) => (e === "POK" ? pok : e === "THUNDERS EDGE" ? te : true));
}

// Upstream setup's faction filter (app/[locale]/setup/setup-page.tsx), less
// factions without a colour, which create-game refuses.
export function draftableFactions(factions: Record<string, BaseFaction | undefined>, expansions: string[]) {
  return Object.values(factions).filter((f): f is BaseFaction => {
    if (!f || f.locked) return false;
    if (f.removedIn && expansions.includes(f.removedIn)) return false;
    if (!f.color && !f.colorList?.length) return false;
    return f.expansion === "BASE" || expansions.includes(f.expansion);
  }).map((f) => f.id);
}

export function makeSlices(base: ReturnType<typeof useBase>, expansions: string[], count: number, limits: DraftLimits, seed: string) {
  const w = wedges(getDefaultMapString(PLAYERS, "standard", expansions.includes("THUNDERS EDGE")));
  return generateSlices(tilePool(base.systems, base.planets, expansions), count, limits, w.adjacent, seed);
}

export default function NewDraft() {
  const router = useRouter();
  const base = useBase();
  const [names, setNames] = useState<string[]>(Array(PLAYERS).fill(""));
  const [name, setName] = useState("");
  const [slices, setSlices] = useState(PLAYERS + 1);
  const [factionCount, setFactionCount] = useState(PLAYERS + 3);
  const [pok, setPok] = useState(true);
  const [te, setTe] = useState(true);
  const [vp, setVp] = useState(10);
  const [keepOrder, setKeepOrder] = useState(false);
  const [limits, setLimits] = useState<DraftLimits>(DEFAULT_LIMITS);
  const [seed, setSeed] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");

  const expansions = gameExpansions(pok, te);
  const available = draftableFactions(base.factions, expansions);

  async function make() {
    setError("");
    const s = seed.trim() || newSeed();
    const g = makeSlices(base, expansions, slices, limits, s);
    if ("error" in g) { setError(g.error); return; }
    if (available.length < factionCount) { setError(`Only ${available.length} factions with these expansions.`); return; }
    setPending(true);
    try {
      const res = await fetch("/api/fork/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, players: names.map((n) => n.trim()), slices: g.slices, factions: pickFactions(available, factionCount, s), order: draftOrder(PLAYERS, s, keepOrder), seed: s, limits, expansions, victoryPoints: vp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.id) { setError(json.error ?? "The draft wasn't saved. Check the connection and try again."); return; }
      router.push(`/draft/${json.id}`);
    } finally {
      setPending(false);
    }
  }

  const num = (label: string, value: number, set: (n: number) => void, min: number, max: number, step = 1) => (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.stepper}>
        <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => set(Math.max(min, +(value - step).toFixed(1)))}>−</button>
        <b className={styles.num}>{value}</b>
        <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => set(Math.min(max, +(value + step).toFixed(1)))}>+</button>
      </span>
    </label>
  );
  const toggle = (label: string, value: boolean, set: (b: boolean) => void, sub?: string) => (
    <button type="button" className={styles.opt} aria-pressed={value} onClick={() => set(!value)}>
      <b>{label}</b>{sub ? <span className={styles.sub}>{sub}</span> : null}<span className={styles.meta}>{value ? "On" : "Off"}</span>
    </button>
  );

  return (
    <div className={cx(kit.root, styles.root)}>
      <header className={styles.top}>
        <div className={styles.phase}><span className={styles.phaseName}>Milty draft</span><span className={styles.round}>6 players</span></div>
      </header>
      <main className={styles.main}>
        <section className={styles.card} aria-label="Join a draft">
          <p className={styles.eyebrow}><span>Join a draft</span></p>
          <div className={styles.row}>
            <input className={styles.search} placeholder="Draft code" value={code} onChange={(e) => setCode(e.target.value.trim())} aria-label="Draft code" autoCapitalize="off" autoCorrect="off" />
            <button className={cx(styles.btn, styles.smallBtn)} disabled={!code} onClick={() => router.push(`/draft/${code}`)}>Join</button>
          </div>
        </section>

        <section className={styles.card} aria-label="New draft">
          <p className={styles.eyebrow}><span>New draft</span></p>
          <p className={styles.sub}>Each player picks a slice of the map, a faction and a seat, one at a time in snake order, from their own phone or someone else's. When everyone has all three, the game is created with the map built.</p>
          <input className={styles.search} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Draft name" />
          <p className={styles.eyebrow}><span>Players</span><span>Draft order is random</span></p>
          <div className={styles.grid2}>
            {names.map((n, i) => (
              <input key={i} className={styles.search} placeholder={`Player ${i + 1}`} value={n} aria-label={`Player ${i + 1}`}
                onChange={(e) => setNames(names.map((x, k) => (k === i ? e.target.value : x)))} />
            ))}
          </div>
          <p className={styles.eyebrow}><span>Game</span></p>
          {toggle("Prophecy of Kings", pok, setPok)}
          {toggle("Thunder's Edge", te, setTe)}
          <div className={styles.seg} role="group" aria-label="Victory points">
            {[10, 14].map((v) => <button key={v} aria-pressed={vp === v} onClick={() => setVp(v)}>{v} points</button>)}
          </div>
          <p className={styles.eyebrow}><span>Draft</span></p>
          {num("Slices", slices, setSlices, PLAYERS, 9)}
          {num("Factions", factionCount, setFactionCount, PLAYERS, Math.max(PLAYERS, Math.min(available.length, 14)))}
          <details className={styles.item}>
            <summary>Slice limits and order</summary>
            <p className={styles.sub}>Optimal value counts each planet's higher number, or half of each when they're equal, as on milty.shenanigans.be.</p>
            {num("Minimum optimal influence", limits.minInfluence, (v) => setLimits({ ...limits, minInfluence: v }), 0, 10, 0.5)}
            {num("Minimum optimal resources", limits.minResources, (v) => setLimits({ ...limits, minResources: v }), 0, 10, 0.5)}
            {num("Minimum optimal total", limits.minTotal, (v) => setLimits({ ...limits, minTotal: v }), 0, 20, 0.5)}
            {num("Maximum optimal total", limits.maxTotal, (v) => setLimits({ ...limits, maxTotal: v }), 5, 25, 0.5)}
            {num("Legendary planets, at least", limits.minLegendaries, (v) => setLimits({ ...limits, minLegendaries: v }), 0, 7)}
            {toggle("At least 2 alpha and 2 beta wormholes", limits.wormholePairs, (b) => setLimits({ ...limits, wormholePairs: b }))}
            {toggle("At most 1 wormhole per slice", limits.oneWormhole, (b) => setLimits({ ...limits, oneWormhole: b }))}
            {toggle("Keep the players' order", keepOrder, setKeepOrder, "Draft in the order above instead of a random one")}
            <input className={styles.search} placeholder="Seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Seed" />
          </details>
          {error ? <p className={styles.banner} role="alert">{error}</p> : null}
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={pending} onClick={make}>Make the draft</button>
        </section>
      </main>
    </div>
  );
}
