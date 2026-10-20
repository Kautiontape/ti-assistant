"use client";
// The fork's layer around upstream's useDataUpdate: every event carries who did it,
// one action can send several events, a second tap waits for the first, a failed
// write says so, and undo only reverses the action the phone showed.
import { collection, getDocsFromServer, limit, orderBy, query } from "firebase/firestore";
import { useRef, useState } from "react";
import DBConnection from "../../data/DBConnection";
import { useActionLog, useGameId, useViewOnly } from "../../context/dataHooks";
import { useDataUpdate } from "../../util/api/dataUpdate";
import { useUndo } from "../../util/api/undo";
import { ActionLog, Optional } from "../../util/types/types";
import { Actor, groupKey, newestGroup } from "./logic";

// Upstream rebuilds these log entries from the event alone (revealObjective.ts,
// addTech.ts), so the actor also rides inside the event for them.
const EVENT_ONLY = new Set(["REVEAL_OBJECTIVE", "HIDE_OBJECTIVE", "REMOVE_TECH"]);
function withActor(e: GameUpdateData, actor: Actor) {
  const d = e as unknown as { action: string; event?: Record<string, unknown> };
  return (EVENT_ONLY.has(d.action) ? { ...d, actor, event: { ...d.event, actor } } : { ...d, actor }) as unknown as GameUpdateData;
}

export interface Toast { id: number; text: string; undo?: boolean; tone?: "error" }

// `locked` runs instead of a write while the game is view-only (it has a password
// this device hasn't entered); /play opens its password sheet.
export function useWrite(seat: Optional<FactionId>, describe: (entries: ActionLog) => string, table = false, locked?: () => void) {
  const dataUpdate = useDataUpdate();
  const undo = useUndo();
  const gameId = useGameId();
  const viewOnly = useViewOnly();
  const log = useActionLog();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<Optional<Toast>>();
  const lastId = useRef<Optional<string>>(undefined);

  const show = (t: Omit<Toast, "id">) => setToast({ ...t, id: Date.now() });
  const refuse = () => (locked ? locked() : show({ text: "This game has a password. Enter it to make changes.", tone: "error" }));

  async function write(events: GameUpdateData[], label: string, as?: FactionId) {
    if (viewOnly) {
      refuse();
      return false;
    }
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    const actor: Actor = { seat, as: as && as !== seat ? as : undefined, id: `${seat ?? "nobody"}:${Date.now()}`, ...(table ? { table: true } : {}) };
    let ok = true;
    for (const event of events) {
      const res = await dataUpdate(withActor(event, actor));
      if (res === undefined) { ok = false; break; }
    }
    if (ok) {
      // Some writes cancel an earlier entry instead of adding one (taking back a
      // tech or an objective scored this turn, "Back to the game"). Offer Undo only
      // if the server's newest action is this one.
      let undoable = true;
      try { undoable = groupKey(newestGroup(await serverNewest())) === actor.id; } catch { /* offline: keep Undo; it re-checks */ }
      lastId.current = undoable ? actor.id : undefined;
      show({ text: actor.as && !table ? `${label} (you helped)` : label, undo: undoable });
    }
    busy.current = false;
    setPending(false);
    if (!ok) {
      show({ text: `Not saved: ${label}. Check the connection and try again.`, tone: "error" });
    }
    return ok;
  }

  // The newest entries as the server has them. Upstream's UNDO removes the
  // server's newest entry, which can be newer than what this phone has shown.
  async function serverNewest(): Promise<ActionLog> {
    const snap = await getDocsFromServer(query(collection(DBConnection.get(), "games", gameId, "actionLog"), orderBy("timestampMillis", "desc"), limit(10)));
    const fresh = snap.docs.map((d) => d.data() as ActionLogEntry<GameUpdateData>);
    // Prefer the store's copies, which other helpers (whose turn it was) know.
    return fresh.map((e) => log.find((l) => l.timestampMillis === e.timestampMillis && l.data.action === e.data.action) ?? e);
  }

  // Undo this phone's last action (from the toast), or the action a button was
  // drawn with (`shown`, from groupKey). Only if it is still the server's newest
  // action; otherwise say what the newest action is and leave it.
  async function undoNewest(shown?: string) {
    const target = shown ?? lastId.current;
    if (viewOnly) { refuse(); return; }
    if (!target || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      let group: ActionLog;
      try {
        group = newestGroup(await serverNewest());
      } catch {
        show({ text: "Couldn't check the game for newer changes, so nothing was undone. Try again.", tone: "error" });
        return;
      }
      if (!group.length) return;
      if (groupKey(group) !== target) {
        show({ text: `Someone acted since. Newest: ${describe(group)}` });
        return "someone-else" as const;
      }
      for (let i = 0; i < group.length; i++) await undo(gameId);
      if (target === lastId.current) lastId.current = undefined;
      show({ text: `Undid: ${describe(group)}` });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return { write, undoNewest, pending, toast, setToast };
}
