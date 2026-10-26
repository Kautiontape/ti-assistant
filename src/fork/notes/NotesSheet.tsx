"use client";
// A player's private notepad: text, and sketches drawn with a finger or mouse,
// on a blank page or over the map. Only this seat's phones can read it (seat
// key, app/api/fork/notes); it is never part of the game, the log or the export.
import { useRef, useState } from "react";
import GameMap from "../../components/Map/GameMap";
import { useAllPlanets, useOptions, usePlanets } from "../../context/dataHooks";
import { getWormholeNexusSystemNumber } from "../../util/map";
import { getMapString } from "../../util/options";
import { fracturePlanetsOwned } from "../../util/planets";
import type { Ctx } from "../play/ui";
import { Button, Choices, kit, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";
import { LIMITS, PEN_COLORS, pointCount, strokePath, thin, type Notes, type PenColor, type Sketch } from "./model";
import styles from "./notes.module.scss";
import { SeatPanel } from "./SeatPanel";
import { useSeatKey } from "./seatClient";
import { useNotes, type SaveState } from "./useNotes";

const COLOR_VAR: Record<PenColor, string> = { ink: "var(--ink)", red: "var(--p-red)", blue: "var(--p-blue)", green: "var(--p-green)", yellow: "var(--p-yellow)" };
const COLOR_NAME: Record<PenColor, string> = { ink: "Plain", red: "Red", blue: "Blue", green: "Green", yellow: "Yellow" };
const WIDTHS = { fine: 5, bold: 12 } as const;
const PAGE_H = 1000; // pages are square

// The Table tab's way in. Only a phone with a seat sees it.
export function NotesCard({ ctx }: { ctx: Ctx }) {
  if (!ctx.seat) return null;
  return (
    <section className={kit.card} aria-label="Your notes">
      <Rows flush><RowLink onClick={() => ctx.open({ kind: "notes" })} title="Your notes" detail={`Private to ${ctx.short(ctx.seat)}: text and sketches, never in the game log`} /></Rows>
    </section>
  );
}

// Upstream's map, drawn the way the Map tab draws it, with nothing to tap.
function MapPicture({ factions }: { factions: Ctx["factions"] }) {
  const options = useOptions();
  const allPlanets = useAllPlanets();
  const planets = usePlanets();
  const ordered = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition);
  const mapString = getMapString(options, ordered.length);
  if (!mapString) return <p className={kit.sub} style={{ padding: 12 }}>This game has no map string, so there's no map to draw on.</p>;
  return (
    <div className={styles.map} aria-hidden="true">
      <GameMap defaultOverlay="OWNERS" hideLegend factions={ordered} wormholeNexus={getWormholeNexusSystemNumber(options, planets, factions)} mapString={mapString}
        mapStyle={options["map-style"] ?? "standard"} planets={allPlanets} expansions={options.expansions} hideFracture={!fracturePlanetsOwned(allPlanets)} />
    </div>
  );
}

// One page. Strokes are drawn with pointer events (touch, pen, mouse alike) in
// the page's 1000-unit space and saved as vectors.
function SketchPad({ sketch, color, width, factions, onStroke }: { sketch: Sketch; color: PenColor; width: number; factions: Ctx["factions"]; onStroke: (p: number[]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<number[]>();
  const pts = useRef<number[]>([]);
  const at = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * sketch.h)];
  };
  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    svg.current?.setPointerCapture(e.pointerId);
    pts.current = at(e);
    setLive(pts.current.slice());
  };
  const move = (e: React.PointerEvent) => {
    if (!live) return;
    const [x, y] = at(e);
    const p = pts.current;
    if (Math.hypot((x ?? 0) - (p[p.length - 2] ?? 0), (y ?? 0) - (p[p.length - 1] ?? 0)) < 2) return;
    p.push(x ?? 0, y ?? 0);
    setLive(p.slice());
  };
  const up = () => {
    if (!live) return;
    const p = pts.current;
    pts.current = [];
    setLive(undefined);
    onStroke(thin(p));
  };
  return (
    <div className={styles.page}>
      {sketch.map ? <MapPicture factions={factions} /> : null}
      <svg ref={svg} className={styles.ink} viewBox={`0 0 1000 ${sketch.h}`} preserveAspectRatio="none" role="img" aria-label="Drawing area"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {sketch.strokes.map((s, i) => <path key={i} d={strokePath(s.p)} fill="none" stroke={COLOR_VAR[s.c]} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />)}
        {live ? <path d={strokePath(live)} fill="none" stroke={COLOR_VAR[color]} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /> : null}
      </svg>
    </div>
  );
}

const SAVE_TEXT: Record<SaveState, string> = { loading: "Loading your notes…", saved: "Saved", saving: "Saving…", unsaved: "Not saved yet…", offline: "Offline. Your notes are kept on this phone and will save when you're back.", refused: "Not saved" };

const newId = () => Math.random().toString(36).slice(2, 10);

export function NotesSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { gameId, seat, short, factions } = ctx;
  if (!seat) return <KitSheet title="Your notes" close={close}><p className={kit.sub}>Pick your seat first (the button at the top left). Notes belong to a seat.</p><Button kind="primary" block onClick={() => ctx.open({ kind: "seat" })}>Pick a seat</Button></KitSheet>;
  return <SeatNotes close={close} ctx={ctx} seat={seat} gameId={gameId} short={short} factions={factions} />;
}

