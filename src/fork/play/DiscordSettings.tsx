"use client";
// Discord posts for a game (task 9): on or off, which kinds of post, and
// optionally a webhook of the game's own. The server keeps the webhook
// (/api/fork/discord); this screen only learns whether there is one. Used in
// game settings and, before the game exists, on the new-game page.
import { useEffect, useState } from "react";
import { Button, kit, Switch } from "../ui/kit";

export type DiscordEvent = "scoreboard" | "phase" | "objectives" | "agenda" | "combat" | "photos" | "final";
export const DISCORD_EVENTS: [DiscordEvent, string, string?][] = [
  ["scoreboard", "Scoreboard", "with each new phase"],
  ["phase", "Phase changes", "round and phase"],
  ["objectives", "Objectives", "revealed and scored, points by hand"],
  ["agenda", "Agenda results"],
  ["combat", "Combats", "who fought and who won"],
  ["photos", "Board photos"],
  ["final", "The final result"],
];

export type DiscordChoice = { on: boolean; events: DiscordEvent[]; webhook?: string };
type Status = { on: boolean; events: DiscordEvent[]; ownWebhook: boolean; serverWebhook: boolean; ready: boolean; error?: string };

export const WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d{5,25}\/[\w-]{20,100}\/?$/;

// The choices themselves, for a game that exists or one about to.
export function DiscordFields({ value, onChange, serverWebhook, ownWebhook }: { value: DiscordChoice; onChange: (v: DiscordChoice) => void; serverWebhook: boolean; ownWebhook?: boolean }) {
  const [other, setOther] = useState(!!value.webhook || (!serverWebhook && !ownWebhook));
  const badHook = !!value.webhook && !WEBHOOK.test(value.webhook.trim());
  return (
    <>
      <Switch label="Post this game to Discord" detail={value.on ? "In its own thread" : undefined} checked={value.on} onChange={(on) => onChange({ ...value, on })} />
      {value.on ? (
        <>
          {DISCORD_EVENTS.map(([id, label, detail]) => (
            <Switch key={id} label={label} detail={detail} checked={value.events.includes(id)}
              onChange={(b) => onChange({ ...value, events: b ? [...value.events, id] : value.events.filter((e) => e !== id) })} />
          ))}
          {other ? (
            <>
              <input className={kit.search} type="url" inputMode="url" autoComplete="off" spellCheck={false}
                placeholder={ownWebhook ? "A new webhook address (this game has one)" : "Webhook address: https://discord.com/api/webhooks/…"}
                aria-label="Discord webhook address" value={value.webhook ?? ""} onChange={(e) => onChange({ ...value, webhook: e.target.value })} />
              {badHook ? <p className={kit.sub} role="alert">That isn't a Discord webhook address. In Discord: channel settings, Integrations, Webhooks, Copy Webhook URL.</p> : null}
              <p className={kit.sub}>A forum channel's webhook gives each game its own thread; any other channel gets the posts directly.</p>
            </>
          ) : serverWebhook ? (
            <Button kind="quiet" onClick={() => setOther(true)}>Use another channel</Button>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function useDiscordStatus(gameId?: string) {
  const [status, setStatus] = useState<Status>();
  useEffect(() => {
    let live = true;
    // Before the game exists, "-" (no game) answers with the server's defaults.
    fetch(`/api/fork/discord/${gameId ?? "-"}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((s) => live && setStatus(s), () => {});
    return () => { live = false; };
  }, [gameId]);
  return [status, setStatus] as const;
}

export async function saveDiscord(gameId: string, choice: DiscordChoice): Promise<{ ok: true; status: Status } | { ok: false; status: number; error: string }> {
  const body: Record<string, unknown> = { on: choice.on, events: choice.events };
  if (choice.webhook?.trim()) body.webhook = choice.webhook.trim();
  const res = await fetch(`/api/fork/discord/${gameId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, status: json } : { ok: false, status: res.status, error: json.error ?? "Not saved. Try again." };
}

// Game settings: the game's current choice, saved with one button.
export function DiscordSection({ gameId, onSaved, onLocked, onError }: { gameId: string; onSaved: (text: string) => void; onLocked: () => void; onError: (text: string) => void }) {
  const [status, setStatus] = useDiscordStatus(gameId);
  const [choice, setChoice] = useState<DiscordChoice>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (status && !choice) setChoice({ on: status.on, events: status.events }); }, [status, choice]);
  if (!status || !choice) return null;
  const changed = choice.on !== status.on || choice.events.join() !== status.events.join() || !!choice.webhook?.trim();
  const invalid = (!!choice.webhook && !WEBHOOK.test(choice.webhook.trim())) || (choice.on && !status.serverWebhook && !status.ownWebhook && !choice.webhook?.trim());
  const save = async () => {
    setBusy(true);
    const r = await saveDiscord(gameId, choice);
    setBusy(false);
    if (r.ok) { setStatus(r.status); setChoice({ on: r.status.on, events: r.status.events }); onSaved(r.status.on ? "Discord posts are on." : "Discord posts are off."); }
    else if (r.status === 403) onLocked();
    else onError(r.error);
  };
  return (
    <div className={kit.section}>
      <p className={kit.label}>Discord</p>
      {status.error ? <p className={kit.sub} role="alert">{status.error}</p> : null}
      <DiscordFields value={choice} onChange={setChoice} serverWebhook={status.serverWebhook} ownWebhook={status.ownWebhook} />
      {changed ? <Button kind="primary" block disabled={busy || invalid} onClick={save}>Save the Discord settings</Button> : null}
    </div>
  );
}
