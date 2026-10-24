"use client";
// Now, strategy phase.
import { useStrategyCards } from "../../context/dataHooks";
import { useActiveFactionId, useOrderedFactionIds } from "../../context/gameDataHooks";
import { Events } from "../../util/api/events";
import { sortStrategyCards } from "../../util/strategyCards";
import styles from "./play.module.scss";
import { EndOfStrategyRows, StartOfStrategy } from "./StrategyAbilities";
import { HelpBanner, type Ctx } from "./ui";
import { Button, CardTag, Chip, cx, kit, pcolor, RowLink, Rows, Tag } from "../ui/kit";

export default function NowStrategy(ctx: Ctx) {
  const { factions, short, seat, helping, setHelping, w, open } = ctx;
  const active = useActiveFactionId();
  const order = useOrderedFactionIds("SPEAKER");
  const strategyCards = useStrategyCards();
  const cards = sortStrategyCards(Object.values(strategyCards).filter((c): c is StrategyCard => !!c), true);
  const picks = (id: FactionId) => cards.filter((c) => c.faction === id);
  const mine = ctx.controls(active);

  return (
    <>
      <StartOfStrategy ctx={ctx} />
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
          <EndOfStrategyRows ctx={ctx} />
          <Button kind="primary" size="tall" block disabled={w.pending}
            onClick={() => w.write([Events.AdvancePhaseEvent()], "The action phase started")}>Start the action phase</Button>
        </section>
      ) : null}
    </>
  );
}
