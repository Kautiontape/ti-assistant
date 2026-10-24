import "server-only";
// The game's Cloud Storage bucket (the Firebase project's default bucket):
// board photos and the permanent game exports. Nothing here is public; the
// app's own routes read it back. FORK_STORAGE_BUCKET names the bucket, and
// without it photos and exports are off. FORK_STORAGE_EMULATOR points the
// client at a local fake (fake-gcs-server) for development. (Not the library's
// own STORAGE_EMULATOR_HOST: version 5 builds its JSON API paths wrong from it.)
import { Bucket, Storage } from "@google-cloud/storage";

let bucket: Bucket | undefined;

export function storageReady() {
  return !!process.env.FORK_STORAGE_BUCKET;
}

export function getBucket(): Bucket {
  const name = process.env.FORK_STORAGE_BUCKET;
  if (!name) throw new Error("FORK_STORAGE_BUCKET isn't set");
  if (!bucket) {
    const emulator = process.env.FORK_STORAGE_EMULATOR;
    // The admin key (GOOGLE_APPLICATION_CREDENTIALS) is the same one Firestore uses.
    const storage = emulator
      ? new Storage({ apiEndpoint: emulator, projectId: process.env.NEXT_PUBLIC_TI_PROJECT ?? "demo-ti" })
      : new Storage();
    bucket = storage.bucket(name);
  }
  return bucket;
}

export type PhotoMeta = {
  id: string;
  round: number;
  phase: string;
  by?: string; // the faction whose phone took it
  takenAt: number;
  width: number;
  height: number;
};

export const photoPath = (gameId: string, id: string, thumb = false) =>
  `games/${gameId}/photos/${id}${thumb ? "-thumb" : ""}.jpg`;

export const exportPath = (gameId: string) => `exports/${gameId}.json`;

export async function savePhoto(gameId: string, meta: PhotoMeta, full: Buffer, thumb: Buffer) {
  const b = getBucket();
  const metadata = { contentType: "image/jpeg", cacheControl: "private, max-age=31536000, immutable", metadata: { meta: JSON.stringify(meta) } };
  await Promise.all([
    b.file(photoPath(gameId, meta.id)).save(full, { resumable: false, metadata }),
    b.file(photoPath(gameId, meta.id, true)).save(thumb, { resumable: false, metadata }),
  ]);
}

// Oldest first. The list lives in the bucket itself, so it outlives the game's
// 30-day expiry in Firestore.
export async function listPhotos(gameId: string): Promise<PhotoMeta[]> {
  const [files] = await getBucket().getFiles({ prefix: `games/${gameId}/photos/` });
  const photos: PhotoMeta[] = [];
  for (const f of files) {
    if (f.name.endsWith("-thumb.jpg")) continue;
    try {
      photos.push(JSON.parse(String(f.metadata?.metadata?.meta)));
    } catch {
      // A file without our metadata isn't a photo the app saved.
    }
  }
  return photos.sort((a, b) => a.takenAt - b.takenAt);
}

export async function deletePhoto(gameId: string, id: string) {
  const b = getBucket();
  await Promise.all([
    b.file(photoPath(gameId, id)).delete({ ignoreNotFound: true }),
    b.file(photoPath(gameId, id, true)).delete({ ignoreNotFound: true }),
  ]);
}
