"use client";
// Scans a whole clip before anything is analysed: where are the people, where does the
// movement happen, where does the camera cut? From that it proposes the shot windows,
// so long clips, practice sessions with many shots and broadcast footage with replays
// and close-ups all work without the athlete trimming first.

import type { ObjectDetector as OD, PoseLandmarker as PL } from "@mediapipe/tasks-vision";
import { J } from "@/engine/types";
import { bodyBox, detectObjects, detectStill, roiAround, seek, stillInput, type Box, type PoseFrame, type Roi } from "./pose";
import { playFrames } from "./frames";
import type { DecodedVideo } from "./decoder";
import { makeCanvas, type AnyCanvas } from "./canvas";

export interface ScanSample {
  /** Media time, seconds. */
  t: number;
  people: Box[];
  /** Bat-like detections (weak; a hint for who is batting). */
  bats: Box[];
  /** Mean absolute luma change since the previous sample around the main person (0..1). */
  motion: number;
  /** A camera cut happened between the previous sample and this one. */
  cut: boolean;
  /** Small JPEG of the frame for choosing a shot. */
  thumb: string;
  /**
   * Head height of the main person as a fraction of their standing height (from pose),
   * when pose ran. A front-foot stroke takes the head low; walking keeps it tall.
   */
  head?: number | null;
}

export interface ShotWindow {
  start: number;
  end: number;
  /** Media time of the movement peak (usually the stroke). */
  peak: number;
  score: number;
  thumb: string;
  /** Pose confirmed a whole person (head to feet) at the stroke. */
  verified?: boolean;
}

export interface ScanResult {
  samples: ScanSample[];
  windows: ShotWindow[];
  /** Media time scanned up to (long clips are scanned in their first minutes only). */
  scannedTo: number;
  cuts: number;
}

export const MAX_SCAN_SEC = 300;
export const THUMB_W = 176;
const LUMA_W = 48;

type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;

/** A person box that shows a whole standing body inside the frame. */
export const fullBodyBox = (b: Box) => b.h >= 0.1 && b.y > 0.004 && b.y + b.h < 0.996 && b.score >= 0.35;

/** Upper bound on the model pass, so a long clip on a slow phone still finishes quickly. */
const MODEL_BUDGET_MS = 6000;
const MAX_PROBES = 72;

/**
 * Scan a clip in two passes:
 *  1. Movement and camera cuts on every frame playback gives us (a few ms each, no models).
 *  2. People, bat hints and posture (how low the head is) on a limited set of frames:
 *     even coverage first, then more frames where the head dipped or the movement peaked,
 *     within a time budget.
 */
