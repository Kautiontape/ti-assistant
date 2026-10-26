import { NextResponse } from "next/server";
import { cleanText, SendLimiter } from "../../../../../src/fork/dms/model";
import { gameInfo, readAll, readSeat, sendMessage } from "../../../../../src/fork/server/messages";
import { seatFromRequest } from "../../../../../src/fork/server/seats";
import { validGameId } from "../../../../../src/fork/server/storage";

// Direct messages between two seats (src/fork/dms/, docs/ktn/seats-and-notes.md).
// Stored in forkMessages, which no Firestore rule lets a browser read. The sender
// is the seat the X-Seat-Key opens, never anything in the URL or body.
// GET: my conversations; once the game is over (phase END), every conversation,
// to any phone with a seat key for this game. POST {to, text}: send (not after the end).
const no = { "Cache-Control": "no-store" };
const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: no });
const limiter = new SendLimiter();

export async function GET(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  const faction = await seatFromRequest(gameId, req);
  if (!faction) return err("Messages belong to a seat. Pick yours first.", 403);
  const game = await gameInfo(gameId);
  if (!game) return err("There's no such game.", 404);
  const lines = game.over ? await readAll(gameId) : await readSeat(gameId, faction, game.factions);
  return NextResponse.json({ faction, over: game.over, lines }, { headers: no });
}

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  if (!(Number(req.headers.get("content-length") ?? NaN) < 8 * 1024)) return err("That message is too long.", 413);
  const faction = await seatFromRequest(gameId, req);
  if (!faction) return err("Messages belong to a seat. Pick yours first.", 403);
  const body = await req.json().catch(() => undefined);
  const text = cleanText(body?.text);
  if (!text) return err("Write a message of up to 1000 characters.", 400);
  const game = await gameInfo(gameId);
  if (!game) return err("There's no such game.", 404);
  if (game.over) return err("The game is over. Messages are open to everyone now.", 409);
  if (typeof body.to !== "string" || body.to === faction || !game.factions.includes(body.to)) return err("Who is this for?", 400);
  if (!limiter.take(`${gameId}:${faction}`)) return err("Slow down a little. Try again in a minute.", 429);
  const r = await sendMessage(gameId, faction, body.to, text, game.deleteAt);
  if (!r.ok) return err(r.error, r.status);
  return NextResponse.json({ ok: true, line: r.line }, { headers: no });
}
