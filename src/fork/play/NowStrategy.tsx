"use client";
// Now, strategy phase.
import { useAbilities, useAgenda, useStrategyCards } from "../../context/dataHooks";
import { useFactionHasTech } from "../../context/factionDataHooks";
import { useActiveFactionId, useOrderedFactionIds } from "../../context/gameDataHooks";
import { Events } from "../../util/api/events";
import { sortStrategyCards } from "../../util/strategyCards";
import styles from "./play.module.scss";
import { HelpBanner, type Ctx } from "./ui";
import { Button, CardTag, Chip, cx, kit, pcolor, RowLink, Rows, Tag } from "../ui/kit";

// Abilities that change cards after everyone has picked. The frame leaves them to
// upstream's table screen (main/phase/strategy/StrategyPhase.tsx).
function useEndOfStrategyAbilities(factions: Ctx["factions"]) {
  const arbiter = useAgenda("Imperial Arbiter");
  const abilities = useAbilities();
  const hacan = useFactionHasTech("Emirates of Hacan", "Quantum Datahub Node");
  const nekro = useFactionHasTech("Nekro Virus", "Quantum Datahub Node");
  const out: string[] = [];
  if (factions["Naalu Collective"]) out.push("Gift of Prescience");
  if (hacan || nekro || abilities["Quantum Datahub Node"]?.owner) out.push("Quantum Datahub Node");
  if (arbiter?.resolved && arbiter.target) out.push("Imperial Arbiter");
  return out;
}

export default function NowStrategy(ctx: Ctx) {
  const { factions, short, seat, helping, setHelping, w, open, gameId } = ctx;
  const active = useActiveFactionId();
  const order = useOrderedFactionIds("SPEAKER");
  const strategyCards = useStrategyCards();
  const endAbilities = useEndOfStrategyAbilities(factions);
  const cards = sortStrategyCards(Object.values(strategyCards).filter((c): c is StrategyCard => !!c), true);
  const picks = (id: FactionId) => cards.filter((c) => c.faction === id);
  const mine = ctx.controls(active);

  return (
    <>
      {active && mine ? (
        <section className={kit.card} aria-label="Pick a card">
          {helping && helping !== seat ? <HelpBanner who={active} short={short} stop={() => setHelping(undefined)} /> : null}
          <p className={kit.eyebrow}><span>{active === seat ? "Your pick" : `${short(active)}'s pick`}</span></p>
          {active !== seat && !helping ? <div className={kit.line}><Chip faction={active} factions={factions} short={short} large /></div> : null}
          <Rows>
            {cards.map((c) => (
              <RowLink key={c.id} disabled={!!c.faction || !!c.invalid} onClick={() => open({ kind: "card", card: c.id, pickFor: active })}
                label={`${c.name}${c.faction ? `, ${short(c.faction)}'s` : ""}`}
                title={<CardTag card={c} used={!!c.faction || !!c.invalid} still />}
                detail={c.faction ? `${short(c.faction)} has it` : c.tradeGoods ? `${c.tradeGoods} trade good${c.tradeGoods > 1 ? "s" : ""} on it` : undefined} />
            ))}
          </Rows>
        </section>
      ) : null}

      <section className={cx(kit.card, styles.hero)} style={active ? { ["--c" as string]: pcolor(factions[active]?.color) } : undefined} aria-label="Pick order">
        <p className={kit.eyebrow}><span>Pick order</span><span className={kit.num}>{order.filter((id) => picks(id).length).length} of {order.length}</span></p>
        <ul className={styles.list}>
          {order.map((id, i) => (
            <li key={id}>
              <span className={kit.num} style={{ color: "var(--faint)" }}>{i + 1}</span>
              <Chip faction={id} factions={factions} short={short} small />
              <span className={kit.grow} />
              {picks(id).map((c) => <CardTag key={c.id} card={c} />)}
              {id === active ? <Tag tone="now">Picking</Tag> : !picks(id).length ? <span className={kit.sub}>Waiting</span> : null}
            </li>
          ))}
        </ul>
        {active && !mine ? <Button forOther block onClick={() => setHelping(active)}>Pick for {short(active)}</Button> : null}
      </section>

      {!active ? (
        <section className={kit.card} aria-label="Everyone has picked">
          <p className={kit.eyebrow}><span>Strategy phase</span></p>
          <h2 className={kit.title}>Everyone has picked</h2>
          {endAbilities.length ? (
            <>
              <p className={kit.sub}>{endAbilities.join(", ")} can still change cards before the action phase. {endAbilities.length > 1 ? "They're" : "It's"} on the table screen.</p>
              <Rows><RowLink href={`/game/${gameId}/main`} external title="Open the table screen" /></Rows>
            </>
          ) : null}
          <Button kind="primary" size="tall" block disabled={w.pending}
            onClick={() => w.write([Events.AdvancePhaseEvent()], "The action phase started")}>Start the action phase</Button>
        </section>
      ) : null}
    </>
  );
}
