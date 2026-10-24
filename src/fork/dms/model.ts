// Pure parts of direct messages, shared by the server and the phone (no
// server-only imports, so node tests can load it). See docs/ktn/seats-and-notes.md.

export const DM_LIMITS = {
  text: 1000, // characters per message
  messages: 300, // per conversation (Firestore documents are 1 MB)
  chars: 120_000, // text in one conversation, worst case ~480 KB in UTF-8
};

export type Msg = { f: string; t: string; at: number }; // as stored: from, text, sent at (ms)
export type Line = { from: string; to: string; text: string; at: number }; // as the API returns it

// A conversation has one document, whichever way round the two seats are.
export const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
export const pairId = (gameId: string, x: string, y: string) => `${gameId}__${pairOf(x, y).join("__")}`;

// The text to store, or undefined when there is nothing to send. Line breaks
// stay; only the ends are trimmed and control characters dropped.
export function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return;
  const t = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return t && t.length <= DM_LIMITS.text ? t : undefined;
}

// Whether one more message fits in a conversation.
export function roomFor(msgs: Msg[], text: string): boolean {
  return msgs.length < DM_LIMITS.messages && msgs.reduce((n, m) => n + m.t.length, 0) + text.length <= DM_LIMITS.chars;
}

// A new message's time: strictly after the last one, so order and "unread" never tie.
export const nextAt = (msgs: Msg[], now = Date.now()) => Math.max(now, (msgs[msgs.length - 1]?.at ?? 0) + 1);

// A few messages per minute per seat and game, kept in memory (a restart forgets them).
export class SendLimiter {
  private sent = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  constructor(max = 20, windowMs = 60_000) { this.max = max; this.windowMs = windowMs; }
  // True (and counted) when the send is allowed.
  take(k: string, now = Date.now()) {
    const r = (this.sent.get(k) ?? []).filter((t) => now - t < this.windowMs);
    if (r.length >= this.max) { this.sent.set(k, r); return false; }
    this.sent.set(k, [...r, now]);
    return true;
  }
}

// ---- The phone's view ----

export const byTime = (a: Line, b: Line) => a.at - b.at || (a.from < b.from ? -1 : 1);

// The conversation with one other seat, oldest first.
export const threadWith = (lines: Line[], me: string, other: string) =>
  lines.filter((l) => (l.from === me && l.to === other) || (l.from === other && l.to === me)).sort(byTime);

// What a phone has read: for each other seat, the time of the newest message seen.
export type Seen = Record<string, number>;
export const unreadFrom = (lines: Line[], me: string, other: string, seen: Seen) =>
  lines.filter((l) => l.from === other && l.to === me && l.at > (seen[other] ?? 0)).length;
export const unreadTotal = (lines: Line[], me: string, seen: Seen) =>
  lines.filter((l) => l.to === me && l.at > (seen[l.from] ?? 0)).length;
export const markSeen = (lines: Line[], me: string, other: string, seen: Seen): Seen => {
  const newest = Math.max(seen[other] ?? 0, ...threadWith(lines, me, other).map((l) => l.at));
  return newest === (seen[other] ?? 0) ? seen : { ...seen, [other]: newest };
};

// After the game: everyone's messages in one list, oldest first.
export const timeline = (lines: Line[]) => [...lines].sort(byTime);
