"use client";
// /draft/tf/[draftId]: the live Twilight's Fall draft. Every phone sees the
// same draft. In turn-based steps anyone can pick for whoever is up, as in
// /play. In secret steps a phone picks for its own player; picking for someone
// else shows their cards, so it asks first.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FactionIcon from "../../components/FactionIcon/FactionIcon";
import GameMap from "../../components/Map/GameMap";
import { getFactionSystemNumber } from "../../util/map";
import { Optional } from "../../util/types/types";
import { sliceStats, toPixel } from "../draft/milty";
import { useBase } from "../draft/useDraft";
import styles from "../play/play.module.scss";
import { Button, Choices, cx, kit, RowAction, RowLink, Rows, Sheet, Swatch, Tag, rootAttrs, useDevicePrefs } from "../ui/kit";
import { KELERES, PRIORITY } from "./cards";
import { holding, kingOf, presetOf, status, type SecretStep, type SnakeKind, type TfDraft } from "./draft";
import { layoutFor, STYLE_NAMES, type Layout } from "./layouts";
import { KIND_NAMES, runThrough, stepName } from "./text";
import tf from "./tfdraft.module.scss";
import { useHand, useMe, useTfApi, useTfDraft, type Hand } from "./useTfDraft";

const SEATS = ["Seat 1", "Seat 2", "Seat 3", "Seat 4", "Seat 5", "Seat 6", "Seat 7", "Seat 8"];
type View = "slice" | "seat" | "pack" | "king" | "map";
type SheetState = { kind: "me" } | { kind: "peek"; player: number } | { kind: SnakeKind; value: number | string };

function Shell({ children }: { children: React.ReactNode }) {
  const { prefs } = useDevicePrefs();
  return <div className={cx(kit.root, styles.root)} {...rootAttrs(prefs)}><main className={styles.main}>{children}</main></div>;
}

export default function TfDraftApp({ id }: { id: string }) {
  const { draft, missing, error, milty } = useTfDraft(id);
  if (error) return <Shell><section className={kit.card}><h2 className={kit.title}>The draft couldn&apos;t be read</h2><p className={kit.sub}>The server refused to send it. On a new install this usually means the Firestore rules for drafts haven&apos;t been deployed yet (docs/ktn/ci-cd.md).</p><Rows><RowLink href="/draft/tf" title="Make or join a Twilight's Fall draft" /></Rows></section></Shell>;
  if (milty) return <Shell><section className={kit.card}><h2 className={kit.title}>{id} is a Milty draft</h2><Rows><RowLink href={`/draft/${id}`} title="Open the Milty draft" /></Rows></section></Shell>;
  if (missing) return <Shell><section className={kit.card}><h2 className={kit.title}>No draft with the code {id}</h2><Rows><RowLink href="/draft/tf" title="Make or join a Twilight's Fall draft" /></Rows></section></Shell>;
  if (!draft) return <Shell><p className={kit.sub}>Loading the draft…</p></Shell>;
  return <Live d={draft} />;
}

