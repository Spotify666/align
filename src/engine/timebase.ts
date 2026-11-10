// Timebase: the engine measures time as frame × (1 / fps). That is only right when the analysed
// frames are evenly spaced at the declared rate. This module checks that assumption on the
// frame timestamps themselves and, when it doesn't hold (variable frame rate, dropped frames,
// a declared rate that disagrees with the timestamps), resamples the tracks onto an even grid
// so every later step sees the same kind of input whatever the source.
//
// Deterministic and category-independent. An evenly spaced observation is returned untouched
// (the same object), so results on regular input cannot change.

import type { CameraPoint, CaptureObservation, ImgPoint, WorldPoint } from "./types";

export const TIMEBASE_VERSION = "timebase-1.0.0" as const;

/** Tolerances (shares of the frame interval). Not acceptance thresholds: they only decide whether to resample. */
export const TIMEBASE_TOLERANCE = {
  /** 95th-percentile deviation of a frame interval from the median one. */
  jitter: 0.2,
  /** A gap this many intervals long counts as dropped frames. */
  gap: 1.6,
  /** Declared frame rate against the one the timestamps show. */
  drift: 0.08,
} as const;

export interface Timebase {
  kind: "photo" | "uniform" | "irregular" | "unknown";
  frames: number;
  /** Interval the declared frame rate implies (ms); null when no rate was declared. */
  declaredMs: number | null;
  /** Median interval between analysed frames (ms). */
  medianMs: number | null;
  /** 95th-percentile deviation from the median interval (ms). */
  jitterMs: number | null;
  /** Longest interval (ms). */
  maxGapMs: number | null;
  /** Frames missing from an even grid at the median interval. */
  dropped: number;
  /** (timestamps' rate − declared rate) / declared rate; null when either is unknown. */
  drift: number | null;
  monotonic: boolean;
  /** What was found, in words; empty when the timebase is even. */
  issues: string[];
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))]!;

export function assessTimebase(obs: CaptureObservation): Timebase {
  const n = obs.t.length;
  const declaredMs = obs.media.fps && obs.media.fps > 0 ? 1000 / obs.media.fps : null;
  const none = { frames: n, declaredMs, medianMs: null, jitterMs: null, maxGapMs: null, dropped: 0, drift: null, monotonic: true, issues: [] as string[] };
  if (obs.media.kind === "photo") return { kind: "photo", ...none };
  if (n < 3) return { kind: "unknown", ...none, issues: ["Too few frames to check their timing."] };

  const d: number[] = [];
  let monotonic = true;
  for (let i = 1; i < n; i++) {
    const step = obs.t[i]! - obs.t[i - 1]!;
    if (!(step > 0)) monotonic = false;
    d.push(step);
  }
  const sorted = [...d].sort((a, b) => a - b);
  const medianMs = quantile(sorted, 0.5);
  if (!monotonic || !(medianMs > 0)) return { kind: "unknown", ...none, monotonic, issues: ["Frame times don't run forward, so timing can't be trusted."] };
  const jitterMs = quantile(d.map((x) => Math.abs(x - medianMs)).sort((a, b) => a - b), 0.95);
  const maxGapMs = sorted[sorted.length - 1]!;
  const dropped = d.reduce((s, x) => s + (x >= TIMEBASE_TOLERANCE.gap * medianMs ? Math.round(x / medianMs) - 1 : 0), 0);
  const spanMs = obs.t[n - 1]! - obs.t[0]!;
  const meanMs = spanMs / (n - 1);
  const drift = declaredMs ? declaredMs / meanMs - 1 : null;

  const issues: string[] = [];
  if (jitterMs > TIMEBASE_TOLERANCE.jitter * medianMs) issues.push(`Frames are unevenly spaced (within ${Math.round(jitterMs)} ms of a ${Math.round(medianMs)} ms step): a variable frame rate.`);
  if (dropped > 0) issues.push(`${dropped} frame${dropped === 1 ? "" : "s"} missing (longest gap ${Math.round(maxGapMs)} ms).`);
  if (drift !== null && Math.abs(drift) > TIMEBASE_TOLERANCE.drift)
    issues.push(`The declared ${Math.round(1000 / declaredMs!)} fps doesn't match the frame times (${Math.round(1000 / meanMs)} fps).`);
  return { kind: issues.length ? "irregular" : "uniform", frames: n, declaredMs, medianMs, jitterMs, maxGapMs, dropped, drift, monotonic, issues };
}

