"use client";
// Pieces shared by the /play screens: types, chips, banners, sheets and clocks.
import { useEffect, useState } from "react";
import FactionIcon from "../../components/FactionIcon/FactionIcon";
import { ActionLog, Optional } from "../../util/types/types";
import styles from "./play.module.scss";
import type { useWrite } from "./useWrite";

export const PHASES: Record<string, string> = { SETUP: "Setup", STRATEGY: "Strategy", ACTION: "Action", STATUS: "Status", AGENDA: "Agenda", END: "Game over" };
export const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
export const pcolor = (c?: string) => `var(--p-${(c ?? "black").toLowerCase()})`;

export type Sheet =
  | { kind: "seat" }
  | { kind: "claim"; faction: FactionId }
  | { kind: "pass"; faction: FactionId }
  | { kind: "player"; faction: FactionId }
  | { kind: "card"; card: StrategyCardId; pickFor?: FactionId }
  | { kind: "score"; faction: FactionId; which: "public" | "secret" }
  | { kind: "give"; giver: FactionId }
  | { kind: "reveal"; as?: FactionId }
  | { kind: "agenda"; as?: FactionId }
  | { kind: "vote"; faction: FactionId }
  | { kind: "resolve"; as?: FactionId };

export type Ctx = {
  factions: Partial<Record<FactionId, Faction>>;
  short: (id: Optional<string>) => string;
  isFaction: (id: string) => boolean;
  subject: (e: ActionLogEntry<GameUpdateData>) => Optional<FactionId>;
  describe: (entries: ActionLog) => string;
  seat: Optional<FactionId>;
  helping: Optional<FactionId>;
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

export function Swatch({ faction, color, small, large }: { faction: FactionId; color?: string; small?: boolean; large?: boolean }) {
  const size = small ? 14 : large ? 26 : 19;
  return (
    <span className={cx(styles.sw, small && styles.swSmall, large && styles.swLarge)} data-c={color} style={{ ["--c" as string]: pcolor(color) }}>
      <FactionIcon factionId={faction} size={size} />
    </span>
  );
}

export function Chip({ faction, factions, short, small, large, player = true }: { faction: FactionId; factions: Ctx["factions"]; short: Ctx["short"]; small?: boolean; large?: boolean; player?: boolean }) {
  const f = factions[faction];
  return (
    <span className={styles.chip}>
      <Swatch faction={faction} color={f?.color} small={small} large={large} />
      <span className={styles.chipName}>{short(faction)}</span>
      {player && f?.playerName ? <span className={styles.chipPlayer}>{f.playerName}</span> : null}
    </span>
  );
}

export function HelpBanner({ who, short, stop }: { who: FactionId; short: Ctx["short"]; stop: () => void }) {
  return (
    <div className={styles.banner}>
      <span className={styles.grow}>You're helping <b>{short(who)}</b>. Everything you do is logged as you, for {short(who)}.</span>
      <button className={cx(styles.btn, styles.smallBtn)} onClick={stop}>Stop</button>
    </div>
  );
}

export function SheetFrame({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.scrim} onClick={(e) => e.target === e.currentTarget && close()}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className={styles.close} onClick={close} aria-label="Close">✕</button></header>
        {children}
      </section>
    </div>
  );
}
