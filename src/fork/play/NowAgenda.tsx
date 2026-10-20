"use client";
// Now, agenda phase: reveal, start voting, vote (capped at what's available),
// resolve, twice, then the next round. Vote counts, outcomes and the tally come
// from upstream's VoteBlock and AgendaPhase; laws' effects stay on the board.
import { useState } from "react";
import { computeVotes } from "../../../app/[locale]/game/[gameId]/main/phase/agenda/AgendaPhase";
import { getTargets } from "../../components/VoteBlock/VoteBlock";
import { getActionCardTargets } from "../../util/actionLog";
import { hasTech } from "../../util/api/techs";
import { Events } from "../../util/api/events";
import { outcomeString } from "../../util/strings";
import { Optional } from "../../util/types/types";
import { bonusOffered, VOTE_BONUSES, votingOrder } from "./logic";
import { BeforeVotingRows, StartOfAgendaRows } from "./AgendaCards";
import { available, canVote, outcomeLabel, playedBonuses, useAgendaData, voteTotal, type AgendaData } from "./agendaData";
import styles from "./play.module.scss";
import type { Ctx, Sheet } from "./ui";
import { Button, Chip, Choices, cx, kit, pcolor, RowAction, RowLink, Rows, Sheet as KitSheet, Stepper, Switch, Tag } from "../ui/kit";

const AGENDA_NAMES = ["first", "second"];

