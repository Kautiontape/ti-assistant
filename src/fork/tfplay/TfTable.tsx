"use client";
// Twilight's Fall pieces of /play's other screens: the tyrant on the Table
// tab, the end of the status phase (into the edict phase, or straight to the
// next round without a tyrant), and the inaugural splice during setup.
import { useState } from "react";
import { useOptions } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { useGameState, useTyrant } from "../../context/stateDataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import type { Ctx } from "../play/ui";
import { Button, Chip, kit, RowLink, Rows, Swatch } from "../ui/kit";
import { ownedBy, TfCardsSheet } from "./TfCards";
import { isTwilightsFall } from "./tf";
import { useTfCards } from "./TfThings";

export function TyrantCard({ ctx }: { ctx: Ctx }) {
  const options = useOptions();
  const tyrant = useTyrant();
  if (!isTwilightsFall(options)) return null;
  return (
    <section className={kit.card} aria-label="Tyrant">
      <p className={kit.eyebrow}><span>Tyrant</span><span>Benediction token</span></p>
      {tyrant ? <Chip faction={tyrant} factions={ctx.factions} short={ctx.short} /> : <p className={kit.sub}>Nobody holds the benediction token. Tyrannus&apos; primary gives it out.</p>}
      <p className={kit.sub}>{tyrant ? "The tyrant resolves an edict in the edict phase." : "Without a tyrant, the round skips the edict phase."}</p>
    </section>
  );
}

// The status phase's last step. Upstream's StatusPhase.tsx: with a tyrant the
// edict phase follows; without one the next round starts.
export function TfStatusFinish({ ctx }: { ctx: Ctx }) {
  const { w, short } = ctx;
  const tyrant = useTyrant();
  const { round } = useGameState();
  if (tyrant) {
    return (
      <>
        <Button kind="primary" size="tall" block disabled={w.pending} onClick={() => w.write([Events.AdvancePhaseEvent()], "The edict phase started")}>Start the edict phase</Button>
        <p className={kit.sub}>{short(tyrant)} is the tyrant and resolves an edict.</p>
      </>
    );
  }
  return (
    <>
      <p className={kit.sub}>Nobody is the tyrant, so there&apos;s no edict phase this round.</p>
      <Button kind="primary" size="tall" block disabled={w.pending} onClick={() => w.write([Events.AdvancePhaseEvent(true)], `Round ${round + 1} started`)}>Start round {round + 1}</Button>
    </>
  );
}

// Setup step 13, the inaugural splice: each player keeps 3 abilities, 2 unit
// upgrades and 2 genomes, one less of any for each King technology they start with.
const INAUGURAL = { ABILITY: 3, GENOME: 2, UNIT_UPGRADE: 2 } as const;

export function TfSetupCard({ ctx }: { ctx: Ctx }) {
  const options = useOptions();
  const { byType } = useTfCards();
  const order = useOrderedFactionIds("SPEAKER");
  const [editing, setEditing] = useState<Optional<FactionId>>();
  if (!isTwilightsFall(options)) return null;
  const { factions, short } = ctx;
  const counts = (id: FactionId) => Object.fromEntries(ownedBy(byType, id).map((g) => [g.type, g.cards.length])) as Record<string, number>;
  const done = order.filter((id) => { const c = counts(id); return c.ABILITY! >= INAUGURAL.ABILITY && c.GENOME! >= INAUGURAL.GENOME && c.UNIT_UPGRADE! >= INAUGURAL.UNIT_UPGRADE; }).length;
  return (
    <section className={kit.card} aria-label="Inaugural splice">
      <p className={kit.eyebrow}><span>Inaugural splice</span><span className={kit.num}>{done} of {order.length}</span></p>
      <h2 className={kit.title}>Record each player&apos;s starting cards</h2>
      <p className={kit.sub}>Deal 3 abilities, 2 unit upgrades and 2 genomes to each player; keep one and pass the rest right until each has 3, 2 and 2. A player may keep one fewer card for each King technology they start with.</p>
      <Rows>
        {order.map((id) => {
          const c = counts(id);
          return (
            <RowLink key={id} onClick={() => setEditing(id)} lead={<Swatch faction={id} color={factions[id]?.color} />} title={short(id)}
              detail={`${c.ABILITY ?? 0} of 3 abilities · ${c.UNIT_UPGRADE ?? 0} of 2 upgrades · ${c.GENOME ?? 0} of 2 genomes`} />
          );
        })}
      </Rows>
      {editing ? <TfCardsSheet faction={editing} ctx={ctx} close={() => setEditing(undefined)} types={["ABILITY", "UNIT_UPGRADE", "GENOME"]} discard title={`${short(editing)}'s starting cards`} /> : null}
    </section>
  );
}
