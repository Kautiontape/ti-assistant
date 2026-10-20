"use client";
// What a component does after it's played, as upstream's component screen
// records it (main/phase/action/ComponentAction.tsx ComponentDetails and
// ComponentActions/*.tsx). Each records with upstream's own events; some only
// show what the card gives (trade goods aren't tracked).
import { useState } from "react";
import { useActionLog, useCurrentTurn, useOptions, usePlanets, useStrategyCards, useTechs } from "../../context/dataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { getLogEntries, getResearchedTechs } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { hasTech } from "../../util/api/techs";
import { getFactionSystemId } from "../../util/map";
import { applyAllPlanetAttachments } from "../../util/planets";
import { Optional } from "../../util/types/types";
import { CardControls } from "./NowCards";
import type { Ctx } from "./ui";
import { Button, CardTag, Chip, Choices, kit, RowAction, RowLink, Rows } from "../ui/kit";

export const FOLLOW_UPS = new Set([
  "Dynamis Core", "Industrial Initiative", "Mining Initiative", "Total War", "Book of Latvinia",
  "Share Knowledge", "Divert Funding", "Visionaria Select", "Vaults of the Heir", "Ta Zern",
  "Stellar Converter", "Conventions of War Abandoned", "Nano-Forge", "Terraform", "Z'eu",
  "Overrule", "Mathis Mathinus", "Strategize", "The Silver Flame",
]);

export function ComponentFollowUp({ played, active, ctx }: { played: string; active: FactionId; ctx: Ctx }) {
  switch (played) {
    case "Dynamis Core": case "Industrial Initiative": case "Mining Initiative": case "Total War": case "Book of Latvinia":
      return <Gains played={played} active={active} ctx={ctx} />;
    case "Share Knowledge": case "Divert Funding": case "Visionaria Select": case "Vaults of the Heir": case "Ta Zern":
      return <TechFollowUp played={played} active={active} ctx={ctx} />;
    case "Stellar Converter": case "Conventions of War Abandoned": case "Nano-Forge": case "Terraform":
      return <PlanetFollowUp played={played} active={active} ctx={ctx} />;
    case "Z'eu":
      return <Zeu active={active} ctx={ctx} />;
    case "Overrule": case "Mathis Mathinus": case "Strategize":
      return <CardFollowUp played={played} active={active} ctx={ctx} />;
    case "The Silver Flame":
      return <SilverFlame active={active} ctx={ctx} />;
  }
  return null;
}

// What the card gives that isn't tracked, worked out as upstream does.
function Gains({ played, active, ctx }: { played: string; active: FactionId; ctx: Ctx }) {
  const planets = usePlanets();
  const log = useActionLog();
  const speaker = useGameState().speaker;
  const f = ctx.factions[active];
  const mine = applyAllPlanetAttachments(Object.values(planets).filter((p): p is Planet => !!p && p.owner === active), {});
  let text = "";
  if (played === "Dynamis Core") text = `Gain ${(f?.commodities ?? 0) + 2 + mine.filter((p) => p.attributes.includes("space-station")).length} trade goods (commodities + 2 + space stations).`;
  if (played === "Industrial Initiative") text = `Gain ${mine.filter((p) => p.types.includes("INDUSTRIAL")).length} trade goods (one per industrial planet).`;
  if (played === "Mining Initiative") { const best = [...mine].sort((a, b) => b.resources - a.resources)[0]; text = best ? `Gain ${best.resources} trade goods (${best.name}).` : "No planet to count."; }
  if (played === "Total War") text = "Scored Total War: +1 point (recorded with the component).";
  if (played === "Book of Latvinia") {
    const e = getLogEntries<PlayComponentData>(log, "PLAY_COMPONENT").find((x) => x.data.event.name === "Book of Latvinia");
    text = e?.data.event.prevFaction ? `${ctx.short(speaker)} is the new speaker (no 4 technology specialties).` : "Scored Book of Latvinia: +1 point (4 technology specialties).";
  }
  return <p className={kit.sub} style={{ margin: 0 }}>{text}</p>;
}

