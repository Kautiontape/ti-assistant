import "server-only";
// Two phones doing the same thing at once (seam S9). A /play write can carry
// `expect`: what the phone saw when it was tapped. Inside the save's
// transaction, a write whose game has moved on since is refused with 409
// instead of applied twice: a second "Start the status phase" would otherwise
// skip the status phase, and a second Undo would undo one action too many.
import type { DocumentData, DocumentReference, Transaction } from "firebase-admin/firestore";

export type Expect = {
  phase?: Phase; // the phase this write ends or acts in
  round?: number;
  active?: string; // whose turn the phone showed
  noAction?: boolean; // the phone showed no action chosen this turn
  noCombat?: boolean; // the phone showed no combat open this turn
  newest?: number; // UNDO: the server time of the entry the phone means to undo
};

export class ForkConflict extends Error {}

export async function forkGuard(t: Transaction, gameRef: DocumentReference<DocumentData>, gameData: StoredGameData, data: GameUpdateData) {
  const ex = (data as { expect?: Expect }).expect;
  if (!ex) return;
  const s = gameData.state;
  const turn: ActionLogEntry<GameUpdateData>[] = gameData.actionLog ?? [];
  if (ex.phase && s.phase !== ex.phase) throw new ForkConflict(`the game is in ${s.phase}, not ${ex.phase}`);
  if (ex.round !== undefined && s.round !== ex.round) throw new ForkConflict(`the game is in round ${s.round}, not ${ex.round}`);
  if (ex.active && s.activeplayer !== ex.active) throw new ForkConflict(`${s.activeplayer} is up, not ${ex.active}`);
  if (ex.noAction && turn.some((e) => e.data.action === "SELECT_ACTION")) throw new ForkConflict("this turn's action is already chosen");
  if (ex.noCombat) {
    const count = (a: string) => turn.filter((e) => e.data.action === a).length;
    if (count("START_COMBAT") > count("END_COMBAT")) throw new ForkConflict("a combat is already open");
  }
  if (ex.newest !== undefined) {
    const newest = await t.get(gameRef.collection("actionLog").orderBy("timestampMillis", "desc").limit(1));
    const at = newest.docs[0]?.get("timestampMillis");
    if (at !== ex.newest) throw new ForkConflict("someone changed the game since");
  }
}
