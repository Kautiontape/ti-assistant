import "server-only";
// Board photos: phones shrink a photo before sending it (PhotosCard.tsx), and
// the server makes the stored copies with sharp. Re-encoding also drops the
// camera's metadata, location included.
import sharp from "sharp";
import { PhotoMeta } from "./storage";

// The container has 384 MB; one image at a time, no cache.
sharp.concurrency(1);
sharp.cache(false);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const FULL = 2048;
const THUMB = 480;

export class NotAPhoto extends Error {}

export async function makePhotos(input: Buffer) {
  let img: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    // Refuse decompression bombs: 50 megapixels is well past any phone camera.
    img = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 }).rotate();
    meta = await img.metadata();
  } catch {
    throw new NotAPhoto("The server couldn't read that file as a photo.");
  }
  if (!meta.width || !meta.height || !["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"].includes(meta.format ?? "")) {
    throw new NotAPhoto("That file isn't a photo the server can read.");
  }
  try {
    const { data: full, info } = await img.clone().resize({ width: FULL, height: FULL, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const thumb = await img.clone().resize({ width: THUMB, height: THUMB, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return { full, thumb, width: info.width, height: info.height };
  } catch {
    // e.g. an HEIC photo: sharp's prebuilt binaries can't decode HEVC.
    throw new NotAPhoto("The server couldn't convert that photo. Try a JPEG or PNG.");
  }
}

export function newPhotoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type { PhotoMeta };