function TechFollowUp({ played, active, ctx }: { played: string; active: FactionId; ctx: Ctx }) {
  const { factions, short, w, open } = ctx;
  const techs = useTechs();
  const currentTurn = useCurrentTurn();
  const [tech, setTech] = useState<Optional<TechId>>();
  const f = factions[active];
  if (!f) return null;
  const owns = (id: FactionId, t: Tech) => hasTech(factions[id], t);
  const all = Object.values(techs).filter((t): t is Tech => !!t);
  const researched = getResearchedTechs(currentTurn, active) as TechId[];
  const removed = getLogEntries<RemoveTechData>(currentTurn, "REMOVE_TECH").filter((e) => e.data.event.faction === active).map((e) => e.data.event.tech);
  const purged = getLogEntries<PurgeTechData>(currentTurn, "PURGE_TECH").map((e) => e.data.event.techId);
  const name = (t: TechId) => techs[t]?.name ?? t;

  if (played === "Share Knowledge") {
    // A Deepwrought technology the player lacks (not a faction tech or unit upgrade).
    const list = all.filter((t) => !t.faction && t.type !== "UPGRADE" && owns("Deepwrought Scholarate", t) && !owns(active, t));
    return (
      <Rows label="Share Knowledge">
        {researched.map((t) => <RowAction key={t} verb="Take back" disabled={w.pending} title={`Gained ${name(t)}`} onClick={() => w.write([Events.RemoveTechEvent(active, t)], `${short(active)} took back ${name(t)}`, active)} />)}
        {!researched.length ? list.map((t) => <RowAction key={t.id} verb="Gain" disabled={w.pending} title={t.name} detail="Deepwrought's"
          onClick={() => w.write([Events.AddTechEvent(active, t.id, undefined, false, true)], `${short(active)} gained ${t.name} (Share Knowledge)`, active)} />) : null}
      </Rows>
    );
  }
  if (played === "Divert Funding") {
    // Return a technology (not a faction tech or upgrade), then research another.
    const returnable = all.filter((t) => !t.faction && t.type !== "UPGRADE" && owns(active, t));
    return removed.length ? (
      <Rows label="Divert Funding">
        <RowAction verb="Take back" disabled={w.pending} title={`Returned ${name(removed[0]!)}`} detail={researched.length ? `Researched ${researched.map(name).join(", ")}` : "Now research a technology"}
          onClick={() => w.write([...researched.map((t) => Events.RemoveTechEvent(active, t)), Events.AddTechEvent(active, removed[0]!)], `${short(active)} took back Divert Funding`, active)} />
        {!researched.length ? <RowLink onClick={() => open({ kind: "research", faction: active })} title="Research a technology" /> : null}
      </Rows>
    ) : (
      <Rows label="Divert Funding: return a technology">
        {returnable.map((t) => <RowAction key={t.id} verb="Return" disabled={w.pending} title={t.name} onClick={() => w.write([Events.RemoveTechEvent(active, t.id)], `${short(active)} returned ${t.name} (Divert Funding)`, active)} />)}
      </Rows>
    );
  }
  if (played === "Visionaria Select") {
    // Each other player may take a non-faction technology; Deepwrought gains it too.
    const others = Object.values(factions).filter((x): x is Faction => !!x && x.id !== "Deepwrought Scholarate").map((x) => x.id);
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <Choices list label="Which technology?" value={tech} onChange={(v) => setTech(v as TechId)}
          options={all.filter((t) => !t.faction && t.type !== "UPGRADE").sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.id as string, label: t.name }))} />
        {tech ? (
          <Rows label="Who takes it">
            {others.map((id) => {
              const has = owns(id, techs[tech]!);
              return <RowAction key={id} verb={has ? "Has it" : "Gains it"} disabled={w.pending || has} title={<Chip faction={id} factions={factions} short={short} small />} label={`${short(id)} gains ${name(tech)}`}
                onClick={() => w.write([Events.AddTechEvent(id, tech, ["Deepwrought Scholarate"])], `${short(id)} gained ${name(tech)} (Visionaria Select)`, active)} />;
            })}
          </Rows>
        ) : null}
      </div>
    );
  }
  if (played === "Vaults of the Heir") {
    // Purge one of your technologies, then gain a relic.
    return (
      <Rows label="Vaults of the Heir">
        {purged.length ? <RowAction verb="Take back" disabled={w.pending} title={`Purged ${name(purged[0]!)}`} onClick={() => w.write([Events.UnpurgeTechEvent(purged[0]!, active)], `${short(active)} took back purging ${name(purged[0]!)}`, active)} />
          : all.filter((t) => owns(active, t)).map((t) => <RowAction key={t.id} verb="Purge" disabled={w.pending} title={t.name} onClick={() => w.write([Events.PurgeTechEvent(t.id, active)], `${short(active)} purged ${t.name} (Vaults of the Heir)`, active)} />)}
        {purged.length ? <RowLink onClick={() => open({ kind: "relic", faction: active })} title="Gain a relic" /> : null}
      </Rows>
    );
  }
  // Ta Zern: purge a technology for everyone; each player who had it researches another.
  const purgeable = all.filter((t) => t.type !== "UPGRADE" && (!t.faction || t.faction === "Deepwrought Scholarate"));
  const gone = purged[0];
  const losers = gone ? Object.values(factions).filter((x): x is Faction => !!x && !!x.techs?.[gone]).map((x) => x.id) : [];
  return gone ? (
    <Rows label="Ta Zern">
      <RowAction verb="Take back" disabled={w.pending} title={`Purged ${name(gone)}`} onClick={() => w.write([Events.UnpurgeTechEvent(gone)], `Took back purging ${name(gone)}`, active)} />
      {losers.map((id) => <RowLink key={id} onClick={() => open({ kind: "research", faction: id })} title={`${short(id)} researches a replacement`} />)}
    </Rows>
  ) : (
    <Rows label="Ta Zern: purge a technology">
      {purgeable.filter((t) => Object.values(factions).some((x) => !!x?.techs?.[t.id])).map((t) => (
        <RowAction key={t.id} verb="Purge" disabled={w.pending} title={t.name} onClick={() => w.write([Events.PurgeTechEvent(t.id)], `${t.name} was purged (Ta Zern)`, active)} />
      ))}
    </Rows>
  );
}

