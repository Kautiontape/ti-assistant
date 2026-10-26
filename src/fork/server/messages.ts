import "server-only";
// forkMessages/<gameId>__<a>__<b>: one document per pair of seats (a < b), with
// the conversation as an array (capped, see DM_LIMITS). No Firestore rule lets a
// browser read it; it expires with the game (deleteAt; setup-ttl.sh).
import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "../../util/server";
import { DM_LIMITS, nextAt, pairId, pairOf, roomFor, type Line, type Msg } from "../dms/model";

type Stored = { gameId: string; a: string; b: string; msgs: Msg[] };

const linesOf = (d: Stored): Line[] => (d.msgs ?? []).map((m) => ({ from: m.f, to: m.f === d.a ? d.b : d.a, text: m.t, at: m.at }));

export async function gameInfo(gameId: string) {
  const db = await getFirestoreAdmin();
  const game = await db.collection("games").doc(gameId).get();
  if (!game.exists) return;
  return { factions: Object.keys(game.get("factions") ?? {}), over: game.get("state.phase") === "END", deleteAt: game.get("deleteAt") as Timestamp | undefined };
}

// Everything this seat has sent or received (one read per other seat).
export async function readSeat(gameId: string, me: string, factions: string[]): Promise<Line[]> {
  const db = await getFirestoreAdmin();
  const refs = factions.filter((f) => f !== me).map((o) => db.collection("forkMessages").doc(pairId(gameId, me, o)));
  if (!refs.length) return [];
  return (await db.getAll(...refs)).flatMap((s) => (s.exists ? linesOf(s.data() as Stored) : []));
}

// Every conversation in a game, oldest first. Callers only use it for a finished game.
export async function readAll(gameId: string): Promise<Line[]> {
  const db = await getFirestoreAdmin();
  const snap = await db.collection("forkMessages").where("gameId", "==", gameId).get();
  return snap.docs.flatMap((s) => linesOf(s.data() as Stored)).sort((x, y) => x.at - y.at);
}

export type SendResult = { ok: true; line: Line } | { ok: false; status: number; error: string };

export async function sendMessage(gameId: string, from: string, to: string, text: string, deleteAt?: Timestamp): Promise<SendResult> {
  const db = await getFirestoreAdmin();
  const ref = db.collection("forkMessages").doc(pairId(gameId, from, to));
  const [a, b] = pairOf(from, to);
  return db.runTransaction<SendResult>(async (tx) => {
    const cur = ((await tx.get(ref)).data() as Stored | undefined)?.msgs ?? [];
    if (!roomFor(cur, text)) return { ok: false, status: 413, error: `This conversation is full (${DM_LIMITS.messages} messages).` };
    const m: Msg = { f: from, t: text, at: nextAt(cur) };
    tx.set(ref, { gameId, a, b, msgs: [...cur, m], ...(deleteAt ? { deleteAt } : {}) });
    return { ok: true, line: { from, to, text, at: m.at } };
  });
}

// Whether a seat is in any conversation. A seat that has messages stays claimed
// when its phone leaves, like one with notes, so the next claimant can't read them.
export async function hasMessages(gameId: string, faction: string): Promise<boolean> {
  const db = await getFirestoreAdmin();
  const snap = await db.collection("forkMessages").where("gameId", "==", gameId).get();
  return snap.docs.some((s) => { const d = s.data() as Stored; return (d.a === faction || d.b === faction) && d.msgs?.length > 0; });
}
