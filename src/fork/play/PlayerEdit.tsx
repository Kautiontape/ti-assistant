"use client";
// Changing a player's components by hand, as upstream's faction panel and
// promissory menu allow: leaders (ready, exhaust, unlock, purge), the
// breakthrough, technologies, planets, relics and alliances. Opened from a
// player's sheet. Each change is one write with upstream's own event.
import { useState } from "react";
import { useLeaders, usePlanets, useRelics, useTechs } from "../../context/dataHooks";
import { useAllFactionAlliances } from "../../context/factionDataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

type Part = "leaders" | "techs" | "planets" | "relics" | "alliance";
const LEADER_ORDER = ["AGENT", "COMMANDER", "HERO"];
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();
const PAST: Record<string, string> = { Ready: "readied", Exhaust: "exhausted", Unlock: "unlocked", Lock: "locked", Purge: "purged", Unpurge: "unpurged" };

// The changes a leader can take, from its type and state (FactionPanel.tsx).
function leaderMoves(l: Leader): { verb: string; to: LeaderState }[] {
  const state = l.state ?? (l.type === "AGENT" ? "readied" : "locked");
  if (state === "purged") return [{ verb: "Unpurge", to: "readied" }];
  if (l.type === "AGENT") return state === "exhausted" ? [{ verb: "Ready", to: "readied" }] : [{ verb: "Exhaust", to: "exhausted" }];
  if (state === "locked") return [{ verb: "Unlock", to: "readied" }];
  if (l.type === "HERO") return [{ verb: "Purge", to: "purged" }, { verb: "Lock", to: "locked" }];
  return [{ verb: "Lock", to: "locked" }];
}

