// Which hand bats on top, from the pose: with the bat held down (stance, defence, most of
// a stroke until the follow-through) the top hand on the handle is the front-side hand,
// the left for a right-hander and the right for a left-hander. Used to read a batter's
// handedness from the photo or clip itself instead of trusting the profile setting.

import { J, type ImgPoint } from "@/engine/types";

export interface GripRead {
  handedness: "right" | "left";
  /** Frames where the grip was clear, and the share of them that agree. */
  frames: number;
  agreement: number;
}

/**
 * Batting hand from the frames where both wrists are seen, close together (on one
 * handle), below the shoulders (bat held down) and clearly one above the other.
 * Null when fewer than `minFrames` frames show that clearly or they disagree.
 */
export function gripHandedness(bodies: ImgPoint[][], aspect: number, minFrames = 1): GripRead | null {
  let left = 0;
  let right = 0;
  for (const b of bodies) {
    const g = (j: number) => {
      const p = b?.[j];
      return p && p[2] >= 0.5 ? p : null;
    };
    const lw = g(J.left_wrist);
    const rw = g(J.right_wrist);
    const ls = g(J.left_shoulder);
    const rs = g(J.right_shoulder);
    const lh = g(J.left_hip);
    const rh = g(J.right_hip);
    if (!lw || !rw || !ls || !rs || !lh || !rh) continue;
    const trunk = Math.hypot(((ls[0] + rs[0]) / 2 - (lh[0] + rh[0]) / 2) * aspect, (ls[1] + rs[1]) / 2 - (lh[1] + rh[1]) / 2);
    if (trunk < 1e-3) continue;
    const apart = Math.hypot((lw[0] - rw[0]) * aspect, lw[1] - rw[1]) / trunk;
    // Bat held down: hands no higher than the shoulders (a raised bat flips the order).
    const shoulderY = (ls[1] + rs[1]) / 2;
    const below = Math.min(lw[1], rw[1]) > shoulderY - 0.15 * trunk;
    const stacked = Math.abs(lw[1] - rw[1]) / trunk;
    // On one handle (hands within about a trunk length; a batter's hands can sit a little
    // apart), bat down, one hand clearly higher.
    if (apart > 0.9 || !below || stacked < 0.12) continue;
    if (lw[1] < rw[1]) left++;
    else right++;
  }
  const n = left + right;
  if (n < minFrames) return null;
  const agreement = Math.max(left, right) / n;
  if (agreement < 0.75) return null;
  return { handedness: left > right ? "right" : "left", frames: n, agreement };
}

/**
 * Batting hand from where the feet stand, filmed side-on: in the stance the front foot is the
 * one nearer the bowler (a right-hander's left). Robust where the grip isn't: a stance with the
 * bat raised behind puts the bottom hand above the top hand. `bowlerSide` is the picture edge
 * the bowler is on. Null unless the feet are clearly apart along the pitch in most frames and
 * agree.
 */
export function feetHandedness(bodies: ImgPoint[][], aspect: number, bowlerSide: "left" | "right", minFrames = 3): GripRead | null {
  let left = 0;
  let right = 0;
  for (const b of bodies) {
    const g = (j: number) => {
      const p = b?.[j];
      return p && p[2] >= 0.5 ? p : null;
    };
    const la = g(J.left_ankle);
    const ra = g(J.right_ankle);
    const ls = g(J.left_shoulder);
    const lh = g(J.left_hip);
    if (!la || !ra || !ls || !lh) continue;
    const trunk = Math.hypot((ls[0] - lh[0]) * aspect, ls[1] - lh[1]);
    if (trunk < 1e-3) continue;
    const toward = (bowlerSide === "right" ? 1 : -1) * (la[0] - ra[0]) * aspect;
    // Feet at least a fifth of a trunk apart along the picture (a stance: about two thirds).
    if (Math.abs(toward) < 0.2 * trunk) continue;
    if (toward > 0) left++;
    else right++;
  }
  const n = left + right;
  if (n < minFrames) return null;
  const agreement = Math.max(left, right) / n;
  if (agreement < 0.8) return null;
  // The left foot nearer the bowler: a right-hander.
  return { handedness: left > right ? "right" : "left", frames: n, agreement };
}
