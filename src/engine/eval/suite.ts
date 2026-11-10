// The labelled synthetic evaluation set and the relations checked on it. Every case is generated
// from a script and a seed (nothing is stored), carries its expected identification, and is
// tagged with the slices it belongs to, so a report can say where a relation breaks.
//
// Honest scope: generated movement, a pinhole camera, tracker-like noise. It proves consistency
// (the same movement recorded differently gets the same result), not accuracy on real athletes.
// Real clips are evaluated outside the repo (scripts/eval/run.mjs, pairs.mjs).

import { bfdScript, cutScript, driveScript, ffdScript, pullScript } from "../fixtures";
import { generate, type GenerateOptions, type ShotScript } from "../fixtures/generate";
import { normalizeTimebase } from "../timebase";
import type { CaptureObservation, TargetShot } from "../types";
import type { Relation } from "./relations";
import { downsample, mirror, resize, timeOffset, trimStart, variableFrameRate } from "./transforms";

export type Expected = "accepted" | "not_accepted";

export interface EvalCase {
  id: string;
  obs: CaptureObservation;
  /** Must the requested category be accepted? "not_accepted": anything but a grade. */
  expected: Expected;
  fps: number;
  slices: string[];
}

const FAMILIES: Array<{ family: string; script: () => ShotScript; category: TargetShot | null }> = [
  { family: "front_foot_defence", script: () => ffdScript(), category: "front_foot_defence" },
  { family: "back_foot_defence", script: () => bfdScript(), category: "back_foot_defence" },
  { family: "drive", script: driveScript, category: null },
  { family: "pull", script: pullScript, category: null },
  { family: "cut", script: cutScript, category: null },
];

const FPS = [30, 60, 120, 240] as const;

/**
 * Families × requested category × frame rate × batting hand × camera position × evidence
 * (bat and ball tracked, or the body alone). Supported shots are asked for as themselves;
 * every shot is also asked for as the other category (a hard negative).
 */
export function evalCases(): EvalCase[] {
  const out: EvalCase[] = [];
  let seed = 500;
  for (const { family, script, category } of FAMILIES) {
    for (const target of ["front_foot_defence", "back_foot_defence"] as const) {
      for (const fps of FPS) {
        for (const handedness of ["right", "left"] as const) {
          for (const view of ["side_on", "front_on"] as const) {
            for (const evidence of ["full", "body"] as const) {
              // Keep the set small enough to run on every commit: the full grid for side-on
              // at 120 fps, and one condition changed at a time around it.
              const core = fps === 120 && handedness === "right" && view === "side_on" && evidence === "full";
              const oneOff = [fps !== 120, handedness !== "right", view !== "side_on", evidence !== "full"].filter(Boolean).length === 1;
              if (!core && !oneOff) continue;
              const opts: GenerateOptions = {
                id: `ev_${family}_as_${target === "front_foot_defence" ? "ffd" : "bfd"}_${fps}_${handedness}_${view}_${evidence}`,
                label: `${family} (${fps} fps, ${handedness}, ${view}, ${evidence})`,
                seed: seed++,
                fps,
                durationS: 2,
                statureM: 1.75,
                handedness,
                script: script(),
                view,
                withBat: evidence === "full",
                withBall: evidence === "full",
              };
              const obs = generate(opts);
              out.push({
                id: opts.id,
                obs: target === "back_foot_defence" ? { ...obs, target } : obs,
                expected: category === target ? "accepted" : "not_accepted",
                fps,
                slices: [`family:${family}`, `asked:${target}`, `fps:${fps}`, `hand:${handedness}`, `view:${view}`, `evidence:${evidence}`],
              });
            }
          }
        }
      }
    }
  }
  return out;
}

export interface RelationSpec {
  id: string;
  /** What must stay the same, in words. */
  claim: string;
  transform: (obs: CaptureObservation) => CaptureObservation;
  relation: (c: EvalCase) => Relation;
  applies?: (c: EvalCase) => boolean;
}

/** Enough frames left after halving the rate for timing to be reported at all. */
const canHalve = (c: EvalCase) => c.fps >= 120;

export const RELATIONS: RelationSpec[] = [
  { id: "mirror", claim: "A mirrored recording of the other-handed batter gets the same result.", transform: mirror, relation: () => ({ mode: "exact" }) },
  { id: "resize_half", claim: "Half the resolution changes nothing while the batter is still large enough.", transform: (o) => resize(o, 0.5), relation: () => ({ mode: "exact" }) },
  { id: "resize_double", claim: "Twice the resolution changes nothing.", transform: (o) => resize(o, 2), relation: () => ({ mode: "exact" }) },
  { id: "time_offset", claim: "Moving every timestamp moves the events with it and changes no measure.", transform: (o) => timeOffset(o, 5000), relation: () => ({ mode: "exact", timeShiftMs: 5000 }) },
  {
    id: "trim_start",
    claim: "Starting the clip 50 ms later (still in the stance) leaves events in place and measures within tolerance.",
    transform: (o) => trimStart(o, Math.round(0.05 * (o.media.fps ?? 60))),
    relation: (c) => ({ mode: "resampled", metricTolerance: 0.1, timingToleranceMs: 2000 / c.fps }),
  },
  {
    id: "half_frame_rate",
    claim: "Half the frame rate (still 60 fps or more) keeps the verdict, events within their stated uncertainty and measures within tolerance.",
    transform: (o) => downsample(o, 2),
    relation: (c) => ({ mode: "resampled", metricTolerance: 0.15, timingToleranceMs: 4000 / c.fps }),
    applies: canHalve,
  },
  {
    id: "variable_frame_rate",
    claim: "A variable-frame-rate copy, put on an even grid by the timebase step, keeps the verdict, events within uncertainty and measures within tolerance.",
    transform: (o) => normalizeTimebase(variableFrameRate(o)).obs,
    relation: (c) => ({ mode: "resampled", metricTolerance: 0.15, timingToleranceMs: 4000 / c.fps }),
    applies: canHalve,
  },
];
