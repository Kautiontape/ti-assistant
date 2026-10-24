// Fork-only events, added to upstream's GameUpdateData union at seam S4
// (src/util/types/api.d.ts). Global declarations, like upstream's own types.

interface StartCombatEvent {
  faction: FactionId; // the attacker
  defender: FactionId;
  kind: "space" | "ground";
  planet?: PlanetId;
}

interface EndCombatEvent {
  faction: FactionId; // the attacker, matching its START_COMBAT
  defender: FactionId;
  winner: FactionId | "None";
}

interface StartCombatData { action: "START_COMBAT"; event: StartCombatEvent }
interface UnstartCombatData { action: "UNSTART_COMBAT"; event: StartCombatEvent }
interface EndCombatData { action: "END_COMBAT"; event: EndCombatEvent }
interface UnendCombatData { action: "UNEND_COMBAT"; event: EndCombatEvent }

// Sent by /play's undo only, never logged (src/fork/actions/agendaUndo.ts).
interface UnresolveAgendaEvent {
  agenda: AgendaId;
  target: string;
  prevSpeaker?: FactionId;
  // The turn's riders and hidden agenda, newest first.
  turn: GameUpdateData[];
}
interface UnresolveAgendaData { action: "UNRESOLVE_AGENDA"; event: UnresolveAgendaEvent }

interface UnrevealSubAgendaEvent {
  subAgenda: AgendaId;
  target: string; // the outcome Covert Legislation resolved with
}
interface UnrevealSubAgendaData { action: "UNREVEAL_SUB_AGENDA"; event: UnrevealSubAgendaEvent }

type ForkUpdateData = StartCombatData | UnstartCombatData | EndCombatData | UnendCombatData | UnrevealSubAgendaData | UnresolveAgendaData;
