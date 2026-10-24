"use client";
// Adding a system to the map: Star Chart, Azdel's Key and Age of Exploration
// (upstream's ComponentActions/AddSystemToMap.tsx). Upstream drags a tile onto
// its map builder, which needs a mouse; here the player picks the tile, then an
// open spot named by its neighbours, sees the map with it, and confirms. The
// write is upstream's SWAP_MAP_TILES, so its Undo and map work unchanged.
import { use, useState } from "react";
import GameMap from "../../components/Map/GameMap";
import { Hex } from "../../components/MapBuilder/hexGrid";
import { DatabaseFnsContext } from "../../context/contexts";
import { useCurrentTurn, useOptions, usePlanets } from "../../context/dataHooks";
import { getLogEntries } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { getFactionSystemNumber, getWormholeNexusSystemNumber, isFactionHomeSystem } from "../../util/map";
import { getMapString } from "../../util/options";
import { ActionLog, Optional } from "../../util/types/types";
import styles from "./play.module.scss";
import type { Ctx } from "./ui";
import { Button, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

export const MAP_TILE_COMPONENTS = new Set(["Star Chart", "Azdel's Key", "Age of Exploration"]);

type Spot = { index: number; next: string[] };

function useTiles(ctx: Ctx, component: string) {
  const options = useOptions();
  const db = use(DatabaseFnsContext);
  const baseSystems: Partial<Record<string, { type?: string; planets?: string[] }>> = db.getBaseValue("systems") ?? {};
  const basePlanets: Partial<Record<string, { name: string }>> = db.getBaseValue("planets") ?? {};
  const ordered = Object.values(ctx.factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition);
  const mapString = getMapString(options, ordered.length);
  if (!mapString) return undefined;
  // Seats (P1…P8) become their home systems, so they count as neighbours.
  const tiles = mapString.split(" ").map((t) => {
    if (!t.startsWith("P")) return t;
    const f = ordered[parseInt(t.slice(-1)) - 1];
    return f ? getFactionSystemNumber(f) : t;
  });
  const numRings = Math.ceil((3 + Math.sqrt(9 - 12 * (1 - tiles.length))) / 6) + 1;
  const spiral = new Hex(0, 0, 0).spiral(numRings);
  const at = (h: Hex) => { const i = spiral.findIndex((x) => x.equals(h)); return i < 0 ? undefined : tiles[i]; };
  // Age of Exploration needs two neighbours that aren't home systems; the others two of any kind.
  const nonHome = component === "Age of Exploration";
  const spots: Spot[] = [];
  spiral.forEach((hex, index) => {
    const tile = tiles[index] ?? "-1";
    if (tile !== "-1") return;
    const next = Hex.directions().map((d) => at(hex.neighbor(d))).filter((t): t is string => !!t && t !== "-1" && t !== "0")
      .filter((t) => baseSystems[t] && baseSystems[t]!.type !== "HYPERLANE" && !(nonHome && isFactionHomeSystem(t)));
    if (next.length >= 2) spots.push({ index, next });
  });
  const unused: string[] = [];
  const range = (a: number, b: number) => { for (let i = a; i < b; i++) unused.push(String(i)); };
  range(19, 51);
  if (options.expansions.includes("POK")) range(59, 81);
  if (options.expansions.includes("THUNDERS EDGE")) range(97, 118);
  if (options.expansions.includes("DISCORDANT STARS")) range(4253, 4270);
  const onMap = new Set(mapString.split(" "));
  const planetsOf = (t: string) => (baseSystems[t]?.planets ?? []).map((p) => basePlanets[p]?.name ?? p);
  const name = (t: string) => { const p = planetsOf(t); return p.length ? `${t} (${p.join(", ")})` : `${t} (no planets)`; };
  return { mapString, ordered, spots, unused: unused.filter((t) => !onMap.has(t) && baseSystems[t]), name };
}

function placed(currentTurn: ActionLog) {
  return getLogEntries<SwapMapTilesData>(currentTurn, "SWAP_MAP_TILES").map((e) => e.data.event)[0];
}

export function MapTileFollowUp({ played, active, ctx }: { played: string; active: FactionId; ctx: Ctx }) {
  const currentTurn = useCurrentTurn();
  const t = useTiles(ctx, played);
  const done = placed(currentTurn);
  if (!t) return <p className={kit.sub}>This game has no map string, so there's no map to add a system to.</p>;
  if (done) {
    const tile = done.newItem.systemNumber;
    return (
      <Rows label="Map">
        <RowAction verb="Take back" disabled={ctx.w.pending} title={`Added system ${t.name(tile)}`} detail="The Map tab shows it"
          onClick={() => ctx.w.write([Events.SwapMapTilesEvent({ systemNumber: tile, index: done.oldItem.index }, { systemNumber: "-1", index: -1 })],
            `${ctx.short(active)} took back adding system ${tile}`, active)} />
      </Rows>
    );
  }
  return <Rows label="Map"><RowLink onClick={() => ctx.open({ kind: "mapTile", component: played, faction: active })} title="Add a system to the map" detail={`${t.spots.length} open spots next to at least 2 systems`} /></Rows>;
}

export function MapTileSheet({ component, faction, close, ctx }: { component: string; faction: FactionId; close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  const options = useOptions();
  const planets = usePlanets();
  const t = useTiles(ctx, component);
  const [tile, setTile] = useState<Optional<string>>();
  const [spot, setSpot] = useState<Optional<string>>();
  const [q, setQ] = useState("");
  if (!t) return null;
  const s = t.spots.find((x) => String(x.index) === spot);
  const shown = t.unused.filter((x) => !q || t.name(x).toLowerCase().includes(q.toLowerCase()));
  // The map as it would be, for the preview.
  const preview = tile && s ? (() => { const a = t.mapString.split(" "); while (a.length <= s.index) a.push("-1"); a[s.index] = tile; return a.join(" "); })() : undefined;
  return (
    <KitSheet title={`${component}: add a system`} close={close}>
      {!tile ? (
        <>
          <input className={kit.search} type="search" placeholder="Find a tile or planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a tile or planet" />
          <Choices label="Which system tile?" list value={tile} onChange={setTile}
            options={shown.slice(0, 60).map((x) => ({ value: x, label: t.name(x) }))} />
        </>
      ) : (
        <div className={kit.section}>
          <p className={kit.label}>System tile</p>
          <div className={kit.line} style={{ justifyContent: "space-between" }}>
            <b>{t.name(tile)}</b>
            <Button size="small" onClick={() => { setTile(undefined); setSpot(undefined); }}>Change</Button>
          </div>
        </div>
      )}
      {tile ? (
        <Choices label="Where?" list value={spot} onChange={setSpot}
          options={t.spots.map((x) => ({ value: String(x.index), label: `Next to ${x.next.map(t.name).join(", ")}` }))} />
      ) : null}
      {preview ? (
        <>
          {/* overflow: visible keeps the board square in the sheet's grid (a scroll box may shrink to 0); paint containment still clips the tiles. */}
          <div className={styles.board} style={{ overflow: "visible", contain: "paint" }}>
            <div className={styles.boardInner}>
              <GameMap mapString={preview} mapStyle={options["map-style"] ?? "standard"} factions={t.ordered} hideLegend hideFracture planets={planets}
                expansions={options.expansions} wormholeNexus={getWormholeNexusSystemNumber(options, planets, ctx.factions)} />
            </div>
          </div>
          <p className={kit.confirm}>Add system {t.name(tile!)} next to {s!.next.join(" and ")}?</p>
          <Button kind="primary" block disabled={w.pending} onClick={async () => {
            if (await w.write([Events.SwapMapTilesEvent({ systemNumber: "-1", index: s!.index }, { systemNumber: tile!, index: -1 })],
              `${short(faction)} added system ${tile} to the map (${component})`, faction)) close();
          }}>Add system {tile}</Button>
        </>
      ) : null}
    </KitSheet>
  );
}
