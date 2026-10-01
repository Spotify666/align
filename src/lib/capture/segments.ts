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
 * the longest one when that piece is too short to analyse.
 */
export function strokeSegment(body: ImgPoint[][], aspect: number, keyFrame: number, minFrames: number): [number, number] {
  const cuts = cutsIn(body, aspect);
  const bounds = [0, ...cuts, body.length];
  const segs: Array<[number, number]> = [];
  for (let k = 0; k < bounds.length - 1; k++) segs.push([bounds[k]!, bounds[k + 1]!]);
  const holding = segs.find(([a, b]) => keyFrame >= a && keyFrame < b);
  if (holding && holding[1] - holding[0] >= minFrames) return holding;
  return segs.reduce((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best), segs[0]!);
}
