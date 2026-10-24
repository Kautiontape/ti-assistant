import "server-only";
// forkPrivate/<gameId>: the fork's server-only state for a game. No Firestore
// rule lets a browser read it (deploy/ktn/firebase/firestore.rules), because it
// holds the game's Discord webhook. It expires with the game (deleteAt, the
// same TTL policy as games; setup-ttl.sh).
import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "../../util/server";

export type DiscordEvent = "scoreboard" | "phase" | "objectives" | "agenda" | "combat" | "photos" | "final";
export const DISCORD_EVENTS: DiscordEvent[] = ["scoreboard", "phase", "objectives", "agenda", "combat", "photos", "final"];

export type Posted = { m: string; t: number; h?: string }; // Discord message id; when its log entry was written; a digest of the entry

export type DiscordState = {
  on: boolean;
  events: DiscordEvent[];
  webhook?: string; // the game's own webhook; otherwise the server's FORK_DISCORD_WEBHOOK
  threadId?: string; // "" when the webhook's channel can't hold threads
  seenMillis?: number; // newest log entry already looked at
  fromMillis?: number; // when posts were turned on or the webhook changed: nothing older is posted
  seen?: Record<string, string>; // recent log entries already handled -> digest of their data
  posted?: Record<string, Posted>; // "log:<entry id>" or "photo:<id>" -> message
  error?: string; // Discord said the webhook is gone; posts stop until settings change
};

export type GamePrivate = {
  deleteAt?: Timestamp;
  discord?: DiscordState;
  exportedAt?: number;
  exportedUpdate?: number; // the game's lastUpdate when it was exported
};

export async function privateRef(gameId: string) {
  const db = await getFirestoreAdmin();
  return db.collection("forkPrivate").doc(gameId);
}

export async function readPrivate(gameId: string): Promise<GamePrivate> {
  return ((await (await privateRef(gameId)).get()).data() ?? {}) as GamePrivate;
}

export async function writePrivate(gameId: string, data: Partial<GamePrivate>) {
  const db = await getFirestoreAdmin();
  const game = await db.collection("games").doc(gameId).get();
  const deleteAt = game.get("deleteAt") as Timestamp | undefined;
  const fields = { ...data, ...(deleteAt ? { deleteAt } : {}) };
  // Each field given replaces the stored one whole (so posted messages can be dropped).
  await (await privateRef(gameId)).set(fields, { mergeFields: Object.keys(fields) });
}
