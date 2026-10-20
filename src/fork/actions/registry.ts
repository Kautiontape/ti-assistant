// Seam S4: upstream's action switches fall back to these for actions they don't
// know (dataUpdate route, getHandler, getOppositeHandler, LogEntry). A new fork
// action is added here and in types.d.ts, never in upstream's files.
import { UnresolveAgendaHandler, UnrevealSubAgendaHandler } from "./agendaUndo";
import { EndCombatHandler, StartCombatHandler, UnendCombatHandler, UnstartCombatHandler } from "./combat";

const FORK_ACTIONS = new Set<string>(["START_COMBAT", "UNSTART_COMBAT", "END_COMBAT", "UNEND_COMBAT", "UNREVEAL_SUB_AGENDA", "UNRESOLVE_AGENDA"]);

export function isForkAction(action: string) {
  return FORK_ACTIONS.has(action);
}

export function getForkHandler(gameData: StoredGameData, data: GameUpdateData): Handler | undefined {
  const d = data as unknown as ForkUpdateData;
  switch (d.action) {
    case "START_COMBAT": return new StartCombatHandler(gameData, d);
    case "UNSTART_COMBAT": return new UnstartCombatHandler(gameData, d);
    case "END_COMBAT": return new EndCombatHandler(gameData, d);
    case "UNEND_COMBAT": return new UnendCombatHandler(gameData, d);
    case "UNREVEAL_SUB_AGENDA": return new UnrevealSubAgendaHandler(gameData, d);
    case "UNRESOLVE_AGENDA": return new UnresolveAgendaHandler(gameData, d);
  }
  return undefined;
}

export function getForkOpposite(gameData: StoredGameData, data: GameUpdateData): Handler | undefined {
  const d = data as unknown as ForkUpdateData;
  switch (d.action) {
    case "START_COMBAT": return new UnstartCombatHandler(gameData, { action: "UNSTART_COMBAT", event: d.event });
    case "END_COMBAT": return new UnendCombatHandler(gameData, { action: "UNEND_COMBAT", event: d.event });
  }
  return undefined;
}
