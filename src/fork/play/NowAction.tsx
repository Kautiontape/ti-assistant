"use client";
// Now, action phase.
import Link from "next/link";
import { useActionLog, useCurrentTurn, useStrategyCards } from "../../context/dataHooks";
import { usePassedFactionIds } from "../../context/factionDataHooks";
import { useActiveFactionId, useOnDeckFactionId } from "../../context/gameDataHooks";
import { getSelectedActionFromLog } from "../../util/api/data";
import { Events } from "../../util/api/events";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { fmtDuration, sentence, turnStartedAt } from "./logic";
import { CardControls, CARDS_WITH_CONTROLS, SecondariesCard } from "./NowCards";
import { StartCombatButton } from "./Combat";
import { ComponentControls } from "./NowComponent";
import styles from "./play.module.scss";
import { cx, pcolor, useNow, Swatch, Chip, HelpBanner, type Ctx } from "./ui";

export default function NowAction(ctx: Ctx) {
  const { factions, short, seat, helping, setHelping, w, open } = ctx;
  const active = useActiveFactionId();
  const onDeck = useOnDeckFactionId();
  const passed = usePassedFactionIds();
  const currentTurn = useCurrentTurn();
  const strategyCards = useStrategyCards();
  const log = useActionLog();
  const now = useNow();
  if (!active) {
    return (
      <section className={styles.card} aria-label="Everyone has passed">
        <p className={styles.eyebrow}><span>Action phase</span></p>
        <h2 className={styles.title}>Everyone has passed</h2>
        <p className={styles.sub}>The status phase is next: scoring, then cleanup.</p>
        <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
          onClick={() => w.write([Events.AdvancePhaseEvent()], "The status phase started")}>Start the status phase</button>
      </section>
    );
  }

  const f = factions[active];
  const mine = active === seat || active === helping;
  const selected = getSelectedActionFromLog(currentTurn);
  const cards = getStrategyCardsForFaction(strategyCards, active);
  const canPass = !passed.includes(active) && cards.every((c) => c.used);
  const isCard = selected && strategyCards[selected as StrategyCardId];
  const started = turnStartedAt(log);
  const steps = [...currentTurn].reverse()
    .filter((e) => e.data.action !== "SELECT_ACTION" && !(mine && e.data.action === "PLAY_COMPONENT"))
    .map((e) => sentence(e, short, ctx.isFaction)).filter((s): s is string => !!s);
  const select = (action: Action, label: string) => w.write([Events.SelectActionEvent(action)], label, active);
  const actionName = selected === "Tactical" ? "Tactical action" : selected === "Component" ? "Component action" : selected ? `${selected}: primary` : null;
  const factionPage = `/game/${ctx.gameId}/${encodeURIComponent(active)}`;

  const myPrompt = isCard && seat && seat !== active
    && !currentTurn.some((e) => e.data.action === "MARK_SECONDARY" && (e.data.event as { faction?: string }).faction === seat)
    && (factions[seat]?.secondary ?? "PENDING") === "PENDING";

  return (
    <>
      {mine ? (
        <section className={cx(styles.card, styles.hero)} style={{ ["--c" as string]: pcolor(f?.color) }} aria-label="Your turn">
          {helping && helping !== seat ? <HelpBanner who={active} short={short} stop={() => setHelping(undefined)} /> : null}
          <p className={styles.eyebrow}><span>{active === seat ? "Your turn" : `${short(active)}'s turn`}</span><span className={styles.num}>{started && now ? fmtDuration(now - started) : ""}</span></p>
          {!selected ? (
            <>
              <h2 className={styles.title}>Choose an action</h2>
              <div className={styles.choices}>
                <button className={cx(styles.btn, styles.primary)} disabled={w.pending} onClick={() => select("Tactical", `${short(active)} took a tactical action`)}>Tactical<small>Activate a system</small></button>
                <button className={styles.btn} disabled={w.pending} onClick={() => select("Component", `${short(active)} took a component action`)}>Component<small>Ability, tech, relic, card</small></button>
                {cards.filter((c) => !c.used).map((c) => (
                  <button key={c.id} className={styles.btn} disabled={w.pending} onClick={() => select(c.id, `${short(active)} played ${c.name}`)}>{c.name}<small>Your strategy card</small></button>
                ))}
                <button className={styles.btn} disabled={!canPass || w.pending} onClick={() => open({ kind: "pass", faction: active })}>Pass<small>{canPass ? "Done for the round" : "Play your card first"}</small></button>
              </div>
            </>
          ) : (
            <>
              <h2 className={styles.title}>{actionName}</h2>
              {steps.length ? <ul className={styles.list}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : CARDS_WITH_CONTROLS.has(selected) || selected === "Component" ? null : <p className={styles.sub}>Nothing recorded yet. Record what happens on the board, or just end the turn.</p>}
              {isCard ? <p className={styles.sub}>{(isCard as StrategyCard).primary}</p> : null}
              {isCard ? <CardControls card={selected as StrategyCardId} active={active} ctx={ctx} /> : null}
              {selected === "Component" ? <ComponentControls active={active} ctx={ctx} /> : null}
              <div className={styles.grid2}>
                {selected === "Tactical" ? <button className={styles.btn} onClick={() => open({ kind: "claim", faction: active })}>Take a planet</button> : null}
                <Link className={styles.btn} href={factionPage}>More controls<small>Upstream's full page</small></Link>
              </div>
              {selected === "Tactical" ? <StartCombatButton attacker={active} ctx={ctx} /> : null}
              <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
                onClick={async () => { if (await w.write([Events.EndTurnEvent({})], `${short(active)} ended their turn`, active)) setHelping(undefined); }}>End turn</button>
            </>
          )}
        </section>
      ) : (
        <section className={cx(styles.card, styles.hero)} style={{ ["--c" as string]: pcolor(f?.color) }} aria-label="Now playing">
          <p className={styles.eyebrow}><span>Now playing</span><span className={styles.num}>{started && now ? fmtDuration(now - started) : ""}</span></p>
          <div className={styles.row}><Chip faction={active} factions={factions} short={short} large /></div>
          <p className={styles.title} style={{ fontWeight: 400 }}>{actionName ?? "Choosing an action"}{steps.length ? ":" : ""}</p>
          {steps.length ? <ul className={styles.list}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}
          <div className={styles.row} style={{ flexWrap: "wrap", gap: "8px 14px" }}>
            {onDeck ? <span className={styles.row} style={{ gap: 6 }}><span className={styles.sub}>Next</span><Chip faction={onDeck} factions={factions} short={short} small /></span> : null}
            {passed.length ? <span className={styles.row} style={{ gap: 4 }}><span className={styles.sub}>Passed</span>{passed.map((id) => <Swatch key={id} faction={id} color={factions[id]?.color} small />)}</span> : null}
          </div>
          <button className={cx(styles.btn, styles.help, styles.block)} onClick={() => setHelping(active)}>Do it for {short(active)}</button>
        </section>
      )}
      {myPrompt ? (
        <section className={styles.card} aria-label="Secondary">
          <p className={styles.eyebrow}><span>{(isCard as StrategyCard).name} was played</span></p>
          <h2 className={styles.title}>Follow the secondary?</h2>
          <p className={styles.sub}>{(isCard as StrategyCard).secondary}</p>
          <div className={styles.grid2}>
            <button className={cx(styles.btn, styles.primary)} disabled={w.pending} onClick={() => selected === "Technology"
              ? open({ kind: "research", faction: seat!, follow: true })
              : w.write([Events.MarkSecondaryEvent(seat!, "DONE")], `${short(seat)} followed the secondary`)}>{selected === "Technology" ? "Follow and research" : "Follow"}</button>
            <button className={styles.btn} disabled={w.pending} onClick={() => w.write([Events.MarkSecondaryEvent(seat!, "SKIPPED")], `${short(seat)} skipped the secondary`)}>Skip</button>
          </div>
        </section>
      ) : null}
      {isCard ? <SecondariesCard card={isCard as StrategyCard} active={active} ctx={ctx} /> : null}
    </>
  );
}
