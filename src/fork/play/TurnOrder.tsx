"use client";
// The order players go in, as upstream's faction pages and footer show it
// (factions-section.tsx): speaker order in the setup and strategy phases,
// initiative order in the action and status phases, voting order in the agenda
// phase. The card opens on the current phase's order; the others are a tap away.
import { useState } from "react";
import { useCurrentTurn } from "../../context/dataHooks";
import { getActionCardTargets } from "../../util/actionLog";
import { votingOrder } from "./logic";
import { useCompleteOrderedFactionIds } from "../../context/gameDataHooks";
import { useGameState } from "../../context/stateDataHooks";
import styles from "./play.module.scss";
import type { Ctx } from "./ui";
import { Chip, Choices, kit } from "../ui/kit";

type Order = "SPEAKER" | "INITIATIVE" | "VOTING";
const NAMES: Record<Order, string> = { SPEAKER: "Speaker order", INITIATIVE: "Initiative order", VOTING: "Voting order" };
const DETAIL: Record<Order, string> = {
  SPEAKER: "Clockwise from the speaker: strategy card picks.",
  INITIATIVE: "By strategy card number: turns in the action phase, and the status phase's steps.",
  VOTING: "From the speaker's left, the speaker last; the Argent Flight vote first.",
};
const forPhase = (phase: string): Order => (phase === "ACTION" || phase === "STATUS" ? "INITIATIVE" : phase === "AGENDA" ? "VOTING" : "SPEAKER");

export function TurnOrderCard({ ctx }: { ctx: Ctx }) {
  const state = useGameState();
  const [order, setOrder] = useState<Order>();
  const shown = order ?? forPhase(state.phase);
  const speaker = useCompleteOrderedFactionIds("SPEAKER");
  const initiative = useCompleteOrderedFactionIds("INITIATIVE");
  const currentTurn = useCurrentTurn();
  const ids = shown === "SPEAKER" ? speaker : shown === "INITIATIVE" ? initiative : votingOrder(ctx.factions, state.speaker, getActionCardTargets(currentTurn, "Hack Election").length > 0);
  if (state.phase === "END") return null;
  return (
    <section className={kit.card} aria-label="Turn order">
      <p className={kit.eyebrow}><span>{NAMES[shown]}</span></p>
      <Choices label="Which order" hideLabel value={shown} onChange={setOrder} options={(Object.keys(NAMES) as Order[]).map((o) => ({ value: o, label: NAMES[o].replace(" order", "") }))} />
      <ol className={styles.list} aria-label={NAMES[shown]}>
        {ids.map((id, i) => (
          <li key={id}><span className={kit.num}>{i + 1}</span><Chip faction={id} factions={ctx.factions} short={ctx.short} small player={false} /></li>
        ))}
      </ol>
      <p className={kit.sub}>{DETAIL[shown]}</p>
    </section>
  );
}
