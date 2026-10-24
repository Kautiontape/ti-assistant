import "server-only";
// The permanent copy of a game: everything Firestore deletes after 30 days
// (the game, its full action log, its timers) plus the list of board photos,
// as one JSON file in the bucket. Written when the game ends and by the daily
// job for any game changed since its last export, so every game is saved
// before its expiry.
import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "../../util/server";
import { readPrivate, writePrivate } from "./private";
import { exportPath, getBucket, listPhotos, photoPath, storageReady } from "./storage";

const toJson = (_key: string, value: unknown) => (value instanceof Timestamp ? value.toDate().toISOString() : value);

export async function exportGame(gameId: string) {
  if (!storageReady()) return false;
  const db = await getFirestoreAdmin();
  const gameRef = db.collection("games").doc(gameId);
  const [game, log, timers, photos] = await Promise.all([
    gameRef.get(),
    gameRef.collection("actionLog").orderBy("timestampMillis").get(),
    db.collection("timers").doc(gameId).get(),
    listPhotos(gameId),
  ]);
  if (!game.exists) return false;
  const body = {
    format: "ktn-ti-export",
    version: 1,
    gameId,
    exportedAt: new Date().toISOString(),
    game: game.data(),
    timers: timers.data() ?? null,
    actionLog: log.docs.map((d) => ({ id: d.id, ...d.data() })),
    photos: photos.map((p) => ({ ...p, path: photoPath(gameId, p.id), thumbPath: photoPath(gameId, p.id, true) })),
  };
  await getBucket().file(exportPath(gameId)).save(JSON.stringify(body, toJson), {
    resumable: false,
    metadata: { contentType: "application/json", cacheControl: "no-store" },
  });
  await writePrivate(gameId, { exportedAt: Date.now(), exportedUpdate: game.get("lastUpdate") ?? 0 });
  return true;
}

// Games changed since their last export (or never exported). The daily job
// runs this, so a game is saved within a day of its last change. It looks back
// 25 days (games expire after 30), so a few days with the job or the bucket
// down still catch up. lastUpdate comes from the phones' clocks, hence the margin.
export async function exportChangedGames() {
  if (!storageReady()) return { exported: 0, failed: 0 };
  const db = await getFirestoreAdmin();
  const since = Date.now() - 25 * 24 * 60 * 60 * 1000;
  const games = await db.collection("games").where("lastUpdate", ">=", since).select("lastUpdate").get();
  let exported = 0, failed = 0;
  for (const g of games.docs) {
    const priv = await readPrivate(g.id);
    if ((priv.exportedUpdate ?? -1) >= (g.get("lastUpdate") ?? 0)) continue;
    try {
      if (await exportGame(g.id)) exported++;
    } catch (e) {
      failed++;
      console.log(`export of ${g.id} failed`, e);
    }
  }
  return { exported, failed };
}
