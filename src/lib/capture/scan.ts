"use client";
// Scans a whole clip before anything is analysed: where are the people, where does the
// movement happen, where does the camera cut? From that it proposes the shot windows,
// so long clips, practice sessions with many shots and broadcast footage with replays
// and close-ups all work without the athlete trimming first.

import type { ObjectDetector as OD, PoseLandmarker as PL } from "@mediapipe/tasks-vision";
import { J } from "@/engine/types";
import { detectObjects, detectStill, roiAround, seek, type Box, type PoseFrame, type Roi } from "./pose";

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
const THUMB_W = 176;
const LUMA_W = 48;

type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;

/** A person box that shows a whole standing body inside the frame. */
export const fullBodyBox = (b: Box) => b.h >= 0.1 && b.y > 0.004 && b.y + b.h < 0.996 && b.score >= 0.35;

export async function scanVideo(
  video: HTMLVideoElement,
  det: OD,
  windowMedia: number,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  pose?: PL,
): Promise<ScanResult> {
  const duration = video.duration;
  const limit = Math.min(duration, MAX_SCAN_SEC);
  const step = Math.min(0.5, Math.max(0.15, limit / 240));
  const aspect = video.videoWidth / Math.max(1, video.videoHeight);

  const detCanvas = canvas(aspect >= 1 ? 480 : Math.round(480 * aspect), aspect >= 1 ? Math.round(480 / aspect) : 480);
  const thumbCanvas = canvas(THUMB_W, Math.round(THUMB_W / aspect));
  const lumaCanvas = canvas(LUMA_W, Math.max(8, Math.round(LUMA_W / aspect)));
  const dctx = detCanvas.getContext("2d")!;
  const tctx = thumbCanvas.getContext("2d")!;
  const lctx = lumaCanvas.getContext("2d", { willReadFrequently: true })!;

  const samples: ScanSample[] = [];
  let prevLuma: Float32Array | null = null;
  let prevHist: Float32Array | null = null;

  const process = (t: number) => {
    dctx.drawImage(video, 0, 0, detCanvas.width, detCanvas.height);
    const { people, bats } = detectObjects(det, detCanvas);
    lctx.drawImage(detCanvas, 0, 0, lumaCanvas.width, lumaCanvas.height);
    const px = lctx.getImageData(0, 0, lumaCanvas.width, lumaCanvas.height).data;
    const luma = new Float32Array(lumaCanvas.width * lumaCanvas.height);
    const hist = new Float32Array(16);
    for (let i = 0; i < luma.length; i++) {
      const g = (0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!) / 255;
      luma[i] = g;
      hist[Math.min(15, Math.floor(g * 16))]! += 1 / luma.length;
    }
    let cut = false;
    let motion = 0;
    if (prevLuma && prevHist) {
      let h = 0;
      for (let k = 0; k < 16; k++) h += Math.abs(hist[k]! - prevHist[k]!);
      let g = 0;
      for (let i = 0; i < luma.length; i++) g += Math.abs(luma[i]! - prevLuma[i]!);
      g /= luma.length;
      cut = h > 0.6 || g > 0.2;
      // Movement around the main person (or the whole frame when nobody is found).
      const main = people.find(fullBodyBox) ?? people[0];
      const r = main ? grow(main, 0.25) : { x: 0, y: 0, w: 1, h: 1 };
      const W = lumaCanvas.width;
      const H = lumaCanvas.height;
      let d = 0;
      let n = 0;
      for (let y = Math.floor(r.y * H); y < Math.ceil((r.y + r.h) * H); y++)
        for (let x = Math.floor(r.x * W); x < Math.ceil((r.x + r.w) * W); x++) {
          const i = y * W + x;
          if (i < 0 || i >= luma.length) continue;
          d += Math.abs(luma[i]! - prevLuma[i]!);
          n++;
        }
      motion = cut ? 0 : n ? d / n : 0;
    }
    prevLuma = luma;
    prevHist = hist;
    tctx.drawImage(detCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    // Posture of the main whole person: how low is the head?
    let head: number | null = null;
    const main = pose ? people.filter(fullBodyBox).sort((a, b) => b.h - a.h)[0] : undefined;
    if (pose && main) head = headRatio(detectStill(pose, video, roiAround(main, aspect, 0.3)), aspect);
    samples.push({ t, people, bats, motion, cut, head, thumb: thumbCanvas.toDataURL("image/jpeg", 0.6) });
    onProgress(Math.min(1, t / limit));
  };

  const rvfc = (video as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(video);
  if (rvfc) {
    await seek(video, 0);
    await new Promise<void>((resolve) => {
      let next = 0;
      let finished = false;
      let lastSample = performance.now();
      const watchdog = window.setInterval(() => {
        // Playback stalled (background tab, decoder hiccup): fall through to seeking.
        if (performance.now() - lastSample > 8000) end();
      }, 1000);
      const end = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(watchdog);
        video.pause();
        video.removeEventListener("ended", end);
        resolve();
      };
      const cb = (_: number, meta: { mediaTime: number }) => {
        if (finished) return;
        if (signal?.aborted || meta.mediaTime >= limit - 0.02) return end();
        if (meta.mediaTime >= next) {
          // Pause while this frame is analysed so slow devices still sample evenly.
          video.pause();
          process(meta.mediaTime);
          lastSample = performance.now();
          next = meta.mediaTime + step;
          video.play().catch(() => end());
        }
        rvfc(cb);
      };
      video.addEventListener("ended", end);
      rvfc(cb);
      video.playbackRate = Math.min(4, Math.max(1, limit / 30));
      video.play().catch(() => end());
    });
    video.playbackRate = 1;
  }
  // Seek-based fallback (no frame callbacks, or playback was refused / stalled).
  if (samples.length < Math.min(8, limit / step / 2) || (samples.length && samples[samples.length - 1]!.t < limit * 0.8)) {
    samples.length = 0;
    prevLuma = null;
    prevHist = null;
    const count = Math.min(120, Math.ceil(limit / step));
    for (let i = 0; i < count && !signal?.aborted; i++) {
      const t = (limit * (i + 0.5)) / count;
      await seek(video, t);
      process(t);
    }
  }
  onProgress(1);
  return { samples, windows: findWindows(samples, windowMedia, limit), scannedTo: limit, cuts: samples.filter((s) => s.cut).length };
}

/** Candidate shot windows: motion peaks with a whole batter in view, inside one camera shot. */
export function findWindows(samples: ScanSample[], windowMedia: number, duration: number): ShotWindow[] {
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
  if (withHead >= samples.length * 0.4) {
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
  for (const w of res.windows) {
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

function canvas(w: number, h: number): HTMLCanvasElement {
  return Object.assign(document.createElement("canvas"), { width: Math.max(8, w), height: Math.max(8, h) });
}
