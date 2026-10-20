"use client";
// A player's sheet: what they hold and how they got their points, from data
// upstream already tracks. Each component's name opens its text in a popout.
import { useActionCards, useActionLog, useAgendas, useLeaders, usePlanets, useRelics, useStrategyCards, useTechs } from "../../context/dataHooks";
import { usePassedFactionIds } from "../../context/factionDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useSpeaker } from "../../context/stateDataHooks";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { combats, pointsBySource, SFTT } from "./logic";
import styles from "./play.module.scss";
import { playedActionCards } from "./NowActionCards";
import type { Ctx } from "./ui";
import { CardTag, Chip, Cite, kit, Section, Sheet, Tag, type Thing } from "../ui/kit";
import { TfOwnedCards } from "../tfplay/TfCards";

const STATE: Record<string, string> = { readied: "Ready", exhausted: "Exhausted", locked: "Locked", purged: "Purged", used: "Used" };
const TECH_COLOURS: [string, string][] = [["GREEN", "Biotic"], ["BLUE", "Propulsion"], ["YELLOW", "Cybernetic"], ["RED", "Warfare"], ["UPGRADE", "Unit upgrades"], ["OTHER", "Other"]];

type Item = { thing: Thing; name: string; state?: string };

// Names that open their text in a popout, with a state tag where it matters.
function Items({ items, empty }: { items: Item[]; empty?: string }) {
  if (!items.length) return empty ? <p className={kit.sub}>{empty}</p> : null;
  return (
    <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", lineHeight: 1.9 }}>
      {items.map((i, k) => <span key={`${i.name}-${k}`} className={kit.line} style={{ gap: 6, display: "inline-flex" }}><Cite thing={i.thing}>{i.name}</Cite>{i.state ? <Tag>{i.state}</Tag> : null}</span>)}
    </p>
  );
}

