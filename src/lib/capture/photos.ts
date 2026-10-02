"use client";
// Photos: one or many stills of a front-foot defence. Each is decoded (EXIF rotation
// respected), downscaled, letterboxed onto one common frame so coordinates are
// comparable, the batter is found, and pose runs on a crop around them.
// Photos are posture screens only — the engine never claims shot type, timing, bat or ball.

import type { PhotoPhase } from "@/engine/types";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { batterLikeness, detectObjects, detectStill, detectStillPixels, loadPersonDetector, loadStillPose, loadStillPoseGpu, roiAround, type Box, type PoseFrame } from "./pose";
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
  /** What the search saw, so a failure can say why. */
  seen: { people: number; joints: number; personPx: number | null };
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
    let found = findBatter(pose, canvas, people, bats);
    // Some phones' CPU path returns nothing for a still: ask the GPU path too.
    if (found.joints < ENOUGH) {
      const gpu = await loadStillPoseGpu();
      if (gpu) {
        const second = findBatter(gpu, canvas, people, bats);
        if (second.joints > found.joints) found = second;
      }
    }
    const frame = found.joints > 0 ? found.frame : null;
    const top = people[0];
    items.push({
      id: `${k}-${file.name}`,
      name: file.name,
      canvas,
      frame,
      people: people.length,
      batter: found.batter,
      phase: null,
      seen: { people: people.length, joints: found.joints, personPx: top ? Math.round(top.h * height) : null },
    });
    onProgress(k + 1, bitmaps.length);
  }
  return { items, failed, width, height };
}

/** Joints seen confidently; at this many the body is read well enough to stop looking. */
const strong = (f: PoseFrame) => f.body.filter((p) => p && p[2] > 0.5).length;
const ENOUGH = 10;

/**
 * Read the batter's body, trying each way until one sees enough of it: a crop around each
 * person found (the most batter-like wins), the whole photo, the whole photo enlarged
 * (small photos), and the raw pixels (a different route into the model).
 */
function findBatter(pose: PoseLandmarker, canvas: HTMLCanvasElement, people: Box[], bats: Box[]): { frame: PoseFrame | null; batter: Box | null; joints: number } {
  const aspect = canvas.width / canvas.height;
  let best: { frame: PoseFrame | null; batter: Box | null; joints: number } = { frame: null, batter: null, joints: 0 };
  const consider = (f: PoseFrame, b: Box | null) => {
    const j = strong(f);
    if (j > best.joints) best = { frame: f, batter: b, joints: j };
  };
  const pool = (people.filter(fullBodyBox).length ? people.filter(fullBodyBox) : people).slice(0, 4);
  const crops = pool.map((b) => {
    const frame = detectStill(pose, canvas, roiAround(b, aspect, 0.3));
    return { frame, batter: b, joints: strong(frame), score: batterLikeness(frame.body, aspect, bats) * Math.sqrt(b.h) };
  });
  // Of the people whose body is read well, the one who looks most like batting (both hands
  // on a bat, not crouched), then the largest; otherwise the best-read person so far.
  const well = crops.filter((c) => c.joints >= ENOUGH).sort((a, b) => b.score - a.score);
  if (well[0]) return well[0];
  for (const c of crops) if (c.joints > best.joints) best = c;
  consider(detectStill(pose, canvas), people[0] ?? null);
  if (best.joints >= ENOUGH) return best;
  if (Math.min(canvas.width, canvas.height) < 480) {
    const big = Object.assign(document.createElement("canvas"), { width: canvas.width * 2, height: canvas.height * 2 });
    big.getContext("2d")!.drawImage(canvas, 0, 0, big.width, big.height);
    consider(detectStill(pose, big), people[0] ?? null);
    if (best.joints >= ENOUGH) return best;
  }
  try {
    consider(detectStillPixels(pose, canvas), people[0] ?? null);
  } catch {
    /* raw pixels unavailable: keep what we have */
  }
  return best;
}

export function canvasBlob(c: HTMLCanvasElement, type = "image/webp", q = 0.8): Promise<Blob | null> {
  return new Promise((r) => c.toBlob(r, type, q));
}
