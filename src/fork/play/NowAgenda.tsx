"use client";
// Now, agenda phase: reveal, start voting, vote (capped at what's available),
// resolve, twice, then the next round. Vote counts, outcomes and the tally come
// from upstream's VoteBlock and AgendaPhase; laws' effects stay on the board.
import Link from "next/link";
import { useState } from "react";
import { useIntl } from "react-intl";
import { computeVotes } from "../../../app/[locale]/game/[gameId]/main/phase/agenda/AgendaPhase";
import { canFactionVote, computeRemainingVotes, getTargets, translateOutcome } from "../../components/VoteBlock/VoteBlock";
import { useActionLog, useAgendas, useAttachments, useCurrentTurn, useLeaders, useOptions, usePlanets, useStrategyCards, useTechs } from "../../context/dataHooks";
import { useNumFactions } from "../../context/factionDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useGameState, useSpeaker } from "../../context/stateDataHooks";
import { getActiveAgenda, getAllVotes } from "../../util/actionLog";
import { getCurrentPhasePreviousLogEntries } from "../../util/api/actionLog";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import { votingOrder } from "./logic";
import styles from "./play.module.scss";
import { Chip, cx, pcolor, SheetFrame, type Ctx, type Sheet } from "./ui";

const AGENDA_NAMES = ["first", "second"];

// Everything the agenda screen needs from upstream, in one place.
function useAgendaData() {
  const intl = useIntl();
  const state = useGameState();
  const agendas = useAgendas();
  const currentTurn = useCurrentTurn();
  const actionLog = useActionLog();
  const planets = usePlanets();
  const strategyCards = useStrategyCards();
  const objectives = useObjectives();
  const options = useOptions();
  const attachments = useAttachments();
  const leaders = useLeaders();
  const techs = useTechs();
  const numFactions = useNumFactions();
  const speaker = useSpeaker();
  const activeId = getActiveAgenda(currentTurn);
  const agenda = activeId ? agendas[activeId] : undefined;
  const repGov = !!agendas["Representative Government"]?.passed;
  const votes = new Map(getAllVotes(currentTurn).filter((v) => v.target).map((v) => [v.faction, v]));
  return { intl, state, agendas, currentTurn, actionLog, planets, strategyCards, objectives, options, attachments, leaders, techs, numFactions, speaker, agenda, repGov, votes };
}
type AgendaData = ReturnType<typeof useAgendaData>;

function outcomeLabel(d: AgendaData, ctx: Ctx, target: Optional<string>) {
  if (!target) return "";
  if (ctx.isFaction(target)) return ctx.short(target);
  if (target === "Abstain") return "Abstain";
  const factions = ctx.factions;
  return translateOutcome(target, d.agenda?.elect, d.planets, factions, d.objectives, d.agendas, d.strategyCards, d.intl) ?? target;
}

function available(d: AgendaData, ctx: Ctx, id: FactionId) {
  const { influence } = computeRemainingVotes(id, ctx.factions, d.planets, d.attachments, d.agendas, d.options, d.state,
    getCurrentPhasePreviousLogEntries(d.actionLog), d.leaders, d.techs);
  // Under Representative Government each player has one vote, sent as votes: 1
  // (upstream's tally skips entries with zero votes).
  return d.repGov ? 1 : influence;
}

function canVote(d: AgendaData, ctx: Ctx, id: FactionId) {
  const f = ctx.factions[id];
  return !!f && canFactionVote(f, d.agendas, d.state, d.currentTurn, d.leaders);
}

