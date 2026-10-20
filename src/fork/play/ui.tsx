"use client";
// Pieces shared by the /play screens: types, banners and clocks. The controls
// themselves are the fork's kit (src/fork/ui/kit.tsx).
import { useEffect, useMemo, useState } from "react";
import { useObjectives } from "../../context/objectiveDataHooks";
import { pointsBySource } from "./logic";
import { ActionLog, Optional } from "../../util/types/types";
import { Button, kit, Sheet as KitSheet } from "../ui/kit";
import type { useWrite } from "./useWrite";
import type { AgendaCardKind } from "./AgendaCards";

export { Chip, cx, pcolor, Swatch } from "../ui/kit";
// Older name for the kit's Sheet.
export const SheetFrame = KitSheet;

export const PHASES: Record<string, string> = { SETUP: "Setup", STRATEGY: "Strategy", ACTION: "Action", STATUS: "Status", AGENDA: "Agenda", END: "Game over" };

export type Sheet =
  | { kind: "seat" }
  | { kind: "unlock" }
  | { kind: "setupChoice"; faction: FactionId }
  | { kind: "agendaCard"; card: AgendaCardKind }
  | { kind: "claim"; faction: FactionId }
  | { kind: "pass"; faction: FactionId }
  | { kind: "player"; faction: FactionId }
  | { kind: "card"; card: StrategyCardId; pickFor?: FactionId }
  | { kind: "score"; faction: FactionId; which: "public" | "secret"; anyPhase?: boolean; phase?: string }
  | { kind: "points" }
  | { kind: "expedition"; faction: FactionId }
  | { kind: "research"; faction: FactionId; follow?: boolean }
  | { kind: "component"; faction: FactionId }
  | { kind: "relic"; faction: FactionId }
  | { kind: "actionCard"; faction?: FactionId }
  | { kind: "combat"; attacker: FactionId }
  | { kind: "endCombat"; before?: string }
  | { kind: "give"; giver: FactionId }
  | { kind: "reveal"; as?: FactionId }
  | { kind: "agenda"; as?: FactionId }
  | { kind: "vote"; faction: FactionId }
  | { kind: "resolve"; as?: FactionId }
  | { kind: "system"; system: string };

export type Ctx = {
  factions: Partial<Record<FactionId, Faction>>;
  short: (id: Optional<string>) => string;
  isFaction: (id: string) => boolean;
  subject: (e: ActionLogEntry<GameUpdateData>) => Optional<FactionId>;
  describe: (entries: ActionLog) => string;
  seat: Optional<FactionId>;
  helping: Optional<FactionId>;
  // "Always show actions": a shared screen shows whoever is up's controls.
  table: boolean;
  // Whether this screen shows the controls for a player's turn or pick.
  controls: (id: Optional<FactionId>) => boolean;
  setHelping: (id: Optional<FactionId>) => void;
  w: ReturnType<typeof useWrite>;
  open: (s: Sheet) => void;
  gameId: string;
};

// Clocks and times render only in the browser: the server's clock and time zone differ.
export function useNow(ms = 1000) {
  const [now, setNow] = useState<Optional<number>>();
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function HelpBanner({ who, short, stop }: { who: FactionId; short: Ctx["short"]; stop: () => void }) {
  return (
    <div className={kit.banner}>
      <span className={kit.grow}>You're helping <b>{short(who)}</b>. Everything you do is logged as you, for {short(who)}.</span>
      <Button size="small" onClick={stop}>Stop</Button>
    </div>
  );
}

// Players by points, with points by source (the same sums as upstream's computeVPs).
export function useRace(factions: Ctx["factions"]) {
  const objectives = useObjectives();
  return useMemo(() => Object.values(factions)
    .filter((f): f is Faction => !!f)
    .map((f) => ({ id: f.id, ...pointsBySource(objectives, f.id, f.vps ?? 0) }))
    .sort((a, b) => b.total - a.total), [factions, objectives]);
}
