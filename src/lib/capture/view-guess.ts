// Suggests where the phone was from the batter's pose. A batter stands side-on to the
// bowler: shoulders, hips and feet are lined up along the pitch, front side nearest the
// bowler. So:
//  - side-on camera: that line runs across the image (wide horizontal spread);
//  - camera along the pitch: it runs away from the camera. The head turns to the bowler,
//    so from the bowler's end the nose is nearer the camera than the shoulders, and from
//    behind it is farther. That needs no batting hand (a mirrored clip reads the same).
//    Pass frames from before the stroke, while the batter watches the bowler: at contact
//    the head bows over the ball and its depth reads poorly.
//    Only when the head doesn't say clearly: the front side (left for a right-hander) is
//    nearer the camera from the bowler's end, farther from behind.
// Along the pitch, the side nearer the camera then gives the batting hand.
// It is only a suggestion: the athlete confirms it.

import { J, type CameraView, type Joint } from "@/engine/types";
import type { PoseFrame } from "./pose";

export interface ViewGuess {
  view: CameraView;
  bowlerSide: "left" | "right";
  confident: boolean;
  /** Along the pitch: the batting hand this geometry implies (null when unclear or side-on). */
  handedness: "right" | "left" | null;
}

const PAIRS: Array<["shoulder" | "hip" | "ankle", number]> = [
  ["shoulder", 1],
  ["hip", 0.8],
  ["ankle", 1.2],
];

export function guessView(frames: Array<Pick<PoseFrame, "body" | "world"> | null>, handedness: "right" | "left" = "right"): ViewGuess | null {
  const front = handedness === "right" ? "left" : "right";
  const back = front === "left" ? "right" : "left";
  let across = 0; // horizontal spread in the image plane (x)
  let along = 0; // spread along the camera axis (z)
  let towardCamera = 0; // > 0: front side nearer the camera
  let noseRight = 0;
  let used = 0;
  let leftNearer = 0; // > 0: the pose model's left side nearer the camera
  const facing: number[] = []; // per frame: shoulders' depth minus the nose's (> 0: facing the camera)
  for (const fr of frames) {
    if (!fr) continue;
    for (const [part, w] of PAIRS) {
      const f = fr.world[J[`${front}_${part}` as Joint]];
      const b = fr.world[J[`${back}_${part}` as Joint]];
      if (!f || !b || f[3] < 0.3 || b[3] < 0.3) continue;
      across += w * Math.abs(f[0] - b[0]);
      along += w * Math.abs(f[2] - b[2]);
      towardCamera += w * (b[2] - f[2]);
      const l = front === "left" ? f : b;
      const r = front === "left" ? b : f;
      leftNearer += w * (r[2] - l[2]);
      used++;
    }
    const nw = fr.world[J.nose];
    const lw = fr.world[J.left_shoulder];
    const rw = fr.world[J.right_shoulder];
    if (nw && lw && rw && nw[3] >= 0.3 && lw[3] >= 0.3 && rw[3] >= 0.3) facing.push((lw[2] + rw[2]) / 2 - nw[2]);
    const n2 = fr.body[J.nose];
    const l2 = fr.body[J.left_shoulder];
    const r2 = fr.body[J.right_shoulder];
    if (n2 && l2 && r2) noseRight += n2[0] - (l2[0] + r2[0]) / 2;
  }
  if (!used) return null;
  const bowlerSide = noseRight >= 0 ? "right" : "left";
  if (across >= along) return { view: "side_on", bowlerSide, confident: across > 1.6 * along, handedness: null };
  // The head: most frames facing one way, by at least 2 cm (a bowed head over the ball
  // reads a few cm; facing the camera at the stance, 10–20 cm).
  const sorted = [...facing].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const agree = facing.filter((x) => Math.sign(x) === Math.sign(med)).length / Math.max(1, facing.length);
  const headClear = facing.length >= 2 && Math.abs(med) >= 0.02 && agree >= 0.7;
  const view: CameraView = headClear ? (med > 0 ? "front_on" : "behind") : towardCamera >= 0 ? "front_on" : "behind";
  // The front side is nearer the camera from the bowler's end, farther from behind.
  const nearer = leftNearer >= 0 ? "left" : "right";
  const frontSide = view === "front_on" ? nearer : nearer === "left" ? "right" : "left";
  return {
    view,
    bowlerSide,
    confident: along > 1.6 * across && (headClear || Math.abs(towardCamera) > 0.08 * used),
    handedness: headClear && Math.abs(leftNearer) > 0.08 * used ? (frontSide === "left" ? "right" : "left") : null,
  };
}
