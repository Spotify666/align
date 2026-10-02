// Camera cuts inside a tracked shot. Broadcast and edited clips cut between cameras
// (wide shot, close-up, replay). Within one camera shot the batter's box moves and
// grows smoothly; across a cut it jumps. Analysis keeps only the camera shot that
// holds the stroke, so measurements never mix two cameras or two deliveries.

import type { ImgPoint } from "@/engine/types";

interface Box {
  cx: number;
  cy: number;
  h: number;
}

function box(body: ImgPoint[], aspect: number): Box | null {
  const pts = body.filter((p): p is NonNullable<ImgPoint> => !!p && p[2] >= 0.4);
  if (pts.length < 8) return null;
  const xs = pts.map((p) => p[0] * aspect);
  const ys = pts.map((p) => p[1]);
  const h = Math.max(...ys) - Math.min(...ys);
  return { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, h };
}

/** Frame indices where a new camera shot starts (a jump in the batter's position or size). */
export function cutsIn(body: ImgPoint[][], aspect: number): number[] {
  const cuts: number[] = [];
  let last: { b: Box; i: number } | null = null;
  for (let i = 0; i < body.length; i++) {
    const b = box(body[i]!, aspect);
    if (!b) continue;
    if (last) {
      const gap = i - last.i;
      const scale = b.h / Math.max(1e-3, last.b.h);
      const shift = Math.hypot(b.cx - last.b.cx, b.cy - last.b.cy) / Math.max(b.h, last.b.h);
      // Smooth zooms change size a few percent per frame; a cut changes it at once.
      const tol = 1 + 0.05 * Math.min(gap, 6);
      if (scale > 1.35 * tol || scale < 1 / (1.35 * tol) || shift > 0.45 * tol) cuts.push(i);
    }
    last = { b, i };
  }
  return cuts;
}

/**
 * The [start, end) frame range of the camera shot that holds `keyFrame` (the stroke), or
 * the longest one when that piece is too short to analyse. A long stretch with the batter
 * lost (a zoom-out, a cut to something else, an occlusion: at least `maxGap` frames,
 * default a third of `minFrames`) ends a piece like a cut does, and isn't analysed.
 */
export function strokeSegment(body: ImgPoint[][], aspect: number, keyFrame: number, minFrames: number, maxGap = Math.max(4, Math.round(minFrames / 3))): [number, number] {
  const seen = body.map((b) => box(b, aspect) !== null);
  const cuts = new Set(cutsIn(body, aspect));
  // Pieces of frames between cuts and long gaps, trimmed to where the batter is seen.
  const segs: Array<[number, number]> = [];
  let start = -1;
  let lastSeen = -1;
  for (let i = 0; i <= body.length; i++) {
    const end = i === body.length;
    if (!end && seen[i] && cuts.has(i) && start >= 0) {
      segs.push([start, lastSeen + 1]);
      start = -1;
    }
    if (!end && seen[i]) {
      if (start < 0) start = i;
      lastSeen = i;
    } else if (start >= 0 && (end || i - lastSeen >= maxGap)) {
      segs.push([start, lastSeen + 1]);
      start = -1;
    }
  }
  if (!segs.length) return [0, body.length];
  // The piece holding the stroke (or, when the stroke falls in a gap, the nearest piece).
  const dist = ([a, b]: [number, number]) => (keyFrame < a ? a - keyFrame : keyFrame >= b ? keyFrame - b + 1 : 0);
  const holding = segs.reduce((best, sg) => (dist(sg) < dist(best) ? sg : best), segs[0]!);
  if (holding[1] - holding[0] >= minFrames) return holding;
  return segs.reduce((best, sg) => (sg[1] - sg[0] > best[1] - best[0] ? sg : best), segs[0]!);
}
