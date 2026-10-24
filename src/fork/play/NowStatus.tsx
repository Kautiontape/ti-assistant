"use client";
// Now, status phase. Scoring, Support for the Throne and the objective reveal are
// tracked; the rest of the phase happens on the board. Rules follow upstream's
// main/phase/status/StatusPhase.tsx (see logic.ts).
import { useState } from "react";
import { useCurrentTurn, useOptions, usePlanets, useStrategyCards } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useAgendaUnlocked, useRound, useSpeaker } from "../../context/stateDataHooks";
import { Events } from "../../util/api/events";
import { sortStrategyCards } from "../../util/strategyCards";
import { Optional } from "../../util/types/types";
import {
  missingHomePlanets, revealableObjectives, revealStage, scorablePublics, scorableSecrets,
  scoredThisPhase, SFTT, throneHolder,
} from "./logic";
import styles from "./play.module.scss";
import { StatusAbilities } from "./StatusAbilities";
import { HelpBanner, type Ctx, type Sheet } from "./ui";
import { Button, Chip, Choices, cx, kit, pcolor, RowAction, RowLink, Rows, Sheet as KitSheet, Tag } from "../ui/kit";
import { TfStatusFinish } from "../tfplay/TfTable";

// Scoring goes in initiative order: by strategy card, then anyone without one.
function useScoringOrder() {
  const strategyCards = useStrategyCards();
  const speakerOrder = useOrderedFactionIds("SPEAKER");
  const byCard = sortStrategyCards(Object.values(strategyCards).filter((c): c is StrategyCard => !!c?.faction))
    .map((c) => c.faction!)
    .filter((id, i, all) => all.indexOf(id) === i);
  return [...byCard, ...speakerOrder.filter((id) => !byCard.includes(id))];
}

function revealedThisPhase(currentTurn: ReturnType<typeof useCurrentTurn>) {
  return currentTurn
    .filter((e) => e.data.action === "REVEAL_OBJECTIVE")
    .map((e) => (e.data as unknown as { event: { objective: ObjectiveId } }).event.objective);
}

