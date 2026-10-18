"use client";
// Points outside the status phase's scoring card: secrets scored in the action
// or agenda phase, Support for the Throne changing hands mid-round, and points
// adjusted by hand (Shawn's list: "manual VP"). In the group's replayed game,
// 4 secrets and 4 Support for the Throne moves happened outside the status phase.
import { useState } from "react";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import { Button, Chip, Choices, kit, RowLink, Sheet, Stepper } from "../ui/kit";
import { scorableSecrets, throneHolder } from "./logic";
import type { Ctx } from "./ui";

const SECRET_PHASES: Record<string, string> = { ACTION: "action", AGENDA: "agenda", STATUS: "status" };

export function PointsButton({ ctx }: { ctx: Ctx }) {
  return <RowLink onClick={() => ctx.open({ kind: "points" })} title="Points changed?" detail="Secrets, Support for the Throne, other points" />;
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
  const n = Math.abs(delta), pts = `${n} point${n === 1 ? "" : "s"}`;
  const adjust = async () => {
    if (!who || !delta) return;
    if (await w.write([Events.ManualVPUpdateEvent(who, delta)], `${short(who)} ${delta > 0 ? "gained" : "lost"} ${pts} by hand`, who)) close();
  };
  return (
    <Sheet title="Points changed" close={close}>
      <Choices label="Whose points changed?" value={who} onChange={(v) => setWho(v as FactionId)}
        options={order.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small player={false} /> }))} />
      {who ? (
        <>
          <div className={kit.section}>
            <p className={kit.label}>What happened?</p>
            <div className={kit.rows}>
              {secretPhase ? (
                <RowLink onClick={() => open({ kind: "score", faction: who, which: "secret", phase })}
                  title={`${short(who)} scored a secret`} detail={`${secrets} ${secretPhase}-phase secret${secrets === 1 ? "" : "s"} nobody has scored`} />
              ) : null}
              <RowLink onClick={() => open({ kind: "give", giver: who })}
                title={`${short(who)}'s Support for the Throne`} detail={holder ? `${short(holder)} holds it; move it or take it back` : "Give it to someone"} />
            </div>
          </div>
          <div className={kit.section} aria-label="By hand" role="group">
            <p className={kit.label}>Any other point</p>
            <p className={kit.sub}>For points the app doesn't count by itself, such as some agendas, relics or cards. They show as adjustments in the player's points.</p>
            {/* Steps of one, up to 3 either way, skipping 0. */}
            <Stepper value={delta} min={-3} max={3} less="One fewer" more="One more" onChange={(v) => setDelta(v === 0 ? (v > delta ? 1 : -1) : v)} format={(v) => (v > 0 ? `+${v}` : `${v}`)} />
            <p className={kit.confirm}>{short(who)} {delta > 0 ? "gains" : "loses"} {pts} by hand?</p>
            <Button kind="primary" block disabled={w.pending} onClick={adjust}>{delta > 0 ? "Add" : "Take away"} {pts}</Button>
          </div>
        </>
      ) : <p className={kit.sub}>Choose the player.</p>}
    </Sheet>
  );
}
