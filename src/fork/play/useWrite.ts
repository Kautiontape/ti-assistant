"use client";
// The fork's layer around upstream's useDataUpdate: every event carries who did it,
// one action can send several events, a second tap waits for the first, a failed
// write says so, and undo only reverses the action the phone showed. Turn-flow
// writes say what the phone saw (`expect`, src/fork/server/guard.ts), so the same
// tap on two phones at once happens once.
import { collection, getDocsFromServer, limit, orderBy, query } from "firebase/firestore";
import DBConnection from "../../data/DBConnection";
import { use, useRef, useState } from "react";
import { DatabaseFnsContext } from "../../context/contexts";
import { useActionLog, useGameId, useViewOnly } from "../../context/dataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { useDataUpdate } from "../../util/api/dataUpdate";
import { ACTION_TURN_BOUNDARIES, TURN_BOUNDARIES } from "../../util/api/actionLog";
import { updateGameData } from "../../util/api/handler";
import { getOppositeHandler } from "../../util/api/opposite";
import { updateActionLog } from "../../util/api/update";
import { poster } from "../../util/api/util";
import { ActionLog, Optional } from "../../util/types/types";
import { Actor, groupKey, newestGroup } from "./logic";

// Upstream rebuilds these log entries from the event alone (revealObjective.ts,
// addTech.ts), so the actor also rides inside the event for them.
const EVENT_ONLY = new Set(["REVEAL_OBJECTIVE", "HIDE_OBJECTIVE", "REMOVE_TECH"]);
function withActor(e: GameUpdateData, actor: Actor) {
  const d = e as unknown as { action: string; event?: Record<string, unknown> };
  return (EVENT_ONLY.has(d.action) ? { ...d, actor, event: { ...d.event, actor } } : { ...d, actor }) as unknown as GameUpdateData;
}

// Where /play undoes an entry with something other than upstream's UNDO
// (src/fork/actions/agendaUndo.ts): a resolve that had riders or a hidden agenda,
// and the hidden agenda of a resolved Covert Legislation.
function undoInstead(e: ActionLogEntry<GameUpdateData>, group: ActionLog, log: ActionLog): Optional<GameUpdateData> {
  if (e.data.action === "RESOLVE_AGENDA" && e.data.event.phase !== "ACTION") {
    // The turn before the resolve: entries back to the previous turn boundary.
    // This phone's copy of its own entry can carry the phone's timestamp, so match the agenda.
    const agendaId = e.data.event.agenda;
    const at = log.findIndex((x) => x.data.action === "RESOLVE_AGENDA" && x.data.event.agenda === agendaId);
    const before: ActionLog = [];
    for (const x of at < 0 ? [] : log.slice(at + 1)) {
      if (TURN_BOUNDARIES.includes(x.data.action)) break;
      before.push(x);
    }
    const turn = before.filter((x) => x.data.action === "PLAY_RIDER" || x.data.action === "SELECT_SUB_AGENDA").map((x) => ({ action: x.data.action, event: (x.data as { event?: unknown }).event }));
    if (!turn.length) return undefined;
    const { agenda, target, prevSpeaker } = e.data.event;
    return { action: "UNRESOLVE_AGENDA", event: { agenda, target, prevSpeaker, turn } } as unknown as GameUpdateData;
  }
  if (e.data.action !== "SELECT_SUB_AGENDA" || e.data.event.subAgenda === "None") return undefined;
  const resolve = group.find((x) => x.data.action === "RESOLVE_AGENDA" && x.data.event.agenda === "Covert Legislation");
  if (!resolve || resolve.data.action !== "RESOLVE_AGENDA") return undefined;
  return { action: "UNREVEAL_SUB_AGENDA", event: { subAgenda: e.data.event.subAgenda, target: resolve.data.event.target } } as unknown as GameUpdateData;
}

