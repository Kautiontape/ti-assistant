"use client";
// The strategy phase's extras, from upstream's StrategyPhase.tsx: reminders at
// the start of the phase, and the swaps once everyone has picked (Naalu's Gift
// of Prescience, Quantum Datahub Node, Imperial Arbiter). Swaps hand cards between
// players, so each asks to confirm in a sentence.
import { useState } from "react";
import { useAbilities, useAgenda, useStrategyCards } from "../../context/dataHooks";
import { useFactionHasTech } from "../../context/factionDataHooks";
import { useRound } from "../../context/stateDataHooks";
import { Events } from "../../util/api/events";
import { sortStrategyCards } from "../../util/strategyCards";
import { Optional } from "../../util/types/types";
import type { Ctx } from "./ui";
import { Button, CardTag, Chip, Choices, kit, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

export type StrategySwap = { by: FactionId; arbiter?: boolean };

// Laws and abilities that apply at the start of this strategy phase.
export function StartOfStrategy({ ctx }: { ctx: Ctx }) {
  const { factions, short } = ctx;
  const round = useRound();
  const aiRevolution = useAgenda("Anti-Intellectual Revolution");
  const armsReduction = useAgenda("Arms Reduction");
  const newConstitution = useAgenda("New Constitution");
  const items: { who?: FactionId; name: string; text: string }[] = [];
  const thisRound = (a: Optional<Agenda>, target: string) => !!a?.resolved && a.target === target && a.activeRound === round;
  if (thisRound(aiRevolution, "Against")) items.push({ name: `${aiRevolution!.name} (against)`, text: aiRevolution!.failedText ?? aiRevolution!.description });
  if (thisRound(armsReduction, "Against")) items.push({ name: `${armsReduction!.name} (against)`, text: armsReduction!.failedText ?? armsReduction!.description });
  if (thisRound(newConstitution, "For")) items.push({ name: `${newConstitution!.name} (for)`, text: newConstitution!.passedText ?? newConstitution!.description });
  if (factions["Council Keleres"]) items.push({ who: "Council Keleres", name: "Council Patronage", text: "Replenish commodities, then gain 1 trade good." });
  if (!items.length) return null;
  return (
    <section className={kit.card} aria-label="Start of the strategy phase">
      <p className={kit.eyebrow}><span>At the start of the phase</span></p>
      <ul className={kit.sub} style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
        {items.map((i) => <li key={i.name}><b>{i.who ? `${short(i.who)}: ` : "Everyone: "}{i.name}.</b> {i.text}</li>)}
      </ul>
    </section>
  );
}

function useSwappers() {
  const abilities = useAbilities();
  const arbiter = useAgenda("Imperial Arbiter");
  const hacan = useFactionHasTech("Emirates of Hacan", "Quantum Datahub Node");
  const nekro = useFactionHasTech("Nekro Virus", "Quantum Datahub Node");
  const quantum = new Set<FactionId>();
  if (hacan) quantum.add("Emirates of Hacan");
  if (nekro) quantum.add("Nekro Virus");
  const owner = abilities["Quantum Datahub Node"]?.owner as Optional<FactionId>;
  if (owner) quantum.add(owner);
  const arbiterHolder = arbiter?.resolved && arbiter.passed && arbiter.target ? (arbiter.target as FactionId) : undefined;
  return { quantum: [...quantum], arbiterHolder };
}

// Rows for the "Everyone has picked" card. Upstream offers these until the
// action phase starts.
export function EndOfStrategyRows({ ctx }: { ctx: Ctx }) {
  const { factions, short, open } = ctx;
  const strategyCards = useStrategyCards();
  const { quantum, arbiterHolder } = useSwappers();
  const gift = Object.values(strategyCards).find((c) => c?.order === 0 && c.faction && c.faction !== "Naalu Collective")?.faction;
  const naalu = !!factions["Naalu Collective"];
  if (!naalu && !quantum.length && !arbiterHolder) return null;
  return (
    <Rows>
      {naalu ? <RowLink onClick={() => open({ kind: "gift" })} title="Gift of Prescience (Naalu)" detail={gift ? `${short(gift)} has Naalu's 0 token` : "Give Naalu's 0 token to another player"} /> : null}
      {quantum.map((id) => <RowLink key={id} onClick={() => open({ kind: "strategySwap", by: id })} title={`Quantum Datahub Node (${short(id)})`} detail="Swap one of their cards for another player's" />)}
      {arbiterHolder ? <RowLink onClick={() => open({ kind: "strategySwap", by: arbiterHolder, arbiter: true })} title={`Imperial Arbiter (${short(arbiterHolder)})`} detail="Swap a card with another player, then discard the law" /> : null}
    </Rows>
  );
}

export function GiftSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const strategyCards = useStrategyCards();
  const current = Object.values(strategyCards).find((c) => c?.order === 0 && c.faction && c.faction !== "Naalu Collective")?.faction;
  const [to, setTo] = useState<Optional<FactionId>>(current);
  const others = Object.values(factions).filter((f): f is Faction => !!f && f.id !== "Naalu Collective").sort((a, b) => a.order - b.order).map((f) => f.id);
  return (
    <KitSheet title="Gift of Prescience" close={close}>
      <p className={kit.sub}>Naalu gives its 0 token to another player, who goes first this round instead.</p>
      <Choices label="Who gets the 0 token?" value={to} onChange={(v) => setTo(v as FactionId)}
        options={others.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> }))} />
      {to && to !== current ? (
        <>
          <p className={kit.confirm}>Naalu gives the 0 token to {short(to)}{current ? ` instead of ${short(current)}` : ""}?</p>
          <Button kind="primary" block disabled={w.pending} onClick={async () => {
            if (await w.write([Events.GiftOfPrescienceEvent(to)], `Naalu gave the 0 token to ${short(to)}`, "Naalu Collective")) close();
          }}>Confirm</Button>
        </>
      ) : null}
      {current ? (
        <Button block disabled={w.pending} onClick={async () => {
          if (await w.write([Events.GiftOfPrescienceEvent("Naalu Collective")], "Naalu kept the 0 token", "Naalu Collective")) close();
        }}>Naalu keeps it</Button>
      ) : null}
    </KitSheet>
  );
}

