"use client";
// A draft from Firestore, live, and the one way to change it: the draft API.
import { doc, onSnapshot } from "firebase/firestore";
import { use, useEffect, useMemo, useState } from "react";
import { DatabaseFnsContext } from "../../context/contexts";
import DBConnection from "../../data/DBConnection";
import { Optional } from "../../util/types/types";
import { fromStored, tileInfo, type Draft, type DraftPlanet, type DraftSystem, type StoredDraft, type TileInfo } from "./milty";

export function useDraft(id: string) {
  const [state, setState] = useState<{ draft?: Draft; missing?: boolean }>({});
  useEffect(() => onSnapshot(doc(DBConnection.get(), "forkDrafts", id),
    (snap) => setState(snap.exists() ? { draft: fromStored(snap.data() as StoredDraft) } : { missing: true }),
    () => setState({ missing: true })), [id]);
  return state;
}

export type Toast = { id: number; text: string; error?: boolean };

export function useDraftApi(id: string) {
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
      const res = await fetch(`/api/fork/draft/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

// Upstream's base data (systems, planets, factions), loaded on every page.
export function useBase() {
  const db = use(DatabaseFnsContext);
  const systems = (db.getBaseValue("systems") ?? {}) as unknown as Record<string, DraftSystem | undefined>;
  const planets = (db.getBaseValue("planets") ?? {}) as unknown as Record<string, (DraftPlanet & { name: string; system?: string | number }) | undefined>;
  const factions = (db.getBaseValue("factions") ?? {}) as unknown as Record<string, BaseFaction | undefined>;
  const info = useMemo(() => {
    const cache = new Map<string, TileInfo>();
    return (id: string) => {
      if (!cache.has(id)) { const s = systems[id]; cache.set(id, s ? tileInfo(s, planets) : tileInfo({ id, type: "RED", expansion: "", planets: [] }, planets)); }
      return cache.get(id)!;
    };
  }, [systems, planets]);
  return { systems, planets, factions, info };
}
