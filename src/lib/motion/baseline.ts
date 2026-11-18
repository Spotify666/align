// The way a take was played before the shared fit (until 2026-11-18, components/home/motion-figure):
// each frame's tracked joints as they were, blended straight between frames, the bat put in the
// hands by `placeBat`. Kept only to measure the fit against (quality.ts, docs/15). Read by no screen.

import { MODEL_JOINTS, placeBat, type Pose } from "@/engine/pose-model";
import { GRIP, add, lerp, mul, slerpDir, sub, unit, type V3 } from "@/engine/rig";
import { evidence, frameAt, wristFromGrip, type Fitted } from "./fit";
import type { Played } from "./quality";
import type { Take } from "./types";

export function playedBefore(take: Take, fit: Fitted): Played {
  const { raw, bat } = evidence(take);
  const at = (t: number): Pose => {
    const { i, k } = frameAt(take.times, t);
    const j = Math.min(take.times.length - 1, i + 1);
    const pose = {} as Pose;
    for (const name of MODEL_JOINTS) {
      const a = raw[i]![name]?.p ?? raw[j]![name]?.p ?? fit.poses[i]![name];
      const b = raw[j]![name]?.p ?? a;
      pose[name] = lerp(a, b, k);
    }
    const da = bat[i]!.dir;
    const db = bat[j]!.dir ?? da;
    const dir: V3 | null = da && db ? slerpDir(da, db, k) : da;
    return dir ? placeBat(pose, dir) : pose;
  };
  return { times: take.times, at, grip: () => "both", feet: fit.feet };
}

/** A generated take's truth, played the same way (straight between frames): what the source itself measures. */
export function playedTruth(take: Take, fit: Fitted): Played | null {
  const truth = take.truth;
  if (!truth) return null;
  const k = take.units === "metre" ? 1 / take.statureM : 1;
  const P = (v: number[]): V3 => [v[0]! * k, v[1]! * k, v[2]! * k];
  const frame = (f: number): Pose => {
    const pose = {} as Pose;
    for (const name of MODEL_JOINTS) pose[name] = P(truth.joints[name][f]!);
    if (take.wristMark === "grip") for (const s of ["front", "back"] as const) pose[`${s}_wrist`] = wristFromGrip(pose[`${s}_wrist`], pose[`${s}_elbow`]);
    if (truth.bat) {
      const h = P(truth.bat.handle[f]!);
      const toe = P(truth.bat.toe[f]!);
      const d = unit(sub(toe, h)) ?? ([0, -1, 0] as V3);
      // The tracked handle marks the top hand's grip (fit.ts): the rig's handle point is GRIP.top further down.
      pose.bat_handle = add(h, mul(d, GRIP.top));
      pose.bat_toe = toe;
    }
    return pose;
  };
  const at = (t: number): Pose => {
    const { i, k: w } = frameAt(take.times, t);
    const a = frame(i);
    const b = frame(Math.min(take.times.length - 1, i + 1));
    const out = {} as Pose;
    for (const key of Object.keys(a) as Array<keyof Pose>) out[key] = lerp(a[key]!, b[key]!, w) as never;
    return out;
  };
  return { times: take.times, at, grip: () => "both", feet: fit.feet };
}
