"use client";
// Strategy cards whose abilities change the game, during the action phase:
// Technology (research, for the player and for followers), Politics (the new
// speaker) and Imperial (scoring a public objective). Upstream's controls are in
// main/phase/action/StrategicActions/; the rest of each card happens on the board.
import { useEffect, useState } from "react";
import { useAttachments, useCurrentTurn, useOptions, usePlanets, useRelics, useTechs } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useSpeaker } from "../../context/stateDataHooks";
import { getResearchedTechs } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { hasTech } from "../../util/api/techs";
import { applyAllPlanetAttachments } from "../../util/planets";
import { canResearchTech, getFactionPreReqs, sortTechsByPreReqAndExpansion } from "../../util/techs";
import { ActionLog, Optional } from "../../util/types/types";
import { scoredThisPhase } from "./logic";
import styles from "./play.module.scss";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, Cite, kit, RowAction, Rows, Sheet as KitSheet, Tag } from "../ui/kit";

const TECH_GROUPS: [TechType | "OTHER", string][] = [
  ["GREEN", "Biotic"], ["BLUE", "Propulsion"], ["YELLOW", "Cybernetic"], ["RED", "Warfare"], ["UPGRADE", "Unit upgrades"], ["OTHER", "Faction"],
];

// Upstream's getResearchableTechs (components/TechResearchSection), which isn't
// exported: not owned, not purged, not another faction's, not already researched
// this turn, and generic upgrades give way to the faction's own.
function researchableTechs(currentTurn: ActionLog, techs: Partial<Record<TechId, Tech>>, faction: Optional<Faction>, factions: Ctx["factions"]) {
  if (!faction) return [];
  const replaces: TechId[] = [];
  const researched = getResearchedTechs(currentTurn, faction.id);
  const list = Object.values(techs).filter((tech): tech is Tech => {
    if (!tech || hasTech(faction, tech) || tech.state === "purged") return false;
    if ((faction.techs ?? {})[tech.id]?.state === "purged") return false;
    const owner = (tech as { faction?: FactionId }).faction;
    if (owner && !factions[owner]) return false;
    if (faction.id !== "Nekro Virus" && owner && owner !== faction.id) return false;
    if (researched.includes(tech.id)) return false;
    if (tech.type === "UPGRADE" && tech.replaces) replaces.push(tech.replaces);
    return true;
  });
  return faction.id === "Nekro Virus" ? list : list.filter((t) => !replaces.includes(t.id));
}

export const CARDS_WITH_CONTROLS = new Set<string>(["Technology", "Politics", "Imperial"]);

export function CardControls({ card, active, ctx }: { card: StrategyCardId; active: FactionId; ctx: Ctx }) {
  if (card === "Technology") return <TechnologyPrimary active={active} ctx={ctx} />;
  if (card === "Politics") return <PoliticsPrimary active={active} ctx={ctx} />;
  if (card === "Imperial") return <ImperialPrimary active={active} ctx={ctx} />;
  return null;
}

function TechnologyPrimary({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, w, open } = ctx;
  const currentTurn = useCurrentTurn();
  const techs = useTechs();
  const researched = getResearchedTechs(currentTurn, active);
  if (active === "Nekro Virus") return <p className={kit.sub}>Nekro gains command tokens instead of researching.</p>;
  if (!ctx.tracks("TECHS")) return <p className={kit.sub}>This game doesn't track technologies.</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {researched.map((id) => (
        <div key={id} className={kit.line}>
          <span className={kit.grow}><Cite thing={{ kind: "tech", id }}>{techs[id]?.name ?? id}</Cite> <span className={kit.sub}>researched</span></span>
          <Button size="small" disabled={w.pending}
            onClick={() => w.write([Events.RemoveTechEvent(active, id)], `${short(active)} took back ${techs[id]?.name ?? id}`, active)}>Take it back</Button>
        </div>
      ))}
      {researched.length < 2 ? (
        <Button kind={researched.length ? "secondary" : "primary"} block disabled={w.pending} onClick={() => open({ kind: "research", faction: active })}
          detail={researched.length ? "Costs 6 resources" : "The first is free"}>
          {researched.length ? "Research a second technology" : "Research a technology"}
        </Button>
      ) : null}
    </div>
  );
}

