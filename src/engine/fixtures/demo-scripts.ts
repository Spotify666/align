// The two defences as the explainers demonstrate them (DEMO DATA): textbook technique with
// a person's timing. Each moves in four stages that flow into one another, and each meets
// every check Aline makes of that shot. Keys are eased with shape-preserving curves
// (`smooth: "pchip"`): a movement starts and stops smoothly and a held position stays held.
// Right-handed, metres (forward toward the bowler, up, toward the off side), seconds.

import type { ShotScript } from "./generate";

type V3 = [number, number, number];
const stanceHands: V3 = [0.98, 0.92, 0.26];
const stanceBat: V3 = [-0.22, -0.97, 0];

/**
 * The forward defence. Set up still until 0.45 s; the bat picks up straight back (top at
 * 0.66 s) as the head and front shoulder start toward the ball (0.55 s); the front foot
 * strides to the pitch of the ball (lifts 0.56 s, lands 0.80 s) and the front knee bends as
 * the weight comes onto it, the bat still up and the hands carried forward with the body;
 * head, shoulder and knee are set over the front foot by 0.86 s, before the ball arrives
 * (about 0.99 s); the bat comes down late and slowly (a swing still moving fast reads as a
 * push) to meet it beside the pad, angled down, handle ahead of the blade, and the hands
 * give a little and hold. The back leg stays long, its heel coming up.
 */
export function ffdDemoScript(): ShotScript {
  const stride = 0.66;
  const plantF = 1.15 + stride;
  const contactF = plantF + 0.02;
  return {
    smooth: "pchip",
    frontAnkle: [
      [0, [1.15, 0.08, 0]],
      [0.56, [1.15, 0.08, 0]],
      [0.68, [1.15 + stride * 0.5, 0.16, -0.02]],
      [0.8, [plantF, 0.08, -0.03]],
      [2, [plantF, 0.08, -0.03]],
    ],
    backAnkle: [
      [0, [0.75, 0.08, 0]],
      [0.6, [0.75, 0.08, 0]],
      [0.84, [0.735, 0.08, 0.01]],
      [2, [0.735, 0.08, 0.01]],
    ],
    hipC: [
      [0, [0.95, 0.88, 0.02]],
      [0.55, [0.95, 0.88, 0.02]],
      [0.8, [1.2 + stride * 0.25, 0.8, 0.01]],
      [0.88, [1.215 + stride * 0.28, 0.785, 0.015]],
      [2, [1.215 + stride * 0.28, 0.785, 0.015]],
    ],
    lean: [
      [0, 8],
      [0.55, 8],
      [0.86, 24],
      [2, 24],
    ],
    sideLean: [
      [0, 12],
      [0.55, 12],
      [0.86, 4],
      [2, 4],
    ],
    shoulderYaw: [
      [0, 0],
      [0.6, 0],
      [0.88, 12],
      [2, 12],
    ],
    hipYaw: [
      [0, 0],
      [0.6, 0],
      [0.88, 8],
      [2, 8],
    ],
    headFwd: [
      [0, 0],
      [0.55, 0],
      [0.86, 0.18],
      [2, 0.18],
    ],
    hands: [
      [0, stanceHands],
      [0.45, stanceHands],
      [0.66, [1.0, 1.2, 0.2]],
      // Carried forward with the stride, the bat still up as the front foot lands…
      [0.82, [1.4, 1.12, 0.17]],
      // …then down to the ball: the contact key (moved so the bat's sweet spot meets the
      // ball), a little give, and hold.
      [0.99, [contactF + 0.12, 0.92, 0.1]],
      [1.12, [contactF + 0.1, 0.915, 0.1]],
      [2, [contactF + 0.1, 0.915, 0.1]],
    ],
    batDir: [
      [0, stanceBat],
      [0.45, stanceBat],
      [0.66, [-0.5, 0.85, 0.15]],
      [0.82, [-0.65, 0.74, 0.12]],
      // Angled down at contact, the handle ahead of the blade (about 22° from upright).
      [0.99, [-0.37, -0.93, 0]],
      [1.12, [-0.36, -0.93, 0]],
      [2, [-0.36, -0.93, 0]],
    ],
    backHeelLift: [
      [0, 0],
      [0.62, 0],
      [0.88, 0.06],
      [2, 0.06],
    ],
    ball: { releaseT: 0.42, speed: 30, bounceF: 4.6, contactF, contactU: 0.36, lateral: 0.05, exit: [0.9, -1.0, 0.1], visible: true },
  };
}

