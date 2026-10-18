"use client";
// Component actions: pick the component, then any follow-up the group needs
// (gain a relic, research a tech); everything else happens on the board.
// Upstream's picker and follow-ups are in main/phase/action/ComponentAction.tsx.
import { useState } from "react";
import { useActionCards, useComponents, useCurrentTurn, useLeaders, usePlanets, useRelics, useTechs } from "../../context/dataHooks";
import { getLogEntries } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { hasTech } from "../../util/api/techs";
import type { Ctx } from "./ui";
import { Button, kit, RowAction, Rows, Sheet as KitSheet } from "../ui/kit";

// Upstream normalises names before sending them (ComponentAction.tsx, selectComponent).
const normalise = (name: string) => name.replace(/\./g, "").replace(/,/g, "").replace(/ Ω/g, "");
const RESEARCH = new Set(["Plagiarize", "Focused Research", "Enigmatic Device", "UNITDSGNFLAYESH"]);
const RELIC = new Set(["Gain Relic", "Black Market Forgery", "Hesh and Prit"]);

interface Usable { name: string; description: string; group: string; faded?: boolean }

const GROUPS = ["Action cards", "Technology", "Leaders", "Relics and exploration", "Promissory notes", "Abilities and other"];

// Upstream's filter (ComponentAction, ComponentSelect), copied since it's inline.
function useUsableComponents(factionId: FactionId, factions: Ctx["factions"]): Usable[] {
  const components = useComponents();
  const actionCards = useActionCards();
  const relics = useRelics();
  const techs = useTechs();
  const leaders = useLeaders();
  const planets = usePlanets();
  const faction = factions[factionId];
  if (!faction) return [];
  const unownedRelics = Object.values(relics).filter((r) => r && !r.owner);
  const out: Usable[] = [];
  for (const c of Object.values(components)) {
    if (!c) continue;
    const owner = c.faction;
    if (c.type === "PROMISSORY" && owner && (!factions[owner] || owner === factionId)) continue;
    if (owner && c.type !== "PROMISSORY" && c.type !== "TECH" && c.type !== "PLANET" && owner !== factionId) continue;
    if (!unownedRelics.length && (c.id === "Gain Relic" || c.id === "Black Market Forgery")) continue;
    if ("subFaction" in c && c.subFaction && c.subFaction !== faction.startswith?.faction) continue;
    if (c.type === "RELIC") { const r = relics[c.id as RelicId]; if (!r || r.owner !== factionId) continue; }
    if (c.type === "TECH") { const t = techs[c.id as TechId]; if (!t || !hasTech(faction, t)) continue; }
    if (c.state === "purged") continue;
    if ("leader" in c && c.leader === "HERO" && leaders[c.id as LeaderId]?.state !== "readied") continue;
    if ("leader" in c && c.leader && leaders[c.id as LeaderId]?.state === "purged") continue;
    if (c.id === "Age of Exploration" && techs["Dark Energy Tap"] && !hasTech(faction, techs["Dark Energy Tap"])) continue;
    if (c.type === "PLANET" && planets[c.id as PlanetId]?.owner !== factionId) continue;
    if (c.type === "EVENT" && "requiresTech" in c && c.requiresTech && !hasTech(faction, techs[c.requiresTech])) continue;
    if (c.type === "BREAKTHROUGH" && c.state === "locked") continue;
    const group = c.type === "TECH" ? "Technology" : c.type === "LEADER" ? "Leaders" : c.type === "PROMISSORY" ? "Promissory notes"
      : c.type === "EXPLORATION" || c.type === "RELIC" ? "Relics and exploration" : "Abilities and other";
    out.push({ name: c.name, description: c.description, group, faded: c.state === "exhausted" });
  }
  for (const r of Object.values(relics)) {
    if (r && r.timing === "COMPONENT_ACTION" && r.owner === factionId && r.state !== "purged" && !out.some((u) => u.name === r.name)) {
      out.push({ name: r.name, description: r.description, group: "Relics and exploration", faded: r.state === "exhausted" });
    }
  }
  for (const a of Object.values(actionCards)) {
    if (a && a.timing === "COMPONENT_ACTION") out.push({ name: a.name, description: a.description, group: "Action cards", faded: a.state === "discarded" });
  }
  return out;
}

