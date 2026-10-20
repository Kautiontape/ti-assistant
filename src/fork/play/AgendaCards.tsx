"use client";
// Cards and abilities around an agenda, which upstream keeps in its agenda
// screen's hover menus (AgendaPhase.tsx, WhenAnAgendaIsRevealed.tsx,
// AfterAnAgendaIsRevealed.tsx, VoteBlock.tsx's riders, MawOfWorlds.tsx). Each is
// recorded with upstream's own events, so upstream's tally and resolve use them.
import { useState } from "react";
import { canFactionPredict, getTargets } from "../../components/VoteBlock/VoteBlock";
import { useFactionTechs } from "../../context/factionDataHooks";
import { getActionCardTargets, getGainedRelic, getNewOwner, getObjectiveScorers, getPlayedRelic, getPlayedRiders, getPromissoryTargets, getRevealedObjectives, getScoredObjectives } from "../../util/actionLog";
import { getCurrentTurnLogEntries } from "../../util/api/actionLog";
import { getCurrentPhaseLogEntries } from "../../util/api/actionLog";
import { computeVPs } from "../../util/factions";
import { Events } from "../../util/api/events";
import { riderString } from "../../util/strings";
import { Optional } from "../../util/types/types";
import { burialSitesTarget, outcomeLabel, useAgendaData, type AgendaData } from "./agendaData";
import { ridersFor } from "./logic";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

export type AgendaCardKind = "Veto" | "Political Secret" | "Assassinate Representative" | "Ancient Burial Sites" | "Maw of Worlds" | "Riders";

// Players in speaking order.
const players = (ctx: Ctx) => Object.values(ctx.factions).filter((f): f is Faction => !!f).sort((a, b) => a.order - b.order).map((f) => f.id);

// Start of the agenda phase, before the first agenda: Ancient Burial Sites and
// Maw of Worlds (upstream shows these until the first agenda is revealed).
export function StartOfAgendaRows({ ctx }: { ctx: Ctx }) {
  const d = useAgendaData();
  const { short, open } = ctx;
  const phaseLog = getCurrentPhaseLogEntries(d.actionLog);
  const burial = burialSitesTarget(d);
  const maw = d.relics["Maw of Worlds"];
  const mawUse = getPlayedRelic(phaseLog, "Maw of Worlds") as Optional<{ tech?: TechId }>;
  if (d.options.hide?.includes("PLANETS")) return null;
  return (
    <Rows>
      <RowLink onClick={() => open({ kind: "agendaCard", card: "Ancient Burial Sites" })} title="Ancient Burial Sites"
        detail={burial ? `${short(burial)}'s cultural planets are exhausted this phase` : "Exhausts one player's cultural planets"} />
      {maw?.owner && (maw.state !== "purged" || mawUse) ? (
        <RowLink onClick={() => open({ kind: "agendaCard", card: "Maw of Worlds" })} title={`Maw of Worlds (${short(maw.owner)})`}
          detail={mawUse?.tech ? `Used: gained ${mawUse.tech}` : "Purge it, exhaust their planets, gain any technology"} />
      ) : null}
    </Rows>
  );
}

// When and after an agenda is revealed, before voting.
export function BeforeVotingRows({ ctx }: { ctx: Ctx }) {
  const d = useAgendaData();
  const { short, open, w } = ctx;
  const secrets = getPromissoryTargets(d.currentTurn, "Political Secret") as FactionId[];
  const assassinated = (getActionCardTargets(d.currentTurn, "Assassinate Representative") as string[]).find((t) => t !== "None") as Optional<FactionId>;
  const hacked = getActionCardTargets(d.currentTurn, "Hack Election").length > 0;
  const riders = getPlayedRiders(d.currentTurn).filter((r) => r.faction && r.outcome);
  const xxcha = !!ctx.factions["Xxcha Kingdom"];
  return (
    <Rows>
      <RowLink onClick={() => open({ kind: "agendaCard", card: "Veto" })} title={xxcha ? "Veto, Quash or Political Favor" : "Veto"} detail="Discard this agenda and reveal another" />
      <RowLink onClick={() => open({ kind: "agendaCard", card: "Political Secret" })} title="Political Secret"
        detail={secrets.length ? `Played on ${secrets.map(short).join(", ")}: no votes or riders` : "A player can't vote or play riders"} />
      <RowAction verb={hacked ? "Take back" : "Record"} disabled={w.pending} title="Hack Election"
        detail={hacked ? "Played: voting goes the other way round" : "Voting goes the other way round"}
        onClick={() => w.write([hacked ? Events.UnplayActionCardEvent("Hack Election", "None") : Events.PlayActionCardEvent("Hack Election", "None")],
          hacked ? "Took back Hack Election" : "Hack Election played")} />
      <RowLink onClick={() => open({ kind: "agendaCard", card: "Assassinate Representative" })} title="Assassinate Representative"
        detail={assassinated ? `${short(assassinated)} can't vote` : "One player can't vote"} />
      <RowLink onClick={() => open({ kind: "agendaCard", card: "Riders" })} title="Riders"
        detail={riders.length ? riders.map((r) => `${short(r.faction)}: ${riderString(r.rider, d.intl)} on ${outcomeLabel(d, ctx, r.outcome)}`).join(" · ") : "Predict the outcome"} />
    </Rows>
  );
}

