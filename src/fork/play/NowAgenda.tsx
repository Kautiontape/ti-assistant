"use client";
// Now, agenda phase: reveal, start voting, vote (capped at what's available),
// resolve, twice, then the next round. Vote counts, outcomes and the tally come
// from upstream's VoteBlock and AgendaPhase; laws' effects stay on the board.
import { useState } from "react";
import { useIntl } from "react-intl";
import { computeVotes } from "../../../app/[locale]/game/[gameId]/main/phase/agenda/AgendaPhase";
import { canFactionVote, computeRemainingVotes, getTargets, translateOutcome } from "../../components/VoteBlock/VoteBlock";
import { useActionLog, useAgendas, useAttachments, useCurrentTurn, useLeaders, useOptions, usePlanets, useStrategyCards, useTechs } from "../../context/dataHooks";
import { useNumFactions } from "../../context/factionDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useGameState, useSpeaker } from "../../context/stateDataHooks";
import { getActiveAgenda, getAllVotes, getSelectedEligibleOutcomes, getSelectedSubAgenda } from "../../util/actionLog";
import { getCurrentPhasePreviousLogEntries } from "../../util/api/actionLog";
import { Events } from "../../util/api/events";
import { outcomeString } from "../../util/strings";
import { Optional } from "../../util/types/types";
import { votingOrder } from "./logic";
import styles from "./play.module.scss";
import type { Ctx, Sheet } from "./ui";
import { Button, Chip, Choices, cx, kit, pcolor, RowAction, RowLink, Rows, Sheet as KitSheet, Stepper, Tag } from "../ui/kit";

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
  // Covert Legislation: players vote on the outcomes of a hidden agenda, which
  // the speaker reads out. Votes and labels use those outcomes (upstream's
  // CastVotesSection swaps `elect` the same way).
  const covert = agenda?.id === "Covert Legislation";
  const eligible = covert ? getSelectedEligibleOutcomes(currentTurn) : undefined;
  const outcomes: Optional<OutcomeType> = eligible && eligible !== "None" ? eligible : undefined;
  const ballot = agenda && outcomes ? { ...agenda, elect: outcomes } : agenda;
  const subAgenda = covert ? getSelectedSubAgenda(currentTurn) : undefined;
  return { intl, state, agendas, currentTurn, actionLog, planets, strategyCards, objectives, options, attachments, leaders, techs, numFactions, speaker, agenda, repGov, votes, covert, outcomes, ballot, subAgenda };
}
type AgendaData = ReturnType<typeof useAgendaData>;

