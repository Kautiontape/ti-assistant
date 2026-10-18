"use client";
// Now, strategy phase.
import Link from "next/link";
import { useAbilities, useAgenda, useStrategyCards } from "../../context/dataHooks";
import { useFactionHasTech } from "../../context/factionDataHooks";
import { useActiveFactionId, useOrderedFactionIds } from "../../context/gameDataHooks";
import { Events } from "../../util/api/events";
import { sortStrategyCards } from "../../util/strategyCards";
import styles from "./play.module.scss";
import { cx, pcolor, Chip, HelpBanner, type Ctx } from "./ui";

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
  const mine = !!active && (active === seat || active === helping);

  return (
    <>
      {active && mine ? (
        <section className={styles.card} aria-label="Pick a card">
          {helping && helping !== seat ? <HelpBanner who={active} short={short} stop={() => setHelping(undefined)} /> : null}
          <p className={styles.eyebrow}><span>{active === seat ? "Your pick" : `${short(active)}'s pick`}</span></p>
          <div>
            {cards.map((c) => (
              <button key={c.id} className={styles.opt} disabled={!!c.faction || !!c.invalid} onClick={() => open({ kind: "card", card: c.id, pickFor: active })}>
                <span className={styles.num} style={{ color: "var(--faint)", minWidth: "1.5ch" }}>{c.order}</span>
                <b>{c.name}</b>{c.faction ? <span className={styles.sub}>{short(c.faction)}</span> : null}
                <span className={styles.meta}>{c.tradeGoods ? `${c.tradeGoods} trade good${c.tradeGoods > 1 ? "s" : ""}` : ""}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className={cx(styles.card, styles.hero)} style={active ? { ["--c" as string]: pcolor(factions[active]?.color) } : undefined} aria-label="Pick order">
        <p className={styles.eyebrow}><span>Pick order</span><span className={styles.num}>{order.filter((id) => picks(id).length).length} of {order.length}</span></p>
        <ul className={styles.list}>
          {order.map((id, i) => (
            <li key={id} className={styles.row}>
              <span className={styles.num} style={{ color: "var(--faint)" }}>{i + 1}</span>
              <Chip faction={id} factions={factions} short={short} small />
              <span className={styles.grow} />
              {picks(id).map((c) => <span key={c.id} className={styles.pill}>{c.name}</span>)}
              {id === active ? <span className={cx(styles.pill, styles.pillNow)}>Picking</span> : !picks(id).length ? <span className={styles.sub}>Waiting</span> : null}
            </li>
          ))}
        </ul>
        {active && !mine ? <button className={cx(styles.btn, styles.help, styles.block)} onClick={() => setHelping(active)}>Pick for {short(active)}</button> : null}
      </section>

      {!active ? (
        <section className={styles.card} aria-label="Everyone has picked">
          <p className={styles.eyebrow}><span>Strategy phase</span></p>
          <h2 className={styles.title}>Everyone has picked</h2>
          {endAbilities.length ? (
            <p className={styles.sub}>
              {endAbilities.join(", ")} can still change cards before the action phase. {endAbilities.length > 1 ? "They're" : "It's"} on the table screen.{" "}
              <Link href={`/game/${gameId}/main`} className={styles.textLink}>Open the table screen</Link>
            </p>
          ) : null}
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
            onClick={() => w.write([Events.AdvancePhaseEvent()], "The action phase started")}>Start the action phase</button>
        </section>
      ) : null}
    </>
  );
}
