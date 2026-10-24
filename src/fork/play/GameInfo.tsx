"use client";
// The game itself, on the Table tab: its code, a link and QR code to join this
// screen, and the settings upstream keeps in its header's settings dialog
// (victory points, player names and colours). Upstream's share and QR point at
// its own pages; these point at /play.
import QRCode from "qrcode";
import { use, useEffect, useState } from "react";
import { DatabaseFnsContext } from "../../context/contexts";
import { useOptions, useViewOnly } from "../../context/dataHooks";
import { useChangeOption } from "../../util/api/changeOption";
import { useUpdateFaction } from "../../util/api/updateFaction";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, pcolor, RowLink, Rows, Sheet as KitSheet, Stepper } from "../ui/kit";
import { DiscordSection } from "./DiscordSettings";

// The address to join this game's /play screen. NEXT_PUBLIC_BASE_URL (seam S3)
// wins over the page's own origin, as for upstream's QR codes.
function useJoinUrl(gameId: string) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/play/${gameId}`), [gameId]);
  return url;
}

export function GameCard({ ctx }: { ctx: Ctx }) {
  const { gameId, open, w } = ctx;
  const url = useJoinUrl(gameId);
  const [qr, setQr] = useState("");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!url || !shown) return;
    // Dark modules on light, which every phone camera reads.
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#111111", light: "#ffffff" } }).then(setQr, () => setQr(""));
  }, [url, shown]);
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ title: `TI game ${gameId}`, url });
      else { await navigator.clipboard.writeText(url); w.setToast({ id: Date.now(), text: "Link copied." }); }
    } catch { /* the share sheet was closed */ }
  };
  return (
    <section className={kit.card} aria-label="This game">
      <p className={kit.eyebrow}><span>This game</span></p>
      <p className={kit.line} style={{ justifyContent: "space-between", margin: 0 }}>
        <span className={kit.sub}>Game code</span><b className={kit.num} style={{ fontSize: "calc(var(--fs) * 1.4)", letterSpacing: "0.08em" }}>{gameId}</b>
      </p>
      <div className={kit.buttons}>
        <Button onClick={share} disabled={!url}>Share the link</Button>
        <Button onClick={() => setShown(!shown)}>{shown ? "Hide the QR code" : "Show a QR code"}</Button>
      </div>
      {shown ? (
        <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
          {qr ? <img src={qr} width={240} height={240} alt={`QR code for ${url}`} style={{ borderRadius: 12 }} /> : null}
          <span className={kit.sub} style={{ wordBreak: "break-all", textAlign: "center" }}>{url}</span>
        </div>
      ) : null}
      <Rows><RowLink onClick={() => open({ kind: "gameSettings" })} title="Game settings" detail="Victory points, player names and colours, Discord" /></Rows>
    </section>
  );
}

export function GameSettingsSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { factions, short, gameId, open } = ctx;
  const options = useOptions();
  const viewOnly = useViewOnly();
  const changeOption = useChangeOption();
  const updateFaction = useUpdateFaction();
  const db = use(DatabaseFnsContext);
  const colours: FactionColor[] = db.getBaseValue("colors") ?? [];
  const [vp, setVp] = useState(options["victory-points"] ?? 10);
  const [who, setWho] = useState<FactionId>();
  const [name, setName] = useState("");
  const [colour, setColour] = useState<FactionColor>();
  const [busy, setBusy] = useState(false);
  const ids = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition).map((f) => f.id);
  const f = who ? factions[who] : undefined;
  const taken = new Set(Object.values(factions).map((x) => x?.color));
  const guard = () => { if (viewOnly) { open({ kind: "unlock" }); return false; } return true; };
  const run = async (job: () => Promise<unknown>, done: string) => {
    if (!guard()) return;
    setBusy(true);
    try { await job(); ctx.w.setToast({ id: Date.now(), text: done }); }
    catch { ctx.w.setToast({ id: Date.now(), text: "Not saved. Check the connection and try again.", tone: "error" }); }
    setBusy(false);
  };
  return (
    <KitSheet title="Game settings" close={close}>
      <div className={kit.section}>
        <p className={kit.label}>Points to win</p>
        <Stepper value={vp} min={1} max={20} less="One point fewer" more="One point more" onChange={setVp} />
        {vp !== (options["victory-points"] ?? 10) ? (
          <Button kind="primary" block disabled={busy} onClick={() => run(() => changeOption(gameId, "victory-points", vp), `The game is now to ${vp} points.`)}>Play to {vp} points</Button>
        ) : null}
      </div>
      <div className={kit.section}>
        <Choices label="Change a player's name or colour" value={who} onChange={(v) => { setWho(v as FactionId); setName(factions[v as FactionId]?.playerName ?? ""); setColour(undefined); }}
          options={ids.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> }))} />
        {who && f ? (
          <>
            <input className={kit.search} type="text" placeholder="Player's name" aria-label={`${short(who)}'s player`} value={name} onChange={(e) => setName(e.target.value)} />
            {name.trim() !== (f.playerName ?? "") ? (
              <Button block disabled={busy} onClick={() => run(() => updateFaction(gameId, who, { playerName: name.trim() }), `${short(who)} is played by ${name.trim() || "nobody named"}.`)}>Save the name</Button>
            ) : null}
            <Choices label="Colour" value={colour ?? f.color} onChange={(c) => setColour(c as FactionColor)}
              options={colours.map((c) => ({ value: c as string, name: c, note: taken.has(c) && f.color !== c ? "in use" : undefined,
                label: <span className={kit.line} style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7, background: pcolor(c) }} />{c}</span> }))} />
            {colour && colour !== f.color ? (
              <>
                <p className={kit.confirm}>{short(who)} plays {colour} instead of {f.color}?</p>
                <Button kind="primary" block disabled={busy} onClick={() => run(() => updateFaction(gameId, who, { color: colour }), `${short(who)} is ${colour}.`)}>Confirm</Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      <DiscordSection gameId={gameId} onLocked={() => open({ kind: "unlock" })}
        onSaved={(text) => ctx.w.setToast({ id: Date.now(), text })} onError={(text) => ctx.w.setToast({ id: Date.now(), text, tone: "error" })} />
      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}
