import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { cleanNotes, emptyNotes, type Notes } from "../../../../../src/fork/notes/model";
import { noteRef } from "../../../../../src/fork/server/notes";
import { seatFromRequest } from "../../../../../src/fork/server/seats";
import { validGameId } from "../../../../../src/fork/server/storage";
import { getFirestoreAdmin } from "../../../../../src/util/server";

// A player's private notes (src/fork/notes/, docs/ktn/seats-and-notes.md). Stored
// in forkNotes/<gameId>__<factionId>, which no Firestore rule lets a browser read.
// Only the caller's own seat (X-Seat-Key) is ever read or written; the seat is
// never taken from the URL or body.
const no = { "Cache-Control": "no-store" };
const MAX_BODY = 400 * 1024;
const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: no });

export async function GET(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  const faction = await seatFromRequest(gameId, req);
  if (!faction) return err("Notes belong to a seat. Pick yours first.", 403);
  const d = (await (await noteRef(gameId, faction)).get()).data();
  let notes: Notes = emptyNotes();
  if (d) { try { notes = cleanNotes({ text: d.text, sketches: JSON.parse(d.sketches ?? "[]") }) ?? notes; } catch { /* unreadable: start empty */ } }
  return NextResponse.json({ faction, notes, savedAt: d?.savedAt ?? null }, { headers: no });
}

export async function PUT(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  const length = Number(req.headers.get("content-length") ?? NaN);
  if (!(length > 0)) return err("No notes came with that.", 411);
  if (length > MAX_BODY) return err("These notes are too big to save. Clear a sketch.", 413);
  const faction = await seatFromRequest(gameId, req);
  if (!faction) return err("Notes belong to a seat. Pick yours first.", 403);
  const notes = cleanNotes(await req.json().catch(() => undefined));
  if (!notes) return err("These notes are too big to save. Clear a sketch.", 413);
  const db = await getFirestoreAdmin();
  const game = await db.collection("games").doc(gameId).get();
  if (!game.exists) return err("There's no such game.", 404);
  const deleteAt = game.get("deleteAt") as Timestamp | undefined;
  const savedAt = Date.now();
  // Sketches go in as one JSON string: Firestore indexes every number in an array.
  await (await noteRef(gameId, faction)).set({ gameId, faction, text: notes.text, sketches: JSON.stringify(notes.sketches), savedAt, ...(deleteAt ? { deleteAt } : {}) });
  return NextResponse.json({ ok: true, savedAt }, { headers: no });
}
