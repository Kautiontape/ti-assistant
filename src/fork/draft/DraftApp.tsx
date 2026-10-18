"use client";
// /draft/[draftId]: the live Milty draft. Every phone sees the same draft;
// anyone can pick for whoever is up, the way /play lets anyone help.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FactionIcon from "../../components/FactionIcon/FactionIcon";
import GameMap from "../../components/Map/GameMap";
import { getDefaultMapString, getFactionSystemNumber } from "../../util/map";
import { Optional } from "../../util/types/types";
import styles from "../play/play.module.scss";
import { cx, SheetFrame } from "../play/ui";
import { buildMapString, holdings, newSeed, pickerAt, pickFactions, sliceStats, toPixel, wedges, type Draft, type PickKind, type TileInfo, type Wedges } from "./milty";
import { draftableFactions, makeSlices } from "./NewDraft";
import { useBase, useDraft, useDraftApi } from "./useDraft";

const POSITIONS = ["Speaker", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const WORMHOLE: Record<string, string> = { ALPHA: "α", BETA: "β", GAMMA: "γ", DELTA: "δ", EPSILON: "ε" };
const SKIP: Record<string, string> = { red: "R", blue: "B", green: "G", yellow: "Y" };
type View = "slice" | "faction" | "position" | "map";
type Sheet = { kind: "me" } | { kind: PickKind; value: number | string };

function useMe(id: string) {
  const key = `draft-me-${id}`;
  const [me, setMeState] = useState<Optional<number>>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { try { const v = localStorage.getItem(key); setMeState(v === null ? undefined : Number(v)); } catch {} setLoaded(true); }, [key]);
  const setMe = (v: Optional<number>) => { setMeState(v); try { v === undefined ? localStorage.removeItem(key) : localStorage.setItem(key, String(v)); } catch {} };
  return [me, setMe, loaded] as const;
}

export default function DraftApp({ id }: { id: string }) {
  const { draft, missing, error } = useDraft(id);
  if (error) {
    return (
      <div className={styles.root}><main className={styles.main}>
        <section className={styles.card}><h2 className={styles.title}>The draft couldn't be read</h2>
          <p className={styles.sub}>The server refused to send it. On a new install this usually means the Firestore rules for drafts haven't been deployed yet (docs/ktn/ci-cd.md).</p>
          <Link className={cx(styles.btn, styles.block)} href="/draft">Make or join a draft</Link></section>
      </main></div>
    );
  }
  if (missing) {
    return (
      <div className={styles.root}><main className={styles.main}>
        <section className={styles.card}><h2 className={styles.title}>No draft with the code {id}</h2>
          <Link className={cx(styles.btn, styles.block)} href="/draft">Make or join a draft</Link></section>
      </main></div>
    );
  }
  if (!draft) return <div className={styles.root}><main className={styles.main}><p className={styles.sub}>Loading the draft…</p></main></div>;
  return <Live draft={draft} />;
}

