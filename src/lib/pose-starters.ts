// Where a new shot model starts (/models): the real batter traced from the owner's own clips
// (scripts/trace/rig.py, public/art/model-*-side.json), at the moments Aline found in them: every
// joint, and the way the bat pointed. Not a generated pose (the owner, 2026-11-17: "the base
// model itself is wrong"). Read once into pose-starters.json:
//   node scripts/pose-starters.mjs > src/lib/pose-starters.json
// tests/traced-figure.test.ts fails whenever the traced figures would give other poses.

import { MODEL_JOINTS, MOMENTS, type MomentId, type Pose, type V3 } from "@/engine/pose-model";
import type { TargetShot } from "@/engine/types";
import type { TracedFigure } from "./traced-figure";

type Xyz = [number, number, number];
export type Starters = Record<TargetShot, Record<MomentId, { joints: Record<string, Xyz>; bat: Xyz }>>;

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The starting poses from the traced figures: forward and up from the side-on clip, which sees
 * them; across from a clip of the same shot filmed from the bowler's end where there is one (the
 * back-foot defence). The front-foot defence has no such clip, so its across is its own side clip's
 * depth estimate: an estimate from one camera, said so in the editor, and never another shot's
 * footage (until 2026-11-18 it borrowed the back-foot clip's, a different movement). And the bat's
 * direction (hands to toe, in the side plane: one camera doesn't see its across).
 */
export function startersFrom(side: Record<TargetShot, TracedFigure>, front: Partial<Record<TargetShot, TracedFigure>> = {}): Starters {
  const out = {} as Starters;
  for (const shot of ["front_foot_defence", "back_foot_defence"] as const) {
    out[shot] = {} as Starters[TargetShot];
    for (const m of MOMENTS) {
      const t = side[shot].moments[m.id] ?? side[shot].moments.contact!;
      const f = front[shot]?.moments[m.id];
      const bat = t.bat ? ([round(t.bat.toe[0] - t.bat.handle[0]), round(t.bat.toe[1] - t.bat.handle[1]), 0] as Xyz) : ([0, -1, 0] as Xyz);
      const across = (k: string) => (f ? f.pose[k]![2] : t.pose[k]![2]);
      out[shot][m.id] = { joints: Object.fromEntries(MODEL_JOINTS.map((k) => [k, [t.pose[k]![0], t.pose[k]![1], across(k)] as Xyz])), bat };
    }
  }
  return out;
}

export const asPose = (joints: Record<string, readonly [number, number, number]>): Pose => Object.fromEntries(MODEL_JOINTS.map((k) => [k, joints[k] as V3])) as Pose;
