"use client";
// Action cards played (Shawn's list: "action cards played", a new feature).
// Upstream's PLAY_ACTION_CARD handler logs any card and changes nothing
// (src/util/model/playActionCard.ts); the fork's actor field says who played it.
import { useState } from "react";
import { useActionCards, useActionLog } from "../../context/dataHooks";
import { Events } from "../../util/api/events";
import { ActionLog, Optional } from "../../util/types/types";
import { actorOf } from "./logic";
import styles from "./play.module.scss";
import { Chip, cx, SheetFrame, type Ctx } from "./ui";

// Upstream reads the target of these as the player who played them (vote tallies).
const TARGET_IS_PLAYER = new Set(["Distinguished Councilor", "Council Preserve", "Predictive Intelligence"]);
// These need another player or a choice as the target; they stay on the table screen.
const NEEDS_TARGET = new Set(["Assassinate Representative", "Ancient Burial Sites", "Engineer", "Reverse", "Thieve"]);

const TIMING_GROUPS: [string, string[]][] = [
  ["During a tactical action", ["TACTICAL_ACTION"]],
  ["Agenda phase", ["AGENDA_PHASE", "AGENDA_PHASE_START"]],
  ["Other times", ["OTHER", "MULTIPLE", "PASSIVE", "STATUS_PHASE_END"]],
];

// Cards a player has played this game: recorded plays, and action cards used as component actions.
export function playedActionCards(log: ActionLog, factionId: FactionId, cardNames: Set<string>) {
  const out: string[] = [];
  for (const e of [...log].reverse()) {
    const d = e.data as unknown as { action: string; event: { card?: string; target?: string; name?: string; factionId?: string } };
    if (d.action === "PLAY_ACTION_CARD" && d.event.card) {
      const actor = actorOf(e);
      const who = actor ? actor.as ?? actor.seat : TARGET_IS_PLAYER.has(d.event.card) ? d.event.target : undefined;
      if (who === factionId) out.push(d.event.card);
    }
    if (d.action === "PLAY_COMPONENT" && d.event.factionId === factionId && d.event.name && cardNames.has(d.event.name)) out.push(d.event.name);
  }
  return out;
}

export function ActionCardButton({ ctx }: { ctx: Ctx }) {
  return (
    <button className={cx(styles.btn, styles.block)} onClick={() => ctx.open({ kind: "actionCard" })}>
      Played an action card?<small>Record who played which card</small>
    </button>
  );
}

export function ActionCardSheet({ faction, close, ctx }: { faction?: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, w, seat, helping } = ctx;
  const actionCards = useActionCards();
  const log = useActionLog();
  const [who, setWho] = useState<Optional<FactionId>>(faction ?? helping ?? seat);
  const [q, setQ] = useState("");
  const order = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.order - b.order).map((f) => f.id);
  const cards = Object.values(actionCards).filter((c): c is ActionCard => !!c && c.timing !== "COMPONENT_ACTION" && !NEEDS_TARGET.has(c.name))
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const record = async (card: ActionCard) => {
    if (!who) return;
    const target = TARGET_IS_PLAYER.has(card.name) ? who : "None";
    if (await w.write([Events.PlayActionCardEvent(card.name, target)], `${short(who)} played ${card.name}`, who)) close();
  };
  const recent = who ? playedActionCards(log, who, new Set(Object.values(actionCards).map((c) => c?.name ?? ""))).slice(-3).reverse() : [];
  return (
    <SheetFrame title="Record an action card" close={close}>
      <p className={styles.eyebrow}><span>Who played it?</span></p>
      <div className={styles.pick}>
        {order.map((id) => (
          <button key={id} aria-pressed={who === id} onClick={() => setWho(id)}><Chip faction={id} factions={factions} short={short} small player={false} /></button>
        ))}
      </div>
      {who && recent.length ? <p className={styles.sub}>{short(who)} played earlier: {recent.join(", ")}</p> : null}
      <input className={styles.search} type="search" placeholder="Find the card" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find the card" />
      {TIMING_GROUPS.map(([label, timings]) => {
        const group = cards.filter((c) => timings.includes(c.timing));
        if (!group.length) return null;
        return (
          <div key={label}>
            <p className={styles.eyebrow}><span>{label}</span></p>
            {group.map((c) => (
              <button key={c.id} className={styles.opt} disabled={w.pending || !who} onClick={() => record(c)}>
                <span style={{ display: "grid", textAlign: "left", gap: 2 }}><b>{c.name}</b><span className={styles.sub}>{c.description}</span></span>
              </button>
            ))}
          </div>
        );
      })}
      <p className={styles.sub}>
        Cards that are an ACTION are recorded as a component action. Assassinate Representative and Ancient Burial Sites name another player, so they stay on the table screen.
      </p>
    </SheetFrame>
  );
}
