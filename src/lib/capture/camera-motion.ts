// How the camera moved between tracked frames, from the background (the picture outside the
// batter). A phone held in the hand pans to follow the batter; without this, the pan reads as
// the batter's feet travelling. Measured on a small grey picture of each frame, from column and
// row brightness profiles with the batter's columns left out, so it costs a few hundred
// microseconds a frame and never touches the pose models.

import type { Roi } from "./pose";

export const MOTION_W = 160;

/** Brightness profile of the columns and rows of a grey picture, skipping masked columns. */
export function profiles(gray: Float32Array, w: number, h: number, skip: (x: number) => boolean): { cols: Float32Array; rows: Float32Array } {
  const cols = new Float32Array(w).fill(NaN);
  const rows = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    if (skip(x)) continue;
    let s = 0;
    for (let y = 0; y < h; y++) s += gray[y * w + x]!;
    cols[x] = s / h;
  }
  for (let y = 0; y < h; y++) {
    let s = 0;
    let k = 0;
    for (let x = 0; x < w; x++) {
      if (skip(x)) continue;
      s += gray[y * w + x]!;
      k++;
    }
    rows[y] = k ? s / k : NaN;
  }
  return { cols, rows };
}

/**
 * The shift (in profile samples, sub-sample) that best lays profile `b` over profile `a`:
 * b[i + s] ≈ a[i]. Mean absolute difference over the samples both have, the minimum refined
 * by a parabola. Null when too little overlaps or the profiles are flat.
 */
export function profileShift(a: Float32Array, b: Float32Array, maxShift: number): number | null {
  const n = a.length;
  // A profile with under 2% of brightness range has nothing to lay over (the brightness of a
  // row averaged across a textured picture can be as flat as that).
  const span = (p: Float32Array) => {
    const v = Array.from(p).filter(Number.isFinite);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  if (span(a) < 0.02 || span(b) < 0.02) return null;
  const cost = (s: number) => {
    let sum = 0;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const j = i + s;
      if (j < 0 || j >= n) continue;
      const x = a[i]!;
      const y = b[j]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sum += Math.abs(x - y);
      k++;
    }
    return k >= n * 0.3 ? sum / k : NaN;
  };
  const costs: number[] = [];
  for (let s = -maxShift; s <= maxShift; s++) costs.push(cost(s));
  let best = -1;
  costs.forEach((c, i) => {
    if (Number.isFinite(c) && (best < 0 || c < costs[best]!)) best = i;
  });
  if (best < 0) return null;
  const finite = costs.filter(Number.isFinite);
  const spread = Math.max(...finite) - Math.min(...finite);
  if (!(spread > 1e-3)) return null; // a flat background (sky, grass only) says nothing
  // Moved only if laying it over at the best shift fits clearly better than not moving it.
  const still = costs[maxShift]!;
  if (Number.isFinite(still) && costs[best]! > 0.85 * still) return 0;
  let s = best - maxShift;
  const l = costs[best - 1];
  const r = costs[best + 1];
  if (l !== undefined && r !== undefined && Number.isFinite(l) && Number.isFinite(r)) {
    const d = l - 2 * costs[best]! + r;
    if (d > 0) s += (0.5 * (l - r)) / d;
  }
  return s;
}

/** Records each tracked frame's background; `shifts()` gives the camera's movement since the first frame. */
export class CameraMotion {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w: number;
  private h: number;
  private frames: Array<{ gray: Float32Array; box: Roi | null } | undefined> = [];
  constructor(aspect: number) {
    this.w = MOTION_W;
    this.h = Math.max(16, Math.round(MOTION_W / aspect));
    this.canvas = Object.assign(document.createElement("canvas"), { width: this.w, height: this.h });
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }
  take(i: number, src: CanvasImageSource, batter: Roi | null) {
    this.ctx.drawImage(src, 0, 0, this.w, this.h);
    const px = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const gray = new Float32Array(this.w * this.h);
    for (let k = 0; k < gray.length; k++) gray[k] = (0.299 * px[k * 4]! + 0.587 * px[k * 4 + 1]! + 0.114 * px[k * 4 + 2]!) / 255;
    this.frames[i] = { gray, box: batter };
  }
  reset() {
    this.frames = [];
  }
  /** Cumulative camera shift per frame (normalised image units; + = the picture moved right/down), null where unknown. */
  shifts(): Array<[number, number] | null> {
    return cameraShifts(this.frames, this.w, this.h);
  }
}

/** Frame-to-frame shifts from the background, chained from the first frame. */
export function cameraShifts(frames: Array<{ gray: Float32Array; box: Roi | null } | undefined>, w: number, h: number): Array<[number, number] | null> {
  const out: Array<[number, number] | null> = [];
  let acc: [number, number] | null = null;
  let prev: { gray: Float32Array; box: Roi | null } | undefined;
  const maxShift = Math.round(w * 0.06);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f) {
      out.push(null);
      continue;
    }
    if (!prev || !acc) {
      acc = acc ?? [0, 0];
      out.push([acc[0], acc[1]]);
      prev = f;
      continue;
    }
    // Leave out the batter's columns in either frame, widened by half the box each side (the bat).
    const spans = [prev.box, f.box].filter((b): b is Roi => !!b).map((b) => [Math.floor((b.x - b.w / 2) * w), Math.ceil((b.x + b.w * 1.5) * w)] as const);
    const skip = (x: number) => spans.some(([a, b]) => x >= a && x <= b);
    const pa = profiles(prev.gray, w, h, skip);
    const pb = profiles(f.gray, w, h, skip);
    const dx = profileShift(pa.cols, pb.cols, maxShift);
    // Rows compared over the same stretch of background: the second frame's columns moved by the pan.
    const o = dx === null ? 0 : Math.round(dx);
    // (The batter's columns left out in both places: where they are, and where the other frame's are.)
    const rb = profiles(f.gray, w, h, (x) => skip(x) || skip(x - o) || x - o < 0 || x - o >= w).rows;
    const ra = profiles(prev.gray, w, h, (x) => skip(x) || skip(x + o) || x + o < 0 || x + o >= w).rows;
    // No usable rows (an even picture top to bottom): no vertical movement read.
    const dy = profileShift(ra, rb, Math.round(h * 0.06)) ?? (dx === null ? null : 0);
    // An unreadable frame (a flat background, the batter filling the picture) is skipped: the
    // next one is laid over the last frame that read.
    if (dx === null || dy === null) {
      out.push(null);
      continue;
    }
    acc = [acc[0] + dx / w, acc[1] + dy / h];
    out.push([acc[0], acc[1]]);
    prev = f;
  }
  return out;
}
