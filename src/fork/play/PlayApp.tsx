"use client";
// The fork's phone-first player screen (/[locale]/play/[gameId]). See the
// "Interface design" note in Trilium and prototype/play for the design.
// Strings are English and live in fork code, so upstream's message files stay untouched.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useActionLog, useAgenda, useCurrentTurn, useGameId, useOptions, usePlanets, useStrategyCards } from "../../context/dataHooks";
import { useFactions, usePassedFactionIds } from "../../context/factionDataHooks";
import { useActiveFactionId, useOrderedFactionIds } from "../../context/gameDataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { Events } from "../../util/api/events";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { actorOf, checksAndBalancesTargets, claimablePlanets, groupKey, newestGroup, roundsOf, sentence, subjectOf, turnOwners } from "./logic";
import { ActionLog, Optional } from "../../util/types/types";
import styles from "./play.module.scss";
import { useWrite } from "./useWrite";
import NowEdict from "../tfplay/NowEdict"; // Twilight's Fall (tfall)
import { TfSetupCard, TyrantCard } from "../tfplay/TfTable";
import NowAction from "./NowAction";
import { CombatBanner, EndCombatSheet, StartCombatSheet } from "./Combat";
import { ActionCardButton, ActionCardSheet } from "./NowActionCards";
import { PointsButton, PointsSheet } from "./NowPoints";
import { ExpeditionCard, ExpeditionSheet } from "./NowExpedition";
import MapTab, { SystemSheet } from "./MapTab";
import NowAgenda, { AgendaSheet } from "./NowAgenda";
import { AgendaCardSheet } from "./AgendaCards";
import { StatusAbilitySheet } from "./StatusAbilities";
import { GiftSheet, SwapSheet } from "./StrategyAbilities";
import { LawSheet, LawsCard } from "./Laws";
import { PlayerEditSheet } from "./PlayerEdit";
import { PassSheet, PuppetsSheet, SkipTurnSheet } from "./TurnControls";
import { ResultsSheet } from "./Results";
import { GameCard, GameSettingsSheet } from "./GameInfo";
import { TechTreeSheet } from "./TechTreeSheet";
import { FrontierSheet } from "./Frontier";
import { ClockCard, PausedBanner, useUpstreamTimers } from "./Clock";
import { ResearchSheet } from "./NowCards";
import { ComponentSheet, RelicSheet } from "./NowComponent";
import NowEnd, { GameEndBanner } from "./NowEnd";
import { PlayerSheet } from "./PlayerSheet";
import NowStatus, { StatusSheet } from "./NowStatus";
import NowStrategy from "./NowStrategy";
import NowSetup, { SetupChoiceSheet } from "./NowSetup";
import { PHASES, useMounted, useRace, type Sheet, type Ctx } from "./ui";
import { PlayPopouts } from "./things";
import { LockedBanner, UnlockSheet } from "./NowLocked";
import { BaalSheet, SingularitySheet } from "./TacticalExtras";
import { MapTileSheet } from "./MapTiles";
import { Button, CardTag, Chip, Choices, cx, DockContext, kit, pcolor, RowAction, RowLink, Rows, Sheet as KitSheet, Swatch, Tag, TextSizeChoice, rootAttrs, useDevicePrefs, useMedia, WIDE, type Prefs } from "../ui/kit";

type Tab = "now" | "table" | "map" | "log";