function outcomeLabel(d: AgendaData, ctx: Ctx, target: Optional<string>) {
  if (!target) return "";
  if (ctx.isFaction(target)) return ctx.short(target);
  if (target === "Abstain") return "Abstain";
  const factions = ctx.factions;
  return translateOutcome(target, d.ballot?.elect, d.planets, factions, d.objectives, d.agendas, d.strategyCards, d.intl) ?? target;
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
      <section className={kit.card} aria-label="Agendas done">
        <p className={kit.eyebrow}><span>Agenda phase</span></p>
        <h2 className={kit.title}>Both agendas are resolved</h2>
        <p className={kit.sub}>Ready your planets on the board, then start the next round.</p>
        <Button kind="primary" size="tall" block disabled={w.pending}
          onClick={() => w.write([Events.AdvancePhaseEvent()], `Round ${(state.round ?? 0) + 1} started`)}>Start round {(state.round ?? 0) + 1}</Button>
      </section>
    );
  }

  if (!agenda) {
    return (
      <section className={kit.card} aria-label="Reveal an agenda">
        <p className={kit.eyebrow}><span>Agenda {agendaNum} of 2</span></p>
        <h2 className={kit.title}>Reveal the {AGENDA_NAMES[agendaNum - 1]} agenda</h2>
        <p className={kit.sub}>{speakerJob}: flip the top card of the agenda deck.</p>
        <Button kind="primary" size="tall" block forOther={help} disabled={w.pending}
          onClick={() => open({ kind: "agenda", as: speaker })}>{help ? `Reveal for ${short(speaker)}` : "Reveal the agenda"}</Button>
        {agendaNum === 1 ? (
          <>
            <p className={kit.sub}>Maw of Worlds and Ancient Burial Sites are on the table screen.</p>
            <Rows><RowLink href={`/game/${gameId}/main`} external title="Open the table screen" /></Rows>
          </>
        ) : null}
      </section>
    );
  }

  const order = votingOrder(factions, speaker);
  const who = helping ?? seat;
  return (
    <>
      <AgendaCard d={d} agendaNum={agendaNum} />
      {!state.votingStarted ? (
        <>
          {d.covert ? <CovertOutcomes d={d} ctx={ctx} /> : null}
          <section className={kit.card} aria-label="Before voting">
            <p className={kit.sub}>Cards played when an agenda is revealed (Veto, riders, Hack Election, Political Secret) are on the table screen.</p>
            <Rows><RowLink href={`/game/${gameId}/main`} external title="Open the table screen" /></Rows>
            {d.covert && !d.outcomes ? <p className={kit.sub}>Voting starts once the speaker has read out the hidden agenda's outcomes.</p> : null}
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

function electText(elect: OutcomeType) {
  return elect === "For/Against" ? "For or against" : `Elect a ${elect.toLowerCase()}`;
}

function AgendaCard({ d, agendaNum }: { d: AgendaData; agendaNum: number }) {
  const a = d.agenda!;
  const elect = !d.covert ? electText(a.elect) : d.outcomes ? `Hidden agenda: ${electText(d.outcomes).toLowerCase()}` : "The speaker reads out the hidden agenda's outcomes";
  return (
    <section className={kit.card} aria-label="Agenda">
      <p className={kit.eyebrow}><span>Agenda {agendaNum} of 2 · {a.type === "LAW" ? "Law" : "Directive"}</span></p>
      <h2 className={kit.title}>{a.name}</h2>
      <p className={kit.sub}><b>{elect}.</b> {a.description}</p>
    </section>
  );
}

// Covert Legislation, before voting: the speaker draws the next agenda in secret
// and reads out what kind of outcome it has. Upstream's RevealOutcomes offers
// every outcome type that some agenda in the game elects.
function CovertOutcomes({ d, ctx }: { d: AgendaData; ctx: Ctx }) {
  const { w, short, seat } = ctx;
  const types = [...new Set(Object.values(d.agendas).filter((a): a is Agenda => !!a && !a.target && a.elect !== "???").map((a) => a.elect))];
  const [pick, setPick] = useState<Optional<OutcomeType>>(d.outcomes);
  const helpSpeaker = d.speaker !== seat;
  const name = (t: OutcomeType) => (t === "For/Against" ? "For or against" : outcomeString(t, d.intl));
  return (
    <section className={kit.card} aria-label="Covert Legislation">
      <p className={kit.eyebrow}><span>Covert Legislation</span></p>
      <p className={kit.sub}>{helpSpeaker ? `${short(d.speaker)} draws the next agenda without showing anyone, then reads out its outcomes.` : "Draw the next agenda without showing anyone, then read out its outcomes."} Everyone votes on those. The hidden agenda is shown when this one resolves.</p>
      <Choices label="The hidden agenda's outcomes" value={pick} onChange={setPick} options={types.map((t) => ({ value: t, label: name(t) }))} />
      {pick && pick !== d.outcomes ? (
        <>
          <p className={kit.confirm}>The hidden agenda is {pick === "For/Against" ? "voted for or against" : `an election: ${name(pick).toLowerCase()}`}?</p>
          <Button kind="primary" block forOther={helpSpeaker} disabled={w.pending}
            onClick={() => w.write([Events.SelectEligibleOutcomesEvent(pick)], `Covert Legislation's outcomes: ${name(pick)}`, d.speaker)}>Confirm</Button>
        </>
      ) : null}
    </section>
  );
}

// The vote itself: outcome, then how many, capped at what's available.
function VoteForm({ d, ctx, faction, onDone }: { d: AgendaData; ctx: Ctx; faction: FactionId; onDone?: () => void }) {
  const { short, w, seat, factions } = ctx;
  const max = available(d, ctx, faction);
  const targets = getTargets(d.ballot, factions, d.strategyCards, d.planets, d.agendas, d.objectives, d.options, d.intl).filter((t) => t.id !== "Abstain");
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
      <p className={kit.eyebrow}><span>{faction === seat ? "Your vote" : `${short(faction)}'s vote`}</span><span className={kit.num}>{max} available</span></p>
      {many ? <input className={kit.search} type="search" placeholder="Find an outcome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an outcome" /> : null}
      <Choices label="For which outcome?" value={target} onChange={setTarget}
        options={shown.map((t) => ({ value: t.id, label: ctx.isFaction(t.id) ? <Chip faction={t.id as FactionId} factions={factions} short={short} small player={false} /> : label(t.id) }))} />
      <p className={kit.label}>How many votes?</p>
      <Stepper value={n} min={0} max={max} less="One fewer vote" more="One more vote" onChange={setN} />
      <Button kind="primary" size="tall" block disabled={w.pending || !target || n < 1} onClick={() => cast(n)}>
        {!target ? "Choose an outcome" : `Cast ${n} vote${n === 1 ? "" : "s"} for ${label(target)}`}
      </Button>
      <Button block disabled={w.pending} onClick={() => cast(0)}>Abstain</Button>
      <p className={kit.sub}>
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
    <section className={kit.card} aria-label="Votes">
      <p className={kit.eyebrow}><span>Votes</span><span className={kit.num}>{eligible.filter((id) => d.votes.has(id)).length} of {eligible.length}</span></p>
      {Object.keys(tally).length ? (
        <div className={kit.line} style={{ flexWrap: "wrap", gap: 6 }}>
          {Object.entries(tally).map(([t, v]) => <Tag key={t} tone="done">{outcomeLabel(d, ctx, t)}: <b className={kit.num}>{v}</b></Tag>)}
        </div>
      ) : null}
      <Rows flush>
        {order.map((id) => {
          const v = d.votes.get(id);
          const can = canVote(d, ctx, id);
          return (
            <RowLink key={id} disabled={!can} onClick={() => open({ kind: "vote", faction: id })} label={`${short(id)}: vote`}
              title={<Chip faction={id} factions={factions} short={short} small />}
              end={v ? <Tag tone="done">{v.target === "Abstain" || !v.votes ? "Abstained" : `${v.votes} · ${outcomeLabel(d, ctx, v.target)}`}</Tag>
                : !can ? "Can't vote" : id === next ? <Tag tone="now">Up next</Tag> : "Waiting"} />
          );
        })}
      </Rows>
      <p className={kit.sub}>Choose a player to vote for them or change their vote.</p>
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
    <section className={kit.card} aria-label="Resolve">
      <p className={kit.eyebrow}><span>Result</span></p>
      <h2 className={kit.title}>{status}</h2>
      <p className={kit.sub}>{waiting ? `${waiting} still to vote. ` : "Everyone has voted. "}{d.speaker === seat ? "Resolving is your job as speaker." : `Resolving is ${short(d.speaker)}'s job as speaker.`}</p>
      <Button kind={waiting ? "secondary" : "primary"} block forOther={d.speaker !== seat} disabled={w.pending}
        onClick={() => open({ kind: "resolve", as: d.speaker })}>{d.speaker === seat ? "Resolve the agenda" : `Resolve for ${short(d.speaker)}`}</Button>
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
      <KitSheet title={`${ctx.short(sheet.faction)} votes`} close={close}>
        {sheet.faction !== ctx.seat ? <p className={kit.sub}>You're voting for {ctx.short(sheet.faction)}. It's logged as you, for them.</p> : null}
        {d.votes.has(sheet.faction) ? <p className={kit.sub}>This replaces their vote.</p> : null}
        {can && d.agenda ? <VoteForm d={d} ctx={ctx} faction={sheet.faction} onDone={close} /> : <p className={kit.sub}>{ctx.short(sheet.faction)} can't vote on this agenda.</p>}
      </KitSheet>
    );
  }
  return <ResolveSheet d={d} as={sheet.as} close={close} ctx={ctx} />;
}

function RevealAgendaSheet({ d, as, close, ctx }: { d: AgendaData; as?: FactionId; close: () => void; ctx: Ctx }) {
  const [q, setQ] = useState("");
  const list = Object.values(d.agendas).filter((a): a is Agenda => !!a && !a.resolved && (!q || a.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <KitSheet title="Reveal an agenda" close={close}>
      <input className={kit.search} type="search" placeholder="Find the agenda you flipped" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find the agenda you flipped" />
      <Rows>
        {list.map((a) => (
          <RowAction key={a.id} verb="Reveal" disabled={ctx.w.pending} title={a.name} detail={`${a.type === "LAW" ? "Law" : "Directive"} · ${a.elect}`}
            onClick={async () => {
              if (await ctx.w.write([Events.RevealAgendaEvent(a.id)], `Agenda revealed: ${a.name}`, as)) close();
            }} />
        ))}
      </Rows>
    </KitSheet>
  );
}

function ResolveSheet({ d, as, close, ctx }: { d: AgendaData; as?: FactionId; close: () => void; ctx: Ctx }) {
  const { w } = ctx;
  const tally = computeVotes(d.agenda, d.currentTurn, d.numFactions, d.repGov);
  const leaders = leadersOf(tally);
  // A clear winner resolves as is; a tie (or no votes) is the speaker's choice.
  const choices = leaders.length ? leaders
    : getTargets(d.ballot, ctx.factions, d.strategyCards, d.planets, d.agendas, d.objectives, d.options, d.intl).map((t) => t.id).filter((t) => t !== "Abstain");
  const [pick, setPick] = useState<Optional<string>>(leaders.length === 1 ? leaders[0] : undefined);
  // Covert Legislation: the speaker shows the hidden agenda, and it resolves with the vote.
  const [hidden, setHidden] = useState<Optional<AgendaId>>(d.subAgenda);
  const [q, setQ] = useState("");
  if (!d.agenda) return null;
  const agenda = d.agenda;
  const tie = leaders.length !== 1;
  const hiddenList = Object.values(d.agendas).filter((a): a is Agenda => !!a && a.id !== agenda.id && a.elect === d.outcomes)
    .sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || a.name.localeCompare(b.name));
  const hiddenName = hidden ? d.agendas[hidden]?.name ?? hidden : undefined;
  const ready = !!pick && (!d.covert || !!hidden);
  const resolve = async () => {
    if (!pick || !ready) return;
    const events: GameUpdateData[] = [
      ...(tie ? [Events.SpeakerTieBreakEvent(pick)] : []),
      ...(d.covert && hidden && hidden !== d.subAgenda ? [Events.SelectSubAgendaEvent(hidden)] : []),
      Events.ResolveAgendaEvent(agenda.id, pick),
    ];
    const label = d.covert ? `${agenda.name} (${hiddenName}): ${outcomeLabel(d, ctx, pick)}` : `${agenda.name}: ${outcomeLabel(d, ctx, pick)}`;
    if (await w.write(events, label, as)) close();
  };
  const passes = (name: string) => d.ballot?.elect !== "For/Against"
    ? `${outcomeLabel(d, ctx, pick)} is elected: ${name}?` : pick === "For" ? `${name} passes?` : `${name} is voted down?`;
  return (
    <KitSheet title={`Resolve ${agenda.name}`} close={close}>
      {tie ? <p className={kit.sub}>{leaders.length ? "The vote is tied." : "Nobody voted."} The speaker chooses the outcome.</p> : null}
      <Choices label="Outcome" hideLabel={!tie} value={pick} onChange={setPick}
        options={choices.map((t) => ({ value: t, label: outcomeLabel(d, ctx, t), note: tally[t] ? `${tally[t]} votes` : undefined }))} />
      {d.covert ? (
        <div className={kit.section}>
          <p className={kit.sub}>Show the hidden agenda. It resolves with this outcome.</p>
          {hiddenList.length > 8 ? <input className={kit.search} type="search" placeholder="Find the hidden agenda" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find the hidden agenda" /> : null}
          <Choices list label="Which agenda was it?" value={hidden} onChange={(v) => setHidden(v as AgendaId)}
            options={hiddenList.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.id === hidden).map((a) => ({ value: a.id as string, label: a.name, note: a.resolved ? "already resolved" : a.type === "LAW" ? "Law" : "Directive" }))} />
        </div>
      ) : null}
      {pick && ready ? (
        <>
          <p className={kit.confirm}>{passes(d.covert ? hiddenName ?? agenda.name : agenda.name)}</p>
          <Button kind="primary" size="tall" block disabled={w.pending} onClick={resolve}>Confirm</Button>
        </>
      ) : null}
    </KitSheet>
  );
}
