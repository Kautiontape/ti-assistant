// Pure parts of seats and notes, shared by the server routes and the phone:
// seat keys and PINs, the wrong-PIN limiter, and the notes shape with its caps.
// No server-only imports, so node tests can load it.
import { createHash, randomBytes, randomInt } from "node:crypto";

// ---- Seat keys ----
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newSeatKey = () => randomBytes(24).toString("base64url");
export const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
// The PIN is short, so it is salted with its seat: equal PINs in two seats hash differently.
export const hashPin = (gameId: string, faction: string, pin: string) => sha256(`pin:${gameId}:${faction}:${pin}`);
export const hashKey = (key: string) => sha256(`key:${key}`);
export const validPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{6}$/.test(pin);
export const validKey = (key: unknown): key is string => typeof key === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(key);

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

// ---- Notes ----
// Strokes are vectors in a page 1000 units wide and `h` units tall. Points are
// a flat [x, y, x, y, ...] list of integers.
export const PEN_COLORS = ["ink", "red", "blue", "green", "yellow"] as const;
export type PenColor = (typeof PEN_COLORS)[number];
export type Stroke = { c: PenColor; w: number; p: number[] };
export type Sketch = { id: string; map: boolean; h: number; strokes: Stroke[] };
export type Notes = { text: string; sketches: Sketch[] };

export const LIMITS = { text: 20000, sketches: 12, strokes: 300, pointsPerStroke: 500, points: 20000, minH: 200, maxH: 3000, widthMax: 24 };
export const emptyNotes = (): Notes => ({ text: "", sketches: [] });
const num = (n: unknown) => typeof n === "number" && Number.isFinite(n);

// Cleans whatever a client sent into a Notes within the caps; undefined when
// it is not notes or is over a cap (a client that stays inside the caps never
// sees that, so over-size is refused rather than trimmed).
export function cleanNotes(raw: unknown): Notes | undefined {
  if (!raw || typeof raw !== "object") return;
  const r = raw as { text?: unknown; sketches?: unknown };
  const text = typeof r.text === "string" ? r.text : "";
  if (text.length > LIMITS.text) return;
  const list = Array.isArray(r.sketches) ? r.sketches : [];
  if (list.length > LIMITS.sketches) return;
  let total = 0;
  const sketches: Sketch[] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") return;
    const { id, map, h, strokes } = s as Record<string, unknown>;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,24}$/.test(id) || !num(h) || !Array.isArray(strokes) || strokes.length > LIMITS.strokes) return;
    const H = Math.min(LIMITS.maxH, Math.max(LIMITS.minH, Math.round(h as number)));
    const out: Stroke[] = [];
    for (const st of strokes) {
      if (!st || typeof st !== "object") return;
      const { c, w, p } = st as Record<string, unknown>;
      if (!PEN_COLORS.includes(c as PenColor) || !num(w) || !Array.isArray(p) || p.length < 2 || p.length % 2 || p.length > LIMITS.pointsPerStroke * 2) return;
      total += p.length / 2;
      if (total > LIMITS.points || p.some((n) => !num(n))) return;
      out.push({ c: c as PenColor, w: Math.min(LIMITS.widthMax, Math.max(1, Math.round(w as number))), p: (p as number[]).map((n, i) => Math.round(Math.min(i % 2 ? H : 1000, Math.max(0, n)))) });
    }
    sketches.push({ id, map: map === true, h: H, strokes: out });
  }
  return { text, sketches };
}

export const pointCount = (n: Notes) => n.sketches.reduce((a, s) => a + s.strokes.reduce((b, st) => b + st.p.length / 2, 0), 0);
export const notesEmpty = (n: Notes) => !n.text.trim() && !n.sketches.length;

// Thins a freehand line: drops points closer than `min` units to the last kept
// one, keeping the first and last, and stays under the per-stroke cap.
export function thin(p: number[], min = 3): number[] {
  if (p.length <= 4) return p.slice();
  const g = (i: number) => p[i] ?? 0;
  const out = [g(0), g(1)];
  for (let i = 2; i < p.length - 2; i += 2) {
    if (Math.hypot(g(i) - (out[out.length - 2] ?? 0), g(i + 1) - (out[out.length - 1] ?? 0)) >= min) out.push(g(i), g(i + 1));
  }
  out.push(g(p.length - 2), g(p.length - 1));
  const cap = LIMITS.pointsPerStroke;
  if (out.length / 2 <= cap) return out;
  const n = out.length / 2, res: number[] = [];
  for (let k = 0; k < cap; k++) { const i = Math.round((k * (n - 1)) / (cap - 1)); res.push(out[i * 2] ?? 0, out[i * 2 + 1] ?? 0); }
  return res;
}

// An SVG path for a stroke ("M x y L x y ..."; a lone dot becomes a zero-length line).
export function strokePath(p: number[]): string {
  const pts = p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  return d;
}
