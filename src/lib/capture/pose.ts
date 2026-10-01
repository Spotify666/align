"use client";
// On-device vision with MediaPipe (self-hosted WASM + models). Video never leaves the
// phone during analysis.
//
// Two ideas make real-world clips work:
//  - A person detector finds every person, so the athlete can say which one is the
//    batter and small or distant batters are still found.
//  - Pose runs on a crop around that batter, upscaled, so a batter filling a fifth of a
//    broadcast frame gets the same pixels as one filling the screen.

import type { ObjectDetector as OD, PoseLandmarker as PL, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { J, JOINTS, type CameraPoint, type ImgPoint } from "@/engine/types";

// MediaPipe's 33-landmark indices for the joints the engine uses.
const MP_INDEX: Record<(typeof JOINTS)[number], number> = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot: 31,
  right_foot: 32,
};

/** Normalised box in the full frame (0..1 on each axis). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

type Files = Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>>;
let files: Promise<Files> | null = null;
const vision = () => import("@mediapipe/tasks-vision");
function loadFiles(): Promise<Files> {
  if (!files) {
    files = vision().then((v) => v.FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm"));
    files.catch(() => (files = null));
  }
  return files;
}

async function withDelegate<T>(make: (delegate: "GPU" | "CPU") => Promise<T>, prefer: "GPU" | "CPU" = "GPU"): Promise<T> {
  if (prefer === "CPU") return make("CPU");
  try {
    return await make("GPU");
  } catch {
    return await make("CPU");
  }
}

let videoPose: Promise<PL> | null = null;
let imagePose: Promise<PL> | null = null;
let detector: Promise<OD> | null = null;

const poseOptions = (mode: "VIDEO" | "IMAGE", delegate: "GPU" | "CPU") => ({
  baseOptions: { modelAssetPath: "/models/pose_landmarker_full.task", delegate },
  runningMode: mode,
  numPoses: 2,
  minPoseDetectionConfidence: 0.4,
  minPosePresenceConfidence: 0.4,
  minTrackingConfidence: 0.5,
});

let videoPoseCpu = false;
/**
 * Pose for consecutive video frames (temporal tracking). GPU when available; some
 * devices' GPU paths load but return nothing, so callers can force the CPU path.
 */
export function loadPose(opts: { cpu?: boolean } = {}): Promise<PL> {
  if (opts.cpu && !videoPoseCpu) {
    void videoPose?.then((p) => p.close()).catch(() => undefined);
    videoPose = null;
    videoPoseCpu = true;
  }
  if (!videoPose) {
    videoPose = (async () => {
      const [{ PoseLandmarker }, f] = await Promise.all([vision(), loadFiles()]);
      return withDelegate((d) => PoseLandmarker.createFromOptions(f, poseOptions("VIDEO", d)), videoPoseCpu ? "CPU" : "GPU");
    })();
    videoPose.catch(() => (videoPose = null));
  }
  return videoPose;
}

/** Pose for independent stills (photos, sparse probes): no state carried between calls. */
export function loadStillPose(): Promise<PL> {
  if (!imagePose) {
    imagePose = (async () => {
      const [{ PoseLandmarker }, f] = await Promise.all([vision(), loadFiles()]);
      // Stills are few, so the CPU path's reliability beats GPU speed.
      return withDelegate((d) => PoseLandmarker.createFromOptions(f, poseOptions("IMAGE", d)), "CPU");
    })();
    imagePose.catch(() => (imagePose = null));
  }
  return imagePose;
}

export function loadPersonDetector(): Promise<OD> {
  if (!detector) {
    detector = (async () => {
      const [{ ObjectDetector }, f] = await Promise.all([vision(), loadFiles()]);
      return withDelegate((d) =>
        ObjectDetector.createFromOptions(f, {
          baseOptions: { modelAssetPath: "/models/efficientdet_lite0.tflite", delegate: d },
          runningMode: "IMAGE",
          // Bats are found weakly (COCO has no cricket bat), so they only hint which person bats.
          categoryAllowlist: ["person", "baseball bat", "tennis racket"],
          scoreThreshold: 0.12,
          maxResults: 12,
        }),
        // A small model: CPU is fast enough everywhere and avoids GPU paths that return nothing.
        "CPU",
      );
    })();
    detector.catch(() => (detector = null));
  }
  return detector;
}

