"use client";
// A game with a password is view-only on this device until someone enters it.
// Upstream's header has the field; /play hides that header, so it has its own.
// Entering it adds the game to this browser's session (upstream's enterPassword).
import { useState } from "react";
import { useViewOnly } from "../../context/dataHooks";
import { useEnterPassword } from "../../util/api/enterPassword";
import type { Ctx } from "./ui";
import { Button, kit, Sheet as KitSheet } from "../ui/kit";

export function LockedBanner({ open }: Pick<Ctx, "open">) {
  const viewOnly = useViewOnly();
  if (!viewOnly) return null;
  return (
    <div className={kit.banner} role="note" aria-label="Locked game">
      <span className={kit.grow}>This game has a password. Unlock it to make changes from this device.</span>
      <Button size="small" onClick={() => open({ kind: "unlock" })}>Unlock</Button>
    </div>
  );
}

export function UnlockSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const enterPassword = useEnterPassword();
  const viewOnly = useViewOnly();
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong">("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || state === "busy") return;
    setState("busy");
    // Upstream's hook returns undefined when the server refuses the password.
    const ok = await enterPassword(ctx.gameId, password);
    if (ok) {
      ctx.w.setToast({ id: Date.now(), text: "Unlocked. Changes from this device now save." });
      close();
    } else {
      setState("wrong");
    }
  };
  return (
    <KitSheet title="Unlock this game" close={close}>
      {viewOnly ? (
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <p className={kit.sub}>Whoever set the game up chose its password. Once it's entered, this device stays unlocked for two weeks.</p>
          <input className={kit.search} type="password" autoComplete="off" autoFocus placeholder="Password" aria-label="Password"
            value={password} onChange={(e) => { setPassword(e.target.value); if (state === "wrong") setState("idle"); }} />
          {state === "wrong" ? <p className={kit.sub} role="alert"><b>That password didn't work.</b> Check it and try again.</p> : null}
          <Button kind="primary" size="tall" block type="submit" disabled={!password || state === "busy"}>{state === "busy" ? "Checking…" : "Unlock"}</Button>
        </form>
      ) : (
        <>
          <p className={kit.sub}>This device can already make changes.</p>
          <Button kind="primary" block onClick={close}>Done</Button>
        </>
      )}
    </KitSheet>
  );
}