function Live({ draft: d }: { draft: Draft }) {
  const router = useRouter();
  const base = useBase();
  const api = useDraftApi(d.id);
  const [me, setMe, meLoaded] = useMe(d.id);
  const [helping, setHelping] = useState<Optional<number>>();
  const [view, setView] = useState<View>("slice");
  const [sheet, setSheet] = useState<Optional<Sheet>>();
  const n = d.players.length;
  const nameOf = (p: Optional<number>) => (p === undefined ? "Someone" : d.players[p] || `Player ${p + 1}`);
  const fname = (f: string) => base.factions[f]?.shortname ?? f;
  const up = pickerAt(d.order, d.picks.length);
  const done = up === undefined;
  const acting = up !== undefined && (up === me || up === helping) ? up : undefined;
  const w = wedges(getDefaultMapString(n, "standard", d.expansions.includes("THUNDERS EDGE")));
  const took = (kind: PickKind, value: number | string) => d.picks.find((p) => p.kind === kind && p.value === value)?.player;

  // Helping is for one pick: it ends when the pick count moves.
  useEffect(() => setHelping(undefined), [d.picks.length]);

  // First time on a phone: ask who's holding it (once the stored answer has loaded).
  useEffect(() => { if (meLoaded && me === undefined && !done) setSheet((s) => s ?? { kind: "me" }); }, [meLoaded, me, done]);

  const last = d.picks.at(-1);
  const describe = (kind: PickKind, value: number | string) => kind === "slice" ? `Slice ${Number(value) + 1}` : kind === "faction" ? fname(String(value)) : `${POSITIONS[Number(value)]} position`;

  async function pick(kind: PickKind, value: number | string) {
    if (acting === undefined) return;
    const ok = await api.act({ action: "pick", seen: d.picks.length, player: acting, kind, value, ...(me !== undefined ? { by: me } : {}) },
      `${nameOf(acting)} took ${describe(kind, value)}${me !== undefined && me !== acting ? " (you picked for them)" : ""}`);
    if (ok) setSheet(undefined);
  }
  async function openGame(gameId: string) {
    const faction = me !== undefined ? holdings(d.picks, me).faction : undefined;
    if (faction) try { localStorage.setItem(`play-seat-${gameId}`, faction); } catch {}
    router.push(`/play/${gameId}`);
  }
  async function reroll() {
    const seed = newSeed();
    const g = makeSlices(base, d.expansions, d.slices.length, d.limits, seed);
    if ("error" in g) { api.say(g.error, true); return; }
    await api.act({ action: "reroll", seen: 0, slices: g.slices, factions: pickFactions(draftableFactions(base.factions, d.expansions), d.factions.length, seed), order: d.order, seed }, "New slices and factions");
  }

  const mine = me !== undefined ? holdings(d.picks, me) : undefined;
  const need = acting !== undefined ? (["slice", "faction", "position"] as PickKind[]).filter((k) => holdings(d.picks, acting)[k] === undefined) : [];

  return (
    <div className={styles.root}>
      <header className={styles.top}>
        <div className={styles.phase}>
          <span className={styles.phaseName}>Milty draft</span>
          <span className={styles.round}>{done ? "All picked" : `Pick ${d.picks.length + 1} of ${n * 3}`}</span>
        </div>
        <div className={styles.turn}>{!done ? <span className={cx(styles.pill, styles.pillNow)}>Up: {nameOf(up)}</span> : null}</div>
        <button className={styles.seatBtn} onClick={() => setSheet({ kind: "me" })} aria-label="Change who you are">
          <span><small>You</small><b>{me !== undefined ? nameOf(me) : "Watching"}</b></span>
        </button>
      </header>

      <main className={cx(styles.main, styles.split)}>
        <div className={styles.col}>
          {d.gameId ? (
            <section className={cx(styles.card, styles.hero)} aria-label="Game ready">
              <p className={styles.eyebrow}><span>Draft done</span></p>
              <h2 className={styles.title}>The game is ready</h2>
              <p className={styles.sub}>Game code <b className={styles.num}>{d.gameId}</b></p>
              <p className={styles.sub}>Setup (starting technologies and the like) happens on the table screen. Then everyone plays from their phone.</p>
              <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} onClick={() => openGame(d.gameId!)}>Open the game{mine?.faction ? ` as ${fname(mine.faction)}` : ""}</button>
              <Link className={cx(styles.btn, styles.block)} href={`/game/${d.gameId}/main`}>Open the table screen</Link>
            </section>
          ) : done ? (
            <section className={cx(styles.card, styles.hero)} aria-label="Everyone has picked">
              <p className={styles.eyebrow}><span>Draft done</span></p>
              <h2 className={styles.title}>Everyone has picked</h2>
              <p className={styles.sub}>Creating the game builds the map from the slices and seats everyone by position, speaker first.</p>
              <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={api.pending} onClick={() => api.act({ action: "start" })}>{d.creating ? "Creating the game…" : "Create the game"}</button>
            </section>
          ) : acting !== undefined ? (
            <section className={cx(styles.card, styles.hero)} aria-label="Your pick">
              {acting !== me ? <div className={styles.banner}><span className={styles.grow}>You're picking for <b>{nameOf(acting)}</b>.</span><button className={cx(styles.btn, styles.smallBtn)} onClick={() => setHelping(undefined)}>Stop</button></div> : null}
              <p className={styles.eyebrow}><span>{acting === me ? "Your pick" : `${nameOf(acting)}'s pick`}</span></p>
              <h2 className={styles.title}>Take a {need.join(", a ").replace(/, a ([^,]*)$/, " or a $1")}</h2>
              <div className={styles.seg} role="group" aria-label="What to pick">
                {need.map((k) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{k === "slice" ? "Slices" : k === "faction" ? "Factions" : "Positions"}</button>)}
              </div>
            </section>
          ) : (
            <section className={styles.card} aria-label="Up now">
              <p className={styles.eyebrow}><span>Picking now</span></p>
              <h2 className={styles.title}>{nameOf(up)}</h2>
              <p className={styles.sub}>Then {nameOf(pickerAt(d.order, d.picks.length + 1))}.</p>
              <button className={cx(styles.btn, styles.help, styles.block)} onClick={() => setHelping(up)}>Pick for {nameOf(up)}</button>
            </section>
          )}

          <div className={styles.seg} role="group" aria-label="Show">
            {(["slice", "faction", "position", "map"] as View[]).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === "slice" ? "Slices" : v === "faction" ? "Factions" : v === "position" ? "Positions" : "Map"}</button>)}
          </div>
          {view === "slice" ? (
            <section className={styles.card} aria-label="Slices">
              <p className={styles.eyebrow}><span>Slices</span><span>Optimal res / inf</span></p>
              <div className={styles.slices}>
                {d.slices.map((tiles, i) => {
                  const owner = took("slice", i);
                  const st = sliceStats(tiles.map(base.info));
                  const homeFaction = owner !== undefined ? holdings(d.picks, owner).faction : undefined;
                  return (
                    <button key={i} className={styles.slice} data-taken={owner !== undefined || undefined} onClick={() => setSheet({ kind: "slice", value: i })} aria-label={`Slice ${i + 1}`}>
                      <b>Slice {i + 1}</b>
                      <SliceArt tiles={tiles} w={w} size={22} home={homeFaction ? getFactionSystemNumber({ id: homeFaction as FactionId }) : undefined} />
                      <span className={styles.num}>{st.optimal.resources} / {st.optimal.influence}</span>
                      <span className={styles.sub} style={{ fontSize: "0.78rem" }}>{badges(st)}</span>
                      {owner !== undefined ? <span className={styles.pill}>{nameOf(owner)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          {view === "faction" ? (
            <section className={styles.card} aria-label="Factions">
              <p className={styles.eyebrow}><span>Factions</span><span>{d.factions.length}</span></p>
              <div>
                {d.factions.map((f) => {
                  const owner = took("faction", f);
                  return (
                    <button key={f} className={styles.opt} disabled={owner !== undefined && acting !== undefined} onClick={() => setSheet({ kind: "faction", value: f })}>
                      <FactionIcon factionId={f as FactionId} size={26} /><b>{base.factions[f]?.name ?? f}</b>
                      <span className={styles.meta}>{owner !== undefined ? nameOf(owner) : ""}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          {view === "position" ? (
            <section className={styles.card} aria-label="Positions">
              <p className={styles.eyebrow}><span>Positions</span><span>Speaker, then clockwise</span></p>
              <div>
                {Array.from({ length: n }, (_, pos) => {
                  const owner = took("position", pos);
                  return (
                    <button key={pos} className={styles.opt} disabled={owner !== undefined && acting !== undefined} onClick={() => setSheet({ kind: "position", value: pos })}>
                      <b>{POSITIONS[pos]}</b><span className={styles.sub}>{pos === 0 ? "Speaker in round 1, seat at the top of the map" : `Seat ${pos + 1}, clockwise from the speaker`}</span>
                      <span className={styles.meta}>{owner !== undefined ? nameOf(owner) : ""}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          {view === "map" ? <MapPreview d={d} w={w} fname={fname} nameOf={nameOf} /> : null}
        </div>

        <div className={styles.col}>
          <section className={styles.card} aria-label="Picks">
            <p className={styles.eyebrow}><span>Draft order</span><span>Snake</span></p>
            <ul className={styles.list}>
              {d.order.map((p, k) => {
                const h = holdings(d.picks, p);
                return (
                  <li key={p}>
                    <span className={cx(styles.num, styles.sub)}>{k + 1}</span>
                    <span className={styles.grow}><b>{nameOf(p)}</b>{p === me ? <span className={styles.sub}> (you)</span> : null}<br />
                      <span className={styles.sub}>{[h.slice !== undefined ? `Slice ${h.slice + 1}` : null, h.faction ? fname(h.faction) : null, h.position !== undefined ? POSITIONS[h.position] : null].filter(Boolean).join(" · ") || "Nothing yet"}</span>
                    </span>
                    {p === up ? <span className={cx(styles.pill, styles.pillNow)}>Picking</span> : null}
                  </li>
                );
              })}
            </ul>
            {last && !d.gameId ? (
              <button className={cx(styles.btn, styles.block)} disabled={api.pending || !!d.creating} onClick={() => api.act({ action: "undo", seen: d.picks.length }, `Undid: ${nameOf(last.player)} took ${describe(last.kind, last.value)}`)}>
                Undo: {nameOf(last.player)} took {describe(last.kind, last.value)}
              </button>
            ) : null}
            {!d.picks.length ? <button className={cx(styles.btn, styles.block)} disabled={api.pending} onClick={reroll}>New slices and factions<small>Only before the first pick</small></button> : null}
            <p className={styles.sub}>Draft code <b className={styles.num}>{d.id}</b>. Others join at /draft with this code.</p>
          </section>
        </div>
      </main>

      {api.toast ? (
        <div className={cx(styles.toast, api.toast.error && styles.toastError)} role="status"><span>{api.toast.text}</span></div>
      ) : null}

      {sheet?.kind === "me" ? (
        <SheetFrame title="Who's holding this phone?" close={() => setSheet(undefined)}>
          <div>
            {d.players.map((_, p) => (
              <button key={p} className={styles.opt} aria-pressed={me === p} onClick={() => { setMe(p); setSheet(undefined); }}><b>{nameOf(p)}</b><span className={styles.meta}>{me === p ? "You" : ""}</span></button>
            ))}
            <button className={styles.opt} onClick={() => { setMe(undefined); setSheet(undefined); }}><b>Just watching</b></button>
          </div>
        </SheetFrame>
      ) : sheet ? (
        <PickSheet d={d} sheet={sheet} w={w} acting={acting} owner={took(sheet.kind, sheet.value)} nameOf={nameOf} fname={fname} pending={api.pending}
          close={() => setSheet(undefined)} pick={() => pick(sheet.kind, sheet.value)} />
      ) : null}
    </div>
  );
}

function badges(st: ReturnType<typeof sliceStats>) {
  return [
    st.skips.map((s) => SKIP[s] ?? s).join(""),
    st.legendary ? "★".repeat(st.legendary) : "",
    st.wormholes.map((x) => WORMHOLE[x] ?? x).join(""),
    st.anomalies ? `${st.anomalies} anomal${st.anomalies > 1 ? "ies" : "y"}` : "",
  ].filter(Boolean).join(" · ") || "No skips or wormholes";
}

// The slice as it sits on the map: the home at the bottom, the centre above.
function SliceArt({ tiles, w, size, home }: { tiles: string[]; w: Wedges; size: number; home?: string }) {
  const cells = [{ c: [0, 0, 0] as [number, number, number], id: home, isHome: true }, ...w.canonical.map((c, j) => ({ c, id: tiles[j], isHome: false }))]
    .map((x) => ({ ...x, ...toPixel([-x.c[0], -x.c[1], -x.c[2]], size) }));
  const hw = size, hh = (Math.sqrt(3) / 2) * size;
  const minX = Math.min(...cells.map((p) => p.x)) - hw, maxX = Math.max(...cells.map((p) => p.x)) + hw;
  const minY = Math.min(...cells.map((p) => p.y)) - hh, maxY = Math.max(...cells.map((p) => p.y)) + hh;
  return (
    <div className={styles.sliceArt} style={{ width: maxX - minX, height: maxY - minY }} aria-hidden="true">
      {cells.map((p, k) => p.id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={`/images/systems/ST_${p.id}.png`} alt="" style={{ left: p.x - hw - minX, top: p.y - hh - minY, width: 2 * hw, height: 2 * hh }} />
      ) : (
        <span key={k} className={styles.hexHome} style={{ left: p.x - hw - minX, top: p.y - hh - minY, width: 2 * hw, height: 2 * hh }}>{p.isHome ? "Home" : ""}</span>
      ))}
    </div>
  );
}

function PickSheet({ d, sheet, w, acting, owner, nameOf, fname, pending, close, pick }: {
  d: Draft; sheet: { kind: PickKind; value: number | string }; w: Wedges; acting: Optional<number>; owner: Optional<number>;
  nameOf: (p: Optional<number>) => string; fname: (f: string) => string; pending: boolean; close: () => void; pick: () => void;
}) {
  const base = useBase();
  const { kind, value } = sheet;
  const can = acting !== undefined && owner === undefined && holdings(d.picks, acting)[kind] === undefined;
  const title = kind === "slice" ? `Slice ${Number(value) + 1}` : kind === "faction" ? base.factions[String(value)]?.name ?? String(value) : `${POSITIONS[Number(value)]} position`;
  const sentence = acting === undefined ? "" : kind === "slice" ? `${nameOf(acting)} takes Slice ${Number(value) + 1}?` : kind === "faction" ? `${nameOf(acting)} plays ${fname(String(value))}?` : Number(value) === 0 ? `${nameOf(acting)} takes the speaker position?` : `${nameOf(acting)} sits ${POSITIONS[Number(value)]}, clockwise from the speaker?`;
  const tiles = kind === "slice" ? d.slices[Number(value)]! : [];
  return (
    <SheetFrame title={title} close={close}>
      {kind === "slice" ? (
        <>
          <SliceArt tiles={tiles} w={w} size={40} />
          <ul className={styles.list}>
            {tiles.map((t) => <TileRow key={t} info={base.info(t)} planets={(base.systems[t]?.planets ?? []).map((pid) => base.planets[pid]).filter((p): p is NonNullable<typeof p> => !!p)} />)}
          </ul>
          <p className={styles.sub}>Optimal {sliceStats(tiles.map(base.info)).optimal.resources} resources, {sliceStats(tiles.map(base.info)).optimal.influence} influence. Total {sliceStats(tiles.map(base.info)).total.resources} / {sliceStats(tiles.map(base.info)).total.influence}.</p>
        </>
      ) : kind === "faction" ? (
        <div className={styles.row}><FactionIcon factionId={String(value) as FactionId} size={40} /><span className={styles.sub}>{base.factions[String(value)]?.expansion === "BASE" ? "Base game" : base.factions[String(value)]?.expansion}</span></div>
      ) : null}
      {owner !== undefined ? <p className={styles.sub}>{nameOf(owner)} has this.</p>
        : can ? (
          <>
            <p className={styles.title} style={{ fontWeight: 400 }}>{sentence}</p>
            <button className={cx(styles.btn, styles.primary, styles.tall, styles.block)} disabled={pending} onClick={pick}>Take it</button>
          </>
        ) : acting !== undefined ? <p className={styles.sub}>{nameOf(acting)} already has a {kind}.</p> : null}
    </SheetFrame>
  );
}

function TileRow({ info, planets }: { info: TileInfo; planets: { name: string; resources: number; influence: number; attributes?: string[] }[] }) {
  return (
    <li>
      <span className={styles.grow}>
        <b>{planets.map((p) => p.name).join(", ") || (info.wormholes.length ? `${info.wormholes.map((x) => x.toLowerCase()).join(" and ")} wormhole` : "No planets")}</b>
        <br /><span className={styles.sub}>{[info.red ? (info.anomaly ? "Red, anomaly" : "Red") : "Blue", info.wormholes.length && planets.length ? `${info.wormholes.map((x) => x.toLowerCase()).join(", ")} wormhole` : "", info.skips.length ? `${info.skips.join(", ")} skip` : "", info.legendary ? "legendary" : "", `tile ${info.id}`].filter(Boolean).join(" · ")}</span>
      </span>
      <span className={styles.num}>{planets.length ? `${info.total.resources}/${info.total.influence}` : ""}</span>
    </li>
  );
}

function MapPreview({ d, w, fname, nameOf }: { d: Draft; w: Wedges; fname: (f: string) => string; nameOf: (p: Optional<number>) => string }) {
  const n = d.players.length;
  const seated = Array.from({ length: n }, (_, pos) => d.players.findIndex((_, p) => holdings(d.picks, p).position === pos));
  const template = getDefaultMapString(n, "standard", d.expansions.includes("THUNDERS EDGE"));
  const withSlices = buildMapString(template, w, seated.map((p) => (p >= 0 && holdings(d.picks, p).slice !== undefined ? d.slices[holdings(d.picks, p).slice!] : undefined)));
  // Homes drawn from the drafted factions; a seat nobody holds yet stays empty.
  const factionAt = seated.map((p) => (p >= 0 ? holdings(d.picks, p).faction : undefined));
  const mapString = withSlices.split(" ").map((t) => { const m = t.match(/^P(\d)$/); if (!m) return t; const f = factionAt[Number(m[1]) - 1]; return f ? getFactionSystemNumber({ id: f as FactionId }) : "0"; }).join(" ");
  return (
    <section className={styles.card} aria-label="Map">
      <p className={styles.eyebrow}><span>Map so far</span><span>Speaker at the top</span></p>
      <div className={styles.board}><div className={styles.boardInner} style={{ cursor: "default" }}>
        <GameMap mapString={mapString} mapStyle="standard" factions={factionAt.map((f) => (f ? { id: f as FactionId } : {}))} expansions={d.expansions as Expansion[]} hideLegend hideFracture />
      </div></div>
      <ul className={styles.list}>
        {seated.map((p, pos) => (
          <li key={pos}><b>{POSITIONS[pos]}</b><span className={styles.meta}>{p >= 0 ? [nameOf(p), holdings(d.picks, p).faction ? fname(holdings(d.picks, p).faction!) : null, holdings(d.picks, p).slice !== undefined ? `Slice ${holdings(d.picks, p).slice! + 1}` : null].filter(Boolean).join(" · ") : "Open"}</span></li>
        ))}
      </ul>
    </section>
  );
}