// Stellar Converter / Conventions of War Abandoned purge a planet; Nano-Forge and
// Terraform attach to one of the player's (targets as PurgePlanet / AttachToPlanet).
function PlanetFollowUp({ played, active, ctx }: { played: string; active: FactionId; ctx: Ctx }) {
  const { short, w } = ctx;
  const planets = usePlanets();
  const [q, setQ] = useState("");
  const list = Object.values(planets).filter((p): p is Planet => !!p);
  const ocean = (p: Planet) => p.attributes.includes("ocean"), station = (p: Planet) => p.attributes.includes("space-station");
  const purge = played === "Stellar Converter" || played === "Conventions of War Abandoned";
  const targets = purge
    ? list.filter((p) => !ocean(p) && !station(p) && p.state !== "PURGED" && (played !== "Stellar Converter" || (!p.home && !p.attributes.includes("legendary") && p.id !== "Mecatol Rex")))
    : list.filter((p) => p.owner === active && !p.home && !ocean(p) && !station(p) && !p.attributes.includes("synthetic")
      && (played === "Nano-Forge" ? !p.attributes.includes("legendary") : p.id !== "Mecatol Rex"));
  // Upstream's planet list leaves purged planets out, so this turn's purges come from the log.
  const currentTurn = useCurrentTurn();
  const purgedNow = getLogEntries<UpdatePlanetStateData>(currentTurn, "UPDATE_PLANET_STATE").filter((e) => e.data.event.state === "PURGED").map((e) => e.data.event.planet);
  const done = purge ? purgedNow.map((id) => planets[id] ?? ({ id, name: id } as Planet)) : list.filter((p) => p.attachments?.includes(played as AttachmentId));
  const shown = targets.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {done.length ? (
        <Rows label="Done">
          {done.map((p) => <RowAction key={p.id} verb="Take back" disabled={w.pending} title={purge ? `Purged ${p.name}` : `${played} on ${p.name}`}
            onClick={() => w.write([purge ? Events.UpdatePlanetStateEvent(p.id, "READIED") : Events.RemoveAttachmentEvent(p.id, played as AttachmentId)], `Took back ${played} on ${p.name}`, active)} />)}
        </Rows>
      ) : (
        <>
          <input className={kit.search} type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Find a planet for ${played}`} />
          <Rows label={purge ? "Planet to purge" : `Planet for ${played}`}>
            {shown.slice(0, 40).map((p) => <RowAction key={p.id} verb={purge ? "Purge" : "Attach"} disabled={w.pending} title={p.name} detail={p.owner ? `${short(p.owner)}'s` : undefined}
              onClick={() => w.write([purge ? Events.UpdatePlanetStateEvent(p.id, "PURGED") : Events.AddAttachmentEvent(p.id, played as AttachmentId)], `${played}: ${p.name}`, active)} />)}
          </Rows>
        </>
      )}
    </div>
  );
}

