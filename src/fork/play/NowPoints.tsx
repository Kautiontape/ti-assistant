"use client";
// Points outside the status phase's scoring card: secrets scored in the action
// or agenda phase, Support for the Throne changing hands mid-round, and points
// adjusted by hand (Shawn's list: "manual VP"). In the group's replayed game,
// 4 secrets and 4 Support for the Throne moves happened outside the status phase.
import { useState } from "react";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import { scorableSecrets, throneHolder } from "./logic";
import styles from "./play.module.scss";
import { Chip, cx, SheetFrame, type Ctx } from "./ui";

const SECRET_PHASES: Record<string, string> = { ACTION: "action", AGENDA: "agenda", STATUS: "status" };

export function PointsButton({ ctx }: { ctx: Ctx }) {
  return (
    <button className={cx(styles.btn, styles.block)} onClick={() => ctx.open({ kind: "points" })}>
      Points changed?<small>Secrets, Support for the Throne, other points</small>
    </button>
  );
}

export function PointsSheet({ phase, close, ctx }: { phase: string; close: () => void; ctx: Ctx }) {
  const { factions, short, w, seat, helping, open } = ctx;
  const objectives = useObjectives();
  const [who, setWho] = useState<Optional<FactionId>>(helping ?? seat);
  const [delta, setDelta] = useState(1);
  const order = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.order - b.order).map((f) => f.id);
  const secretPhase = SECRET_PHASES[phase];
  const secrets = secretPhase ? scorableSecrets(objectives, phase).length : 0;
  const holder = who ? throneHolder(objectives, who) : undefined;
  const adjust = async () => {
    if (!who || !delta) return;
    const label = `${short(who)} ${delta > 0 ? "gained" : "lost"} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} by hand`;
    if (await w.write([Events.ManualVPUpdateEvent(who, delta)], label, who)) close();
  };
  return (
    <SheetFrame title="Whose points changed?" close={close}>
      <div className={styles.pick}>
        {order.map((id) => (
          <button key={id} aria-pressed={who === id} onClick={() => setWho(id)}><Chip faction={id} factions={factions} short={short} small player={false} /></button>
        ))}
      </div>
      {who ? (
        <>
          {secretPhase ? (
            <button className={cx(styles.btn, styles.block)} onClick={() => open({ kind: "score", faction: who, which: "secret", phase })}>
              {short(who)} scored a secret<small>{secrets} {secretPhase}-phase secret{secrets === 1 ? "" : "s"} nobody has scored</small>
            </button>
          ) : null}
          <button className={cx(styles.btn, styles.block)} onClick={() => open({ kind: "give", giver: who })}>
            {short(who)}'s Support for the Throne<small>{holder ? `${short(holder)} holds it; move it or take it back` : "Give it to someone"}</small>
          </button>
          <section className={styles.card} style={{ background: "var(--bg)" }} aria-label="By hand">
            <p className={styles.eyebrow}><span>Any other point</span></p>
            <p className={styles.sub}>For points the app doesn't count by itself, such as some agendas, relics or cards. They show as adjustments in the player's points.</p>
            <div className={styles.stepper}>
              <button aria-label="One fewer" disabled={delta <= -3} onClick={() => setDelta(delta - 1 || -1)}>−</button>
              <output className={styles.num}>{delta > 0 ? `+${delta}` : delta}</output>
              <button aria-label="One more" disabled={delta >= 3} onClick={() => setDelta(delta + 1 || 1)}>+</button>
            </div>
            <p className={styles.title} style={{ fontWeight: 400 }}>{short(who)} {delta > 0 ? "gains" : "loses"} {Math.abs(delta)} point{Math.abs(delta) === 1 ? "" : "s"} by hand?</p>
            <button className={cx(styles.btn, styles.primary, styles.block)} disabled={w.pending} onClick={adjust}>{delta > 0 ? "Add" : "Take away"} {Math.abs(delta)} point{Math.abs(delta) === 1 ? "" : "s"}</button>
          </section>
        </>
      ) : <p className={styles.sub}>Choose the player.</p>}
    </SheetFrame>
  );
}
