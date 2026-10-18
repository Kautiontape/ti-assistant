"use client";
// Map tab: upstream's GameMap drawn the way the table screen's footer draws it
// (MapWrapper in src/components/Footer/Footer.tsx), with an overlay picker, a
// zoom, and a sheet for the system you tap.
import { useEffect, useRef, useState } from "react";
import GameMap from "../../components/Map/GameMap";
import type { OverlayDetails } from "../../components/Map/PlanetOverlay";
import { useAllPlanets, useAttachments, useCurrentTurn, useOptions, usePlanets, useSystems } from "../../context/dataHooks";
import { useActiveFactionId } from "../../context/gameDataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { getSelectedActionFromLog } from "../../util/api/data";
import { Events } from "../../util/api/events";
import { getWormholeNexusSystemNumber } from "../../util/map";
import { getMapString } from "../../util/options";
import { applyAllPlanetAttachments, fracturePlanetsOwned } from "../../util/planets";
import { Optional } from "../../util/types/types";
import { claimablePlanets, planetsInSystem } from "./logic";
import styles from "./play.module.scss";
import { Chip, cx, SheetFrame, type Ctx } from "./ui";

const OVERLAYS: [OverlayDetails, string][] = [["OWNERS", "Owners"], ["NONE", "Tiles"], ["TYPES", "Types"], ["TECH_SKIPS", "Skips"], ["ATTACHMENTS", "Attachments"]];

// Taps are read from the tile image's alt text ("System 25 Tile") rather than
// GameMap's onSelect, which fades every tile it can't select, including the
// Creuss and Rebellion corners.
function systemAt(target: EventTarget, stop: Element): Optional<string> {
  for (let el = target as Element | null; el && el !== stop; el = el.parentElement) {
    const alt = el.querySelector(":scope > img[alt^='System ']")?.getAttribute("alt");
    const m = alt?.match(/^System (\S+) Tile$/);
    if (m) return m[1];
  }
}

export default function MapTab(ctx: Ctx) {
  const { factions, open } = ctx;
  const options = useOptions();
  const allPlanets = useAllPlanets();
  const planets = usePlanets();
  const [overlay, setOverlay] = useState<OverlayDetails>("OWNERS");
  const [zoom, setZoom] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Same inputs as the footer's map: P1…P8 in the map string are seats by map position.
  const ordered = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition);
  const mapString = getMapString(options, ordered.length);

  useEffect(() => {
    const el = box.current;
    if (el) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; }
  }, [zoom]);

  if (!mapString) {
    return (
      <section className={styles.card} aria-label="Map">
        <p className={styles.eyebrow}><span>Map</span></p>
        <p className={styles.sub}>This game has no map string, so there's no map to show. It's entered when the game is set up.</p>
      </section>
    );
  }

  // Upstream's game planets are the ones on this map or owned by a player.
  const found = q ? Object.values(planets).filter((p): p is Planet => !!p && p.system !== undefined && p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12) : [];
  return (
    <>
      <section className={styles.card} aria-label="Map">
        <p className={styles.eyebrow}><span>Map</span><span>Tap a system</span></p>
        <div className={styles.seg} role="group" aria-label="Show on the map">
          {OVERLAYS.map(([id, label]) => <button key={id} aria-pressed={overlay === id} onClick={() => setOverlay(id)}>{label}</button>)}
        </div>
        <div ref={box} className={styles.board}>
          <div className={cx(styles.boardInner, zoom && styles.boardZoom)}
            onClick={(e) => { const s = systemAt(e.target, e.currentTarget); if (s) open({ kind: "system", system: s }); }}>
            <GameMap
              key={overlay}
              defaultOverlay={overlay}
              hideLegend
              factions={ordered}
              wormholeNexus={getWormholeNexusSystemNumber(options, planets, factions)}
              mapString={mapString}
              mapStyle={options["map-style"] ?? "standard"}
              planets={allPlanets}
              expansions={options.expansions}
              hideFracture={!fracturePlanetsOwned(allPlanets)}
            />
          </div>
        </div>
        <button className={cx(styles.btn, styles.block)} onClick={() => setZoom(!zoom)}>{zoom ? "Fit the map" : "Zoom in"}</button>
      </section>
      <section className={styles.card} aria-label="Find a planet">
        <input className={styles.search} type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a planet" />
        {found.map((p) => (
          <button key={p.id} className={styles.opt} onClick={() => open({ kind: "system", system: String(p.system) })}>
            <b>{p.name}</b><span className={styles.meta}>{p.owner ? ctx.short(p.owner) : "Nobody"}</span>
          </button>
        ))}
        {q && !found.length ? <p className={styles.sub}>No planet matches.</p> : null}
      </section>
    </>
  );
}