export function PlayerEditSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, w, open } = ctx;
  const leaders = useLeaders();
  const techs = useTechs();
  const planets = usePlanets();
  const relics = useRelics();
  const alliances = useAllFactionAlliances();
  const [part, setPart] = useState<Optional<Part>>();
  const [holder, setHolder] = useState<Optional<string>>();
  const f = factions[id];
  if (!f) return null;
  const s = short(id);
  const write = (e: GameUpdateData, label: string) => w.write([e], label, id);

  const myLeaders = Object.values(leaders).filter((l): l is Leader => !!l && l.faction === id).sort((a, b) => LEADER_ORDER.indexOf(a.type) - LEADER_ORDER.indexOf(b.type));
  const myTechs = Object.keys(f.techs ?? {}).map((t) => techs[t as TechId]).filter((t): t is Tech => !!t).sort((a, b) => a.name.localeCompare(b.name));
  const myPlanets = Object.values(planets).filter((p): p is Planet => p?.owner === id).sort((a, b) => a.name.localeCompare(b.name));
  const myRelics = Object.values(relics).filter((r): r is Relic => !!r && r.owner === id);
  const others = Object.values(factions).filter((x): x is Faction => !!x && x.id !== id).sort((a, b) => a.order - b.order).map((x) => x.id);
  // Who holds this player's Alliance: the other player whose alliances include it.
  const allianceHolder = others.find((o) => o !== "Mahact Gene-Sorcerers" && (alliances[o] ?? []).includes(id));
  const mahact = id === "Mahact Gene-Sorcerers";

  return (
    <KitSheet title={`${s}: change`} close={close}>
      {/* The sheet stays open for several changes and covers the toast, so the last change and its Undo show here. */}
      {w.toast ? (
        <div className={kit.banner} role="note" aria-label="Last change">
          <span className={kit.grow}>{w.toast.text}</span>
          {w.toast.undo ? <Button size="small" disabled={w.pending} onClick={() => w.undoNewest()}>Undo</Button> : null}
        </div>
      ) : null}
      <Choices label={`What changed for ${s}?`} value={part} onChange={setPart}
        options={[
          ...(myLeaders.length ? [{ value: "leaders" as Part, label: "Leaders" }] : []),
          ...(ctx.tracks("TECHS") ? [{ value: "techs" as Part, label: "Technology" }] : []),
          ...(ctx.tracks("PLANETS") ? [{ value: "planets" as Part, label: "Planets" }] : []),
          ...(ctx.tracks("RELICS") ? [{ value: "relics" as Part, label: "Relics" }] : []),
          { value: "alliance", label: mahact ? "Fleet pool tokens" : "Alliance" },
        ]} />

      {part === "leaders" ? (
        <Rows label="Leaders">
          {myLeaders.flatMap((l) => leaderMoves(l).map((m) => (
            <RowAction key={`${l.id}-${m.verb}`} verb={m.verb} disabled={w.pending} title={l.name}
              detail={`${cap(l.type)} · ${cap(l.state ?? (l.type === "AGENT" ? "readied" : "locked"))}`}
              onClick={() => write(Events.UpdateLeaderStateEvent(l.id, m.to), `${s}: ${l.name} ${PAST[m.verb] ?? m.to}`)} />
          )))}
          {f.breakthrough?.name ? (
            <RowAction verb={!f.breakthrough.state || f.breakthrough.state === "locked" ? "Unlock" : "Lock"} disabled={w.pending} title={f.breakthrough.name}
              detail={`Breakthrough · ${cap(f.breakthrough.state ?? "locked")}`}
              onClick={() => {
                const to: ComponentState = !f.breakthrough?.state || f.breakthrough.state === "locked" ? "readied" : "locked";
                return write(Events.UpdateBreakthroughStateEvent(id, to), `${s}: ${f.breakthrough!.name} ${to === "readied" ? "unlocked" : "locked"}`);
              }} />
          ) : null}
        </Rows>
      ) : null}

      {part === "techs" ? (
        <>
          <Rows><RowLink onClick={() => open({ kind: "research", faction: id })} title="Add a technology" detail="Researched or gained" /></Rows>
          <Rows label="Technologies">
            {myTechs.map((t) => (
              <RowAction key={t.id} verb="Remove" disabled={w.pending} title={t.name}
                onClick={() => write(Events.RemoveTechEvent(id, t.id), `${s} lost ${t.name}`)} />
            ))}
          </Rows>
        </>
      ) : null}

      {part === "planets" ? (
        <>
          <Rows><RowLink onClick={() => open({ kind: "claim", faction: id, free: true })} title="Take control of a planet" detail="Any planet, from the board or from another player" /></Rows>
          <Rows label="Planets">
            {myPlanets.map((p) => (
              <RowAction key={p.id} verb="Lose" disabled={w.pending} title={p.name} end={<span className={kit.num}>{p.resources}/{p.influence}</span>}
                onClick={() => write(Events.UnclaimPlanetEvent(id, p.id), `${s} lost ${p.name}`)} />
            ))}
          </Rows>
        </>
      ) : null}

      {part === "relics" ? (
        <>
          <Rows><RowLink onClick={() => open({ kind: "relic", faction: id })} title="Gain a relic" /></Rows>
          {myRelics.length ? (
            <Rows label="Relics">
              {myRelics.flatMap((r) => [
                <RowAction key={`${r.id}-purge`} verb={r.state === "purged" ? "Unpurge" : "Purge"} disabled={w.pending} title={r.name} detail={r.state === "purged" ? "Purged" : undefined}
                  onClick={() => write(r.state === "purged" ? Events.UnpurgeRelicEvent(r.id) : Events.PurgeRelicEvent(r.id), `${s} ${r.state === "purged" ? "unpurged" : "purged"} ${r.name}`)} />,
                <RowAction key={`${r.id}-lose`} verb="Lose" disabled={w.pending} title={r.name} detail="Gives it up"
                  onClick={() => write(Events.LoseRelicEvent(id, r.id), `${s} lost ${r.name}`)} />,
              ])}
            </Rows>
          ) : <p className={kit.sub}>{s} has no relics.</p>}
        </>
      ) : null}

      {part === "alliance" && !mahact ? (
        <div className={kit.section}>
          <Choices label={`Who holds ${s}'s Alliance?`} value={holder ?? allianceHolder ?? "nobody"} onChange={setHolder}
            options={[...others.filter((o) => o !== "Mahact Gene-Sorcerers").map((o) => ({ value: o as string, label: <Chip faction={o} factions={factions} short={short} small /> })), { value: "nobody", label: `Nobody: ${s} has it` }]} />
          {holder && holder !== (allianceHolder ?? "nobody") ? (
            <>
              <p className={kit.confirm}>{holder === "nobody" ? `${short(allianceHolder)} returns ${s}'s Alliance?` : `${s} gives their Alliance to ${short(holder)}${allianceHolder ? ` (from ${short(allianceHolder)})` : ""}?`}</p>
              <Button kind="primary" block disabled={w.pending} onClick={async () => {
                const e = holder === "nobody" ? Events.LoseAllianceEvent(allianceHolder!, id) : Events.GainAllianceEvent(holder as FactionId, id);
                if (await write(e, holder === "nobody" ? `${short(allianceHolder)} returned ${s}'s Alliance` : `${s} gave their Alliance to ${short(holder)}`)) setHolder(undefined);
              }}>Confirm</Button>
            </>
          ) : null}
        </div>
      ) : null}

      {part === "alliance" && mahact ? (
        <Rows label="Fleet pool tokens">
          {others.map((o) => {
            const has = (alliances[id] ?? []).includes(o);
            return (
              <RowAction key={o} verb={has ? "Remove" : "Add"} disabled={w.pending} title={<Chip faction={o} factions={factions} short={short} small />}
                label={`${has ? "Remove" : "Add"} ${short(o)}'s token`} detail={has ? "Mahact has their commander's ability" : undefined}
                onClick={() => write(has ? Events.LoseAllianceEvent(id, o) : Events.GainAllianceEvent(id, o), has ? `Mahact returned ${short(o)}'s token` : `Mahact took ${short(o)}'s token into its fleet pool`)} />
            );
          })}
        </Rows>
      ) : null}

      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}
