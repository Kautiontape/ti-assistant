"use client";
// More component follow-ups, each as upstream's ComponentActions record it:
// Planetary Rigs (PlanetaryRigs.tsx), Dannel of the Tenth (a tactical action),
// Unravel (PurgeRelic.tsx) and Transpose (Transpose.tsx).
import { useState } from "react";
import { useAttachments, useCurrentTurn, usePlanets, useRelics } from "../../context/dataHooks";
import { getAttachments, getClaimedPlanets, getLogEntries, getPurgedRelic, getSelectedFaction } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { applyPlanetAttachments } from "../../util/planets";
import { Optional } from "../../util/types/types";
import { TfCardsSheet } from "../tfplay/TfCards";
import { gainedIn } from "../tfplay/tf";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows } from "../ui/kit";

// Planetary Rigs: attach a card to one of your planets (not a home planet or
// Mecatol Rex), one that suits its type and isn't on another planet.
export function PlanetaryRigs({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, w } = ctx;
  const planets = usePlanets();
  const attachments = useAttachments();
  const currentTurn = useCurrentTurn();
  const [picked, setPicked] = useState<Optional<PlanetId>>();
  const [q, setQ] = useState("");
  const done = getLogEntries<AddAttachmentData>(currentTurn, "ADD_ATTACHMENT")[0]?.data.event;
  if (done) {
    const p = planets[done.planet];
    const a = attachments[done.attachment];
    return (
      <Rows label="Planetary Rigs">
        <RowAction verb="Take back" disabled={w.pending} title={`${a?.name ?? done.attachment} on ${p?.name ?? done.planet}`}
          onClick={() => w.write([Events.RemoveAttachmentEvent(done.planet, done.attachment)], `Took back ${a?.name ?? done.attachment} on ${p?.name ?? done.planet}`, active)} />
      </Rows>
    );
  }
  const mine = Object.values(planets).filter((p): p is Planet => !!p && p.owner === active && !p.home && p.id !== "Mecatol Rex").sort((a, b) => a.name.localeCompare(b.name));
  const planet = picked ? planets[picked] : undefined;
  if (planet) {
    const used = new Set<AttachmentId>();
    for (const p of Object.values(planets)) for (const a of p?.attachments ?? []) used.add(a);
    const types = applyPlanetAttachments(planet, attachments).types;
    const fits = Object.values(attachments).filter((a): a is Attachment => !!a && !!a.required.type && types.includes(a.required.type) && !used.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <Rows label={`Planetary Rigs on ${planet.name}`}>
          {fits.map((a) => (
            <RowAction key={a.id} verb="Attach" disabled={w.pending} title={a.name} detail={[a.resources ? `+${a.resources} resources` : "", a.influence ? `+${a.influence} influence` : ""].filter(Boolean).join(", ") || undefined}
              onClick={() => w.write([Events.AddAttachmentEvent(planet.id, a.id)], `${short(active)}: ${a.name} on ${planet.name} (Planetary Rigs)`, active)} />
          ))}
          <RowLink onClick={() => setPicked(undefined)} title="Choose another planet" />
        </Rows>
        {!fits.length ? <p className={kit.sub}>Nothing fits {planet.name} right now.</p> : null}
      </div>
    );
  }
  const shown = mine.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {mine.length > 8 ? <input className={kit.search} type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a planet for Planetary Rigs" /> : null}
      <Rows label="Planetary Rigs: choose a planet">
        {shown.slice(0, 40).map((p) => <RowLink key={p.id} onClick={() => setPicked(p.id)} title={p.name} />)}
      </Rows>
      {!mine.length ? <p className={kit.sub}>{short(active)} has no planet to attach it to.</p> : null}
    </div>
  );
}

