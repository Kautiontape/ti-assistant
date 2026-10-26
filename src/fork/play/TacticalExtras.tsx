"use client";
// Faction extras on a tactical action that upstream's TacticalAction.tsx shows:
// Nekro's Technological Singularity (gain technologies others own) and
// Muaat's hero, Adjudicator Ba'al (a system becomes a supernova).
import { useState } from "react";
import { useCurrentTurn, useLeaders, useOptions, useSystems, useTechs } from "../../context/dataHooks";
import { getAdjudicatorBaalSystem, getResearchedTechs } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { hasTech } from "../../util/api/techs";
import { getMapString } from "../../util/options";
import { Optional } from "../../util/types/types";
import type { Ctx } from "./ui";
import { Button, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

const NEKRO = "Nekro Virus";
const MUAAT = "Embers of Muaat";

// Technologies another player owns and Nekro doesn't (TacticalAction.tsx's nekroPossibleTechs).
function useSingularity(ctx: Ctx) {
  const techs = useTechs();
  const currentTurn = useCurrentTurn();
  const nekro = ctx.factions[NEKRO];
  const gained = getResearchedTechs(currentTurn, NEKRO);
  const possible = new Set<TechId>();
  for (const f of Object.values(ctx.factions)) {
    if (!f) continue;
    for (const id of Object.keys(f.techs ?? {}) as TechId[]) {
      const t = techs[id];
      if (t && hasTech(f, t) && !hasTech(nekro, t)) possible.add(id);
    }
  }
  return { techs, gained, possible: [...possible].map((id) => techs[id]).filter((t): t is Tech => !!t).sort((a, b) => a.name.localeCompare(b.name)) };
}

export function SingularityRow({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { gained, possible } = useSingularity(ctx);
  if (active !== NEKRO || !ctx.tracks("TECHS") || (!gained.length && !possible.length)) return null;
  return <RowLink onClick={() => ctx.open({ kind: "singularity" })} title="Technological Singularity"
    detail={gained.length ? `Gained ${gained.length} of up to 4 this turn` : "Took a planet from a player: gain one of their technologies"} />;
}

export function SingularitySheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  const { techs, gained, possible } = useSingularity(ctx);
  const [q, setQ] = useState("");
  const shown = possible.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <KitSheet title="Technological Singularity" close={close}>
      <p className={kit.sub}>{short(NEKRO)} gains a technology owned by the player whose planet, ship or ground force they destroyed; up to 4 in a tactical action.</p>
      {gained.length ? (
        <Rows label="Gained this turn">
          {gained.map((id) => (
            <RowAction key={id} verb="Take back" disabled={w.pending} title={techs[id]?.name ?? id}
              onClick={() => w.write([Events.RemoveTechEvent(NEKRO, id)], `${short(NEKRO)} took back ${techs[id]?.name ?? id}`, NEKRO)} />
          ))}
        </Rows>
      ) : null}
      {gained.length < 4 ? (
        <>
          <input className={kit.search} type="search" placeholder="Find a technology" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a technology" />
          <Rows label="Other players' technologies">
            {shown.map((t) => (
              <RowAction key={t.id} verb="Gain" disabled={w.pending} title={t.name}
                detail={Object.values(ctx.factions).filter((f) => f && f.id !== NEKRO && hasTech(f, t)).map((f) => short(f!.id)).join(", ")}
                onClick={() => w.write([Events.AddTechEvent(NEKRO, t.id)], `${short(NEKRO)} gained ${t.name} (Technological Singularity)`, NEKRO)} />
            ))}
          </Rows>
        </>
      ) : <p className={kit.sub}>That's the most a tactical action allows.</p>}
      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}

// The systems Ba'al can't replace: home systems, Mecatol, hyperlanes and the
// like, by tile number (TacticalAction.tsx's canSelectSystem).
function replaceable(id: string) {
  const n = parseInt(id);
  if (!n) return false;
  return !(n < 19 || (n > 50 && n < 59) || (n > 80 && n < 82) || (n > 82 && n < 94) || (n > 94 && n < 97) || (n > 117 && n < 1035));
}

export function BaalRow({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const leaders = useLeaders();
  const options = useOptions();
  const currentTurn = useCurrentTurn();
  const systems = useSystems();
  const baal = leaders["Adjudicator Ba'al"];
  const used = getAdjudicatorBaalSystem(currentTurn);
  if (active !== MUAAT || !baal || !getMapString(options, Object.keys(ctx.factions).length)) return null;
  if (used) {
    const planets = systems[used]?.planets ?? [];
    return <RowAction verb="Take back" disabled={ctx.w.pending} title={`Adjudicator Ba'al: system ${used}`}
      detail={planets.length ? `Now a supernova; ${planets.join(", ")} destroyed` : "Now a supernova"}
      onClick={() => ctx.w.write([Events.UndoAdjudicatorBaalEvent(used)], `${ctx.short(MUAAT)} took back Adjudicator Ba'al`, MUAAT)} />;
  }
  if (baal.state !== "readied") return null;
  return <RowLink onClick={() => ctx.open({ kind: "baal" })} title="Adjudicator Ba'al" detail="Muaat's hero: replace a system with the supernova" />;
}

export function BaalSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { w, short } = ctx;
  const options = useOptions();
  const systems = useSystems();
  const [pick, setPick] = useState<Optional<string>>();
  const [q, setQ] = useState("");
  const tiles = [...new Set((getMapString(options, Object.keys(ctx.factions).length) ?? "").split(" ").filter(replaceable))];
  const label = (id: string) => { const p = systems[id as SystemId]?.planets ?? []; return p.length ? p.join(", ") : "No planets"; };
  const shown = tiles.filter((id) => !q || id.includes(q) || label(id).toLowerCase().includes(q.toLowerCase()));
  return (
    <KitSheet title="Adjudicator Ba'al" close={close}>
      <p className={kit.sub}>After moving into a system with a war sun, Muaat may replace it with the Muaat supernova tile. Units there are destroyed and its planets are purged.</p>
      <input className={kit.search} type="search" placeholder="Find a system or planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a system or planet" />
      <Choices label="Which system?" list value={pick} onChange={setPick}
        options={shown.map((id) => ({ value: id, label: `System ${id}`, note: label(id) }))} />
      {pick ? (
        <>
          <p className={kit.confirm}>Replace system {pick}{systems[pick as SystemId]?.planets.length ? ` and purge ${label(pick)}` : ""}? Ba'al is purged too.</p>
          <Button kind="primary" block disabled={w.pending} onClick={async () => {
            if (await w.write([Events.PlayAdjudicatorBaalEvent(pick as SystemId)], `${short(MUAAT)} replaced system ${pick} with the supernova (Adjudicator Ba'al)`, MUAAT)) close();
          }}>Replace system {pick}</Button>
        </>
      ) : null}
    </KitSheet>
  );
}