function useSeat(gameId: string) {
  const key = `play-seat-${gameId}`;
  const [seat, setSeatState] = useState<Optional<FactionId>>();
  useEffect(() => {
    // "play-last" is the start page's "Back to game".
    try { setSeatState((localStorage.getItem(key) || undefined) as Optional<FactionId>); localStorage.setItem("play-last", gameId); } catch {}
  }, [key, gameId]);
  const setSeat = (id: Optional<FactionId>) => {
    setSeatState(id);
    try { id ? localStorage.setItem(key, id) : localStorage.removeItem(key); } catch {}
  };
  return [seat, setSeat] as const;
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
  const { prefs, setPrefs } = useDevicePrefs();
  const table = prefs.always;
  const w = useWrite(seat, describe, table, () => setSheet({ kind: "unlock" }));
  const wide = useMedia(WIDE);
  const dockInfo = wide && prefs.dock === "beside";

  useEffect(() => {
    if (!w.toast) return;
    const t = setTimeout(() => w.setToast(undefined), 6000);
    return () => clearTimeout(t);
  }, [w.toast?.id]);

  const active = useActiveFactionId();
  const phase = state.phase;
  useUpstreamTimers();

  // Helping lasts as long as what it was for: the phase, and in turn-based
  // phases the helped player's turn (they may end it from their own phone).
  // Only these effects stop it: a write that returns late must not stop a help
  // started for the next player in the meantime.
  useEffect(() => setHelping(undefined), [phase]);
  useEffect(() => {
    if ((phase === "ACTION" || phase === "STRATEGY") && helping && helping !== active) setHelping(undefined);
  }, [phase, active, helping]);
  const controls = (id: Optional<FactionId>) => !!id && (id === seat || id === helping || table);
  const hide = useOptions().hide;
  const tracks = (s: AppSection) => !hide?.includes(s);
  const ctx = { factions, short, isFaction, subject, describe, seat, helping, setHelping, table, controls, w, open: setSheet, gameId, tracks };
  const docked = !!sheet && dockInfo && INFO_SHEETS.has(sheet.kind);

  return (
    <DockContext.Provider value={dockInfo}>
    <div className={cx(kit.root, styles.root)} {...rootAttrs(prefs)} data-docked={docked || undefined}>
    <PlayPopouts>
      <header className={styles.top}>
        <div className={styles.phase}>
          <span className={styles.phaseName}>{PHASES[phase] ?? phase}</span>
          <span className={styles.round}>Round {state.round}</span>
        </div>
        <div className={styles.turn}>
          {active && (phase === "ACTION" || phase === "STRATEGY") ? (
            <Tag tone="now">{phase === "STRATEGY" ? "Picking" : "Up"}: {short(active)}</Tag>
          ) : null}
        </div>
        <button className={styles.seatBtn} onClick={() => setSheet({ kind: "seat" })} aria-label="Change seat">
          {seat ? <Swatch faction={seat} color={factions[seat]?.color} small /> : null}
          <span><small>{table ? "All actions" : "You"}</small><b>{seat ? short(seat) : table ? "Shared screen" : "Watching"}</b></span>
        </button>
      </header>

      {tab === "now" ? (
        <main className={cx(styles.main, styles.split)}>
          <div className={styles.col}>
            <LockedBanner open={setSheet} />
            <PausedBanner ctx={ctx} />
            {phase !== "END" ? <GameEndBanner {...ctx} /> : null}
            {phase === "SETUP" ? <TfSetupCard ctx={ctx} /> : null}
            <CombatBanner ctx={ctx} />
            {phase === "END" ? <NowEnd {...ctx} /> : phase === "ACTION" ? <NowAction {...ctx} /> : phase === "STRATEGY" ? <NowStrategy {...ctx} /> : phase === "STATUS" ? <NowStatus {...ctx} /> : phase === "AGENDA" ? <NowAgenda {...ctx} /> : phase === "SETUP" ? <NowSetup {...ctx} /> : phase === "EDICT" ? <NowEdict {...ctx} /> : <NotNativeYet phase={phase} gameId={gameId} seat={seat} />}
            {phase === "ACTION" || phase === "STATUS" || phase === "AGENDA" || phase === "STRATEGY" ? (
              <section className={kit.card} aria-label="Anything else">
                <p className={kit.eyebrow}><span>Anything else?</span></p>
                <Rows flush><ActionCardButton ctx={ctx} /><PointsButton ctx={ctx} /></Rows>
              </section>
            ) : null}
          </div>
          <div className={styles.col}>
            {phase === "ACTION" ? <CardBoard {...ctx} /> : null}
            <Race {...ctx} />
            <Recent {...ctx} log={log} onLog={() => setTab("log")} />
          </div>
        </main>
      ) : null}
      {tab === "table" ? <main className={styles.main}><TableTab {...ctx} /></main> : null}
      {tab === "map" ? <main className={styles.main}><MapTab {...ctx} /></main> : null}
      {tab === "log" ? <main className={styles.main}><LogTab {...ctx} log={log} /></main> : null}

      {w.toast ? (
        <div className={cx(kit.toast, w.toast.tone === "error" && kit.toastError)} role="status">
          <span>{w.toast.text}</span>
          {w.toast.undo ? <button onClick={() => w.undoNewest()} disabled={w.pending}>Undo</button> : null}
        </div>
      ) : null}

      <nav className={styles.tabs} aria-label="Sections">
        {(["now", "table", "map", "log"] as Tab[]).map((t) => (
          <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "now" ? "Now" : t === "table" ? "Table" : t === "map" ? "Map" : "Log"}</button>
        ))}
      </nav>

      {sheet ? <Sheets sheet={sheet} close={() => setSheet(undefined)} {...ctx} setSeat={setSeat} prefs={prefs} setPrefs={setPrefs} wide={wide} /> : null}
    </PlayPopouts>
    </div>
    </DockContext.Provider>
  );
}

