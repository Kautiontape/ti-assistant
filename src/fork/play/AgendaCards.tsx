"use client";
// Cards and abilities around an agenda, which upstream keeps in its agenda
// screen's hover menus (AgendaPhase.tsx, WhenAnAgendaIsRevealed.tsx,
// AfterAnAgendaIsRevealed.tsx, VoteBlock.tsx's riders, MawOfWorlds.tsx). Each is
// recorded with upstream's own events, so upstream's tally and resolve use them.
import { useState } from "react";
import { canFactionPredict, getTargets } from "../../components/VoteBlock/VoteBlock";
import { useFactionTechs } from "../../context/factionDataHooks";
import { getActionCardTargets, getPlayedRelic, getPlayedRiders, getPromissoryTargets } from "../../util/actionLog";
import { getCurrentPhaseLogEntries } from "../../util/api/actionLog";
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
