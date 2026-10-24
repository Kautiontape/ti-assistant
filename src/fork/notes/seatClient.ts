"use client";
// The phone's side of seat keys (app/api/fork/seat). A phone keeps its key in
// localStorage `play-seat-key-<gameId>` and sends it as X-Seat-Key. Nothing
// here limits what the phone can do in the game; no key only means no notes.
import { useCallback, useEffect, useState } from "react";
import type { Optional } from "../../util/types/types";

const storeKey = (gameId: string) => `play-seat-key-${gameId}`;
export function getSeatKey(gameId: string): Optional<string> {
  try { return localStorage.getItem(storeKey(gameId)) || undefined; } catch { return undefined; }
}
const setSeatKey = (gameId: string, key?: string) => {
  try { key ? localStorage.setItem(storeKey(gameId), key) : localStorage.removeItem(storeKey(gameId)); } catch { /* private mode: no key survives a reload */ }
};
export const seatHeaders = (gameId: string): Record<string, string> => { const k = getSeatKey(gameId); return k ? { "X-Seat-Key": k } : {}; };
const url = (gameId: string) => `/api/fork/seat/${encodeURIComponent(gameId)}`;

type Claim = { ok: true; pin?: string } | { ok: false; taken?: boolean; offline?: boolean; error: string };

// Claims a free seat, or joins a taken one with its PIN. Stores the key it gets.
// A plain claim already in flight is shared, so an effect that runs twice (React's
// dev double-run) doesn't claim twice and lose the PIN to the second 409.
const claiming = new Map<string, Promise<Claim>>();
export function claimSeat(gameId: string, faction: string, opts: { pin?: string; newPin?: boolean } = {}): Promise<Claim> {
  if (opts.pin || opts.newPin) return postClaim(gameId, faction, opts);
  const id = `${gameId}\n${faction}`;
  const p = claiming.get(id) ?? postClaim(gameId, faction, opts).finally(() => claiming.delete(id));
  claiming.set(id, p);
  return p;
}
async function postClaim(gameId: string, faction: string, opts: { pin?: string; newPin?: boolean } = {}): Promise<Claim> {
  try {
    const r = await fetch(url(gameId), { method: "POST", headers: { "Content-Type": "application/json", ...seatHeaders(gameId) }, body: JSON.stringify({ faction, ...opts }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, taken: !!j.taken, error: j.error ?? "That didn't work." };
    setSeatKey(gameId, j.key);
    return { ok: true, pin: j.pin };
  } catch {
    return { ok: false, offline: true, error: "Couldn't reach the server." };
  }
}

// Which seat this phone's key opens: a faction, null (none), or undefined (offline).
async function whoseKey(gameId: string): Promise<string | null | undefined> {
  try {
    const r = await fetch(url(gameId), { headers: seatHeaders(gameId), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()).faction ?? null;
  } catch { return undefined; }
}

// Leaves a seat on this phone. The server frees it when it has no notes.
async function dropKey(gameId: string) {
  if (!getSeatKey(gameId)) return;
  await fetch(url(gameId), { method: "DELETE", headers: seatHeaders(gameId) }).catch(() => {});
  setSeatKey(gameId);
}

export type SeatKeyState = {
  status: "none" | "checking" | "ready" | "taken" | "offline";
  pin?: string; // shown once, right after a seat is claimed
  error?: string;
  busy: boolean;
};

// Keeps this phone's key in step with its seat: claims a free seat, asks for
// the PIN of a taken one. Runs while the component that uses it is open.
export function useSeatKey(gameId: string, seat: Optional<string>) {
  const [st, setSt] = useState<SeatKeyState>({ status: "none", busy: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let dead = false;
    const done = (s: SeatKeyState) => { if (!dead) setSt(s); };
    (async () => {
      if (!seat) { await dropKey(gameId); return done({ status: "none", busy: false }); }
      done({ status: "checking", busy: true });
      if (getSeatKey(gameId)) {
        const who = await whoseKey(gameId);
        if (who === undefined) return done({ status: "offline", busy: false, error: "Couldn't reach the server." });
        if (who === seat) return done({ status: "ready", busy: false });
        await dropKey(gameId); // the key is for another seat
      }
      if (dead) return;
      const r = await claimSeat(gameId, seat);
      if (r.ok) return done({ status: "ready", pin: r.pin, busy: false });
      done({ status: r.offline ? "offline" : r.taken ? "taken" : "offline", error: r.taken ? undefined : r.error, busy: false });
    })();
    return () => { dead = true; };
  }, [gameId, seat, tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  const join = useCallback(async (pin: string) => {
    if (!seat) return;
    setSt((s) => ({ ...s, busy: true, error: undefined }));
    const r = await claimSeat(gameId, seat, { pin });
    setSt(r.ok ? { status: "ready", busy: false } : { status: r.offline ? "offline" : "taken", busy: false, error: r.error });
  }, [gameId, seat]);
  const newPin = useCallback(async () => {
    if (!seat) return;
    setSt((s) => ({ ...s, busy: true }));
    const r = await claimSeat(gameId, seat, { newPin: true });
    setSt(r.ok ? { status: "ready", pin: r.pin, busy: false } : { status: "ready", busy: false, error: r.error });
  }, [gameId, seat]);
  return { ...st, retry, join, newPin };
}
