import "server-only";
// Discord posts through a webhook (Shawn's pick, 2026-10-24): one thread per
// game in a forum channel, with the scoreboard, phase changes, objectives,
// agenda results, combats, board photos and the final result. Never whose
// turn it is.
//
// The server posts, never the phones, so a post goes out once however many
// phones are open. After each save (seam S9), `reconcile` reads the log
// entries it hasn't seen yet and posts the ones the game asked for; a post
// whose entry has since been undone is deleted from Discord. Saves for one
// game reconcile one at a time (this server runs as a single process).
import { createHash } from "crypto";
import { buildCompleteGameData } from "../../data/gameDataBuilder";
import { getBaseData } from "../../data/baseData";
import { computeVPs } from "../../util/factions";
import { getFirestoreAdmin, getIntl } from "../../util/server";
import { DISCORD_EVENTS, DiscordEvent, DiscordState, readPrivate, writePrivate } from "./private";
import type { PhotoMeta } from "./storage";

const API = (process.env.FORK_DISCORD_API ?? "https://discord.com/api").replace(/\/$/, "");
// Only Discord's own webhook addresses, so a game can't point the server anywhere else.
const WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{5,25})\/([\w-]{20,100})\/?$/;

export function validWebhook(url: string) {
  return WEBHOOK.test(url.trim());
}

function webhookUrl(st: DiscordState): string | undefined {
  const raw = st.webhook || process.env.FORK_DISCORD_WEBHOOK;
  const m = raw?.trim().match(WEBHOOK);
  return m ? `${API}/webhooks/${m[1]}/${m[2]}` : undefined;
}

export function serverWebhook() {
  return !!process.env.FORK_DISCORD_WEBHOOK?.trim().match(WEBHOOK);
}

// A game that never set anything posts everything when the server has a webhook.
export function discordState(stored?: DiscordState): DiscordState {
  return stored ?? { on: serverWebhook(), events: [...DISCORD_EVENTS] };
}

// ---------- sending ----------

type Message = { content?: string; embeds?: object[]; file?: { name: string; data: Buffer; type: string } };

class DiscordError extends Error {
  constructor(public status: number, public body: string) {
    super(`Discord answered ${status}: ${body.slice(0, 200)}`);
  }
}

// One request at a time per webhook, spaced out, honouring 429s.
const gq = globalThis as typeof globalThis & { __forkDiscordQueues?: Map<string, Promise<unknown>> };
const queues = (gq.__forkDiscordQueues ??= new Map());
function queued<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    try {
      return await fn();
    } finally {
      await new Promise((r) => setTimeout(r, 400));
    }
  });
  queues.set(key, next);
  return next;
}

async function call(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (res.status === 429 && attempt < 3) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((r) => setTimeout(r, Math.min(10, body.retry_after ?? 1) * 1000 + 100));
      continue;
    }
    return res;
  }
}

function withQuery(url: string, query: Record<string, string | undefined>) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

async function send(base: string, msg: Message, opts: { threadId?: string; threadName?: string }): Promise<{ id: string; channel_id: string }> {
  const payload = {
    content: msg.content,
    embeds: msg.embeds,
    thread_name: opts.threadName,
    allowed_mentions: { parse: [] },
    ...(msg.file ? { attachments: [{ id: 0, filename: msg.file.name }] } : {}),
  };
  let body: BodyInit;
  const headers: Record<string, string> = {};
  if (msg.file) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", new Blob([new Uint8Array(msg.file.data)], { type: msg.file.type }), msg.file.name);
    body = form;
  } else {
    body = JSON.stringify(payload);
    headers["Content-Type"] = "application/json";
  }
  return queued(base, async () => {
    const res = await call(withQuery(base, { wait: "true", thread_id: opts.threadId || undefined }), { method: "POST", body, headers });
    if (!res.ok) throw new DiscordError(res.status, await res.text());
    return res.json();
  });
}

async function remove(base: string, messageId: string, threadId?: string) {
  return queued(base, async () => {
    const res = await call(withQuery(`${base}/messages/${messageId}`, { thread_id: threadId || undefined }), { method: "DELETE" });
    // 404: someone already deleted it in Discord.
    if (!res.ok && res.status !== 404) throw new DiscordError(res.status, await res.text());
  });
}

// ---------- what the posts say ----------

const PHASES: Record<string, string> = { SETUP: "Setup", STRATEGY: "Strategy phase", ACTION: "Action phase", STATUS: "Status phase", AGENDA: "Agenda phase", EDICT: "Edict phase", END: "Game over" };
const BASE = () => (process.env.NEXT_PUBLIC_BASE_URL || "https://ti.kautiontape.com").replace(/\/$/, "");

