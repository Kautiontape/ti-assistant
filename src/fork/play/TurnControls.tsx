"use client";
// The rest of upstream's turn controls (ActionPhase.tsx NextPlayerButtons,
// UnpassSection, the Pass section's Faunus and Prove Endurance): skip a turn,
// change the chosen action, take another action, Puppets on a String, Ral Nel's
// unpass, and the extras recorded when passing.
import { useState } from "react";
import { useActionCard, useLeader, usePlanets } from "../../context/dataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useNewSpeaker } from "../../context/actionLogDataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { usePassedFactionIds } from "../../context/factionDataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet, Switch } from "../ui/kit";

// Ending a turn can need the speaker first: Politics' primary picks a new one
// (upstream hides End Turn until then).
export function useEndTurnBlock(selected: Optional<string>) {
  const newSpeaker = useNewSpeaker();
  return selected === "Politics" && !newSpeaker ? "Choose the new speaker first (Politics)." : undefined;
}

// Under the chosen action: change it, or end the turn differently.
export function OtherEndings({ active, selected, ctx }: { active: FactionId; selected: string; ctx: Ctx }) {
  const { w, short, open } = ctx;
  const passed = usePassedFactionIds().filter((id) => id !== active);
  const puppets = useActionCard("Puppets on a String");
  const block = useEndTurnBlock(selected);
  return (
    <Rows label="Other ways to end the turn">
      {selected !== "Pass" ? (
        <RowAction verb="Change" disabled={w.pending} title="Change the action" detail={`Undo choosing ${selected === "Tactical" || selected === "Component" ? `a ${selected.toLowerCase()} action` : selected}`}
          onClick={() => w.write([Events.UnselectActionEvent(selected as Action)], `${short(active)} changed their mind about ${selected}`, active)} />
      ) : null}
      {selected !== "Pass" ? (
        <RowAction verb="Go again" disabled={w.pending || !!block} title="Take another action" detail="This action is done; they take another before the next player"
          onClick={() => w.write([Events.EndTurnEvent({ samePlayer: true })], `${short(active)} took another action`, active)} />
      ) : null}
      {puppets && passed.length ? <RowLink onClick={() => open({ kind: "puppets", faction: active })} title="Puppets on a String" detail="A passed player takes the next turn" /> : null}
    </Rows>
  );
}

export function SkipTurnSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  return (
    <KitSheet title="Skip this turn?" close={close}>
      <p className={kit.confirm}>{short(id)} takes no action this turn, and play moves to the next player.</p>
      <Button kind="primary" block disabled={w.pending} onClick={async () => {
        if (await w.write([Events.EndTurnEvent({ skipTurn: true })], `${short(id)} skipped their turn`, id)) close();
      }}>Skip the turn</Button>
    </KitSheet>
  );
}

export function PuppetsSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { w, short, factions } = ctx;
  const passed = usePassedFactionIds().filter((p) => p !== id);
  return (
    <KitSheet title="Puppets on a String" close={close}>
      <p className={kit.sub}>{short(id)} ends their turn, and a player who has passed takes the next one.</p>
      <Rows>
        {passed.map((p) => (
          <RowAction key={p} verb="Their turn" disabled={w.pending} title={<Chip faction={p} factions={factions} short={short} small />} label={`${short(p)} takes the next turn`}
            onClick={async () => { if (await w.write([Events.EndTurnEvent({ jumpToPlayer: p })], `${short(id)} ended their turn; ${short(p)} is next (Puppets on a String)`, id)) close(); }} />
        ))}
      </Rows>
    </KitSheet>
  );
}

// When everyone has passed: Ral Nel's hero lets them take turns again.
export function UnpassButton({ ctx }: { ctx: Ctx }) {
  const hero = useLeader("Director Nel");
  if (!ctx.factions["Ral Nel Consortium"] || hero?.state !== "readied") return null;
  return (
    <Button block disabled={ctx.w.pending} onClick={() => ctx.w.write([Events.UnpassEvent("Ral Nel Consortium")], "Ral Nel unpassed (Director Nel)", "Ral Nel Consortium")}>
      Ral Nel unpasses (Director Nel)
    </Button>
  );
}

// Passing: the extras upstream records with it, then SELECT_ACTION Pass and END_TURN in one write.
export function PassSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  const planets = usePlanets();
  const objectives = useObjectives();
  const passed = usePassedFactionIds();
  const all = useOrderedFactionIds("SPEAKER");
  const [prove, setProve] = useState(false);
  const [faunus, setFaunus] = useState<Optional<string>>();
  const [q, setQ] = useState("");
  // Prove Endurance: the last player to pass (upstream's canProveEndurance).
  const pe = objectives["Prove Endurance"];
  const last = all.length - 1 === passed.filter((p) => p !== id).length;
  const canProve = ctx.tracks("OBJECTIVES") && !!pe && last && !(pe.scorers ?? []).includes(id) && !(pe.type === "SECRET" && (pe.scorers ?? []).length > 0);
  // Faunus: when passing, take a non-home, non-legendary planet with no attachments (Faunus.tsx).
  const hasFaunus = ctx.tracks("PLANETS") && planets["Faunus"]?.owner === id;
  const faunusTargets = hasFaunus ? Object.values(planets).filter((p): p is Planet => !!p && !p.home && !p.attributes.includes("legendary") && !(p.attachments ?? []).length && p.owner !== id)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const pass = async () => {
    const events: GameUpdateData[] = [Events.SelectActionEvent("Pass")];
    if (faunus) events.push(Events.ClaimPlanetEvent(id, faunus as PlanetId));
    if (prove) events.push(Events.ScoreObjectiveEvent(id, "Prove Endurance"));
    events.push(Events.EndTurnEvent({}));
    const extras = [faunus ? `took ${planets[faunus as PlanetId]?.name ?? faunus} with Faunus` : null, prove ? "scored Prove Endurance" : null].filter(Boolean);
    if (await w.write(events, `${short(id)} passed${extras.length ? ` and ${extras.join(" and ")}` : ""}`, id)) close();
  };
  return (
    <KitSheet title="Pass for the round?" close={close}>
      <p className={kit.confirm}>{short(id)} passes and takes no more turns this round.</p>
      {canProve ? <Switch label="Score Prove Endurance" detail="They're the last player to pass" checked={prove} onChange={setProve} /> : null}
      {hasFaunus ? (
        <div className={kit.section}>
          <p className={kit.sub}>Faunus: exhaust it to take control of a non-home, non-legendary planet with no units and no attachments.</p>
          <input className={kit.search} type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a planet for Faunus" />
          <Choices list label="Take a planet with Faunus?" value={faunus ?? "none"} onChange={(v) => setFaunus(v === "none" ? undefined : v)}
            options={[{ value: "none", label: "No planet" }, ...faunusTargets.slice(0, 30).map((p) => ({ value: p.id as string, label: p.name, note: p.owner ? `${short(p.owner)}'s` : undefined }))]} />
        </div>
      ) : null}
      <Button kind="primary" size="tall" block disabled={w.pending} onClick={pass}>Pass</Button>
    </KitSheet>
  );
}