// Z'eu: another player takes a tactical action; record their planets and secrets.
function Zeu({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { factions, short, w, open } = ctx;
  const currentTurn = useCurrentTurn();
  const chosen = getLogEntries<SelectFactionData>(currentTurn, "SELECT_FACTION").map((e) => e.data.event.faction)[0];
  const who = chosen && chosen !== "None" ? (chosen as FactionId) : undefined;
  const [pick, setPick] = useState<Optional<FactionId>>(who);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Choices label="Who takes the tactical action?" value={pick} onChange={(v) => setPick(v as FactionId)}
        options={Object.values(factions).filter((x): x is Faction => !!x).map((x) => ({ value: x.id as string, label: <Chip faction={x.id} factions={factions} short={short} small /> }))} />
      {pick && pick !== who ? <Button block disabled={w.pending} onClick={() => w.write([Events.SelectFactionEvent(pick)], `${short(pick)} takes the tactical action (Z'eu)`, active)}>Confirm: {short(pick)}</Button> : null}
      {who ? (
        <Rows>
          <RowLink onClick={() => open({ kind: "claim", faction: who })} title={`${short(who)} takes a planet`} />
          <RowLink onClick={() => open({ kind: "score", faction: who, which: "secret", phase: "ACTION" })} title={`${short(who)} scored a secret?`} />
        </Rows>
      ) : null}
    </div>
  );
}

// Overrule / Mathis Mathinus: play another strategy card's primary; Strategize:
// its secondary (upstream: SELECT_SUB_COMPONENT, then that card's controls).
function CardFollowUp({ played, active, ctx }: { played: string; active: FactionId; ctx: Ctx }) {
  const { short, w, open } = ctx;
  const strategyCards = useStrategyCards();
  const currentTurn = useCurrentTurn();
  const options = useOptions();
  const sub = getLogEntries<SelectSubComponentData>(currentTurn, "SELECT_SUB_COMPONENT").map((e) => e.data.event.subComponent)[0];
  const card = sub && sub !== "None" ? (sub as StrategyCardId) : undefined;
  const any = played === "Mathis Mathinus";
  const cards = Object.values(strategyCards).filter((c): c is StrategyCard => !!c && (any || !c.used)).sort((a, b) => a.order - b.order);
  const secondary = played === "Strategize";
  if (!card) {
    return (
      <Rows label={secondary ? "Which card's secondary?" : "Which card's primary?"}>
        {cards.map((c) => <RowAction key={c.id} verb="Use" disabled={w.pending} title={<CardTag card={c} still />} label={`Use ${c.name}`}
          onClick={() => w.write([Events.SelectSubComponentEvent(c.id)], `${short(active)} used ${c.name}'s ${secondary ? "secondary" : "primary"} (${played})`, active)} />)}
      </Rows>
    );
  }
  const c = strategyCards[card];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Rows><RowAction verb="Change" disabled={w.pending} title={c ? <CardTag card={c} still /> : card} label={`Change from ${card}`} detail={secondary ? c?.secondary : c?.primary}
        onClick={() => w.write([Events.SelectSubComponentEvent("None")], `${short(active)} changed the card (${played})`, active)} /></Rows>
      {!secondary ? <CardControls card={card} active={active} ctx={ctx} />
        : card === "Technology" ? <Rows><RowLink onClick={() => open({ kind: "research", faction: active })} title="Research a technology" /></Rows> : null}
      {!secondary && card === "Warfare" && options.expansions.includes("THUNDERS EDGE") ? (
        <Rows><RowLink onClick={() => open({ kind: "claim", faction: active })} title="Take a planet" /><RowLink onClick={() => open({ kind: "score", faction: active, which: "secret", phase: "ACTION" })} title="Scored a secret?" /></Rows>
      ) : null}
    </div>
  );
}

// The Silver Flame: +1 point, or purge your home system (SilverFlame.tsx).
function SilverFlame({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, w, factions } = ctx;
  const currentTurn = useCurrentTurn();
  const scored = getLogEntries<ScoreObjectiveData>(currentTurn, "SCORE_OBJECTIVE").some((e) => e.data.event.objective === "The Silver Flame");
  const home = factions[active] ? getFactionSystemId(factions[active]!) : undefined;
  const purged = getLogEntries<PurgeSystemData>(currentTurn, "PURGE_SYSTEM").some((e) => e.data.event.systemId === home);
  return (
    <Rows label="The Silver Flame">
      {!purged ? <RowAction verb={scored ? "Take back" : "Score"} disabled={w.pending} title="Roll 10 or more: +1 point"
        onClick={() => w.write([scored ? Events.UnscoreObjectiveEvent(active, "The Silver Flame") : Events.ScoreObjectiveEvent(active, "The Silver Flame")], scored ? `${short(active)} took back The Silver Flame's point` : `${short(active)} scored The Silver Flame`, active)} /> : null}
      {!scored && home ? <RowAction verb={purged ? "Take back" : "Purge"} disabled={w.pending} title="Otherwise: purge your home system"
        onClick={() => w.write([purged ? Events.UnpurgeSystemEvent(home) : Events.PurgeSystemEvent(home)], purged ? `${short(active)} took back purging their home system` : `${short(active)}'s home system was purged (The Silver Flame)`, active)} /> : null}
    </Rows>
  );
}
