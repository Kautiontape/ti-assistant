import { NextResponse } from "next/server";
import { validKey, validPin } from "../../../../../src/fork/notes/model";
import { claimSeat, releaseSeat, seatFromRequest } from "../../../../../src/fork/server/seats";
import { hasMessages } from "../../../../../src/fork/server/messages";
import { noteRef } from "../../../../../src/fork/server/notes";
import { validGameId } from "../../../../../src/fork/server/storage";

// Seat keys for a game (src/fork/server/seats.ts, docs/ktn/seats-and-notes.md).
// GET: which seat does my X-Seat-Key open? POST {faction, pin?, newPin?}: claim a
// free seat, join a taken one with its PIN, or (with my key) get a new PIN.
// DELETE: give up my seat (refused while it has notes or messages).
const no = { "Cache-Control": "no-store" };
const err = (error: string, status: number, extra: object = {}) => NextResponse.json({ error, ...extra }, { status, headers: no });
const keyOf = (req: Request) => { const k = req.headers.get("x-seat-key"); return validKey(k) ? k : undefined; };

export async function GET(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  return NextResponse.json({ faction: (await seatFromRequest(gameId, req)) ?? null }, { headers: no });
}

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  const body = await req.json().catch(() => undefined);
  if (!body || typeof body.faction !== "string" || body.faction.length > 80) return err("Which seat?", 400);
  if (body.pin !== undefined && !validPin(body.pin)) return err("The PIN is 6 digits.", 400, { taken: true });
  const r = await claimSeat(gameId, body.faction, { pin: body.pin, key: keyOf(req), newPin: body.newPin === true });
  if (!r.ok) return err(r.error, r.status, r.taken ? { taken: true } : {});
  return NextResponse.json({ key: r.key, pin: r.pin, joined: r.joined === true }, { headers: no });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return err("There's no such game.", 404);
  const faction = await seatFromRequest(gameId, req);
  if (!faction) return err("This phone doesn't hold a seat.", 403);
  const notes = await (await noteRef(gameId, faction)).get();
  if (notes.exists) {
    const n = notes.data() as { text?: string; sketches?: string };
    if ((n.text ?? "").trim() || (n.sketches && n.sketches !== "[]")) return err("This seat has notes, so it stays yours.", 409);
  }
  if (await hasMessages(gameId, faction)) return err("This seat has messages, so it stays yours.", 409);
  await releaseSeat(gameId, faction);
  return NextResponse.json({ ok: true }, { headers: no });
}
