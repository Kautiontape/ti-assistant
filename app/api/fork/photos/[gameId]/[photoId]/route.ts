import { NextResponse } from "next/server";
import { canEditGame } from "../../../../../../server/util/fetch";
import { unpostPhoto } from "../../../../../../src/fork/server/discord";
import { deletePhoto, getBucket, photoPath, storageReady, validGameId } from "../../../../../../src/fork/server/storage";

const ID = /^[a-z0-9]{6,12}-[a-z0-9]{3,8}$/;

// One board photo: GET the image (?size=thumb for the small one), DELETE it.
export async function GET(req: Request, { params }: { params: Promise<{ gameId: string; photoId: string }> }) {
  const { gameId, photoId } = await params;
  if (!storageReady() || !ID.test(photoId) || !validGameId(gameId)) return new Response("Not found", { status: 404 });
  const thumb = new URL(req.url).searchParams.get("size") === "thumb";
  const file = getBucket().file(photoPath(gameId, photoId, thumb));
  try {
    const [data] = await file.download();
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (e) {
    if ((e as { code?: number }).code === 404) return new Response("Not found", { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ gameId: string; photoId: string }> }) {
  const { gameId, photoId } = await params;
  if (!storageReady()) return NextResponse.json({ error: "Photos aren't set up on this server." }, { status: 503 });
  if (!ID.test(photoId) || !validGameId(gameId)) return NextResponse.json({ error: "There's no such photo." }, { status: 404 });
  if (!(await canEditGame(gameId))) return NextResponse.json({ error: "This game is locked." }, { status: 403 });
  await deletePhoto(gameId, photoId);
  unpostPhoto(gameId, photoId).catch((e) => console.log(`discord photo delete: ${gameId}`, e));
  return NextResponse.json({ ok: true });
}
