"use client";
// The fork's phone-first player screen (/[locale]/play/[gameId]). See the
// "Interface design" note in Trilium and prototype/play for the design.
// Strings are English and live in fork code, so upstream's message files stay untouched.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FactionIcon from "../../components/FactionIcon/FactionIcon";
import { useAbilities, useActionLog, useAgenda, useCurrentTurn, useGameId, usePlanets, useStrategyCards } from "../../context/dataHooks";
import { useFactionHasTech, useFactions, usePassedFactionIds } from "../../context/factionDataHooks";
import { useActiveFactionId, useOnDeckFactionId, useOrderedFactionIds } from "../../context/gameDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { getSelectedActionFromLog } from "../../util/api/data";
import { Events } from "../../util/api/events";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { sortStrategyCards } from "../../util/strategyCards";
import { actorOf, checksAndBalancesTargets, claimablePlanets, fmtDuration, groupKey, newestGroup, pointsBySource, sentence, subjectOf, turnOwners, turnStartedAt } from "./logic";
import { ActionLog, Optional } from "../../util/types/types";
import styles from "./play.module.scss";
import { useWrite } from "./useWrite";

const PHASES: Record<string, string> = { SETUP: "Setup", STRATEGY: "Strategy", ACTION: "Action", STATUS: "Status", AGENDA: "Agenda", END: "Game over" };
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const pcolor = (c?: string) => `var(--p-${(c ?? "black").toLowerCase()})`;

type Tab = "now" | "table" | "log";
type Sheet =
  | { kind: "seat" }
  | { kind: "claim"; faction: FactionId }
  | { kind: "pass"; faction: FactionId }
  | { kind: "player"; faction: FactionId }
  | { kind: "card"; card: StrategyCardId; pickFor?: FactionId };

function useSeat(gameId: string) {
  const key = `play-seat-${gameId}`;
  const [seat, setSeatState] = useState<Optional<FactionId>>();
  useEffect(() => {
    try { setSeatState((localStorage.getItem(key) || undefined) as Optional<FactionId>); } catch {}
  }, [key]);
  const setSeat = (id: Optional<FactionId>) => {
    setSeatState(id);
    try { id ? localStorage.setItem(key, id) : localStorage.removeItem(key); } catch {}
  };
  return [seat, setSeat] as const;
}

