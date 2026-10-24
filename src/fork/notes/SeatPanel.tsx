"use client";
// What the seat sheet and the notes sheet say about this phone's seat key:
// the PIN once after a claim, a PIN box for a seat another phone holds, and
// plain notice when the server can't be reached. Never blocks anything else.
import { useState } from "react";
import { Button, kit } from "../ui/kit";
import styles from "./notes.module.scss";
import type { useSeatKey } from "./seatClient";

export function SeatPanel({ seatKey, short, seat }: { seatKey: ReturnType<typeof useSeatKey>; short: (id: string) => string; seat: string }) {
  const [pin, setPin] = useState("");
  const s = seatKey;
  if (s.status === "checking") return <p className={kit.sub}>Setting up private notes…</p>;
  if (s.status === "offline") {
    return (
      <div className={styles.panel} role="status">
        <p className={kit.sub}>{s.error ?? "Couldn't reach the server."} Notes aren't available on this phone yet. Everything else works.</p>
        <Button block onClick={s.retry}>Try again</Button>
      </div>
    );
  }
  if (s.status === "taken") {
    return (
      <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(pin)) s.join(pin); }}>
        <p className={kit.confirm}>{short(seat)} is already set up on another phone. Enter its 6-digit PIN to see its notes here, or skip.</p>
        <input className={kit.search} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="PIN" aria-label={`PIN for ${short(seat)}`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        {s.error ? <p className={styles.bad} role="alert">{s.error}</p> : null}
        <Button kind="primary" block disabled={s.busy || pin.length !== 6} onClick={() => s.join(pin)}>Join with this PIN</Button>
      </form>
    );
  }
  if (s.status === "ready" && s.pin) {
    return (
      <div className={styles.panel} role="status">
        <p className={kit.sub}>Another phone can join this seat with PIN</p>
        <b className={styles.pin}>{s.pin}</b>
        <p className={kit.sub}>It's shown once. Anyone with it can read this seat's notes.</p>
      </div>
    );
  }
  return null;
}
