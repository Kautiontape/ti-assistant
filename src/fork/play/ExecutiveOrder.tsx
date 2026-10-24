"use client";
// Executive Order: a whole agenda inside the action. Follows upstream's
// ComponentActions/ExecutiveOrder.tsx: reveal an agenda, the cards before voting
// (and Covert Legislation's outcomes), start voting, cast votes (the votes each
// player has are asked for, not looked up), resolve. The player who took the
// action stands in for the speaker. The pieces come from the agenda screen.
import { getActionCardTargets, getLogEntries } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { votingOrder } from "./logic";
import { BeforeVotingRows } from "./AgendaCards";
import { canVote, outcomeLabel, useAgendaData } from "./agendaData";
import { CovertOutcomes, ResolveCard, VoteForm, VotesCard } from "./NowAgenda";
import styles from "./play.module.scss";
import type { Ctx } from "./ui";
import { Button, cx, kit, pcolor } from "../ui/kit";

export default function ExecutiveOrder({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { w, open, factions, seat, helping } = ctx;
  const real = useAgendaData();
  // Whoever took the action reads out and resolves the agenda.
  const d = { ...real, speaker: active };
  const { agenda, currentTurn } = d;
  const resolved = getLogEntries<ResolveAgendaData>(currentTurn, "RESOLVE_AGENDA")[0];

  if (resolved) {
    const done = d.agendas[resolved.data.event.agenda];
    return (
      <section className={kit.card} aria-label="Executive Order agenda">
        <p className={kit.eyebrow}><span>Executive Order · resolved</span></p>
        <h2 className={kit.title}>{done?.name ?? resolved.data.event.agenda}</h2>
        <p className={kit.sub}><b>{outcomeLabel(d, ctx, resolved.data.event.target)}.</b> {done?.description}</p>
      </section>
    );
  }

  if (!agenda) {
    return (
      <section className={kit.card} aria-label="Executive Order agenda">
        <p className={kit.eyebrow}><span>Executive Order</span></p>
        <p className={kit.sub}>Reveal the top agenda. Everyone votes on it now, then it resolves.</p>
        <Button kind="primary" size="tall" block disabled={w.pending} onClick={() => open({ kind: "agenda", as: active })}>Reveal the agenda</Button>
      </section>
    );
  }

  const order = votingOrder(factions, active, getActionCardTargets(currentTurn, "Hack Election").length > 0);
  const who = helping ?? seat;
  return (
    <>
      <section className={kit.card} aria-label="Executive Order agenda">
        <p className={kit.eyebrow}><span>Executive Order · {agenda.type === "LAW" ? "Law" : "Directive"}</span>
          {!d.state.votingStarted ? <Button kind="quiet" disabled={w.pending} onClick={() => w.write([Events.HideAgendaEvent(agenda.id)], `Took back ${agenda.name}`, active)}>Take it back</Button> : null}
        </p>
        <h2 className={kit.title}>{agenda.name}</h2>
        <p className={kit.sub}>{agenda.description}</p>
      </section>
      {!d.state.votingStarted ? (
        <>
          {d.covert ? <CovertOutcomes d={d} ctx={ctx} /> : null}
          <section className={kit.card} aria-label="Before voting">
            <p className={kit.eyebrow}><span>Before voting</span></p>
            <BeforeVotingRows ctx={ctx} />
            {d.covert && !d.outcomes ? <p className={kit.sub}>Voting starts once the hidden agenda's outcomes are read out.</p> : null}
            <Button kind="primary" size="tall" block disabled={w.pending || (d.covert && !d.outcomes)}
              onClick={() => w.write([Events.StartVotingEvent()], "Voting started")}>Start voting</Button>
          </section>
        </>
      ) : (
        <>
          {who && !d.votes.has(who) && canVote(d, ctx, who) ? (
            <section className={cx(kit.card, styles.hero)} style={{ ["--c" as string]: pcolor(factions[who]?.color) }} aria-label="Your vote">
              <VoteForm d={d} ctx={ctx} faction={who} />
            </section>
          ) : null}
          <VotesCard d={d} ctx={ctx} order={order} />
          <ResolveCard d={d} ctx={ctx} order={order} />
        </>
      )}
    </>
  );
}
