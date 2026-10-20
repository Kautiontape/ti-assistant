"use client";
// The game replayed round by round for the results views, by upstream's own
// web worker (main/phase/results/game-log.worker.tsx), which runs every logged
// event through upstream's handlers from the game's starting state. That is how
// upstream counts points it scores without log entries (Custodians, Imperial,
// Shard of the Throne). The starting state is built as upstream's ResultsPhase.tsx
// builds it (buildSetupGameData, buildInitialGameData), copied here because
// that page doesn't export them; keep in step with it.
// Turbopack's dev server can't start that worker ("chunkPath.split is not a
// function", upstream's results fail there too); production builds can.
import { use, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { DatabaseFnsContext } from "../../context/contexts";
import { useActionLog } from "../../context/dataHooks";
import { useGameData } from "../../context/gameDataHooks";
import { getBaseData } from "../../data/baseData";
import { processMapString } from "../../util/map";
import { ActionLog, Optional } from "../../util/types/types";

export interface RoundInfo {
  planets: Partial<Record<PlanetId, Planet>>;
  systems: Partial<Record<SystemId, System>>;
  mapString?: string;
  techs: Partial<Record<FactionId, Record<TechType, number>>>;
  victoryPoints: Partial<Record<FactionId, Record<ObjectiveType, number>>>;
}
export interface TimerData { longestTurn: number; numTurns: number }
export interface Replay { rounds: Record<number, RoundInfo>; timerData: Partial<Record<FactionId, TimerData>> }

function setupData(gameData: GameData) {
  const actionLog = (gameData.actionLog ?? []) as ActionLog;
  let speaker = 1;
  for (let i = actionLog.length - 1; i >= 0; i--) {
    const entry = actionLog[i];
    if (entry?.data.action === "ASSIGN_STRATEGY_CARD") {
      const initial = gameData.factions[entry.data.event.pickedBy];
      if (initial) { speaker = initial.mapPosition; break; }
    }
  }
  const factions: SetupFaction[] = [];
  for (const f of Object.values(gameData.factions)) factions[f.mapPosition] = { color: f.color, name: f.id, id: f.id, playerName: f.playerName };
  const options: Options = structuredClone(gameData.options);
  options["processed-map-string"] = processMapString(options["map-string"] ?? "", options["map-style"], factions.length, options.expansions.includes("THUNDERS EDGE"));
  return { factions, speaker, options };
}

function initialGameData(setup: ReturnType<typeof setupData>, basePlanets: Partial<Record<PlanetId, BasePlanet>>, baseFactions: Partial<Record<FactionId, BaseFaction>>): StoredGameData {
  const planets: Partial<Record<PlanetId, GamePlanet>> = {};
  const factions: Partial<Record<FactionId, GameFaction>> = {};
  const players: Partial<Record<PlayerId, GamePlayer>> = {};
  let speakerId: Optional<FactionId>;
  setup.factions.forEach((f, index) => {
    if (!f?.id || !f.color) return;
    const order = index >= setup.speaker ? index - setup.speaker + 1 : index + setup.factions.length - setup.speaker + 1;
    for (const p of Object.values(basePlanets)) if (p && p.faction === f.name && p.home) planets[p.id] = { owner: f.id, state: "READIED" };
    const base = baseFactions[f.id];
    const techs: Partial<Record<TechId, { state: TechState }>> = {};
    for (const t of base?.startswith?.techs ?? []) techs[t] = { state: "ready" };
    const faction: GameFaction = { name: f.name, id: f.id, color: f.color, playerName: f.playerName, order, mapPosition: index, techs, startswith: base?.startswith ?? { units: {} }, commandCounters: 8 } as GameFaction;
    if (f.id === "Winnu" && !setup.options.expansions.includes("POK") && faction.startswith) {
      faction.startswith = { ...faction.startswith, choice: { description: "Choose any 1 technology that has no prerequisites.", select: 1, options: ["Neural Motivator", "Sarween Tools", "Antimass Deflectors", "Plasma Scoring"] } };
    }
    if (index === setup.speaker) speakerId = f.id;
    factions[f.id] = faction;
    if (f.id !== "Obsidian") players[f.id] = { factionId: f.id, id: f.id, mapPosition: index } as GamePlayer;
  });
  return {
    state: { speaker: speakerId ?? "Vuil'raith Cabal", phase: "SETUP", round: 1 },
    factions, planets, players, options: setup.options,
    objectives: { "Custodians Token": { selected: true }, "Imperial Point": { selected: true }, "Support for the Throne": { selected: true } },
    sequenceNum: 1,
  } as StoredGameData;
}

export function useReplay(enabled: boolean): { replay?: Replay; failed?: boolean } {
  const log = useActionLog();
  const gameData = useGameData();
  const intl = useIntl();
  const db = use(DatabaseFnsContext);
  const [state, setState] = useState<{ replay?: Replay; failed?: boolean }>({});
  const reversed = useMemo(() => [...(log ?? [])].reverse(), [log]);
  const initial = useMemo(() => enabled ? initialGameData(setupData(gameData), db.getBaseValue("planets") ?? {}, db.getBaseValue("factions") ?? {}) : undefined,
    // gameData changes with every write; the start of the game doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, reversed.length]);
  useEffect(() => {
    if (!enabled || !initial || !reversed.length) return;
    let worker: Optional<Worker>;
    try {
      worker = new Worker(new URL("../../../app/[locale]/game/[gameId]/main/phase/results/game-log.worker.tsx", import.meta.url), { name: "game-log", type: "module" });
    } catch {
      setState({ failed: true });
      return;
    }
    worker.onmessage = (e) => setState({ replay: e.data as Replay });
    worker.onerror = () => setState((s) => (s.replay ? s : { failed: true }));
    worker.postMessage({ reversedActionLog: reversed, initialGameData: initial, baseData: getBaseData(intl) });
    return () => worker?.terminate();
  }, [enabled, initial, reversed, intl]);
  return state;
}
