// Twilight's Fall rules /play needs that upstream keeps inside its components.
// Each copy names its source.
import { getActionCardTargets, getGainedTFCards, getLogEntries, getRevealedTFCards, getSpliceParticipants, wasGenomeUsed } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { ActionLog, Optional } from "../../util/types/types";

export const isTwilightsFall = (options: Options) => options.expansions.includes("TWILIGHTS FALL");

export type SpliceType = "ABILITY" | "GENOME" | "UNIT_UPGRADE";
export type TfType = SpliceType | "PARADIGM";
export const TYPE_NAMES: Record<TfType, { one: string; many: string }> = {
  ABILITY: { one: "ability", many: "abilities" },
  GENOME: { one: "genome", many: "genomes" },
  UNIT_UPGRADE: { one: "unit upgrade", many: "unit upgrades" },
  PARADIGM: { one: "paradigm", many: "paradigms" },
};

// The strategy cards that start a splice, and its type.
export const SPLICE_CARDS: Partial<Record<string, SpliceType>> = { Noctis: "GENOME", Calamitas: "UNIT_UPGRADE", Magus: "ABILITY" };

// Following Noctis or Magus joins the splice; reopening the secondary leaves it
// (upstream's AllSecondaries in StrategicActions/Noctis.tsx). Calamitas'
// follower may use home-system PRODUCTION instead, so they join by hand.
const JOIN_ON_FOLLOW = new Set(["Noctis", "Magus"]);
export function followEvents(card: string, faction: FactionId): GameUpdateData[] {
  return [...(JOIN_ON_FOLLOW.has(card) ? [Events.JoinSpliceEvent(faction)] : []), Events.MarkSecondaryEvent(faction, "DONE")];
}
export function reopenEvents(card: string, faction: FactionId, joined: boolean): GameUpdateData[] {
  return [...(JOIN_ON_FOLLOW.has(card) && joined ? [Events.LeaveSpliceEvent(faction)] : []), Events.MarkSecondaryEvent(faction, "PENDING")];
}

export type CardEvent = AbilityEvent | GenomeEvent | ParadigmEvent | UpgradeEvent;
export function cardId(e: CardEvent): string {
  switch (e.type) {
    case "ABILITY": return e.ability;
    case "GENOME": return e.genome;
    case "PARADIGM": return e.paradigm;
    case "UNIT_UPGRADE": return e.upgrade;
  }
}
export function cardEvent(type: TfType, id: string): CardEvent {
  switch (type) {
    case "ABILITY": return { type, ability: id as TFAbilityId };
    case "GENOME": return { type, genome: id as TFGenomeId };
    case "PARADIGM": return { type, paradigm: id as TFParadigmId };
    case "UNIT_UPGRADE": return { type, upgrade: id as TFUnitUpgradeId };
  }
}

export interface SpliceState {
  participants: FactionId[]; // everyone in the splice, the initiator first
  pickers: FactionId[]; // pick order
  current?: FactionId; // who picks now
  revealed: string[]; // cards turned face up, in order
  takenBy: Record<string, FactionId>;
  techs: { faction: FactionId; tech: TechId }[]; // King technologies taken instead of a card
  total: number; // cards to reveal
  engineer: boolean;
  reverse: boolean;
}

// Upstream's SpliceModalContent (src/components/Splice/SpliceModal.tsx): reveal
// participants + 2 cards (2 more with Engineer, 3 more with Research Genome);
// the initiator picks first, then the others counter-clockwise (clockwise after
// Reverse). With Magus' extra card the initiator also joins, and picks last
// instead of first. `speakerOrder` is useOrderedFactionIds("SPEAKER", undefined, initiator).
export function spliceState(currentTurn: ActionLog, type: SpliceType, initiator: FactionId, speakerOrder: FactionId[], allPlayers: boolean): SpliceState {
  let joined = new Set(getSpliceParticipants(currentTurn));
  if (allPlayers) { joined = new Set(speakerOrder); joined.delete(initiator); }
  const reverse = getActionCardTargets(currentTurn, "Reverse").length > 0;
  const engineer = getActionCardTargets(currentTurn, "Engineer").length > 0;
  const genome = wasGenomeUsed(currentTurn, "Research Genome");
  const local = [...speakerOrder];
  local.shift();
  if (!reverse) local.reverse();
  local.unshift(initiator);
  const revealedEntries = getRevealedTFCards(currentTurn).filter((e) => e.data.event.type === type);
  const gained = getGainedTFCards(currentTurn).filter((e) => e.data.event.type === type);
  const techs = getLogEntries<AddTechData>(currentTurn, "ADD_TECH").map((e) => ({ faction: e.data.event.faction, tech: e.data.event.tech }));
  const index = gained.length + techs.length;
  const total = joined.size + 2 + (engineer && index === 0 ? 2 : 0) + (genome ? 3 : 0);
  const pickers = [initiator, ...local.filter((id) => joined.has(id))];
  if (joined.has(initiator)) { pickers.shift(); pickers.push(initiator); }
  const takenBy: Record<string, FactionId> = {};
  for (const e of gained) takenBy[cardId(e.data.event)] = e.data.event.faction;
  return {
    participants: [initiator, ...local.filter((id) => joined.has(id) && id !== initiator)],
    pickers, current: pickers[index], revealed: revealedEntries.map((e) => cardId(e.data.event)), takenBy, techs, total, engineer, reverse,
  };
}

// Cards each player gained in a window of the log, by type.
export function gainedIn(log: ActionLog, faction: FactionId) {
  return getGainedTFCards(log).filter((e) => e.data.event.faction === faction).map((e) => ({ type: e.data.event.type as TfType, id: cardId(e.data.event) }));
}

export const ownerOf = (cards: Partial<Record<string, { owner?: FactionId }>>, id: string): Optional<FactionId> => cards[id]?.owner;

// Log sentences for Twilight's Fall actions, after the player's name (/play's
// sentence() in src/fork/play/logic.ts falls back to this). Card ids are names.
export function tfSentence(data: GameUpdateData, name: (id: string) => string): string | null {
  const ev = ((data as { event?: Record<string, unknown> }).event ?? {}) as Record<string, any>;
  switch (data.action) {
    case "GAIN_TF_CARD": return ev.prevFaction ? `took ${cardId(ev as CardEvent)} from ${name(ev.prevFaction)}` : `gained ${cardId(ev as CardEvent)}`;
    case "LOSE_TF_CARD": return `discarded ${cardId(ev as CardEvent)}`;
    case "REVEAL_TF_CARD": return `${cardId(ev as CardEvent)} turned up for a splice`;
    case "HIDE_TF_CARD": return `${cardId(ev as CardEvent)} went back from the splice`;
    case "JOIN_SPLICE": return `${name(ev.factionId)} joined the splice`;
    case "LEAVE_SPLICE": return `${name(ev.factionId)} left the splice`;
    case "CHOOSE_EDICT": return `resolved the edict ${ev.edictId}`;
    case "HIDE_EDICT": return `took back the edict ${ev.edictId}`;
    case "SET_TYRANT": return ev.newTyrant ? `${name(ev.newTyrant)} is the tyrant` : "Nobody is the tyrant";
    case "CHOOSE_TF_FACTION": return ev.subFaction ? `${name(ev.factionId)} uses ${ev.type === "Planet" ? `the ${ev.subFaction} home system` : `the ${ev.subFaction} starting units`}` : null;
    default: return null;
  }
}
