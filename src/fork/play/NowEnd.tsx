"use client";
// The end of the game: a banner when someone reaches the target, and the
// game-over screen (results, points by source, time per player).
import Link from "next/link";
import { useActionLog, useOptions } from "../../context/dataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Events } from "../../util/api/events";
import { computeVPs } from "../../util/factions";
import { fmtDuration, timeByPlayer } from "./logic";
import styles from "./play.module.scss";
import { Chip, cx, pcolor, useRace, type Ctx } from "./ui";

// Who has reached the target. Upstream's header offers "End Game" on the same
// condition (normal games; alliance games link to the table screen).
export function useReachedTarget(factions: Ctx["factions"]) {
  const options = useOptions();
  const objectives = useObjectives();
  const target = options["victory-points"] ?? 10;
  const alliance = options["game-variant"]?.startsWith("alliance");
  const reached = Object.values(factions)
    .filter((f): f is Faction => !!f && computeVPs(factions, f.id, objectives) >= target)
    .map((f) => f.id);
  return { target, reached, alliance };
}

export function GameEndBanner(ctx: Ctx) {
  const { factions, short, w, gameId } = ctx;
  const { target, reached, alliance } = useReachedTarget(factions);
  if (!reached.length) return null;
  const who = reached.map((id) => short(id)).join(" and ");
  return (
    <section className={cx(styles.card, styles.hero)} aria-label="Game end">
      <p className={styles.eyebrow}><span>{target} points</span></p>
      <h2 className={styles.title}>{who} {reached.length > 1 ? "have" : "has"} {target} points</h2>
      <p className={styles.sub}>The game ends when someone reaches {target}. If a score was a mistake, fix it and keep playing.</p>
      {alliance ? (
        <Link className={cx(styles.btn, styles.block)} href={`/game/${gameId}/main`}>End the game on the table screen</Link>
      ) : (
        <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
          onClick={() => w.write([Events.EndGameEvent()], "The game ended")}>End the game</button>
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
  const winners = rows.filter((r) => r.total === top && top > 0);
  return (
    <>
      <section className={cx(styles.card, styles.hero)} style={winners[0] ? { ["--c" as string]: pcolor(factions[winners[0].id]?.color) } : undefined} aria-label="Game over">
        <p className={styles.eyebrow}><span>Game over</span></p>
        <h2 className={styles.title}>
          {winners.length === 1 ? `${short(winners[0]!.id)} wins with ${top} points` : winners.length ? `${winners.map((r) => short(r.id)).join(" and ")} tie with ${top} points` : "No points scored"}
        </h2>
      </section>
      <section className={styles.card} aria-label="Results">
        <p className={styles.eyebrow}><span>Results</span></p>
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.id}>
              <button className={styles.raceRow} style={{ alignItems: "flex-start", padding: "8px 0" }} onClick={() => open({ kind: "player", faction: r.id })} aria-label={`${short(r.id)}: ${r.total} points`}>
                <span className={styles.grow} style={{ display: "grid", gap: 4 }}>
                  <span className={styles.row}><Chip faction={r.id} factions={factions} short={short} small /><span className={styles.grow} /><span className={styles.vp}>{r.total}</span></span>
                  <span className={styles.srcs}>{r.groups.map((g) => `${g.label} ${g.points}`).join(" · ")}</span>
                  <span className={styles.srcs}>{time(r.id)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.card} aria-label="Back to the game">
        <p className={styles.sub}>Ended by mistake? This puts the game back where it was.</p>
        <button className={cx(styles.btn, styles.block)} disabled={w.pending} onClick={() => w.write([Events.ContinueGameEvent()], "The game continued")}>Back to the game</button>
      </section>
    </>
  );
}
