// Suggests where the phone was from the batter's pose. A batter stands side-on to the
// bowler: shoulders, hips and feet are lined up along the pitch, front side nearest the
// bowler. So:
//  - side-on camera: that line runs across the image (wide horizontal spread);
//  - camera along the pitch: it runs away from the camera, and the front side (left for a
//    right-hander) is nearer the camera from the bowler's end, farther from behind.
// It is only a suggestion: the athlete confirms it.

import { J, type CameraView, type Joint } from "@/engine/types";
import type { PoseFrame } from "./pose";

export interface ViewGuess {
  view: CameraView;
  bowlerSide: "left" | "right";
  confident: boolean;
}

const PAIRS: Array<["shoulder" | "hip" | "ankle", number]> = [
  ["shoulder", 1],
  ["hip", 0.8],
  ["ankle", 1.2],
];

export function guessView(frames: Array<PoseFrame | null>, handedness: "right" | "left" = "right"): ViewGuess | null {
  const front = handedness === "right" ? "left" : "right";
  const back = front === "left" ? "right" : "left";
  let across = 0; // horizontal spread in the image plane (x)
  let along = 0; // spread along the camera axis (z)
  let towardCamera = 0; // > 0: front side nearer the camera
  let noseRight = 0;
  let used = 0;
  for (const fr of frames) {
    if (!fr) continue;
    for (const [part, w] of PAIRS) {
      const f = fr.world[J[`${front}_${part}` as Joint]];
      const b = fr.world[J[`${back}_${part}` as Joint]];
      if (!f || !b || f[3] < 0.3 || b[3] < 0.3) continue;
      across += w * Math.abs(f[0] - b[0]);
      along += w * Math.abs(f[2] - b[2]);
      towardCamera += w * (b[2] - f[2]);
      used++;
    }
    const n2 = fr.body[J.nose];
    const l2 = fr.body[J.left_shoulder];
    const r2 = fr.body[J.right_shoulder];
    if (n2 && l2 && r2) noseRight += n2[0] - (l2[0] + r2[0]) / 2;
  }
  if (!used) return null;
  const bowlerSide = noseRight >= 0 ? "right" : "left";
  if (across >= along) return { view: "side_on", bowlerSide, confident: across > 1.6 * along };
  return {
    view: towardCamera >= 0 ? "front_on" : "behind",
    bowlerSide,
    confident: along > 1.6 * across && Math.abs(towardCamera) > 0.08 * used,
  };
}
