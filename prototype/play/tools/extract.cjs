// Builds prototype/play/data/game.json from a real archived game.
// Replays the game through the local app's own API (dev server + Firestore emulator),
// recording the game state after every entry in a window, plus a few named scenarios.
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8020 node extract.cjs <archive.json> <base-data.json> <out.json>
//
// Needs `npm run dev` on :3000 against the emulator (see docs/ktn/README.md).
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "../../..");
const req = require("module").createRequire(path.join(R, "package.json"));
req("firebase-admin/app").initializeApp({ projectId: "demo-ti" });
const db = req("firebase-admin/firestore").getFirestore();

const [archivePath, basePath, outPath] = process.argv.slice(2);
const { game, log } = JSON.parse(fs.readFileSync(archivePath, "utf8"));
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const BASE_URL = "http://127.0.0.1:3000";
const NAMES = ["Alex", "Blair", "Casey", "Devon", "Emery", "Finley"];

async function post(p, body) {
  const res = await fetch(BASE_URL + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// The game doc minus server bookkeeping, small enough to keep one per step.
function trimState(g) {
  const { deleteAt, lastUpdate, schema, sequenceNum, players, timers, options, ...rest } = g;
  const factions = {};
  for (const [id, f] of Object.entries(g.factions)) {
    const { startswith, techs, ...frest } = f;
    factions[id] = { ...frest, techs: Object.keys(techs || {}) };
  }
  const planets = {};
  for (const [id, p] of Object.entries(g.planets || {})) if (p.owner || p.attachments) planets[id] = p;
  const objectives = {};
  for (const [id, o] of Object.entries(g.objectives || {})) if (o.selected || o.scorers?.length || o.keyedScorers) objectives[id] = o;
  return { ...rest, factions, planets, objectives };
}

// Log entries keep only what a feed needs; ADVANCE_PHASE carries a full undo copy we drop.
function trimEntry(e, i) {
  const { action, event = {} } = e.data;
  const ev = { ...event };
  if (action === "ADVANCE_PHASE") { delete ev.factions; delete ev.state; delete ev.strategycards; }
  return { i, action, event: ev, t: e.gameSeconds ?? e.data.gameTime ?? null };
}

function trimBase(mapString, factionIds, strategyCardIds) {
  const systemIds = new Set(mapString.split(/\s+/).filter((s) => /^\d+$/.test(s)));
  const pick = (obj, keep) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => keep(k, v)));
  const factions = pick(base.factions, (k) => factionIds.includes(k));
  const homeSystems = Object.values(base.planets).filter((p) => factionIds.includes(p.faction) && p.home).map((p) => String(p.system));
  homeSystems.forEach((s) => systemIds.add(s));
  const systems = pick(base.systems, (k) => systemIds.has(String(k)));
  const planetIds = new Set(Object.values(systems).flatMap((s) => s.planets || []));
  Object.values(base.planets).filter((p) => factionIds.includes(p.faction) && p.home).forEach((p) => planetIds.add(p.id));
  return {
    factions,
    strategycards: pick(base.strategycards, (k) => strategyCardIds.includes(k)),
    objectives: base.objectives,
    techs: base.techs,
    planets: pick(base.planets, (k) => planetIds.has(k)),
    systems,
    relics: base.relics,
    agendas: base.agendas,
    actionCards: base.actionCards,
    leaders: pick(base.leaders, (k, v) => factionIds.includes(v.faction)),
    components: base.components,
    attachments: base.attachments,
  };
}

(async () => {
  const seats = Object.values(game.factions).sort((a, b) => a.mapPosition - b.mapPosition);
  const firstSpeakerChange = log.find((e) => e.data.action === "SET_SPEAKER");
  const initialSpeaker = firstSpeakerChange?.data.event.prevSpeaker ?? game.state.speaker;
  const setup = seats.map((f, i) => ({ id: f.id, name: f.id, color: f.color, playerName: NAMES[i] }));
  const created = await post("/api/create-game", { factions: setup, speaker: seats.findIndex((f) => f.id === initialSpeaker), options: game.options });
  const gid = created.json?.gameid;
  if (!gid) throw new Error("create-game failed: " + JSON.stringify(created));

  const frames = [];
  const scenarios = {};
  const counters = { picks: 0, turns: 0, votes: 0 };
  const wanted = [
    ["strategy", (s) => s.round === 1 && s.phase === "STRATEGY" && counters.picks === 3, "Round 1 strategy, 3 of 6 picks made"],
    ["action-early", (s) => s.round === 1 && s.phase === "ACTION" && counters.turns === 0, "Round 1 action, first turn"],
    ["action", (s, e) => s.round === 3 && s.phase === "ACTION" && counters.turns >= 8 && e.data.action === "SELECT_ACTION", "Round 3 action, Creuss mid-turn"],
    ["status", (s) => s.round === 3 && s.phase === "STATUS", "Round 3 status, start"],
    ["agenda", (s) => s.phase === "AGENDA" && counters.votes === 3, "Round 3 agenda, 3 votes cast"],
    ["late", (s, e) => s.round === 5 && s.phase === "ACTION" && counters.turns >= 10 && e.data.action === "SELECT_ACTION", "Round 5 action, late game"],
  ];
  let state = { round: 0, phase: "SETUP" };
  let lastActive = null;
  const turnOf = [];
  const failures = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    turnOf.push(lastActive);
    const r = await post(`/api/${gid}/dataUpdate`, { ...e.data, gameTime: e.gameSeconds ?? 0, timestamp: Date.now() });
    if (r.status !== 200) failures.push(i);
    const a = e.data.action;
    const g = (await db.collection("games").doc(gid).get()).data();
    if (a === "ADVANCE_PHASE" || a === "END_GAME") counters.picks = counters.turns = counters.votes = 0;
    state = g.state;
    lastActive = g.state.activeplayer && g.state.activeplayer !== "None" ? g.state.activeplayer : null;
    if (a === "ASSIGN_STRATEGY_CARD") counters.picks++;
    if (a === "END_TURN") counters.turns++;
    if (a === "CAST_VOTES") counters.votes++;
    const inWindow = state.round === 3 && ["ACTION", "STATUS", "AGENDA"].includes(state.phase);
    const named = wanted.filter(([name, pred]) => !scenarios[name] && pred(state, e));
    if (inWindow || named.length) {
      frames.push({ i, state: trimState(g) });
      for (const [name, , label] of named) scenarios[name] = { frame: frames.length - 1, label };
    }
  }
  const g = (await db.collection("games").doc(gid).get()).data();
  frames.push({ i: log.length - 1, state: trimState(g) });
  scenarios.end = { frame: frames.length - 1, label: "Game over" };

  const out = {
    source: { archive: "ti-assistant.com archive rPQHrQ (players renamed)", replayFailures: failures.length },
    meta: {
      seats: seats.map((f, i) => ({ id: f.id, color: f.color, playerName: NAMES[i], mapPosition: f.mapPosition })),
      mapString: game.options["processed-map-string"],
      victoryPoints: game.options["victory-points"] ?? 10,
      expansions: game.options.expansions,
      finalTimers: game.timers ?? null,
    },
    base: trimBase(game.options["processed-map-string"], seats.map((f) => f.id), Object.keys(game.strategycards)),
    log: log.map((e, i) => ({ ...trimEntry(e, i), turnOf: turnOf[i] })),
    frames,
    scenarios,
  };
  fs.writeFileSync(outPath, JSON.stringify(out));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`wrote ${outPath}: ${frames.length} frames, ${Object.keys(scenarios).length} scenarios, ${kb} KB, replay failures ${failures.length}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
