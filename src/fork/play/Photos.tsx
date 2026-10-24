"use client";
// Board photos (task 2): a card on the Table tab with every photo of the game,
// a reminder in the status phase, and a sheet for one photo. Photos live in
// the game's Cloud Storage bucket through /api/fork/photos, so they outlive the
// game's 30 days in Firestore; the server posts them to Discord when the game
// asks for that. The phone shrinks a photo before sending it: a phone camera's
// 5-12 MB would be slow on a table's Wi-Fi.
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameState } from "../../context/stateDataHooks";
import type { Ctx } from "./ui";
import { Button, kit, Sheet } from "../ui/kit";
import styles from "./play.module.scss";

export type Photo = { id: string; round: number; phase: string; by?: FactionId; takenAt: number; width: number; height: number };

const PHASES: Record<string, string> = { SETUP: "setup", STRATEGY: "strategy phase", ACTION: "action phase", STATUS: "status phase", AGENDA: "agenda phase", EDICT: "edict phase", END: "after the game" };
export const photoCaption = (p: Photo) => `Round ${p.round}, ${PHASES[p.phase] ?? p.phase.toLowerCase()}`;
const src = (gameId: string, p: Photo, thumb?: boolean) => `/api/fork/photos/${gameId}/${p.id}${thumb ? "?size=thumb" : ""}`;

// Every open phone asks again now and then, so a photo from one phone shows up on the others.
const listeners = new Set<() => void>();
export function usePhotos(gameId: string) {
  const [state, setState] = useState<{ ready: boolean; photos: Photo[]; loaded: boolean }>({ ready: false, photos: [], loaded: false });
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fork/photos/${gameId}`, { cache: "no-store" });
      if (res.ok) setState({ ...(await res.json()), loaded: true });
    } catch { /* offline: keep what we have */ }
  }, [gameId]);
  useEffect(() => {
    load();
    listeners.add(load);
    const t = setInterval(load, 30000);
    return () => { listeners.delete(load); clearInterval(t); };
  }, [load]);
  return state;
}
const reloadPhotos = () => listeners.forEach((l) => l());

// Longest side 2048px, as a JPEG. A file the browser can't draw (some HEIC
// photos outside Safari) goes as it is, and the server says if it can't read it.
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

function useAddPhoto(ctx: Ctx) {
  const { gameId, seat, helping, w, open } = ctx;
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const pick = () => input.current?.click();
  const onFile = async (file?: File) => {
    if (!file) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("photo", await shrink(file), "board.jpg");
      const by = helping ?? seat;
      if (by) form.append("by", by);
      const res = await fetch(`/api/fork/photos/${gameId}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) open({ kind: "unlock" });
      else if (!res.ok) w.setToast({ id: Date.now(), text: body.error ?? "The photo wasn't saved. Try again.", tone: "error" });
      else { w.setToast({ id: Date.now(), text: "Photo saved." }); reloadPhotos(); }
    } catch {
      w.setToast({ id: Date.now(), text: "The photo wasn't saved. Check the connection and try again.", tone: "error" });
    }
    setSending(false);
    if (input.current) input.current.value = "";
  };
  const field = <input ref={input} type="file" accept="image/*" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />;
  return { pick, sending, field };
}

export function PhotosCard({ ctx }: { ctx: Ctx }) {
  const { gameId, open } = ctx;
  const { ready, photos, loaded } = usePhotos(gameId);
  const add = useAddPhoto(ctx);
  if (loaded && !ready) return null; // this server has no bucket
  return (
    <section className={kit.card} aria-label="Board photos">
      <p className={kit.eyebrow}><span>Board photos</span>{photos.length ? <span>{photos.length}</span> : null}</p>
      {photos.length ? (
        <div className={styles.photoGrid}>
          {photos.map((p) => (
            <button key={p.id} className={styles.photoThumb} onClick={() => open({ kind: "photo", id: p.id })} aria-label={`Photo: ${photoCaption(p)}`}>
              <img src={src(gameId, p, true)} alt="" loading="lazy" width={p.width} height={p.height} />
              <span>{photoCaption(p)}</span>
            </button>
          ))}
        </div>
      ) : <p className={kit.sub}>None yet. A photo of the board each round makes the replay and the Discord thread.</p>}
      {add.field}
      <Button block disabled={add.sending} onClick={add.pick}>{add.sending ? "Sending the photo…" : "Add a photo"}</Button>
    </section>
  );
}

// In the status phase, until this round has a photo or this phone says not this round.
export function PhotoReminder({ ctx }: { ctx: Ctx }) {
  const { gameId } = ctx;
  const { round, phase } = useGameState();
  const { ready, photos } = usePhotos(gameId);
  const add = useAddPhoto(ctx);
  const key = `play-photo-skip-${gameId}-${round}`;
  const [skipped, setSkipped] = useState(true);
  useEffect(() => { try { setSkipped(sessionStorage.getItem(key) === "1"); } catch { setSkipped(false); } }, [key]);
  if (!ready || skipped || phase !== "STATUS" || photos.some((p) => p.round === round && p.phase === "STATUS")) return null;
  const skip = () => { setSkipped(true); try { sessionStorage.setItem(key, "1"); } catch { /* private mode */ } };
  return (
    <section className={kit.card} aria-label="Board photo">
      <p className={kit.eyebrow}><span>Board photo</span></p>
      <p className={kit.sub}>A photo of the board for round {round}, while everyone's scoring.</p>
      {add.field}
      <div className={kit.buttons}>
        <Button kind="primary" disabled={add.sending} onClick={add.pick}>{add.sending ? "Sending…" : "Take a photo"}</Button>
        <Button onClick={skip}>Not this round</Button>
      </div>
    </section>
  );
}

export function PhotoSheet({ id, close, ctx }: { id: string; close: () => void; ctx: Ctx }) {
  const { gameId, short, w, open } = ctx;
  const { photos, loaded } = usePhotos(gameId);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = photos.find((x) => x.id === id);
  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/fork/photos/${gameId}/${id}`, { method: "DELETE" });
      if (res.status === 403) { open({ kind: "unlock" }); return; }
      if (!res.ok) throw new Error();
      w.setToast({ id: Date.now(), text: "Photo deleted." });
      reloadPhotos();
      close();
    } catch {
      w.setToast({ id: Date.now(), text: "The photo wasn't deleted. Try again.", tone: "error" });
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={p ? photoCaption(p) : "Board photo"} close={close}>
      {p ? (
        <>
          <a href={src(gameId, p)} target="_blank" rel="noreferrer" className={styles.photoFull}>
            <img src={src(gameId, p)} alt={`The board, ${photoCaption(p).toLowerCase()}`} width={p.width} height={p.height} />
          </a>
          <p className={kit.sub}>{p.by ? `From ${short(p.by)}'s phone, ` : ""}{new Date(p.takenAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
          {asking ? (
            <>
              <p className={kit.confirm}>Delete this photo for everyone, and from Discord?</p>
              <div className={kit.buttons}>
                <Button kind="primary" disabled={busy} onClick={remove}>Delete it</Button>
                <Button onClick={() => setAsking(false)}>Keep it</Button>
              </div>
            </>
          ) : <Button block onClick={() => setAsking(true)}>Delete this photo</Button>}
        </>
      ) : <p className={kit.sub}>{loaded ? "This photo was deleted." : "Loading…"}</p>}
    </Sheet>
  );
}
