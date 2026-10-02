"use client";
// Photos: one or many stills of a front-foot defence. Each is decoded (EXIF rotation
// respected), downscaled, letterboxed onto one common frame so coordinates are
// comparable, the batter is found, and pose runs on a crop around them.
// Photos are posture screens only — the engine never claims shot type, timing, bat or ball.

import type { PhotoPhase } from "@/engine/types";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { batterLikeness, detectObjects, detectPerson, detectStill, detectStillPixels, loadPersonDetector, loadStillPose, loadStillPoseGpu, type Box, type PoseFrame } from "./pose";

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
  /** Everyone whose body was read, most batter-like first (frame belongs to box). */
  options: Array<{ box: Box; frame: PoseFrame }>;
  /** Another person is nearly as batter-like: the athlete should say who bats. */
  ambiguous: boolean;
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
    // Some phones' CPU path returns nothing for a still: ask the GPU path then.
    if (!found.joints) {
      const gpu = await loadStillPoseGpu();
      if (gpu) found = findBatter(gpu, canvas, people, bats);
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
      options: found.options,
      ambiguous: found.ambiguous,
    });
    onProgress(k + 1, bitmaps.length);
  }
  return { items, failed, width, height };
}

/** Joints seen confidently; at this many the body is read well enough to stop looking. */
const strong = (f: PoseFrame) => f.body.filter((p) => p && p[2] > 0.5).length;
const ENOUGH = 10;

/**
 * How likely this person is the batter, given their own skeleton: batter-like posture
 * (see batterLikeness), then size and closeness to the centre (photos are framed on the
 * batter). 0 when too little of the body was read to judge.
 */
export function batterScore(frame: PoseFrame, box: Box, aspect: number, bats: Box[] = []): number {
  const joints = strong(frame);
  if (joints < 6) return 0;
  const centre = 1.15 - 0.6 * Math.abs(box.x + box.w / 2 - 0.5);
  return batterLikeness(frame.body, aspect, bats) * Math.sqrt(box.h) * centre * (joints >= ENOUGH ? 1 : 0.8);
}

interface Found {
  frame: PoseFrame | null;
  batter: Box | null;
  joints: number;
  options: Array<{ box: Box; frame: PoseFrame }>;
  ambiguous: boolean;
}

/**
 * Find the batter and read their body. Every person found is read on their own (a
 * skeleton only counts if it sits inside that person's box), including people cut by the
 * photo's edge. The batter is the most batter-like (hands together on a handle, not
 * crouched, a bat at the hands when one is seen), then the largest and most central:
 * photos are framed on the batter. When someone else comes close, the result says so,
 * and the athlete is asked rather than guessed for.
 */
function findBatter(pose: PoseLandmarker, canvas: HTMLCanvasElement, people: Box[], bats: Box[]): Found {
  const aspect = canvas.width / canvas.height;
  const read = people.slice(0, 5).map((b) => {
    const { frame, owned } = detectPerson(pose, canvas, b, people);
    const joints = owned ? strong(frame) : 0;
    return { box: b, frame, joints, score: owned ? batterScore(frame, b, aspect, bats) : 0 };
  });
  const ranked = read.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  if (ranked[0]) {
    const top = ranked[0];
    return {
      frame: top.frame,
      batter: top.box,
      joints: top.joints,
      options: ranked.map((r) => ({ box: r.box, frame: r.frame })),
      ambiguous: ranked.length > 1 && ranked[1]!.score >= top.score * 0.8,
    };
  }
  // No skeleton could be tied to a person found. Reading the whole photo can only be
  // trusted when there is at most one person in it (otherwise it may read the wrong one).
  const none: Found = { frame: null, batter: null, joints: 0, options: [], ambiguous: false };
  if (people.length > 1) return none;
  let best = none;
  const consider = (f: PoseFrame) => {
    const j = strong(f);
    if (j > best.joints) best = { ...none, frame: f, batter: people[0] ?? null, joints: j, options: people[0] ? [{ box: people[0], frame: f }] : [] };
  };
  consider(detectStill(pose, canvas));
  if (best.joints >= ENOUGH) return best;
  if (Math.min(canvas.width, canvas.height) < 480) {
    const big = Object.assign(document.createElement("canvas"), { width: canvas.width * 2, height: canvas.height * 2 });
    big.getContext("2d")!.drawImage(canvas, 0, 0, big.width, big.height);
    consider(detectStill(pose, big));
    if (best.joints >= ENOUGH) return best;
  }
  try {
    consider(detectStillPixels(pose, canvas));
  } catch {
    /* raw pixels unavailable: keep what we have */
  }
  return best;
}

export function canvasBlob(c: HTMLCanvasElement, type = "image/webp", q = 0.8): Promise<Blob | null> {
  return new Promise((r) => c.toBlob(r, type, q));
}