/** People (largest first) and bat-like objects in a frame. `source` dimensions define the normalisation. */
export function detectObjects(det: OD, source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap): { people: Box[]; bats: Box[] } {
  const W = "videoWidth" in source ? source.videoWidth : source.width;
  const H = "videoHeight" in source ? source.videoHeight : source.height;
  if (!W || !H) return { people: [], bats: [] };
  const all = det.detect(source).detections.map((d) => ({
    kind: d.categories[0]?.categoryName ?? "",
    box: {
      x: (d.boundingBox?.originX ?? 0) / W,
      y: (d.boundingBox?.originY ?? 0) / H,
      w: (d.boundingBox?.width ?? 0) / W,
      h: (d.boundingBox?.height ?? 0) / H,
      score: d.categories[0]?.score ?? 0,
    },
  }));
  return {
    people: all
      .filter((d) => d.kind === "person" && d.box.score >= 0.3 && d.box.w > 0.01 && d.box.h > 0.03)
      .map((d) => d.box)
      .sort((a, b) => b.w * b.h - a.w * a.h),
    bats: all.filter((d) => d.kind !== "person").map((d) => d.box),
  };
}

export function detectPeople(det: OD, source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap): Box[] {
  return detectObjects(det, source).people;
}

// MediaPipe VIDEO mode needs strictly increasing timestamps across every call on
// one landmarker instance (tracking, live preview alike).
let lastTimestamp = 0;
const nextTimestamp = (requested: number) => (lastTimestamp = Math.max(lastTimestamp + 1, Math.round(requested)));

export interface PoseFrame {
  body: ImgPoint[];
  /** Monocular 3D estimate per joint in camera axes (see CameraPoint), metres, hip-centred. */
  world: CameraPoint[];
  /** Lateral depth for the 3D viewer only. */
  depth: number[];
  /** People pose found inside the analysed region. */
  people: number;
  hip: [number, number] | null;
}

const EMPTY = (prevHip: [number, number] | null): PoseFrame => ({
  body: JOINTS.map(() => null),
  world: JOINTS.map(() => null),
  depth: JOINTS.map(() => 0),
  people: 0,
  hip: prevHip,
});

/** Region of interest: a crop of the full frame, in normalised coordinates. */
export interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Square-ish crop around a person box with margin, kept inside the frame. */
export function roiAround(b: Roi, frameAspect: number, margin = 0.35): Roi {
  // Work in pixel-proportional units so the crop is square on screen.
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const sideH = Math.max(b.h, (b.w * frameAspect)) * (1 + 2 * margin); // in frame-height units
  const h = Math.min(1, sideH);
  const w = Math.min(1, sideH / frameAspect);
  return { x: clamp01(cx - w / 2, w), y: clamp01(cy - h / 2, h), w, h };
}
const clamp01 = (v: number, size: number) => Math.max(0, Math.min(1 - size, v));

let cropCanvas: HTMLCanvasElement | null = null;
const CROP_SIDE = 512;

/** Draw the ROI of `source` onto a reusable canvas sized for the pose model. */
function crop(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, roi: Roi): HTMLCanvasElement {
  const W = "videoWidth" in source ? source.videoWidth : source.width;
  const H = "videoHeight" in source ? source.videoHeight : source.height;
  const pw = roi.w * W;
  const ph = roi.h * H;
  const scale = CROP_SIDE / Math.max(pw, ph);
  cropCanvas ??= document.createElement("canvas");
  cropCanvas.width = Math.max(16, Math.round(pw * scale));
  cropCanvas.height = Math.max(16, Math.round(ph * scale));
  const ctx = cropCanvas.getContext("2d")!;
  ctx.drawImage(source, roi.x * W, roi.y * H, pw, ph, 0, 0, cropCanvas.width, cropCanvas.height);
  return cropCanvas;
}

