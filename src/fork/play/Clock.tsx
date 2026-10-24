"use client";
// Upstream's game timers in /play. Upstream counts game time in the browser
// (TimerProvider) while its header's GameTimer is on screen, and the active
// player's time while their FactionTimer is; every write carries the game time,
// which the agenda timers and the results' timers read back. /play runs the same
// two timers, so a game played on /play keeps that data, and offers pause.
// Secondary timers stay off: upstream starts them once the primary is marked
// done (MARK_PRIMARY), which /play doesn't send.
import { use, useEffect } from "react";
import { TimerContext } from "../../context/contexts";
import { useActionLog, useGameId, useTimers, useViewOnly } from "../../context/dataHooks";
import { useActiveFactionId } from "../../context/gameDataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { getNthMostRecentAction } from "../../util/api/actionLog";
import { useSetGlobalPause } from "../../util/api/setPause";
import { fmtDuration } from "./logic";
import type { Ctx } from "./ui";
import { Button, kit } from "../ui/kit";

// Runs the game timer, and the active player's in the strategy and action phases.
export function useUpstreamTimers() {
  const timerFns = use(TimerContext);
  const viewOnly = useViewOnly();
  const phase = useGameState().phase;
  const active = useActiveFactionId();
  useEffect(() => {
    if (viewOnly || phase === "END") return;
    return timerFns.activateTimer("game");
  }, [viewOnly, timerFns, phase]);
  const timed = phase === "STRATEGY" || phase === "ACTION" ? active : undefined;
  useEffect(() => {
    if (viewOnly || !timed) return;
    return timerFns.activateTimer(timed);
  }, [viewOnly, timerFns, timed]);
}

export function usePause() {
  const gameId = useGameId();
  const setPause = useSetGlobalPause();
  const timers = useTimers();
  return { paused: !!timers.paused, game: (timers.game ?? 0) * 1000, faction: (id: string) => (timers[id] ?? 0) * 1000, set: (p: boolean) => setPause(gameId, p) };
}

// On Now while the clock is stopped.
export function PausedBanner({ ctx }: { ctx: Ctx }) {
  const pause = usePause();
  const viewOnly = useViewOnly();
  if (!pause.paused) return null;
  return (
    <div className={kit.banner} role="note" aria-label="Game paused">
      <span className={kit.grow}>The game clock is paused.</span>
      <Button size="small" disabled={viewOnly} onClick={() => pause.set(false)}>Resume</Button>
    </div>
  );
}

// The Table tab's clock: game time, each player's time, pause.
export function ClockCard({ ctx }: { ctx: Ctx }) {
  const { factions, short } = ctx;
  const pause = usePause();
  const viewOnly = useViewOnly();
  const ids = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.order - b.order).map((f) => f.id);
  return (
    <section className={kit.card} aria-label="Game clock">
      <p className={kit.eyebrow}><span>Game clock</span><span className={kit.num}>{fmtDuration(pause.game)}{pause.paused ? " · paused" : ""}</span></p>
      <p className={kit.sub}>{ids.map((id) => `${short(id)} ${fmtDuration(pause.faction(id))}`).join(" · ")}</p>
      <Button block disabled={viewOnly} onClick={() => pause.set(!pause.paused)}>{pause.paused ? "Resume the clock" : "Pause the clock"}</Button>
    </section>
  );
}

// Game time spent on each agenda this phase, as upstream's AgendaTimer works it
// out: from the phase's start (or the first agenda's resolve) to the resolve, or
// to now while it's open.
export function useAgendaTimes(): [number, number] {
  const log = useActionLog();
  const timers = useTimers();
  const now = timers.game ?? 0;
  const start = getNthMostRecentAction(log, "ADVANCE_PHASE", 1)?.gameSeconds ?? 0;
  // Newest first: once both are resolved, the first agenda's resolve is the 2nd most recent.
  const newest = getNthMostRecentAction(log, "RESOLVE_AGENDA", 1);
  const older = getNthMostRecentAction(log, "RESOLVE_AGENDA", 2);
  const inPhase = (e: typeof newest) => !!e && (e.gameSeconds ?? 0) >= start;
  const first = inPhase(older) ? older : inPhase(newest) ? newest : undefined;
  const second = inPhase(older) ? newest : undefined;
  const firstEnd = first?.gameSeconds ?? now;
  return [Math.max(0, firstEnd - start) * 1000, first ? Math.max(0, (second?.gameSeconds ?? now) - firstEnd) * 1000 : 0];
}
