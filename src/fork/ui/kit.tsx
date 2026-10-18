"use client";
// The fork's controls. Each job has one look (docs/ktn/design.md):
//   act      Button      a rectangle with a verb; writes, or asks to confirm
//   open     RowLink     a row with a chevron; shows the next step
//   pick+act RowAction   a row with an accent verb; acts on tap
//   choose   Choices     pills (or rows) with a radio mark; never writes
//   learn    Cite        a name with a dotted underline; opens a popout
//   state    Tag         flat and borderless; never tappable
// Strategy cards are CardTags, always in the card's colour.
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import FactionIcon from "../../components/FactionIcon/FactionIcon";
import { Optional } from "../../util/types/types";
import kit from "./kit.module.scss";

export { kit };
export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
export const pcolor = (c?: string) => `var(--p-${(c ?? "black").toLowerCase()})`;

// ---------- device settings ----------
// Per device, not per game: a shared iPad stays a shared iPad.

const PREF_KEYS = { always: "play-always-actions", dock: "kit-dock", accent: "kit-accent", text: "kit-text" } as const;
export type TextSize = "auto" | "small" | "normal" | "large";
export type Prefs = { always: boolean; dock: "beside" | "over"; accent: "teal" | "neutral"; text: TextSize };
const DEFAULT_PREFS: Prefs = { always: false, dock: "beside", accent: "teal", text: "auto" };
const TEXT_SIZES: TextSize[] = ["auto", "small", "normal", "large"];