// The component played this turn, if any (upstream reads the first).
export function usePlayedComponent() {
  const currentTurn = useCurrentTurn();
  return getLogEntries<{ action: "PLAY_COMPONENT"; event: { name: string; factionId: FactionId } }>(currentTurn, "PLAY_COMPONENT")
    .map((e) => e.data.event.name).reverse()[0];
}

export function ComponentControls({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, w, open, factions } = ctx;
  const played = usePlayedComponent();
  const usable = useUsableComponents(active, factions);
  if (!played) {
    return (
      <Button kind="primary" block disabled={w.pending} onClick={() => open({ kind: "component", faction: active })} detail="Ability, tech, leader, relic, promissory note or card">
        Which component?
      </Button>
    );
  }
  const info = usable.find((u) => normalise(u.name) === played);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={kit.line}>
        <span className={kit.grow}><b>{info?.name ?? played}</b></span>
        <Button size="small" disabled={w.pending}
          onClick={() => w.write([{ action: "UNPLAY_COMPONENT", event: { name: played, factionId: active } } as unknown as GameUpdateData], `${short(active)} took back ${info?.name ?? played}`, active)}>Take it back</Button>
      </div>
      {info?.description ? <p className={kit.sub} style={{ whiteSpace: "pre-line", margin: 0 }}>{info.description}</p> : null}
      {RESEARCH.has(played) ? <Button block disabled={w.pending} onClick={() => open({ kind: "research", faction: active })}>Record the technology</Button> : null}
      {RELIC.has(played) ? <Button block disabled={w.pending} onClick={() => open({ kind: "relic", faction: active })}>Record the relic</Button> : null}
    </div>
  );
}

export function ComponentSheet({ faction, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { short, w, factions } = ctx;
  const usable = useUsableComponents(faction, factions);
  const [q, setQ] = useState("");
  const shown = usable.filter((u) => !q || u.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const play = async (u: Usable) => {
    if (await w.write([{ action: "PLAY_COMPONENT", event: { name: normalise(u.name), factionId: faction } } as unknown as GameUpdateData], `${short(faction)} used ${u.name}`, faction)) close();
  };
  return (
    <KitSheet title={`${short(faction)}'s component action`} close={close}>
      <input className={kit.search} type="search" placeholder="Find a component" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a component" />
      {GROUPS.map((g) => {
        const list = shown.filter((u) => u.group === g);
        if (!list.length) return null;
        return (
          <div key={g} style={{ display: "grid", gap: 6 }}>
            <p className={kit.eyebrow}><span>{g}</span></p>
            <Rows>
              {list.map((u) => (
                <RowAction key={u.name} verb="Use" disabled={w.pending} onClick={() => play(u)} title={u.name}
                  detail={u.faded ? (g === "Action cards" ? "Discarded earlier" : "Exhausted") : undefined} />
              ))}
            </Rows>
          </div>
        );
      })}
      {!shown.length ? <p className={kit.sub}>Nothing matches.</p> : null}
    </KitSheet>
  );
}

export function RelicSheet({ faction, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { short, w } = ctx;
  const relics = useRelics();
  const list = Object.values(relics).filter((r): r is Relic => !!r && !r.owner).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <KitSheet title={`${short(faction)} gains a relic`} close={close}>
      <p className={kit.sub}>Draw the top relic, then find it here.</p>
      {list.length ? (
        <Rows>
          {list.map((r) => (
            <RowAction key={r.id} verb="Gain" disabled={w.pending} title={r.name} detail={r.description}
              onClick={async () => {
                if (await w.write([Events.GainRelicEvent(faction, r.id)], `${short(faction)} gained ${r.name}`, faction)) close();
              }} />
          ))}
        </Rows>
      ) : <p className={kit.sub}>Every relic has an owner.</p>}
    </KitSheet>
  );
}
