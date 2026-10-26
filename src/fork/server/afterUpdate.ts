import "server-only";
// Runs after every save through upstream's dataUpdate route (seam S9), once
// the phone has its answer: Discord posts, and the permanent export when the
// game has ended. Failures are logged and never reach the phone.
import { getFirestoreAdmin } from "../../util/server";
import { reconcile } from "./discord";
import { exportGame } from "./exportGame";
import { readPrivate } from "./private";

export async function forkAfterUpdate(gameId: string) {
  await Promise.all([
    reconcile(gameId).catch((e) => console.log(`discord: ${gameId}`, e)),
    exportIfEnded(gameId).catch((e) => console.log(`export: ${gameId}`, e)),
  ]);
}

async function exportIfEnded(gameId: string) {
  const db = await getFirestoreAdmin();
  const game = await db.collection("games").doc(gameId).get();
  if (game.get("state.phase") !== "END") return;
  const priv = await readPrivate(gameId);
  if ((priv.exportedUpdate ?? -1) >= (game.get("lastUpdate") ?? 0)) return;
  await exportGame(gameId);
}
