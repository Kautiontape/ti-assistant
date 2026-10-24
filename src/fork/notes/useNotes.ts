"use client";
// Loads and saves a seat's notes. Saves on change after a short pause; the
// latest text is also kept in localStorage until the server has it, so a dead
// connection (or a closed sheet) loses nothing, and is retried.
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyNotes, type Notes } from "./model";
import { seatHeaders } from "./seatClient";

export type SaveState = "loading" | "saved" | "saving" | "unsaved" | "offline" | "refused";

const draftKey = (gameId: string) => `play-notes-draft-${gameId}`;
const readDraft = (gameId: string, seat: string): Notes | undefined => {
  try { const d = JSON.parse(localStorage.getItem(draftKey(gameId)) ?? "null"); if (d?.seat === seat && d.notes) return d.notes as Notes; } catch { /* none */ }
};
const writeDraft = (gameId: string, seat: string, notes?: Notes) => {
  try { notes ? localStorage.setItem(draftKey(gameId), JSON.stringify({ seat, notes })) : localStorage.removeItem(draftKey(gameId)); } catch { /* no storage: the server copy still works */ }
};

export const SAVE_PAUSE_MS = 800;
export const RETRY_MS = 5000;

export function useNotes(gameId: string, seat: string, enabled: boolean) {
  const [notes, setNotesState] = useState<Notes>(emptyNotes());
  const [state, setState] = useState<SaveState>("loading");
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false); // the server's copy has been read; editing waits for it
  const [reload, setReload] = useState(0);
  const latest = useRef<Notes>(notes);
  const version = useRef(0); // bumps on each edit; a save only clears the draft if nothing changed meanwhile
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);
  const saving = useRef(false);
  const alive = useRef(true);

  const save = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (saving.current) { timer.current = setTimeout(save, 300); return; }
    saving.current = true;
    const sent = version.current;
    if (alive.current) setState("saving");
    let again = false;
    try {
      const r = await fetch(`/api/fork/notes/${encodeURIComponent(gameId)}`, { method: "PUT", headers: { "Content-Type": "application/json", ...seatHeaders(gameId) }, body: JSON.stringify(latest.current) });
      if (r.ok) {
        if (version.current === sent) { dirty.current = false; writeDraft(gameId, seat); if (alive.current) { setState("saved"); setError(undefined); } }
        else again = true;
      } else {
        const j = await r.json().catch(() => ({}));
        // A 4xx will not get better by retrying: say why and keep the draft.
        if (r.status >= 400 && r.status < 500) { if (alive.current) { setState("refused"); setError(j.error ?? "These notes couldn't be saved."); } }
        else throw new Error("server");
      }
    } catch {
      // After the sheet closes the draft stays in localStorage and is sent when it opens again.
      if (alive.current) { setState("offline"); timer.current = setTimeout(save, RETRY_MS); }
    }
    saving.current = false;
    if (again) return save();
  }, [gameId, seat]);

  const edit = useCallback((fn: (n: Notes) => Notes) => {
    const next = fn(latest.current);
    latest.current = next;
    version.current++;
    dirty.current = true;
    setNotesState(next);
    setState("unsaved");
    setError(undefined);
    writeDraft(gameId, seat, next);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_PAUSE_MS);
  }, [gameId, seat, save]);

  // Load: the server's copy, unless this phone has a newer unsaved draft.
  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    let dead = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const draft = readDraft(gameId, seat);
      try {
        const r = await fetch(`/api/fork/notes/${encodeURIComponent(gameId)}`, { headers: seatHeaders(gameId), cache: "no-store" });
        if (dead) return;
        if (!r.ok) throw new Error(String(r.status));
        const n = draft ?? ((await r.json()).notes as Notes);
        latest.current = n; setNotesState(n); setLoaded(true);
        if (draft) { dirty.current = true; save(); } else setState("saved");
      } catch {
        if (dead) return;
        // Without the server's copy a first save could overwrite it, so editing waits until it can be read.
        setState("offline");
        loadTimer = setTimeout(() => !dead && setReload((x) => x + 1), RETRY_MS);
      }
    })();
    return () => { dead = true; clearTimeout(loadTimer); };
  }, [gameId, seat, enabled, reload, save]);

  // Back online: try now. On leaving, send what is pending.
  useEffect(() => {
    alive.current = true;
    const online = () => { if (dirty.current) save(); };
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      alive.current = false;
      clearTimeout(timer.current);
      if (dirty.current && !saving.current) save();
    };
  }, [save]);

  return { notes, edit, state, error, loaded, retry: save };
}