export function PlayerSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short } = ctx;
  const objectives = useObjectives();
  const planets = usePlanets();
  const techs = useTechs();
  const leaders = useLeaders();
  const relics = useRelics();
  const agendas = useAgendas();
  const strategyCards = useStrategyCards();
  const speaker = useSpeaker();
  const passed = usePassedFactionIds();
  const actionCards = useActionCards();
  const log = useActionLog();
  const f = factions[id];
  if (!f) return null;

  const pts = pointsBySource(objectives, id, f.vps ?? 0);
  const cards = getStrategyCardsForFaction(strategyCards, id);
  const owned = Object.values(planets).filter((p): p is Planet => p?.owner === id).sort((a, b) => a.name.localeCompare(b.name));
  const res = owned.reduce((n, p) => n + p.resources, 0), inf = owned.reduce((n, p) => n + p.influence, 0);
  const myTechs = Object.keys(f.techs ?? {}).map((t) => techs[t as TechId]).filter((t): t is Tech => !!t);
  const myLeaders = Object.values(leaders).filter((l): l is Leader => !!l && l.faction === id)
    .sort((a, b) => ["AGENT", "COMMANDER", "HERO"].indexOf(a.type) - ["AGENT", "COMMANDER", "HERO"].indexOf(b.type));
  const myRelics = Object.values(relics).filter((r): r is Relic => !!r && r.owner === id);
  const laws = Object.values(agendas).filter((a): a is Agenda => !!a && a.passed === true && a.target === id);
  const throneFrom = Object.entries(objectives[SFTT]?.keyedScorers ?? {}).filter(([, holders]) => holders?.includes(id)).map(([giver]) => giver as FactionId);
  const alliances = f.alliances ?? [];
  const fought = combats(log).filter((c) => c.end !== undefined && (c.attacker === id || c.defender === id));
  const won = fought.filter((c) => c.winner === id).length;
  const played = playedActionCards(log, id, new Set(Object.values(actionCards).map((c) => c?.name ?? "")));
  const playArea = [...throneFrom.map((g) => `${short(g)}'s Support for the Throne`), ...alliances.map((a) => `${short(a)}'s Alliance`)];
  const cardIdByName = (name: string) => Object.values(actionCards).find((c) => c?.name === name)?.id ?? name;

  return (
    <Sheet title={f.name} close={close} dock>
      <div className={kit.line} style={{ flexWrap: "wrap", gap: 6 }}>
        <Chip faction={id} factions={factions} short={short} />
        <span className={kit.grow} />
        {speaker === id ? <Tag>Speaker</Tag> : null}
        {passed.includes(id) ? <Tag>Passed</Tag> : null}
        <span className={styles.vp}>{pts.total}</span>
      </div>

      {cards.length ? (
        <Section title="Strategy card">
          <div className={kit.line} style={{ flexWrap: "wrap", gap: 8 }}>
            {cards.map((c) => <span key={c.id} className={kit.line} style={{ gap: 6 }}><CardTag card={c} used={c.used} large /><span className={kit.sub}>{c.used ? "Played" : passed.includes(id) ? "Passed" : "Ready"}</span></span>)}
          </div>
        </Section>
      ) : null}

      <Section title="Points" count={pts.total}>
        <ul className={styles.list}>{pts.groups.map((g) => {
          const detail = g.label === "Support for the Throne" ? `From ${throneFrom.map((x) => short(x)).join(" and ")}` : g.label === "Imperial" || g.label === "Custodians" ? "" : g.items.join(", ");
          return <li key={g.label}><span className={kit.grow}><b>{g.label}</b>{detail ? <><br /><span className={kit.sub}>{detail}</span></> : null}</span><span className={kit.num}>{g.points}</span></li>;
        })}</ul>
      </Section>

      {myLeaders.length ? (
        <Section title="Leaders">
          <Items items={myLeaders.map((l) => ({ thing: { kind: "leader", id: l.id }, name: `${l.name} (${l.type[0] + l.type.slice(1).toLowerCase()})`, state: STATE[l.state ?? (l.type === "AGENT" ? "readied" : "locked")] }))} />
        </Section>
      ) : null}

      <Section title="Technology" count={myTechs.length}>
        {TECH_COLOURS.map(([type, label]) => {
          const group = myTechs.filter((t) => t.type === type);
          return group.length ? (
            <div key={type} style={{ display: "grid", gap: 2 }}>
              <p className={kit.sub}>{label}</p>
              <Items items={group.map((t) => ({ thing: { kind: "tech", id: t.id }, name: t.name, state: f.techs?.[t.id]?.state === "exhausted" ? "Exhausted" : undefined }))} />
            </div>
          ) : null;
        })}
        {!myTechs.length ? <p className={kit.sub}>None</p> : null}
        {f.breakthrough?.name ? <Items items={[{ thing: { kind: "breakthrough", id }, name: `${f.breakthrough.name} (breakthrough)`, state: f.breakthrough.state ? STATE[f.breakthrough.state] : "Locked" }]} /> : null}
      </Section>

      <TfOwnedCards faction={id} ctx={ctx} />

      {myRelics.length ? (
        <Section title="Relics" count={myRelics.length}>
          <Items items={myRelics.map((r) => ({ thing: { kind: "relic", id: r.id }, name: r.name, state: r.state ? STATE[r.state] : undefined }))} />
        </Section>
      ) : null}

      {playArea.length ? (
        <Section title="In their play area">
          <p className={kit.sub}>{playArea.join(" · ")}</p>
        </Section>
      ) : null}

      {fought.length ? (
        <Section title="Combats" count={`${won} of ${fought.length} won`}>
          <p className={kit.sub}>{fought.map((c) => `${c.kind === "space" ? "Space" : `Ground${c.planet ? ` (${c.planet})` : ""}`} vs ${short(c.attacker === id ? c.defender : c.attacker)}: ${c.winner === id ? "won" : c.winner === "None" ? "no winner" : "lost"}`).join(" · ")}</p>
        </Section>
      ) : null}

      <Section title="Action cards played" count={played.length}>
        <Items items={played.map((name) => ({ thing: { kind: "actionCard", id: cardIdByName(name) }, name }))} empty="None recorded" />
      </Section>

      {laws.length ? (
        <Section title="Laws that name them">
          <Items items={laws.map((a) => ({ thing: { kind: "agenda", id: a.id }, name: a.name }))} />
        </Section>
      ) : null}

      <Section title="Planets" count={`${owned.length} · ${res} res · ${inf} inf`}>
        <Items items={owned.map((p) => ({ thing: { kind: "planet", id: p.id }, name: p.attachments?.length ? `${p.name} (${p.attachments.length} attached)` : p.name }))} empty="None" />
      </Section>

      {f.abilities?.length ? (
        <Section title="Faction abilities">
          <Items items={f.abilities.map((a) => ({ thing: { kind: "ability", id: `${id}|${a.name}` }, name: a.name }))} />
        </Section>
      ) : null}
    </Sheet>
  );
}