// Politics: choose the new speaker, then confirm (it changes the turn order).
function PoliticsPrimary({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const currentTurn = useCurrentTurn();
  const speaker = useSpeaker();
  const order = useOrderedFactionIds("MAP");
  const change = currentTurn.find((e) => e.data.action === "SET_SPEAKER")?.data as Optional<{ event: { newSpeaker: FactionId; prevSpeaker?: FactionId } }>;
  const before = change?.event.prevSpeaker ?? speaker;
  const chosen = change?.event.newSpeaker;
  const [pick, setPick] = useState<Optional<FactionId>>(chosen);
  useEffect(() => setPick(chosen), [chosen]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Choices label={chosen ? `New speaker: ${short(chosen)}` : "Who is the new speaker?"} value={pick} onChange={(v) => setPick(v as FactionId)}
        options={order.map((id) => ({ value: id as string, disabled: id === before, note: id === before ? "speaker" : undefined, label: <Chip faction={id} factions={factions} short={short} small player={false} /> }))} />
      {pick && pick !== chosen ? (
        <Button kind="primary" block disabled={w.pending} onClick={() => w.write([Events.SetSpeakerEvent(pick)], `${short(pick)} is the new speaker`, active)}>
          Make {short(pick)} the speaker
        </Button>
      ) : null}
      {!chosen ? <p className={kit.sub}>Politics makes someone other than the current speaker the new speaker.</p> : null}
    </div>
  );
}

function ImperialPrimary({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, open, w } = ctx;
  const currentTurn = useCurrentTurn();
  const objectives = useObjectives();
  const planets = usePlanets();
  const scored = scoredThisPhase(currentTurn, objectives, active).publics;
  const mecatol = planets["Mecatol Rex"]?.owner === active;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {ctx.tracks("OBJECTIVES") ? (
        <Button kind={scored.length ? "secondary" : "primary"} block disabled={w.pending} onClick={() => open({ kind: "score", faction: active, which: "public", anyPhase: true })}
          detail={scored.length ? "Change it" : "If they meet its requirements"}>
          {scored.length ? `Scored ${scored.map((id) => objectives[id]?.name ?? id).join(", ")}` : "Score a public objective"}
        </Button>
      ) : null}
      <p className={kit.sub}>
        {mecatol ? `${short(active)} controls Mecatol Rex, so the Imperial point was added when Imperial was chosen.` : `${short(active)} doesn't control Mecatol Rex, so they draw a secret objective instead of the Imperial point.`}
      </p>
    </div>
  );
}

// ---------- secondaries ----------

const BRILLIANT = "Universities of Jol-Nar" as FactionId;