export default function NowStatus(ctx: Ctx) {
  const { factions, short, seat, helping, setHelping, w, open, gameId } = ctx;
  const objectives = useObjectives();
  const currentTurn = useCurrentTurn();
  const round = useRound();
  const speaker = useSpeaker();
  const agendaUnlocked = useAgendaUnlocked();
  const options = useOptions();
  const order = useScoringOrder();
  const who = helping ?? seat;
  const revealed = revealedThisPhase(currentTurn);
  const hideObjectives = !!options.hide?.includes("OBJECTIVES");
  const [skipReveal, setSkipReveal] = useState(false);
  const locked = !revealed.length && !hideObjectives && !skipReveal;
  const scored = (id: FactionId) => scoredThisPhase(currentTurn, objectives, id);
  const name = (id: ObjectiveId) => objectives[id]?.name ?? id;

  const stage = revealStage(round) === "STAGE ONE" ? "Stage I" : "Stage II";

  return (
    <>
      {who ? (
        <section className={cx(kit.card, styles.hero)} style={{ ["--c" as string]: pcolor(factions[who]?.color) }} aria-label="Scoring">
          {helping && helping !== seat ? <HelpBanner who={helping} short={short} stop={() => setHelping(undefined)} /> : null}
          <p className={kit.eyebrow}><span>{who === seat ? "Your scoring" : `${short(who)}'s scoring`}</span></p>
          <Rows>
            {(["public", "secret"] as const).map((which) => {
              const done = which === "public" ? scored(who).publics : scored(who).secrets;
              return (
                <RowLink key={which} disabled={w.pending} onClick={() => open({ kind: "score", faction: who, which })}
                  title={done.length ? `${which === "public" ? "Public" : "Secret"} ✓ scored` : `Score ${which === "public" ? "a public" : "a secret"} objective`}
                  detail={done.length ? done.map(name).join(", ") : which === "public" ? "Revealed objectives" : "Public once scored"} />
              );
            })}
            {objectives[SFTT] ? <ThroneRow giver={who} ctx={ctx} /> : null}
          </Rows>
        </section>
      ) : (
        <section className={kit.card} aria-label="Scoring">
          {ctx.table ? (
            <p className={kit.sub}>Choose a player below to score for them.</p>
          ) : (
            <>
              <h2 className={kit.title}>Whose phone is this?</h2>
              <p className={kit.sub}>Choose your seat to score, or choose a player below to score for them.</p>
              <Rows><RowLink onClick={() => open({ kind: "seat" })} title="Choose your seat" /></Rows>
            </>
          )}
        </section>
      )}

      <section className={kit.card} aria-label="Scoring this round">
        <p className={kit.eyebrow}><span>This round</span><span>Choose one to score for them</span></p>
        <Choices list hideLabel label="Whose scoring to show" value={who} onChange={(id) => setHelping(id === seat ? undefined : id as FactionId)}
          options={order.map((id) => {
            const s = scored(id);
            return {
              value: id as string, name: `Score for ${short(id)}`,
              label: <span className={kit.line} style={{ width: "100%" }}>
                <Chip faction={id} factions={factions} short={short} small />
                <span className={kit.grow} />
                <Tag tone={s.publics.length ? "done" : undefined}>{s.publics.length ? "Public ✓" : "Public"}</Tag>
                <Tag tone={s.secrets.length ? "done" : undefined}>{s.secrets.length ? "Secret ✓" : "Secret"}</Tag>
              </span>,
            };
          })} />
      </section>

      <section className={kit.card} aria-label="Table steps">
        <p className={kit.eyebrow}><span>Table steps</span></p>
        {hideObjectives ? null : revealed.length ? (
          <Rows>
            {revealed.map((id) => (
              <RowAction key={id} verb="Take back" disabled={w.pending} title={`Revealed: ${name(id)}`} detail={objectives[id]?.description}
                onClick={() => w.write([Events.HideObjectiveEvent(id)], `Took back ${name(id)}`, speaker)} />
            ))}
          </Rows>
        ) : (
          <div className={kit.line}>
            <span className={kit.grow}><b>Reveal a {stage} objective</b><br /><span className={kit.sub}>{speaker === seat ? "Your job as speaker" : `${short(speaker)}'s job as speaker`}</span></span>
            <Button size="small" forOther={speaker !== seat} disabled={w.pending} onClick={() => open({ kind: "reveal", as: speaker })}>{speaker === seat ? "Reveal" : `Reveal for ${short(speaker)}`}</Button>
          </div>
        )}
        <details>
          <summary className={kit.sub} style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>Then on the board (not tracked)</summary>
          <p className={kit.sub}>
            Draw action cards (1 each; 2 with Neural Motivator; Yssaril draws 3 and discards 1). Remove command tokens from the board.
            Gain 2 command tokens (Sol 3; 1 more with Hyper Metabolism) and redistribute. Ready cards, repair units, return strategy cards.
          </p>
        </details>
        <StatusAbilities ctx={ctx} />
      </section>

      <section className={kit.card} aria-label="Finish the status phase">
        {/* Upstream locks the phase until the speaker reveals an objective; its lock opens on a tap, and so does this one. */}
        {locked ? (
          <div className={kit.line}>
            <p className={cx(kit.sub, kit.grow)}>No objective has been revealed yet this round. The speaker reveals one before the phase ends.</p>
            <Button kind="quiet" onClick={() => setSkipReveal(true)}>Go on without one</Button>
          </div>
        ) : null}
        {options.expansions.includes("TWILIGHTS FALL") ? (
          <TfStatusFinish ctx={ctx} />
        ) : agendaUnlocked ? (
          <Button kind="primary" size="tall" block disabled={w.pending || locked}
            onClick={() => w.write([Events.AdvancePhaseEvent()], "The agenda phase started")}>Start the agenda phase</Button>
        ) : (
          <>
            <p className={kit.sub}>Nobody controls Mecatol Rex yet, so there's no agenda phase this round.</p>
            <Button kind="primary" size="tall" block disabled={w.pending || locked}
              onClick={() => w.write([Events.AdvancePhaseEvent(true)], `Round ${round + 1} started`)}>Start round {round + 1}</Button>
            <Button block disabled={w.pending || locked}
              onClick={() => w.write([Events.AdvancePhaseEvent()], "The agenda phase started")}>Start the agenda phase anyway</Button>
          </>
        )}
      </section>
    </>
  );
}

