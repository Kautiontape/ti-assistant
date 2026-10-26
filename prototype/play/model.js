// Prototype data layer: selectors over the replayed game, log sentences, and a
// sandbox that records actions as labelled, undoable groups.
// Rules here are simplified for the prototype; the real build uses upstream's engine.

export const PHASES = { SETUP: "Setup", STRATEGY: "Strategy", ACTION: "Action", STATUS: "Status", AGENDA: "Agenda", END: "Game over" };

export const PLAYER_COLORS = ["Red", "Black", "Orange", "Green", "Yellow", "Magenta", "Blue", "Purple"];

export function clone(x) { return JSON.parse(JSON.stringify(x)); }

// ---------- names ----------

export function faction(ctx, id) {
  const b = ctx.base.factions[id] || {};
  const seat = ctx.meta.seats.find((s) => s.id === id) || {};
  const f = ctx.state.factions[id] || {};
  return { id, short: b.shortname || id, name: b.name || id, color: f.color || seat.color || "Black", player: f.playerName || seat.playerName || "" };
}

export function seatIds(ctx) {
  return ctx.meta.seats.map((s) => s.id);
}

// ---------- turn order ----------

function cardOrder(ctx, card) { return ctx.base.strategycards[card]?.order ?? 99; }

export function cardsOf(ctx, id) {
  return Object.entries(ctx.state.strategycards || {})
    .filter(([, c]) => c.faction === id)
    .map(([card, c]) => ({ card, used: !!c.used, order: cardOrder(ctx, card) }))
    .sort((a, b) => a.order - b.order);
}

export function speakerOrder(ctx) {
  return seatIds(ctx).slice().sort((a, b) => (ctx.state.factions[a].order ?? 9) - (ctx.state.factions[b].order ?? 9));
}

export function initiativeOrder(ctx) {
  const first = (id) => cardsOf(ctx, id)[0]?.order ?? 99;
  return speakerOrder(ctx).slice().sort((a, b) => first(a) - first(b));
}

export function active(ctx) {
  const a = ctx.state.state.activeplayer;
  return a && a !== "None" ? a : null;
}

export function hasPassed(ctx, id) { return !!ctx.state.factions[id]?.passed; }

export function onDeck(ctx) {
  const phase = ctx.state.state.phase;
  const a = active(ctx);
  if (!a) return null;
  if (phase === "STRATEGY") {
    const order = speakerOrder(ctx);
    const next = order[order.indexOf(a) + 1];
    return next && !cardsOf(ctx, next).length ? next : null;
  }
  if (phase !== "ACTION") return null;
  const order = initiativeOrder(ctx);
  const i = order.indexOf(a);
  for (let k = 1; k < order.length; k++) {
    const id = order[(i + k) % order.length];
    if (!hasPassed(ctx, id)) return id;
  }
  return null;
}

// ---------- points ----------

const OTHER_GROUPS = { "Imperial Point": "Imperial", "Custodians Token": "Custodians", "Support for the Throne": "Support for the Throne" };

export function points(ctx, id) {
  const groups = {};
  let total = 0;
  for (const [objId, o] of Object.entries(ctx.state.objectives || {})) {
    const n = (o.scorers || []).filter((s) => s === id).length;
    if (!n) continue;
    const base = ctx.base.objectives[objId] || { type: "OTHER", points: 1 };
    const label = base.type === "STAGE ONE" ? "Stage I" : base.type === "STAGE TWO" ? "Stage II" : base.type === "SECRET" ? "Secret" : OTHER_GROUPS[objId] || "Other";
    const pts = (base.points ?? 1) * n;
    (groups[label] ||= { label, points: 0, items: [] });
    groups[label].points += pts;
    groups[label].items.push(n > 1 ? `${objId} ×${n}` : objId);
    total += pts;
  }
  const manual = ctx.state.factions[id]?.vps || 0;
  if (manual) {
    (groups.Adjustments ||= { label: "Adjustments", points: 0, items: [] });
    groups.Adjustments.points += manual;
    groups.Adjustments.items.push(`${manual > 0 ? "+" : ""}${manual} by hand`);
    total += manual;
  }
  const order = ["Stage I", "Stage II", "Secret", "Imperial", "Custodians", "Support for the Throne", "Other", "Adjustments"];
  return { total, groups: order.filter((k) => groups[k]).map((k) => groups[k]) };
}