type Pt = readonly number[] | null;

/** Linear blend of two tracked points; the confidence (last element) is the lower of the two. */
function lerpPoint<T extends Pt>(a: T, b: T, w: number): T {
  if (!a || !b) return null as T;
  const out = a.map((v, k) => (k === a.length - 1 ? Math.min(v, b[k]!) : v + (b[k]! - v) * w));
  return out as unknown as T;
}

/**
 * The observation on an even time grid. Returned unchanged when the frames are already evenly
 * spaced at the declared rate. Otherwise every track is interpolated linearly between its two
 * neighbouring frames onto a grid at the median frame interval; a grid point inside a gap longer
 * than the tolerance is left unseen (null) rather than invented, and so are points whose
 * neighbours weren't tracked.
 */
export function normalizeTimebase(obs: CaptureObservation): { obs: CaptureObservation; timebase: Timebase; resampled: boolean } {
  const timebase = assessTimebase(obs);
  if (timebase.kind !== "irregular" || !timebase.medianMs) return { obs, timebase, resampled: false };
  const step = timebase.medianMs;
  const t0 = obs.t[0]!;
  const span = obs.t[obs.t.length - 1]! - t0;
  const n = Math.floor(span / step + 1e-6) + 1;
  // For each grid time: the source frames either side and the blend weight.
  const at: Array<{ a: number; b: number; w: number; gap: boolean }> = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * step;
    while (j < obs.t.length - 2 && obs.t[j + 1]! <= t) j++;
    const ta = obs.t[j]!;
    const tb = obs.t[j + 1]!;
    const w = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    // Inside a long gap nothing was seen: only the grid points at its ends are kept.
    const gap = tb - ta >= TIMEBASE_TOLERANCE.gap * step && w > 1e-6 && w < 1 - 1e-6;
    at.push({ a: j, b: j + 1, w, gap });
  }
  const row = <T extends Pt>(rows: T[][] | undefined): T[][] | undefined =>
    rows && at.map(({ a, b, w, gap }) => (rows[a] ?? []).map((p, k) => (gap ? (null as T) : lerpPoint(p, (rows[b] ?? [])[k] ?? (null as T), w))));
  const series = <T extends Pt>(xs: T[]): T[] => at.map(({ a, b, w, gap }) => (gap ? (null as T) : lerpPoint(xs[a] ?? (null as T), xs[b] ?? (null as T), w)));
  const nearest = ({ a, b, w }: { a: number; b: number; w: number }) => (w < 0.5 ? a : b);
  const frameOf = (f: number | null) => (f === null ? null : Math.max(0, Math.min(n - 1, Math.round((obs.t[f]! - t0) / step))));

  const out: CaptureObservation = {
    ...obs,
    media: { ...obs.media, fps: 1000 / step, frameCount: n, durationMs: obs.media.durationMs },
    camera: { ...obs.camera, ...(obs.camera.shift ? { shift: at.map((x) => obs.camera.shift![nearest(x)] ?? null) } : {}) },
    quality: { ...obs.quality, frames: obs.quality.frames },
    t: at.map((_, i) => t0 + i * step),
    body: row<ImgPoint>(obs.body)!,
    ...(obs.body3d ? { body3d: row<WorldPoint>(obs.body3d) } : {}),
    ...(obs.poseWorld ? { poseWorld: row<CameraPoint>(obs.poseWorld) } : {}),
    ...(obs.vizDepth ? { vizDepth: at.map((x) => obs.vizDepth![nearest(x)] ?? []) } : {}),
    bat: { ...obs.bat, handle: series(obs.bat.handle), toe: series(obs.bat.toe) },
    ball: { ...obs.ball, points: series(obs.ball.points) },
    marks: { bounceFrame: frameOf(obs.marks.bounceFrame), contactFrame: frameOf(obs.marks.contactFrame) },
  };
  return { obs: out, timebase, resampled: true };
}
