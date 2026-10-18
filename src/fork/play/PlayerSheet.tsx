"use client";
// A player's sheet: what they hold and how they got their points, from data
// upstream already tracks. Each component opens to its rules text.
import { useActionCards, useActionLog, useAgendas, useLeaders, usePlanets, useRelics, useStrategyCards, useTechs } from "../../context/dataHooks";
import { usePassedFactionIds } from "../../context/factionDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useSpeaker } from "../../context/stateDataHooks";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { combats, pointsBySource, SFTT } from "./logic";
import { playedActionCards } from "./NowActionCards";
import styles from "./play.module.scss";
import { Chip, cx, SheetFrame, type Ctx } from "./ui";

const STATE: Record<string, string> = { readied: "Ready", exhausted: "Exhausted", locked: "Locked", purged: "Purged", used: "Used" };
const TECH_COLOURS: [string, string][] = [["GREEN", "Biotic"], ["BLUE", "Propulsion"], ["YELLOW", "Cybernetic"], ["RED", "Warfare"], ["UPGRADE", "Unit upgrades"], ["OTHER", "Other"]];

// One line that opens to the component's text.
function Item({ name, state, text }: { name: string; state?: string; text?: string }) {
  return (
    <details className={styles.item}>
      <summary><b className={styles.grow}>{name}</b>{state ? <span className={styles.pill}>{state}</span> : null}</summary>
      {text ? <p className={styles.sub} style={{ whiteSpace: "pre-line" }}>{text}</p> : null}
    </details>
  );
}

function Section({ title, count, children }: { title: string; count?: string | number; children: React.ReactNode }) {
  return (
    <>
      <p className={styles.eyebrow}><span>{title}</span>{count !== undefined ? <span className={styles.num}>{count}</span> : null}</p>
      {children}
    </>
  );
}

export function PlayerSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, open } = ctx;
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

  return (
    <SheetFrame title={f.name} close={close}>
      <div className={styles.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <Chip faction={id} factions={factions} short={short} />
        <span className={styles.grow} />
        {speaker === id ? <span className={styles.pill}>Speaker</span> : null}
        {passed.includes(id) ? <span className={styles.pill}>Passed</span> : null}
        <span className={styles.vp}>{pts.total}</span>
      </div>

      {cards.length ? (
        <Section title="Strategy card">
          <div className={styles.row} style={{ flexWrap: "wrap", gap: 8 }}>
            {cards.map((c) => (
              <button key={c.id} className={cx(styles.btn, styles.smallBtn)} onClick={() => open({ kind: "card", card: c.id })}>
                {c.order} {c.name} · {c.used ? "Played" : passed.includes(id) ? "Passed" : "Ready"}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Points" count={pts.total}>
        <ul className={styles.list}>{pts.groups.map((g) => {
          const detail = g.label === "Support for the Throne" ? `From ${throneFrom.map((x) => short(x)).join(" and ")}` : g.label === "Imperial" || g.label === "Custodians" ? "" : g.items.join(", ");
          return <li key={g.label}><span className={styles.grow}><b>{g.label}</b>{detail ? <><br /><span className={styles.sub}>{detail}</span></> : null}</span><span className={styles.num}>{g.points}</span></li>;
        })}</ul>
      </Section>

      {myLeaders.length ? (
        <Section title="Leaders">
          {myLeaders.map((l) => <Item key={l.id} name={`${l.name} · ${l.type[0] + l.type.slice(1).toLowerCase()}`} state={STATE[l.state ?? (l.type === "AGENT" ? "readied" : "locked")]} text={`${l.unlock ? `Unlock: ${l.unlock}\n` : ""}${l.description}`} />)}
        </Section>
      ) : null}

      <Section title="Technology" count={myTechs.length}>
        {TECH_COLOURS.map(([type, label]) => {
          const group = myTechs.filter((t) => t.type === type);
          return group.length ? (
            <div key={type}>
              <p className={styles.sub} style={{ margin: "4px 0" }}>{label}</p>
              {group.map((t) => <Item key={t.id} name={t.name} state={f.techs?.[t.id]?.state === "exhausted" ? "Exhausted" : undefined} text={t.description} />)}
            </div>
          ) : null;
        })}
        {!myTechs.length ? <p className={styles.sub}>None</p> : null}
        {f.breakthrough?.name ? <Item name={`${f.breakthrough.name} · Breakthrough`} state={f.breakthrough.state ? STATE[f.breakthrough.state] : "Locked"} text={f.breakthrough.description} /> : null}
      </Section>

      {myRelics.length ? (
        <Section title="Relics" count={myRelics.length}>
          {myRelics.map((r) => <Item key={r.id} name={r.name} state={r.state ? STATE[r.state] : undefined} text={r.description} />)}
        </Section>
      ) : null}

      {playArea.length ? (
        <Section title="In their play area">
          <p className={styles.sub}>{playArea.join(" · ")}</p>
        </Section>
      ) : null}

      {fought.length ? (
        <Section title="Combats" count={`${won} of ${fought.length} won`}>
          <p className={styles.sub}>{fought.map((c) => `${c.kind === "space" ? "Space" : `Ground${c.planet ? ` (${c.planet})` : ""}`} vs ${short(c.attacker === id ? c.defender : c.attacker)}: ${c.winner === id ? "won" : c.winner === "None" ? "no winner" : "lost"}`).join(" · ")}</p>
        </Section>
      ) : null}

      <Section title="Action cards played" count={played.length}>
        {played.length ? played.map((name, i) => <Item key={`${name}-${i}`} name={name} text={Object.values(actionCards).find((c) => c?.name === name)?.description} />)
          : <p className={styles.sub}>None recorded</p>}
      </Section>

      {laws.length ? (
        <Section title="Laws that name them">
          {laws.map((a) => <Item key={a.id} name={a.name} text={a.passedText ?? a.description} />)}
        </Section>
      ) : null}

      <Section title="Planets" count={`${owned.length} · ${res} res · ${inf} inf`}>
        <p className={styles.sub}>
          {owned.map((p) => p.attachments?.length ? `${p.name} (${p.attachments.join(", ")})` : p.name).join(", ") || "None"}
        </p>
      </Section>

      {f.abilities?.length ? (
        <Section title="Faction abilities">
          {f.abilities.map((a) => <Item key={a.name} name={a.name} text={a.description} />)}
        </Section>
      ) : null}
    </SheetFrame>
  );
}