export function SwapSheet({ by, arbiter, close, ctx }: StrategySwap & { close: () => void; ctx: Ctx }) {
  const { short, w } = ctx;
  const strategyCards = useStrategyCards();
  const cards = sortStrategyCards(Object.values(strategyCards).filter((c): c is StrategyCard => !!c), true);
  const mine = cards.filter((c) => c.faction === by);
  const theirs = cards.filter((c) => c.faction && c.faction !== by);
  const [give, setGive] = useState<Optional<StrategyCardId>>(mine.length === 1 ? mine[0]!.id : undefined);
  const [take, setTake] = useState<Optional<StrategyCardId>>();
  const name = arbiter ? "Imperial Arbiter" : "Quantum Datahub Node";
  const g = give ? strategyCards[give] : undefined;
  const t = take ? strategyCards[take] : undefined;
  return (
    <KitSheet title={`${name} (${short(by)})`} close={close}>
      {arbiter ? <p className={kit.sub}>{short(by)} discards Imperial Arbiter to swap one of their strategy cards with another player's.</p>
        : <p className={kit.sub}>{short(by)} spends a strategy token and 3 trade goods to swap one of their strategy cards with another player's.</p>}
      <Choices label={`${short(by)} gives`} value={give} onChange={(v) => setGive(v as StrategyCardId)}
        options={mine.map((c) => ({ value: c.id as string, label: <CardTag card={c} still />, name: c.name }))} />
      <Choices label="For" value={take} onChange={(v) => setTake(v as StrategyCardId)}
        options={theirs.map((c) => ({ value: c.id as string, label: <><CardTag card={c} still /> {short(c.faction)}'s</>, name: `${c.name}, ${short(c.faction)}'s` }))} />
      {g && t ? (
        <>
          <p className={kit.confirm}>{short(by)} gives {g.name} to {short(t.faction)} and takes {t.name}?</p>
          <Button kind="primary" block disabled={w.pending} onClick={async () => {
            if (await w.write([Events.SwapStrategyCardsEvent(g.id, t.id, arbiter)], `${short(by)} swapped ${g.name} for ${short(t.faction)}'s ${t.name} (${name})`, by)) close();
          }}>Confirm</Button>
        </>
      ) : null}
    </KitSheet>
  );
}
