"use client";
// The end of the game: a banner when someone reaches the target, and the
// game-over screen (results, points by source, time per player).
import { useState } from "react";
import { useActionLog, useOptions } from "../../context/dataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Events } from "../../util/api/events";
import { computeVPs } from "../../util/factions";
import { useCompleteOrderedFactionIds } from "../../context/gameDataHooks";
import { combats as combatsOf, fmtDuration, timeByPlayer } from "./logic";
import styles from "./play.module.scss";
import { useRace, type Ctx } from "./ui";
import { Button, Chip, cx, kit, pcolor, RowLink, Rows } from "../ui/kit";

// Upstream's results page (points and technologies by round, map lapse, timers).
export function ResultsRow({ open }: Pick<Ctx, "open">) {
  return <Rows><RowLink onClick={() => open({ kind: "results" })} title="How the game went" detail="Points and technology by round, the map by round, time per player" /></Rows>;
}

// Who has reached the target. Upstream's header offers "End Game" on the same
// condition (normal games; alliance games link to the table screen).
export function useReachedTarget(factions: Ctx["factions"]) {
  const options = useOptions();
  const objectives = useObjectives();
  const target = options["victory-points"] ?? 10;
  const alliance = options["game-variant"]?.startsWith("alliance");
  const points = (id: FactionId) => computeVPs(factions, id, objectives);
  // Most points first; a tie goes to the earliest in initiative order (TI4's rule
  // for players reaching the target together).
  const initiative = useCompleteOrderedFactionIds("INITIATIVE");
  const reached = Object.values(factions)
    .filter((f): f is Faction => !!f && points(f.id) >= target)
    .map((f) => f.id)
    .sort((a, b) => points(b) - points(a) || initiative.indexOf(a) - initiative.indexOf(b));
  return { target, reached, alliance, points };
}

export function GameEndBanner(ctx: Ctx) {
  const { factions, short, w, gameId } = ctx;
  const { target, reached, alliance, points } = useReachedTarget(factions);
  const [asking, setAsking] = useState(false);
  if (!reached.length) return null;
  const who = reached.map((id) => short(id)).join(" and ");
  const top = points(reached[0]!);
  return (
    <section className={cx(kit.card, styles.hero)} aria-label="Game end">
      <p className={kit.eyebrow}><span>{target} points</span></p>
      <h2 className={kit.title}>{reached.length > 1 ? `${who} have ${target} points or more` : `${who} has ${top} point${top === 1 ? "" : "s"}`}</h2>
      <p className={kit.sub}>The game ends when someone reaches {target}. If a score was a mistake, fix it and keep playing.</p>
      {alliance ? (
        <Rows><RowLink href={`/game/${gameId}/main`} external title="End the game on the table screen" /></Rows>
      ) : (
        asking ? (
          <>
            <p className={kit.confirm}>End the game with {short(reached[0]!)} the winner on {top} points{reached.length > 1 && points(reached[1]!) === top ? `, ahead of ${short(reached[1]!)} on initiative` : ""}?</p>
            <div className={kit.buttons}>
              <Button kind="primary" disabled={w.pending} onClick={() => w.write([Events.EndGameEvent()], "The game ended")}>End the game</Button>
              <Button onClick={() => setAsking(false)}>Keep playing</Button>
            </div>
          </>
        ) : <Button kind="primary" size="tall" block disabled={w.pending} onClick={() => setAsking(true)}>End the game</Button>
      )}
    </section>
  );
}