// Sheets about a thing rather than a step: on a wide screen they can open beside it.
const INFO_SHEETS = new Set<Sheet["kind"]>(["player", "system"]);

function NotNativeYet({ phase, gameId, seat }: { phase: string; gameId: string; seat: Optional<FactionId> }) {
  return (
    <section className={kit.card}>
      <p className={kit.eyebrow}><span>{PHASES[phase] ?? phase} phase</span></p>
      <h2 className={kit.title}>This phase isn't on the new screen yet</h2>
      <p className={kit.sub}>Use the full screen for it. The score, the strategy cards and the log here stay up to date.</p>
      <Rows>
        {seat ? <RowLink href={`/game/${gameId}/${encodeURIComponent(seat)}`} external title="Your faction's full screen" detail="Upstream's page for your faction" /> : null}
        <RowLink href={`/game/${gameId}/main`} external title="The table screen" detail="Upstream's page for the whole table" />
      </Rows>
    </section>
  );
}

// ---------- shared panels ----------

// Every card picked this round, in its colour: filled until it's played.
function CardBoard({ factions, short }: Ctx) {
  const strategyCards = useStrategyCards();
  const passed = usePassedFactionIds();
  const picked = Object.values(strategyCards).filter((c): c is StrategyCard => !!c?.faction).sort((a, b) => a.order - b.order);
  const left = picked.filter((c) => !c.used).length;
  return (
    <section className={kit.card} aria-label="Strategy cards">
      <p className={kit.eyebrow}><span>Strategy cards</span><span className={kit.num}>{left ? `${left} left` : "All played"}</span></p>
      <ul className={styles.list}>
        {picked.map((c) => (
          <li key={c.id}>
            <CardTag card={c} used={c.used} />
            <span className={kit.grow}><Chip faction={c.faction!} factions={factions} short={short} small player={false} /></span>
            <Tag tone={c.used ? undefined : "done"}>{c.used ? "Played" : passed.includes(c.faction!) ? "Passed" : "Ready"}</Tag>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Race({ factions, short, open }: Ctx) {
  const rows = useRace(factions);
  const target = useOptions()["victory-points"] ?? 10;
  return (
    <section className={kit.card} aria-label="Score race">
      <p className={kit.eyebrow}><span>Race to {target}</span></p>
      <Rows flush>
        {rows.map((r) => (
          <RowLink key={r.id} onClick={() => open({ kind: "player", faction: r.id })} label={`${short(r.id)}: ${r.total} points`}
            title={<Chip faction={r.id} factions={factions} short={short} small />}
            detail={<span style={{ display: "grid", gap: 4 }}>
              <span className={styles.bar} style={{ ["--c" as string]: pcolor(factions[r.id]?.color) }}><i style={{ width: `${Math.min(100, (r.total / target) * 100)}%` }} /></span>
              <span className={styles.srcs}>{r.groups.map((g, k) => <span key={g.label}>{k ? "· " : ""}{g.label} {g.points}</span>)}</span>
            </span>}
            end={<span className={styles.vp}>{r.total}</span>} />
        ))}
      </Rows>
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
  const by = actor?.as && actor.seat ? `${short(actor.seat)} did this for ${short(actor.as)}${actor.table ? " on the shared screen" : ""}`
    : actor?.table ? "On the shared screen" : null;
  return (
    <li>
      {who ? <Swatch faction={who} color={factions[who]?.color} small /> : <span />}
      <span>{who && !capital ? <b>{short(who)} </b> : null}{s}{by ? <span className={styles.feedBy}>{by}</span> : null}</span>
      <span className={styles.feedTime}>{mounted ? new Date(e.timestampMillis).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span>
    </li>
  );
}

function Recent({ log, onLog, ...ctx }: Ctx & { log: ActionLog; onLog: () => void }) {
  const items = log.filter((e) => sentence(e, ctx.short, ctx.isFaction)).slice(0, 3);
  return (
    <section className={kit.card} aria-label="What just happened">
      <p className={kit.eyebrow}><span>Just happened</span><Button kind="quiet" onClick={onLog}>Full log</Button></p>
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
    <>
    <section className={kit.card} aria-label="Players">
      <p className={kit.eyebrow}><span>Players by points</span></p>
      <Rows flush>
        {rows.map((r) => (
          <RowLink key={r.id} onClick={() => open({ kind: "player", faction: r.id })} label={`${short(r.id)}: ${r.total} points`}
            title={<Chip faction={r.id} factions={factions} short={short} />}
            detail={<span className={kit.line} style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {r.id === active ? <Tag tone="now">Playing</Tag> : null}
              {passed.includes(r.id) ? <Tag>Passed</Tag> : null}
              {state.speaker === r.id ? <Tag>Speaker</Tag> : null}
              {getStrategyCardsForFaction(strategyCards, r.id).map((c) => <CardTag key={c.id} card={c} used={c.used} still />)}
            </span>}
            end={<span className={styles.vp} style={{ color: "var(--ink)" }}>{r.total}</span>} />
        ))}
      </Rows>
    </section>
    <GameCard ctx={ctx} />
    <section className={kit.card} aria-label="The game so far">
      <Rows flush>
        <RowLink onClick={() => open({ kind: "results" })} title="How the game went" detail="Points and technology by round, the map by round, time per player" />
        <RowLink href={`/api/${ctx.gameId}/download`} download={`ti-game-${ctx.gameId}.json`} title="Download the game" detail="The setup, timers and full log as a JSON file" />
      </Rows>
    </section>
    <LawsCard ctx={ctx} />
    <ClockCard ctx={ctx} />
    <ExpeditionCard ctx={ctx} />
    <TyrantCard ctx={ctx} />
    </>
  );
}

function LogTab({ log, ...ctx }: Ctx & { log: ActionLog }) {
  const [who, setWho] = useState<string>("everyone");
  const order = useOrderedFactionIds("SPEAKER");
  const group = newestGroup(log);
  const rows = log.filter((e) => sentence(e, ctx.short, ctx.isFaction) && (who === "everyone" || ctx.subject(e) === who)).slice(0, 300);
  const roundOf = useMemo(() => roundsOf(log), [log]);
  return (
    <section className={kit.card} aria-label="Game log">
      <p className={kit.eyebrow}><span>Game log</span><span>Newest first</span></p>
      {group.length ? (
        <div className={kit.banner}>
          <span className={kit.grow}>Newest: {ctx.describe(group)}</span>
          <Button size="small" disabled={ctx.w.pending} onClick={() => ctx.w.undoNewest(groupKey(group))}>Undo</Button>
        </div>
      ) : null}
      <Choices label="Show" value={who} onChange={setWho}
        options={[{ value: "everyone", label: "Everyone" }, ...order.map((id) => ({ value: id as string, label: ctx.short(id) }))]} />
      <ul className={styles.feed}>{rows.map((e, i) => {
        const r = roundOf.get(e);
        const head = r !== undefined && (i === 0 || roundOf.get(rows[i - 1]!) !== r);
        return (
          <Fragment key={`${e.timestampMillis}-${i}`}>
            {head ? <li className={styles.feedHead}><h3>{r === 0 ? "Setup" : `Round ${r}`}</h3></li> : null}
            <FeedRow e={e} {...ctx} />
          </Fragment>
        );
      })}</ul>
    </section>
  );
}

// ---------- sheets ----------

// Upstream's theme script (src/util/theme.ts) keeps the choice in localStorage and
// exposes __setPreferredTheme; its toggle lives in the top bar /play hides.
function useTheme() {
  const [theme, setTheme] = useState<Optional<string>>();
  useEffect(() => setTheme(document.documentElement.dataset.theme), []);
  const choose = (t: string) => {
    (window as unknown as { __setPreferredTheme?: (t: string) => void }).__setPreferredTheme?.(t);
    setTheme(t);
  };
  return [theme, choose] as const;
}

type DeviceProps = { setSeat: (id: Optional<FactionId>) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; wide: boolean };

// This device: whose phone it is, whether it shows every player's actions, and how it looks.
function DeviceSheet({ close, setSeat, prefs, setPrefs, wide, ...ctx }: Ctx & DeviceProps & { close: () => void }) {
  const { factions, short } = ctx;
  const order = useOrderedFactionIds("SPEAKER");
  const [theme, setTheme] = useTheme();
  return (
    <KitSheet title="This device" close={close}>
      <Choices label="Whose phone is this?" value={ctx.seat ?? "watching"} onChange={(v) => setSeat(v === "watching" ? undefined : v as FactionId)}
        options={[...order.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> })), { value: "watching", label: "Nobody's: just watching" }]} />
      <p className={kit.sub}>Your seat decides what this phone leads with. It doesn't limit what you can do.</p>
      <div className={kit.section}>
        <Choices label="Show actions" value={prefs.always ? "always" : "seat"} onChange={(v) => setPrefs({ always: v === "always" })}
          options={[{ value: "seat", label: "For this seat's turn", note: "others tap “Do it for…”" }, { value: "always", label: "Always, for whoever is up", note: "a shared iPad or laptop" }]} />
      </div>
      <div className={kit.section}>
        <Choices label="Theme" value={theme} onChange={setTheme} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
      </div>
      <div className={kit.section}>
        <TextSizeChoice prefs={prefs} setPrefs={setPrefs} />
      </div>
      {wide ? (
        <div className={kit.section}>
          <Choices label="On a wide screen, a player's or a system's details open" value={prefs.dock} onChange={(v) => setPrefs({ dock: v })}
            options={[{ value: "beside", label: "Beside the screen" }, { value: "over", label: "Over the screen" }]} />
        </div>
      ) : null}
      <Button kind="primary" block onClick={close}>Done</Button>
    </KitSheet>
  );
}

function Sheets({ sheet, close, setSeat, prefs, setPrefs, wide, ...ctx }: Ctx & DeviceProps & { sheet: Sheet; close: () => void }) {
  const { factions, short, w } = ctx;
  const planets = usePlanets();
  const currentTurn = useCurrentTurn();
  const strategyCards = useStrategyCards();
  const order = useOrderedFactionIds("SPEAKER");
  const checksAndBalances = useAgenda("Checks and Balances");
  const phase = useGameState().phase;
  const [q, setQ] = useState("");
  const [to, setTo] = useState<Optional<FactionId>>();
  switch (sheet.kind) {
    case "score":
    case "give":
    case "reveal":
      return <StatusSheet sheet={sheet} close={close} ctx={ctx} />;
    case "research":
      return <ResearchSheet faction={sheet.faction} follow={sheet.follow} close={close} ctx={ctx} />;
    case "combat":
      return <StartCombatSheet attacker={sheet.attacker} close={close} ctx={ctx} />;
    case "endCombat":
      return <EndCombatSheet before={sheet.before} close={close} ctx={ctx} />;
    case "system":
      return <SystemSheet system={sheet.system} close={close} ctx={ctx} />;
    case "expedition":
      return <ExpeditionSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "points":
      return <PointsSheet phase={phase} close={close} ctx={ctx} />;
    case "actionCard":
      return <ActionCardSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "component":
      return <ComponentSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "relic":
      return <RelicSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "agenda":
    case "vote":
    case "resolve":
      return <AgendaSheet sheet={sheet} close={close} ctx={ctx} />;
    case "playerEdit":
      return <PlayerEditSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "techTree":
      return <TechTreeSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "frontier":
      return <FrontierSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "mapTile":
      return <MapTileSheet component={sheet.component} faction={sheet.faction} close={close} ctx={ctx} />;
    case "singularity":
      return <SingularitySheet close={close} ctx={ctx} />;
    case "baal":
      return <BaalSheet close={close} ctx={ctx} />;
    case "law":
      return <LawSheet agenda={sheet.agenda} close={close} ctx={ctx} />;
    case "gift":
      return <GiftSheet close={close} ctx={ctx} />;
    case "strategySwap":
      return <SwapSheet by={sheet.by} arbiter={sheet.arbiter} close={close} ctx={ctx} />;
    case "statusAbility":
      return <StatusAbilitySheet ability={sheet.ability} close={close} ctx={ctx} />;
    case "agendaCard":
      return <AgendaCardSheet card={sheet.card} close={close} ctx={ctx} />;
    case "setupChoice":
      return <SetupChoiceSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "unlock":
      return <UnlockSheet close={close} ctx={ctx} />;
    case "seat":
      return <DeviceSheet close={close} setSeat={setSeat} prefs={prefs} setPrefs={setPrefs} wide={wide} {...ctx} />;
    case "claim": {
      const list = claimablePlanets(planets, sheet.faction, currentTurn)
        .filter((p) => !sheet.peace || p.id !== "Mecatol Rex")
        .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(!!a.owner) - Number(!!b.owner) || a.name.localeCompare(b.name));
      return (
        <KitSheet title={sheet.peace ? `${short(sheet.faction)}: Peace Accords` : `${short(sheet.faction)} takes control of…`} close={close}>
          {sheet.peace ? <p className={kit.sub}>A planet next to one Xxcha controls, other than Mecatol Rex.</p> : null}
          <input className={kit.search} id="play-planet-search" type="search" placeholder="Find a planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a planet" />
          <Rows>
            {list.slice(0, 80).map((p) => (
              <RowAction key={p.id} verb="Take" disabled={w.pending} title={p.name} detail={p.owner ? `${short(p.owner)}'s` : undefined}
                end={<span className={kit.num}>{p.resources}/{p.influence}</span>}
                onClick={async () => {
                  if (await w.write([Events.ClaimPlanetEvent(sheet.faction, p.id)], `${short(sheet.faction)} took control of ${p.name}${p.owner ? ` from ${short(p.owner)}` : ""}`, sheet.faction)) close();
                }} />
            ))}
          </Rows>
        </KitSheet>
      );
    }
    case "pass":
      return <PassSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "gameSettings":
      return <GameSettingsSheet close={close} ctx={ctx} />;
    case "results":
      return <ResultsSheet close={close} ctx={ctx} />;
    case "skip":
      return <SkipTurnSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "puppets":
      return <PuppetsSheet faction={sheet.faction} close={close} ctx={ctx} />;
    case "card": {
      const c = strategyCards[sheet.card];
      const picker = sheet.pickFor;
      const canPick = !!picker && !!c && !c.faction && !c.invalid;
      const giving = canPick && !!checksAndBalances?.passed;
      const targets = giving ? checksAndBalancesTargets(Object.values(strategyCards).filter((x): x is StrategyCard => !!x), order, picker) : [];
      const pick = async (target: FactionId) => {
        if (!picker || !c) return;
        const label = target === picker ? `${short(picker)} picked ${c.name}` : `${short(picker)} gave ${c.name} to ${short(target)}`;
        if (await w.write([Events.AssignStrategyCardEvent(target, c.id, picker)], label, picker)) { setTo(undefined); close(); }
      };
      return (
        <KitSheet title={c?.name ?? sheet.card} close={close}>
          {c ? <div><CardTag card={c} used={!!c.faction || !!c.invalid} large still /></div> : null}
          <p className={kit.eyebrow}><span>Primary</span></p><p style={{ whiteSpace: "pre-line", margin: 0 }}>{c?.primary}</p>
          <p className={kit.eyebrow}><span>Secondary</span></p><p style={{ whiteSpace: "pre-line", margin: 0 }}>{c?.secondary}</p>
          {canPick && !giving ? (
            <Button kind="primary" size="tall" block disabled={w.pending} onClick={() => pick(picker)}>
              {picker === ctx.seat ? `Pick ${c.name}` : `Pick ${c.name} for ${short(picker)}`}
            </Button>
          ) : null}
          {giving ? (
            <div className={kit.section}>
              <Choices label="Checks and Balances: who gets it?" value={to} onChange={(v) => setTo(v as FactionId)}
                options={targets.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> }))} />
              {to ? (
                <>
                  <p className={kit.confirm}>{to === picker ? `${short(picker)} keeps ${c.name}, since nobody else has room for a card.` : `${short(picker)} gives ${c.name} to ${short(to)}.`}</p>
                  <Button kind="primary" size="tall" block disabled={w.pending} onClick={() => pick(to)}>Confirm</Button>
                </>
              ) : null}
            </div>
          ) : null}
        </KitSheet>
      );
    }
    case "player":
      return <PlayerSheet faction={sheet.faction} close={close} ctx={ctx} />;
  }
}
