"use client";
// A Twilight's Fall draft from Firestore, live; the one way to change it (the
// draft API); and a player's own cards, which only the API hands out.
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import DBConnection from "../../data/DBConnection";
import { Optional } from "../../util/types/types";
import { fromStored, isTfDraft, type StoredTfDraft, type TfDraft } from "./draft";

export function useTfDraft(id: string) {
  const [state, setState] = useState<{ draft?: TfDraft; missing?: boolean; error?: boolean; milty?: boolean }>({});
  // A refused read (rules not deployed) is an error, not a missing draft.
  useEffect(() => onSnapshot(doc(DBConnection.get(), "forkDrafts", id),
    (snap) => {
      if (!snap.exists()) return setState({ missing: true });
      const data = snap.data() as StoredTfDraft;
      setState(isTfDraft(data) ? { draft: fromStored(data) } : { milty: true });
    },
    () => setState({ error: true })), [id]);
  return state;
}

export type Toast = { id: number; text: string; error?: boolean };

export function useTfApi(id: string) {
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<Optional<Toast>>();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(t);
  }, [toast?.id]);
  const say = (text: string, error?: boolean) => setToast({ id: Date.now(), text, error });
  async function act(body: Record<string, unknown>, done?: string): Promise<Optional<Record<string, unknown>>> {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/fork/tfdraft/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { say(json.error ?? "Not saved. Check the connection and try again.", true); return; }
      if (done) say(done);
      return json;
    } catch {
      say("Not saved. Check the connection and try again.", true);
    } finally {
      setPending(false);
    }
  }
  return { act, pending, toast, say };
}

export type Hand = { choose: string[]; kept: string[]; staged: string | null; step: string | null; log: number };

// One player's cards, fetched again whenever the draft moves on.
export function useHand(id: string, player: Optional<number>, version: number) {
  const [hand, setHand] = useState<Optional<Hand>>();
  useEffect(() => {
    if (player === undefined) { setHand(undefined); return; }
    let live = true;
    fetch(`/api/fork/tfdraft/${id}?player=${player}`).then((r) => (r.ok ? r.json() : undefined)).then((h) => { if (live) setHand(h); }).catch(() => {});
    return () => { live = false; };
  }, [id, player, version]);
  return hand;
}

// Which player this phone belongs to, remembered per draft.
export function useMe(id: string) {
  const key = `tfdraft-me-${id}`;
  const [me, setMeState] = useState<Optional<number>>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { try { const v = localStorage.getItem(key); setMeState(v === null ? undefined : Number(v)); } catch {} setLoaded(true); }, [key]);
  const setMe = (v: Optional<number>) => { setMeState(v); try { v === undefined ? localStorage.removeItem(key) : localStorage.setItem(key, String(v)); } catch {} };
  return [me, setMe, loaded] as const;
}
