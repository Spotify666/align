"use client";
// Photos: one or many stills of a front-foot defence. Each is decoded (EXIF rotation
// respected), downscaled, letterboxed onto one common frame so coordinates are
// comparable, the batter is found, and pose runs on a crop around them.
// Photos are posture screens only — the engine never claims shot type, timing, bat or ball.

import type { PhotoPhase } from "@/engine/types";
import { batterLikeness, detectObjects, detectStill, loadPersonDetector, loadStillPose, roiAround, type Box, type PoseFrame } from "./pose";
import { fullBodyBox } from "./scan";

export interface PhotoItem {
  id: string;
  name: string;
  /** Letterboxed onto the common frame. */
  canvas: HTMLCanvasElement;
  frame: PoseFrame | null;
  people: number;
  batter: Box | null;
  phase: PhotoPhase | null;
}

export interface PhotoLoad {
  items: PhotoItem[];
  failed: Array<{ name: string; reason: string }>;
  width: number;
  height: number;
}

export const MAX_PHOTOS = 12;
const LONG_SIDE = 1280;

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some browsers only decode through <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function decodeFailure(file: File): string {
  if (isHeic(file))
    return "HEIC photo — this browser can't open it. On iPhone: Settings → Camera → Formats → Most Compatible, or share the photo as JPEG. Safari opens HEIC directly.";
  if (file.size === 0) return "The file is empty.";
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) return "Not a photo this browser can read. Use JPEG, PNG or WebP.";
  return "This photo couldn't be decoded. Re-save it as JPEG and try again.";
}

export async function loadPhotos(files: File[], onProgress: (done: number, total: number) => void): Promise<PhotoLoad> {
  const list = files.slice(0, MAX_PHOTOS);
  const failed: PhotoLoad["failed"] = files.slice(MAX_PHOTOS).map((f) => ({ name: f.name, reason: `Only the first ${MAX_PHOTOS} photos are used.` }));
  const bitmaps: Array<{ file: File; bmp: ImageBitmap }> = [];
  for (const file of list) {
    try {
      const bmp = await decode(file);
      if (!bmp.width || !bmp.height) throw new Error("empty");
      bitmaps.push({ file, bmp });
    } catch {
      failed.push({ name: file.name, reason: decodeFailure(file) });
    }
  }
  if (!bitmaps.length) return { items: [], failed, width: 0, height: 0 };

  // Common frame: the first photo's shape; others are letterboxed into it.
  const first = bitmaps[0]!.bmp;
  const scale = LONG_SIDE / Math.max(first.width, first.height);
  const width = Math.round(first.width * Math.min(1, scale));
  const height = Math.round(first.height * Math.min(1, scale));

  const [pose, det] = await Promise.all([loadStillPose(), loadPersonDetector()]);
  const items: PhotoItem[] = [];
  for (let k = 0; k < bitmaps.length; k++) {
    const { file, bmp } = bitmaps[k]!;
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const s = Math.min(width / bmp.width, height / bmp.height);
    const dw = bmp.width * s;
    const dh = bmp.height * s;
    ctx.drawImage(bmp, (width - dw) / 2, (height - dh) / 2, dw, dh);
    bmp.close();

    const { people, bats } = detectObjects(det, canvas);
    // The batter: of the whole people in view, the one who looks most like batting
    // (both hands on a bat, not crouched), then the largest.
    let batter: Box | null = null;
    let frame: PoseFrame | null = null;
    let best = -1;
    const pool = (people.filter(fullBodyBox).length ? people.filter(fullBodyBox) : people).slice(0, 4);
    for (const b of pool) {
      const f = detectStill(pose, canvas, roiAround(b, width / height, 0.3));
      if (!f.body.some((p) => p && p[2] > 0.5)) continue;
      const score = batterLikeness(f.body, width / height, bats) * Math.sqrt(b.h);
      if (score > best) [best, batter, frame] = [score, b, f];
    }
    if (!frame || !frame.body.some((p) => p && p[2] > 0.5)) frame = detectStill(pose, canvas);
    if (!frame.body.some((p) => p && p[2] > 0.5)) frame = null;
    items.push({ id: `${k}-${file.name}`, name: file.name, canvas, frame, people: people.length, batter, phase: null });
    onProgress(k + 1, bitmaps.length);
  }
  return { items, failed, width, height };
}

export function canvasBlob(c: HTMLCanvasElement, type = "image/webp", q = 0.8): Promise<Blob | null> {
  return new Promise((r) => c.toBlob(r, type, q));
}
