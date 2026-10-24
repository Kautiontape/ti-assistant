import "server-only";
// Seat keys: which phone holds which seat, so private things (notes, later DMs)
// can be kept to that seat. Server-only, in forkPrivate/<gameId>.seats. A seat
// never limits what anyone can do in the game; it only gates reading private
// things. See docs/ktn/seats-and-notes.md.
import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "../../util/server";
import { hasKey, hashKey, hashPin, MAX_KEYS_PER_SEAT, newPin, newSeatKey, PinLimiter, type SeatRecord } from "../notes/model";
import { privateRef, readPrivate } from "./private";

export const pinLimiter = new PinLimiter();

export type ClaimResult =
  | { ok: true; key: string; pin?: string; joined?: boolean }
  | { ok: false; status: number; error: string; taken?: boolean };

const seatsOf = (data: FirebaseFirestore.DocumentData | undefined) => ((data?.seats ?? {}) as Record<string, SeatRecord>);

// Claims a free seat (returns a key and a PIN), or joins a taken one with its
// PIN (returns another key for the new device; both keep working). A device that
// already holds the seat's key gets "ok" again, with a fresh PIN only if it asks.
export async function claimSeat(gameId: string, faction: string, opts: { pin?: string; key?: string; newPin?: boolean }): Promise<ClaimResult> {
  const db = await getFirestoreAdmin();
  const gameRef = db.collection("games").doc(gameId);
  const ref = await privateRef(gameId);
  const limitKey = `${gameId}:${faction}`;
  // Only a wrong PIN counts against the limit; it is recorded after the
  // transaction so a retried transaction can't count it twice.
  let wrong = false;
  const result = await db.runTransaction<ClaimResult>(async (tx) => {
    wrong = false;
    const game = await tx.get(gameRef);
    if (!game.exists || !Object.keys(game.get("factions") ?? {}).includes(faction)) return { ok: false, status: 404, error: "There's no such seat in this game." };
    const snap = await tx.get(ref);
    const seats = seatsOf(snap.data());
    const cur = seats[faction];
    const deleteAt = game.get("deleteAt") as Timestamp | undefined;
    const save = (next: Record<string, SeatRecord>) => {
      const fields = { seats: next, ...(deleteAt ? { deleteAt } : {}) };
      tx.set(ref, fields, { mergeFields: Object.keys(fields) });
    };
    if (!cur) {
      const key = newSeatKey(), pin = newPin();
      save({ ...seats, [faction]: { keyHash: hashKey(key), pinHash: hashPin(gameId, faction, pin), claimedAt: Date.now() } });
      return { ok: true, key, pin };
    }
    if (opts.key && hasKey(cur, opts.key)) {
      if (!opts.newPin) return { ok: true, key: opts.key };
      const pin = newPin();
      save({ ...seats, [faction]: { ...cur, pinHash: hashPin(gameId, faction, pin) } });
      return { ok: true, key: opts.key, pin };
    }
    if (!opts.pin) return { ok: false, status: 409, taken: true, error: "Someone has already taken this seat. Enter its PIN to use it here." };
    if (pinLimiter.blocked(limitKey)) return { ok: false, status: 429, error: `Too many wrong PINs. Try again in ${pinLimiter.waitMinutes(limitKey)} minutes.` };
    if (hashPin(gameId, faction, opts.pin) !== cur.pinHash) {
      wrong = true;
      return { ok: false, status: 403, taken: true, error: "That PIN isn't right." };
    }
    const key = newSeatKey();
    const more = [...(cur.moreKeyHashes ?? []), hashKey(key)].slice(-(MAX_KEYS_PER_SEAT - 1));
    save({ ...seats, [faction]: { ...cur, moreKeyHashes: more } });
    return { ok: true, key, joined: true };
  });
  if (wrong) pinLimiter.miss(limitKey);
  else if (result.ok && result.joined) pinLimiter.clear(limitKey);
  return result;
}

// The faction whose seat this request's X-Seat-Key opens, if any.
export async function seatFromRequest(gameId: string, req: Request): Promise<string | undefined> {
  const key = req.headers.get("x-seat-key");
  if (!key || key.length > 64) return;
  const seats = (await readPrivate(gameId)).seats ?? {};
  return Object.keys(seats).find((f) => hasKey(seats[f]!, key));
}

// Frees a seat (its phone gave it up). The route only allows it when the seat has no notes.
export async function releaseSeat(gameId: string, faction: string) {
  const ref = await privateRef(gameId);
  const db = await getFirestoreAdmin();
  await db.runTransaction(async (tx) => {
    const seats = seatsOf((await tx.get(ref)).data());
    if (!seats[faction]) return;
    delete seats[faction];
    tx.set(ref, { seats }, { mergeFields: ["seats"] });
  });
}
