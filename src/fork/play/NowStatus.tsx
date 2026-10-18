"use client";
// Now, status phase. Scoring, Support for the Throne and the objective reveal are
// tracked; the rest of the phase happens on the board. Rules follow upstream's
// main/phase/status/StatusPhase.tsx (see logic.ts).
import Link from "next/link";
import { useState } from "react";
import { useCurrentTurn, useOptions, usePlanets, useRelics, useStrategyCards } from "../../context/dataHooks";
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
import { Chip, cx, HelpBanner, pcolor, SheetFrame, type Ctx, type Sheet } from "./ui";

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
  const planets = usePlanets();
  const relics = useRelics();
  const round = useRound();
  const speaker = useSpeaker();
  const agendaUnlocked = useAgendaUnlocked();
  const options = useOptions();
  const order = useScoringOrder();
  const who = helping ?? seat;
  const revealed = revealedThisPhase(currentTurn);
  const hideObjectives = !!options.hide?.includes("OBJECTIVES");
  const scored = (id: FactionId) => scoredThisPhase(currentTurn, objectives, id);
  const name = (id: ObjectiveId) => objectives[id]?.name ?? id;

  const extras: string[] = [];
  if (factions["Naalu Collective"]) extras.push("The Oracle");
  if (relics["The Crown of Emphidia"]?.owner) extras.push("The Crown of Emphidia");
  if (options.expansions.includes("THUNDERS EDGE") && !options.hide?.includes("TECHS")) extras.push("Entropic Scar", "Radical Advancement");

  return (
    <>
      {who ? (
        <section className={cx(styles.card, styles.hero)} style={{ ["--c" as string]: pcolor(factions[who]?.color) }} aria-label="Scoring">
          {helping && helping !== seat ? <HelpBanner who={helping} short={short} stop={() => setHelping(undefined)} /> : null}
          <p className={styles.eyebrow}><span>{who === seat ? "Your scoring" : `${short(who)}'s scoring`}</span></p>
          <div className={styles.grid2}>
            {(["public", "secret"] as const).map((which) => {
              const done = which === "public" ? scored(who).publics : scored(who).secrets;
              return (
                <button key={which} className={cx(styles.btn, styles.tall, !done.length && which === "public" && styles.primary)} disabled={w.pending}
                  onClick={() => open({ kind: "score", faction: who, which })}>
                  {done.length ? `${which === "public" ? "Public" : "Secret"} ✓` : `Score ${which}`}
                  <small>{done.length ? done.map(name).join(", ") : which === "public" ? "Revealed objectives" : "Public once scored"}</small>
                </button>
              );
            })}
          </div>
          {objectives[SFTT] ? <ThroneRow giver={who} ctx={ctx} /> : null}
        </section>
      ) : (
        <section className={styles.card} aria-label="Scoring">
          <h2 className={styles.title}>Whose phone is this?</h2>
          <p className={styles.sub}>Choose your seat to score, or tap a player below to score for them.</p>
          <button className={cx(styles.btn, styles.primary, styles.block)} onClick={() => open({ kind: "seat" })}>Choose your seat</button>
        </section>
      )}

      <section className={styles.card} aria-label="Scoring this round">
        <p className={styles.eyebrow}><span>This round</span><span>Tap to help</span></p>
        <ul className={styles.list}>
          {order.map((id) => {
            const s = scored(id);
            return (
              <li key={id}>
                <button className={styles.raceRow} onClick={() => setHelping(id === seat ? undefined : id)} aria-label={`Score for ${short(id)}`}>
                  <Chip faction={id} factions={factions} short={short} small />
                  <span className={styles.grow} />
                  <span className={cx(styles.pill, !!s.publics.length && styles.pillOn)}>{s.publics.length ? "Public ✓" : "Public"}</span>
                  <span className={cx(styles.pill, !!s.secrets.length && styles.pillOn)}>{s.secrets.length ? "Secret ✓" : "Secret"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.card} aria-label="Table steps">
        <p className={styles.eyebrow}><span>Table steps</span></p>
        {hideObjectives ? null : (
          <div className={styles.row}>
            <span className={styles.grow}>
              <b>{revealed.length ? `Revealed: ${revealed.map(name).join(", ")}` : `Reveal a ${revealStage(round) === "STAGE ONE" ? "Stage I" : "Stage II"} objective`}</b>
              <br /><span className={styles.sub}>{speaker === seat ? "Your job as speaker" : `${short(speaker)}'s job as speaker`}</span>
            </span>
            {revealed.length ? <span className={cx(styles.pill, styles.pillOn)}>Done</span> : (
              <button className={cx(styles.btn, styles.smallBtn, speaker !== seat && styles.help)} disabled={w.pending} onClick={() => open({ kind: "reveal", as: speaker })}>
                {speaker === seat ? "Reveal" : `Do it for ${short(speaker)}`}
              </button>
            )}
          </div>
        )}
        <details>
          <summary className={styles.sub} style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>Then on the board (not tracked)</summary>
          <p className={styles.sub}>
            Draw action cards (1 each; 2 with Neural Motivator; Yssaril draws 3 and discards 1). Remove command tokens from the board.
            Gain 2 command tokens (Sol 3; 1 more with Hyper Metabolism) and redistribute. Ready cards, repair units, return strategy cards.
          </p>
        </details>
        {extras.length ? (
          <p className={styles.sub}>
            {extras.join(", ")} {extras.length > 1 ? "are" : "is"} on the table screen.{" "}
            <Link href={`/game/${gameId}/main`} className={styles.textLink}>Open the table screen</Link>
          </p>
        ) : null}
      </section>

      <section className={styles.card} aria-label="Finish the status phase">
        {!revealed.length && !hideObjectives ? <p className={styles.sub}>No objective has been revealed yet this round.</p> : null}
        {options.expansions.includes("TWILIGHTS FALL") ? (
          <Link className={cx(styles.btn, styles.block)} href={`/game/${gameId}/main`}>Finish the phase on the table screen</Link>
        ) : agendaUnlocked ? (
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
            onClick={() => w.write([Events.AdvancePhaseEvent()], "The agenda phase started")}>Start the agenda phase</button>
        ) : (
          <>
            <p className={styles.sub}>Nobody controls Mecatol Rex yet, so there's no agenda phase this round.</p>
            <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
              onClick={() => w.write([Events.AdvancePhaseEvent(true)], `Round ${round + 1} started`)}>Start round {round + 1}</button>
            <button className={cx(styles.btn, styles.block)} disabled={w.pending}
              onClick={() => w.write([Events.AdvancePhaseEvent()], "The agenda phase started")}>Start the agenda phase anyway</button>
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
    <div className={styles.row}>
      <span className={styles.grow}>
        <b>Support for the Throne</b><br />
        <span className={styles.sub}>{holder ? `In ${short(holder)}'s play area` : giver === seat ? "Still in your hand" : `Still in ${short(giver)}'s hand`}</span>
      </span>
      <button className={cx(styles.btn, styles.smallBtn)} disabled={w.pending} onClick={() => open({ kind: "give", giver })}>{holder ? "Move" : "Give"}</button>
    </div>
  );
}

// ---------- sheets ----------

export function StatusSheet({ sheet, close, ctx }: { sheet: Extract<Sheet, { kind: "score" | "give" | "reveal" }>; close: () => void; ctx: Ctx }) {
  if (sheet.kind === "score") return <ScoreSheet faction={sheet.faction} which={sheet.which} close={close} ctx={ctx} />;
  if (sheet.kind === "give") return <GiveSheet giver={sheet.giver} close={close} ctx={ctx} />;
  return <RevealSheet as={sheet.as} close={close} ctx={ctx} />;
}

function Search({ q, setQ, placeholder }: { q: string; setQ: (q: string) => void; placeholder: string }) {
  return <input className={styles.search} type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={placeholder} />;
}

const matches = (o: Objective, q: string) => !q || o.name.toLowerCase().includes(q.toLowerCase());

function ScoreSheet({ faction, which, close, ctx }: { faction: FactionId; which: "public" | "secret"; close: () => void; ctx: Ctx }) {
  const { short, w } = ctx;
  const objectives = useObjectives();
  const currentTurn = useCurrentTurn();
  const planets = usePlanets();
  const [q, setQ] = useState("");
  const now = scoredThisPhase(currentTurn, objectives, faction);
  const done = which === "public" ? now.publics : now.secrets;
  const list = (which === "public" ? scorablePublics(objectives, faction) : scorableSecrets(objectives))
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
    <SheetFrame title={`${short(faction)} scores a ${which} objective`} close={close}>
      {done.map((id) => (
        <div key={id} className={styles.banner}>
          <span className={styles.grow}>Scored this round: <b>{objectives[id]?.name ?? id}</b></span>
          <button className={cx(styles.btn, styles.smallBtn)} disabled={w.pending} onClick={() => takeBack(id)}>Take it back</button>
        </div>
      ))}
      {done.length ? <p className={styles.sub}>Players normally score one {which} objective each status phase.</p> : null}
      {missing.length ? <p className={styles.sub}>{short(faction)} doesn't control {missing.map((p) => p.name).join(" and ")}. A player without all their home planets can't score public objectives.</p> : null}
      {which === "secret" ? <p className={styles.sub}>Hands aren't tracked, so every unscored secret is listed. It's public once scored.</p> : null}
      <Search q={q} setQ={setQ} placeholder={which === "public" ? "Find an objective" : "Find a secret"} />
      <div>
        {list.map((o) => (
          <button key={o.id} className={styles.opt} disabled={w.pending} onClick={() => score(o)}>
            <span style={{ display: "grid", textAlign: "left", gap: 2 }}><b>{o.name}</b><span className={styles.sub}>{o.description}</span></span>
            <span className={styles.meta}>{o.points} pt</span>
          </button>
        ))}
        {!list.length ? <p className={styles.sub}>Nothing left to score.</p> : null}
      </div>
    </SheetFrame>
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
    <SheetFrame title={`${g}'s Support for the Throne`} close={close}>
      <p className={styles.sub}>{holder ? `It's in ${h}'s play area. Who should hold it instead?` : `Who receives it?`}</p>
      <div className={styles.pick}>
        {order.filter((id) => id !== giver).map((id) => (
          <button key={id} aria-pressed={to === id} disabled={id === holder} onClick={() => setTo(id)}>
            <Chip faction={id} factions={factions} short={short} small player={false} />{id === holder ? <span className={styles.sub}> holds it</span> : null}
          </button>
        ))}
        {holder ? <button aria-pressed={to === giver} onClick={() => setTo(giver)}><b>Back to {g}</b></button> : null}
      </div>
      {sentence ? (
        <>
          <p className={styles.title} style={{ fontWeight: 400 }}>{sentence}</p>
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending} onClick={confirm}>Confirm</button>
        </>
      ) : null}
    </SheetFrame>
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
    <SheetFrame title={`Reveal a ${stage} objective`} close={close}>
      <p className={styles.sub}>Flip the top card of the {stage} deck, then find it here.</p>
      <Search q={q} setQ={setQ} placeholder="Find the objective you flipped" />
      <div>
        {list.map((o) => (
          <button key={o.id} className={styles.opt} disabled={w.pending} onClick={async () => {
            if (await w.write([Events.RevealObjectiveEvent(o.id)], `${stage} objective revealed: ${o.name}`, as)) close();
          }}>
            <span style={{ display: "grid", textAlign: "left", gap: 2 }}><b>{o.name}</b><span className={styles.sub}>{o.description}</span></span>
            <span className={styles.meta}>{o.points} pt</span>
          </button>
        ))}
      </div>
    </SheetFrame>
  );
}
