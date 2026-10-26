"use client";
// The agenda phase's data from upstream, and the vote rules /play shares between
// the agenda screen (NowAgenda.tsx) and the agenda cards (AgendaCards.tsx).
import { useIntl } from "react-intl";
import { canFactionVote, computeRemainingVotes, translateOutcome } from "../../components/VoteBlock/VoteBlock";
import { useActionLog, useAgendas, useAttachments, useCurrentTurn, useLeaders, useOptions, usePlanets, useRelics, useStrategyCards, useTechs } from "../../context/dataHooks";
import { useNumFactions } from "../../context/factionDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useGameState, useSpeaker } from "../../context/stateDataHooks";
import { getActionCardTargets, getActiveAgenda, getAllVotes, getPlayedRelic, getSelectedEligibleOutcomes, getSelectedSubAgenda } from "../../util/actionLog";
import { getCurrentPhaseLogEntries, getCurrentPhasePreviousLogEntries } from "../../util/api/actionLog";
import { Optional } from "../../util/types/types";
import { bonusPlayed, VOTE_BONUSES } from "./logic";
import type { Ctx } from "./ui";

// Everything the agenda screen needs from upstream, in one place.
export function useAgendaData() {
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
  const relics = useRelics();
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
  return { intl, state, agendas, currentTurn, actionLog, planets, strategyCards, objectives, options, attachments, leaders, techs, numFactions, speaker, agenda, repGov, votes, covert, outcomes, ballot, subAgenda, relics };
}
export type AgendaData = ReturnType<typeof useAgendaData>;

export function outcomeLabel(d: AgendaData, ctx: Ctx, target: Optional<string>) {
  if (!target) return "";
  if (ctx.isFaction(target)) return ctx.short(target);
  if (target === "Abstain") return "Abstain";
  const factions = ctx.factions;
  return translateOutcome(target, d.ballot?.elect, d.planets, factions, d.objectives, d.agendas, d.strategyCards, d.intl) ?? target;
}

// Whose cultural planets Ancient Burial Sites exhausted this phase. Upstream's
// computeRemainingVotes reads state.ancientBurialSites, which nothing sets, so
// /play fills it in from the log.
export function burialSitesTarget(d: AgendaData): Optional<FactionId> {
  const t = getActionCardTargets(getCurrentPhaseLogEntries(d.actionLog), "Ancient Burial Sites")[0];
  return t && t !== "None" ? (t as FactionId) : undefined;
}

export function available(d: AgendaData, ctx: Ctx, id: FactionId) {
  const state = { ...d.state, ancientBurialSites: burialSitesTarget(d) };
  const { influence } = computeRemainingVotes(id, ctx.factions, d.planets, d.attachments, d.agendas, d.options, state,
    getCurrentPhasePreviousLogEntries(d.actionLog), d.leaders, d.techs);
  // Under Representative Government each player has one vote, sent as votes: 1
  // (upstream's tally skips entries with zero votes).
  if (d.repGov) return 1;
  // Maw of Worlds exhausts its owner's planets for the phase (VoteBlock's VotingSection).
  if (d.relics["Maw of Worlds"]?.owner === id && getPlayedRelic(getCurrentPhaseLogEntries(d.actionLog), "Maw of Worlds")) return 0;
  return influence;
}

// What a vote counts for in upstream's tally: planet votes, extra votes, bonus
// cards played this agenda, and the Argent Flight's Zeal (computeVotes).
export function voteTotal(d: AgendaData, faction: FactionId, votes: number, extra: number, bonuses: string[]) {
  if (votes < 1) return 0;
  const zeal = faction === "Argent Flight" && !d.repGov ? d.numFactions : 0;
  return votes + extra + zeal + VOTE_BONUSES.filter((b) => bonuses.includes(b.id)).reduce((n, b) => n + b.votes, 0);
}
export const playedBonuses = (d: AgendaData, faction: FactionId) => VOTE_BONUSES.filter((b) => bonusPlayed(d.currentTurn, b, faction)).map((b) => b.id);

export function canVote(d: AgendaData, ctx: Ctx, id: FactionId) {
  const f = ctx.factions[id];
  return !!f && canFactionVote(f, d.agendas, d.state, d.currentTurn, d.leaders);
}