function readPrefs(): Prefs {
  try {
    return {
      always: localStorage.getItem(PREF_KEYS.always) === "1",
      dock: localStorage.getItem(PREF_KEYS.dock) === "over" ? "over" : "beside",
      accent: localStorage.getItem(PREF_KEYS.accent) === "neutral" ? "neutral" : "teal",
      text: (TEXT_SIZES as string[]).includes(localStorage.getItem(PREF_KEYS.text) ?? "") ? localStorage.getItem(PREF_KEYS.text) as TextSize : "auto",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useDevicePrefs() {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setPrefsState(readPrefs()); setLoaded(true); }, []);
  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    try {
      next.always ? localStorage.setItem(PREF_KEYS.always, "1") : localStorage.removeItem(PREF_KEYS.always);
      next.dock === "over" ? localStorage.setItem(PREF_KEYS.dock, "over") : localStorage.removeItem(PREF_KEYS.dock);
      next.accent === "neutral" ? localStorage.setItem(PREF_KEYS.accent, "neutral") : localStorage.removeItem(PREF_KEYS.accent);
      next.text !== "auto" ? localStorage.setItem(PREF_KEYS.text, next.text) : localStorage.removeItem(PREF_KEYS.text);
    } catch { /* private mode: the setting lasts until reload */ }
  };
  return { prefs, setPrefs, loaded };
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatch(m.matches);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const WIDE = "(min-width: 1180px)";

// Attributes for a root element (kit.root) that carry the device's look settings.
export const rootAttrs = (prefs: Prefs) => ({
  "data-accent": prefs.accent === "neutral" ? "neutral" : undefined,
  "data-text": prefs.text === "auto" ? undefined : prefs.text,
});

export function TextSizeChoice({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }) {
  return (
    <Choices label="Text size" value={prefs.text} onChange={(v) => setPrefs({ text: v })}
      options={[{ value: "auto", label: "Automatic", note: "smaller on a computer" }, { value: "small", label: "Small" }, { value: "normal", label: "Medium" }, { value: "large", label: "Large" }]} />
  );
}

// ---------- act ----------

type ButtonProps = {
  kind?: "primary" | "secondary" | "quiet";
  size?: "tall" | "small";
  block?: boolean;
  forOther?: boolean;
  detail?: React.ReactNode;
  href?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({ kind = "secondary", size, block, forOther, detail, href, className, children, ...rest }: ButtonProps) {
  const cls = cx(kind === "quiet" ? kit.quiet : kit.btn, kind === "primary" && kit.primary, size === "tall" && kit.tall, size === "small" && kit.small, block && kit.block, forOther && kit.forOther, className);
  const body = <>{children}{detail ? <small>{detail}</small> : null}</>;
  if (href) return <Link className={cls} href={href}>{body}</Link>;
  return <button type="button" className={cls} {...rest}>{body}</button>;
}

// ---------- open, and pick-to-act ----------

const Chevron = () => (
  <svg className={kit.chev} viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Away = () => (
  <svg className={kit.chev} viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h8v8M15 5 5.5 14.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// `flush` drops the group's box, for rows that fill a card.
export function Rows({ label, flush, children }: { label?: string; flush?: boolean; children: React.ReactNode }) {
  return <div className={cx(kit.rows, flush && kit.flush)} role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}

type RowProps = { title: React.ReactNode; detail?: React.ReactNode; lead?: React.ReactNode; end?: React.ReactNode; disabled?: boolean; label?: string };

function RowBody({ title, detail, lead, end, mark }: RowProps & { mark: React.ReactNode }) {
  return (
    <>
      {lead}
      <span className={kit.rowText}><b>{title}</b>{detail ? <span className={kit.rowDetail}>{detail}</span> : null}</span>
      <span className={kit.rowEnd}>{end}{mark}</span>
    </>
  );
}

// Opens the next step: a sheet, or (with href) another page.
export function RowLink({ onClick, href, external, ...row }: RowProps & { onClick?: () => void; href?: string; external?: boolean }) {
  const mark = external ? <Away /> : <Chevron />;
  const cls = cx(kit.rowBtn, !row.lead && kit.noLead);
  if (href) return <Link className={cls} href={href} aria-label={row.label}><RowBody {...row} mark={mark} /></Link>;
  return <button type="button" className={cls} disabled={row.disabled} onClick={onClick} aria-label={row.label} aria-haspopup="dialog"><RowBody {...row} mark={mark} /></button>;
}

// Acts on tap; the verb says what happens ("Take", "Score", "Use").
export function RowAction({ onClick, verb, ...row }: RowProps & { onClick: () => void; verb: string }) {
  return <button type="button" className={cx(kit.rowBtn, !row.lead && kit.noLead)} disabled={row.disabled} onClick={onClick} aria-label={row.label}><RowBody {...row} mark={<span className={kit.verb}>{verb}</span>} /></button>;
}

// ---------- choose ----------

export type ChoiceOption<T extends string> = { value: T; label: React.ReactNode; note?: React.ReactNode; disabled?: boolean; name?: string };

export function Choices<T extends string>({ label, hideLabel, value, onChange, options, list }: {
  label: string; hideLabel?: boolean; value: Optional<T>; onChange: (v: T) => void; options: ChoiceOption<T>[]; list?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {hideLabel ? null : <p className={kit.label} id={id}>{label}</p>}
      <div className={cx(kit.choices, list && kit.list)} role="radiogroup" aria-labelledby={hideLabel ? undefined : id} aria-label={hideLabel ? label : undefined}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.name} className={kit.choice} disabled={o.disabled} onClick={() => onChange(o.value)}>
            <span className={kit.radio} aria-hidden="true" />
            <span className={kit.grow} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{o.label}{o.note ? <span className={kit.choiceNote}>{o.note}</span> : null}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// An on/off setting: a row with a switch. Like Choices, it never writes to the game.
export function Switch({ label, detail, checked, onChange }: { label: React.ReactNode; detail?: React.ReactNode; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={kit.switchRow} onClick={() => onChange(!checked)}>
      <span className={kit.rowText}><b>{label}</b>{detail ? <span className={kit.rowDetail}>{detail}</span> : null}</span>
      <span className={kit.switch} aria-hidden="true" />
    </button>
  );
}

export function Stepper({ value, onChange, min, max, less, more, format }: { value: number; onChange: (n: number) => void; min: number; max: number; less: string; more: string; format?: (n: number) => string }) {
  return (
    <div className={kit.stepper}>
      <button type="button" aria-label={less} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output className={kit.num} aria-live="polite">{format ? format(value) : value}</output>
      <button type="button" aria-label={more} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// ---------- state ----------

export function Tag({ tone, children }: { tone?: "now" | "done"; children: React.ReactNode }) {
  return <span className={cx(kit.tag, tone === "now" && kit.tagNow, tone === "done" && kit.tagDone)}>{children}</span>;
}

export function Section({ title, count, children, label }: { title?: React.ReactNode; count?: React.ReactNode; children: React.ReactNode; label?: string }) {
  return (
    <div className={kit.section} role={label ? "group" : undefined} aria-label={label}>
      {title !== undefined ? <p className={kit.eyebrow}><span>{title}</span>{count !== undefined ? <span className={kit.num}>{count}</span> : null}</p> : null}
      {children}
    </div>
  );
}

// ---------- players ----------

export function Swatch({ faction, color, small, large }: { faction: FactionId; color?: string; small?: boolean; large?: boolean }) {
  const size = small ? 14 : large ? 26 : 19;
  return (
    <span className={cx(kit.sw, small && kit.swSmall, large && kit.swLarge)} data-c={color} style={{ ["--c" as string]: pcolor(color) }}>
      <FactionIcon factionId={faction} size={size} />
    </span>
  );
}

export function Chip({ faction, factions, short, small, large, player = true }: { faction: FactionId; factions: Partial<Record<FactionId, Faction>>; short: (id: Optional<string>) => string; small?: boolean; large?: boolean; player?: boolean }) {
  const f = factions[faction];
  return (
    <span className={kit.chip}>
      <Swatch faction={faction} color={f?.color} small={small} large={large} />
      <span className={kit.chipName}>{short(faction)}</span>
      {player && f?.playerName ? <span className={kit.chipPlayer}>{f.playerName}</span> : null}
    </span>
  );
}

// ---------- learn: popouts ----------

export type Thing = { kind: string; id: string };
type PopState = { thing: Thing; anchor: HTMLElement; pinned: boolean };
type PopApi = { open: (t: Thing, el: HTMLElement) => void; peek: (t: Thing, el: HTMLElement) => void; unpeek: () => void; close: () => void };
const PopContext = createContext<Optional<PopApi>>(undefined);
export const usePopout = () => useContext(PopContext);

// `render` turns a thing into its popout: a kind, a name and text. Mouse users
// get a preview on hover (as Twilight Aid's peek does); a tap pins it.
export function PopoutProvider({ render, children }: { render: (t: Thing) => Optional<{ kind: string; title: string; body: React.ReactNode }>; children: React.ReactNode }) {
  const [state, setState] = useState<Optional<PopState>>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const narrow = useMedia("(max-width: 699px)");
  const hover = useMedia("(hover: hover) and (pointer: fine)");
  const api = useRef<PopApi>(undefined as unknown as PopApi);
  api.current = {
    open: (thing, anchor) => { clearTimeout(timer.current); setState({ thing, anchor, pinned: true }); },
    peek: (thing, anchor) => {
      if (!hover) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState((s) => (s?.pinned ? s : { thing, anchor, pinned: false })), 350);
    },
    unpeek: () => { clearTimeout(timer.current); setState((s) => (s?.pinned ? s : undefined)); },
    close: () => { clearTimeout(timer.current); setState(undefined); },
  };
  const stable = useRef<PopApi>({ open: (t, e) => api.current.open(t, e), peek: (t, e) => api.current.peek(t, e), unpeek: () => api.current.unpeek(), close: () => api.current.close() });
  const content = state ? render(state.thing) : undefined;
  return (
    <PopContext.Provider value={stable.current}>
      {children}
      {state && content ? <Popout {...state} content={content} sheet={narrow} close={stable.current.close} /> : null}
    </PopContext.Provider>
  );
}

function Popout({ anchor, pinned, content, sheet, close }: PopState & { content: { kind: string; title: string; body: React.ReactNode }; sheet: boolean; close: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Optional<{ top: number; left: number }>>();
  const titleId = useId();
  useLayoutEffect(() => {
    if (sheet || !box.current) return;
    const a = anchor.getBoundingClientRect(), b = box.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const below = a.bottom + m, above = a.top - m - b.height;
    const top = below + b.height <= vh - m ? below : above >= m ? above : Math.max(m, vh - m - b.height);
    const left = Math.min(Math.max(m, a.left), vw - b.width - m);
    setPos({ top, left });
  }, [anchor, sheet, content.title]);
  useEffect(() => {
    if (!pinned) return;
    const prev = document.activeElement as Optional<HTMLElement>;
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (prev?.isConnected) prev.focus(); };
  }, [pinned, close]);
  useEffect(() => {
    // The anchor moves with the page; a peek hides when it scrolls (a pinned one stays put on a phone).
    const onScroll = (e: Event) => { if (box.current?.contains(e.target as Node)) return; if (!pinned || !sheet) close(); };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [pinned, sheet, close]);
  return (
    <>
      {pinned ? <div className={cx(kit.popScrim, !sheet && kit.popScrimClear)} onClick={close} aria-hidden="true" /> : null}
      <div ref={box} className={cx(kit.popout, sheet && kit.popSheet, !pinned && kit.popPeek)} role={pinned ? "dialog" : "tooltip"} aria-modal={pinned ? true : undefined}
        aria-labelledby={titleId} tabIndex={-1} style={sheet ? undefined : pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}>
        <header>
          <div style={{ display: "grid", gap: 2, flex: 1 }}><span className={kit.popKind}>{content.kind}</span><h3 id={titleId}>{content.title}</h3></div>
          {pinned ? <button type="button" className={kit.close} onClick={close} aria-label="Close">✕</button> : null}
        </header>
        {content.body}
      </div>
    </>
  );
}

// A game thing's name; tap for its text. Plain text where there's no provider.
export function Cite({ thing, children }: { thing: Thing; children: React.ReactNode }) {
  const pop = usePopout();
  if (!pop) return <b>{children}</b>;
  return (
    <button type="button" className={kit.cite} aria-haspopup="dialog"
      onClick={(e) => { e.stopPropagation(); pop.open(thing, e.currentTarget); }}
      onPointerEnter={(e) => e.pointerType === "mouse" && pop.peek(thing, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === "mouse" && pop.unpeek()}>
      {children}
    </button>
  );
}

// ---------- strategy cards ----------

type CardLike = { id: string; name: string; order: number; color?: string };

// Filled while available, an outline once used (played, picked or out of play).
// Tappable for the card's text unless `still`.
export function CardTag({ card, used, large, still, label }: { card: CardLike; used?: boolean; large?: boolean; still?: boolean; label?: string }) {
  const pop = usePopout();
  const body = <><span className={kit.scNum}>{card.order}</span><span className={kit.scName}>{card.name}</span></>;
  const props = { className: cx(kit.sc, large && kit.scLarge), "data-c": card.color, "data-used": used || undefined };
  if (still || !pop) return <span {...props} aria-label={label}>{body}</span>;
  const thing = { kind: "strategyCard", id: card.id };
  return (
    <button type="button" {...props} aria-haspopup="dialog" aria-label={label ?? `${card.name}${used ? ", played" : ""}`}
      onClick={(e) => { e.stopPropagation(); pop.open(thing, e.currentTarget); }}
      onPointerEnter={(e) => e.pointerType === "mouse" && pop.peek(thing, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === "mouse" && pop.unpeek()}>
      {body}
    </button>
  );
}

// ---------- sheets ----------

// Whether sheets about a thing open beside the screen. PlayApp sets it from the
// device setting and the screen width, and shifts its own layout to match.
export const DockContext = createContext(false);

export function Sheet({ title, close, children, dock }: { title: string; close: () => void; children: React.ReactNode; dock?: boolean }) {
  const docked = useContext(DockContext) && !!dock;
  const box = useRef<HTMLElement>(null);
  const stableClose = useCallback(close, [close]);
  useEffect(() => {
    const prev = document.activeElement as Optional<HTMLElement>;
    box.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") stableClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (prev?.isConnected) prev.focus({ preventScroll: true }); };
    // Focus moves once, when the sheet opens; a docked sheet that changes subject keeps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const head = <header><h2>{title}</h2><button type="button" className={kit.close} onClick={close} aria-label="Close">✕</button></header>;
  if (docked) {
    return <aside ref={box} className={kit.dock} role="dialog" aria-modal="false" aria-label={title} tabIndex={-1}>{head}{children}</aside>;
  }
  return (
    <div className={kit.scrim} onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className={kit.sheet} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>{head}{children}</section>
    </div>
  );
}
