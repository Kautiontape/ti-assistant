import "server-only";
// forkNotes/<gameId>__<factionId>: a seat's private notes. No Firestore rule
// lets a browser read it; it expires with the game (deleteAt; setup-ttl.sh).
import { getFirestoreAdmin } from "../../util/server";

export async function noteRef(gameId: string, faction: string) {
  const db = await getFirestoreAdmin();
  return db.collection("forkNotes").doc(`${gameId}__${faction}`);
}