function Live({ d }: { d: TfDraft }) {
  const router = useRouter();
  const { prefs } = useDevicePrefs();
  const base = useBase();
  const api = useTfApi(d.id);
  const [me, setMe, meLoaded] = useMe(d.id);
  const [helping, setHelping] = useState<Optional<number>>();
  const [peek, setPeek] = useState<Optional<number>>();
  const [view, setView] = useState<View>("slice");
  const [sheet, setSheet] = useState<Optional<SheetState>>();
  const n = d.players.length;
  const layout = layoutFor(d.style, n);
  const s = status(d);
  const step = s.step;
  const nameOf = (p: Optional<number>) => (p === undefined ? "Someone" : d.players[p] || `Player ${p + 1}`);
  const fname = (f: Optional<string>) => (f ? base.factions[f]?.name ?? f : "");
  const secret = step?.type === "secret" ? step.id : undefined;
  // Who this phone is picking for now.
  const acting = secret !== undefined ? (peek ?? me) : s.up !== undefined && (s.up === me || s.up === helping) ? s.up : undefined;
  const myHand = useHand(d.id, me, d.log.length);
  const theirHand = useHand(d.id, acting !== undefined && acting !== me ? acting : undefined, d.log.length);
  const hand = acting === me ? myHand : theirHand;
  const kinds: View[] = ["slice", ...(d.style === "nucleus" ? ["seat" as const] : []), ...(d.packs.length ? ["pack" as const] : []), "king", "map"];

  // Helping lasts one pick; it ends when the draft moves on. Picking in secret
  // for someone else lasts until their pick is in: others picking at the same
  // time mustn't switch this phone back to its own cards.
  useEffect(() => setHelping(undefined), [d.log.length]);
  const peekDone = peek !== undefined && s.ready.includes(peek);
  useEffect(() => setPeek(undefined), [step?.id, peekDone]);
  useEffect(() => { if (meLoaded && me === undefined && step) setSheet((x) => x ?? { kind: "me" }); }, [meLoaded, me, step]);
  // Once everyone has picked, the finished map is what people want to see.
  const finished = !step;
  useEffect(() => { if (finished) setView("map"); }, [finished]);

  const by = me !== undefined && me !== acting ? { by: me } : {};
  const forThem = me !== undefined && acting !== undefined && me !== acting ? " (you picked for them)" : "";
  async function pick(kind: SnakeKind, value: number | string) {
    if (acting === undefined) return;
    const ok = await api.act({ action: "pick", seen: d.log.length, player: acting, kind, value, ...by }, `${nameOf(acting)} took ${describe(kind, value)}${forThem}`);
    if (ok) setSheet(undefined);
  }
  async function pickSecret(stepId: SecretStep, value: string) {
    if (acting === undefined) return;
    await api.act({ action: "secret", player: acting, step: stepId, value, ...by }, stepId.startsWith("cards") ? `${nameOf(acting)} kept a card${forThem}` : `${nameOf(acting)} picked${forThem}. It's shown when everyone has picked.`);
  }
  async function pickHome(value: string) {
    if (acting === undefined) return;
    await api.act({ action: "home", seen: d.log.length, player: acting, value, ...by }, `${nameOf(acting)} takes the ${fname(value)} home system${forThem}`);
  }
  function describe(kind: SnakeKind, value: number | string) {
    return kind === "slice" ? `Slice ${Number(value) + 1}` : kind === "seat" ? SEATS[Number(value)]! : kind === "pack" ? `Pack ${Number(value) + 1}` : fname(String(value));
  }
  function openGame(gameId: string) {
    const king = me !== undefined ? kingOf(d, me) : undefined;
    if (king) try { localStorage.setItem(`play-seat-${gameId}`, king); } catch {}
    router.push(`/play/${gameId}`);
  }
  const took = (kind: SnakeKind, value: number | string): Optional<number> => { const e = d.log.find((x) => x.kind === kind && "value" in x && x.value === value); return e && "player" in e ? e.player : undefined; };
  const last = d.log.at(-1);
  const preset = presetOf(d.rules);

  return (
    <div className={cx(kit.root, styles.root)} {...rootAttrs(prefs)} data-log={d.log.length}>
      <header className={styles.top}>
        <div className={styles.phase}>
          <span className={styles.phaseName}>{stepName(step)}</span>
          <span className={styles.round}>Twilight&apos;s Fall · {STYLE_NAMES[d.style]}</span>
        </div>
        <div className={styles.turn}>{s.up !== undefined ? <Tag tone="now">Up: {nameOf(s.up)}</Tag> : secret ? <Tag tone="now">{s.ready.length} of {n} picked</Tag> : null}</div>
        <button className={styles.seatBtn} onClick={() => setSheet({ kind: "me" })} aria-label="Change who you are">
          <span><small>You</small><b>{me !== undefined ? nameOf(me) : "Watching"}</b></span>
        </button>
      </header>

      <main className={cx(styles.main, styles.split)}>
        <div className={styles.col}>
          {now()}
          {step?.type === "snake" || (step?.id === "kings" && acting !== undefined) || !step ? (
            <Choices label="Show" hideLabel value={view} onChange={setView} options={kinds.map((v) => ({ value: v, label: v === "slice" ? "Slices" : v === "seat" ? "Seats" : v === "pack" ? "Packs" : v === "king" ? "Kings" : "Map" }))} />
          ) : null}
          {(step?.type === "snake" || !step || step.id === "kings") ? pool() : mapPreview()}
        </div>

        <div className={styles.col}>
          {me !== undefined && myHand?.kept.length ? (
            <section className={kit.card} aria-label="Your cards">
              <p className={kit.eyebrow}><span>Your cards</span><span>Only on your phone until shown</span></p>
              <ul className={styles.list}>{myHand.kept.map((c) => <li key={c}><RefCard f={c} name={fname(c)} /><span className={kit.grow} />{roleOf(me, c)}</li>)}</ul>
            </section>
          ) : null}
          <section className={kit.card} aria-label="Players">
            <p className={kit.eyebrow}><span>{s.speaker !== undefined ? "Seats, speaker first" : "Snake order"}</span><span>{preset === "rulebook" ? "Rulebook" : preset === "tidraft" ? "tidraft" : "Mixed rules"}</span></p>
            <ul className={tf.who}>
              {playersInOrder().map(playerRow)}
            </ul>
            {last && !d.gameId ? (
              <Button block disabled={api.pending || !!d.creating} onClick={() => api.act({ action: "undo", seen: d.log.length }, "Undone")}>Undo: {undoLabel()}</Button>
            ) : null}
            <p className={kit.sub}>Draft code <b className={kit.num}>{d.id}</b>. Others join at /draft/tf with this code.</p>
          </section>
          <details className={cx(kit.card, styles.item)}>
            <summary>How this draft runs</summary>
            <ol className={tf.steps}>{runThrough(d.style, d.rules).map(([t, x]) => <li key={t}><b>{t}</b><span>{x}</span></li>)}</ol>
          </details>
        </div>
      </main>

      {api.toast ? <div className={cx(kit.toast, api.toast.error && kit.toastError)} role="status"><span>{api.toast.text}</span></div> : null}

      {sheet?.kind === "me" ? (
        <Sheet title="Who's holding this phone?" close={() => setSheet(undefined)}>
          <Choices list label="Who's holding this phone?" hideLabel value={me === undefined ? "watching" : String(me)}
            onChange={(v) => { setMe(v === "watching" ? undefined : Number(v)); setPeek(undefined); setSheet(undefined); }}
            options={[...d.players.map((_, p) => ({ value: String(p), label: nameOf(p) })), { value: "watching", label: "Nobody: just watching" }]} />
        </Sheet>
      ) : sheet?.kind === "peek" ? (
        <Sheet title={`Pick for ${nameOf(sheet.player)}?`} close={() => setSheet(undefined)}>
          <p className={kit.confirm}>You&apos;ll see {nameOf(sheet.player)}&apos;s cards on this phone. Pick for them?</p>
          <Button kind="primary" size="tall" block forOther onClick={() => { setPeek(sheet.player); setSheet(undefined); }}>Show {nameOf(sheet.player)}&apos;s cards</Button>
        </Sheet>
      ) : sheet ? pickSheet(sheet) : null}
    </div>
  );

  // ---------- pieces (closures over the draft) ----------

  function roleOf(p: number, card: string) {
    if (s.priority[p] === card) return <Tag>Priority</Tag>;
    if (s.homes[p]?.card === card) return <Tag>Home</Tag>;
    if (s.units[p] === card) return <Tag>Starting units</Tag>;
    if (myHand?.staged === card) return <Tag tone="now">Picked</Tag>;
    return null;
  }

  function undoLabel() {
    const e = last!;
    if (e.kind === "units") {
      const before = d.log.filter((x) => x.act === e.act && x.kind !== "units").at(-1);
      return before && "player" in before ? `${nameOf(before.player)}'s last pick` : "the last pick";
    }
    if (e.kind === "reveal") return e.step.startsWith("cards") ? "the last card kept" : `the last ${e.step} pick (hides them again)`;
    if (e.kind === "ready") return `${nameOf(e.player)}'s secret pick`;
    if (e.kind === "home") return `${nameOf(e.player)} took the ${fname(e.value)} home`;
    return `${nameOf(e.player)} took ${describe(e.kind, e.value)}`;
  }

  function playersInOrder() {
    if (s.speaker !== undefined) {
      const sp = s.seatOf[s.speaker]!;
      return Array.from({ length: n }, (_, i) => s.playerAt[(sp + i) % n]!).filter((p) => p !== undefined);
    }
    return d.order;
  }

  function playerRow(p: number) {
    const slice = holding(d.log, p, "slice"), seat = holding(d.log, p, "seat"), pack = holding(d.log, p, "pack"), king = kingOf(d, p);
    const home = s.homes[p];
    const bits = [
      slice !== undefined ? `Slice ${Number(slice) + 1}` : null,
      seat !== undefined ? SEATS[Number(seat)] : d.style !== "nucleus" && s.seatOf[p] !== undefined ? SEATS[s.seatOf[p]!] : null,
      pack !== undefined ? `Pack ${Number(pack) + 1}` : null,
    ].filter(Boolean);
    return (
      <li key={p}>
        <span className={kit.line} style={{ gap: 8 }}>
          {king ? <Swatch faction={king as FactionId} color={base.factions[king]?.color} small /> : null}
          <b>{nameOf(p)}</b>{p === me ? <span className={kit.sub}>(you)</span> : null}
        </span>
        <span className={kit.line} style={{ gap: 6 }}>
          {p === s.speaker ? <Tag>Speaker</Tag> : null}
          {p === s.up ? <Tag tone="now">Picking</Tag> : null}
          {secret && s.ready.includes(p) ? <Tag tone="done">Picked</Tag> : null}
        </span>
        <span className={tf.holds}>
          {bits.length ? <span>{bits.join(" · ")}</span> : null}
          {king ? <span>King <b>{fname(king)}</b></span> : null}
          {s.priority[p] ? <span>Priority <b>{PRIORITY[s.priority[p]!]} {fname(s.priority[p])}</b></span> : null}
          {home ? <span>Home <b>{fname(home.drawn ?? home.card)}</b>{home.drawn ? ` (Keleres drew it)` : ""}</span> : null}
          {s.units[p] ? <span>Units <b>{fname(s.units[p])}</b></span> : null}
          {!bits.length && !king && !s.priority[p] ? <span>Nothing yet</span> : null}
        </span>
      </li>
    );
  }

  function now() {
    if (d.gameId) {
      const king = me !== undefined ? kingOf(d, me) : undefined;
      return (
        <section className={cx(kit.card, styles.hero)} aria-label="Game ready">
          <p className={kit.eyebrow}><span>Draft done</span></p>
          <h2 className={kit.title}>The game is ready</h2>
          <p className={kit.sub}>Game code <b className={kit.num}>{d.gameId}</b>. Its first step is the inaugural splice.</p>
          <Button kind="primary" size="tall" block onClick={() => openGame(d.gameId!)}>Open the game{king ? ` as ${fname(king)}` : ""}</Button>
          <Rows><RowLink href={`/game/${d.gameId}/main`} external title="Open the table screen" /></Rows>
        </section>
      );
    }
    if (!step) {
      return (
        <section className={cx(kit.card, styles.hero)} aria-label="Everyone has picked">
          <p className={kit.eyebrow}><span>Draft done</span></p>
          <h2 className={kit.title}>Everyone has picked</h2>
          <p className={kit.sub}>Creating the game builds the map, seats everyone from the speaker, and gives each King its home system and starting units.</p>
          <Button kind="primary" size="tall" block disabled={api.pending} onClick={() => api.act({ action: "start" })}>{d.creating ? "Creating the game…" : "Create the game"}</Button>
        </section>
      );
    }
    if (step.type === "secret") return secretNow(step.id);
    if (acting === undefined) {
      return (
        <section className={kit.card} aria-label="Up now">
          <p className={kit.eyebrow}><span>{step.id === "home" ? "Picking a home system" : step.id === "kings" ? "Choosing a King" : "Picking now"}</span></p>
          <h2 className={kit.title}>{nameOf(s.up)}</h2>
          <Button forOther block onClick={() => setHelping(s.up)}>Pick for {nameOf(s.up)}</Button>
        </section>
      );
    }
    const banner = acting !== me ? <div className={kit.banner}><span className={kit.grow}>You&apos;re picking for <b>{nameOf(acting)}</b>.</span><Button size="small" onClick={() => setHelping(undefined)}>Stop</Button></div> : null;
    if (step.type === "snake") {
      const need = step.kinds.filter((k) => holding(d.log, acting, k) === undefined);
      return (
        <section className={cx(kit.card, styles.hero)} aria-label="Your pick">
          {banner}
          <p className={kit.eyebrow}><span>{acting === me ? "Your pick" : `${nameOf(acting)}'s pick`}</span></p>
          <h2 className={kit.title}>Take {need.map((k) => KIND_NAMES[k]).join(", ").replace(/, ([^,]*)$/, " or $1")}</h2>
          <p className={kit.sub}>Tap one below to see it, then take it.</p>
        </section>
      );
    }
    if (step.id === "kings") {
      return (
        <section className={cx(kit.card, styles.hero)} aria-label="Choose a King">
          {banner}
          <p className={kit.eyebrow}><span>{acting === me ? "Your turn" : `${nameOf(acting)}'s turn`}</span></p>
          <h2 className={kit.title}>Choose a Mahact King</h2>
          <p className={kit.sub}>The speaker chooses last. Tap a King below to see it.</p>
        </section>
      );
    }
    // Home system, one at a time.
    return (
      <section className={cx(kit.card, styles.hero)} aria-label="Pick a home system">
        {banner}
        <p className={kit.eyebrow}><span>{acting === me ? "Your turn" : `${nameOf(acting)}'s turn`}</span></p>
        <h2 className={kit.title}>Pick a home system</h2>
        <p className={kit.sub}>Show one of your two cards; that faction&apos;s home system is yours. The other card sets your starting units.</p>
        {cardRows(hand, "Use", pickHome, true)}
      </section>
    );
  }

  function secretNow(stepId: SecretStep) {
    const mine = acting !== undefined;
    const waiting = Array.from({ length: n }, (_, p) => p).filter((p) => !s.ready.includes(p));
    const title = stepId === "cards1" ? "Keep 1 of your 3 cards" : stepId === "cards2" ? "Keep 1 of these 2 cards" : stepId === "priority" ? "Pick your priority card" : "Pick your home system";
    const sub = stepId === "cards1" ? `The other 2 go to ${nameOf((acting! + 1) % n)}.`
      : stepId === "cards2" ? `${nameOf((acting! - 1 + n) % n)} passed you these. The other goes to ${nameOf((acting! + 1) % n)}, and you'll get one more.`
      : stepId === "priority" ? (d.style === "nucleus" ? "Lowest number is speaker. Everyone's pick is shown when all have picked." : "Lowest number is speaker, and players sit clockwise in priority order. Shown when all have picked.")
      : "That faction's home system is yours; the other card sets your starting units. Shown when all have picked.";
    return (
      <section className={cx(kit.card, styles.hero)} aria-label={title}>
        {mine && acting !== me ? <div className={kit.banner}><span className={kit.grow}>You&apos;re picking for <b>{nameOf(acting)}</b>.</span><Button size="small" onClick={() => setPeek(undefined)}>Stop</Button></div> : null}
        {mine ? (
          <>
            <p className={kit.eyebrow}><span>{acting === me ? "Your pick" : `${nameOf(acting)}'s pick`}</span><span>In secret</span></p>
            <h2 className={kit.title}>{title}</h2>
            <p className={kit.sub}>{sub}</p>
            {cardRows(hand, stepId.startsWith("cards") ? "Keep" : "Pick", (c) => pickSecret(stepId, c), stepId === "home")}
          </>
        ) : (
          <>
            <p className={kit.eyebrow}><span>Everyone picks in secret</span></p>
            <h2 className={kit.title}>{title.replace("your", "a").replace("Your", "A")}</h2>
          </>
        )}
        <p className={kit.sub}>{waiting.length ? `Waiting for ${waiting.map(nameOf).join(", ")}.` : "Everyone has picked."}</p>
        {waiting.filter((p) => p !== acting).length ? (
          <div className={tf.waiting}>{waiting.filter((p) => p !== acting).map((p) => <Button key={p} size="small" forOther onClick={() => setSheet({ kind: "peek", player: p })}>Pick for {nameOf(p)}</Button>)}</div>
        ) : null}
      </section>
    );
  }

  function cardRows(h: Optional<Hand>, verb: string, onPick: (c: string) => void, home?: boolean) {
    if (!h) return <p className={kit.sub}>Loading the cards…</p>;
    return (
      <Rows flush>
        {h.choose.map((c) => (
          <RowAction key={c} disabled={api.pending} onClick={() => onPick(c)} verb={h.staged === c ? "Picked" : h.staged ? `${verb} instead` : verb}
            lead={home ? homeTile(c) : <span className={tf.prio}>{PRIORITY[c]}</span>}
            title={fname(c)} detail={home ? (c === KELERES ? "Keleres: the app draws a faction no one holds and gives you its home" : `Priority ${PRIORITY[c]}`) : undefined} />
        ))}
      </Rows>
    );
  }

  function homeTile(f: string) {
    const num = f === KELERES ? undefined : getFactionSystemNumber({ id: f as FactionId });
    // eslint-disable-next-line @next/next/no-img-element
    return num ? <img className={tf.homeTile} src={`/images/systems/ST_${num}.png`} alt="" /> : <FactionIcon factionId={f as FactionId} size={36} />;
  }

  function pool() {
    const canTake = (kind: SnakeKind) => acting !== undefined && ((step?.type === "snake" && step.kinds.includes(kind)) || (step?.id === "kings" && kind === "king")) && holding(d.log, acting, kind) === undefined;
    if (view === "map") return mapPreview();
    if (view === "slice") {
      return (
        <section className={kit.card} aria-label="Slices">
          <p className={kit.eyebrow}><span>Slices</span><span>Optimal res / inf</span></p>
          <div className={styles.slices}>
            {d.slices.map((tiles, i) => {
              const owner = took("slice", i);
              const st = sliceStats(tiles.map(base.info));
              return (
                <button key={i} className={styles.slice} data-taken={owner !== undefined || undefined} onClick={() => setSheet({ kind: "slice", value: i })} aria-label={`Slice ${i + 1}`} aria-haspopup="dialog">
                  <b>Slice {i + 1}</b>
                  <SliceArt tiles={tiles} layout={layout} size={20} />
                  <span className={kit.num}>{st.optimal.resources} / {st.optimal.influence}</span>
                  {owner !== undefined ? <Tag>{nameOf(owner)}</Tag> : canTake("slice") ? <Tag tone="now">Open</Tag> : null}
                </button>
              );
            })}
          </div>
        </section>
      );
    }
    if (view === "seat") {
      return (
        <section className={kit.card} aria-label="Seats">
          <p className={kit.eyebrow}><span>Seats</span><span>Clockwise from the top of the map</span></p>
          <Rows flush>{Array.from({ length: n }, (_, i) => { const owner = took("seat", i); return <RowLink key={i} disabled={owner !== undefined && acting !== undefined} onClick={() => setSheet({ kind: "seat", value: i })} title={SEATS[i]} detail={nucleusSeatDetail(i)} end={owner !== undefined ? nameOf(owner) : undefined} />; })}</Rows>
        </section>
      );
    }
    if (view === "pack") {
      return (
        <section className={kit.card} aria-label="Packs">
          <p className={kit.eyebrow}><span>Card packs</span><span>{d.packs.length}</span></p>
          <Rows flush>{d.packs.map((cards, i) => { const owner = took("pack", i); return <RowLink key={i} disabled={owner !== undefined && acting !== undefined} onClick={() => setSheet({ kind: "pack", value: i })} title={`Pack ${i + 1}`} detail={cards.map((c) => `${PRIORITY[c]} ${base.factions[c]?.shortname ?? c}`).join(" · ")} end={owner !== undefined ? nameOf(owner) : undefined} />; })}</Rows>
        </section>
      );
    }
    return (
      <section className={kit.card} aria-label="Kings">
        <p className={kit.eyebrow}><span>Mahact Kings</span><span>{d.kings.length}</span></p>
        <Rows flush>{d.kings.map((k) => { const owner = took("king", k); return <RowLink key={k} disabled={owner !== undefined && acting !== undefined} onClick={() => setSheet({ kind: "king", value: k })} lead={<Swatch faction={k as FactionId} color={base.factions[k]?.color} large />} title={fname(k)} detail={base.factions[k]?.color} end={owner !== undefined ? nameOf(owner) : undefined} />; })}</Rows>
      </section>
    );
  }

  function nucleusSeatDetail(i: number) {
    const tiles = layout.core[i]!.map((at) => d.fixed[layout.fixed.indexOf(at)]!).filter(Boolean);
    const st = sliceStats(tiles.map(base.info));
    return `Centre systems in front: ${st.optimal.resources} / ${st.optimal.influence} optimal`;
  }

  function pickSheet(sh: { kind: SnakeKind; value: number | string }) {
    const { kind, value } = sh;
    const owner = took(kind, value);
    const can = acting !== undefined && owner === undefined && holding(d.log, acting, kind) === undefined && ((step?.type === "snake" && step.kinds.includes(kind)) || (step?.id === "kings" && kind === "king"));
    const title = kind === "slice" ? `Slice ${Number(value) + 1}` : kind === "seat" ? SEATS[Number(value)]! : kind === "pack" ? `Pack ${Number(value) + 1}` : fname(String(value));
    const sentence = acting === undefined ? "" : kind === "king" ? `${nameOf(acting)} plays ${fname(String(value))}?` : `${nameOf(acting)} takes ${title}?`;
    const tiles = kind === "slice" ? d.slices[Number(value)]! : [];
    return (
      <Sheet title={title} close={() => setSheet(undefined)}>
        {kind === "slice" ? (
          <>
            <SliceArt tiles={tiles} layout={layout} size={40} />
            <ul className={styles.list}>{tiles.map((t) => <li key={t}><span className={kit.grow}><b>{(base.systems[t]?.planets ?? []).map((p) => base.planets[p]?.name ?? p).join(", ") || (base.info(t).wormholes.length ? `${base.info(t).wormholes.join(" and ").toLowerCase()} wormhole` : "No planets")}</b><br /><span className={kit.sub}>{[base.info(t).red ? "Red" : "Blue", base.info(t).legendary ? "legendary" : "", base.info(t).skips.length ? `${base.info(t).skips.join(", ")} skip` : "", `tile ${t}`].filter(Boolean).join(" · ")}</span></span><span className={kit.num}>{base.info(t).total.resources}/{base.info(t).total.influence}</span></li>)}</ul>
          </>
        ) : kind === "pack" ? (
          <ul className={styles.list}>{d.packs[Number(value)]!.map((c) => <li key={c}><RefCard f={c} name={fname(c)} /></li>)}</ul>
        ) : kind === "king" ? (
          <div className={kit.line}><Swatch faction={String(value) as FactionId} color={base.factions[String(value)]?.color} large /><span className={kit.sub}>{base.factions[String(value)]?.color} pieces, its own flagship and mech, and the two King technologies.</span></div>
        ) : <p className={kit.sub}>{nucleusSeatDetail(Number(value))}.</p>}
        {owner !== undefined ? <p className={kit.sub}>{nameOf(owner)} has this.</p>
          : can ? (<><p className={kit.confirm}>{sentence}</p><Button kind="primary" size="tall" block disabled={api.pending} onClick={() => pick(kind, value)}>Take it</Button></>)
          : null}
      </Sheet>
    );
  }

  function mapPreview() {
    const tokens = [...layout.template];
    layout.fixed.forEach((at, i) => { tokens[at] = d.fixed[i]!; });
    for (let seat = 0; seat < n; seat++) {
      const p = s.playerAt[seat];
      const slice = p !== undefined ? holding(d.log, p, "slice") : undefined;
      if (slice !== undefined) d.slices[Number(slice)]!.forEach((t, j) => { tokens[layout.slots[seat]![j]!] = t; });
      const home = p !== undefined ? s.homes[p] : undefined;
      const homeFaction = home?.drawn ?? home?.card;
      tokens[layout.homes[seat]!] = homeFaction ? getFactionSystemNumber({ id: homeFaction as FactionId }) : "0";
    }
    return (
      <section className={kit.card} aria-label="Map">
        <p className={kit.eyebrow}><span>Map so far</span><span>{d.style === "nucleus" ? "Seat 1 at the top" : s.speaker !== undefined ? "Speaker at the top" : "Slices go on when priority sets the seats"}</span></p>
        <div className={styles.board}><div className={styles.boardInner} style={{ cursor: "default" }}>
          <GameMap mapString={tokens.join(" ")} mapStyle="standard" factions={[]} expansions={["POK", "THUNDERS EDGE", "TWILIGHTS FALL"] as Expansion[]} hideLegend hideFracture />
        </div></div>
      </section>
    );
  }
}

