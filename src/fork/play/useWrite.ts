"use client";
// The fork's layer around upstream's useDataUpdate: every event carries who did it,
// one action can send several events, a second tap waits for the first, a failed
// write says so, and undo only reverses the newest action, which it names first.
import { useRef, useState } from "react";
import { useActionLog, useGameId, useViewOnly } from "../../context/dataHooks";
import { useDataUpdate } from "../../util/api/dataUpdate";
import { useUndo } from "../../util/api/undo";
import { ActionLog, Optional } from "../../util/types/types";
import { Actor, actorOf, newestGroup } from "./logic";

export interface Toast { id: number; text: string; undo?: boolean; tone?: "error" }

export function useWrite(seat: Optional<FactionId>, describe: (entries: ActionLog) => string) {
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

  async function write(events: GameUpdateData[], label: string, as?: FactionId) {
    if (viewOnly) {
      show({ text: "This game has a password. Enter it on the game's page to make changes.", tone: "error" });
      return false;
    }
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    const actor: Actor = { seat, as: as && as !== seat ? as : undefined, id: `${seat ?? "nobody"}:${Date.now()}` };
    let ok = true;
    for (const event of events) {
      const res = await dataUpdate({ ...event, actor } as unknown as GameUpdateData);
      if (res === undefined) { ok = false; break; }
    }
    busy.current = false;
    setPending(false);
    if (ok) {
      lastId.current = actor.id;
      show({ text: actor.as ? `${label} (you helped)` : label, undo: true });
    } else {
      show({ text: `Not saved: ${label}. Check the connection and try again.`, tone: "error" });
    }
    return ok;
  }

  // Undo the newest action. If someone else acted since this phone's last
  // action, say what the newest action is instead of undoing it blind.
  async function undoNewest(confirmOthers = false) {
    const group = newestGroup(log);
    if (!group.length || busy.current) return;
    const newestId = actorOf(group[0])?.id;
    if (!confirmOthers && lastId.current && newestId !== lastId.current) {
      show({ text: `Someone acted since. Newest: ${describe(group)}` });
      return "someone-else" as const;
    }
    busy.current = true;
    setPending(true);
    for (let i = 0; i < group.length; i++) await undo(gameId);
    busy.current = false;
    setPending(false);
    if (newestId === lastId.current) lastId.current = undefined;
    show({ text: `Undid: ${describe(group)}` });
  }

  return { write, undoNewest, pending, toast, setToast };
}