export default function NowAgenda(ctx: Ctx) {
  const { seat, helping, w, open, gameId, factions, short } = ctx;
  const d = useAgendaData();
  const { agenda, speaker, state } = d;
  const agendaNum = state.agendaNum ?? 1;
  const speakerJob = speaker === seat ? "Your job as speaker" : `${short(speaker)}'s job as speaker`;
  const help = speaker !== seat;

  if (agendaNum > 2) {
    return (
      <section className={styles.card} aria-label="Agendas done">
        <p className={styles.eyebrow}><span>Agenda phase</span></p>
        <h2 className={styles.title}>Both agendas are resolved</h2>
        <p className={styles.sub}>Ready your planets on the board, then start the next round.</p>
        <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
          onClick={() => w.write([Events.AdvancePhaseEvent()], `Round ${(state.round ?? 0) + 1} started`)}>Start round {(state.round ?? 0) + 1}</button>
      </section>
    );
  }

  if (!agenda) {
    return (
      <section className={styles.card} aria-label="Reveal an agenda">
        <p className={styles.eyebrow}><span>Agenda {agendaNum} of 2</span></p>
        <h2 className={styles.title}>Reveal the {AGENDA_NAMES[agendaNum - 1]} agenda</h2>
        <p className={styles.sub}>{speakerJob}: flip the top card of the agenda deck.</p>
        <button className={cx(styles.btn, styles.primary, styles.tall, styles.block, help && styles.help)} disabled={w.pending}
          onClick={() => open({ kind: "agenda", as: speaker })}>{help ? `Reveal for ${short(speaker)}` : "Reveal the agenda"}</button>
        {agendaNum === 1 ? <p className={styles.sub}>Maw of Worlds and Ancient Burial Sites are on the <Link href={`/game/${gameId}/main`} className={styles.textLink}>table screen</Link>.</p> : null}
      </section>
    );
  }

  const order = votingOrder(factions, speaker);
  const who = helping ?? seat;
  return (
    <>
      <AgendaCard d={d} agendaNum={agendaNum} />
      {!state.votingStarted ? (
        <section className={styles.card} aria-label="Before voting">
          <p className={styles.sub}>
            Cards played when an agenda is revealed (Veto, riders, Hack Election, Political Secret) are on the{" "}
            <Link href={`/game/${gameId}/main`} className={styles.textLink}>table screen</Link>.
          </p>
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
            onClick={() => w.write([Events.StartVotingEvent()], "Voting started")}>Start voting</button>
        </section>
      ) : (
        <>
          {who && !d.votes.has(who) && canVote(d, ctx, who) ? (
            <section className={cx(styles.card, styles.hero)} style={{ ["--c" as string]: pcolor(factions[who]?.color) }} aria-label="Your vote">
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

function AgendaCard({ d, agendaNum }: { d: AgendaData; agendaNum: number }) {
  const a = d.agenda!;
  const elect = a.elect === "For/Against" ? "For or against" : `Elect a ${a.elect.toLowerCase()}`;
  return (
    <section className={styles.card} aria-label="Agenda">
      <p className={styles.eyebrow}><span>Agenda {agendaNum} of 2 · {a.type === "LAW" ? "Law" : "Directive"}</span></p>
      <h2 className={styles.title}>{a.name}</h2>
      <p className={styles.sub}><b>{elect}.</b> {a.description}</p>
    </section>
  );
}

// The vote itself: outcome, then how many, capped at what's available.
function VoteForm({ d, ctx, faction, onDone }: { d: AgendaData; ctx: Ctx; faction: FactionId; onDone?: () => void }) {
  const { short, w, seat, factions } = ctx;
  const max = available(d, ctx, faction);
  const targets = getTargets(d.agenda, factions, d.strategyCards, d.planets, d.agendas, d.objectives, d.options, d.intl).filter((t) => t.id !== "Abstain");
  const [target, setTarget] = useState<Optional<string>>();
  const [n, setN] = useState(max);
  const [q, setQ] = useState("");
  const many = targets.length > 8;
  const shown = many ? targets.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())) : targets;
  const label = (id: string) => outcomeLabel(d, ctx, id);
  const cast = async (votes: number) => {
    const t = votes ? target! : "Abstain";
    const text = votes ? `${short(faction)} cast ${votes} vote${votes === 1 ? "" : "s"} for ${label(t)}` : `${short(faction)} abstained`;
    if (await w.write([Events.CastVotesEvent(faction, votes, 0, t)], text, faction)) onDone?.();
  };
  return (
    <>
      <p className={styles.eyebrow}><span>{faction === seat ? "Your vote" : `${short(faction)}'s vote`}</span><span className={styles.num}>{max} available</span></p>
      {many ? <input className={styles.search} type="search" placeholder="Find an outcome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an outcome" /> : null}
      <div className={styles.pick}>
        {shown.map((t) => (
          <button key={t.id} aria-pressed={target === t.id} onClick={() => setTarget(t.id)}>
            {ctx.isFaction(t.id) ? <Chip faction={t.id as FactionId} factions={factions} short={short} small player={false} /> : <b>{label(t.id)}</b>}
          </button>
        ))}
      </div>
      <div className={styles.stepper}>
        <button aria-label="One fewer vote" disabled={n <= 0} onClick={() => setN(Math.max(0, n - 1))}>−</button>
        <output aria-live="polite">{n}</output>
        <button aria-label="One more vote" disabled={n >= max} onClick={() => setN(Math.min(max, n + 1))}>+</button>
      </div>
      <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending || !target || n < 1} onClick={() => cast(n)}>
        {!target ? "Choose an outcome" : `Cast ${n} vote${n === 1 ? "" : "s"} for ${label(target)}`}
      </button>
      <button className={cx(styles.btn, styles.block)} disabled={w.pending} onClick={() => cast(0)}>Abstain</button>
      <p className={styles.sub}>
        {d.repGov ? "Representative Government: one vote each." : "The influence of your planets, less votes spent on the first agenda."} Bonus votes (Argent Flight, and cards such as Distinguished Councilor once recorded) are added to the tally.
      </p>
    </>
  );
}

function VotesCard({ d, ctx, order }: { d: AgendaData; ctx: Ctx; order: FactionId[] }) {
  const { factions, short, open } = ctx;
  const tally = computeVotes(d.agenda, d.currentTurn, d.numFactions, d.repGov);
  const eligible = order.filter((id) => canVote(d, ctx, id));
  const next = eligible.find((id) => !d.votes.has(id));
  return (
    <section className={styles.card} aria-label="Votes">
      <p className={styles.eyebrow}><span>Votes</span><span className={styles.num}>{eligible.filter((id) => d.votes.has(id)).length} of {eligible.length}</span></p>
      {Object.keys(tally).length ? (
        <div className={styles.row} style={{ flexWrap: "wrap", gap: 6 }}>
          {Object.entries(tally).map(([t, v]) => <span key={t} className={cx(styles.pill, styles.pillOn)}>{outcomeLabel(d, ctx, t)}: <b className={styles.num}>{v}</b></span>)}
        </div>
      ) : null}
      <ul className={styles.list}>
        {order.map((id) => {
          const v = d.votes.get(id);
          const can = canVote(d, ctx, id);
          return (
            <li key={id}>
              <button className={styles.raceRow} disabled={!can} onClick={() => open({ kind: "vote", faction: id })} aria-label={`${short(id)}: vote`}>
                <Chip faction={id} factions={factions} short={short} small />
                <span className={styles.grow} />
                {v ? <span className={cx(styles.pill, styles.pillOn)}>{v.target === "Abstain" || !v.votes ? "Abstained" : `${v.votes} · ${outcomeLabel(d, ctx, v.target)}`}</span>
                  : !can ? <span className={styles.sub}>Can't vote</span>
                  : id === next ? <span className={cx(styles.pill, styles.pillNow)}>Up next</span>
                  : <span className={styles.sub}>Waiting</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.sub}>Tap a player to vote for them or change their vote.</p>
    </section>
  );
}

function leadersOf(tally: Record<string, number>) {
  const max = Math.max(0, ...Object.values(tally));
  return max ? Object.keys(tally).filter((t) => tally[t] === max) : [];
}

function ResolveCard({ d, ctx, order }: { d: AgendaData; ctx: Ctx; order: FactionId[] }) {
  const { short, open, w, seat } = ctx;
  const tally = computeVotes(d.agenda, d.currentTurn, d.numFactions, d.repGov);
  const leaders = leadersOf(tally);
  const waiting = order.filter((id) => canVote(d, ctx, id) && !d.votes.has(id)).length;
  const status = !leaders.length ? "No votes yet" : leaders.length > 1 ? `Tied: ${leaders.map((t) => outcomeLabel(d, ctx, t)).join(", ")}` : `Leading: ${outcomeLabel(d, ctx, leaders[0])} with ${tally[leaders[0]!]}`;
  return (
    <section className={styles.card} aria-label="Resolve">
      <p className={styles.eyebrow}><span>Result</span></p>
      <h2 className={styles.title}>{status}</h2>
      <p className={styles.sub}>{waiting ? `${waiting} still to vote. ` : "Everyone has voted. "}{d.speaker === seat ? "Resolving is your job as speaker." : `Resolving is ${short(d.speaker)}'s job as speaker.`}</p>
      <button className={cx(styles.btn, styles.block, !waiting && styles.primary, d.speaker !== seat && styles.help)} disabled={w.pending}
        onClick={() => open({ kind: "resolve", as: d.speaker })}>{d.speaker === seat ? "Resolve the agenda" : `Resolve for ${short(d.speaker)}`}</button>
    </section>
  );
}

// ---------- sheets ----------

export function AgendaSheet({ sheet, close, ctx }: { sheet: Extract<Sheet, { kind: "agenda" | "vote" | "resolve" }>; close: () => void; ctx: Ctx }) {
  const d = useAgendaData();
  if (sheet.kind === "agenda") return <RevealAgendaSheet d={d} as={sheet.as} close={close} ctx={ctx} />;
  if (sheet.kind === "vote") {
    const can = canVote(d, ctx, sheet.faction);
    return (
      <SheetFrame title={`${ctx.short(sheet.faction)} votes`} close={close}>
        {sheet.faction !== ctx.seat ? <p className={styles.sub}>You're voting for {ctx.short(sheet.faction)}. It's logged as you, for them.</p> : null}
        {d.votes.has(sheet.faction) ? <p className={styles.sub}>This replaces their vote.</p> : null}
        {can && d.agenda ? <VoteForm d={d} ctx={ctx} faction={sheet.faction} onDone={close} /> : <p className={styles.sub}>{ctx.short(sheet.faction)} can't vote on this agenda.</p>}
      </SheetFrame>
    );
  }
  return <ResolveSheet d={d} as={sheet.as} close={close} ctx={ctx} />;
}

function RevealAgendaSheet({ d, as, close, ctx }: { d: AgendaData; as?: FactionId; close: () => void; ctx: Ctx }) {
  const [q, setQ] = useState("");
  const list = Object.values(d.agendas).filter((a): a is Agenda => !!a && !a.resolved && (!q || a.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <SheetFrame title="Reveal an agenda" close={close}>
      <input className={styles.search} type="search" placeholder="Find the agenda you flipped" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find the agenda you flipped" />
      <div>
        {list.map((a) => (
          <button key={a.id} className={styles.opt} disabled={ctx.w.pending} onClick={async () => {
            if (await ctx.w.write([Events.RevealAgendaEvent(a.id)], `Agenda revealed: ${a.name}`, as)) close();
          }}>
            <span style={{ display: "grid", textAlign: "left", gap: 2 }}><b>{a.name}</b><span className={styles.sub}>{a.type === "LAW" ? "Law" : "Directive"} · {a.elect}</span></span>
          </button>
        ))}
      </div>
    </SheetFrame>
  );
}

function ResolveSheet({ d, as, close, ctx }: { d: AgendaData; as?: FactionId; close: () => void; ctx: Ctx }) {
  const { w } = ctx;
  const tally = computeVotes(d.agenda, d.currentTurn, d.numFactions, d.repGov);
  const leaders = leadersOf(tally);
  // A clear winner resolves as is; a tie (or no votes) is the speaker's choice.
  const choices = leaders.length ? leaders
    : getTargets(d.agenda, ctx.factions, d.strategyCards, d.planets, d.agendas, d.objectives, d.options, d.intl).map((t) => t.id).filter((t) => t !== "Abstain");
  const [pick, setPick] = useState<Optional<string>>(leaders.length === 1 ? leaders[0] : undefined);
  if (!d.agenda) return null;
  const agenda = d.agenda;
  const tie = leaders.length !== 1;
  const resolve = async () => {
    if (!pick) return;
    const events: GameUpdateData[] = tie ? [Events.SpeakerTieBreakEvent(pick), Events.ResolveAgendaEvent(agenda.id, pick)] : [Events.ResolveAgendaEvent(agenda.id, pick)];
    if (await w.write(events, `${agenda.name}: ${outcomeLabel(d, ctx, pick)}`, as)) close();
  };
  return (
    <SheetFrame title={`Resolve ${agenda.name}`} close={close}>
      {tie ? <p className={styles.sub}>{leaders.length ? "The vote is tied." : "Nobody voted."} The speaker chooses the outcome.</p> : null}
      <div className={styles.pick}>
        {choices.map((t) => (
          <button key={t} aria-pressed={pick === t} onClick={() => setPick(t)}>
            <b>{outcomeLabel(d, ctx, t)}</b>{tally[t] ? <span className={styles.sub}> {tally[t]}</span> : null}
          </button>
        ))}
      </div>
      {pick ? (
        <>
          <p className={styles.title} style={{ fontWeight: 400 }}>
            {agenda.elect !== "For/Against" ? `${outcomeLabel(d, ctx, pick)} is elected: ${agenda.name}?` : pick === "For" ? `${agenda.name} passes?` : `${agenda.name} is voted down?`}
          </p>
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending} onClick={resolve}>Confirm</button>
        </>
      ) : null}
    </SheetFrame>
  );
}