function RefCard({ f, name }: { f: string; name: string }) {
  return <span className={tf.card}><span className={tf.prio}>{PRIORITY[f]}</span><FactionIcon factionId={f as FactionId} size={22} /><span className={tf.cardName}>{name}</span></span>;
}

// A slice as it sits on the map: the home below, Mecatol Rex above.
function SliceArt({ tiles, layout, size }: { tiles: string[]; layout: Layout; size: number }) {
  const cells = [{ c: [0, 0, 0] as [number, number, number], id: undefined as Optional<string>, home: true }, ...layout.canonical.map((c, j) => ({ c, id: tiles[j], home: false }))]
    .map((x) => ({ ...x, ...toPixel([-x.c[0], -x.c[1], -x.c[2]], size) }));
  const hw = size, hh = (Math.sqrt(3) / 2) * size;
  const minX = Math.min(...cells.map((p) => p.x)) - hw, maxX = Math.max(...cells.map((p) => p.x)) + hw;
  const minY = Math.min(...cells.map((p) => p.y)) - hh, maxY = Math.max(...cells.map((p) => p.y)) + hh;
  return (
    <div className={styles.sliceArt} style={{ width: maxX - minX, height: maxY - minY }} aria-hidden="true">
      {cells.map((p, k) => p.id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={`/images/systems/ST_${p.id}.png`} alt="" style={{ left: p.x - hw - minX, top: p.y - hh - minY, width: 2 * hw, height: 2 * hh }} />
      ) : <span key={k} className={styles.hexHome} style={{ left: p.x - hw - minX, top: p.y - hh - minY, width: 2 * hw, height: 2 * hh }}>{p.home ? "Home" : ""}</span>)}
    </div>
  );
}
