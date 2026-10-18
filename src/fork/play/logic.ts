// Pure helpers for the fork's /play screens. Upstream's rules stay upstream;
// these only read game data and the action log.
import { getClaimedPlanets } from "../../util/actionLog";
import { ActionLog, Optional } from "../../util/types/types";

export type NameOf = (id: Optional<string>) => string;
type Entry = ActionLogEntry<GameUpdateData>;

// Who did this, recorded by the fork's write layer on every event it sends.
export interface Actor {
  seat?: FactionId; // the phone's seat, if any
  as?: FactionId; // the faction the action was for, when it isn't the seat's
  id: string; // shared by every entry of one action, for grouped undo
}

export function actorOf(e: Optional<Entry>): Optional<Actor> {
  return (e?.data as unknown as { actor?: Actor })?.actor;
}

const TABLE_EVENTS = new Set(["REVEAL_OBJECTIVE", "REVEAL_AGENDA", "START_VOTING", "RESOLVE_AGENDA", "HIDE_AGENDA", "ADVANCE_PHASE", "END_GAME", "SWAP_MAP_TILES"]);

// The faction an entry is about, if any. `turn` is whose turn the entry fell in
// (see turnOwners), for entries such as SELECT_ACTION that name no faction.
export function subjectOf(e: Entry, turn?: FactionId): Optional<FactionId> {
  const ev = ((e.data as { event?: Record<string, unknown> }).event ?? {}) as Record<string, string>;
  const actor = actorOf(e);
  if (actor?.as) return actor.as;
  if (TABLE_EVENTS.has(e.data.action)) return undefined;
  if (e.data.action === "SET_SPEAKER") return ev.newSpeaker as FactionId;
  if (e.data.action === "ASSIGN_STRATEGY_CARD") return (ev.pickedBy ?? ev.assignedTo) as FactionId;
  return (ev.faction ?? ev.factionId ?? ev.assignedTo ?? turn ?? actor?.seat) as Optional<FactionId>;
}

// Whose turn each action-phase entry fell in. Upstream replays the whole game to
// know this; walking the log newest first is enough, because END_TURN records the
// player whose turn it ended and the newest turn belongs to the active player.
export function turnOwners(log: ActionLog, activeplayer: Optional<string>, phase: string) {
  const owners = new WeakMap<Entry, FactionId>();
  const real = (id: Optional<string>) => (id && id !== "None" ? (id as FactionId) : undefined);
  let current = phase === "ACTION" ? real(activeplayer) : undefined;
  for (const e of log) {
    if (e.data.action === "ADVANCE_PHASE") { current = undefined; continue; }
    if (e.data.action === "END_TURN") current = real((e.data.event as { prevFaction?: string }).prevFaction);
    if (current) owners.set(e, current);
  }
  return owners;
}

// One plain sentence per entry, without the subject; null for bookkeeping entries.
export function sentence(e: Entry, name: NameOf, isFaction: (id: string) => boolean): string | null {
  const ev = ((e.data as { event?: Record<string, unknown> }).event ?? {}) as Record<string, any>;
  const who = (id: string) => (isFaction(id) ? name(id) : id);
  switch (e.data.action) {
    case "SELECT_ACTION":
      if (ev.action === "Pass") return "passed";
      if (ev.action === "Tactical") return "took a tactical action";
      if (ev.action === "Component") return "took a component action";
      return `played ${ev.action}`;
    case "UNSELECT_ACTION": return `changed their mind about ${ev.action === "Tactical" || ev.action === "Component" ? `a ${String(ev.action).toLowerCase()} action` : ev.action}`;
    case "CLAIM_PLANET": return `took control of ${ev.planet}${ev.prevOwner ? ` from ${name(ev.prevOwner)}` : ""}`;
    case "UNCLAIM_PLANET": return `lost ${ev.planet}`;
    case "ADD_ATTACHMENT": return `attached ${ev.attachment} to ${ev.planet}`;
    case "ADD_TECH": return `researched ${ev.tech}`;
    case "REMOVE_TECH": return `removed ${ev.tech}`;
    case "SCORE_OBJECTIVE":
      return ev.objective === "Support for the Throne" && ev.key ? `received Support for the Throne from ${name(ev.key)}` : `scored ${ev.objective}`;
    case "UNSCORE_OBJECTIVE": return `lost ${ev.objective}`;
    case "REVEAL_OBJECTIVE": return `Objective revealed: ${ev.objective}`;
    case "ASSIGN_STRATEGY_CARD":
      return ev.pickedBy && ev.pickedBy !== ev.assignedTo ? `gave ${ev.id} to ${name(ev.assignedTo)}` : `picked ${ev.id}`;
    case "ADVANCE_PHASE": return ev.state?.phase ? `The ${String(ev.state.phase).toLowerCase()} phase ended` : "The game moved to the next phase";
    case "MARK_PRIMARY": return ev.completed ? "finished the primary" : null;
    case "MARK_SECONDARY": return ev.state === "DONE" ? "followed the secondary" : ev.state === "SKIPPED" ? "skipped the secondary" : null;
    case "SET_SPEAKER": return "became speaker";
    case "PLAY_COMPONENT": return `used ${ev.name}`;
    case "GAIN_RELIC": return `gained ${ev.relic}`;
    case "COMMIT_TO_EXPEDITION": return "committed to the Expedition";
    case "REVEAL_AGENDA": return `Agenda revealed: ${ev.agenda}`;
    case "CAST_VOTES": return ev.votes ? `cast ${ev.votes + (ev.extraVotes ?? 0)} votes for ${who(ev.target)}` : "abstained";
    case "RESOLVE_AGENDA": return `${ev.agenda}: ${who(ev.target)}`;
    case "PLAY_PROMISSORY_NOTE": return `played ${ev.card}`;
    case "PLAY_ACTION_CARD": return `played ${ev.card}`;
    case "MANUAL_VP_UPDATE": return `${ev.vps > 0 ? "gained" : "lost"} ${Math.abs(ev.vps)} point${Math.abs(ev.vps) === 1 ? "" : "s"} by hand`;
    case "END_GAME": return "The game ended";
    default: return null;
  }
}