// Clocks and times render only in the browser: the server's clock and time zone differ.
function useNow(ms = 1000) {
  const [now, setNow] = useState<Optional<number>>();
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export default function PlayApp() {
  const gameId = useGameId();
  const factions = useFactions();
  const state = useGameState();
  const log = useActionLog();
  const [seat, setSeat] = useSeat(gameId);
  const [tab, setTab] = useState<Tab>("now");
  const [sheet, setSheet] = useState<Optional<Sheet>>();
  const [helping, setHelping] = useState<Optional<FactionId>>();

  const short = (id: Optional<string>) => (id ? factions[id as FactionId]?.shortname ?? id : "Someone");
  const isFaction = (id: string) => !!factions[id as FactionId];
  const owners = useMemo(() => turnOwners(log, state.activeplayer, state.phase), [log, state.activeplayer, state.phase]);
  const subject = (e: ActionLogEntry<GameUpdateData>) => subjectOf(e, owners.get(e));
  const describe = (entries: ActionLog) => {
    const parts = [...entries].reverse().map((e) => {
      const s = sentence(e, short, isFaction);
      const who = subject(e);
      return s ? (who && !/^[A-Z]/.test(s) ? `${short(who)} ${s}` : s) : null;
    }).filter(Boolean);
    return parts.join(", then ") || "the last change";
  };
  const w = useWrite(seat, describe);

  useEffect(() => {
    if (!w.toast) return;
    const t = setTimeout(() => w.setToast(undefined), 6000);
    return () => clearTimeout(t);
  }, [w.toast?.id]);

  const active = useActiveFactionId();
  const phase = state.phase;
  const ctx = { factions, short, isFaction, subject, describe, seat, helping, setHelping, w, open: setSheet, gameId };

  return (
    <div className={styles.root}>
      <header className={styles.top}>
        <div className={styles.phase}>
          <span className={styles.phaseName}>{PHASES[phase] ?? phase}</span>
          <span className={styles.round}>Round {state.round}</span>
        </div>
        <div className={styles.turn}>
          {active && (phase === "ACTION" || phase === "STRATEGY") ? (
            <span className={cx(styles.pill, styles.pillNow)}>{phase === "STRATEGY" ? "Picking" : "Up"}: {short(active)}</span>
          ) : null}
        </div>
        <button className={styles.seatBtn} onClick={() => setSheet({ kind: "seat" })} aria-label="Change seat">
          {seat ? <Swatch faction={seat} color={factions[seat]?.color} small /> : null}
          <span><small>You</small><b>{seat ? short(seat) : "Watching"}</b></span>
        </button>
      </header>

      {tab === "now" ? (
        <main className={cx(styles.main, styles.split)}>
          <div className={styles.col}>
            {phase === "ACTION" ? <NowAction {...ctx} /> : phase === "STRATEGY" ? <NowStrategy {...ctx} /> : <NotNativeYet phase={phase} gameId={gameId} seat={seat} />}
          </div>
          <div className={styles.col}>
            {phase === "ACTION" ? <CardBoard {...ctx} /> : null}
            <Race {...ctx} />
            <Recent {...ctx} log={log} onLog={() => setTab("log")} />
          </div>
        </main>
      ) : null}
      {tab === "table" ? <main className={styles.main}><TableTab {...ctx} /></main> : null}
      {tab === "log" ? <main className={styles.main}><LogTab {...ctx} log={log} /></main> : null}

      {w.toast ? (
        <div className={cx(styles.toast, w.toast.tone === "error" && styles.toastError)} role="status">
          <span>{w.toast.text}</span>
          {w.toast.undo ? <button onClick={() => w.undoNewest()} disabled={w.pending}>Undo</button> : null}
        </div>
      ) : null}

      <nav className={styles.tabs} aria-label="Sections">
        {(["now", "table", "log"] as Tab[]).map((t) => (
          <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "now" ? "Now" : t === "table" ? "Table" : "Log"}</button>
        ))}
      </nav>

      {sheet ? <Sheets sheet={sheet} close={() => setSheet(undefined)} {...ctx} setSeat={setSeat} /> : null}
    </div>
  );
}

type Ctx = {
  factions: Partial<Record<FactionId, Faction>>;
  short: (id: Optional<string>) => string;
  isFaction: (id: string) => boolean;
  subject: (e: ActionLogEntry<GameUpdateData>) => Optional<FactionId>;
  describe: (entries: ActionLog) => string;
  seat: Optional<FactionId>;
  helping: Optional<FactionId>;
  setHelping: (id: Optional<FactionId>) => void;
  w: ReturnType<typeof useWrite>;
  open: (s: Sheet) => void;
  gameId: string;
};

function Swatch({ faction, color, small, large }: { faction: FactionId; color?: string; small?: boolean; large?: boolean }) {
  const size = small ? 14 : large ? 26 : 19;
  return (
    <span className={cx(styles.sw, small && styles.swSmall, large && styles.swLarge)} data-c={color} style={{ ["--c" as string]: pcolor(color) }}>
      <FactionIcon factionId={faction} size={size} />
    </span>
  );
}

function Chip({ faction, factions, short, small, large, player = true }: { faction: FactionId; factions: Ctx["factions"]; short: Ctx["short"]; small?: boolean; large?: boolean; player?: boolean }) {
  const f = factions[faction];
  return (
    <span className={styles.chip}>
      <Swatch faction={faction} color={f?.color} small={small} large={large} />
      <span className={styles.chipName}>{short(faction)}</span>
      {player && f?.playerName ? <span className={styles.chipPlayer}>{f.playerName}</span> : null}
    </span>
  );
}

// ---------- Now: action phase ----------