function toFrame(res: PoseLandmarkerResult, roi: Roi, prevHip: [number, number] | null): PoseFrame {
  if (!res.landmarks.length) return EMPTY(prevHip);
  const map = (p: { x: number; y: number }): [number, number] => [roi.x + p.x * roi.w, roi.y + p.y * roi.h];
  const people = res.landmarks.filter((l) => avgVis(l) > 0.5).length;
  let pick = 0;
  if (res.landmarks.length > 1) {
    // Identity continuity: the pose nearest the batter's previous hip, else the larger one.
    const score = (i: number) => {
      const l = res.landmarks[i]!;
      const hip = map({ x: (l[23]!.x + l[24]!.x) / 2, y: (l[23]!.y + l[24]!.y) / 2 });
      if (prevHip) return -Math.hypot(hip[0] - prevHip[0], hip[1] - prevHip[1]);
      const ys = l.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    pick = score(0) >= score(1) ? 0 : 1;
  }
  const l = res.landmarks[pick]!;
  const w = res.worldLandmarks[pick];
  const body = JOINTS.map((j) => {
    const p = l[MP_INDEX[j]]!;
    const c = Math.min(p.visibility ?? 1, (p as { presence?: number }).presence ?? 1);
    const [x, y] = map(p);
    return [x, y, c] as const;
  });
  const world = JOINTS.map((j, k) => {
    const p = w?.[MP_INDEX[j]];
    return p ? ([p.x, p.y, p.z, body[k]![2]] as const) : null;
  });
  const depth = JOINTS.map((j) => -(w?.[MP_INDEX[j]]?.z ?? 0));
  const hip = map({ x: (l[23]!.x + l[24]!.x) / 2, y: (l[23]!.y + l[24]!.y) / 2 });
  return { body, world, depth, people, hip };
}

const FULL: Roi = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Track the batter in one video frame. With a ROI the frame is cropped and upscaled
 * first; landmarks come back in full-frame coordinates either way.
 */
export function detectFrame(
  pose: PL,
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  timestampMs: number,
  prevHip: [number, number] | null,
  roi: Roi = FULL,
): PoseFrame {
  const full = roi.w >= 0.98 && roi.h >= 0.98;
  const input = full ? source : crop(source, roi);
  return toFrame(pose.detectForVideo(input, nextTimestamp(timestampMs)), full ? FULL : roi, prevHip);
}

/** Pose in one independent still (photo or sparse probe frame). */
export function detectStill(pose: PL, source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, roi: Roi = FULL): PoseFrame {
  const full = roi.w >= 0.98 && roi.h >= 0.98;
  const input = full ? source : crop(source, roi);
  return toFrame(pose.detect(input), full ? FULL : roi, null);
}

/** Bounding box of the confidently seen joints, or null when too little of the body is seen. */
export function bodyBox(body: ImgPoint[], minConf = 0.4): Roi | null {
  const pts = body.filter((p): p is NonNullable<ImgPoint> => !!p && p[2] >= minConf);
  if (pts.length < 8) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Keeps the crop on the batter frame by frame: re-centred and re-sized from the last
 * pose, so pans and broadcast zooms don't push the body out of the crop. When the body
 * is lost, the person detector re-finds the batter nearest to where they were.
 */
export class Follower {
  roi: Roi;
  private lost = 0;
  constructor(
    start: Roi,
    private aspect: number,
    private margin = 0.32,
  ) {
    this.roi = roiAround(start, aspect, margin);
  }
  get isLost() {
    return this.lost >= 2;
  }
  /** Update from this frame's pose. Returns whether the batter was seen. */
  see(frame: PoseFrame): boolean {
    const b = bodyBox(frame.body);
    if (!b) {
      this.lost++;
      return false;
    }
    this.lost = 0;
    const t = roiAround(b, this.aspect, this.margin);
    // Follow quickly but never jump: size changes at most ×1.5 per frame.
    const k = Math.max(2 / 3, Math.min(1.5, t.h / Math.max(1e-3, this.roi.h)));
    const h = Math.min(1, this.roi.h * k);
    const w = Math.min(1, h / this.aspect);
    const cx = this.roi.x + this.roi.w / 2 + (t.x + t.w / 2 - (this.roi.x + this.roi.w / 2)) * 0.7;
    const cy = this.roi.y + this.roi.h / 2 + (t.y + t.h / 2 - (this.roi.y + this.roi.h / 2)) * 0.7;
    this.roi = { x: clamp01(cx - w / 2, w), y: clamp01(cy - h / 2, h), w, h };
    return true;
  }
  /** Re-find the batter among detected people: the one nearest the last crop. */
  reacquire(people: Box[]) {
    const cx = this.roi.x + this.roi.w / 2;
    const cy = this.roi.y + this.roi.h / 2;
    const best = people
      .filter((b) => b.h >= this.roi.h * 0.2)
      .map((b) => ({ b, d: Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) }))
      .sort((a, b) => a.d - b.d)[0];
    if (best && best.d < Math.max(this.roi.w, this.roi.h)) {
      this.roi = roiAround(best.b, this.aspect, this.margin);
      this.lost = 0;
    }
  }
}

/**
 * How much a pose looks like the person batting: both hands together on a handle, not
 * crouched like the keeper, and (when the detector saw one) a bat at the hands. The
 * bowler's and fielders' hands are apart; the umpire and non-striker rarely hold a bat
 * in both hands. About 0.1 (unlike a batter) to 1.6 (bat in both hands).
 */
export function batterLikeness(body: ImgPoint[], aspect: number, bats: Box[] = []): number {
  const g = (j: number) => {
    const p = body[j];
    return p && p[2] >= 0.35 ? p : null;
  };
  const dist = (a: NonNullable<ImgPoint>, b: NonNullable<ImgPoint>) => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);
  const lw = g(J.left_wrist);
  const rw = g(J.right_wrist);
  const ls = g(J.left_shoulder);
  const rs = g(J.right_shoulder);
  let hands = 0.5;
  if (lw && rw && ls && rs) {
    const r = dist(lw, rw) / Math.max(1e-3, dist(ls, rs));
    hands = r < 0.9 ? 1 : r < 1.6 ? 0.55 : 0.25;
  }
  let crouch = 1;
  const nose = g(J.nose);
  const lh = g(J.left_hip);
  const rh = g(J.right_hip);
  const ank = [g(J.left_ankle), g(J.right_ankle)].filter((p): p is NonNullable<ImgPoint> => !!p);
  if (nose && lh && rh && ank.length) {
    const ankY = Math.max(...ank.map((p) => p[1]));
    const ratio = (ankY - (lh[1] + rh[1]) / 2) / Math.max(1e-3, ankY - nose[1]);
    if (ratio < 0.3) crouch = 0.35;
  }
  let bat = 1;
  const hand = lw && rw ? [(lw[0] + rw[0]) / 2, (lw[1] + rw[1]) / 2] : (lw ?? rw);
  if (hand && bats.some((b) => hand[0] >= b.x - b.w * 0.4 && hand[0] <= b.x + b.w * 1.4 && hand[1] >= b.y - b.h * 0.4 && hand[1] <= b.y + b.h * 1.4)) bat = 1.6;
  return hands * crouch * bat;
}

function avgVis(l: Array<{ visibility?: number }>) {
  return l.reduce((s, p) => s + (p.visibility ?? 0), 0) / l.length;
}

/** Seek a video and resolve once the frame is ready to draw (with a safety timeout). */
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return resolve();
    let timer = 0;
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    timer = window.setTimeout(done, 4000);
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}