export default function NowAgenda(ctx: Ctx) {
  const { seat, helping, w, open, factions, short } = ctx;
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
          <div className={kit.section}>
            <p className={kit.label}>At the start of the phase</p>
            <StartOfAgendaRows ctx={ctx} />
          </div>
        ) : null}
      </section>
    );
  }

  const order = votingOrder(factions, speaker, getActionCardTargets(d.currentTurn, "Hack Election").length > 0);
  const who = helping ?? seat;
  return (
    <>
      <AgendaCard d={d} agendaNum={agendaNum} ctx={ctx} />
      {!state.votingStarted ? (
        <>
          {d.covert ? <CovertOutcomes d={d} ctx={ctx} /> : null}
          <section className={kit.card} aria-label="Before voting">
            <p className={kit.eyebrow}><span>Before voting</span></p>
            <BeforeVotingRows ctx={ctx} />
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

function AgendaCard({ d, agendaNum, ctx }: { d: AgendaData; agendaNum: number; ctx: Ctx }) {
  const a = d.agenda!;
  const elect = !d.covert ? electText(a.elect) : d.outcomes ? `Hidden agenda: ${electText(d.outcomes).toLowerCase()}` : "The speaker reads out the hidden agenda's outcomes";
  return (
    <section className={kit.card} aria-label="Agenda">
      <p className={kit.eyebrow}><span>Agenda {agendaNum} of 2 · {a.type === "LAW" ? "Law" : "Directive"}</span>
        {/* Before voting, a wrong reveal can be taken back (upstream's HIDE_AGENDA without a veto). */}
        {!d.state.votingStarted ? <Button kind="quiet" disabled={ctx.w.pending} onClick={() => ctx.w.write([Events.HideAgendaEvent(a.id)], `Took back ${a.name}`, d.speaker)}>Take it back</Button> : null}
      </p>
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
  // Changing a vote starts from the one cast.
  const before = d.votes.get(faction);
  const [target, setTarget] = useState<Optional<string>>(before?.votes && before.target !== "Abstain" ? before.target : undefined);
  const [n, setN] = useState(before?.votes ? Math.min(before.votes, max) : max);
  const [q, setQ] = useState("");
  // Extra votes: bonus cards (played with the vote) and any others by hand.
  const played = playedBonuses(d, faction);
  const [bonuses, setBonuses] = useState<string[]>(played);
  const [extra, setExtra] = useState(before?.extraVotes ?? 0);
  const [showExtra, setShowExtra] = useState(played.length > 0 || extra > 0);
  const offered = VOTE_BONUSES.filter((b) => played.includes(b.id) || bonusOffered(b, faction, target, d.currentTurn, { predictive: hasTech(factions[faction], d.techs["Predictive Intelligence"]), planets: d.planets }));
  const using = showExtra ? bonuses.filter((id) => offered.some((b) => b.id === id)) : [];
  const extraVotes = showExtra ? extra : 0;
  const total = voteTotal(d, faction, n, extraVotes, using);
  const many = targets.length > 8;
  const shown = many ? targets.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())) : targets;
  const label = (id: string) => outcomeLabel(d, ctx, id);
  const s = (k: number) => (k === 1 ? "" : "s");
  const cast = async (votes: number) => {
    const t = votes ? target! : "Abstain";
    const keep = votes ? using : [];
    // Play the bonus cards newly used, take back the ones dropped (abstaining drops them all).
    const plays = VOTE_BONUSES.flatMap((b): GameUpdateData[] => {
      const was = played.includes(b.id), now = keep.includes(b.id);
      if (was === now) return [];
      if (b.promissory) return [now ? Events.PlayPromissoryNoteEvent(b.id, faction) : Events.UnplayPromissoryNoteEvent(b.id, faction)];
      return [now ? Events.PlayActionCardEvent(b.id, faction) : Events.UnplayActionCardEvent(b.id, faction)];
    });
    const sum = voteTotal(d, faction, votes, votes ? extraVotes : 0, keep);
    const text = votes ? `${short(faction)} cast ${sum} vote${s(sum)} for ${label(t)}` : `${short(faction)} abstained`;
    if (await w.write([...plays, Events.CastVotesEvent(faction, votes, votes ? extraVotes : 0, t)], text, faction)) onDone?.();
  };
  return (
    <>
      <p className={kit.eyebrow}><span>{faction === seat ? "Your vote" : `${short(faction)}'s vote`}</span><span className={kit.num}>{max} available</span></p>
      {many ? <input className={kit.search} type="search" placeholder="Find an outcome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an outcome" /> : null}
      <Choices label="For which outcome?" value={target} onChange={setTarget}
        options={shown.map((t) => ({ value: t.id, label: ctx.isFaction(t.id) ? <Chip faction={t.id as FactionId} factions={factions} short={short} small player={false} /> : label(t.id) }))} />
      <p className={kit.label}>How many votes?</p>
      <Stepper value={n} min={0} max={max} less="One fewer vote" more="One more vote" onChange={setN} />
      <Switch label="Extra votes" detail="Distinguished Councilor, Predictive Intelligence, Bribery and the like" checked={showExtra} onChange={setShowExtra} />
      {showExtra ? (
        <div className={kit.section} role="group" aria-label="Extra votes">
          {offered.map((b) => (
            <Switch key={b.id} label={`${b.id}: +${b.votes}`} detail={b.note} checked={bonuses.includes(b.id)}
              onChange={(on) => setBonuses(on ? [...bonuses, b.id] : bonuses.filter((x) => x !== b.id))} />
          ))}
          <p className={kit.label}>Other extra votes</p>
          <Stepper value={extra} min={0} max={99} less="One fewer extra vote" more="One more extra vote" onChange={setExtra} />
          <p className={kit.sub}>Votes that don't come from planets' influence, such as Xxcha's commander or trade goods spent with Bribery.</p>
        </div>
      ) : null}
      <Button kind="primary" size="tall" block disabled={w.pending || !target || n < 1} onClick={() => cast(n)}
        detail={target && total !== n ? `${n} from planets, ${total - n} extra${faction === "Argent Flight" && !d.repGov ? " (with Zeal)" : ""}` : undefined}>
        {!target ? "Choose an outcome" : `Cast ${total} vote${s(total)} for ${label(target)}`}
      </Button>
      <Button block disabled={w.pending} onClick={() => cast(0)}>Abstain</Button>
      <p className={kit.sub}>
        {d.repGov ? "Representative Government: one vote each." : "The influence of your planets, less votes spent on the first agenda."}
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
              end={v ? <Tag tone="done">{v.target === "Abstain" || !v.votes ? "Abstained" : `${voteTotal(d, id, v.votes, v.extraVotes ?? 0, playedBonuses(d, id))} · ${outcomeLabel(d, ctx, v.target)}`}</Tag>
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