export default function NowEnd(ctx: Ctx) {
  const { factions, short, w, open } = ctx;
  const rows = useRace(factions);
  const log = useActionLog();
  const { turns, fights } = timeByPlayer(log);
  const time = (id: FactionId) => {
    const t = turns[id] ?? 0, c = fights[id] ?? 0;
    if (!t && !c) return "No time recorded";
    return `${fmtDuration(t * 1000)} on turns and decisions${c ? ` · ${fmtDuration(c * 1000)} in combat` : ""}`;
  };
  const top = rows[0]?.total ?? 0;
  const initiative = useCompleteOrderedFactionIds("INITIATIVE");
  // Tied on points: the earliest in initiative order wins, as when ending the game.
  const winners = rows.filter((r) => r.total === top && top > 0).sort((a, b) => initiative.indexOf(a.id) - initiative.indexOf(b.id));
  return (
    <>
      <section className={cx(kit.card, styles.hero)} style={winners[0] ? { ["--c" as string]: pcolor(factions[winners[0].id]?.color) } : undefined} aria-label="Game over">
        <p className={kit.eyebrow}><span>Game over</span></p>
        <h2 className={kit.title}>
          {winners.length === 1 ? `${short(winners[0]!.id)} wins with ${top} points` : winners.length ? `${short(winners[0]!.id)} wins on initiative, tied with ${winners.slice(1).map((r) => short(r.id)).join(" and ")} on ${top} points` : "No points scored"}
        </h2>
      </section>
      <section className={kit.card} aria-label="Results">
        <p className={kit.eyebrow}><span>Results</span></p>
        <Rows flush>
          {rows.map((r) => (
            <RowLink key={r.id} onClick={() => open({ kind: "player", faction: r.id })} label={`${short(r.id)}: ${r.total} points`}
              title={<Chip faction={r.id} factions={factions} short={short} small />}
              detail={<span style={{ display: "grid", gap: 2 }}><span className={styles.srcs}>{r.groups.map((g) => `${g.label} ${g.points}`).join(" · ")}</span><span className={styles.srcs}>{time(r.id)}</span></span>}
              end={<span className={styles.vp}>{r.total}</span>} />
          ))}
        </Rows>
        <ResultsRow open={open} />
      </section>
      <CombatSummary {...ctx} />
      <section className={kit.card} aria-label="Back to the game">
        <p className={kit.sub}>Ended by mistake? This puts the game back where it was.</p>
        <Button block disabled={w.pending} onClick={() => w.write([Events.ContinueGameEvent()], "The game continued")}>Back to the game</Button>
      </section>
    </>
  );
}

// Task 4's end-of-game summary, from the fork's own combat events: fights per
// player with wins, losses and no-winner results, and the longest combat.
function CombatSummary({ factions, short, open }: Ctx) {
  const log = useActionLog();
  const { fights } = timeByPlayer(log);
  const all = combatsOf(log).filter((c) => c.end !== undefined);
  if (!all.length) return null;
  const ids = Object.values(factions).filter((f): f is Faction => !!f).map((f) => f.id)
    .map((id) => {
      const mine = all.filter((c) => c.attacker === id || c.defender === id);
      return { id, n: mine.length, won: mine.filter((c) => c.winner === id).length, none: mine.filter((c) => c.winner === "None" || c.winner === undefined).length, time: fights[id] ?? 0 };
    })
    .filter((r) => r.n)
    .sort((a, b) => b.n - a.n || b.won - a.won);
  const longest = [...all].sort((a, b) => (b.end! - b.start) - (a.end! - a.start))[0]!;
  const where = (c: typeof longest) => (c.kind === "space" ? "in space" : `on the ground${c.planet ? ` on ${c.planet}` : ""}`);
  return (
    <section className={kit.card} aria-label="Combats">
      <p className={kit.eyebrow}><span>Combats</span><span className={kit.num}>{all.length}</span></p>
      <Rows flush>
        {ids.map((r) => (
          <RowLink key={r.id} onClick={() => open({ kind: "player", faction: r.id })} label={`${short(r.id)}: ${r.n} combats`}
            title={<Chip faction={r.id} factions={factions} short={short} small player={false} />}
            detail={`${r.n} fought · ${r.won} won · ${r.n - r.won - r.none} lost${r.none ? ` · ${r.none} no winner` : ""} · ${fmtDuration(r.time * 1000)}`} />
        ))}
      </Rows>
      <p className={kit.sub}>Longest: {short(longest.attacker)} against {short(longest.defender)} {where(longest)}, {fmtDuration(longest.end! - longest.start)}{longest.winner && longest.winner !== "None" ? `, won by ${short(longest.winner)}` : ", no winner"}.</p>
    </section>
  );
}

