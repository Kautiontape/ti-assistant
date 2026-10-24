"use client";
// A splice, from Noctis (genomes), Calamitas (unit upgrades), Magus
// (abilities) or the Splice edict (any type, every player). Cards are turned
// face up at the table; this records which, then who takes each in pick order.
// Upstream's version is src/components/Splice/SpliceModal.tsx.
import { useState } from "react";
import { Optional } from "../../util/types/types";
import { useActionLog, useCurrentTurn, useGenomes, useTechs } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { Events } from "../../util/api/events";
import { getAntimatterForFaction, getWavelengthForFaction } from "../../util/techs";
import { groupKey, newestGroup } from "../play/logic";
import type { Ctx } from "../play/ui";
import { Button, Chip, Cite, kit, RowAction, Rows, Section, Sheet, Switch, Tag } from "../ui/kit";
import { cardEvent, SPLICE_CARDS, spliceState, TYPE_NAMES, type SpliceType } from "./tf";
import { THING_KIND, useTfCards } from "./TfThings";

export function SpliceSheet({ type, initiator, allPlayers, close, ctx }: { type: SpliceType; initiator: FactionId; allPlayers?: boolean; close: () => void; ctx: Ctx }) {
  const { factions, short, w, controls, seat } = ctx;
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER", undefined, initiator);
  const techs = useTechs();
  const { byType, name } = useTfCards();
  const researchGenome = useGenomes()["Research Genome"];
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
  // The toast sits behind this sheet, so the newest change in the splice can be undone here.
  const log = useActionLog();
  const newest = newestGroup(log);
  const newestAction = newest[0]?.data.action;
  // Thieve: a player who isn't in the splice takes one more card once everyone has picked.
  const thieves = order.filter((id) => id !== initiator && !s.participants.includes(id));
  const thiefDone = !!s.thief && Object.values(s.takenBy).includes(s.thief);
  // Research Genome is recorded as used (not as a played card); upstream's ResearchGenomeButton.
  const genomeSwitch = researchGenome?.owner ? (
    <Switch label="Research Genome was used" detail={`${short(researchGenome.owner)} turns 3 more cards face up`} checked={s.genome}
      onChange={(on) => w.write([on ? Events.UseGenomeEvent("Research Genome") : Events.UndoGenomeEvent("Research Genome")], on ? "Research Genome: 3 more cards in the splice" : "Research Genome taken back", researchGenome.owner)} />
  ) : null;
  const canUndo = !!newestAction && ["GAIN_TF_CARD", "REVEAL_TF_CARD", "ADD_TECH"].includes(newestAction) && s.revealed.length > 0;

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
            const done = i < s.pickers.indexOf(current as FactionId) || !current || current === s.thief;
            return (
              <li key={`${id}-${i}`} className={kit.line} style={{ minHeight: 44, gap: 8 }}>
                <Chip faction={id} factions={factions} short={short} small player={false} />
                <span className={kit.grow} />
                {id === current ? <Tag tone="now">Picking</Tag> : done && (took.length || tech.length) ? <span className={kit.sub}>{[...took.map((c) => name(type, c)), ...tech].join(", ")}</span> : null}
              </li>
            );
          })}
          {s.thief ? (
            <li className={kit.line} style={{ minHeight: 44, gap: 8 }}>
              <Chip faction={s.thief} factions={factions} short={short} small player={false} />
              <span className={kit.grow} />
              {s.thief === current ? <Tag tone="now">Picking (Thieve)</Tag> : <span className={kit.sub}>Thieve{thiefDone ? `: ${Object.entries(s.takenBy).filter(([, f]) => f === s.thief).map(([c]) => name(type, c)).join(", ")}` : ""}</span>}
            </li>
          ) : null}
        </ul>
      </Section>

      {!allPlayers && !started ? (
        <Section title="Who joins">
          {order.filter((id) => id !== initiator).map((id) => (
            <Switch key={id} label={short(id)} detail="Followed the secondary (1 strategy token)" checked={s.participants.includes(id)}
              onChange={(on) => w.write([on ? Events.JoinSpliceEvent(id) : Events.LeaveSpliceEvent(id)], on ? `${short(id)} joined the splice` : `${short(id)} left the splice`, id)} />
          ))}
          {type === "ABILITY" ? (
            <Switch label={`${short(initiator)} takes an extra ability`} detail="Magus: spend 3 resources and 3 influence to turn one more ability up; after everyone has chosen, it passes back for another" checked={s.extra}
              onChange={(on) => w.write([on ? Events.JoinSpliceEvent(initiator) : Events.LeaveSpliceEvent(initiator)], on ? `${short(initiator)} will take an extra ability` : `${short(initiator)} won't take an extra ability`, initiator)} />
          ) : null}
          {genomeSwitch}
          <Switch label="Engineer was played" detail="Turn 2 more cards face up" checked={s.engineer}
            onChange={(on) => w.write([on ? Events.PlayActionCardEvent("Engineer", initiator) : Events.UnplayActionCardEvent("Engineer", initiator)], on ? "Engineer: 2 more cards in the splice" : "Engineer taken back", initiator)} />
          <Switch label="Reverse was played" detail="Picks go clockwise instead" checked={s.reverse}
            onChange={(on) => w.write([on ? Events.PlayActionCardEvent("Reverse", "None") : Events.UnplayActionCardEvent("Reverse", "None")], on ? "Reverse: picks go clockwise" : "Reverse taken back", initiator)} />
        </Section>
      ) : null}

      {allPlayers && !started && genomeSwitch ? <Section title="Before the cards go up">{genomeSwitch}</Section> : null}

      <Section title="Face up" count={`${s.revealed.length} of ${s.total}`}>
        {Object.keys(s.takenBy).length ? (
          <ul className={kit.rows} style={{ listStyle: "none", margin: 0, padding: "0 12px" }} aria-label="Taken">
            {s.revealed.filter((id) => s.takenBy[id]).map((id) => (
              <li key={id} className={kit.line} style={{ minHeight: 44, gap: 8 }}><span className={kit.grow}>{byType[type][id]?.name ?? id}</span><Tag>{short(s.takenBy[id])}</Tag></li>
            ))}
          </ul>
        ) : null}
        <Rows>
          {s.revealed.filter((id) => !s.takenBy[id]).map((id) => {
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

      {!allPlayers && s.finished && s.revealed.length >= s.total && !thiefDone && thieves.length ? (
        <Section title="Thieve">
          {s.thief ? (
            <>
              <p className={kit.confirm}>{short(s.thief)} played Thieve and takes one more card.</p>
              <Button disabled={w.pending} onClick={() => w.write([Events.UnplayActionCardEvent("Thieve", s.thief as FactionId)], "Thieve taken back", s.thief)}>Take Thieve back</Button>
            </>
          ) : (
            <>
              <p className={kit.sub}>Someone who isn&apos;t in the splice can play Thieve to take one more card after everyone has picked.</p>
              <Rows>
                {thieves.map((id) => (
                  <RowAction key={id} verb="Played it" disabled={w.pending} title={short(id)}
                    onClick={() => w.write([Events.PlayActionCardEvent("Thieve", id)], `${short(id)} played Thieve`, id)} />
                ))}
              </Rows>
            </>
          )}
        </Section>
      ) : null}

      {current && current !== s.thief && s.revealed.length >= s.total && kingTechs.length ? (
        <Section title={`Or ${short(current)} takes a King technology instead`}>
          <Rows>
            {kingTechs.map((id) => (
              <RowAction key={id} verb="Take it" disabled={w.pending} title={techs[id]?.name ?? id}
                onClick={() => w.write([Events.AddTechEvent(current, id)], `${short(current)} took ${techs[id]?.name ?? id} instead of a card`, current)} />
            ))}
          </Rows>
        </Section>
      ) : null}

      {canUndo ? <Button kind="quiet" disabled={w.pending} onClick={() => w.undoNewest(groupKey(newest))}>Undo: {ctx.describe(newest)}</Button> : null}
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

// For everyone else's phone while Noctis, Calamitas or Magus is played: where
// the splice stands, and their own pick when it's their turn. The active
// player's controls (TfCardControls) have the same button.
export function SpliceStatus({ card, active, ctx }: { card: string; active: FactionId; ctx: Ctx }) {
  const type = SPLICE_CARDS[card];
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER", undefined, active);
  const [open, setOpen] = useState(false);
  if (!type || ctx.controls(active)) return null;
  const s = spliceState(currentTurn, type, active, order, false);
  const mine = !!s.current && ctx.controls(s.current);
  const me = ctx.seat;
  return (
    <section className={kit.card} aria-label="Splice">
      <p className={kit.eyebrow}><span>{cap(TYPE_NAMES[type].one)} splice</span><span className={kit.num}>{s.pickers.length} taking part</span></p>
      {me && me !== active && !s.revealed.length ? (
        <Switch label="Join the splice" detail={card === "Calamitas" ? "Calamitas' secondary: join, or use PRODUCTION in your home system" : "Following the secondary joins it"} checked={s.participants.includes(me)}
          onChange={(on) => ctx.w.write([on ? Events.JoinSpliceEvent(me) : Events.LeaveSpliceEvent(me)], on ? `${ctx.short(me)} joined the splice` : `${ctx.short(me)} left the splice`, me)} />
      ) : null}
      <p className={kit.sub}>{!s.revealed.length ? `${ctx.short(active)} turns ${s.total} cards face up.` : s.current ? `${ctx.short(s.current)} picks now.` : "Everyone has picked."}</p>
      {s.current || !s.revealed.length ? (
        <Button kind={mine ? "primary" : "secondary"} forOther={!mine} block onClick={() => setOpen(true)}>{mine ? `Pick your ${TYPE_NAMES[type].one}` : "Open the splice"}</Button>
      ) : null}
      {open ? <SpliceSheet type={type} initiator={active} ctx={ctx} close={() => setOpen(false)} /> : null}
    </section>
  );
}

// Ending the turn (or going again, or passing) while the splice has picks left
// would strand them: the sheet goes away with the turn. Call check() before
// the write; when it returns true the guard sheet (render `node`) is showing
// and the write waits for "End the turn anyway".
export function useSpliceGuard(active: Optional<FactionId>, selected: Optional<string>, ctx: Ctx) {
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER", undefined, active);
  const [ask, setAsk] = useState<{ verb: string; go: () => void }>();
  const [sure, setSure] = useState(false);
  const [splice, setSplice] = useState(false);
  const type = selected ? SPLICE_CARDS[selected] : undefined;
  const s = type && active ? spliceState(currentTurn, type, active, order, false) : undefined;
  // Not started is fine (nothing is stranded); started with picks left is not.
  const left = s && s.revealed.length > 0 ? s.left : [];
  const { short } = ctx;
  const done = () => { setAsk(undefined); setSure(false); };
  const one = type ? TYPE_NAMES[type].one : "";
  const a = /^[aeiou]/.test(one) ? "an" : "a";
  const node = type && active ? (
    <>
      {ask && !splice ? (
        <Sheet title="The splice isn't finished" close={done}>
          <p className={kit.confirm}>{left.map((id, i) => <span key={i}>{i ? " " : ""}{short(id)} still picks {a} {one}.</span>)}</p>
          {sure ? (
            <>
              <p className={kit.sub}>{left.length > 1 ? "They" : short(left[0])} won&apos;t pick, and the cards nobody took go back. Do this only if the table is dropping the splice.</p>
              <Button kind="primary" block disabled={ctx.w.pending} onClick={() => { const go = ask.go; done(); go(); }}>{ask.verb} without finishing it</Button>
              <Button block onClick={() => setSure(false)}>Keep going with the splice</Button>
            </>
          ) : (
            <>
              <Button kind="primary" size="tall" block onClick={() => setSplice(true)}>Open the splice</Button>
              <Button kind="quiet" block onClick={() => setSure(true)}>{ask.verb} anyway</Button>
            </>
          )}
        </Sheet>
      ) : null}
      {splice ? <SpliceSheet type={type} initiator={active} ctx={ctx} close={() => { setSplice(false); done(); }} /> : null}
    </>
  ) : null;
  // verb: what the button does ("End the turn", "Go again", "Pass").
  const check = (verb: string, go: () => void) => {
    if (!left.length) return false;
    setAsk({ verb, go });
    return true;
  };
  return { check, node, left };
}
