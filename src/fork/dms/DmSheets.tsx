"use client";
// Direct messages between two seats: a list of the other players, a thread with
// each, and after the game a view of everyone's. Private to the two seats until
// the game ends (seat key, app/api/fork/messages); never in the game, the log or
// the replay. Nothing here limits what anyone can do in the game.
import { useEffect, useRef, useState } from "react";
import type { Ctx } from "../play/ui";
import { SeatPanel } from "../notes/SeatPanel";
import { useSeatKey } from "../notes/seatClient";
import { Button, Chip, kit, RowLink, Rows, Sheet as KitSheet, Tag } from "../ui/kit";
import styles from "./dms.module.scss";
import { DM_LIMITS, threadWith, timeline, unreadFrom, type Line } from "./model";
import { useMessages } from "./useMessages";

const stamp = (at: number) => {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
};

// The Table tab's way in, with a count of what is unread. Only a phone with a seat sees it.
export function MessagesCard({ ctx }: { ctx: Ctx }) {
  const { seat, gameId } = ctx;
  const dm = useMessages(gameId, seat, false);
  if (!seat) return null;
  return (
    <section className={kit.card} aria-label="Messages">
      <Rows flush>
        <RowLink onClick={() => ctx.open({ kind: "messages" })} title="Messages" label={dm.unread ? `Messages, ${dm.unread} new` : "Messages"}
          detail={dm.over ? "The game is over, so everyone can read them now" : `Private between two players until the game ends`}
          end={dm.unread ? <Tag tone="now">{dm.unread} new</Tag> : undefined} />
      </Rows>
    </section>
  );
}

export function MessagesSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { seat } = ctx;
  if (!seat) return <KitSheet title="Messages" close={close}><p className={kit.sub}>Pick your seat first (the button at the top left). Messages belong to a seat.</p><Button kind="primary" block onClick={() => ctx.open({ kind: "seat" })}>Pick a seat</Button></KitSheet>;
  return <SeatMessages close={close} ctx={ctx} seat={seat} />;
}

type View = { kind: "list" } | { kind: "thread"; other: FactionId } | { kind: "all" };

function SeatMessages({ close, ctx, seat }: { close: () => void; ctx: Ctx; seat: FactionId }) {
  const { gameId, short, factions } = ctx;
  const key = useSeatKey(gameId, seat);
  const ready = key.status === "ready";
  const dm = useMessages(gameId, seat, true, ready);
  const [view, setView] = useState<View>({ kind: "list" });
  const others = (Object.keys(factions) as FactionId[]).filter((f) => f !== seat);
  const title = view.kind === "thread" ? `${short(view.other)}` : view.kind === "all" ? "All messages" : "Messages";
  return (
    <KitSheet title={title} close={close}>
      <SeatPanel seatKey={key} short={short} seat={seat} />
      {ready ? (
        view.kind === "thread" ? <Thread ctx={ctx} seat={seat} other={view.other} dm={dm} back={() => setView({ kind: "list" })} />
        : view.kind === "all" ? <AllMessages ctx={ctx} dm={dm} back={() => setView({ kind: "list" })} />
        : (
          <>
            <p className={kit.sub}>{dm.over ? "The game is over, so everyone can read every message now." : "Only you and the other player can read a message, until the game ends. Then everyone in the game can."}</p>
            {dm.offline ? <p className={styles.bad} role="status">Couldn't reach the server. Showing what this phone last had.</p> : null}
            <Rows label="Players">
              {others.map((o) => {
                const t = threadWith(dm.lines, seat, o);
                const last = t[t.length - 1];
                const n = unreadFrom(dm.lines, seat, o, dm.seen);
                return (
                  <RowLink key={o} onClick={() => setView({ kind: "thread", other: o })} label={n ? `${short(o)}, ${n} new` : short(o)}
                    title={<Chip faction={o} factions={factions} short={short} />}
                    detail={last ? `${last.from === seat ? "You: " : ""}${last.text.slice(0, 60)}` : dm.loaded ? "No messages yet" : "Loading…"}
                    end={n ? <Tag tone="now">{n} new</Tag> : undefined} />
                );
              })}
            </Rows>
            {dm.over ? <Rows><RowLink onClick={() => setView({ kind: "all" })} title="All messages" detail={`Every conversation in the game, in time order`} /></Rows> : null}
          </>
        )
      ) : null}
      <Button kind="primary" block onClick={close}>Done</Button>
    </KitSheet>
  );
}

function Thread({ ctx, seat, other, dm, back }: { ctx: Ctx; seat: FactionId; other: FactionId; dm: ReturnType<typeof useMessages>; back: () => void }) {
  const { short, factions } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  const lines = threadWith(dm.lines, seat, other);
  const newest = lines[lines.length - 1]?.at ?? 0;
  // Reading it: mark it seen when it opens and whenever something new arrives, and keep the newest in view.
  useEffect(() => { dm.read(other); end.current?.scrollIntoView({ block: "end" }); }, [other, newest]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setError(undefined);
    const r = await dm.send(other, t);
    setBusy(false);
    if (r.ok) setText(""); else setError(r.error);
  };
  return (
    <>
      <Button block onClick={back}>All players</Button>
      <p className={kit.sub}>{dm.over ? `You and ${short(other)}. Everyone can read this now.` : `Between you and ${short(other)} only, until the game ends.`}</p>
      <div className={styles.thread} role="log" aria-label={`Messages with ${short(other)}`}>
        {lines.length ? lines.map((l, i) => (
          <div key={i} className={`${styles.msg} ${l.from === seat ? styles.mine : styles.theirs}`}>
            <span>{l.text}</span>
            <span className={styles.when}>{l.from === seat ? "You" : short(l.from)}, {stamp(l.at)}</span>
          </div>
        )) : <p className={kit.sub}>{dm.loaded ? "No messages yet." : "Loading…"}</p>}
        <div ref={end} />
      </div>
      {dm.over ? null : (
        <>
          <label className={kit.label} htmlFor="dm-text">Message {short(other)}</label>
          <textarea id="dm-text" className={styles.text} value={text} maxLength={DM_LIMITS.text} placeholder="A deal, a warning, a secret…"
            onChange={(e) => setText(e.target.value)} />
          <p className={styles.count}>{text.length}/{DM_LIMITS.text}</p>
          {error ? <p className={styles.bad} role="alert">{error}</p> : null}
          <Button kind="primary" block disabled={busy || !text.trim()} onClick={send}>{busy ? "Sending…" : "Send"}</Button>
        </>
      )}
    </>
  );
}

function AllMessages({ ctx, dm, back }: { ctx: Ctx; dm: ReturnType<typeof useMessages>; back: () => void }) {
  const { short } = ctx;
  const lines: Line[] = timeline(dm.lines);
  return (
    <>
      <Button block onClick={back}>Back</Button>
      <p className={kit.sub}>Every direct message sent in this game, oldest first.</p>
      <div className={styles.thread} role="log" aria-label="All messages">
        {lines.length ? lines.map((l, i) => (
          <div key={i} className={`${styles.msg} ${styles.theirs}`}>
            <span>{l.text}</span>
            <span className={styles.when}>{short(l.from)} to {short(l.to)}, {stamp(l.at)}</span>
          </div>
        )) : <p className={kit.sub}>Nobody sent any.</p>}
      </div>
    </>
  );
}
