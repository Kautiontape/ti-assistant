"use client";
// Component actions: pick the component, then any follow-up the group needs
// (gain a relic, research a tech); everything else happens on the board.
// Upstream's picker and follow-ups are in main/phase/action/ComponentAction.tsx.
import { useState } from "react";
import { useActionCards, useComponents, useCurrentTurn, useLeaders, usePlanets, useRelics, useTechs } from "../../context/dataHooks";
import { getLogEntries } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { hasTech } from "../../util/api/techs";
import styles from "./play.module.scss";
import { cx, SheetFrame, type Ctx } from "./ui";

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
      <button className={cx(styles.btn, styles.primary, styles.block)} disabled={w.pending} onClick={() => open({ kind: "component", faction: active })}>
        Which component?<small>Ability, tech, leader, relic, promissory note or card</small>
      </button>
    );
  }
  const info = usable.find((u) => normalise(u.name) === played);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={styles.row}>
        <span className={styles.grow}><b>{info?.name ?? played}</b></span>
        <button className={cx(styles.btn, styles.smallBtn)} disabled={w.pending}
          onClick={() => w.write([{ action: "UNPLAY_COMPONENT", event: { name: played, factionId: active } } as unknown as GameUpdateData], `${short(active)} took back ${info?.name ?? played}`, active)}>Take it back</button>
      </div>
      {info?.description ? <p className={styles.sub} style={{ whiteSpace: "pre-line", margin: 0 }}>{info.description}</p> : null}
      {RESEARCH.has(played) ? <button className={cx(styles.btn, styles.block)} disabled={w.pending} onClick={() => open({ kind: "research", faction: active })}>Record the technology</button> : null}
      {RELIC.has(played) ? <button className={cx(styles.btn, styles.block)} disabled={w.pending} onClick={() => open({ kind: "relic", faction: active })}>Record the relic</button> : null}
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
    <SheetFrame title={`${short(faction)}'s component action`} close={close}>
      <input className={styles.search} type="search" placeholder="Find a component" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a component" />
      {GROUPS.map((g) => {
        const list = shown.filter((u) => u.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className={styles.eyebrow}><span>{g}</span></p>
            {list.map((u) => (
              <button key={u.name} className={styles.opt} disabled={w.pending} onClick={() => play(u)} style={u.faded ? { opacity: 0.6 } : undefined}>
                <span style={{ display: "grid", textAlign: "left", gap: 2 }}>
                  <b>{u.name}</b>
                  {u.faded ? <span className={styles.sub}>{g === "Action cards" ? "Discarded earlier" : "Exhausted"}</span> : null}
                </span>
              </button>
            ))}
          </div>
        );
      })}
      {!shown.length ? <p className={styles.sub}>Nothing matches.</p> : null}
    </SheetFrame>
  );
}

export function RelicSheet({ faction, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { short, w } = ctx;
  const relics = useRelics();
  const list = Object.values(relics).filter((r): r is Relic => !!r && !r.owner).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <SheetFrame title={`${short(faction)} gains a relic`} close={close}>
      <p className={styles.sub}>Draw the top relic, then find it here.</p>
      {list.map((r) => (
        <button key={r.id} className={styles.opt} disabled={w.pending} onClick={async () => {
          if (await w.write([Events.GainRelicEvent(faction, r.id)], `${short(faction)} gained ${r.name}`, faction)) close();
        }}>
          <span style={{ display: "grid", textAlign: "left", gap: 2 }}><b>{r.name}</b><span className={styles.sub}>{r.description}</span></span>
        </button>
      ))}
      {!list.length ? <p className={styles.sub}>Every relic has an owner.</p> : null}
    </SheetFrame>
  );
}
