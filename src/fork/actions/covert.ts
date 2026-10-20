// Undo for Covert Legislation's hidden agenda. Resolving sends SELECT_SUB_AGENDA,
// then RESOLVE_AGENDA, which also passes the hidden agenda. Upstream's UNDO of the
// resolve repeals Covert Legislation but not the hidden agenda: it looks for
// SELECT_SUB_AGENDA in the current turn only, and RESOLVE_AGENDA is a turn
// boundary (resolveAgenda.ts, "Need to bypass turn boundaries"). /play's undo
// sends this in place of the second UNDO: it repeals the hidden agenda the way
// upstream's undo would, and deletes the SELECT_SUB_AGENDA entry without adding one.
import { RepealAgendaHandler } from "../../util/model/resolveAgenda";

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
