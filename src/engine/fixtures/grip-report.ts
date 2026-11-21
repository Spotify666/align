// How a generated batter holds the bat: read from the generator's own truth (`onFrame`), for the
// probe (scripts/motion/grip.mjs) and tests/fixture-grip.test.ts. Demo data only; read by no part of
// the analysis.

import { GRIP } from "../rig";
import { generate, type GenerateOptions } from "./generate";

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const angle = (a: V3, b: V3) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b) || 1)))) * 180) / Math.PI;
/** Closest distance between segments ab and cd. */
function segDist(a: V3, b: V3, c: V3, d: V3): number {
  let best = Infinity;
  for (let i = 0; i <= 20; i++) {
    const p: V3 = [a[0] + (b[0] - a[0]) * (i / 20), a[1] + (b[1] - a[1]) * (i / 20), a[2] + (b[2] - a[2]) * (i / 20)];
    const v = sub(d, c);
    const t = Math.max(0, Math.min(1, dot(sub(p, c), v) / (dot(v, v) || 1)));
    best = Math.min(best, len(sub(p, [c[0] + v[0] * t, c[1] + v[1] * t, c[2] + v[2] * t])));
  }
  return best;
}

export interface GripFrame {
  frame: number;
  t: number;
  /** Each elbow's bend from straight, degrees (0 straight, 180 folded shut). */
  leadBend: number;
  rearBend: number;
  /** How far each wrist is from a hand's length behind its grip (cm): 0 when the hand holds the bat. */
  leadShortCm: number;
  rearShortCm: number;
  /** Upper arm and forearm lengths, both arms (m). */
  bones: [number, number, number, number];
  /** The top hand (front wrist) nearer the handle's top than the bottom hand. */
  ordered: boolean;
  /** The blade's closest approach to the front shin's front (cm; pad thickness taken off). */
  padClearCm: number;
  /** Each elbow's bend plane (unit normal), where it is bent enough to have one (15° to 165°). */
  leadPlane: V3 | null;
  rearPlane: V3 | null;
  /** The ball, and the blade's distance from it (cm), where the ball is in flight. */
  ballCm: number | null;
  ball: V3 | null;
}

/** The blade, toe-end, as a share of the bat from the handle mark (the rest is the handle). */
const BLADE_FROM = 0.3;
/** A pad stands about 6 cm in front of the shin bone. */
const PAD_CM = 6;

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function gripReport(opts: GenerateOptions): { frames: GripFrame[]; worst: Record<string, number>; contactT: number } {
  const H = opts.statureM;
  const frames: GripFrame[] = [];
  let n = 0;
  let contactAt = 0;
  generate({
    ...opts,
    noise: 0,
    onFrame: (t, w, bat, ball, contactT) => {
      contactAt = contactT;
      const dir = sub(bat.toe, bat.handle);
      const unitDir: V3 = [dir[0] / len(dir), dir[1] / len(dir), dir[2] / len(dir)];
      const grip = (k: number): V3 => [bat.handle[0] + unitDir[0] * k, bat.handle[1] + unitDir[1] * k, bat.handle[2] + unitDir[2] * k];
      const top = grip(0);
      const bottom = grip((GRIP.top + GRIP.bottom) * H);
      const bend = (s: "left" | "right") => angle(sub(w[`${s}_elbow`], w[`${s}_shoulder`]), sub(w[`${s}_wrist`], w[`${s}_elbow`]));
      const short = (s: "left" | "right", g: V3) => Math.abs(len(sub(g, w[`${s}_wrist`])) - GRIP.hand * H) * 100;
      const blade: [V3, V3] = [grip(BLADE_FROM * len(dir)), bat.toe];
      const plane = (s: "left" | "right"): V3 | null => {
        const b = bend(s);
        if (b < 15 || b > 165) return null;
        const c = cross(sub(w[`${s}_elbow`], w[`${s}_shoulder`]), sub(w[`${s}_wrist`], w[`${s}_shoulder`]));
        return [c[0] / len(c), c[1] / len(c), c[2] / len(c)];
      };
      frames.push({
        frame: n++,
        t,
        leadBend: bend("left"),
        rearBend: bend("right"),
        leadShortCm: short("left", top),
        rearShortCm: short("right", bottom),
        bones: [len(sub(w.left_elbow, w.left_shoulder)), len(sub(w.left_wrist, w.left_elbow)), len(sub(w.right_elbow, w.right_shoulder)), len(sub(w.right_wrist, w.right_elbow))],
        ordered: dot(sub(w.right_wrist, w.left_wrist), unitDir) > 0,
        padClearCm: segDist(blade[0], blade[1], w.left_knee, w.left_ankle) * 100 - PAD_CM,
        leadPlane: plane("left"),
        rearPlane: plane("right"),
        ball,
        ballCm: ball ? segDist(blade[0], blade[1], ball, ball) * 100 : null,
      });
    },
  });
  const max = (f: (x: GripFrame) => number) => Math.max(...frames.map(f));
  // An elbow flips when its bend plane turns over between two neighbouring frames.
  let flips = 0;
  for (let i = 1; i < frames.length; i++)
    for (const k of ["leadPlane", "rearPlane"] as const) {
      const a = frames[i - 1]![k];
      const b = frames[i]![k];
      if (a && b && dot(a, b) < 0) flips++;
    }
  const min = (f: (x: GripFrame) => number) => Math.min(...frames.map(f));
  return {
    frames,
    worst: {
      leadShortCm: max((x) => x.leadShortCm),
      rearShortCm: max((x) => x.rearShortCm),
      leadBendMax: max((x) => x.leadBend),
      rearBendMax: max((x) => x.rearBend),
      rearBendMin: min((x) => x.rearBend),
      boneSpreadCm: Math.max(...[0, 1, 2, 3].map((i) => (max((x) => x.bones[i]!) - min((x) => x.bones[i]!)) * 100)),
      swaps: frames.filter((x) => !x.ordered).length,
      padClearMinCm: min((x) => x.padClearCm),
      elbowFlips: flips,
    },
    contactT: contactAt,
  };
}
