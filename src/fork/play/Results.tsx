"use client";
// How the game went, from upstream's replay of the log (results.ts): points and
// technologies by round, the map at the end of each round, and time per player.
// Upstream shows these on its results page; here they're one sheet with a view
// picker, opened from the game-over screen or the Table tab.
import { useState } from "react";
import GameMap from "../../components/Map/GameMap";
import { useOptions, useTimers } from "../../context/dataHooks";
import { getWormholeNexusSystemNumber } from "../../util/map";
import { Optional } from "../../util/types/types";
import { fmtDuration } from "./logic";
import styles from "./play.module.scss";
import { useReplay, type Replay } from "./results";
import type { Ctx } from "./ui";
import { Button, Choices, cx, kit, pcolor, Sheet as KitSheet, Swatch } from "../ui/kit";

type View = "points" | "techs" | "map" | "time";
const roundName = (r: number, last: number) => (r === 0 ? "Start" : r === last ? "End" : `Round ${r}`);

export function ResultsSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const [view, setView] = useState<View>("points");
  const { replay, failed } = useReplay(true);
  return (
    <KitSheet title="How the game went" close={close}>
      <Choices label="Show" hideLabel value={view} onChange={setView}
        options={[{ value: "points", label: "Points" }, { value: "techs", label: "Technology" }, { value: "map", label: "Map" }, { value: "time", label: "Time" }]} />
      {view === "time" ? <TimeView replay={replay} ctx={ctx} />
        : failed ? <p className={kit.sub}>The replay couldn't run in this browser, so the rounds can't be shown.</p>
        : !replay ? <p className={kit.sub} role="status" aria-live="polite">Replaying the game…</p>
        : view === "points" ? <ByRound replay={replay} ctx={ctx} what="points" />
        : view === "techs" ? <ByRound replay={replay} ctx={ctx} what="techs" />
        : <MapByRound replay={replay} ctx={ctx} />}
    </KitSheet>
  );
}

