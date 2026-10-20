"use client";
// /draft: make a Milty draft for 3 to 8 players, or join one by its code. The
// slices are generated here from upstream's base data (or entered by hand) and
// sent to the API.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE_OPTIONS } from "../../../server/data/options";
import FactionIcon from "../../components/FactionIcon/FactionIcon";
import styles from "../play/play.module.scss";
import { Button, Choices, cx, kit, Switch, rootAttrs, useDevicePrefs } from "../ui/kit";
import draftStyles from "./draft.module.scss";
import { layoutFor, needsPok } from "./layout";
import { DEFAULT_LIMITS, draftOrder, drawFactions, generateSlices, MAX_SLICES, MILTY_SLOTS, newSeed, parseSlices, PLAYER_COUNTS, sliceLimit, sliceStats, slicesProblems, tilePool, type DraftLimits } from "./milty";
import { SliceArt } from "./SliceArt";
import { useBase } from "./useDraft";

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

export function makeSlices(base: ReturnType<typeof useBase>, expansions: string[], players: number, count: number, limits: DraftLimits, seed: string) {
  return generateSlices(tilePool(base.systems, base.planets, expansions), count, limits, layoutFor(players, expansions).adjacent, seed);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function NewDraft() {
  const router = useRouter();
  const { prefs } = useDevicePrefs();
  const base = useBase();
  const [players, setPlayers] = useState(6);
  const [names, setNames] = useState<string[]>(Array(8).fill(""));
  const [name, setName] = useState("");
  const [slices, setSlices] = useState(7);
  const [factionCount, setFactionCount] = useState(9);
  const [pok, setPok] = useState(true);
  const [te, setTe] = useState(true);
  const [vp, setVp] = useState(10);
  const [keepOrder, setKeepOrder] = useState(false);
  const [limits, setLimits] = useState<DraftLimits>(DEFAULT_LIMITS);
  const [seed, setSeed] = useState("");
  const [custom, setCustom] = useState(false);
  const [sliceText, setSliceText] = useState("");
  const [choose, setChoose] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");

  const expansions = gameExpansions(pok, te);
  const available = draftableFactions(base.factions, expansions);
  const fname = (f: string) => base.factions[f]?.name ?? f;
  const byName = (a: string, b: string) => fname(a).localeCompare(fname(b));
  const pool = tilePool(base.systems, base.planets, expansions);
  const sliceMax = clamp(sliceLimit(pool), players, Math.min(12, MAX_SLICES));
  const sliceCount = clamp(slices, players, sliceMax);
  const factionMax = Math.max(players, available.length);
  const factions = clamp(factionCount, players, factionMax);
  const picked = chosen.filter((f) => (available as string[]).includes(f));
  const entered = parseSlices(sliceText);
  const problems = custom ? slicesProblems(entered, base.systems, expansions, players) : [];
  const layout = layoutFor(players, expansions);

  function choosePlayers(n: number) {
    setPlayers(n);
    // Milty's recommendations: a slice more than players, three more factions.
    setSlices(n + 1);
    setFactionCount(n + 3);
  }
  function choosePok(b: boolean) {
    setPok(b);
    if (!b && needsPok(players)) choosePlayers(6);
  }

  async function make() {
    setError("");
    const s = seed.trim() || newSeed();
    let made: string[][];
    if (custom) {
      if (problems.length) { setError(problems[0]!); return; }
      made = entered;
    } else {
      const g = makeSlices(base, expansions, players, sliceCount, limits, s);
      if ("error" in g) { setError(g.error); return; }
      made = g.slices;
    }
    if (available.length < factions) { setError(`Only ${available.length} factions with these expansions.`); return; }
    const factionPool = choose && picked.length ? picked : undefined;
    setPending(true);
    try {
      const res = await fetch("/api/fork/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, players: names.slice(0, players).map((n) => n.trim()), slices: made, factions: drawFactions(available, factionPool ?? [], factions, s),
          order: draftOrder(players, s, keepOrder), seed: s, limits, expansions, victoryPoints: vp, customSlices: custom || undefined, factionPool,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.id) { setError(json.error ?? "The draft wasn't saved. Check the connection and try again."); return; }
      router.push(`/draft/${json.id}`);
    } finally {
      setPending(false);
    }
  }

  // A labelled stepper. A div, not a label: a label would pass taps on its text to "−".
  const num = (label: string, value: number, set: (n: number) => void, min: number, max: number, step = 1, extra?: React.ReactNode) => (
    <div className={styles.field} role="group" aria-label={label}>
      <span>{label}</span>
      <span className={draftStyles.fieldEnd}>
        <span className={styles.stepper}>
          <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => set(Math.max(min, +(value - step).toFixed(1)))}>−</button>
          <b className={styles.num}>{value}</b>
          <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => set(Math.min(max, +(value + step).toFixed(1)))}>+</button>
        </span>
        {extra}
      </span>
    </div>
  );
  const toggle = (label: string, value: boolean, set: (b: boolean) => void, sub?: string) => <Switch label={label} detail={sub} checked={value} onChange={set} />;

  const poolSummary = !picked.length ? `None chosen yet, so all ${available.length} are in the draw.`
    : picked.length < factions ? `All ${picked.length} chosen are in the draft, and ${factions - picked.length} more are drawn from the other ${available.length - picked.length}.`
    : picked.length === factions ? `Exactly these ${picked.length} are in the draft.`
    : `${factions} of these ${picked.length} are drawn at random. Set Factions to ${picked.length} to use them all.`;

  return (
    <div className={cx(kit.root, styles.root, draftStyles.root)} {...rootAttrs(prefs)}>
      <header className={styles.top}>
        <div className={styles.phase}><span className={styles.phaseName}>Milty draft</span><span className={styles.round}>{players} players</span></div>
      </header>
      <main className={styles.main}>
        <section className={kit.card} aria-label="Join a draft">
          <p className={kit.eyebrow}><span>Join a draft</span></p>
          <div className={kit.line}>
            <input className={kit.search} placeholder="Draft code" value={code} onChange={(e) => setCode(e.target.value.trim())} aria-label="Draft code" autoCapitalize="off" autoCorrect="off" />
            <Button size="small" disabled={!code} onClick={() => router.push(`/draft/${code}`)}>Join</Button>
          </div>
        </section>

        <section className={kit.card} aria-label="New draft">
          <p className={kit.eyebrow}><span>New draft</span></p>
          <p className={kit.sub}>Each player picks a slice of the map, a faction and a seat, one at a time in snake order, from their own phone or someone else's. When everyone has all three, the game is created with the map built.</p>
          <input className={kit.search} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Draft name" />
          <Choices label="How many players?" value={String(players)} onChange={(v) => choosePlayers(Number(v))}
            options={PLAYER_COUNTS.map((n) => ({ value: String(n), label: String(n), name: `${n} players`, disabled: !pok && needsPok(n) }))} />
          {!pok ? <p className={kit.sub}>Without Prophecy of Kings, only 6 players: the other maps use its hyperlanes.</p> : null}
          <p className={kit.eyebrow}><span>Players</span><span>{keepOrder ? "Draft in this order" : "Draft order is random"}</span></p>
          <div className={styles.grid2}>
            {names.slice(0, players).map((n, i) => (
              <input key={i} className={kit.search} placeholder={`Player ${i + 1}`} value={n} aria-label={`Player ${i + 1}`}
                onChange={(e) => setNames(names.map((x, k) => (k === i ? e.target.value : x)))} />
            ))}
          </div>
          <p className={kit.eyebrow}><span>Game</span></p>
          {toggle("Prophecy of Kings", pok, choosePok)}
          {toggle("Thunder's Edge", te, setTe)}
          <Choices label="Victory points" value={String(vp)} onChange={(v) => setVp(Number(v))} options={[10, 14].map((v) => ({ value: String(v), label: `${v} points` }))} />
          <p className={kit.eyebrow}><span>Draft</span></p>
          {custom ? <p className={kit.sub}>{entered.length} slice{entered.length === 1 ? "" : "s"} entered by hand (in Advanced options).</p>
            : num("Slices", sliceCount, setSlices, players, sliceMax)}
          {num("Factions", factions, setFactionCount, players, factionMax, 1,
            <Button size="small" disabled={factions >= factionMax} onClick={() => setFactionCount(factionMax)} aria-label={`Max: ${factionMax} factions`}>Max</Button>)}
          <details className={styles.item}>
            <summary>Advanced options</summary>
            <div className={draftStyles.advanced}>
            <p className={kit.eyebrow}><span>Slice limits</span></p>
            <p className={kit.sub}>{custom ? "Not used for slices entered by hand. " : ""}Optimal value counts each planet's higher number, or half of each when they're equal, as on milty.shenanigans.be.</p>
            {num("Minimum optimal influence", limits.minInfluence, (v) => setLimits({ ...limits, minInfluence: v }), 0, 10, 0.5)}
            {num("Minimum optimal resources", limits.minResources, (v) => setLimits({ ...limits, minResources: v }), 0, 10, 0.5)}
            {num("Minimum optimal total", limits.minTotal, (v) => setLimits({ ...limits, minTotal: v }), 0, 20, 0.5)}
            {num("Maximum optimal total", limits.maxTotal, (v) => setLimits({ ...limits, maxTotal: v }), 5, 25, 0.5)}
            {num("Legendary planets, at least", limits.minLegendaries, (v) => setLimits({ ...limits, minLegendaries: v }), 0, 7)}
            {toggle("At least 2 alpha and 2 beta wormholes", limits.wormholePairs, (b) => setLimits({ ...limits, wormholePairs: b }))}
            {toggle("At most 1 wormhole per slice", limits.oneWormhole, (b) => setLimits({ ...limits, oneWormhole: b }))}
            <p className={kit.eyebrow}><span>Order</span></p>
            {toggle("Keep the players' order", keepOrder, setKeepOrder, "Draft in the order above instead of a random one")}
            <input className={kit.search} placeholder="Seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Seed" />

            <p className={kit.eyebrow}><span>Slices by hand</span></p>
            {toggle("Enter the slices by hand", custom, setCustom, "Instead of generating them")}
            {custom ? (
              <>
                <div className={draftStyles.guide}>
                  <SliceArt tiles={[]} canonical={MILTY_SLOTS} size={20} labels={["1", "2", "3", "4", "5"]} />
                  <p className={kit.sub}>One slice per line: five tile numbers separated by commas, in this order, with the home at the bottom. That's Milty's order, so slices copied from milty.shenanigans.be work as they are.</p>
                </div>
                <textarea className={cx(kit.search, draftStyles.slicesInput)} value={sliceText} onChange={(e) => setSliceText(e.target.value)} aria-label="Slices, one per line"
                  placeholder={"26, 39, 65, 47, 73\n25, 40, 64, 46, 72"} rows={Math.max(players + 1, 4)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                {problems.length ? (
                  <ul className={cx(kit.sub, draftStyles.problems)} aria-label="Problems with the slices">{problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul>
                ) : (
                  <div className={styles.slices} aria-label="Slices entered">
                    {entered.map((tiles, i) => {
                      const st = sliceStats(tiles.map(base.info));
                      return (
                        <div key={i} className={styles.slice} style={{ cursor: "default" }}>
                          <b>Slice {i + 1}</b>
                          <SliceArt tiles={tiles} canonical={layout.canonical} size={18} />
                          <span className={kit.num}>{st.optimal.resources} / {st.optimal.influence}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}

            <p className={kit.eyebrow}><span>Factions by hand</span></p>
            {toggle("Choose the factions", choose, setChoose, "Only these can be drafted")}
            {choose ? (
              <>
                <p className={kit.sub} aria-live="polite">{poolSummary}</p>
                <div className={kit.line}>
                  <Button size="small" onClick={() => setChosen([...available])}>Choose all</Button>
                  <Button size="small" disabled={!picked.length} onClick={() => setChosen([])}>Clear</Button>
                </div>
                <div className={draftStyles.factionGrid}>
                  {[...available].sort(byName).map((f) => (
                    <Switch key={f} checked={picked.includes(f)} onChange={(b) => setChosen(b ? [...picked, f] : picked.filter((x) => x !== f))}
                      label={<span className={draftStyles.factionName}><FactionIcon factionId={f as FactionId} size={22} />{fname(f)}</span>} />
                  ))}
                </div>
              </>
            ) : null}
            </div>
          </details>
          {error ? <p className={kit.banner} role="alert">{error}</p> : null}
          <Button kind="primary" size="tall" block disabled={pending} onClick={make}>Make the draft</Button>
        </section>
      </main>
    </div>
  );
}