function SeatNotes({ close, ctx, seat, gameId, short, factions }: { close: () => void; ctx: Ctx; seat: FactionId; gameId: string; short: Ctx["short"]; factions: Ctx["factions"] }) {
  const key = useSeatKey(gameId, seat);
  const ready = key.status === "ready";
  const { notes, edit, state, error, loaded, retry } = useNotes(gameId, seat, ready);
  const [openId, setOpenId] = useState<string>();
  const [color, setColor] = useState<PenColor>("ink");
  const [width, setWidth] = useState<"fine" | "bold">("fine");
  const [confirm, setConfirm] = useState<{ id: string; what: "clear" | "delete" }>();
  const [full, setFull] = useState<string>();
  const open = notes.sketches.find((s) => s.id === openId);

  const change = (id: string, fn: (s: Sketch) => Sketch) => edit((n): Notes => ({ ...n, sketches: n.sketches.map((s) => (s.id === id ? fn(s) : s)) }));
  const add = (map: boolean) => {
    const id = newId();
    edit((n) => ({ ...n, sketches: [...n.sketches, { id, map, h: PAGE_H, strokes: [] }] }));
    setOpenId(id); setConfirm(undefined); setFull(undefined);
  };
  const addStroke = (p: number[]) => {
    if (!open) return;
    if (open.strokes.length >= LIMITS.strokes || pointCount(notes) + p.length / 2 > LIMITS.points) return setFull("This sketch is full. Undo a stroke, clear it, or start another.");
    setFull(undefined);
    change(open.id, (s) => ({ ...s, strokes: [...s.strokes, { c: color, w: WIDTHS[width], p }] }));
  };
  const label = (s: Sketch, i: number) => `${s.map ? "Map sketch" : "Sketch"} ${i + 1}`;

  return (
    <KitSheet title={`Notes for ${short(seat)}`} close={close}>
      <p className={kit.sub}>Only this seat can read these. They are not in the game log, the replay or the download.</p>
      <SeatPanel seatKey={key} short={short} seat={seat} />
      {ready ? (
        <>
          <label className={kit.label} htmlFor="notes-text">Notes</label>
          <textarea id="notes-text" className={styles.text} value={notes.text} disabled={!loaded} maxLength={LIMITS.text} placeholder="Plans, who owes who, what to remember…"
            onChange={(e) => edit((n) => ({ ...n, text: e.target.value }))} />
          <p className={styles.status} data-state={state} role="status" aria-live="polite">{error ? error : SAVE_TEXT[state]}{state === "offline" || state === "refused" ? <> <button type="button" className={kit.quiet} onClick={() => retry()}>Try again</button></> : null}</p>

          <div className={kit.section}>
            <p className={kit.label}>Sketches</p>
            {notes.sketches.length ? (
              <Rows>
                {notes.sketches.map((s, i) => (
                  <RowLink key={s.id} onClick={() => { setOpenId(s.id === openId ? undefined : s.id); setConfirm(undefined); setFull(undefined); }}
                    title={label(s, i)} detail={s.id === openId ? "Open below" : `${s.strokes.length} strokes`} />
                ))}
              </Rows>
            ) : <p className={kit.sub}>None yet.</p>}
            <div className={kit.buttons}>
              <Button disabled={!loaded || notes.sketches.length >= LIMITS.sketches} onClick={() => add(false)}>New blank sketch</Button>
              <Button disabled={!loaded || notes.sketches.length >= LIMITS.sketches} onClick={() => add(true)}>Sketch on the map</Button>
            </div>
          </div>

          {open ? (
            <div className={kit.section}>
              <p className={kit.label}>{label(open, notes.sketches.indexOf(open))}</p>
              <SketchPad key={open.id} sketch={open} color={color} width={WIDTHS[width]} factions={factions} onStroke={addStroke} />
              {full ? <p className={styles.bad} role="alert">{full}</p> : null}
              <Choices label="Pen colour" value={color} onChange={setColor}
                options={PEN_COLORS.map((c) => ({ value: c, name: COLOR_NAME[c], label: <><span className={styles.pen} style={{ background: COLOR_VAR[c] }} aria-hidden="true" />{COLOR_NAME[c]}</> }))} />
              <Choices label="Pen width" value={width} onChange={setWidth} options={[{ value: "fine", label: "Fine" }, { value: "bold", label: "Bold" }]} />
              <div className={kit.buttons}>
                <Button disabled={!open.strokes.length} onClick={() => { setFull(undefined); change(open.id, (s) => ({ ...s, strokes: s.strokes.slice(0, -1) })); }}>Undo last stroke</Button>
                <Button disabled={!open.strokes.length} onClick={() => setConfirm({ id: open.id, what: "clear" })}>Clear</Button>
                <Button onClick={() => setConfirm({ id: open.id, what: "delete" })}>Delete sketch</Button>
              </div>
              {confirm?.id === open.id ? (
                <>
                  <p className={kit.confirm}>{confirm.what === "clear" ? "Clear everything drawn on this sketch?" : "Delete this sketch?"}</p>
                  <Button kind="primary" block onClick={() => {
                    if (confirm.what === "clear") change(open.id, (s) => ({ ...s, strokes: [] }));
                    else { edit((n) => ({ ...n, sketches: n.sketches.filter((s) => s.id !== open.id) })); setOpenId(undefined); }
                    setConfirm(undefined); setFull(undefined);
                  }}>{confirm.what === "clear" ? "Clear it" : "Delete it"}</Button>
                  <Button block onClick={() => setConfirm(undefined)}>Keep it</Button>
                </>
              ) : null}
            </div>
          ) : null}
          {key.status === "ready" ? <Button block disabled={key.busy} onClick={key.newPin}>Show a PIN for another phone</Button> : null}
        </>
      ) : null}
      <Button kind="primary" block onClick={close}>Done</Button>
    </KitSheet>
  );
}