const SKIPS: Partial<Record<PlanetAttribute, string>> = { "red-skip": "Red skip", "blue-skip": "Blue skip", "green-skip": "Green skip", "yellow-skip": "Yellow skip" };
const WORMHOLES: Record<Wormhole, string> = { ALPHA: "Alpha", BETA: "Beta", GAMMA: "Gamma", DELTA: "Delta", EPSILON: "Epsilon" };

export function SystemSheet({ system, close, ctx }: { system: string; close: () => void; ctx: Ctx }) {
  const { factions, short, seat, helping, w, open } = ctx;
  const allPlanets = useAllPlanets();
  const planets = usePlanets();
  const attachments = useAttachments();
  const systems = useSystems();
  const state = useGameState();
  const active = useActiveFactionId();
  const currentTurn = useCurrentTurn();
  const inSystem = applyAllPlanetAttachments(planetsInSystem(allPlanets, system), attachments).sort((a, b) => a.name.localeCompare(b.name));
  const sys = systems[system as SystemId];
  const wormholes = (sys?.wormholes ?? []).map((x) => `${WORMHOLES[x] ?? x} wormhole`);
  // During your tactical action the sheet can take a planet, like "Take a planet" on Now.
  const taker = state.phase === "ACTION" && active && (active === seat || active === helping) && getSelectedActionFromLog(currentTurn) === "Tactical" ? active : undefined;
  const takeable = taker ? claimablePlanets(planets, taker, currentTurn).map((p) => p.id) : [];
  const title = inSystem.length ? inSystem.map((p) => p.name).join(" · ") : `System ${system}`;
  return (
    <SheetFrame title={title} close={close}>
      <p className={styles.eyebrow}><span>System {system}</span><span>{wormholes.join(" · ")}</span></p>
      {!inSystem.length ? <p className={styles.sub}>No planets in this system.</p> : null}
      {inSystem.map((p) => {
        const facts = [
          p.types.map((t) => t.charAt(0) + t.slice(1).toLowerCase()).join(", "),
          ...p.attributes.map((a) => SKIPS[a]).filter(Boolean),
          p.attributes.includes("legendary") ? "Legendary" : "",
          p.home ? "Home planet" : "",
          p.state === "PURGED" ? "Destroyed" : "",
        ].filter(Boolean);
        return (
          <div key={p.id} className={styles.card} style={{ background: "var(--bg)" }}>
            <div className={styles.row}>
              <b className={styles.grow}>{p.name}</b>
              <span className={styles.num}>{p.resources}/{p.influence}</span>
            </div>
            {facts.length ? <p className={styles.sub}>{facts.join(" · ")}</p> : null}
            {p.attachments?.length ? <p className={styles.sub}>Attached: {p.attachments.map((id) => attachments[id]?.name ?? id).join(", ")}</p> : null}
            {p.ability ? <p className={styles.sub}>{p.ability}</p> : null}
            <div className={styles.row}>
              {p.owner ? (
                <button className={styles.raceRow} onClick={() => open({ kind: "player", faction: p.owner as FactionId })}>
                  <span className={styles.sub}>Owner</span><Chip faction={p.owner} factions={factions} short={short} small player={false} />
                </button>
              ) : <span className={styles.sub}>Nobody controls it.</span>}
            </div>
            {taker && takeable.includes(p.id) ? (
              <button className={cx(styles.btn, styles.block)} disabled={w.pending} onClick={async () => {
                if (await w.write([Events.ClaimPlanetEvent(taker, p.id)], `${short(taker)} took control of ${p.name}${p.owner ? ` from ${short(p.owner)}` : ""}`, taker)) close();
              }}>Take {p.name} for {short(taker)}</button>
            ) : null}
          </div>
        );
      })}
    </SheetFrame>
  );
}
