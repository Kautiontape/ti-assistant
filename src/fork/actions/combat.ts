// Combat events. They change nothing in the game document: an open combat is
// the newest START_COMBAT with no END_COMBAT after it, read from the log, so
// undo, the archive and the replay get combats for free.

const sameStart = (a: StartCombatEvent, b: StartCombatEvent) =>
  a.faction === b.faction && a.defender === b.defender && a.kind === b.kind && a.planet === b.planet;
const sameEnd = (a: EndCombatEvent, b: EndCombatEvent) =>
  a.faction === b.faction && a.defender === b.defender && a.winner === b.winner;

abstract class LogOnlyHandler<D extends ForkUpdateData> implements Handler {
  constructor(public gameData: StoredGameData, public data: D) {}
  validate() {
    return true;
  }
  getUpdates(): Record<string, any> {
    return { [`state.paused`]: false, [`sequenceNum`]: "INCREMENT" };
  }
  getLogEntry(): ActionLogEntry<GameUpdateData> {
    return { timestampMillis: Date.now(), data: this.data };
  }
  abstract getActionLogAction(entry: ActionLogEntry<GameUpdateData>): ActionLogAction;
}

export class StartCombatHandler extends LogOnlyHandler<StartCombatData> {
  getActionLogAction(): ActionLogAction {
    return "IGNORE";
  }
}

export class UnstartCombatHandler extends LogOnlyHandler<UnstartCombatData> {
  getActionLogAction(entry: ActionLogEntry<GameUpdateData>): ActionLogAction {
    const d = entry.data as unknown as ForkUpdateData;
    return d.action === "START_COMBAT" && sameStart(d.event, this.data.event) ? "DELETE" : "IGNORE";
  }
}

export class EndCombatHandler extends LogOnlyHandler<EndCombatData> {
  getActionLogAction(): ActionLogAction {
    return "IGNORE";
  }
}

export class UnendCombatHandler extends LogOnlyHandler<UnendCombatData> {
  getActionLogAction(entry: ActionLogEntry<GameUpdateData>): ActionLogAction {
    const d = entry.data as unknown as ForkUpdateData;
    return d.action === "END_COMBAT" && sameEnd(d.event, this.data.event) ? "DELETE" : "IGNORE";
  }
}
