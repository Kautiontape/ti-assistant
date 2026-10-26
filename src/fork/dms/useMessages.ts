"use client";
// The phone's side of direct messages (app/api/fork/messages). Phones can't
// listen to server-only documents, so this polls: fast while the Messages sheet
// is open, slowly otherwise (for the unread count), and not at all while the
// page is hidden. What a phone has read is kept in localStorage.
import { useCallback, useEffect, useRef, useState } from "react";
import { getSeatKey, seatHeaders } from "../notes/seatClient";
import { markSeen, unreadTotal, type Line, type Seen } from "./model";

export const POLL_OPEN_MS = 6000;
export const POLL_IDLE_MS = 30000;

const seenKey = (gameId: string, seat: string) => `play-dm-seen-${gameId}-${seat}`;
const SEEN_EVENT = "play-dm-seen";
const readSeen = (gameId: string, seat: string): Seen => {
  try { const s = JSON.parse(localStorage.getItem(seenKey(gameId, seat)) ?? "{}"); return s && typeof s === "object" ? s : {}; } catch { return {}; }
};
const url = (gameId: string) => `/api/fork/messages/${encodeURIComponent(gameId)}`;

export type DmState = { lines: Line[]; over: boolean; loaded: boolean; offline: boolean };

export function useMessages(gameId: string, seat: string | undefined, open: boolean, enabled = true) {
  const [st, setSt] = useState<DmState>({ lines: [], over: false, loaded: false, offline: false });
  const [seen, setSeen] = useState<Seen>({});
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const lines = useRef<Line[]>([]);
  lines.current = st.lines;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!seat) return;
    const reread = () => setSeen(readSeen(gameId, seat));
    reread();
    window.addEventListener(SEEN_EVENT, reread);
    return () => window.removeEventListener(SEEN_EVENT, reread);
  }, [gameId, seat]);

  useEffect(() => {
    if (!seat || !enabled) return;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      clearTimeout(timer);
      if (!document.hidden && getSeatKey(gameId)) {
        try {
          const r = await fetch(url(gameId), { headers: seatHeaders(gameId), cache: "no-store" });
          if (!dead) {
            if (r.ok) { const j = await r.json(); setSt({ lines: j.lines ?? [], over: !!j.over, loaded: true, offline: false }); }
            else setSt((s) => ({ ...s, loaded: true, offline: r.status >= 500 }));
          }
        } catch { if (!dead) setSt((s) => ({ ...s, loaded: true, offline: true })); }
      }
      if (!dead) timer = setTimeout(run, open ? POLL_OPEN_MS : POLL_IDLE_MS);
    };
    run();
    const wake = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", wake);
    return () => { dead = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, [gameId, seat, open, enabled, tick]);

  // The conversation with `other` has been looked at.
  const read = useCallback((other: string) => {
    if (!seat) return;
    const cur = readSeen(gameId, seat);
    const next = markSeen(lines.current, seat, other, cur);
    if (next === cur) return;
    try { localStorage.setItem(seenKey(gameId, seat), JSON.stringify(next)); window.dispatchEvent(new Event(SEEN_EVENT)); } catch { setSeen(next); }
  }, [gameId, seat]);

  // Sends, then adds the line at once; the next poll confirms it.
  const send = useCallback(async (to: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await fetch(url(gameId), { method: "POST", headers: { "Content-Type": "application/json", ...seatHeaders(gameId) }, body: JSON.stringify({ to, text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.error ?? "That didn't send." };
      if (alive.current) setSt((s) => ({ ...s, lines: [...s.lines, j.line] }));
      return { ok: true };
    } catch { return { ok: false, error: "Couldn't reach the server. Your message is still in the box." }; }
  }, [gameId]);

  const unread = seat ? unreadTotal(st.lines, seat, seen) : 0;
  return { ...st, seen, unread, read, send, refresh: () => setTick((t) => t + 1) };
}
