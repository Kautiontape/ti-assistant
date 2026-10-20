"use client";
// A splice, from Noctis (genomes), Calamitas (unit upgrades), Magus
// (abilities) or the Splice edict (any type, every player). Cards are turned
// face up at the table; this records which, then who takes each in pick order.
// Upstream's version is src/components/Splice/SpliceModal.tsx.
import { useState } from "react";
import { useCurrentTurn, useTechs } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { Events } from "../../util/api/events";
import { getAntimatterForFaction, getWavelengthForFaction } from "../../util/techs";
import type { Ctx } from "../play/ui";
import { Button, Chip, Cite, kit, RowAction, Rows, Section, Sheet, Switch, Tag } from "../ui/kit";
import { cardEvent, spliceState, TYPE_NAMES, type SpliceType } from "./tf";
import { THING_KIND, useTfCards } from "./TfThings";

export function SpliceSheet({ type, initiator, allPlayers, close, ctx }: { type: SpliceType; initiator: FactionId; allPlayers?: boolean; close: () => void; ctx: Ctx }) {
  const { factions, short, w, controls, seat } = ctx;
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER", undefined, initiator);
  const techs = useTechs();
  const { byType, name } = useTfCards();
  const [revealing, setRevealing] = useState(false);
  const [q, setQ] = useState("");
  const s = spliceState(currentTurn, type, initiator, order, !!allPlayers);
  const started = s.revealed.length > 0;
  const one = TYPE_NAMES[type].one;
  const kind = THING_KIND[type];
  const toReveal = Math.max(0, s.total - s.revealed.length);
  const pool = Object.values(byType[type]).filter((c): c is NonNullable<typeof c> => !!c && !c.owner && !s.revealed.includes(c.id) && (!q || c.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = s.current;
  const kingTechs = current ? [getAntimatterForFaction(current), getWavelengthForFaction(current)].filter((id) => !factions[current]?.techs?.[id]) : [];

  return (
    <Sheet title={`${cap(one)} splice`} close={close}>
      <p className={kit.sub}>
        {allPlayers ? `${short(initiator)}'s Splice edict: everyone takes part.` : `${short(initiator)} started it.`} Turn {s.total} {TYPE_NAMES[type].many} face up; then each player takes one, in the order below.
      </p>

      <Section title="Pick order" count={s.pickers.length}>
        <ul className={kit.rows} style={{ listStyle: "none", margin: 0, padding: "0 12px" }}>
          {s.pickers.map((id, i) => {
            const took = Object.entries(s.takenBy).filter(([, f]) => f === id).map(([c]) => c);
            const tech = s.techs.filter((t) => t.faction === id).map((t) => techs[t.tech]?.name ?? t.tech);
            const done = i < s.pickers.indexOf(current as FactionId) || !current;
            return (
              <li key={`${id}-${i}`} className={kit.line} style={{ minHeight: 44, gap: 8 }}>
                <Chip faction={id} factions={factions} short={short} small player={false} />
                <span className={kit.grow} />
                {id === current ? <Tag tone="now">Picking</Tag> : done && (took.length || tech.length) ? <span className={kit.sub}>{[...took.map((c) => name(type, c)), ...tech].join(", ")}</span> : null}
              </li>
            );
          })}
        </ul>
      </Section>

      {!allPlayers && !started ? (
        <Section title="Who joins">
          {order.filter((id) => id !== initiator).map((id) => (
            <Switch key={id} label={short(id)} detail="Followed the secondary (1 strategy token)" checked={s.participants.includes(id)}
              onChange={(on) => w.write([on ? Events.JoinSpliceEvent(id) : Events.LeaveSpliceEvent(id)], on ? `${short(id)} joined the splice` : `${short(id)} left the splice`, id)} />
          ))}
          {type === "ABILITY" ? (
            <Switch label={`${short(initiator)} takes an extra card`} detail="Magus: 3 resources or influence; picks last instead of first" checked={s.participants.includes(initiator)}
              onChange={(on) => w.write([on ? Events.JoinSpliceEvent(initiator) : Events.LeaveSpliceEvent(initiator)], on ? `${short(initiator)} will take an extra ability` : `${short(initiator)} won't take an extra ability`, initiator)} />
          ) : null}
          <Switch label="Engineer was played" detail="Turn 2 more cards face up" checked={s.engineer}
            onChange={(on) => w.write([on ? Events.PlayActionCardEvent("Engineer", initiator) : Events.UnplayActionCardEvent("Engineer", initiator)], on ? "Engineer: 2 more cards in the splice" : "Engineer taken back", initiator)} />
          <Switch label="Reverse was played" detail="Picks go clockwise instead" checked={s.reverse}
            onChange={(on) => w.write([on ? Events.PlayActionCardEvent("Reverse", "None") : Events.UnplayActionCardEvent("Reverse", "None")], on ? "Reverse: picks go clockwise" : "Reverse taken back", initiator)} />
        </Section>
      ) : null}

      <Section title="Face up" count={`${s.revealed.length} of ${s.total}`}>
        <Rows>
          {s.revealed.map((id) => {
            const taker = s.takenBy[id];
            if (taker) return <RowAction key={id} verb={short(taker)} disabled onClick={() => {}} title={byType[type][id]?.name ?? id} detail="Taken" />;
            return current ? (
              <RowAction key={id} verb={`${short(current)} takes it`} disabled={w.pending || s.revealed.length < s.total}
                onClick={() => w.write([Events.GainTFCardEvent(current, cardEvent(type, id))], `${short(current)} took ${name(type, id)} in the splice`, current)}
                title={byType[type][id]?.name ?? id} detail={s.revealed.length < s.total ? "Turn the rest face up first" : undefined} />
            ) : <RowAction key={id} verb="Not taken" disabled onClick={() => {}} title={byType[type][id]?.name ?? id} />;
          })}
        </Rows>
        <p className={kit.sub} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
          {s.revealed.map((id) => <Cite key={id} thing={{ kind, id }}>{byType[type][id]?.name ?? id}</Cite>)}
        </p>
        {toReveal ? (
          revealing ? (
            <>
              <input className={kit.search} type="search" placeholder={`Find the ${one} turned up`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Find the ${one} turned up`} autoFocus />
              <Rows>
                {pool.slice(0, 30).map((c) => (
                  <RowAction key={c.id} verb="Turned up" disabled={w.pending} title={c.name}
                    onClick={async () => { if (await w.write([Events.RevealTFCardEvent(cardEvent(type, c.id) as AbilityEvent | GenomeEvent | UpgradeEvent)], `${name(type, c.id)} is face up in the splice`, initiator)) setQ(""); }} />
                ))}
              </Rows>
              <Button block onClick={() => setRevealing(false)}>Done turning cards up</Button>
            </>
          ) : <Button kind="primary" block onClick={() => setRevealing(true)}>Record the cards turned up ({toReveal} to go)</Button>
        ) : null}
      </Section>

      {current && s.revealed.length >= s.total && kingTechs.length ? (
        <Section title={`Or ${short(current)} takes a King technology instead`}>
          <Rows>
            {kingTechs.map((id) => (
              <RowAction key={id} verb="Take it" disabled={w.pending} title={techs[id]?.name ?? id}
                onClick={() => w.write([Events.AddTechEvent(current, id)], `${short(current)} took ${techs[id]?.name ?? id} instead of a card`, current)} />
            ))}
          </Rows>
        </Section>
      ) : null}

      {!current ? <p className={kit.confirm}>Everyone has picked. Cards nobody took go back.</p> : current !== seat && !controls(current) ? <p className={kit.sub}>{short(current)} usually takes their own card; anyone can record it.</p> : null}
      <Button block onClick={close}>Close</Button>
    </Sheet>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A button that opens the splice sheet, with where it stands.
export function SpliceButton({ type, initiator, allPlayers, ctx, primary }: { type: SpliceType; initiator: FactionId; allPlayers?: boolean; ctx: Ctx; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER", undefined, initiator);
  const s = spliceState(currentTurn, type, initiator, order, !!allPlayers);
  const label = !s.revealed.length ? `Start the ${TYPE_NAMES[type].one} splice` : s.current ? `${ctx.short(s.current)} picks in the splice` : "Splice done";
  return (
    <>
      <Button kind={primary && s.current ? "primary" : "secondary"} block onClick={() => setOpen(true)} detail={`${s.pickers.length} taking part`}>{label}</Button>
      {open ? <SpliceSheet type={type} initiator={initiator} allPlayers={allPlayers} ctx={ctx} close={() => setOpen(false)} /> : null}
    </>
  );
}