let baseDataCache: Promise<BaseData> | undefined;
const baseData = () =>
  (baseDataCache ??= getIntl("en").then((intl) => getBaseData(intl)).catch((e) => { baseDataCache = undefined; throw e; }));

type View = Awaited<ReturnType<typeof gameView>>;
async function gameView(gameId: string) {
  const db = await getFirestoreAdmin();
  const stored = (await db.collection("games").doc(gameId).get()).data() as StoredGameData | undefined;
  if (!stored) return undefined;
  const bd = await baseData();
  const gd = buildCompleteGameData({ ...stored, actionLog: [] } as StoredGameData, bd);
  const ids = Object.keys(gd.factions) as FactionId[];
  const name = (id: string) => {
    const f = gd.factions[id as FactionId];
    if (!f) return id;
    const short = bd.factions[id as FactionId]?.shortname ?? id;
    return f.playerName ? `${short} (${f.playerName})` : short;
  };
  const vps = (id: FactionId) => computeVPs(gd.factions, id, gd.objectives ?? {});
  const goal = gd.options["victory-points"] ?? 10;
  return { id: gameId, gd, bd, ids, name, vps, goal };
}

function scoreboard(v: NonNullable<View>) {
  const rows = [...v.ids].sort((a, b) => v.vps(b) - v.vps(a));
  return {
    title: `Scores · round ${v.gd.state.round} · first to ${v.goal}`,
    description: rows.map((id) => `**${v.vps(id)}** · ${v.name(id)}`).join("\n"),
    color: 0x8fa6c8,
  };
}

function threadName(gameId: string, v: NonNullable<View>) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const who = v.ids.map((id) => v.bd.factions[id]?.shortname ?? id).join(", ");
  return `TI ${date} · ${gameId} · ${who}`.slice(0, 100);
}

function opener(gameId: string, v: NonNullable<View>): Message {
  return {
    content: `**A new game of Twilight Imperium** · ${v.ids.length} players, first to ${v.goal} points.\n${v.ids.map((id) => `• ${v.name(id)}`).join("\n")}\n${BASE()}/en/play/${gameId}`,
  };
}

function describe(entry: ActionLogEntry<GameUpdateData>, v: NonNullable<View>, events: Set<DiscordEvent>, newestPhase: boolean): Message | undefined {
  const d = entry.data as GameUpdateData & { event: any };
  switch (d.action) {
    case "ADVANCE_PHASE": {
      if (!newestPhase) return undefined;
      const phase = v.gd.state.phase;
      if (phase === "END") return undefined; // END_GAME's post covers it
      const board = events.has("scoreboard") && (events.has("phase") || phase === "STRATEGY") ? [scoreboard(v)] : undefined;
      if (events.has("phase")) return { content: `**Round ${v.gd.state.round} · ${PHASES[phase] ?? phase}**`, embeds: board };
      return board ? { embeds: board } : undefined;
    }
    case "SCORE_OBJECTIVE": {
      if (!events.has("objectives")) return undefined;
      const obj = v.bd.objectives[d.event.objective as ObjectiveId];
      const pts = obj?.points ?? 1;
      return { content: `**${v.name(d.event.faction)}** scored *${obj?.name ?? d.event.objective}* (+${pts}) · now ${v.vps(d.event.faction)} of ${v.goal}` };
    }
    case "REVEAL_OBJECTIVE": {
      if (!events.has("objectives")) return undefined;
      const obj = v.bd.objectives[d.event.objective as ObjectiveId];
      if (!obj || (obj.type !== "STAGE ONE" && obj.type !== "STAGE TWO")) return undefined;
      return { content: `New public objective: *${obj.name}* (${obj.type === "STAGE ONE" ? "stage I" : "stage II"}, ${obj.points} point${obj.points === 1 ? "" : "s"})` };
    }
    case "MANUAL_VP_UPDATE": {
      if (!events.has("objectives") || !d.event.vps) return undefined;
      const n = d.event.vps as number;
      return { content: `**${v.name(d.event.faction)}** ${n > 0 ? "gained" : "lost"} ${Math.abs(n)} point${Math.abs(n) === 1 ? "" : "s"} by hand · now ${v.vps(d.event.faction)} of ${v.goal}` };
    }
    case "RESOLVE_AGENDA": {
      if (!events.has("agenda")) return undefined;
      const agenda = v.bd.agendas[d.event.agenda as AgendaId]?.name ?? d.event.agenda;
      const target = d.event.target as string;
      const outcome = v.gd.factions[target as FactionId] ? v.name(target) : (v.bd.planets[target as PlanetId]?.name ?? target);
      return { content: `Agenda · **${agenda}**: ${outcome}` };
    }
    case "END_COMBAT": {
      if (!events.has("combat")) return undefined;
      const e = d.event as EndCombatEvent;
      const result = e.winner === "None" ? "no winner" : `${v.name(e.winner)} won`;
      return { content: `Combat · ${v.name(e.faction)} attacked ${v.name(e.defender)}: ${result}` };
    }
    case "END_GAME": {
      if (!events.has("final")) return undefined;
      const rows = [...v.ids].sort((a, b) => v.vps(b) - v.vps(a));
      const top = rows[0];
      return {
        content: `**Game over after ${v.gd.state.round} rounds.** ${top ? `${v.name(top)} wins with ${v.vps(top)} points.` : ""}\n${BASE()}/en/play/${v.id}`,
        embeds: [scoreboard(v)],
      };
    }
  }
  return undefined;
}