function ThroneRow({ giver, ctx }: { giver: FactionId; ctx: Ctx }) {
  const objectives = useObjectives();
  const holder = throneHolder(objectives, giver);
  const { short, open, w, seat } = ctx;
  return (
    <RowLink disabled={w.pending} onClick={() => open({ kind: "give", giver })} end={holder ? "Move" : "Give"}
      title="Support for the Throne" detail={holder ? `In ${short(holder)}'s play area` : giver === seat ? "Still in your hand" : `Still in ${short(giver)}'s hand`} />
  );
}

// ---------- sheets ----------

export function StatusSheet({ sheet, close, ctx }: { sheet: Extract<Sheet, { kind: "score" | "give" | "reveal" }>; close: () => void; ctx: Ctx }) {
  if (sheet.kind === "score") return <ScoreSheet faction={sheet.faction} which={sheet.which} anyPhase={sheet.anyPhase} phase={sheet.phase} close={close} ctx={ctx} />;
  if (sheet.kind === "give") return <GiveSheet giver={sheet.giver} close={close} ctx={ctx} />;
  return <RevealSheet as={sheet.as} close={close} ctx={ctx} />;
}

function Search({ q, setQ, placeholder }: { q: string; setQ: (q: string) => void; placeholder: string }) {
  return <input className={kit.search} type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={placeholder} />;
}

const matches = (o: Objective, q: string) => !q || o.name.toLowerCase().includes(q.toLowerCase());

export function ScoreSheet({ faction, which, anyPhase, phase = "STATUS", close, ctx }: { faction: FactionId; which: "public" | "secret"; anyPhase?: boolean; phase?: string; close: () => void; ctx: Ctx }) {
  const { short, w } = ctx;
  const objectives = useObjectives();
  const currentTurn = useCurrentTurn();
  const planets = usePlanets();
  const [q, setQ] = useState("");
  const now = scoredThisPhase(currentTurn, objectives, faction);
  const done = which === "public" ? now.publics : now.secrets;
  const list = (which === "public" ? scorablePublics(objectives, faction, anyPhase) : scorableSecrets(objectives, phase))
    .filter((o) => matches(o, q))
    .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name));
  const missing = which === "public" ? missingHomePlanets(planets, faction) : [];
  const score = async (o: Objective) => {
    if (await w.write([Events.ScoreObjectiveEvent(faction, o.id)], `${short(faction)} scored ${o.name}`, faction)) close();
  };
  const takeBack = async (id: ObjectiveId) => {
    const o = objectives[id];
    if (await w.write([Events.UnscoreObjectiveEvent(faction, id)], `${short(faction)} took back ${o?.name ?? id}`, faction)) close();
  };
  return (
    <KitSheet title={`${short(faction)} scores a ${which} objective`} close={close}>
      {done.map((id) => (
        <div key={id} className={kit.banner}>
          <span className={kit.grow}>Scored this round: <b>{objectives[id]?.name ?? id}</b></span>
          <Button size="small" disabled={w.pending} onClick={() => takeBack(id)}>Take it back</Button>
        </div>
      ))}
      {done.length && phase === "STATUS" ? <p className={kit.sub}>{anyPhase ? "Imperial scores one public objective." : `Players normally score one ${which} objective each status phase.`}</p> : null}
      {missing.length ? <p className={kit.sub}>{short(faction)} doesn't control {missing.map((p) => p.name).join(" and ")}. A player without all their home planets can't score public objectives.</p> : null}
      {which === "secret" ? <p className={kit.sub}>Hands aren't tracked, so every unscored {phase === "STATUS" ? "" : `${phase.toLowerCase()}-phase `}secret is listed. It's public once scored.</p> : null}
      <Search q={q} setQ={setQ} placeholder={which === "public" ? "Find an objective" : "Find a secret"} />
      {list.length ? (
        <Rows>
          {list.map((o) => (
            <RowAction key={o.id} verb="Score" disabled={w.pending} onClick={() => score(o)} title={o.name} detail={o.description}
              end={<span className={kit.num}>{o.points} pt</span>} />
          ))}
        </Rows>
      ) : <p className={kit.sub}>Nothing left to score.</p>}
    </KitSheet>
  );
}

