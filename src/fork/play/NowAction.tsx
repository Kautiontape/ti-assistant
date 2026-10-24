"use client";
// Now, action phase.
import { useActionLog, useCurrentTurn, useOptions, usePlanets, useStrategyCards } from "../../context/dataHooks";
import { usePassedFactionIds } from "../../context/factionDataHooks";
import { useActiveFactionId, useOnDeckFactionId } from "../../context/gameDataHooks";
import { getClaimedPlanets } from "../../util/actionLog";
import { getSelectedActionFromLog } from "../../util/api/data";
import { Events } from "../../util/api/events";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { fmtDuration, openCombat, sentence, turnStartedAt } from "./logic";
import { CardControls, CARDS_WITH_CONTROLS, SecondariesCard } from "./NowCards";
import { StartCombatButton } from "./Combat";
import { ComponentControls } from "./NowComponent";
import { ExpeditionButton } from "./NowExpedition";
import { FrontierRow } from "./Frontier";
import { BaalRow, SingularityRow } from "./TacticalExtras";
import { OtherEndings, UnpassButton, useEndTurnBlock } from "./TurnControls";
import styles from "./play.module.scss";
import { useNow, HelpBanner, type Ctx } from "./ui";
import { Button, CardTag, Chip, cx, kit, pcolor, RowLink, Rows, Swatch } from "../ui/kit";
import { followEvents } from "../tfplay/tf";
import { SpliceStatus } from "../tfplay/NowSplice";

