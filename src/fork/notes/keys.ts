// Seat keys and PINs, and the wrong-PIN limiter: the server's half of
// model.ts. Kept apart because it needs node:crypto, which can't go in the
// phone's bundle. No server-only imports, so node tests can load it.
import { createHash, randomBytes, randomInt } from "node:crypto";

// ---- Seat keys ----
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newSeatKey = () => randomBytes(24).toString("base64url");
export const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
// The PIN is short, so it is salted with its seat: equal PINs in two seats hash differently.
export const hashPin = (gameId: string, faction: string, pin: string) => sha256(`pin:${gameId}:${faction}:${pin}`);
export const hashKey = (key: string) => sha256(`key:${key}`);

export type SeatRecord = { keyHash: string; pinHash: string; claimedAt: number; moreKeyHashes?: string[] };
export const MAX_KEYS_PER_SEAT = 8;

export const hasKey = (seat: SeatRecord, key: string) => {
  const h = hashKey(key);
  return seat.keyHash === h || !!seat.moreKeyHashes?.includes(h);
};

// 5 wrong PINs per 10 minutes for a game+faction, kept in memory (a restart
// forgets them, which only gives an attacker a fresh 5).
export class PinLimiter {
  private misses = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  constructor(max = 5, windowMs = 10 * 60 * 1000) { this.max = max; this.windowMs = windowMs; }
  private recent(k: string, now: number) {
    const r = (this.misses.get(k) ?? []).filter((t) => now - t < this.windowMs);
    if (r.length) this.misses.set(k, r); else this.misses.delete(k);
    return r;
  }
  blocked(k: string, now = Date.now()) { return this.recent(k, now).length >= this.max; }
  // Minutes (rounded up) until another try.
  waitMinutes(k: string, now = Date.now()) {
    const r = this.recent(k, now);
    return r.length < this.max ? 0 : Math.ceil(((r[0] ?? 0) + this.windowMs - now) / 60000);
  }
  miss(k: string, now = Date.now()) { this.misses.set(k, [...this.recent(k, now), now]); }
  clear(k: string) { this.misses.delete(k); }
}

