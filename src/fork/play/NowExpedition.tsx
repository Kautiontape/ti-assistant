"use client";
// Thunder's Edge expedition (Shawn's list: "Thunder's Edge extras"): six slots,
// each committed to once on a player's turn; the first commit readies that
// player's breakthrough, and when all six are taken whoever committed most
// gets Thunder's Edge. Upstream's handler (src/util/model/commitToExpedition.ts)
// does all of that; this records who committed where, as upstream's
// ExpeditionSelector (src/components/Expedition/) does.
import { useState } from "react";
import { useCurrentTurn, useExpedition, useOptions, usePlanet } from "../../context/dataHooks";
import { getLatestExpedition, getNewOwner } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import styles from "./play.module.scss";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

export const EXPEDITIONS: [ExpeditionId, string][] = [
  ["resources", "Resources"], ["influence", "Influence"], ["tradeGoods", "Trade goods"],
  ["actionCards", "Action cards"], ["secrets", "Secret objective"], ["techSkip", "Technology skip"],
];
const nameOf = (id: ExpeditionId) => EXPEDITIONS.find(([k]) => k === id)?.[1] ?? id;

export function useExpeditionOn() {
  const options = useOptions();
  return options.expansions.includes("THUNDERS EDGE") && !options.expansions.includes("TWILIGHTS FALL" as Expansion);
}

// Upstream's tie rule: the players with the most commits.
export function leaders(expedition: Expedition): FactionId[] {
  const count: Partial<Record<FactionId, number>> = {};
  for (const f of Object.values(expedition)) if (f) count[f] = (count[f] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(count).map((n) => n ?? 0));
  return (Object.keys(count) as FactionId[]).filter((f) => count[f] === max);
}

export function ExpeditionButton({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const on = useExpeditionOn();
  const expedition = useExpedition();
  const currentTurn = useCurrentTurn();
  if (!on) return null;
  const taken = Object.keys(expedition).length;
  const mine = getLatestExpedition(currentTurn, active);
  if (taken >= 6 && !mine) return null;
  return <RowLink onClick={() => ctx.open({ kind: "expedition", faction: active })} title="Thunder's Edge expedition" detail={mine ? `${ctx.short(active)} committed: ${nameOf(mine.expedition)}` : `${taken} of 6 slots taken`} />;
}

export function ExpeditionSheet({ faction, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const expedition = useExpedition();
  const currentTurn = useCurrentTurn();
  const thundersEdge = usePlanet("Thunder's Edge");
  const mine = getLatestExpedition(currentTurn, faction);
  const complete = Object.keys(expedition).length >= 6;
  const tied = complete ? leaders(expedition) : [];
  const newOwner = getNewOwner(currentTurn, "Thunder's Edge");
  const commit = async (id: ExpeditionId) => {
    const events: GameUpdateData[] = [];
    if (mine) events.push(Events.CommitToExpeditionEvent(mine.expedition, undefined));
    events.push(Events.CommitToExpeditionEvent(id, faction));
    if (await w.write(events, `${short(faction)} committed to the ${nameOf(id)} expedition`, faction)) close();
  };
  const takeBack = async () => {
    if (!mine) return;
    if (await w.write([Events.CommitToExpeditionEvent(mine.expedition, undefined)], `${short(faction)} took back the ${nameOf(mine.expedition)} expedition`, faction)) close();
  };
  const give = async (to: FactionId) => {
    if (await w.write([Events.ClaimPlanetEvent(to, "Thunder's Edge")], `${short(to)} took control of Thunder's Edge`, to)) close();
  };
  return (
    <KitSheet title="Thunder's Edge expedition" close={close}>
      <p className={kit.sub}>Pay the cost on the board; this records who committed where. A player's first commit readies their breakthrough. When all six are taken, whoever committed most gets Thunder's Edge.</p>
      {mine ? (
        <div className={kit.banner}>
          <span className={kit.grow}>{short(faction)} committed to <b>{nameOf(mine.expedition)}</b> this turn.</span>
          <Button size="small" disabled={w.pending} onClick={takeBack}>Take it back</Button>
        </div>
      ) : null}
      <Rows>
        {EXPEDITIONS.map(([id, label]) => {
          const who = expedition[id];
          return (
            <RowAction key={id} disabled={!!who || w.pending} onClick={() => commit(id)} title={label} verb={who ? "" : mine ? "Move here" : "Commit"}
              end={who ? <Chip faction={who} factions={factions} short={short} small player={false} /> : undefined} />
          );
        })}
      </Rows>
      {complete && tied.length > 1 && (!thundersEdge?.owner || newOwner) ? (
        <TieBreak tied={tied} current={newOwner} give={give} ctx={ctx} />
      ) : complete && thundersEdge?.owner ? <p className={kit.sub}>{short(thundersEdge.owner)} controls Thunder's Edge.</p> : null}
    </KitSheet>
  );
}

function TieBreak({ tied, current, give, ctx }: { tied: FactionId[]; current: Optional<FactionId>; give: (id: FactionId) => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const [to, setTo] = useState<Optional<FactionId>>(current);
  return (
    <div className={kit.section}>
      <p className={kit.eyebrow}><span>Tied for the most</span></p>
      <Choices label="Who gets Thunder's Edge?" value={to} onChange={(v) => setTo(v as FactionId)}
        options={tied.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small player={false} /> }))} />
      {to && to !== current ? (
        <>
          <p className={kit.confirm}>{short(to)} takes control of Thunder's Edge?</p>
          <Button kind="primary" block disabled={w.pending} onClick={() => give(to)}>Confirm</Button>
        </>
      ) : null}
    </div>
  );
}

// For the Table tab: who holds each slot.
export function ExpeditionCard({ ctx }: { ctx: Ctx }) {
  const on = useExpeditionOn();
  const expedition = useExpedition();
  if (!on) return null;
  const taken = Object.keys(expedition).length;
  return (
    <section className={kit.card} aria-label="Expedition">
      <p className={kit.eyebrow}><span>Thunder's Edge expedition</span><span className={kit.num}>{taken} of 6</span></p>
      <ul className={styles.list}>
        {EXPEDITIONS.map(([id, label]) => {
          const who: Optional<FactionId> = expedition[id];
          return <li key={id}><span className={kit.grow}>{label}</span>{who ? <Chip faction={who} factions={ctx.factions} short={ctx.short} small player={false} /> : <span className={kit.sub}>Open</span>}</li>;
        })}
      </ul>
    </section>
  );
}