export default function NowAction(ctx: Ctx) {
  const { factions, short, seat, helping, setHelping, w, open } = ctx;
  const active = useActiveFactionId();
  const onDeck = useOnDeckFactionId();
  const passed = usePassedFactionIds();
  const currentTurn = useCurrentTurn();
  const strategyCards = useStrategyCards();
  const log = useActionLog();
  const now = useNow();
  const combat = openCombat(log);
  const planets = usePlanets();
  const te = useOptions().expansions.includes("THUNDERS EDGE");
  // Hooks stay above the early return below.
  const endBlock = useEndTurnBlock(getSelectedActionFromLog(currentTurn));
  if (!active) {
    return (
      <section className={kit.card} aria-label="Everyone has passed">
        <p className={kit.eyebrow}><span>Action phase</span></p>
        <h2 className={kit.title}>Everyone has passed</h2>
        <p className={kit.sub}>The status phase is next: scoring, then cleanup.</p>
        <Button kind="primary" size="tall" block disabled={w.pending}
          onClick={() => (combat ? open({ kind: "endCombat", before: "the status phase starts" }) : w.write([Events.AdvancePhaseEvent()], "The status phase started"))}>Start the status phase</Button>
        <UnpassButton ctx={ctx} />
      </section>
    );
  }

  const f = factions[active];
  const mine = ctx.controls(active);
  const selected = getSelectedActionFromLog(currentTurn);
  const cards = getStrategyCardsForFaction(strategyCards, active);
  const canPass = !passed.includes(active) && cards.every((c) => c.used);
  const isCard = selected && strategyCards[selected as StrategyCardId];
  // Thunder's Edge's Warfare primary is a tactical action of its own (StrategicActions/Warfare.tsx).
  const tactical = selected === "Tactical" || (selected === "Warfare" && te);
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
  const whose = active === seat ? "Your turn" : `${short(active)}'s turn`;

  return (
    <>
      {mine ? (
        <section className={cx(kit.card, styles.hero)} style={{ ["--c" as string]: pcolor(f?.color) }} aria-label="Your turn">
          {helping && helping !== seat ? <HelpBanner who={active} short={short} stop={() => setHelping(undefined)} /> : null}
          <p className={kit.eyebrow}><span>{whose}</span><span className={kit.num}>{started && now ? fmtDuration(now - started) : ""}</span></p>
          {active !== seat && !helping ? <div className={kit.line}><Chip faction={active} factions={factions} short={short} large /></div> : null}
          {!selected ? (
            <>
              <h2 className={kit.title}>Choose an action</h2>
              <div className={cx(kit.buttons, kit.big)}>
                <Button kind="primary" disabled={w.pending} detail="Activate a system" onClick={() => select("Tactical", `${short(active)} took a tactical action`)}>Tactical</Button>
                <Button disabled={w.pending} detail="Ability, tech, relic, card" onClick={() => select("Component", `${short(active)} took a component action`)}>Component</Button>
                {cards.filter((c) => !c.used).map((c) => (
                  <Button key={c.id} disabled={w.pending} aria-label={`${c.name}: play the primary`} detail="Play the primary" onClick={() => select(c.id, `${short(active)} played ${c.name}`)}>
                    <CardTag card={c} still />
                  </Button>
                ))}
                <Button disabled={!canPass || w.pending} detail={canPass ? "Done for the round" : "Play your card first"} onClick={() => open({ kind: "pass", faction: active })}>Pass</Button>
              </div>
              <Button kind="quiet" disabled={w.pending} onClick={() => open({ kind: "skip", faction: active })}>Skip this turn</Button>
            </>
          ) : (
            <>
              <h2 className={kit.title}>{actionName}</h2>
              {steps.length ? <ul className={styles.list}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : CARDS_WITH_CONTROLS.has(selected) || selected === "Component" ? null : <p className={kit.sub}>Nothing recorded yet. Record what happens on the board, or just end the turn.</p>}
              {isCard ? <p className={kit.sub}>{(isCard as StrategyCard).primary}</p> : null}
              {isCard ? <CardControls card={selected as StrategyCardId} active={active} ctx={ctx} /> : null}
              {selected === "Component" ? <ComponentControls active={active} ctx={ctx} /> : null}
              <Rows label="Record">
                {tactical && ctx.tracks("PLANETS") ? <RowLink onClick={() => open({ kind: "claim", faction: active })} title="Take a planet" detail="Took control of one this turn" /> : null}
                {selected === "Tactical" ? <AttachButton active={active} currentTurn={currentTurn} planets={planets} ctx={ctx} /> : null}
                {selected === "Tactical" ? <StartCombatButton attacker={active} ctx={ctx} /> : null}
                {tactical ? <FrontierRow active={active} ctx={ctx} /> : null}
                {selected === "Tactical" ? <SingularityRow active={active} ctx={ctx} /> : null}
                {selected === "Tactical" ? <BaalRow active={active} ctx={ctx} /> : null}
                {tactical && ctx.tracks("OBJECTIVES") ? <RowLink onClick={() => open({ kind: "score", faction: active, which: "secret", phase: "ACTION" })} title="Scored a secret?" detail="Action-phase secrets, up to 4 a turn" /> : null}
                <ExpeditionButton active={active} ctx={ctx} />
                <RowLink href={factionPage} external title="More controls" detail="Upstream's full page" />
              </Rows>
              {endBlock ? <p className={kit.sub}>{endBlock}</p> : null}
              <Button kind="primary" size="tall" block disabled={w.pending || !!endBlock}
                onClick={async () => {
                  if (combat) { open({ kind: "endCombat", before: "the turn ends" }); return; }
                  await w.write([Events.EndTurnEvent({})], `${short(active)} ended their turn`, active);
                }}>End turn</Button>
              <OtherEndings active={active} selected={selected} ctx={ctx} />
            </>
          )}
        </section>
      ) : (
        <section className={cx(kit.card, styles.hero)} style={{ ["--c" as string]: pcolor(f?.color) }} aria-label="Now playing">
          <p className={kit.eyebrow}><span>Now playing</span><span className={kit.num}>{started && now ? fmtDuration(now - started) : ""}</span></p>
          <div className={kit.line}><Chip faction={active} factions={factions} short={short} large /></div>
          <p className={kit.title} style={{ fontWeight: 400 }}>{actionName ?? "Choosing an action"}{steps.length ? ":" : ""}</p>
          {steps.length ? <ul className={styles.list}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}
          <div className={kit.line} style={{ flexWrap: "wrap", gap: "8px 14px" }}>
            {onDeck && onDeck !== active ? <span className={kit.line} style={{ gap: 6 }}><span className={kit.sub}>Next</span><Chip faction={onDeck} factions={factions} short={short} small /></span> : null}
            {passed.length ? <span className={kit.line} style={{ gap: 4 }}><span className={kit.sub}>Passed</span>{passed.map((id) => <Swatch key={id} faction={id} color={factions[id]?.color} small />)}</span> : null}
          </div>
          <Button forOther block onClick={() => setHelping(active)}>Do it for {short(active)}</Button>
        </section>
      )}
      {myPrompt ? (
        <section className={kit.card} aria-label="Secondary">
          <p className={kit.eyebrow}><span>{(isCard as StrategyCard).name} was played</span></p>
          <h2 className={kit.title}>Follow the secondary?</h2>
          <p className={kit.sub}>{(isCard as StrategyCard).secondary}</p>
          <div className={kit.buttons}>
            <Button kind="primary" disabled={w.pending} onClick={() => selected === "Technology" && ctx.tracks("TECHS")
              ? open({ kind: "research", faction: seat!, follow: true })
              : w.write(followEvents(selected, seat!), `${short(seat)} followed the secondary`)}>{selected === "Technology" && ctx.tracks("TECHS") ? "Follow and research" : "Follow"}</Button>
            <Button disabled={w.pending} onClick={() => w.write([Events.MarkSecondaryEvent(seat!, "SKIPPED")], `${short(seat)} skipped the secondary`)}>Skip</Button>
          </div>
        </section>
      ) : null}
      {isCard ? <SpliceStatus card={selected} active={active} ctx={ctx} /> : null}
      {isCard ? <SecondariesCard card={isCard as StrategyCard} active={active} ctx={ctx} /> : null}
    </>
  );
}

// Exploring a planet taken this turn often gives an attachment. Planets taken
// in one turn share a system, so this opens that system's sheet.
function AttachButton({ active, currentTurn, planets, ctx }: { active: FactionId; currentTurn: ReturnType<typeof useCurrentTurn>; planets: ReturnType<typeof usePlanets>; ctx: Ctx }) {
  const taken = getClaimedPlanets(currentTurn, active).map((c) => planets[c.planet]).filter((p): p is Planet => !!p);
  const last = taken.at(-1);
  if (!last || last.system === undefined) return null;
  return <RowLink onClick={() => ctx.open({ kind: "system", system: String(last.system) })} title="Explored? Add an attachment" detail={taken.map((p) => p.name).join(", ")} />;
}