export function AgendaCardSheet({ card, close, ctx }: { card: AgendaCardKind; close: () => void; ctx: Ctx }) {
  const d = useAgendaData();
  switch (card) {
    case "Veto": return <VetoSheet d={d} close={close} ctx={ctx} />;
    case "Political Secret": return <PlayerCardSheet d={d} card={card} close={close} ctx={ctx} />;
    case "Assassinate Representative": return <PlayerCardSheet d={d} card={card} close={close} ctx={ctx} />;
    case "Ancient Burial Sites": return <PlayerCardSheet d={d} card={card} close={close} ctx={ctx} />;
    case "Maw of Worlds": return <MawSheet d={d} close={close} ctx={ctx} />;
    case "Riders": return <RidersSheet d={d} close={close} ctx={ctx} />;
  }
}

function VetoSheet({ d, close, ctx }: { d: AgendaData; close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  if (!d.agenda) return null;
  const agenda = d.agenda;
  return (
    <KitSheet title={`Veto ${agenda.name}?`} close={close}>
      <p className={kit.confirm}>{agenda.name} is discarded, and {short(d.speaker)} reveals another agenda in its place.</p>
      {ctx.factions["Xxcha Kingdom"] ? <p className={kit.sub}>Xxcha's Quash and the Political Favor promissory note do the same.</p> : null}
      <Button kind="primary" size="tall" block disabled={w.pending}
        onClick={async () => { if (await w.write([Events.HideAgendaEvent(agenda.id, true)], `Agenda vetoed: ${agenda.name}`)) close(); }}>Veto it</Button>
    </KitSheet>
  );
}

const PLAYER_CARDS = {
  "Political Secret": { question: "Who was it played on? They can't vote or play riders on this agenda.", promissory: true, one: false },
  "Assassinate Representative": { question: "Whose representative? They can't vote on this agenda.", promissory: false, one: true },
  "Ancient Burial Sites": { question: "Whose cultural planets are exhausted for this phase?", promissory: false, one: true },
} as const;

// An action card or promissory note played on a player: Record or Take back per player.
function PlayerCardSheet({ d, card, close, ctx }: { d: AgendaData; card: keyof typeof PLAYER_CARDS; close: () => void; ctx: Ctx }) {
  const { w, short, factions } = ctx;
  const spec = PLAYER_CARDS[card];
  const log = card === "Ancient Burial Sites" ? getCurrentPhaseLogEntries(d.actionLog) : d.currentTurn;
  const on = ((spec.promissory ? getPromissoryTargets(log, card) : getActionCardTargets(log, card)) as string[]).filter((t) => t !== "None") as FactionId[];
  const play = (id: FactionId) => (spec.promissory ? Events.PlayPromissoryNoteEvent(card, id) : Events.PlayActionCardEvent(card, id));
  const unplay = (id: FactionId) => (spec.promissory ? Events.UnplayPromissoryNoteEvent(card, id) : Events.UnplayActionCardEvent(card, id));
  return (
    <KitSheet title={card} close={close}>
      <p className={kit.sub}>{spec.question}</p>
      <Rows>
        {players(ctx).map((id) => {
          const played = on.includes(id);
          return (
            <RowAction key={id} verb={played ? "Take back" : "Record"} disabled={w.pending || (spec.one && !played && on.length > 0)}
              title={<Chip faction={id} factions={factions} short={short} small />} label={`${short(id)}: ${played ? "take back" : "record"} ${card}`}
              onClick={() => w.write(played ? [unplay(id)] : [play(id)], played ? `Took back ${card} on ${short(id)}` : `${card} played on ${short(id)}`)} />
          );
        })}
      </Rows>
      <Button kind="primary" block onClick={close}>Done</Button>
    </KitSheet>
  );
}

function MawSheet({ d, close, ctx }: { d: AgendaData; close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  const maw = d.relics["Maw of Worlds"];
  const owner = maw?.owner as Optional<FactionId>;
  const owned = useFactionTechs(owner ?? "Vuil'raith Cabal");
  const [q, setQ] = useState("");
  const use = getPlayedRelic(getCurrentPhaseLogEntries(d.actionLog), "Maw of Worlds") as Optional<{ tech?: TechId }>;
  if (!owner) return null;
  const list = Object.values(d.techs).filter((t): t is Tech => !!t && (!t.faction || t.faction === owner) && !owned.has(t.id))
    .filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const event = (action: "PLAY_RELIC" | "UNPLAY_RELIC", tech: TechId) => ({ action, event: { relic: "Maw of Worlds", tech } }) as unknown as GameUpdateData;
  return (
    <KitSheet title={`Maw of Worlds (${short(owner)})`} close={close}>
      {use?.tech ? (
        <Rows>
          <RowAction verb="Take back" disabled={w.pending} title={`Gained ${use.tech}`} detail="Maw of Worlds is purged; their planets are exhausted"
            onClick={async () => { if (await w.write([event("UNPLAY_RELIC", use.tech!)], `${short(owner)} took back Maw of Worlds`, owner)) close(); }} />
        </Rows>
      ) : (
        <>
          <p className={kit.sub}>{short(owner)} purges Maw of Worlds and exhausts all their planets (no votes this phase), then gains any technology.</p>
          <input className={kit.search} type="search" placeholder="Find a technology" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a technology" />
          <Rows>
            {list.map((t) => (
              <RowAction key={t.id} verb="Gain" disabled={w.pending} title={t.name}
                onClick={async () => { if (await w.write([event("PLAY_RELIC", t.id)], `${short(owner)} used Maw of Worlds and gained ${t.name}`, owner)) close(); }} />
            ))}
          </Rows>
        </>
      )}
    </KitSheet>
  );
}

function RidersSheet({ d, close, ctx }: { d: AgendaData; close: () => void; ctx: Ctx }) {
  const { w, short, factions } = ctx;
  const [who, setWho] = useState<Optional<FactionId>>();
  const [rider, setRider] = useState<Optional<string>>();
  const [outcome, setOutcome] = useState<Optional<string>>();
  const played = getPlayedRiders(d.currentTurn).filter((r) => r.faction);
  const can = players(ctx).filter((id) => canFactionPredict(id, d.currentTurn));
  const riders = who ? ridersFor(who, d.currentTurn, factions, d.options) : [];
  const targets = getTargets(d.ballot, factions, d.strategyCards, d.planets, d.agendas, d.objectives, d.options, d.intl).filter((t) => t.id !== "Abstain");
  const label = (o: string) => outcomeLabel(d, ctx, o);
  const name = (r: string) => riderString(r, d.intl);
  return (
    <KitSheet title="Riders" close={close}>
      {played.length ? (
        <Rows label="Played">
          {played.map((r) => (
            <RowAction key={r.rider} verb="Take back" disabled={w.pending} title={`${short(r.faction)}: ${name(r.rider)}`} detail={r.outcome ? `Predicts ${label(r.outcome)}` : "No prediction yet"}
              onClick={() => w.write([Events.UnplayRiderEvent(r.rider)], `${short(r.faction)} took back ${name(r.rider)}`, r.faction)} />
          ))}
        </Rows>
      ) : null}
      <Choices label="Who plays a rider?" value={who} onChange={(v) => { setWho(v as FactionId); setRider(undefined); }}
        options={can.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> }))} />
      {who ? (
        riders.length ? <Choices label="Which one?" value={rider} onChange={setRider} options={riders.map((r) => ({ value: r, label: name(r) }))} />
          : <p className={kit.sub}>{short(who)} has no rider left to play on this agenda.</p>
      ) : null}
      {who && rider ? <Choices label="Predicting which outcome?" value={outcome} onChange={setOutcome} options={targets.map((t) => ({ value: t.id, label: label(t.id) }))} /> : null}
      {who && rider && outcome ? (
        <>
          <p className={kit.confirm}>{short(who)} plays {name(rider)}, predicting {label(outcome)}?</p>
          <Button kind="primary" block disabled={w.pending} onClick={async () => {
            if (await w.write([Events.PlayRiderEvent(rider, who, outcome)], `${short(who)} played ${name(rider)} on ${label(outcome)}`, who)) {
              setWho(undefined); setRider(undefined); setOutcome(undefined);
            }
          }}>Confirm</Button>
        </>
      ) : null}
      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}

// ---------- after the vote: what the outcome does ----------
// From upstream's AgendaDetails.tsx, recorded before the resolve like there:
// Drive the Debate for the elected player (or the elected planet's owner),
// Incentive Program's objective, Colonial Redistribution's planet and Minister of
// Antiquities' relic.
export function ResolveFollowUps({ d, agendaId, outcome, ctx }: { d: AgendaData; agendaId: Optional<AgendaId>; outcome: string; ctx: Ctx }) {
  const { w, short, factions } = ctx;
  const [q, setQ] = useState("");
  const agenda = agendaId ? d.agendas[agendaId] : undefined;
  if (!agenda) return null;
  const parts: React.ReactNode[] = [];
  const hide = (s: string) => !!d.options.hide?.includes(s as never);

  // Drive the Debate (a secret objective): scored by whoever the vote elects.
  const driver = agenda.elect === "Player" ? (outcome as FactionId)
    : ["Cultural Planet", "Hazardous Planet", "Planet", "Industrial Planet", "Non-Home Planet Other Than Mecatol Rex"].includes(agenda.elect) ? d.planets[outcome as PlanetId]?.owner as Optional<FactionId> : undefined;
  const drive = d.objectives["Drive the Debate"];
  if (driver && factions[driver] && drive && !hide("OBJECTIVES")) {
    const scored = getScoredObjectives(d.currentTurn, driver).includes("Drive the Debate");
    const can = scored || ((drive.type !== "SECRET" || !(drive.scorers ?? []).length) && !(drive.scorers ?? []).includes(driver));
    if (can) parts.push(<Rows key="drive">
      <RowAction verb={scored ? "Take back" : "Score"} disabled={w.pending} title={`Drive the Debate (${short(driver)})`} detail="Secret objective: elected by an agenda"
        onClick={() => w.write([scored ? Events.UnscoreObjectiveEvent(driver, "Drive the Debate") : Events.ScoreObjectiveEvent(driver, "Drive the Debate")],
          scored ? `${short(driver)} took back Drive the Debate` : `${short(driver)} scored Drive the Debate`, driver)} />
    </Rows>);
  }

  if (agenda.id === "Incentive Program" && !hide("OBJECTIVES")) {
    const type = outcome === "For" ? "STAGE ONE" : "STAGE TWO";
    const stage = type === "STAGE ONE" ? "stage I" : "stage II";
    const revealed = getRevealedObjectives(d.currentTurn)[0];
    if (revealed) {
      parts.push(<Rows key="incentive"><RowAction verb="Take back" disabled={w.pending} title={`Revealed: ${d.objectives[revealed]?.name ?? revealed}`} detail={`Incentive Program: a ${stage} objective`}
        onClick={() => w.write([Events.HideObjectiveEvent(revealed)], `Took back ${d.objectives[revealed]?.name ?? revealed}`, d.speaker)} /></Rows>);
    } else {
      const list = Object.values(d.objectives).filter((o): o is Objective => !!o && o.type === type && !o.selected && (!q || o.name.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => a.name.localeCompare(b.name));
      parts.push(
        <div key="incentive" style={{ display: "grid", gap: 8 }}>
          <p className={kit.sub}>Incentive Program: reveal a {stage} objective.</p>
          <input className={kit.search} type="search" placeholder="Find the objective you flipped" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find the objective you flipped" />
          <Rows label="Objectives to reveal">
            {list.slice(0, 40).map((o) => (
              <RowAction key={o.id} verb="Reveal" disabled={w.pending} title={o.name} detail={o.description}
                onClick={() => w.write([Events.RevealObjectiveEvent(o.id)], `Objective revealed: ${o.name} (Incentive Program)`, d.speaker)} />
            ))}
          </Rows>
        </div>,
      );
    }
  }

  if (agenda.id === "Colonial Redistribution" && !hide("PLANETS") && d.planets[outcome as PlanetId]) {
    const planet = d.planets[outcome as PlanetId]!;
    const all = Object.values(factions).filter((f): f is Faction => !!f);
    const min = Math.min(...all.map((f) => computeVPs(factions, f.id, d.objectives)));
    const fewest = all.filter((f) => computeVPs(factions, f.id, d.objectives) === min).map((f) => f.id);
    const given = getNewOwner(d.currentTurn, outcome) as Optional<FactionId>;
    parts.push(
      <Rows key="colonial" label="Colonial Redistribution">
        {fewest.map((id) => (
          <RowAction key={id} verb={given === id ? "Take back" : "Give"} disabled={w.pending || (!!given && given !== id)}
            title={<Chip faction={id} factions={factions} short={short} small />} detail={given === id ? `Gained ${planet.name}` : `Fewest points: gains ${planet.name}`} label={`${given === id ? "Take back" : "Give"} ${planet.name}: ${short(id)}`}
            onClick={() => w.write([given === id ? Events.UnclaimPlanetEvent(id, planet.id) : Events.ClaimPlanetEvent(id, planet.id)],
              given === id ? `${short(id)} gave back ${planet.name}` : `${short(id)} took control of ${planet.name} (Colonial Redistribution)`, id)} />
        ))}
      </Rows>,
    );
  }

  if (agenda.id === "Minister of Antiquities" && !hide("RELICS") && factions[outcome as FactionId]) {
    const who = outcome as FactionId;
    const gained = getGainedRelic(d.currentTurn) as Optional<RelicId>;
    const relics = Object.values(d.relics).filter((r): r is Relic => !!r && (!r.owner || r.id === gained)).sort((a, b) => a.name.localeCompare(b.name));
    parts.push(
      <Rows key="antiquities" label="Minister of Antiquities">
        {relics.filter((r) => !gained || r.id === gained).map((r) => (
          <RowAction key={r.id} verb={r.id === gained ? "Take back" : "Gain"} disabled={w.pending} title={r.name} detail={r.id === gained ? `${short(who)} gained it` : `${short(who)} gains a relic`}
            onClick={() => w.write([r.id === gained ? Events.LoseRelicEvent(who, r.id) : Events.GainRelicEvent(who, r.id)], r.id === gained ? `${short(who)} gave back ${r.name}` : `${short(who)} gained ${r.name}`, who)} />
        ))}
      </Rows>,
    );
  }

  if (!parts.length) return null;
  return (
    <div className={kit.section} aria-label="What the outcome does">
      <p className={kit.label}>Record what it does</p>
      {parts}
    </div>
  );
}

// Dictate Policy: scored by a player when 3 or more laws are in play (upstream's
// AgendaPhase.tsx DictatePolicy: anyone who hasn't scored it yet, or only one
// player when it's a secret).
export function DictatePolicyRows({ ctx }: { ctx: Ctx }) {
  const d = useAgendaData();
  const { w, short, factions } = ctx;
  const dictate = d.objectives["Dictate Policy"];
  const laws = Object.values(d.agendas).filter((a) => a?.passed && a.type === "LAW").length;
  const turn = getCurrentTurnLogEntries(d.actionLog);
  const current = getObjectiveScorers(turn, "Dictate Policy") as FactionId[];
  if (!dictate || laws < 3 || !(current.length || !(dictate.scorers ?? []).length || dictate.type === "STAGE ONE")) return null;
  const scorers = dictate.scorers ?? [];
  const can = Object.values(factions).filter((f): f is Faction => !!f).map((f) => f.id).filter((id) => current.includes(id) || !scorers.includes(id));
  const secret = dictate.type === "SECRET";
  return (
    <section className={kit.card} aria-label="Dictate Policy">
      <p className={kit.eyebrow}><span>Dictate Policy</span><span className={kit.num}>{laws} laws in play</span></p>
      <Rows>
        {can.map((id) => {
          const has = scorers.includes(id);
          return (
            <RowAction key={id} verb={has ? "Take back" : "Score"} disabled={w.pending || (secret && !has && current.length > 0)}
              title={<Chip faction={id} factions={factions} short={short} small />} label={`Dictate Policy: ${has ? "take back" : "score"} for ${short(id)}`}
              onClick={() => w.write([has ? Events.UnscoreObjectiveEvent(id, "Dictate Policy") : Events.ScoreObjectiveEvent(id, "Dictate Policy")],
                has ? `${short(id)} took back Dictate Policy` : `${short(id)} scored Dictate Policy`, id)} />
          );
        })}
      </Rows>
    </section>
  );
}
