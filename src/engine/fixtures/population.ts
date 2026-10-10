// A population of synthetic shots for validation: front-foot defences across the whole
// range of technique (beginner to textbook) and the shots most often confused with them,
// across camera positions, frame rates, handedness, noise and missing bat or ball.
// Thresholds are judged against this population, never against any one clip.

import { rng } from "../math";
import type { CaptureObservation, TargetShot } from "../types";
import { generate, type GenerateOptions, type ShotScript } from "./generate";
import { bfdScript, cutScript, driveScript, ffdScript, halfDriveScript, pullScript } from "./index";

export type Family = "ffd" | "drive" | "half_drive" | "pull" | "cut" | "bfd";
export interface PopulationCase {
  id: string;
  family: Family;
  view: "side_on" | "front_on" | "behind";
  fps: number;
  evidence: "full" | "body";
  obs: CaptureObservation;
}

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();

/** A front-foot defence with randomised technique: stride, head, trunk lean (forward and sideways), knee bend, contact point. */
export function ffdVariant(r: () => number): ShotScript {
  return ffdScript({
    stride: between(r, 0.3, 0.85), // metres: a short beginner's step to a long reach (1.75 m batter)
    headFwd: between(r, -0.12, 0.25), // head well behind to well ahead of the front knee
    lean: between(r, 6, 36), // upright to strongly leaning
    hipDrop: between(r, 0, 0.14), // straight front leg to deep knee bend
    contactAhead: between(r, -0.1, 0.12),
    sideLean: between(r, -25, 25), // trunk leaning toward leg (falling away) to toward off (falling over)
    settle: between(r, 0, 0.2), // hands lift after the bottom of the downswing, as real defences show (0–0.11 × height)
  });
}

function scaleHands(s: ShotScript, rise: number): ShotScript {
  // Vary how high the follow-through finishes (drives).
  const hands = s.hands.map(([t, p]) => [t, t > 0.95 ? [p[0], p[1] + rise, p[2]] : p] as [number, [number, number, number]]);
  return { ...s, hands };
}

export function population(n: number, seed = 1): PopulationCase[] {
  const r = rng(seed);
  const out: PopulationCase[] = [];
  const families: Family[] = ["ffd", "ffd", "drive", "half_drive", "pull", "cut", "bfd"];
  for (let i = 0; i < n; i++) {
    const family = families[i % families.length]!;
    const view = pick(r, ["side_on", "side_on", "front_on", "front_on", "behind"] as const);
    const fps = pick(r, [30, 60, 120, 240]);
    const evidence = r() < 0.5 ? "full" : "body";
    const script =
      family === "ffd" ? ffdVariant(r) : family === "drive" ? scaleHands(driveScript(), between(r, -0.25, 0.1)) : family === "half_drive" ? halfDriveScript() : family === "cut" ? cutScript() : family === "bfd" ? bfdScript() : pullScript();
    const opts: GenerateOptions = {
      id: `pop_${family}_${i}`,
      label: `Population ${family} ${i}`,
      seed: Math.floor(r() * 1e6),
      statureM: 1.75, // scripts are authored in metres for this height
      durationS: 2,
      fps,
      handedness: r() < 0.25 ? "left" : "right",
      script,
      view,
      noise: between(r, 0.002, 0.008),
      // Real trackers jitter the bottom hand far more than other joints when the bat hides it.
      ...(r() < 0.4 ? { handNoise: between(r, 0.006, 0.014) } : {}),
      ...(evidence === "body" ? { withBat: false, withBall: false } : {}),
    };
    out.push({ id: opts.id, family, view, fps, evidence, obs: generate(opts) });
  }
  return out;
}

/** A back-foot defence with randomised technique: how far each foot goes back, head, sinking, hands, follow-through. */
export function bfdVariant(r: () => number): ShotScript {
  return bfdScript({
    backStep: between(r, 0.05, 0.4), // metres: barely back to a big step toward the stumps
    frontBack: between(r, 0.05, 0.4), // front foot left out in front to fully alongside
    headFwd: between(r, -0.06, 0.16), // head falling back to well forward
    sink: between(r, 0, 0.08), // tall to sinking under the ball (rising onto the toes needs heel lift, which the generator does not model)
    handsFwd: between(r, -0.08, 0.16), // played late beside the body to pushed out in front
    follow: between(r, 0, 0.1), // dead bat to a little push through
    backlift: between(r, -0.15, 0.2), // low backlift (hands rise into the ball) to high (they come down into it)
    sideLean: between(r, -6, 14), // trunk leaning toward leg (falling away) to toward off (falling over)
  });
}

/**
 * Every shot analysed as a back-foot defence: back-foot defences across the range of
 * technique, and the shots most often confused with them (a front-foot defence, a pull, a
 * cut, drives), across camera positions, frame rates, handedness, noise and missing bat or ball.
 */
export function backFootPopulation(n: number, seed = 1, target: TargetShot = "back_foot_defence"): PopulationCase[] {
  const r = rng(seed);
  const out: PopulationCase[] = [];
  const families: Family[] = ["bfd", "bfd", "ffd", "pull", "cut", "drive", "half_drive"];
  for (let i = 0; i < n; i++) {
    const family = families[i % families.length]!;
    const view = pick(r, ["side_on", "side_on", "front_on", "front_on", "behind"] as const);
    const fps = pick(r, [30, 60, 120, 240]);
    const evidence = r() < 0.5 ? "full" : "body";
    const script =
      family === "bfd" ? bfdVariant(r) : family === "ffd" ? ffdVariant(r) : family === "drive" ? scaleHands(driveScript(), between(r, -0.25, 0.1)) : family === "half_drive" ? halfDriveScript() : family === "cut" ? cutScript() : pullScript();
    const opts: GenerateOptions = {
      id: `bpop_${family}_${i}`,
      label: `Back-foot population ${family} ${i}`,
      seed: Math.floor(r() * 1e6),
      statureM: 1.75,
      durationS: 2,
      fps,
      handedness: r() < 0.25 ? "left" : "right",
      script,
      view,
      noise: between(r, 0.002, 0.008),
      ...(r() < 0.4 ? { handNoise: between(r, 0.006, 0.014) } : {}),
      ...(evidence === "body" ? { withBat: false, withBall: false } : {}),
    };
    out.push({ id: opts.id, family, view, fps, evidence, obs: { ...generate(opts), target } });
  }
  return out;
}