// ---------- keeping Discord in step with the log ----------

// One promise chain per game, shared by every route bundle in the process.
const g = globalThis as typeof globalThis & { __forkDiscordLocks?: Map<string, Promise<unknown>> };
const locks = (g.__forkDiscordLocks ??= new Map());
export function withGameLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(id, next);
  next.finally(() => locks.get(id) === next && locks.delete(id)).catch(() => {});
  return next;
}

async function save(id: string, st: DiscordState) {
  await writePrivate(id, { discord: st });
}

// A failure worth trying again on the next save: Discord or the network was
// down, or still rate-limiting after three waits.
const transient = (e: unknown) => !(e instanceof DiscordError) || e.status === 429 || e.status >= 500;
// The webhook or its thread is gone: no later post can succeed either.
const gone = (e: unknown) => e instanceof DiscordError && e.status === 404 && /"code":\s*(10003|10015)\b/.test(e.body);

// Posts the game's opening message, making its thread. A webhook whose
// channel isn't a forum can't make threads: the posts then go in the channel.
async function ensureThread(id: string, st: DiscordState, base: string, v: NonNullable<View>) {
  if (st.threadId !== undefined) return;
  try {
    const m = await send(base, opener(id, v), { threadName: threadName(id, v) });
    st.threadId = m.channel_id;
  } catch (e) {
    if (!(e instanceof DiscordError) || e.status !== 400) throw e;
    await send(base, opener(id, v), {});
    st.threadId = "";
  }
  await save(id, st);
}

// Deletes a post; true once it's gone (already deleted in Discord counts).
async function unpost(base: string, st: DiscordState, key: string) {
  const p = st.posted?.[key];
  if (!p) return true;
  try {
    await remove(base, p.m, st.threadId);
  } catch (e) {
    console.log(`discord: delete ${key} failed`, e);
    return false;
  }
  delete st.posted![key];
  return true;
}

const digest = (data: unknown) => createHash("sha1").update(JSON.stringify(data)).digest("base64").slice(0, 10);
const OVERLAP = 30 * 1000; // two saves can commit in the other order than their timestamps
const UNDO_WINDOW = 12 * 3600 * 1000;

export function reconcile(id: string) {
  return withGameLock(id, () => reconcileNow(id));
}

