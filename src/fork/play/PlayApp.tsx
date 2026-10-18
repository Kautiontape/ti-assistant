"use client";
// The fork's phone-first player screen (/[locale]/play/[gameId]). See the
// "Interface design" note in Trilium and prototype/play for the design.
// Strings are English and live in fork code, so upstream's message files stay untouched.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActionLog, useAgenda, useCurrentTurn, useGameId, usePlanets, useStrategyCards } from "../../context/dataHooks";
import { useFactions, usePassedFactionIds } from "../../context/factionDataHooks";
import { useActiveFactionId, useOrderedFactionIds } from "../../context/gameDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useGameState } from "../../context/stateDataHooks";
import { Events } from "../../util/api/events";
import { getStrategyCardsForFaction } from "../../util/helpers";
import { actorOf, checksAndBalancesTargets, claimablePlanets, groupKey, newestGroup, pointsBySource, sentence, subjectOf, turnOwners } from "./logic";
import { ActionLog, Optional } from "../../util/types/types";
import styles from "./play.module.scss";
import { useWrite } from "./useWrite";
import NowAction from "./NowAction";
import NowAgenda, { AgendaSheet } from "./NowAgenda";
import NowStatus, { StatusSheet } from "./NowStatus";
import NowStrategy from "./NowStrategy";
import { PHASES, cx, pcolor, useMounted, Swatch, Chip, SheetFrame, type Sheet, type Ctx } from "./ui";

type Tab = "now" | "table" | "log";

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

  // Helping lasts as long as what it was for: the phase, and in turn-based
  // phases the helped player's turn (they may end it from their own phone).
  useEffect(() => setHelping(undefined), [phase]);
  useEffect(() => {
    if ((phase === "ACTION" || phase === "STRATEGY") && helping && helping !== active) setHelping(undefined);
  }, [phase, active, helping]);
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
            {phase === "ACTION" ? <NowAction {...ctx} /> : phase === "STRATEGY" ? <NowStrategy {...ctx} /> : phase === "STATUS" ? <NowStatus {...ctx} /> : phase === "AGENDA" ? <NowAgenda {...ctx} /> : <NotNativeYet phase={phase} gameId={gameId} seat={seat} />}
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
    case "score":
    case "give":
    case "reveal":
      return <StatusSheet sheet={sheet} close={close} ctx={ctx} />;
    case "agenda":
    case "vote":
    case "resolve":
      return <AgendaSheet sheet={sheet} close={close} ctx={ctx} />;
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