function NowAction(ctx: Ctx) {
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
    .filter((e) => e.data.action !== "SELECT_ACTION")
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
              {steps.length ? <ul className={styles.list}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className={styles.sub}>Nothing recorded yet. Record what happens on the board, or just end the turn.</p>}
              {isCard ? <p className={styles.sub}>{(isCard as StrategyCard).primary}</p> : null}
              <div className={styles.grid2}>
                {selected === "Tactical" ? <button className={styles.btn} onClick={() => open({ kind: "claim", faction: active })}>Take a planet</button> : null}
                <Link className={styles.btn} href={factionPage}>More controls<small>Upstream's full page</small></Link>
              </div>
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
            <button className={cx(styles.btn, styles.primary)} disabled={w.pending} onClick={() => w.write([Events.MarkSecondaryEvent(seat!, "DONE")], `${short(seat)} followed the secondary`)}>Follow</button>
            <button className={styles.btn} disabled={w.pending} onClick={() => w.write([Events.MarkSecondaryEvent(seat!, "SKIPPED")], `${short(seat)} skipped the secondary`)}>Skip</button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function HelpBanner({ who, short, stop }: { who: FactionId; short: Ctx["short"]; stop: () => void }) {
  return (
    <div className={styles.banner}>
      <span className={styles.grow}>You're helping <b>{short(who)}</b>. Everything you do is logged as you, for {short(who)}.</span>
      <button className={cx(styles.btn, styles.smallBtn)} onClick={stop}>Stop</button>
    </div>
  );
}

// ---------- Now: strategy phase ----------

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

function NowStrategy(ctx: Ctx) {
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
              <Link href={`/game/${gameId}/main`} style={{ color: "var(--accent)" }}>Open the table screen</Link>
            </p>
          ) : null}
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending}
            onClick={() => w.write([Events.AdvancePhaseEvent()], "The action phase started")}>Start the action phase</button>
        </section>
      ) : null}
    </>
  );
}

function NotNativeYet({ phase, gameId, seat }: { phase: string; gameId: string; seat: Optional<FactionId> }) {
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}><span>{PHASES[phase] ?? phase} phase</span></p>
      <h2 className={styles.title}>This phase isn't on the new screen yet</h2>
      <p className={styles.sub}>Use the full screen for it. The score, the strategy cards and the log here stay up to date.</p>
      {seat ? <Link className={cx(styles.btn, styles.primary, styles.block)} href={`/game/${gameId}/${encodeURIComponent(seat)}`}>Open your faction's full screen</Link> : null}
      <Link className={cx(styles.btn, styles.block)} href={`/game/${gameId}/main`}>Open the table screen</Link>
    </section>
  );
}

// ---------- shared panels ----------