async function reconcileNow(id: string) {
  const priv = await readPrivate(id);
  const st = discordState(priv.discord);
  const base = webhookUrl(st);
  if (!st.on || !base || st.error) return;
  const db = await getFirestoreAdmin();
  const logRef = db.collection("games").doc(id).collection("actionLog");
  const now = Date.now();
  // A game that never had Discord set up starts from the save that called this.
  const since = Math.max((st.seenMillis ?? now - 15000) - OVERLAP, st.fromMillis ?? 0);
  const fresh = (await logRef.where("timestampMillis", ">", since).orderBy("timestampMillis").limit(200).get()).docs;
  st.posted ??= {};
  st.seen ??= {};
  // Entries already handled, unless upstream rewrote one since (REPLACE keeps its id).
  const todo = fresh.filter((d) => st.seen![d.id] !== digest(d.get("data")));
  const recent = Object.entries(st.posted).filter(([k, p]) => k.startsWith("log:") && p.t > now - UNDO_WINDOW);
  if (!todo.length && !recent.length && st.threadId !== undefined) return;

  const v = await gameView(id);
  if (!v) return;
  try {
    await ensureThread(id, st, base, v);

    // Undone: the entry a post was about is gone from the log.
    if (recent.length) {
      const docs = await db.getAll(...recent.map(([k]) => logRef.doc(k.slice(4))));
      for (const doc of docs) if (!doc.exists && (await unpost(base, st, `log:${doc.id}`))) await save(id, st);
    }

    const events = new Set(st.events);
    const lastPhase = todo.map((d) => d.get("data.action")).lastIndexOf("ADVANCE_PHASE");
    for (const [i, doc] of todo.entries()) {
      const entry = doc.data() as ActionLogEntry<GameUpdateData>;
      const key = `log:${doc.id}`;
      const hash = digest(entry.data);
      // A rewritten entry: its old post goes, and the new text is posted.
      if (st.posted[key] && st.posted[key].h !== hash && !(await unpost(base, st, key))) break;
      if (!st.posted[key]) {
        try {
          const msg = describe(entry, v, events, i === lastPhase);
          if (msg) st.posted[key] = { m: (await send(base, msg, { threadId: st.threadId })).id, t: entry.timestampMillis, h: hash };
        } catch (e) {
          if (transient(e) || gone(e)) throw e;
          // Discord refused this one post (too long, say): skip it, not the game.
          console.log(`discord: ${id} skipped ${key}`, e);
        }
      }
      st.seen[doc.id] = hash;
      st.seenMillis = Math.max(st.seenMillis ?? 0, entry.timestampMillis);
      await save(id, st);
    }
  } catch (e) {
    if (gone(e)) {
      // A deleted thread gets a new one; a deleted webhook stops posts until settings change.
      if (st.threadId && /"code":\s*10003\b/.test((e as DiscordError).body)) delete st.threadId;
      else st.error = "Discord says this webhook no longer exists. Paste a new one in game settings.";
    }
    console.log(`discord: ${id}`, e);
  }
  st.seenMillis ??= now;
  // Forget what's too old to be undone or rewritten, so the document stays small.
  for (const [k, p] of Object.entries(st.posted)) if (k.startsWith("log:") && p.t < now - 2 * 24 * 3600 * 1000) delete st.posted[k];
  const keep = new Set(fresh.map((d) => d.id));
  for (const k of Object.keys(st.seen)) if (!keep.has(k)) delete st.seen[k];
  await save(id, st);
}

// ---------- settings and photos ----------

export async function discordSettings(id: string) {
  const st = discordState((await readPrivate(id)).discord);
  return { on: st.on, events: st.events, ownWebhook: !!st.webhook, serverWebhook: serverWebhook(), ready: !!webhookUrl(st), thread: !!st.threadId, error: st.error };
}

export async function changeDiscord(id: string, change: { on?: boolean; events?: DiscordEvent[]; webhook?: string | null }) {
  return withGameLock(id, async () => {
    const priv = await readPrivate(id);
    const st = discordState(priv.discord);
    const wasOn = st.on && !!webhookUrl(st);
    if (change.events) st.events = DISCORD_EVENTS.filter((e) => change.events!.includes(e));
    if (change.webhook !== undefined) {
      const next = change.webhook?.trim() || undefined;
      if (next !== st.webhook) {
        // Firestore refuses undefined inside a map, so an empty webhook is deleted.
        if (next) st.webhook = next;
        else delete st.webhook;
        // A new webhook is a new channel: start a new thread there, from now on.
        delete st.threadId;
        delete st.error;
        st.posted = Object.fromEntries(Object.entries(st.posted ?? {}).filter(([k]) => !k.startsWith("log:")));
        st.seenMillis = st.fromMillis = Date.now();
      }
    }
    if (change.on !== undefined) st.on = change.on;
    if (change.on) delete st.error;
    // Turning posts on doesn't replay the game so far.
    if (st.on && !wasOn) st.seenMillis = st.fromMillis = Date.now();
    await save(id, st);
  });
}

export async function postPhoto(id: string, meta: PhotoMeta, jpeg: Buffer) {
  return withGameLock(id, async () => {
    const st = discordState((await readPrivate(id)).discord);
    const base = webhookUrl(st);
    if (!st.on || !base || !st.events.includes("photos")) return;
    if (st.error) return;
    const v = await gameView(id);
    if (!v) return;
    await ensureThread(id, st, base, v);
    const phase = PHASES[meta.phase] ?? meta.phase;
    const m = await send(base, { content: `Board photo · round ${meta.round}, ${phase.toLowerCase()}${meta.by ? ` · from ${v.name(meta.by)}` : ""}`, file: { name: `board-${meta.id}.jpg`, data: jpeg, type: "image/jpeg" } }, { threadId: st.threadId });
    st.posted ??= {};
    st.posted[`photo:${meta.id}`] = { m: m.id, t: Date.now() };
    await save(id, st);
  });
}

export async function unpostPhoto(id: string, photoId: string) {
  return withGameLock(id, async () => {
    const st = discordState((await readPrivate(id)).discord);
    const base = webhookUrl(st);
    if (!base || !st.posted?.[`photo:${photoId}`]) return;
    if (await unpost(base, st, `photo:${photoId}`)) await save(id, st);
  });
}