// Undo groups: the newest entries that share one action id.
export function newestGroup(log: ActionLog): Entry[] {
  const first = log[0];
  if (!first) return [];
  const id = actorOf(first)?.id;
  if (!id) return [first];
  const out: Entry[] = [];
  for (const e of log) {
    if (actorOf(e)?.id !== id) break;
    out.push(e);
  }
  return out;
}

// What identifies one action: its actor id, or, for entries sent from upstream's
// screens, the newest entry's timestamp.
export function groupKey(group: Entry[]): Optional<string> {
  const first = group[0];
  return first ? actorOf(first)?.id ?? `t:${first.timestampMillis}` : undefined;
}

export interface PointGroup { label: string; points: number; items: string[] }

const OTHER_GROUPS: Record<string, string> = { "Imperial Point": "Imperial", "Custodians Token": "Custodians", "Support for the Throne": "Support for the Throne" };
const GROUP_ORDER = ["Stage I", "Stage II", "Secret", "Imperial", "Custodians", "Support for the Throne", "Other", "Adjustments"];

// Points by source; the same sums as upstream's computeVPs.
export function pointsBySource(objectives: Partial<Record<ObjectiveId, Objective>>, factionId: FactionId, manual: number) {
  const groups: Record<string, PointGroup> = {};
  let total = 0;
  for (const o of Object.values(objectives)) {
    if (!o) continue;
    const n = (o.scorers ?? []).filter((s) => s === factionId).length;
    if (!n) continue;
    const label = o.type === "STAGE ONE" ? "Stage I" : o.type === "STAGE TWO" ? "Stage II" : o.type === "SECRET" ? "Secret" : OTHER_GROUPS[o.id] ?? "Other";
    const pts = o.points * n;
    const g = (groups[label] ??= { label, points: 0, items: [] });
    g.points += pts;
    g.items.push(n > 1 ? `${o.name} ×${n}` : o.name);
    total += pts;
  }
  if (manual) {
    const g = (groups.Adjustments ??= { label: "Adjustments", points: 0, items: [] });
    g.points += manual;
    g.items.push(`${manual > 0 ? "+" : ""}${manual} by hand`);
    total += manual;
  }
  return { total, groups: GROUP_ORDER.filter((k) => groups[k]).map((k) => groups[k]!) };
}

// Upstream's claim rule (main/phase/action/ActionPhase.tsx, AdditionalActions):
// after the first claim in a turn, only planets in the same system.
export function claimablePlanets(planets: Partial<Record<PlanetId, Planet>>, factionId: FactionId, currentTurn: ActionLog): Planet[] {
  const claimed = getClaimedPlanets(currentTurn, factionId);
  return Object.values(planets).filter((planet): planet is Planet => {
    if (!planet || planet.owner === factionId || planet.locked) return false;
    if (claimed.some((c) => c.planet === planet.id)) return false;
    if (planet.attributes.includes("ocean")) return factionId === "Deepwrought Scholarate";
    if (planet.id === "Avernus" && planet.owner) return true;
    for (const c of claimed) {
      if (c.planet === "Avernus") continue;
      const prev = planets[c.planet];
      if (prev?.attributes.includes("ocean")) continue;
      if (prev?.faction) return planet.faction === prev.faction;
      if (prev?.system) return planet.system === prev.system;
      return false;
    }
    return true;
  });
}

// Checks and Balances: the picker gives the card to a player who still has room
// for one (upstream's ChecksAndBalancesMenu rule), or keeps it if nobody does.
export function checksAndBalancesTargets(cards: StrategyCard[], players: FactionId[], picker: FactionId): FactionId[] {
  const limit = players.length > 4 ? 1 : 2;
  const room = players.filter((id) => id !== picker && cards.filter((c) => c.faction === id).length < limit);
  return room.length ? room : [picker];
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// When the current turn (or phase) started, from the log's own timestamps.
export function turnStartedAt(log: ActionLog): Optional<number> {
  for (const e of log) {
    if (e.data.action === "END_TURN" || e.data.action === "ADVANCE_PHASE") return e.timestampMillis;
  }
  return log[log.length - 1]?.timestampMillis;
}
