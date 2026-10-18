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

type ForkUpdateData = StartCombatData | UnstartCombatData | EndCombatData | UnendCombatData;