// The user's wording: "{X} gives {Y} Support for the Throne, granting {Y} +1 Victory Point?"
function GiveSheet({ giver, close, ctx }: { giver: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const objectives = useObjectives();
  const order = useOrderedFactionIds("SPEAKER");
  const holder = throneHolder(objectives, giver);
  const [to, setTo] = useState<Optional<FactionId>>();
  const g = short(giver), t = to ? short(to) : "", h = holder ? short(holder) : "";
  const sentence = !to ? null
    : to === giver ? `${h} returns Support for the Throne to ${g}, losing 1 victory point?`
    : holder ? `${g} moves Support for the Throne from ${h} to ${t}: ${h} loses 1 victory point and ${t} gains 1?`
    : `${g} gives ${t} Support for the Throne, granting ${t} +1 victory point?`;
  const confirm = async () => {
    if (!to) return;
    // Unscore first, with the exact holder and giver: upstream's unscore of a
    // repeatable objective removes the wrong scorer if the holder doesn't match.
    const events: GameUpdateData[] = [];
    if (holder) events.push(Events.UnscoreObjectiveEvent(holder, SFTT, giver));
    if (to !== giver) events.push(Events.ScoreObjectiveEvent(to, SFTT, giver));
    const label = to === giver ? `${h} returned Support for the Throne to ${g}` : holder ? `${g} moved Support for the Throne from ${h} to ${t}` : `${g} gave Support for the Throne to ${t}`;
    if (await w.write(events, label, giver)) close();
  };
  return (
    <KitSheet title={`${g}'s Support for the Throne`} close={close}>
      <Choices label={holder ? `It's in ${h}'s play area. Who should hold it instead?` : "Who receives it?"} value={to} onChange={(v) => setTo(v as FactionId)}
        options={[
          ...order.filter((id) => id !== giver).map((id) => ({ value: id as string, disabled: id === holder, note: id === holder ? "holds it" : undefined, label: <Chip faction={id} factions={factions} short={short} small player={false} /> })),
          ...(holder ? [{ value: giver as string, label: `Back to ${g}` }] : []),
        ]} />
      {sentence ? (
        <>
          <p className={kit.confirm}>{sentence}</p>
          <Button kind="primary" size="tall" block disabled={w.pending} onClick={confirm}>Confirm</Button>
        </>
      ) : null}
    </KitSheet>
  );
}

function RevealSheet({ as, close, ctx }: { as?: FactionId; close: () => void; ctx: Ctx }) {
  const { w } = ctx;
  const objectives = useObjectives();
  const round = useRound();
  const [q, setQ] = useState("");
  const stage = revealStage(round) === "STAGE ONE" ? "Stage I" : "Stage II";
  const list = revealableObjectives(objectives, round).filter((o) => matches(o, q)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <KitSheet title={`Reveal a ${stage} objective`} close={close}>
      <p className={kit.sub}>Flip the top card of the {stage} deck, then find it here.</p>
      <Search q={q} setQ={setQ} placeholder="Find the objective you flipped" />
      <Rows>
        {list.map((o) => (
          <RowAction key={o.id} verb="Reveal" disabled={w.pending} title={o.name} detail={o.description} end={<span className={kit.num}>{o.points} pt</span>}
            onClick={async () => {
              if (await w.write([Events.RevealObjectiveEvent(o.id)], `${stage} objective revealed: ${o.name}`, as)) close();
            }} />
        ))}
      </Rows>
    </KitSheet>
  );
}
