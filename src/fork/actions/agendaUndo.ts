import { RepealAgendaHandler } from "../../util/model/resolveAgenda";

// Undo of a resolved agenda, where upstream's UNDO misses things. Upstream's
// opposite of RESOLVE_AGENDA is RepealAgendaHandler, which looks in the current
// turn for the riders to take back and Covert Legislation's hidden agenda. When
// the resolve is undone, the current turn holds only the RESOLVE_AGENDA entry (a
// turn boundary), so both are missed: a rider's point or speaker stays, and the
// hidden agenda stays passed.

// UNRESOLVE_AGENDA: sent by /play in place of UNDO for a resolve that had riders
// or a hidden agenda. It carries those entries and runs upstream's
// RepealAgendaHandler with them as the turn, then deletes the RESOLVE_AGENDA entry.
export class UnresolveAgendaHandler implements Handler {
  constructor(public gameData: StoredGameData, public data: UnresolveAgendaData) {}
  validate() {
    return true;
  }
  getUpdates(): Record<string, any> {
    const { agenda, target, prevSpeaker, turn } = this.data.event;
    // Newest first, like the action log.
    const actionLog = turn.map((data, i) => ({ timestampMillis: turn.length - i, data }));
    return new RepealAgendaHandler({ ...this.gameData, actionLog }, { action: "REPEAL_AGENDA", event: { agenda, target, repealedBy: "UNDO", prevSpeaker } }).getUpdates();
  }
  getLogEntry(): ActionLogEntry<GameUpdateData> {
    return { timestampMillis: Date.now(), data: this.data as unknown as GameUpdateData };
  }
  getActionLogAction(entry: ActionLogEntry<GameUpdateData>): ActionLogAction {
    const d = entry.data;
    return d.action === "RESOLVE_AGENDA" && d.event.agenda === this.data.event.agenda ? "DELETE" : "IGNORE";
  }
}

// UNREVEAL_SUB_AGENDA: Covert Legislation's hidden agenda. Resolving sends SELECT_SUB_AGENDA,
// then RESOLVE_AGENDA, which also passes the hidden agenda. Upstream's UNDO of the
// resolve repeals Covert Legislation but not the hidden agenda: it looks for
// SELECT_SUB_AGENDA in the current turn only, and RESOLVE_AGENDA is a turn
// boundary (resolveAgenda.ts, "Need to bypass turn boundaries"). /play's undo
// sends this in place of the second UNDO: it repeals the hidden agenda the way
// upstream's undo would, and deletes the SELECT_SUB_AGENDA entry without adding one.
export class UnrevealSubAgendaHandler implements Handler {
  constructor(public gameData: StoredGameData, public data: UnrevealSubAgendaData) {}
  validate() {
    return true;
  }
  getUpdates(): Record<string, any> {
    const { subAgenda, target } = this.data.event;
    const updates = new RepealAgendaHandler(this.gameData, { action: "REPEAL_AGENDA", event: { agenda: subAgenda, target, repealedBy: "UNDO" } }).getUpdates();
    // Undoing Covert Legislation's resolve already stepped the agenda number back.
    delete updates["state.agendaNum"];
    return updates;
  }
  getLogEntry(): ActionLogEntry<GameUpdateData> {
    return { timestampMillis: Date.now(), data: this.data as unknown as GameUpdateData };
  }
  getActionLogAction(entry: ActionLogEntry<GameUpdateData>): ActionLogAction {
    const d = entry.data;
    return d.action === "SELECT_SUB_AGENDA" && d.event.subAgenda === this.data.event.subAgenda ? "DELETE" : "IGNORE";
  }
}