// Everyone but the active player may follow the card's secondary. Anyone can
// record it for anyone (upstream's SecondaryCheck in main/phase/action/ActionPhase.tsx).
export function SecondariesCard({ card, active, ctx }: { card: StrategyCard; active: FactionId; ctx: Ctx }) {
  const { factions, short, w, open, seat } = ctx;
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER").filter((id) => id !== active);
  const mark = (id: FactionId, state: "DONE" | "SKIPPED" | "PENDING") => w.write([Events.MarkSecondaryEvent(id, state)],
    state === "PENDING" ? `${short(id)}'s secondary is open again` : `${short(id)} ${state === "DONE" ? "followed" : "skipped"} ${card.name}`, id);
  const done = order.filter((id) => (factions[id]?.secondary ?? "PENDING") !== "PENDING").length;
  return (
    <section className={kit.card} aria-label="Secondaries">
      <p className={kit.eyebrow}><span>{card.name} secondary</span><span className={kit.num}>{done} of {order.length}</span></p>
      <ul className={styles.list}>
        {order.map((id) => {
          const state = factions[id]?.secondary ?? "PENDING";
          return (
            <li key={id}>
              <Chip faction={id} factions={factions} short={short} small player={false} />
              <span className={kit.grow} />
              {state === "PENDING" ? (
                <>
                  <Button size="small" forOther={id !== seat} disabled={w.pending}
                    onClick={() => (card.id === "Technology" && id !== "Nekro Virus" && ctx.tracks("TECHS") ? open({ kind: "research", faction: id, follow: true }) : mark(id, "DONE"))}>Follow</Button>
                  <Button size="small" disabled={w.pending} onClick={() => mark(id, "SKIPPED")}>Skip</Button>
                </>
              ) : (
                <>
                  {/* Jol-Nar's Brilliant: following Technology may resolve the primary, so a second technology. */}
                  {card.id === "Technology" && id === BRILLIANT && state === "DONE" && ctx.tracks("TECHS") && getResearchedTechs(currentTurn, id).length === 1 ? (
                    <Button size="small" forOther={id !== seat} disabled={w.pending} onClick={() => open({ kind: "research", faction: id })}>2nd tech</Button>
                  ) : null}
                  <Tag tone="done">{state === "DONE" ? "Followed" : "Skipped"}</Tag>
                  <Button kind="quiet" disabled={w.pending} aria-label={`${short(id)} ${state === "DONE" ? "followed" : "skipped"}; reopen`} onClick={() => mark(id, "PENDING")}>Change</Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className={kit.sub}>Each player usually marks their own. Change opens one again.</p>
    </section>
  );
}

// ---------- research sheet ----------

export function ResearchSheet({ faction: factionId, follow, close, ctx }: { faction: FactionId; follow?: boolean; close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const currentTurn = useCurrentTurn();
  const techs = useTechs();
  const options = useOptions();
  const planets = usePlanets();
  const attachments = useAttachments();
  const relics = useRelics();
  const [q, setQ] = useState("");
  const faction = factions[factionId];
  const prereqs = getFactionPreReqs(faction, techs, options, applyAllPlanetAttachments(Object.values(planets).filter((p): p is Planet => !!p), attachments), relics);
  const owned = (id: TechId) => Object.values(factions).some((f) => !!f?.techs?.[id]);
  const list = researchableTechs(currentTurn, techs, faction, factions).filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  sortTechsByPreReqAndExpansion(list);
  const research = async (tech: Tech) => {
    const events: GameUpdateData[] = [Events.AddTechEvent(factionId, tech.id)];
    if (follow) events.push(Events.MarkSecondaryEvent(factionId, "DONE"));
    const label = follow ? `${short(factionId)} followed Technology and researched ${tech.name}` : `${short(factionId)} researched ${tech.name}`;
    if (await w.write(events, label, factionId)) close();
  };
  return (
    <KitSheet title={follow ? `${short(factionId)} follows Technology` : `${short(factionId)} researches`} close={close}>
      {follow ? <p className={kit.sub}>Following costs a strategy token and 4 resources on the board. Pick the technology, or follow without recording one.</p> : null}
      {follow && factionId === BRILLIANT ? <p className={kit.sub}>Brilliant: Jol-Nar may resolve the primary instead. After this one, "2nd tech" on their row records a second technology (6 resources on the board).</p> : null}
      <input className={kit.search} type="search" placeholder="Find a technology" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a technology" />
      {TECH_GROUPS.map(([type, label]) => {
        const group = list.filter((t) => t.type === type);
        if (!group.length) return null;
        return (
          <div key={type} style={{ display: "grid", gap: 6 }}>
            <p className={kit.eyebrow}><span>{label}</span></p>
            <Rows>
              {group.map((t) => {
                const ok = canResearchTech(t, options, prereqs, faction, owned(t.id), techs);
                return (
                  <RowAction key={t.id} verb="Research" disabled={w.pending} onClick={() => research(t)} title={t.name}
                    detail={!ok ? "Missing prerequisites" : undefined} end={<span className={kit.num}>{t.prereqs.map((p) => p[0]).join("") || "—"}</span>} />
                );
              })}
            </Rows>
          </div>
        );
      })}
      {!list.length ? <p className={kit.sub}>Nothing left to research.</p> : null}
      {follow ? (
        <Button block disabled={w.pending}
          onClick={async () => { if (await w.write([Events.MarkSecondaryEvent(factionId, "DONE")], `${short(factionId)} followed Technology`, factionId)) close(); }}>
          Follow without recording a technology
        </Button>
      ) : null}
    </KitSheet>
  );
}
