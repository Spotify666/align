// The batter, linked frame by frame back from the moment they were identified (the
// stroke). A position read at the stroke says nothing about where the batter is a second
// earlier when the camera zooms or pans (broadcast footage): there it can hold the bowler
// or the umpire. Following the person detector's boxes back from the stroke keeps the
// identity: each step takes the box that moved and resized least, and the link stops
// where no box is close for a while (a cut: earlier frames are another camera shot).

import type { Box } from "./pose";

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;

function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / (a.w * a.h + b.w * b.h - w * h || 1);
}

/**
 * The batter's box in frames 0..`from`, linked back from `anchor` (their box at frame
 * `from`) through `people` (the detector's boxes per frame). Each step predicts where the
 * batter should be from their recent motion (a zoom or pan carries on smoothly) and takes
 * the box nearest that, if near enough. Null where the batter isn't linked: a missed
 * detection, or every frame before `maxGap` frames with no box near the prediction (a
 * cut, the batter out of shot). A missed detection never widens the search enough to take
 * someone standing nearby.
 */
export function linkBack(people: Box[][], anchor: Box, from: number, aspect: number, maxGap: number): Array<Box | null> {
  const out: Array<Box | null> = Array.from({ length: from + 1 }, () => null);
  // At the stroke: the detected box on the anchor, else the anchor itself.
  const at = (people[from] ?? []).map((b) => ({ b, o: overlap(b, anchor) })).sort((p, q) => q.o - p.o)[0];
  let cur = at && at.o >= 0.3 ? at.b : anchor;
  let last = from;
  out[from] = cur;
  // Motion per frame going back in time: centre (in frame-height units) and log size.
  let vx = 0;
  let vy = 0;
  let vs = 0;
  let steps = 0;
  for (let i = from - 1; i >= 0; i--) {
    const g = last - i;
    const px = cx(cur) * aspect + vx * g;
    const py = cy(cur) + vy * g;
    const ps = Math.log(cur.h) + vs * g;
    let pick: Box | null = null;
    let best = Infinity;
    for (const b of people[i] ?? []) {
      const shift = Math.hypot(cx(b) * aspect - px, cy(b) - py) / Math.max(b.h, Math.exp(ps));
      const scale = Math.abs(Math.log(b.h) - ps);
      if (shift > 0.45 + 0.1 * (g - 1) || scale > Math.log(1.3) + 0.08 * (g - 1)) continue;
      const cost = shift + 2 * scale;
      if (cost < best) {
        best = cost;
        pick = b;
      }
    }
    if (pick) {
      // Smoothed motion: detector boxes jitter frame to frame.
      const k = steps ? 0.5 : 1;
      vx += k * ((cx(pick) * aspect - cx(cur) * aspect) / g - vx);
      vy += k * ((cy(pick) - cy(cur)) / g - vy);
      vs += k * ((Math.log(pick.h) - Math.log(cur.h)) / g - vs);
      steps++;
      out[i] = pick;
      cur = pick;
      last = i;
    } else if (g >= maxGap) break;
  }
  return out;
}