// Totals per player per round, as a line chart, a legend that highlights a
// player, and a table. Tap or point at a round for its values.
function ByRound({ replay, ctx, what }: { replay: Replay; ctx: Ctx; what: "points" | "techs" }) {
  const { factions, short } = ctx;
  const [focus, setFocus] = useState<Optional<FactionId>>();
  const [table, setTable] = useState(false);
  const rounds = Object.keys(replay.rounds).map(Number).sort((a, b) => a - b);
  const last = rounds.at(-1) ?? 0;
  // The replay arrives round by round; until someone picks a round, show the newest.
  const [chosen, setAt] = useState<Optional<number>>();
  const at = chosen ?? last;
  const ids = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition).map((f) => f.id);
  const value = (r: number, id: FactionId) => {
    const round = replay.rounds[r];
    const by = what === "points" ? round?.victoryPoints[id] : round?.techs[id];
    return by ? Object.values(by).reduce((n: number, v) => n + (v as number), 0) : 0;
  };
  const max = Math.max(1, ...rounds.flatMap((r) => ids.map((id) => value(r, id))));
  const unit = what === "points" ? "points" : "technologies";
  // Chart geometry in viewBox units; it scales to the sheet's width.
  const W = 320, H = 180, L = 28, B = 22, T = 8, R = 10;
  const x = (r: number) => L + ((W - L - R) * (rounds.length > 1 ? rounds.indexOf(r) / (rounds.length - 1) : 0.5));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const atValues = ids.map((id) => ({ id, v: value(at, id) })).sort((a, b) => b.v - a.v);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${what === "points" ? "Points" : "Technologies"} by round`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const near = rounds.reduce((best, r) => (Math.abs(x(r) - px) < Math.abs(x(best) - px) ? r : best), rounds[0] ?? 0);
          setAt(near);
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={L - 6} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {rounds.map((r) => <text key={r} x={x(r)} y={H - 6} className={styles.axis} textAnchor="middle">{r === 0 ? "S" : r}</text>)}
        <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className={styles.cross} />
        {ids.map((id) => {
          const dim = focus && focus !== id;
          const pts = rounds.map((r) => `${x(r)},${y(value(r, id))}`).join(" ");
          return (
            <g key={id} style={{ opacity: dim ? 0.18 : 1, ["--c" as string]: pcolor(factions[id]?.color) }}>
              <polyline points={pts} className={styles.line} />
              <circle cx={x(at)} cy={y(value(at, id))} r={4} className={styles.dot} />
              {/* Player colours are the game's and some sit close (blue, purple), so the highlighted line also carries its name. */}
              {focus === id ? <text x={x(last) - 4} y={y(value(last, id)) - 8} className={styles.axis} textAnchor="end">{short(id)}</text> : null}
            </g>
          );
        })}
      </svg>
      <p className={kit.label}>{roundName(at, last)}: {unit}</p>
      {/* The legend: identity is never colour alone. Tapping a player highlights their line. */}
      <Choices list label="Highlight a player" hideLabel value={focus ?? "all"} onChange={(v) => setFocus(v === "all" ? undefined : (v as FactionId))}
        options={[{ value: "all", label: "Everyone" }, ...atValues.map(({ id, v }) => ({ value: id as string, name: `${short(id)}: ${v} ${unit}`,
          label: <span className={kit.line} style={{ width: "100%", gap: 8 }}><Swatch faction={id} color={factions[id]?.color} small /><span className={kit.grow}>{short(id)}</span><span className={kit.num}>{v}</span></span> }))]} />
      <Choices label="Rounds" hideLabel value={String(at)} onChange={(v) => setAt(Number(v))}
        options={rounds.map((r) => ({ value: String(r), label: roundName(r, last) }))} />
      <Button kind="quiet" onClick={() => setTable(!table)}>{table ? "Hide the table" : "Show as a table"}</Button>
      {table ? (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Player</th>{rounds.map((r) => <th key={r} scope="col">{r === 0 ? "Start" : r}</th>)}</tr></thead>
            <tbody>{ids.map((id) => <tr key={id}><th scope="row">{short(id)}</th>{rounds.map((r) => <td key={r}>{value(r, id)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function MapByRound({ replay, ctx }: { replay: Replay; ctx: Ctx }) {
  const options = useOptions();
  const rounds = Object.keys(replay.rounds).map(Number).sort((a, b) => a - b);
  const last = rounds.at(-1) ?? 0;
  const [chosen, setAt] = useState<Optional<number>>();
  const at = chosen ?? last;
  const round = replay.rounds[at];
  const ordered = Object.values(ctx.factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Choices label="At the end of" hideLabel value={String(at)} onChange={(v) => setAt(Number(v))}
        options={rounds.map((r) => ({ value: String(r), label: roundName(r, last) }))} />
      {round?.mapString ? (
        <div className={styles.board}>
          <div className={styles.boardInner}>
            <GameMap key={at} defaultOverlay="OWNERS" hideLegend factions={ordered} mapString={round.mapString} mapStyle={options["map-style"] ?? "standard"}
              wormholeNexus={getWormholeNexusSystemNumber(options, round.planets, ctx.factions)} planets={round.planets} systems={round.systems} expansions={options.expansions} />
          </div>
        </div>
      ) : <p className={kit.sub}>This game has no map string, so there's no map to show.</p>}
      <p className={kit.sub}>Planets are drawn in their owner's colour.</p>
    </div>
  );
}

// Time per player from upstream's timers (the active player's turns), with the
// replay's turn count and longest turn once it's in.
function TimeView({ replay, ctx }: { replay?: Replay; ctx: Ctx }) {
  const { factions, short } = ctx;
  const timers = useTimers();
  const ids = Object.values(factions).filter((f): f is Faction => !!f).map((f) => f.id).sort((a, b) => (timers[b] ?? 0) - (timers[a] ?? 0));
  const max = Math.max(1, ...ids.map((id) => timers[id] ?? 0));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className={kit.sub}>Game clock: <span className={kit.num}>{fmtDuration((timers.game ?? 0) * 1000)}</span>. Each player's time is the time it was their turn.</p>
      <ul className={styles.bars} aria-label="Time per player">
        {ids.map((id) => {
          const t = timers[id] ?? 0;
          const d = replay?.timerData[id];
          return (
            <li key={id} style={{ ["--c" as string]: pcolor(factions[id]?.color) }}>
              <span className={kit.line} style={{ gap: 8 }}><Swatch faction={id} color={factions[id]?.color} small /><b className={kit.grow}>{short(id)}</b><span className={kit.num}>{fmtDuration(t * 1000)}</span></span>
              <span className={styles.barTrack}><i style={{ width: `${(t / max) * 100}%` }} /></span>
              {d ? <span className={cx(kit.sub)}>{d.numTurns} turns · longest {fmtDuration(d.longestTurn * 1000)}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