export function race(ctx) {
  return seatIds(ctx).map((id) => ({ id, ...points(ctx, id) })).sort((a, b) => b.total - a.total);
}

// ---------- holdings ----------

export function planetsOf(ctx, id) {
  return Object.entries(ctx.state.planets || {})
    .filter(([, p]) => p.owner === id)
    .map(([name]) => {
      const b = ctx.base.planets[name] || {};
      let res = b.resources ?? 0, inf = b.influence ?? 0;
      for (const att of ctx.state.planets[name].attachments || []) {
        const a = ctx.base.attachments[att];
        if (a) { res += a.resources || 0; inf += a.influence || 0; }
      }
      return { name, res, inf, legendary: (b.attributes || []).includes("legendary"), attachments: ctx.state.planets[name].attachments || [] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function availableVotes(ctx, id) {
  return planetsOf(ctx, id).reduce((n, p) => n + p.inf, 0);
}

export function techsOf(ctx, id) {
  const groups = {};
  for (const t of ctx.state.factions[id]?.techs || []) {
    const type = ctx.base.techs[t]?.type || "UPGRADE";
    (groups[type] ||= []).push(t);
  }
  return groups;
}

export function leadersOf(ctx, id) {
  const rank = { AGENT: 0, COMMANDER: 1, HERO: 2 };
  return Object.values(ctx.base.leaders)
    .filter((l) => l.faction === id && rank[l.type] !== undefined)
    .sort((a, b) => rank[a.type] - rank[b.type])
    .map((l) => ({ ...l, state: ctx.state.leaders?.[l.id]?.state || (l.type === "AGENT" ? "readied" : "locked") }));
}

export function relicsOf(ctx, id) {
  return Object.entries(ctx.state.relics || {}).filter(([, r]) => r.owner === id).map(([name, r]) => ({ name, state: r.state }));
}

// Support for the Throne and alliances held in someone's play area.
export function playArea(ctx, id) {
  const out = [];
  const sftt = ctx.state.objectives?.["Support for the Throne"]?.keyedScorers || {};
  for (const [giver, holders] of Object.entries(sftt)) if (holders.includes(id)) out.push({ card: "Support for the Throne", from: giver });
  for (const [fid, f] of Object.entries(ctx.state.factions)) if ((f.alliances || []).includes(id)) out.push({ card: "Alliance", from: fid });
  return out;
}

export function sfttGivenTo(ctx, giver) {
  return ctx.state.objectives?.["Support for the Throne"]?.keyedScorers?.[giver]?.[0] || null;
}

export function lawsInEffect(ctx) {
  const laws = [];
  for (const e of ctx.log) {
    if (e.action === "RESOLVE_AGENDA") {
      const a = ctx.base.agendas[e.event.agenda];
      if (a?.type === "LAW" && e.event.target !== "Against") laws.push({ id: e.event.agenda, target: e.event.target });
    }
    if (e.action === "REPEAL_AGENDA") {
      const i = laws.findIndex((l) => l.id === e.event.agenda);
      if (i >= 0) laws.splice(i, 1);
    }
  }
  return laws;
}

export function actionCardsPlayed(ctx, id) {
  return ctx.log.filter((e) => e.action === "PLAY_ACTION_CARD" && (e.actor?.as || e.event.faction) === id).map((e) => e.event.card);
}

// ---------- the log ----------

export const TURN_BOUNDARY = new Set(["END_TURN", "ADVANCE_PHASE", "END_GAME"]);

// The entries of the current turn (action phase) or current phase.
export function currentTurn(ctx) {
  const out = [];
  for (let i = ctx.log.length - 1; i >= 0; i--) {
    if (TURN_BOUNDARY.has(ctx.log[i].action)) break;
    out.unshift(ctx.log[i]);
  }
  return out;
}

export function selectedAction(ctx) {
  const sel = currentTurn(ctx).find((e) => e.action === "SELECT_ACTION");
  return sel ? sel.event.action : null;
}

// Phase and round for every log entry, walked from the start.
export function annotate(log) {
  let round = 0, phase = "SETUP";
  return log.map((e) => {
    const at = { round, phase };
    if (e.action === "ADVANCE_PHASE") {
      if (phase === "SETUP") { phase = "STRATEGY"; round = 1; }
      else if (phase === "STRATEGY") phase = "ACTION";
      else if (phase === "ACTION") phase = "STATUS";
      else if (phase === "STATUS") { if (e.event.skipAgenda) { phase = "STRATEGY"; round++; } else phase = "AGENDA"; }
      else if (phase === "AGENDA") { phase = "STRATEGY"; round++; }
    }
    if (e.action === "END_GAME") phase = "END";
    return { ...e, at, after: { round, phase } };
  });
}

export function currentAgenda(ctx) {
  for (let i = ctx.log.length - 1; i >= 0; i--) {
    const e = ctx.log[i];
    if (e.action === "RESOLVE_AGENDA" || e.action === "ADVANCE_PHASE") return null;
    if (e.action === "REVEAL_AGENDA") {
      const votes = ctx.log.slice(i + 1).filter((v) => v.action === "CAST_VOTES");
      return { id: e.event.agenda, votes };
    }
  }
  return null;
}

const n = (ctx, id) => (id ? faction(ctx, id).short : "Someone");

// One sentence per entry; null for bookkeeping entries.
export function sentence(ctx, e, opts = {}) {
  const ev = e.event || {};
  const who = (id) => n(ctx, id);
  switch (e.action) {
    case "SELECT_ACTION": {
      const a = ev.action;
      if (a === "Pass") return "passed";
      if (a === "Tactical") return "took a tactical action";
      if (a === "Component") return "took a component action";
      return `played ${a}`;
    }
    case "END_TURN": return null;
    case "CLAIM_PLANET": return `took control of ${ev.planet}${ev.prevOwner ? ` from ${who(ev.prevOwner)}` : ""}`;
    case "UNCLAIM_PLANET": return `lost ${ev.planet}`;
    case "ADD_ATTACHMENT": return `attached ${ev.attachment} to ${ev.planet}`;
    case "ADD_TECH": return `researched ${ev.tech}`;
    case "REMOVE_TECH": return `removed ${ev.tech}`;
    case "PURGE_TECH": return `purged ${ev.techId}`;
    case "SCORE_OBJECTIVE":
      if (ev.objective === "Support for the Throne" && ev.key) return `received Support for the Throne from ${who(ev.key)}`;
      return `scored ${ev.objective}`;
    case "UNSCORE_OBJECTIVE": return `lost ${ev.objective}`;
    case "REVEAL_OBJECTIVE": return `Revealed objective: ${ev.objective}`;
    case "ASSIGN_STRATEGY_CARD": return `picked ${ev.id}`;
    case "MARK_PRIMARY": return ev.completed ? "finished the primary" : null;
    case "MARK_SECONDARY": return ev.state === "DONE" ? "followed the secondary" : ev.state === "SKIPPED" ? "skipped the secondary" : null;
    case "SET_SPEAKER": return "became speaker";
    case "PLAY_COMPONENT": return `used ${ev.name}`;
    case "SELECT_SUB_COMPONENT": return `chose ${ev.subComponent}`;
    case "GAIN_RELIC": return `gained ${ev.relic}`;
    case "COMMIT_TO_EXPEDITION": return `committed to the Expedition (${ev.expedition})`;
    case "REVEAL_AGENDA": return `Agenda revealed: ${ev.agenda}`;
    case "START_VOTING": return "Voting started";
    case "CAST_VOTES": return ev.votes ? `cast ${ev.votes + (ev.extraVotes || 0)} votes for ${ctx.state.factions[ev.target] ? who(ev.target) : ev.target}` : "abstained";
    case "RESOLVE_AGENDA": return `${ev.agenda} resolved: ${ctx.state.factions[ev.target] ? who(ev.target) : ev.target}`;
    case "HIDE_AGENDA": return `${ev.agenda} discarded${ev.veto ? " (vetoed)" : ""}`;
    case "PLAY_PROMISSORY_NOTE": return `played ${ev.card}${ev.target ? ` on ${who(ev.target)}` : ""}`;
    case "PLAY_ACTION_CARD": return `played ${ev.card}${ev.target ? ` on ${ctx.state.factions[ev.target] ? who(ev.target) : ev.target}` : ""}`;
    case "MANUAL_VP_UPDATE": return `${ev.vps > 0 ? "gained" : "lost"} ${Math.abs(ev.vps)} point${Math.abs(ev.vps) === 1 ? "" : "s"} by hand`;
    case "SWAP_MAP_TILES": return "swapped two map tiles";
    case "ADVANCE_PHASE": return null;
    case "END_GAME": return "The game ended";
    case "COMBAT_START": return `started combat with ${who(ev.defender)} in ${ev.place}`;
    case "COMBAT_END": return ev.winner ? `combat in ${ev.place} ended: ${who(ev.winner)} won` : `combat in ${ev.place} ended`;
    case "GIVE_SFTT": return `gave Support for the Throne to ${who(ev.to)}`;
    default: return opts.raw ? e.action.toLowerCase().replace(/_/g, " ") : null;
  }
}

// Who an entry is about, for the colour chip and filters. `turnOf` (whose turn it
// was) comes from the extraction, which read the active player after every step.
const TABLE_EVENTS = new Set(["REVEAL_OBJECTIVE", "REVEAL_AGENDA", "START_VOTING", "RESOLVE_AGENDA", "HIDE_AGENDA", "ADVANCE_PHASE", "END_GAME", "SWAP_MAP_TILES"]);

export function subject(ctx, e) {
  const ev = e.event || {};
  if (e.actor?.as) return e.actor.as;
  if (TABLE_EVENTS.has(e.action)) return null;
  if (e.action === "SET_SPEAKER") return ev.newSpeaker;
  if (e.action === "CAST_VOTES" || e.action === "SCORE_OBJECTIVE" || e.action === "CLAIM_PLANET" || e.action === "ADD_TECH" || e.action === "GAIN_RELIC" || e.action === "MARK_SECONDARY") return ev.faction || e.turnOf || null;
  return ev.faction || ev.factionId || ev.assignedTo || e.turnOf || null;
}

// ---------- time ----------

export function clock(ctx) {
  for (let i = ctx.log.length - 1; i >= 0; i--) if (ctx.log[i].t != null) return ctx.log[i].t + (ctx.extraSeconds || 0);
  return ctx.extraSeconds || 0;
}

export function fmtClock(s, short) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (short) return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// Time each player spent on their own action-phase turns, from the log's game clock:
// the gap before each entry counts toward whoever's turn it was. Combat blocks count
// for both fighters instead.
export function timeByPlayer(ctx) {
  const play = Object.fromEntries(seatIds(ctx).map((id) => [id, 0]));
  const combat = Object.fromEntries(seatIds(ctx).map((id) => [id, 0]));
  let prev = null, fight = null;
  for (const e of ctx.log) {
    const dt = e.t != null && prev != null ? Math.max(0, e.t - prev) : 0;
    if (fight) { combat[fight.attacker] += dt; combat[fight.defender] += dt; }
    else if (e.at?.phase === "ACTION" && e.turnOf && play[e.turnOf] != null) play[e.turnOf] += dt;
    if (e.action === "COMBAT_START") fight = e.event;
    if (e.action === "COMBAT_END") fight = null;
    if (e.t != null) prev = e.t;
  }
  return { play, combat };
}

export function turnStartedAt(ctx) {
  for (let i = ctx.log.length - 1; i >= 0; i--) if (TURN_BOUNDARY.has(ctx.log[i].action) && ctx.log[i].t != null) return ctx.log[i].t;
  return 0;
}
