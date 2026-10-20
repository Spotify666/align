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
 * The forward defence, shaped on real defences: 49 front-foot defences by international
 * batters (KU CricShot 3D pose estimates, heights and sideways positions, which those
 * broadcast-angle estimates read reliably). Set up still until 0.45 s, the bottom-hand elbow
 * bent out and higher than the top-hand elbow; a short backlift (the hands rise only to just
 * above the hip, the bat up behind them, top at 0.66 s) as the head and front shoulder start
 * toward the ball (0.55 s); the front foot strides to the pitch of the ball (lifts 0.60 s,
 * lands 0.80 s), the bat still up and the hands carried forward with the body; the front
 * knee bends and the trunk leans until the head is low over the front foot (about a fifth of
 * the batter's height lower than in the stance, as in the real defences), set by 0.88 s,
 * before the ball arrives (about 0.99 s); the bat comes down late and slowly to meet it
 * beside the pad, the hands at hip height with the top hand a hand's width above the bottom
 * one, the front elbow up toward the bowler, the back elbow tucked by the hip, the bat angled
 * down with the handle ahead; the hands give a little and hold. The back leg stays long, its
 * heel coming up.
 */
export function ffdDemoScript(): ShotScript {
  const stride = 0.66;
  const plantF = 1.15 + stride;
  const contactF = plantF + 0.02;
  return {
    smooth: "pchip",
    frontAnkle: [
      [0, [1.15, 0.08, 0]],
      [0.6, [1.15, 0.08, 0]],
      [0.7, [1.15 + stride * 0.5, 0.16, -0.02]],
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
      [0.8, [1.18 + stride * 0.25, 0.8, 0.01]],
      [0.88, [1.19 + stride * 0.27, 0.77, 0.015]],
      [2, [1.19 + stride * 0.27, 0.77, 0.015]],
    ],
    lean: [
      [0, 8],
      [0.55, 8],
      [0.88, LEAN],
      [2, LEAN],
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
      [0.86, HEAD_FWD],
      [2, HEAD_FWD],
    ],
    hands: [
      [0, stanceHands],
      [0.45, stanceHands],
      // A short backlift: the hands only just above the hip, behind it.
      [0.66, [0.95, 1.0, 0.24]],
      // Carried forward with the stride, the bat still up as the front foot lands…
      [0.82, [1.32, 0.98, 0.24]],
      // …then down to the ball: the contact key (moved so the bat's sweet spot meets the
      // ball), a little give, and hold.
      [0.99, [contactF + 0.12, 0.82, 0.2]],
      [1.12, [contactF + 0.1, 0.815, 0.2]],
      [2, [contactF + 0.1, 0.815, 0.2]],
    ],
    batDir: [
      [0, stanceBat],
      [0.45, stanceBat],
      [0.66, [-0.55, 0.83, 0.12]],
      [0.82, [-0.66, 0.74, 0.1]],
      // Angled down at contact, the handle ahead of the blade (about 22° from upright).
      [0.99, [-0.37, -0.93, 0]],
      [1.12, [-0.36, -0.93, 0]],
      [2, [-0.36, -0.93, 0]],
    ],
    // Elbows (real defences): in the stance the bottom-hand elbow is bent out, above the
    // top-hand one; at the top it stays up behind; at contact the front elbow points up
    // toward the bowler and the back elbow tucks in by the hip.
    frontElbowPole: [
      [0, [0.2, -1, 0.6]],
      [0.66, [0.2, -1, 0.6]],
      [0.9, FRONT_POLE],
      [2, FRONT_POLE],
    ],
    backElbowPole: [
      [0, BACK_POLE_STANCE],
      [0.66, [-1, 0.4, 0.4]],
      [0.92, BACK_POLE_CONTACT],
      [2, BACK_POLE_CONTACT],
    ],
    backHeelLift: [
      [0, 0],
      [0.62, 0],
      [0.88, 0.06],
      [2, 0.06],
    ],
    ball: { releaseT: 0.42, speed: 30, bounceF: 4.6, contactF, contactU: CONTACT_U, lateral: 0.3, exit: [0.9, -1.0, 0.1], visible: true },
  };
}

const LEAN = 38;
const HEAD_FWD = 0.03;
const CONTACT_U = 0.27;
const FRONT_POLE: V3 = [1, 0.35, 0.5];
const BACK_POLE_STANCE: V3 = [-0.5, 0.7, 1];
const BACK_POLE_CONTACT: V3 = [-0.6, -1, 0.3];

/**
 * The back-foot defence, shaped on real ones (83 back-foot defences by international batters
 * in the same pose estimates: heights and sideways positions). Set up still until 0.45 s; a
 * short backlift (the hands just above the hip, the bat up behind them) as the back foot goes
 * back and across toward the stumps (0.5–0.66 s); the front foot follows it back until it is
 * alongside (0.62–0.8 s); the batter stays tall and side-on, the head forward over the back
 * foot, set by 0.82 s, before the ball arrives (about 0.94 s); the bat comes down straight,
 * angled down, to meet it under the eyes with the hands at belt height, the front elbow up,
 * the back elbow tucked in by the hip; the hands give and hold.
 */
export function bfdDemoScript(): ShotScript {
  const back = 0.2;
  const frontBack = 0.4;
  const hipF = 0.95 - ((back + frontBack) / 2) * 0.894;
  const contactF = 1.05 - (0.74 - hipF);
  const contactU = 0.45;
  const handF = contactF + 0.07;
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
      [0.8, [hipF, 0.9, 0.05]],
      [2, [hipF, 0.9, 0.05]],
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
      // A short backlift: the hands just above the hip, carried back with the body.
      [0.66, [handF - 0.12, 1.06, 0.22]],
      // Up while the front foot comes alongside, then down to the ball (the contact key is
      // moved so the bat's sweet spot meets it), a little give, and hold.
      [0.81, [handF - 0.06, 1.07, 0.2]],
      [0.94, [handF, 1.03, 0.2]],
      [1.06, [handF - 0.015, 1.025, 0.2]],
      [2, [handF - 0.015, 1.025, 0.2]],
    ],
    batDir: [
      [0, stanceBat],
      [0.45, stanceBat],
      [0.66, [-0.55, 0.83, 0.12]],
      [0.81, [-0.62, 0.78, 0.1]],
      // Straight down the pitch, angled down (handle ahead of the blade).
      [0.94, [-0.2, -0.98, 0]],
      [1.06, [-0.19, -0.98, 0]],
      [2, [-0.19, -0.98, 0]],
    ],
    // Elbows as in the forward defence: the bottom-hand elbow out in the stance and up behind
    // at the top; at contact the front elbow up, the back elbow tucked by the hip.
    frontElbowPole: [
      [0, [0.2, -1, 0.6]],
      [0.66, [0.2, -1, 0.6]],
      [0.88, FRONT_POLE],
      [2, FRONT_POLE],
    ],
    backElbowPole: [
      [0, BACK_POLE_STANCE],
      [0.66, [-1, 0.4, 0.4]],
      [0.9, BACK_POLE_CONTACT],
      [2, BACK_POLE_CONTACT],
    ],
    ball: { releaseT: 0.33, speed: 30, bounceF: 7.6, contactF, contactU, lateral: 0.3, exit: [0.8, -1.4, 0.1], visible: true },
  };
}