function CardBoard({ factions, short, open }: Ctx) {
  const strategyCards = useStrategyCards();
  const passed = usePassedFactionIds();
  const picked = Object.values(strategyCards).filter((c): c is StrategyCard => !!c?.faction).sort((a, b) => a.order - b.order);
  const left = picked.filter((c) => !c.used).length;
  return (
    <section className={styles.card} aria-label="Strategy cards">
      <p className={styles.eyebrow}><span>Strategy cards</span><span className={styles.num}>{left ? `${left} left` : "All played"}</span></p>
      <div>
        {picked.map((c) => (
          <button key={c.id} className={cx(styles.sc, c.used && styles.scUsed)} onClick={() => open({ kind: "card", card: c.id })}>
            <span className={styles.num} style={{ color: "var(--muted)" }}>{c.order}</span>
            <span className={styles.row}><b className={styles.scName}>{c.name}</b><Chip faction={c.faction!} factions={factions} short={short} small player={false} /></span>
            <span className={styles.pill}>{c.used ? "Played" : passed.includes(c.faction!) ? "Passed" : "Ready"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function useRace(factions: Ctx["factions"]) {
  const objectives = useObjectives();
  return useMemo(() => Object.values(factions)
    .filter((f): f is Faction => !!f)
    .map((f) => ({ id: f.id, ...pointsBySource(objectives, f.id, f.vps ?? 0) }))
    .sort((a, b) => b.total - a.total), [factions, objectives]);
}

function Race({ factions, short, open }: Ctx) {
  const rows = useRace(factions);
  const target = 10;
  return (
    <section className={styles.card} aria-label="Score race">
      <p className={styles.eyebrow}><span>Race to {target}</span></p>
      <ul className={styles.list}>
        {rows.map((r) => (
          <li key={r.id}>
            <button className={styles.raceRow} onClick={() => open({ kind: "player", faction: r.id })} aria-label={`${short(r.id)}: ${r.total} points`}>
              <Chip faction={r.id} factions={factions} short={short} small />
              <span className={styles.grow} style={{ display: "grid", gap: 4 }}>
                <span className={styles.bar} style={{ ["--c" as string]: pcolor(factions[r.id]?.color) }}><i style={{ width: `${Math.min(100, (r.total / target) * 100)}%` }} /></span>
                <span className={styles.srcs}>{r.groups.map((g, k) => <span key={g.label}>{k ? "· " : ""}{g.label} {g.points}</span>)}</span>
              </span>
              <span className={styles.vp}>{r.total}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeedRow({ e, factions, short, isFaction, subject }: { e: ActionLogEntry<GameUpdateData> } & Pick<Ctx, "factions" | "short" | "isFaction" | "subject">) {
  const mounted = useMounted();
  const s = sentence(e, short, isFaction);
  if (!s) return null;
  const who = subject(e);
  const actor = actorOf(e);
  const capital = /^[A-Z]/.test(s);
  return (
    <li>
      {who ? <Swatch faction={who} color={factions[who]?.color} small /> : <span />}
      <span>{who && !capital ? <b>{short(who)} </b> : null}{s}{actor?.as && actor.seat ? <span className={styles.feedBy}>{short(actor.seat)} did this for {short(actor.as)}</span> : null}</span>
      <span className={styles.feedTime}>{mounted ? new Date(e.timestampMillis).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span>
    </li>
  );
}

function Recent({ log, onLog, ...ctx }: Ctx & { log: ActionLog; onLog: () => void }) {
  const items = log.filter((e) => sentence(e, ctx.short, ctx.isFaction)).slice(0, 3);
  return (
    <section className={styles.card} aria-label="What just happened">
      <p className={styles.eyebrow}><span>Just happened</span><button className={styles.link} onClick={onLog}>Full log</button></p>
      <ul className={styles.feed}>{items.map((e, i) => <FeedRow key={`${e.timestampMillis}-${i}`} e={e} {...ctx} />)}</ul>
    </section>
  );
}

function TableTab(ctx: Ctx) {
  const { factions, short, open } = ctx;
  const rows = useRace(factions);
  const active = useActiveFactionId();
  const passed = usePassedFactionIds();
  const state = useGameState();
  const strategyCards = useStrategyCards();
  return (
    <section className={styles.card} aria-label="Players">
      <p className={styles.eyebrow}><span>Players by points</span></p>
      <ul className={styles.list}>
        {rows.map((r) => (
          <li key={r.id}>
            <button className={styles.opt} style={{ border: 0, padding: 0 }} onClick={() => open({ kind: "player", faction: r.id })}>
              <Chip faction={r.id} factions={factions} short={short} />
              <span className={cx(styles.meta, styles.row)} style={{ gap: 6 }}>
                {r.id === active ? <span className={cx(styles.pill, styles.pillNow)}>Playing</span> : null}
                {passed.includes(r.id) ? <span className={styles.pill}>Passed</span> : null}
                {state.speaker === r.id ? <span className={styles.pill}>Speaker</span> : null}
                {getStrategyCardsForFaction(strategyCards, r.id).map((c) => <span key={c.id} className={cx(styles.pill, !c.used && styles.pillOn)}>{c.order} {c.name}</span>)}
                <span className={styles.vp} style={{ color: "var(--ink)" }}>{r.total}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LogTab({ log, ...ctx }: Ctx & { log: ActionLog }) {
  const [who, setWho] = useState<Optional<FactionId>>();
  const order = useOrderedFactionIds("SPEAKER");
  const group = newestGroup(log);
  const rows = log.filter((e) => sentence(e, ctx.short, ctx.isFaction) && (!who || ctx.subject(e) === who)).slice(0, 300);
  return (
    <section className={styles.card} aria-label="Game log">
      <p className={styles.eyebrow}><span>Game log</span><span>Newest first</span></p>
      {group.length ? (
        <div className={styles.banner}>
          <span className={styles.grow}>Newest: {ctx.describe(group)}</span>
          <button className={cx(styles.btn, styles.smallBtn)} disabled={ctx.w.pending} onClick={() => ctx.w.undoNewest(groupKey(group))}>Undo</button>
        </div>
      ) : null}
      <div className={styles.row} style={{ overflowX: "auto", gap: 6, paddingBottom: 4 }}>
        <button className={cx(styles.pill, !who && styles.pillOn)} style={{ minHeight: 44, background: "none", cursor: "pointer" }} onClick={() => setWho(undefined)}>Everyone</button>
        {order.map((id) => (
          <button key={id} className={cx(styles.pill, who === id && styles.pillOn)} style={{ minHeight: 44, background: "none", cursor: "pointer" }} onClick={() => setWho(who === id ? undefined : id)}>{ctx.short(id)}</button>
        ))}
      </div>
      <ul className={styles.feed}>{rows.map((e, i) => <FeedRow key={`${e.timestampMillis}-${i}`} e={e} {...ctx} />)}</ul>
    </section>
  );
}

// ---------- sheets ----------

function SheetFrame({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.scrim} onClick={(e) => e.target === e.currentTarget && close()}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className={styles.close} onClick={close} aria-label="Close">✕</button></header>
        {children}
      </section>
    </div>
  );
}

function Sheets({ sheet, close, setSeat, ...ctx }: Ctx & { sheet: Sheet; close: () => void; setSeat: (id: Optional<FactionId>) => void }) {
  const { factions, short, w } = ctx;
  const planets = usePlanets();
  const currentTurn = useCurrentTurn();
  const strategyCards = useStrategyCards();
  const objectives = useObjectives();
  const order = useOrderedFactionIds("SPEAKER");
  const checksAndBalances = useAgenda("Checks and Balances");
  const [q, setQ] = useState("");
  const [to, setTo] = useState<Optional<FactionId>>();
  switch (sheet.kind) {
    case "seat":
      return (
        <SheetFrame title="Whose phone is this?" close={close}>
          <p className={styles.sub}>Your seat decides what this phone leads with. It doesn't limit what you can do.</p>
          <div className={styles.pick}>
            {order.map((id) => <button key={id} aria-pressed={ctx.seat === id} onClick={() => { setSeat(id); close(); }}><Chip faction={id} factions={factions} short={short} small /></button>)}
            <button aria-pressed={!ctx.seat} onClick={() => { setSeat(undefined); close(); }}><b>Just watching</b></button>
          </div>
        </SheetFrame>
      );
    case "claim": {
      const list = claimablePlanets(planets, sheet.faction, currentTurn)
        .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(!!a.owner) - Number(!!b.owner) || a.name.localeCompare(b.name));
      return (
        <SheetFrame title={`${short(sheet.faction)} takes control of…`} close={close}>
          <input className={styles.search} id="play-planet-search" type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a planet" />
          <div>
            {list.slice(0, 80).map((p) => (
              <button key={p.id} className={styles.opt} disabled={w.pending} onClick={async () => {
                if (await w.write([Events.ClaimPlanetEvent(sheet.faction, p.id)], `${short(sheet.faction)} took control of ${p.name}${p.owner ? ` from ${short(p.owner)}` : ""}`, sheet.faction)) close();
              }}>
                <b>{p.name}</b><span className={styles.meta}>{p.resources}/{p.influence}{p.owner ? ` · ${short(p.owner)}` : ""}</span>
              </button>
            ))}
          </div>
        </SheetFrame>
      );
    }
    case "pass":
      return (
        <SheetFrame title="Pass for the round?" close={close}>
          <p className={styles.title} style={{ fontWeight: 400 }}>{short(sheet.faction)} passes and takes no more turns this round.</p>
          <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending} onClick={async () => {
            if (await w.write([Events.SelectActionEvent("Pass"), Events.EndTurnEvent({})], `${short(sheet.faction)} passed`, sheet.faction)) { ctx.setHelping(undefined); close(); }
          }}>Pass</button>
        </SheetFrame>
      );
    case "card": {
      const c = strategyCards[sheet.card];
      const picker = sheet.pickFor;
      const canPick = !!picker && !!c && !c.faction && !c.invalid;
      const giving = canPick && !!checksAndBalances?.passed;
      const targets = giving ? checksAndBalancesTargets(Object.values(strategyCards).filter((x): x is StrategyCard => !!x), order, picker) : [];
      const pick = async (target: FactionId) => {
        if (!picker || !c) return;
        const label = target === picker ? `${short(picker)} picked ${c.name}` : `${short(picker)} gave ${c.name} to ${short(target)}`;
        if (await w.write([Events.AssignStrategyCardEvent(target, c.id, picker)], label, picker)) { ctx.setHelping(undefined); setTo(undefined); close(); }
      };
      return (
        <SheetFrame title={c?.name ?? sheet.card} close={close}>
          <p className={styles.eyebrow}><span>Primary</span></p><p style={{ whiteSpace: "pre-line", margin: 0 }}>{c?.primary}</p>
          <p className={styles.eyebrow}><span>Secondary</span></p><p style={{ whiteSpace: "pre-line", margin: 0 }}>{c?.secondary}</p>
          {canPick && !giving ? (
            <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending} onClick={() => pick(picker)}>
              {picker === ctx.seat ? `Pick ${c.name}` : `Pick ${c.name} for ${short(picker)}`}
            </button>
          ) : null}
          {giving ? (
            <>
              <p className={styles.eyebrow}><span>Checks and Balances: who gets it?</span></p>
              <div className={styles.pick}>
                {targets.map((id) => <button key={id} aria-pressed={to === id} onClick={() => setTo(id)}><Chip faction={id} factions={factions} short={short} small /></button>)}
              </div>
              {to ? (
                <>
                  <p className={styles.title} style={{ fontWeight: 400 }}>{to === picker ? `${short(picker)} keeps ${c.name}, since nobody else has room for a card.` : `${short(picker)} gives ${c.name} to ${short(to)}.`}</p>
                  <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={w.pending} onClick={() => pick(to)}>Confirm</button>
                </>
              ) : null}
            </>
          ) : null}
        </SheetFrame>
      );
    }
    case "player": {
      const f = factions[sheet.faction];
      const pts = pointsBySource(objectives, sheet.faction, f?.vps ?? 0);
      const owned = Object.values(planets).filter((p): p is Planet => p?.owner === sheet.faction);
      const res = owned.reduce((n, p) => n + p.resources, 0), inf = owned.reduce((n, p) => n + p.influence, 0);
      return (
        <SheetFrame title={f?.name ?? sheet.faction} close={close}>
          <p className={styles.sub}>{f?.playerName}</p>
          <p className={styles.eyebrow}><span>Points</span><span className={styles.num}>{pts.total}</span></p>
          <ul className={styles.list}>{pts.groups.map((g) => <li key={g.label}><span className={styles.grow}><b>{g.label}</b><br /><span className={styles.sub}>{g.items.join(", ")}</span></span><span className={styles.num}>{g.points}</span></li>)}</ul>
          <p className={styles.eyebrow}><span>Planets</span><span className={styles.num}>{owned.length} · {res} res · {inf} inf</span></p>
          <p className={styles.sub}>{owned.map((p) => p.name).sort().join(", ") || "None"}</p>
          <p className={styles.eyebrow}><span>Technology</span><span className={styles.num}>{Object.keys(f?.techs ?? {}).length}</span></p>
          <p className={styles.sub}>{Object.keys(f?.techs ?? {}).join(", ") || "None"}</p>
        </SheetFrame>
      );
    }
  }
}
