import { NextResponse } from "next/server";
import { canEditGame } from "../../../../../server/util/fetch";
import { postPhoto } from "../../../../../src/fork/server/discord";
import { makePhotos, MAX_UPLOAD_BYTES, newPhotoId, NotAPhoto } from "../../../../../src/fork/server/photos";
import { listPhotos, PhotoMeta, savePhoto, storageReady } from "../../../../../src/fork/server/storage";
import { getFirestoreAdmin } from "../../../../../src/util/server";

// Board photos for a game (src/fork/play/Photos.tsx): GET lists them, POST
// adds one (a multipart form with `photo` and optionally `by`).
export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!storageReady()) return NextResponse.json({ ready: false, photos: [] });
  return NextResponse.json({ ready: true, photos: await listPhotos(gameId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!storageReady()) return NextResponse.json({ error: "Photos aren't set up on this server." }, { status: 503 });
  if (!(await canEditGame(gameId))) return NextResponse.json({ error: "This game is locked." }, { status: 403 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: "That photo is too big (15 MB at most)." }, { status: 413 });
  const db = await getFirestoreAdmin();
  const game = await db.collection("games").doc(gameId).get();
  if (!game.exists) return NextResponse.json({ error: "There's no such game." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No photo came with that." }, { status: 400 });
  }
  const file = form.get("photo");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "No photo came with that." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "That photo is too big (15 MB at most)." }, { status: 413 });
  const by = form.get("by");
  try {
    const { full, thumb, width, height } = await makePhotos(Buffer.from(await file.arrayBuffer()));
    const meta: PhotoMeta = {
      id: newPhotoId(),
      round: game.get("state.round") ?? 1,
      phase: game.get("state.phase") ?? "SETUP",
      by: typeof by === "string" && game.get(`factions.${by}`) ? by : undefined,
      takenAt: Date.now(),
      width,
      height,
    };
    if (!meta.by) delete meta.by;
    await savePhoto(gameId, meta, full, thumb);
    postPhoto(gameId, meta, full).catch((e) => console.log(`discord photo: ${gameId}`, e));
    return NextResponse.json({ photo: meta });
  } catch (e) {
    if (e instanceof NotAPhoto) return NextResponse.json({ error: e.message }, { status: 415 });
    throw e;
  }
}
