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
import { attachableTo, claimablePlanets, planetsInSystem } from "./logic";
import styles from "./play.module.scss";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, Cite, cx, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

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
      <section className={kit.card} aria-label="Map">
        <p className={kit.eyebrow}><span>Map</span></p>
        <p className={kit.sub}>This game has no map string, so there's no map to show. It's entered when the game is set up.</p>
      </section>
    );
  }

  // Upstream's game planets are the ones on this map or owned by a player.
  const found = q ? Object.values(planets).filter((p): p is Planet => !!p && p.system !== undefined && p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12) : [];
  return (
    <>
      <section className={kit.card} aria-label="Map">
        <p className={kit.eyebrow}><span>Map</span><span>Tap a system</span></p>
        <Choices label="Show on the map" hideLabel value={overlay} onChange={setOverlay} options={OVERLAYS.map(([id, label]) => ({ value: id, label }))} />
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
        <Button block onClick={() => setZoom(!zoom)}>{zoom ? "Fit the map" : "Zoom in"}</Button>
      </section>
      <section className={kit.card} aria-label="Find a planet">
        <input className={kit.search} type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a planet" />
        {found.length ? (
          <Rows>
            {found.map((p) => <RowLink key={p.id} onClick={() => open({ kind: "system", system: String(p.system) })} title={p.name} end={p.owner ? ctx.short(p.owner) : "Nobody"} />)}
          </Rows>
        ) : null}
        {q && !found.length ? <p className={kit.sub}>No planet matches.</p> : null}
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
  const takeable = taker && ctx.tracks("PLANETS") ? claimablePlanets(planets, taker, currentTurn).map((p) => p.id) : [];
  const title = inSystem.length ? inSystem.map((p) => p.name).join(" · ") : `System ${system}`;
  return (
    <KitSheet title={title} close={close} dock>
      <p className={kit.eyebrow}><span>System {system}</span><span>{wormholes.join(" · ")}</span></p>
      {!inSystem.length ? <p className={kit.sub}>No planets in this system.</p> : null}
      {inSystem.map((p) => {
        const facts = [
          p.types.map((t) => t.charAt(0) + t.slice(1).toLowerCase()).join(", "),
          ...p.attributes.map((a) => SKIPS[a]).filter(Boolean),
          p.attributes.includes("legendary") ? "Legendary" : "",
          p.home ? "Home planet" : "",
          p.state === "PURGED" ? "Destroyed" : "",
        ].filter(Boolean);
        return (
          <div key={p.id} className={kit.section}>
            <div className={kit.line}>
              <b className={kit.grow}>{p.name}</b>
              <span className={kit.num}>{p.resources}/{p.influence}</span>
            </div>
            {facts.length ? <p className={kit.sub}>{facts.join(" · ")}</p> : null}
            {p.ability ? <p className={kit.sub}>{p.ability}</p> : null}
            {p.owner ? (
              <Rows><RowLink onClick={() => open({ kind: "player", faction: p.owner as FactionId })} lead={<span className={kit.sub}>Owner</span>} title={<Chip faction={p.owner} factions={factions} short={short} small player={false} />} /></Rows>
            ) : <p className={kit.sub}>Nobody controls it.</p>}
            <Attachments planet={p} ctx={ctx} />
            {taker && takeable.includes(p.id) ? (
              <Button kind="primary" block disabled={w.pending} onClick={async () => {
                if (await w.write([Events.ClaimPlanetEvent(taker, p.id)], `${short(taker)} took control of ${p.name}${p.owner ? ` from ${short(p.owner)}` : ""}`, taker)) close();
              }}>Take {p.name} for {short(taker)}</Button>
            ) : null}
          </div>
        );
      })}
    </KitSheet>
  );
}

// Attachments on a planet: remove one, or add one the planet can take.
function Attachments({ planet, ctx }: { planet: Planet; ctx: Ctx }) {
  const { short, seat, helping, w } = ctx;
  const attachments = useAttachments();
  const planets = usePlanets();
  const currentTurn = useCurrentTurn();
  const [adding, setAdding] = useState(false);
  const on = planet.attachments ?? [];
  const who = planet.owner ?? helping ?? seat;
  const effect = (a: Attachment) => [
    a.resources || a.influence ? `+${a.resources ?? 0}/+${a.influence ?? 0}` : "",
    a.attribute ? (SKIPS[a.attribute] ?? a.attribute.replace(/-/g, " ")) : "",
    a.required.type ? `${a.required.type.charAt(0)}${a.required.type.slice(1).toLowerCase()} planets` : "",
  ].filter(Boolean).join(" · ");
  const list = adding ? attachableTo(planet, attachments).sort((a, b) => a.name.localeCompare(b.name)) : [];
  // Where an attachment is now: upstream records it on the planets, not the attachment.
  const elsewhere = (a: Attachment) => Object.values(planets).filter((x): x is Planet => !!x && x.id !== planet.id && (x.attachments ?? []).includes(a.id));
  // An attachment added this turn is taken back: upstream deletes that entry,
  // and returns the attachment to the planet it came from only if told which.
  const addedNow = (a: Attachment) => currentTurn.map((e) => e.data as unknown as { action: string; event: { planet?: string; attachment?: string; prevPlanet?: PlanetId } })
    .find((d) => d.action === "ADD_ATTACHMENT" && d.event.planet === planet.id && d.event.attachment === a.id);
  const change = async (add: boolean, a: Attachment) => {
    const prev = add ? undefined : addedNow(a)?.event.prevPlanet;
    const label = add ? `${short(who)} attached ${a.name} to ${planet.name}`
      : addedNow(a) ? `${short(who)} took back ${a.name}${prev ? `; it's on ${planets[prev]?.name ?? prev} again` : ""}`
      : `${short(who)} removed ${a.name} from ${planet.name}`;
    const remove = Events.RemoveAttachmentEvent(planet.id, a.id);
    const event = add ? Events.AddAttachmentEvent(planet.id, a.id) : prev ? { ...remove, event: { ...remove.event, prevPlanet: prev } } : remove;
    if (await w.write([event], label, who)) setAdding(false);
  };
  if (!on.length && !attachableTo(planet, attachments).length) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {on.map((id) => {
        const a = attachments[id];
        return a ? (
          <div key={id} className={kit.line}>
            <span className={kit.grow}><Cite thing={{ kind: "attachment", id }}>{a.name}</Cite> <span className={kit.sub}>{effect(a)}</span></span>
            <Button size="small" disabled={w.pending} onClick={() => change(false, a)}>
              {addedNow(a) ? `Take it back${addedNow(a)?.event.prevPlanet ? ` (returns to ${planets[addedNow(a)!.event.prevPlanet!]?.name})` : ""}` : "Remove"}
            </Button>
          </div>
        ) : null;
      })}
      {!adding ? (
        <Button block onClick={() => setAdding(true)}>Add an attachment</Button>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <p className={kit.eyebrow}><span>Attach to {planet.name}</span><Button kind="quiet" onClick={() => setAdding(false)}>Cancel</Button></p>
          <Rows>
            {list.map((a) => (
              <RowAction key={a.id} verb="Attach" disabled={w.pending} onClick={() => change(true, a)} title={a.name}
                detail={[effect(a), ...elsewhere(a).map((x) => `moves from ${x.name}`)].filter(Boolean).join(" · ")} />
            ))}
          </Rows>
        </div>
      )}
    </div>
  );
}