/**
 * The back-foot defence. Set up still until 0.45 s; the bat picks up as the back foot goes
 * back and across toward the stumps (0.5–0.66 s); the front foot follows it back until it is
 * alongside (0.62–0.8 s); the batter stays tall and side-on, the head forward over the back
 * foot, set by 0.82 s, before the short ball arrives at waist height (about 0.94 s); the
 * front elbow stays high, the bat comes down straight, angled down, and the ball is met
 * under the eyes; the hands give and hold.
 */
export function bfdDemoScript(): ShotScript {
  const back = 0.2;
  const frontBack = 0.4;
  const hipF = 0.95 - ((back + frontBack) / 2) * 0.894;
  const contactF = 1.05 - (0.74 - hipF);
  const contactU = 0.9;
  const handF = contactF + 0.07;
  const handU = contactU + 0.6;
  return {
    smooth: "pchip",
    frontAnkle: [
      [0, [1.15, 0.08, 0]],
      [0.62, [1.15, 0.08, 0]],
      [0.71, [1.15 - frontBack * 0.55, 0.11, 0.02]],
      [0.8, [1.15 - frontBack, 0.08, 0.03]],
      [2, [1.15 - frontBack, 0.08, 0.03]],
    ],
    backAnkle: [
      [0, [0.75, 0.08, 0]],
      [0.5, [0.75, 0.08, 0]],
      [0.58, [0.75 - back * 0.6, 0.12, 0.05]],
      [0.66, [0.75 - back, 0.08, 0.08]],
      [2, [0.75 - back, 0.08, 0.08]],
    ],
    hipC: [
      [0, [0.95, 0.88, 0.02]],
      [0.5, [0.95, 0.88, 0.02]],
      [0.8, [hipF, 0.93, 0.05]],
      [2, [hipF, 0.93, 0.05]],
    ],
    lean: [
      [0, 8],
      [2, 8],
    ],
    sideLean: [
      [0, 12],
      [0.5, 12],
      [0.82, 4],
      [2, 4],
    ],
    shoulderYaw: [
      [0, 0],
      [0.6, 0],
      [0.86, 12],
      [2, 12],
    ],
    hipYaw: [
      [0, 0],
      [0.6, 0],
      [0.86, 8],
      [2, 8],
    ],
    headFwd: [
      [0, 0],
      [2, 0],
    ],
    hands: [
      [0, stanceHands],
      [0.45, stanceHands],
      [0.66, [handF - 0.03, handU - 0.15, 0.2]],
      // Up while the front foot comes alongside, then down to the ball.
      [0.81, [handF - 0.02, handU - 0.08, 0.17]],
      [0.94, [handF, handU, 0.12]],
      [1.06, [handF - 0.015, handU - 0.005, 0.12]],
      [2, [handF - 0.015, handU - 0.005, 0.12]],
    ],
    batDir: [
      [0, stanceBat],
      [0.45, stanceBat],
      [0.66, [-0.5, 0.84, 0.2]],
      [0.81, [-0.58, 0.78, 0.15]],
      // Straight down the pitch, angled down (handle ahead of the blade).
      [0.94, [-0.2, -0.98, 0]],
      [1.06, [-0.19, -0.98, 0]],
      [2, [-0.19, -0.98, 0]],
    ],
    ball: { releaseT: 0.33, speed: 30, bounceF: 7.6, contactF, contactU, lateral: 0.05, exit: [0.8, -1.4, 0.1], visible: true },
  };
}
