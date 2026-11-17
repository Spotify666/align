// The textbook defence the engine's own generator makes, read at the moments Aline finds in it,
// as model poses. Tests that set a generated clip against a model need a model from the same
// movement; new models start from a real batter instead (src/lib/pose-starters.ts).

import { analyze } from "@/engine/analyze";
import { bfdScript, ffdScript } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import { MODEL_JOINTS, MOMENTS, ground, pelvisOf, type MomentId, type Pose } from "@/engine/pose-model";
import { semanticToJoint } from "@/engine/scene";
import { J, type TargetShot } from "@/engine/types";

const H = 1.75;
const round = (n: number) => Math.round(n * 10000) / 10000;

export type Generated = Record<TargetShot, Record<MomentId, Record<string, [number, number, number]>>>;

export function generatedPoses(): Generated {
  const out = {} as Generated;
  for (const shot of ["front_foot_defence", "back_foot_defence"] as const) {
    const made = generate({
      id: `starter_${shot}`, label: "Textbook", seed: 5, fps: 120, durationS: 2, statureM: H, handedness: "right",
      script: shot === "front_foot_defence" ? ffdScript() : bfdScript(), include3d: true, noise: 0,
    });
    const obs = shot === "back_foot_defence" ? { ...made, target: shot } : made;
    const payload = analyze(obs, { analysisId: `starter_${shot}`, createdAt: "2026-11-16T00:00:00.000Z" });
    const world = (frame: number): Pose => {
      const p = {} as Pose;
      for (const k of MODEL_JOINTS) {
        const w = obs.body3d![frame]![J[semanticToJoint(k, "left")]]!;
        p[k] = [w[0] / H, w[1] / H, w[2] / H];
      }
      return p;
    };
    const contactFrame = payload.events.find((e) => e.type === "contact")!.frame;
    const origin = pelvisOf(world(contactFrame));
    const lift = (ground(world(contactFrame)).head[1] - world(contactFrame).head[1]);
    out[shot] = {} as Generated[TargetShot];
    for (const m of MOMENTS) {
      const frame = payload.events.find((e) => e.type === m.event[shot])?.frame ?? contactFrame;
      const pose = world(frame);
      out[shot][m.id] = Object.fromEntries(MODEL_JOINTS.map((k) => [k, [round(pose[k][0] - origin[0]), round(pose[k][1] + lift), round(pose[k][2] - origin[2])] as [number, number, number]]));
    }
  }
  return out;
}