// Dannel of the Tenth / Blessing of the Yin: a tactical action that takes up to
// 3 planets and can score action-phase secrets (upstream embeds TacticalAction).
export function Dannel({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, open } = ctx;
  const currentTurn = useCurrentTurn();
  const taken = getClaimedPlanets(currentTurn, active).length;
  return (
    <Rows label="Tactical action">
      {ctx.tracks("PLANETS") ? <RowLink onClick={() => open({ kind: "claim", faction: active })} title={`${short(active)} takes a planet`} detail={`${taken} of 3 this turn`} /> : null}
      {ctx.tracks("OBJECTIVES") ? <RowLink onClick={() => open({ kind: "score", faction: active, which: "secret", phase: "ACTION" })} title="Scored a secret?" detail="Action-phase secrets" /> : null}
    </Rows>
  );
}

// Unravel: purge a relic; one a different player holds is worth a point.
export function Unravel({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, w } = ctx;
  const relics = useRelics();
  const currentTurn = useCurrentTurn();
  const purged = getPurgedRelic(currentTurn);
  if (purged) {
    const r = relics[purged];
    const vp = !!r && r.owner !== active;
    return (
      <Rows label="Unravel">
        <RowAction verb="Take back" disabled={w.pending} title={`Purged ${r?.name ?? purged}`} detail={vp ? "Worth a point" : "Put The Fracture into play"}
          onClick={() => w.write([Events.UnpurgeRelicEvent(purged, vp)], `${short(active)} took back purging ${r?.name ?? purged}`, active)} />
      </Rows>
    );
  }
  const list = Object.values(relics).filter((r): r is Relic => !!r && !!r.owner && r.state !== "purged").sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Rows label="Unravel: purge a relic">
      {list.map((r) => (
        <RowAction key={r.id} verb="Purge" disabled={w.pending} title={r.name} detail={r.owner === active ? "Yours" : `${short(r.owner)}'s: +1 point`}
          onClick={() => w.write([Events.PurgeRelicEvent(r.id, r.owner !== active)], `${short(active)} purged ${r.name} (Unravel)`, active)} />
      ))}
      {!list.length ? <p className={kit.sub}>No relic to purge.</p> : null}
    </Rows>
  );
}

// Transpose: choose a player; each gives the other one ability.
export function Transpose({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const currentTurn = useCurrentTurn();
  const chosen = getSelectedFaction(currentTurn);
  const who = chosen && chosen !== "None" ? (chosen as FactionId) : undefined;
  const [pick, setPick] = useState<Optional<FactionId>>(who);
  // Who is taking an ability from whom, in the sheet.
  const [giving, setGiving] = useState<Optional<{ from: FactionId; to: FactionId }>>();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Choices label="Swap abilities with" value={pick} onChange={(v) => setPick(v as FactionId)}
        options={Object.values(factions).filter((x): x is Faction => !!x && x.id !== active).map((x) => ({ value: x.id as string, label: <Chip faction={x.id} factions={factions} short={short} small /> }))} />
      {pick && pick !== who ? <Button block disabled={w.pending} onClick={() => w.write([Events.SelectFactionEvent(pick)], `${short(active)} swaps abilities with ${short(pick)} (Transpose)`, active)}>Confirm: {short(pick)}</Button> : null}
      {who ? (
        <Rows>
          {[{ from: active, to: who }, { from: who, to: active }].map(({ from, to }) => {
            const got = gainedIn(currentTurn, to).filter((g) => g.type === "ABILITY");
            return <RowLink key={to} onClick={() => setGiving({ from, to })} title={`${short(to)} takes an ability from ${short(from)}`} detail={got.length ? `Took ${got.map((g) => g.id).join(", ")}` : undefined} />;
          })}
        </Rows>
      ) : null}
      {giving ? <TfCardsSheet faction={giving.to} from={giving.from} types={["ABILITY"]} limit={{ ABILITY: 1 }} ctx={ctx} close={() => setGiving(undefined)}
        title={`${short(giving.to)} takes an ability`} note={`Choose one of ${short(giving.from)}'s abilities (Transpose).`} /> : null}
    </div>
  );
}