// What the phone saw when it was tapped, for the writes two phones tend to make
// together (the server refuses a write whose game has moved on).
function expectFor(e: GameUpdateData, state: GameState, log: ActionLog) {
  const turn: ActionLog = [];
  for (const x of log) { if (ACTION_TURN_BOUNDARIES.includes(x.data.action)) break; turn.push(x); }
  switch (e.action) {
    case "ADVANCE_PHASE":
      return { phase: state.phase, round: state.round };
    case "END_TURN":
    case "PASS":
      return { phase: state.phase, active: state.activeplayer };
    case "SELECT_ACTION":
      // Changing the action (one is already shown) replaces it, so only the first pick is guarded.
      return { phase: state.phase, active: state.activeplayer, ...(turn.some((x) => x.data.action === "SELECT_ACTION") ? {} : { noAction: true }) };
    case "START_COMBAT":
      return { noCombat: true };
  }
  return undefined;
}

// Upstream's useUndo (src/util/api/undo.ts), with the server time of the entry
// it means to undo, so two phones undoing at once undo it once.
function useCheckedUndo() {
  const databaseFns = use(DatabaseFnsContext);
  return async (gameId: string, newest: number) => {
    const now = Date.now();
    const gameTime: number = databaseFns.getValue("timers.game") ?? 0;
    const updatePromise = poster(`/api/${gameId}/dataUpdate`, { action: "UNDO", expect: { newest } }, now, gameTime);
    databaseFns.update((stored) => {
      const entry = (stored.actionLog ?? [])[0];
      const handler = entry ? getOppositeHandler(stored, entry.data) : undefined;
      if (!handler || !handler.validate()) return stored;
      updateGameData(stored, handler.getUpdates());
      updateActionLog(stored, handler, now, stored.timers?.game ?? 0);
      if (stored.timers) stored.timers.paused = false;
      return stored;
    }, "CLIENT");
    try {
      return await updatePromise;
    } catch {
      databaseFns.reset();
    }
  };
}

export interface Toast { id: number; text: string; undo?: boolean; tone?: "error" }

// `locked` runs instead of a write while the game is view-only (it has a password
// this device hasn't entered); /play opens its password sheet.
export function useWrite(seat: Optional<FactionId>, describe: (entries: ActionLog) => string, table = false, locked?: () => void) {
  const dataUpdate = useDataUpdate();
  const undo = useCheckedUndo();
  const state = useGameState();
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
      const expect = expectFor(event, state, log);
      const res = await dataUpdate(withActor((expect ? { ...event, expect } : event) as GameUpdateData, actor));
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
      show({ text: `Not saved: ${label}. Someone may have just done it, or the connection dropped; check and try again.`, tone: "error" });
    }
    return ok;
  }

  // The newest entries as the server has them. Upstream's UNDO removes the
  // server's newest entry, which can be newer than what this phone has shown.
  async function serverNewest(): Promise<ActionLog> {
    return (await serverNewestWithTimes()).entries;
  }
  async function serverNewestWithTimes() {
    const snap = await getDocsFromServer(query(collection(DBConnection.get(), "games", gameId, "actionLog"), orderBy("timestampMillis", "desc"), limit(10)));
    const fresh = snap.docs.map((d) => d.data() as ActionLogEntry<GameUpdateData>);
    // Prefer the store's copies, which other helpers (whose turn it was) know;
    // `times` keeps the server's own times, which a store copy may not have.
    return { entries: fresh.map((e) => log.find((l) => l.timestampMillis === e.timestampMillis && l.data.action === e.data.action) ?? e), times: fresh.map((e) => e.timestampMillis) };
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
      let times: number[];
      try {
        const newest = await serverNewestWithTimes();
        group = newestGroup(newest.entries);
        times = newest.times;
      } catch {
        show({ text: "Couldn't check the game for newer changes, so nothing was undone. Try again.", tone: "error" });
        return;
      }
      if (!group.length) return;
      if (groupKey(group) !== target) {
        show({ text: `Someone acted since. Newest: ${describe(group)}` });
        return "someone-else" as const;
      }
      for (const [i, e] of group.entries()) {
        const instead = undoInstead(e, group, log);
        const res = instead ? await dataUpdate(instead) : await undo(gameId, times[i]!);
        if (res === undefined) {
          show({ text: "Not undone: someone may have just undone it, or the connection dropped. Check the log.", tone: "error" });
          return;
        }
      }
      if (target === lastId.current) lastId.current = undefined;
      show({ text: `Undid: ${describe(group)}` });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return { write, undoNewest, pending, toast, setToast };
}