export async function scanVideo(
  video: HTMLVideoElement,
  det: OD,
  windowMedia: number,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  pose?: PL,
  src?: DecodedVideo | null,
): Promise<ScanResult> {
  const duration = video.duration;
  const limit = Math.min(duration, MAX_SCAN_SEC);
  const aspect = video.videoWidth / Math.max(1, video.videoHeight);

  const detCanvas = canvas(aspect >= 1 ? 480 : Math.round(480 * aspect), aspect >= 1 ? Math.round(480 / aspect) : 480);
  // On the page: real canvases (thumbnails as data URLs).
  const thumbCanvas = canvas(THUMB_W, Math.round(THUMB_W / aspect)) as HTMLCanvasElement;
  const dctx = detCanvas.getContext("2d") as CanvasRenderingContext2D;
  const tctx = thumbCanvas.getContext("2d")!;
  const probes = new Map<number, ScanSample>();

  /** People, bat hints and posture on a frame (the one the video shows, or a decoded one). */
  const look = (key: number, from: HTMLVideoElement | AnyCanvas = video) => {
    dctx.drawImage(from, 0, 0, detCanvas.width, detCanvas.height);
    const { people, bats } = detectObjects(det, detCanvas);
    let head: number | null = null;
    const main = pose ? people.filter(fullBodyBox).sort((a, b) => b.h - a.h)[0] : undefined;
    if (pose && main) head = headRatio(detectStill(pose, from, roiAround(main, aspect, 0.3)), aspect);
    tctx.drawImage(detCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    probes.set(key, { t: key, people, bats, head, motion: 0, cut: false, thumb: thumbCanvas.toDataURL("image/jpeg", 0.6) });
  };
  /** Small JPEG of a frame (for choosing a shot). */
  const thumbOf = (from: HTMLVideoElement | AnyCanvas) => {
    tctx.drawImage(from, 0, 0, thumbCanvas.width, thumbCanvas.height);
    return thumbCanvas.toDataURL("image/jpeg", 0.6);
  };
  const fresh = (t: number) => t >= 0 && t <= limit && !probes.has(keyOf(t));
  const probe = async (t: number) => {
    if (!fresh(t)) return;
    await seek(video, keyOf(t));
    look(keyOf(t));
  };
  let started = performance.now();
  const budgetLeft = () => probes.size < MAX_PROBES && performance.now() - started < MODEL_BUDGET_MS && !signal?.aborted;
  const report = () => onProgress(0.35 + 0.65 * Math.min(1, Math.max(probes.size / MAX_PROBES, (performance.now() - started) / MODEL_BUDGET_MS)));

  const every = Math.max(0.8, limit / 24);
  if (src) {
    // Exact frames decoded from the file on a fixed grid: the same frames, so the same
    // shots, on every run. Posture (how low the head is) every 0.3 s across the whole clip,
    // so every stroke is seen; people every ~1.5 s, the posture crop following the batter
    // in between; movement and cuts on the same pass. No time budget, which would vary
    // with the device.
    try {
      const motion = await densePass(src, video, limit, det, pose, (f) => onProgress(f), signal, (smp) => probes.set(smp.t, smp), thumbOf);
      return finishScan([...probes.values()].sort((a, b) => a.t - b.t), motion, limit, windowMedia, onProgress);
    } catch {
      probes.clear(); // decoder failed on this device: play through instead
    }
  }

  // Pass 1 also takes the even coverage (every part of the clip gets looked at) on the
  // frames it is already playing, so none of them needs a seek.
  const motion = await motionPass(video, limit, (f) => onProgress(f * 0.35), signal, { every, look: (t) => look(keyOf(t)) });
  started = performance.now();
  for (let t = every / 2; t < limit && !signal?.aborted; t += every) {
    if ([...probes.keys()].some((k) => Math.abs(k - t) < every / 2)) continue;
    await probe(t);
    report();
  }
  // Refine: around head dips first (a stroke), then around the strongest movement.
  const refine: number[] = [];
  const sorted = () => [...probes.values()].sort((a, b) => a.t - b.t);
  const cov = sorted();
  cov.forEach((s, i) => {
    const nb = [cov[i - 1]?.head, cov[i + 1]?.head].filter((h): h is number => typeof h === "number");
    if (typeof s.head === "number" && nb.length && Math.max(...nb) - s.head >= 0.04) refine.push(s.t);
  });
  for (const p of motionPeaks(motion, 6)) if (!refine.some((r) => Math.abs(r - p) < 1)) refine.push(p);
  for (const centre of refine) {
    // A short play-through around each candidate instead of a seek per probe.
    const ts = [-0.6, -0.3, 0.3, 0.6, 0.9, 1.2].map((o) => centre + o).filter(fresh);
    if (!budgetLeft() || !ts.length) continue;
    // At 4× speed (any frame within 70 ms will do), so a candidate costs about half a second.
    const missed = await playFrames(video, ts, (i) => {
      if (!budgetLeft()) return false;
      look(keyOf(ts[i]!));
      report();
    }, { frameDur: 1 / 30, rate: 4, tolerance: 0.07, stop: () => !!signal?.aborted });
    for (const i of missed ?? ts.map((_, k) => k)) {
      if (!budgetLeft()) break;
      await probe(ts[i]!);
      report();
    }
  }

  return finishScan(sorted(), motion, limit, windowMedia, onProgress);
}

export type Motion = { t: number[]; m: number[]; cut: boolean[] };

/** Movement and cuts (from the dense pass) onto the model samples, then the shot windows. */
export function finishScan(samples: ScanSample[], motion: Motion, limit: number, windowMedia: number, onProgress: (f: number) => void): ScanResult {
  let prevT = -Infinity;
  for (const s of samples) {
    let m = 0;
    let cut = false;
    for (let i = 0; i < motion.t.length; i++) {
      const t = motion.t[i]!;
      if (Math.abs(t - s.t) <= 0.2) m = Math.max(m, motion.m[i]!);
      if (t > prevT && t <= s.t && motion.cut[i]) cut = true;
    }
    s.motion = m;
    s.cut = cut && prevT > -Infinity;
    prevT = s.t;
  }
  onProgress(1);
  return { samples, windows: findWindows(samples, windowMedia, limit), scannedTo: limit, cuts: samples.filter((s) => s.cut).length };
}

/** Luma movement and cut test between consecutive samples, on any frame source. */
function motionMeter(aspect: number): { take: (t: number, from: CanvasImageSource) => void; reset: () => void; out: Motion } {
  const lumaCanvas = canvas(LUMA_W, Math.max(8, Math.round(LUMA_W / aspect)));
  const lctx = lumaCanvas.getContext("2d", { willReadFrequently: true })!;
  const out: Motion = { t: [], m: [], cut: [] };
  let prevLuma: Float32Array | null = null;
  let prevHist: Float32Array | null = null;
  const take = (t: number, from: CanvasImageSource) => {
    lctx.drawImage(from, 0, 0, lumaCanvas.width, lumaCanvas.height);
    const px = lctx.getImageData(0, 0, lumaCanvas.width, lumaCanvas.height).data;
    const luma = new Float32Array(lumaCanvas.width * lumaCanvas.height);
    const hist = new Float32Array(16);
    for (let i = 0; i < luma.length; i++) {
      const g = (0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!) / 255;
      luma[i] = g;
      hist[Math.min(15, Math.floor(g * 16))]! += 1 / luma.length;
    }
    let cut = false;
    let m = 0;
    if (prevLuma && prevHist) {
      let h = 0;
      for (let k = 0; k < 16; k++) h += Math.abs(hist[k]! - prevHist[k]!);
      let g = 0;
      for (let i = 0; i < luma.length; i++) g += Math.abs(luma[i]! - prevLuma[i]!);
      g /= luma.length;
      cut = h > 0.6 || g > 0.2;
      m = cut ? 0 : g;
    }
    prevLuma = luma;
    prevHist = hist;
    out.t.push(t);
    out.m.push(m);
    out.cut.push(cut);
  };
  const reset = () => {
    out.t.length = 0;
    out.m.length = 0;
    out.cut.length = 0;
    prevLuma = null;
    prevHist = null;
  };
  return { take, reset, out };
}

type GridEntry = { t: number; motion: boolean; posture: number };
const DET_EVERY = 5;
const isDetection = (g: GridEntry) => g.posture >= 0 && g.posture % DET_EVERY === 0;
/** Detection frames drawn (not measured) before a part starts, so its canvases match one pass. */
const WARM_DETECTIONS = 3;
const keyOf = (t: number) => Math.round(t * 100) / 100;

/**
 * The exact-frame scan's fixed grids: movement and cuts every ~0.08 s, posture every 0.3 s
 * (at most 240 frames), people every fifth posture frame.
 */
export function scanGrid(limit: number): GridEntry[] {
  const step = Math.max(0.08, limit / 500);
  const postureStep = Math.max(0.3, limit / 240);
  const grid: GridEntry[] = [];
  for (let k = 0; k * step < limit - 0.02; k++) grid.push({ t: keyOf(k * step), motion: true, posture: -1 });
  for (let k = 0; postureStep / 2 + k * postureStep < limit; k++) grid.push({ t: keyOf(postureStep / 2 + k * postureStep), motion: false, posture: k });
  return grid.sort((a, b) => a.t - b.t || a.posture - b.posture);
}

/**
 * Split the grid into up to `n` parts that can be scanned separately (on several cores) and
 * give exactly the samples one pass gives: each part starts on a frame where people are
 * detected (the posture crop starts afresh there), and reads the movement frame before its
 * first one, so its first movement reading compares with the same frame.
 */
export function splitGrid(grid: GridEntry[], n: number): Array<{ from: number; to: number }> {
  const starts = grid.map((g, i) => (g.posture >= 0 && g.posture % DET_EVERY === 0 ? i : -1)).filter((i) => i > 0);
  const parts = Math.max(1, Math.min(n, starts.length + 1));
  const cuts: number[] = [];
  for (let k = 1; k < parts; k++) {
    const target = (grid.length * k) / parts;
    const best = starts.reduce((b, i) => (Math.abs(i - target) < Math.abs(b - target) ? i : b), starts[0]!);
    if (!cuts.includes(best) && best > (cuts[cuts.length - 1] ?? 0)) cuts.push(best);
  }
  const bounds = [0, ...cuts, grid.length];
  return bounds.slice(1).map((to, k) => ({ from: bounds[k]!, to }));
}

export interface ScanPart {
  samples: ScanSample[];
  motion: Motion;
}

/**
 * Scan grid entries [from, to) on exactly decoded frames: movement and cuts, people and
 * bat hints on detection frames, posture (how low the head is) on posture frames, the crop
 * following the batter between detections. Runs on the page or in a worker.
 */
export async function scanPart(
  src: DecodedVideo,
  aspect: number,
  limit: number,
  grid: GridEntry[],
  part: { from: number; to: number },
  det: OD,
  pose: PL | undefined,
  onProgress: (t: number) => void,
  stop: () => boolean,
  thumbOf: (from: AnyCanvas) => string,
): Promise<ScanPart> {
  const meter = motionMeter(aspect);
  const detCanvas = canvas(aspect >= 1 ? 480 : Math.round(480 * aspect), aspect >= 1 ? Math.round(480 / aspect) : 480);
  const dctx = detCanvas.getContext("2d") as CanvasRenderingContext2D;
  // The movement frame before this part: read, not reported.
  let lead = -1;
  for (let i = part.from - 1; i >= 0 && lead < 0; i--) if (grid[i]!.motion) lead = i;
  const idx = [...(lead >= 0 ? [lead] : []), ...Array.from({ length: part.to - part.from }, (_, k) => part.from + k)];
  const samples: ScanSample[] = [];
  let people: Box[] = [];
  let bats: Box[] = [];
  let thumb = "";
  let crop: Roi | null = null;
  await src.read(
    idx.map((i) => grid[i]!.t),
    (k, frame) => {
      if (stop()) return false;
      const g = grid[idx[k]!]!;
      if (g.motion) meter.take(g.t, frame);
      if (idx[k] === lead) return;
      if (g.posture >= 0) {
        const detected = g.posture % DET_EVERY === 0;
        if (detected) {
          dctx.drawImage(frame, 0, 0, detCanvas.width, detCanvas.height);
          ({ people, bats } = detectObjects(det, detCanvas));
          thumb = thumbOf(detCanvas);
          const main = people.filter(fullBodyBox).sort((a, b) => b.h - a.h)[0];
          crop = main ? roiAround(main, aspect, 0.3) : null;
        }
        let head: number | null = null;
        if (pose && crop) {
          const p = detectStill(pose, frame, crop);
          head = headRatio(p, aspect);
          // Follow the batter between detections.
          const b = bodyBox(p.body);
          if (b) crop = roiAround(b, aspect, 0.3);
        }
        samples.push({ t: g.t, people, bats: detected ? bats : [], head, motion: 0, cut: false, thumb });
      }
      onProgress(g.t);
    },
    stop,
  );
  const motion = meter.out;
  if (lead >= 0) for (const a of [motion.t, motion.m, motion.cut] as unknown[][]) a.shift();
  return { samples, motion };
}

/** The models of scanPart, run elsewhere (a worker) on bitmaps the page drew. */
export interface RemoteModels {
  /** People and bat hints in a bitmap of the detection canvas. */
  objects(image: ImageBitmap): Promise<{ people: Box[]; bats: Box[] }>;
  /** The scan pose on a stillInput bitmap for `roi`. */
  still(image: ImageBitmap, roi: Roi): Promise<PoseFrame>;
}

/**
 * scanPart with the models in a worker and every pixel drawn on the page, exactly as
 * scanPart draws it: the same decoded frames on the decoder's own canvas, the same scaling
 * into the detection canvas and the pose crop, straight from that canvas. Only the finished
 * images go to the worker, so the samples are the page's. Each frame waits on the canvas
 * (decoding held back) while its models run.
 */
export async function scanPartRemote(
  src: DecodedVideo,
  aspect: number,
  grid: GridEntry[],
  part: { from: number; to: number },
  models: RemoteModels,
  onProgress: (t: number) => void,
  stop: () => boolean,
  thumbOf: (from: AnyCanvas) => string,
): Promise<ScanPart> {
  const meter = motionMeter(aspect);
  const detCanvas = canvas(aspect >= 1 ? 480 : Math.round(480 * aspect), aspect >= 1 ? Math.round(480 / aspect) : 480);
  const dctx = detCanvas.getContext("2d") as CanvasRenderingContext2D;
  const cropInto = canvas(16, 16);
  // A canvas drawn on keeps a faint trace of the frame before at its edges, so the
  // detection and movement canvases must have seen the same frames as in one pass: the
  // part starts a few detection frames early, drawing (not measuring) on its way in.
  let from = part.from;
  for (let n = 0; n < WARM_DETECTIONS && from > 0; ) if (isDetection(grid[--from]!)) n++;
  const idx = Array.from({ length: part.to - from }, (_, k) => from + k);
  let warmMotion = 0;
  const samples: ScanSample[] = [];
  let people: Box[] = [];
  let bats: Box[] = [];
  let thumb = "";
  let crop: Roi | null = null;
  await src.read(
    idx.map((i) => grid[i]!.t),
    async (k, frame) => {
      if (stop()) return false;
      const g = grid[idx[k]!]!;
      if (g.motion) meter.take(g.t, frame);
      if (idx[k]! < part.from) {
        if (g.motion) warmMotion++;
        if (isDetection(g)) dctx.drawImage(frame, 0, 0, detCanvas.width, detCanvas.height);
        return;
      }
      if (g.posture >= 0) {
        const detected = g.posture % DET_EVERY === 0;
        if (detected) {
          dctx.drawImage(frame, 0, 0, detCanvas.width, detCanvas.height);
          ({ people, bats } = await models.objects(await createImageBitmap(detCanvas)));
          thumb = thumbOf(detCanvas);
          const main = people.filter(fullBodyBox).sort((a, b) => b.h - a.h)[0];
          crop = main ? roiAround(main, aspect, 0.3) : null;
        }
        let head: number | null = null;
        if (crop) {
          const p = await models.still(await stillInput(frame, crop, cropInto), crop);
          head = headRatio(p, aspect);
          // Follow the batter between detections.
          const b = bodyBox(p.body);
          if (b) crop = roiAround(b, aspect, 0.3);
        }
        samples.push({ t: g.t, people, bats: detected ? bats : [], head, motion: 0, cut: false, thumb });
      }
      onProgress(g.t);
    },
    stop,
    { wait: true },
  );
  const motion = meter.out;
  for (const a of [motion.t, motion.m, motion.cut] as unknown[][]) a.splice(0, warmMotion);
  return { samples, motion };
}

/** Put scanned parts back together, in order. */
export function joinParts(parts: ScanPart[]): ScanPart {
  return {
    samples: parts.flatMap((p) => p.samples),
    motion: { t: parts.flatMap((p) => p.motion.t), m: parts.flatMap((p) => p.motion.m), cut: parts.flatMap((p) => p.motion.cut) },
  };
}

/** One exact decode pass over the whole clip on the page (see scanPart). */
async function densePass(
  src: DecodedVideo,
  video: HTMLVideoElement,
  limit: number,
  det: OD,
  pose: PL | undefined,
  onProgress: (f: number) => void,
  signal: AbortSignal | undefined,
  emit: (s: ScanSample) => void,
  thumbOf: (from: AnyCanvas) => string,
): Promise<Motion> {
  const aspect = video.videoWidth / Math.max(1, video.videoHeight);
  const grid = scanGrid(limit);
  const res = await scanPart(src, aspect, limit, grid, { from: 0, to: grid.length }, det, pose, (t) => onProgress(t / limit), () => !!signal?.aborted, thumbOf);
  res.samples.forEach(emit);
  return res.motion;
}

/** Whole-frame movement and camera cuts, sampled as densely as playback allows. */
async function motionPass(
  video: HTMLVideoElement,
  limit: number,
  onProgress: (f: number) => void,
  signal?: AbortSignal,
  coverage?: { every: number; look: (t: number) => void },
) {
  const aspect = video.videoWidth / Math.max(1, video.videoHeight);
  const meter = motionMeter(aspect);
  const out = meter.out;
  const take = (t: number) => {
    meter.take(t, video);
    onProgress(Math.min(1, t / limit));
  };

  const step = Math.max(0.08, limit / 500);
  const rvfc = (video as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(video);
  if (rvfc) {
    await seek(video, 0);
    await new Promise<void>((resolve) => {
      let next = 0;
      let finished = false;
      let last = performance.now();
      const watchdog = window.setInterval(() => {
        // Playback refused or stalled (power saving, background tab): fall back to seeking.
        if (performance.now() - last > 4000) end();
      }, 500);
      const end = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(watchdog);
        video.pause();
        video.removeEventListener("ended", end);
        resolve();
      };
      let nextLook = coverage ? coverage.every / 2 : Infinity;
      const cb = (_: number, meta: { mediaTime: number }) => {
        if (finished) return;
        last = performance.now();
        if (signal?.aborted || meta.mediaTime >= limit - 0.02) return end();
        if (meta.mediaTime >= next) {
          take(meta.mediaTime);
          next = meta.mediaTime + step;
        }
        if (coverage && meta.mediaTime >= nextLook - 0.05) {
          // Pause on this frame for the models, then carry on playing.
          video.pause();
          coverage.look(meta.mediaTime);
          while (nextLook <= meta.mediaTime + 0.05) nextLook += coverage.every;
          last = performance.now();
          rvfc(cb);
          video.play().catch(() => end());
          return;
        }
        rvfc(cb);
      };
      video.addEventListener("ended", end);
      rvfc(cb);
      // As fast as frames still arrive about every 0.15 s of video (enough for movement and cuts).
      video.playbackRate = Math.min(10, Math.max(2, limit / 5));
      video.play().catch(() => end());
    });
    video.playbackRate = 1;
  }
  if (out.t.length < Math.min(10, limit / step / 3) || (out.t.length && out.t[out.t.length - 1]! < limit * 0.8)) {
    meter.reset();
    const count = Math.min(60, Math.ceil(limit / 0.4));
    for (let i = 0; i < count && !signal?.aborted; i++) {
      const t = (limit * (i + 0.5)) / count;
      await seek(video, t);
      take(t);
    }
  }
  return out;
}

/** Times of the strongest, clearly separated movement peaks. */
function motionPeaks(mp: { t: number[]; m: number[] }, max: number): number[] {
  const sm = mp.m.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(mp.m.length - 1, i + 2); k++) {
      s += mp.m[k]!;
      n++;
    }
    return n ? s / n : 0;
  });
  const idx = sm.map((_, i) => i).filter((i) => sm[i]! > 0 && (sm[i - 1] ?? -1) <= sm[i]! && sm[i]! >= (sm[i + 1] ?? -1));
  idx.sort((a, b) => sm[b]! - sm[a]!);
  const out: number[] = [];
  for (const i of idx) {
    const t = mp.t[i]!;
    if (out.every((o) => Math.abs(o - t) > 1.5)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export interface WindowOptions {
  /**
   * Find strokes from the head dropping (front-foot shots; the default). A back-foot
   * defence keeps the head tall, so for it the windows come from movement peaks alone.
   */
  posture?: boolean;
}

/** Candidate shot windows: motion peaks with a whole batter in view, inside one camera shot. */
export function findWindows(samples: ScanSample[], windowMedia: number, duration: number, opts: WindowOptions = {}): ShotWindow[] {
  if (!samples.length) return [];
  if (duration <= windowMedia + 0.6) {
    const mid = samples[Math.floor(samples.length / 2)]!;
    return [{ start: 0, end: duration, peak: peakOf(samples) ?? mid.t, score: 1, thumb: mid.thumb }];
  }
  // Camera shots between cuts.
  const segs: Array<[number, number]> = [];
  let a = 0;
  for (let i = 1; i < samples.length; i++)
    if (samples[i]!.cut) {
      segs.push([a, i - 1]);
      a = i;
    }
  segs.push([a, samples.length - 1]);

  const m = samples.map((s, i) => {
    const lo = samples[i - 1]?.motion ?? s.motion;
    const hi = samples[i + 1]?.motion ?? s.motion;
    return (lo + 2 * s.motion + hi) / 4;
  });
  const out: ShotWindow[] = [];
  const minGap = Math.max(1.2, windowMedia * 0.6);

  // Strokes from posture: the head drops well below where it stood a moment before.
  const withHead = samples.filter((s) => typeof s.head === "number").length;
  if (opts.posture !== false && withHead >= samples.length * 0.4) {
    const head = samples.map((s) => (typeof s.head === "number" ? s.head : NaN));
    for (const [s0, s1] of segs) {
      const t0 = samples[s0]!.t;
      const t1 = s1 + 1 < samples.length ? samples[s1 + 1]!.t : duration;
      if (t1 - t0 < Math.min(1.2, windowMedia)) continue;
      const drop = head.map((h, i) => {
        if (i < s0 || i > s1 || !Number.isFinite(h)) return NaN;
        let top = -Infinity;
        for (let k = i; k >= s0 && samples[i]!.t - samples[k]!.t <= 2; k--) if (Number.isFinite(head[k]!)) top = Math.max(top, head[k]!);
        return top - h;
      });
      const peaks: number[] = [];
      for (let i = s0; i <= s1; i++) {
        const d = drop[i]!;
        if (!Number.isFinite(d) || d < 0.07) continue;
        const isMax = !(drop[i - 1]! > d) && !(drop[i + 1]! > d);
        if (isMax) peaks.push(i);
      }
      peaks.sort((x, y) => drop[y]! - drop[x]!);
      const chosen: number[] = [];
      for (const p of peaks) if (chosen.every((c) => Math.abs(samples[c]!.t - samples[p]!.t) >= minGap)) chosen.push(p);
      for (const p of chosen) {
        // The lowest head is about contact: most of the window goes before it (setup, stride).
        const peak = samples[p]!.t;
        let start = peak - 0.6 * windowMedia;
        let end = start + windowMedia;
        if (start < t0) [start, end] = [t0, Math.min(t1, t0 + windowMedia)];
        if (end > t1) [start, end] = [Math.max(t0, t1 - windowMedia), t1];
        out.push({ start, end, peak, score: 1 + drop[p]!, thumb: samples[p]!.thumb, verified: true });
      }
    }
    if (out.length) return out.sort((x, y) => y.score - x.score).slice(0, 12).sort((x, y) => x.start - y.start);
  }

  for (const [s0, s1] of segs) {
    const t0 = samples[s0]!.t;
    const t1 = s1 + 1 < samples.length ? samples[s1 + 1]!.t : duration;
    if (t1 - t0 < Math.min(1.2, windowMedia)) continue; // too short to hold a shot
    const ok = (i: number) => samples[i]!.people.some(fullBodyBox);
    const segMax = Math.max(0, ...m.slice(s0, s1 + 1));
    const peaks: number[] = [];
    const span = (i: number, sec: number) => {
      // Lowest motion within ±sec around sample i, inside this camera shot.
      let lo = Infinity;
      for (let k = i; k >= s0 && samples[i]!.t - samples[k]!.t <= sec; k--) lo = Math.min(lo, m[k]!);
      for (let k = i; k <= s1 && samples[k]!.t - samples[i]!.t <= sec; k++) lo = Math.min(lo, m[k]!);
      return lo;
    };
    for (let i = s0; i <= s1; i++) {
      const isMax = (m[i - 1] ?? -1) <= m[i]! && m[i]! >= (m[i + 1] ?? -1);
      // A stroke stands out from the movement around it (prominence), not just a busy scene.
      const prominent = m[i]! - span(i, 1) >= 0.25 * segMax;
      if (isMax && prominent && ok(i) && m[i]! >= 0.35 * segMax && m[i]! > 0.004) peaks.push(i);
    }
    peaks.sort((x, y) => m[y]! - m[x]!);
    const chosen: number[] = [];
    for (const p of peaks) if (chosen.every((c) => Math.abs(samples[c]!.t - samples[p]!.t) >= minGap)) chosen.push(p);
    for (const p of chosen) {
      const peak = samples[p]!.t;
      // The scan's motion peak is often the backlift; the stroke follows it, so more of the
      // window comes after the peak than before.
      let start = peak - 0.45 * windowMedia;
      let end = start + windowMedia;
      if (start < t0) [start, end] = [t0, Math.min(t1, t0 + windowMedia)];
      if (end > t1) [start, end] = [Math.max(t0, t1 - windowMedia), t1];
      const inside = samples.filter((s) => s.t >= start && s.t <= end);
      const presence = inside.length ? inside.filter((s) => s.people.some(fullBodyBox)).length / inside.length : 0;
      out.push({ start, end, peak, score: m[p]! * (0.3 + presence), thumb: samples[p]!.thumb });
    }
  }
  if (!out.length) {
    // Nothing moved clearly: offer the start of the longest camera shot.
    const [s0, s1] = segs.reduce((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best), segs[0]!);
    const start = samples[s0]!.t;
    const end = Math.min(duration, start + windowMedia, s1 + 1 < samples.length ? samples[s1 + 1]!.t : duration);
    return [{ start, end, peak: (start + end) / 2, score: 0, thumb: samples[Math.floor((s0 + s1) / 2)]!.thumb }];
  }
  return out
    .sort((x, y) => y.score - x.score)
    .slice(0, 12)
    .sort((x, y) => x.start - y.start);
}

function peakOf(samples: ScanSample[]): number | null {
  let best = -1;
  let at: number | null = null;
  for (const s of samples)
    if (s.motion > best) {
      best = s.motion;
      at = s.t;
    }
  return at;
}

/**
 * Confirm each window really shows a whole person at the stroke: pose must find the
 * head, hips and both feet. Close-ups, crowd shots and replays drop out. Windows are
 * returned verified-first; if none verify, all are kept so the quality check can explain.
 */
export async function verifyWindows(video: HTMLVideoElement, pose: PL, res: ScanResult): Promise<ShotWindow[]> {
  const aspect = video.videoWidth / Math.max(1, video.videoHeight);
  const ok = (p: ReturnType<typeof detectStill>) => {
    const v = (j: number) => p.body[j]?.[2] ?? 0;
    const inFrame = (j: number) => {
      const q = p.body[j];
      return !!q && q[1] <= 1.0 && q[1] >= 0;
    };
    const foot = (side: "left" | "right") =>
      (["ankle", "heel", "foot"] as const).some((part) => v(J[`${side}_${part}`]) >= 0.45 && inFrame(J[`${side}_${part}`]));
    return v(J.nose) >= 0.5 && v(J.left_hip) >= 0.5 && v(J.right_hip) >= 0.5 && foot("left") && foot("right");
  };
  const out: ShotWindow[] = [];
  // Posture-found windows are already verified; check at most six others, best first.
  const toCheck = new Set(
    res.windows
      .filter((w) => !w.verified)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
  );
  for (const w of res.windows) {
    if (w.verified || !toCheck.has(w)) {
      out.push({ ...w, verified: !!w.verified });
      continue;
    }
    const near = res.samples.reduce((best, s) => (Math.abs(s.t - w.peak) < Math.abs(best.t - w.peak) ? s : best), res.samples[0]!);
    const boxes = near.people.slice(0, 3);
    let verified = false;
    for (const t of [w.start + (w.end - w.start) * 0.15, w.peak]) {
      if (verified) break;
      await seek(video, t);
      for (const b of boxes.length ? boxes : [{ x: 0, y: 0, w: 1, h: 1, score: 1 }]) {
        if (ok(detectStill(pose, video, b.w >= 0.98 ? b : roiAround(b, aspect, 0.3)))) {
          verified = true;
          break;
        }
      }
    }
    out.push({ ...w, verified });
  }
  return out.some((w) => w.verified) ? out.filter((w) => w.verified) : out;
}

export interface BatterCandidate {
  box: Box;
  /** Share of the window's samples where this person is seen. */
  persistence: number;
  /** Union of this person's boxes across the window: where to crop for tracking. */
  extent: Roi;
  /** Share of samples where a bat was detected on this person. */
  bat: number;
  /** This person's box in each scan sample where they were matched. */
  track: Array<{ t: number; box: Box }>;
}

/** The candidate's box from the scan sample nearest `t` (within `maxGap` seconds). */
export function boxAt(c: BatterCandidate, t: number, maxGap = 0.4): Box | null {
  let best: { t: number; box: Box } | null = null;
  for (const s of c.track) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best && Math.abs(best.t - t) <= maxGap ? best.box : null;
}

const iou = (a: Box | Roi, b: Box | Roi) => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/**
 * People who could be the batter in a window, most likely first: seen through most of
 * the window, whole body in frame, and the one moving most around the stroke.
 */
export function batterCandidates(samples: ScanSample[], win: { start: number; end: number; peak: number }): { at: number; candidates: BatterCandidate[] } {
  const inside = samples.filter((s) => s.t >= win.start - 0.05 && s.t <= win.end + 0.05);
  if (!inside.length) return { at: win.peak, candidates: [] };
  // The reference frame: nearest the stroke that has people. Boxes are only valid for
  // that exact frame (broadcast cameras zoom), so the picker shows that frame.
  const withPeople = inside.filter((s) => s.people.length);
  const ref = (withPeople.length ? withPeople : inside).reduce((best, s) => (Math.abs(s.t - win.peak) < Math.abs(best.t - win.peak) ? s : best));
  const cands = ref.people.map((seed) => {
    let seen = 0;
    let withBat = 0;
    const track: Array<{ t: number; box: Box }> = [];
    let ext: Roi = { x: seed.x, y: seed.y, w: seed.w, h: seed.h };
    // Follow this person forward and backward from the reference frame (separately, so a
    // zoom or pan only has to be followed one small step at a time).
    const fwd = inside.filter((s) => s.t > ref.t).sort((a, b) => a.t - b.t);
    const back = inside.filter((s) => s.t < ref.t).sort((a, b) => b.t - a.t);
    for (const dir of [[ref, ...fwd], back]) {
      let last: Box = seed;
      for (const s of dir) {
        const match = s === ref ? seed : s.people.reduce<Box | null>((best, b) => (iou(b, last) > Math.max(0.2, best ? iou(best, last) : 0) ? b : best), null);
        if (!match) continue;
        seen++;
        last = match;
        track.push({ t: s.t, box: match });
        const g = grow(match, 0.25);
        if ((s.bats ?? []).some((b) => iou(b, g) > 0 && b.x + b.w / 2 >= g.x && b.x + b.w / 2 <= g.x + g.w)) withBat++;
        const x0 = Math.min(ext.x, match.x);
        const y0 = Math.min(ext.y, match.y);
        ext = { x: x0, y: y0, w: Math.max(ext.x + ext.w, match.x + match.w) - x0, h: Math.max(ext.y + ext.h, match.y + match.h) - y0 };
      }
    }
    return { box: seed, persistence: seen / inside.length, extent: ext, bat: seen ? withBat / seen : 0, track: track.sort((a, b) => a.t - b.t) };
  });
  const score = (c: BatterCandidate) => c.persistence * Math.sqrt(c.box.h) * c.box.score * (fullBodyBox(c.box) ? 1.4 : 0.7) * (1 + c.bat);
  const ranked = cands.filter((c) => c.persistence >= 0.25).sort((a, b) => score(b) - score(a));
  // One person can produce two overlapping boxes mid-stroke: keep the stronger.
  return { at: ref.t, candidates: ranked.filter((c, i) => ranked.slice(0, i).every((d) => iou(c.box, d.box) < 0.45)) };
}

/** Nose height above the lowest foot, over standing height estimated from leg and trunk lengths. */
export function headRatio(p: PoseFrame, aspect: number): number | null {
  const g = (j: number) => {
    const q = p.body[j];
    return q && q[2] >= 0.4 ? ([q[0] * aspect, q[1]] as const) : null;
  };
  const nose = g(J.nose);
  const feet = [J.left_ankle, J.right_ankle, J.left_heel, J.right_heel].map(g).filter((q): q is NonNullable<typeof q> => !!q);
  if (!nose || !feet.length) return null;
  const L = (a: number, b: number) => {
    const pa = g(a);
    const pb = g(b);
    return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) : NaN;
  };
  const leg = Math.max(L(J.left_hip, J.left_knee) + L(J.left_knee, J.left_ankle), L(J.right_hip, J.right_knee) + L(J.right_knee, J.right_ankle));
  const trunk = Math.max(L(J.left_hip, J.left_shoulder), L(J.right_hip, J.right_shoulder));
  if (!Number.isFinite(leg) || !Number.isFinite(trunk)) return null;
  const stature = (leg + trunk) / 0.779;
  return (Math.max(...feet.map((f) => f[1])) - nose[1]) / stature;
}

function grow(b: Box | Roi, m: number): Roi {
  const x = Math.max(0, b.x - b.w * m);
  const y = Math.max(0, b.y - b.h * m);
  return { x, y, w: Math.min(1 - x, b.w * (1 + 2 * m)), h: Math.min(1 - y, b.h * (1 + 2 * m)) };
}

function canvas(w: number, h: number): AnyCanvas {
  return makeCanvas(Math.max(8, w), Math.max(8, h));
}
