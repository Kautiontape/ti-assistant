"use client";
// /draft/tf: make a Twilight's Fall draft, or join one by its code. The map is
// generated here from upstream's base data and sent to the API, which deals
// the cards itself.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { newSeed, tilePool } from "../draft/milty";
import { useBase } from "../draft/useDraft";
import styles from "../play/play.module.scss";
import { Button, Choices, cx, kit, rootAttrs, Stepper, Switch, useDevicePrefs } from "../ui/kit";
import { maxPacks, PRESETS, presetOf, type TfRules } from "./draft";
import { generate } from "./generate";
import { boardLayout } from "./board";
import { maxSlices, playerCounts, STYLE_NAMES, type Style } from "./layouts";
import { runThrough } from "./text";
import tf from "./tfdraft.module.scss";

export const TF_TILES = ["POK", "THUNDERS EDGE"];

export default function NewTfDraft() {
  const router = useRouter();
  const { prefs } = useDevicePrefs();
  const base = useBase();
  const [style, setStyle] = useState<Style>("nucleus");
  const counts = playerCounts(style);
  const [players, setPlayers] = useState(6);
  const n = counts.includes(players) ? players : counts[0]!;
  const [names, setNames] = useState<string[]>(Array(8).fill(""));
  const [name, setName] = useState("");
  const [rules, setRules] = useState<TfRules>(PRESETS.rulebook);
  const [extra, setExtra] = useState(1);
  const [packs, setPacks] = useState(0);
  const [vp, setVp] = useState(10);
  const [keepOrder, setKeepOrder] = useState(false);
  const [seed, setSeed] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const preset = presetOf(rules);
  const pool = tilePool(base.systems, base.planets, TF_TILES);
  const layout = boardLayout(style, n);
  const mostSlices = Math.max(n, Math.min(n + 3, maxSlices(layout, pool)));
  const slices = Math.min(n + extra, mostSlices);
  const packCount = Math.min(maxPacks(rules.keleres), n + packs);

  async function make() {
    setError("");
    const s = seed.trim() || newSeed();
    const g = generate(pool, layout, slices, s);
    if ("error" in g) { setError(g.error); return; }
    setPending(true);
    try {
      const res = await fetch("/api/fork/tfdraft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, players: names.slice(0, n).map((x) => x.trim()), style, rules, slices: g.slices, fixed: g.fixed, packs: packCount, seed: s, keepOrder, victoryPoints: vp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.id) { setError(json.error ?? "The draft wasn't saved. Check the connection and try again."); return; }
      router.push(`/draft/tf/${json.id}`);
    } finally {
      setPending(false);
    }
  }

  const set = (p: Partial<TfRules>) => setRules({ ...rules, ...p });
  return (
    <div className={cx(kit.root, styles.root)} {...rootAttrs(prefs)}>
      <header className={styles.top}>
        <div className={styles.phase}><span className={styles.phaseName}>Twilight&apos;s Fall draft</span><span className={styles.round}>{STYLE_NAMES[style]} · {n} players</span></div>
      </header>
      <main className={styles.main}>
        <section className={kit.card} aria-label="Join a draft">
          <p className={kit.eyebrow}><span>Join a draft</span></p>
          <div className={kit.line}>
            <input className={kit.search} placeholder="Draft code" value={code} onChange={(e) => setCode(e.target.value.trim())} aria-label="Draft code" autoCapitalize="off" autoCorrect="off" />
            <Button size="small" disabled={!code} onClick={() => router.push(`/draft/tf/${code}`)}>Join</Button>
          </div>
        </section>

        <section className={kit.card} aria-label="New draft">
          <p className={kit.eyebrow}><span>New draft</span></p>
          <p className={kit.sub}>Players draft their map spot, reference cards and Mahact King from their own phones. When everyone has picked, the game is created with the map, seats, home systems and starting units filled in.</p>
          <input className={kit.search} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Draft name" />

          <Choices label="Map" value={style} onChange={setStyle} options={(["nucleus", "milty", "eq"] as Style[]).map((v) => ({ value: v, label: STYLE_NAMES[v] }))} />
          <p className={kit.sub}>{style === "nucleus" ? "Slices are the 3 systems in front of each home. The centre of the map is dealt before the draft, and seats are drafted." : style === "eq" ? "Slices of 4 systems. The systems between homes are dealt before the draft." : "Slices of 5 systems; the whole map comes from the slices."}</p>
          <Choices label="Players" value={String(n)} onChange={(v) => setPlayers(Number(v))} options={counts.map((c) => ({ value: String(c), label: String(c) }))} />
          {layout.mapStyle === "warp" || n === 3 ? <p className={kit.sub}>The {n}-player map uses hyperlanes, as on milty.shenanigans.be.</p> : null}
          <p className={kit.eyebrow}><span>Players</span><span>{keepOrder ? "Snake in this order" : "Snake order is random"}</span></p>
          <div className={styles.grid2}>
            {Array.from({ length: n }, (_, i) => (
              <input key={i} className={kit.search} placeholder={`Player ${i + 1}`} value={names[i]} aria-label={`Player ${i + 1}`}
                onChange={(e) => setNames(names.map((x, k) => (k === i ? e.target.value : x)))} />
            ))}
          </div>

          <p className={kit.eyebrow}><span>Rules</span></p>
          <Choices label="Setup rules" hideLabel value={preset ?? "custom"} onChange={(v) => v !== "custom" && setRules(PRESETS[v as keyof typeof PRESETS])}
            options={[{ value: "rulebook", label: "Rulebook" }, { value: "tidraft", label: "tidraft" }, ...(preset ? [] : [{ value: "custom", label: "Mixed" }])]} />
          <details className={styles.item}>
            <summary>Change the rules</summary>
            <Choices label="Reference cards" value={rules.cards} onChange={(v) => set({ cards: v })} options={[{ value: "pass", label: "Deal 3, keep and pass" }, { value: "packs", label: "Packs in the snake" }]} />
            <Choices label="Home systems" value={rules.home} onChange={(v) => set({ home: v })} options={[{ value: "open", label: "Open, speaker first" }, { value: "secret", label: "Secret, all at once" }]} />
            <Choices label="Kings" value={rules.kings} onChange={(v) => set({ kings: v })} options={[{ value: "order", label: "After seating, speaker last" }, { value: "snake", label: "Snake pick" }]} />
            <Switch label="Council Keleres in the deck" detail="As a home, it draws a faction no one holds" checked={rules.keleres} onChange={(b) => set({ keleres: b })} />
          </details>
          <ol className={tf.steps}>
            {runThrough(style, rules).map(([t, s]) => <li key={t}><b>{t}</b><span>{s}</span></li>)}
          </ol>

          <p className={kit.eyebrow}><span>Draft</span></p>
          <label className={styles.field}><span>Slices</span><Stepper value={slices} onChange={(v) => setExtra(v - n)} min={n} max={mostSlices} less="Fewer slices" more="More slices" /></label>
          {rules.cards === "packs" ? <label className={styles.field}><span>Card packs</span><Stepper value={packCount} onChange={(v) => setPacks(v - n)} min={n} max={maxPacks(rules.keleres)} less="Fewer packs" more="More packs" /></label> : null}
          <Choices label="Victory points" value={String(vp)} onChange={(v) => setVp(Number(v))} options={[10, 14].map((v) => ({ value: String(v), label: `${v} points` }))} />
          <details className={styles.item}>
            <summary>Order and seed</summary>
            <Switch label="Keep the players' order" detail="Snake in the order above instead of a random one" checked={keepOrder} onChange={setKeepOrder} />
            <input className={kit.search} placeholder="Seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Seed" />
          </details>
          {error ? <p className={kit.banner} role="alert">{error}</p> : null}
          <Button kind="primary" size="tall" block disabled={pending} onClick={make}>Make the draft</Button>
        </section>
      </main>
    </div>
  );
}
