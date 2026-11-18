// How good a played motion is, measured the same way for any shot and any way of making it (the
// fit, or the old per-frame placement it replaces): on the tracked frames AND on the frames between
// them (`sub` per interval), because that is what a screen shows. Every number in the take's own
// units turned into centimetres (body heights × stature) or degrees, and each with its worst case.
// Read by no part of the analysis.

import type { Pose } from "@/engine/pose-model";
import { BAT, GRIP, angleDeg, cross, distance, dot, gripPoint, holds, palmNormal, sub, unit, type GripState, type V3 } from "@/engine/rig";
import { FIT, JOINTS, frameAt, phaseAt, wristFromGrip, type Fitted, type FootState } from "./fit";
import type { Take } from "./types";

const SIDES = ["front", "back"] as const;
type Side = (typeof SIDES)[number];

export const BONE_PAIRS: ReadonlyArray<readonly [string, (p: Pose) => number]> = [
  ["hip width", (p) => distance(p.front_hip, p.back_hip)],
  ["shoulder width", (p) => distance(p.front_shoulder, p.back_shoulder)],
  ...SIDES.flatMap((s) => [
    [`${s} upper arm`, (p: Pose) => distance(p[`${s}_shoulder`], p[`${s}_elbow`])] as const,
    [`${s} forearm`, (p: Pose) => distance(p[`${s}_elbow`], p[`${s}_wrist`])] as const,
    [`${s} thigh`, (p: Pose) => distance(p[`${s}_hip`], p[`${s}_knee`])] as const,
    [`${s} shin`, (p: Pose) => distance(p[`${s}_knee`], p[`${s}_ankle`])] as const,
  ]),
  ["bat", (p) => (p.bat_handle && p.bat_toe ? distance(p.bat_handle, p.bat_toe) : BAT.handsToToe)],
];

export interface Quality {
  samples: number;
  /** Largest spread of any bone's length over the motion, % of its median (0 = rigid), and which bone. */
  boneSpreadPct: number;
  worstBone: string;
  /** Hands on the bat: the largest error of a holding hand's wrist from its grip anchor's distance (cm), and the wrist's largest bend from its forearm (degrees). */
  gripErrCm: number;
  wristBendMaxDeg: number;
  /** Elbows or knees whose bend flipped to the other side between two neighbouring samples (bent between 15° and 165°: straight or fully folded, a bend has no side). */
  elbowFlips: number;
  kneeFlips: number;
  /** A holding palm turned more than 90° between two neighbouring samples. */
  palmFlips: number;
  /** The largest movement of a planted heel or toe within one planted stretch (cm). */
  plantedDriftCm: number;
  /** The lowest foot point (cm; below 0 is in the ground). */
  lowestFootCm: number;
  /** Samples where the blade passes through a leg (outside an intended bat–pad contact), or the shins through each other. */
  collisions: number;
  /** Mean and largest distance from the evidence it was fitted to (cm), on tracked frames, seen joints only. */
  residualMeanCm: number;
  residualMaxCm: number;
  /** Generated takes: mean and largest distance from the truth (cm), every joint. */
  truthMeanCm: number | null;
  truthMaxCm: number | null;
}

/** Closest distance between segments ab and cd. */
export function segmentDistance(a: V3, b: V3, c: V3, d: V3): number {
  const u = sub(b, a);
  const v = sub(d, c);
  const w = sub(a, c);
  const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w);
  const den = A * C - B * B;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (B * E - C * D) / den)) : 0;
  let t = C > 1e-12 ? Math.min(1, Math.max(0, (B * s + E) / C)) : 0;
  s = A > 1e-12 ? Math.min(1, Math.max(0, (B * t - D) / A)) : 0;
  t = C > 1e-12 ? Math.min(1, Math.max(0, (B * s + E) / C)) : 0;
  const p = [a[0] + u[0] * s, a[1] + u[1] * s, a[2] + u[2] * s] as const;
  const q = [c[0] + v[0] * t, c[1] + v[1] * t, c[2] + v[2] * t] as const;
  return distance(p, q);
}
/** Half-thickness of the blade, and of a padded shin and a thigh (body heights): the mannequin's own sizes (src/lib/mannequin.ts). */
export const THICK = { blade: BAT.depth / 2, shin: 0.044, thigh: 0.05 } as const;

export interface Played {
  times: number[];
  at: (t: number) => Pose;
  grip: (t: number) => GripState;
  feet: Record<Side, FootState[]>;
}

/** The measures for a played motion. `fit` gives the evidence and the feet (the same for any way of playing it). */
export function measure(play: Played, fit: Fitted, take: Take | null, sub_ = 4): Quality {
  const cm = fit.take.statureM * 100;
  const ts: Array<{ t: number; frame: number | null }> = [];
  play.times.forEach((t, i) => {
    ts.push({ t, frame: i });
    if (i + 1 < play.times.length) for (let k = 1; k < sub_; k++) ts.push({ t: t + ((play.times[i + 1]! - t) * k) / sub_, frame: null });
  });
  const poses = ts.map((x) => play.at(x.t));
  // Bones
  let boneSpreadPct = 0;
  let worstBone = "";
  for (const [name, f] of BONE_PAIRS) {
    const xs = poses.map(f).sort((a, b) => a - b);
    const med = xs[xs.length >> 1]!;
    const spread = med > 0 ? ((xs[xs.length - 1]! - xs[0]!) / med) * 100 : 0;
    if (spread > boneSpreadPct) {
      boneSpreadPct = spread;
      worstBone = name;
    }
  }
  // Hands, elbows, knees, palms
  let gripErrCm = 0, wristBendMaxDeg = 0, elbowFlips = 0, kneeFlips = 0, palmFlips = 0, collisions = 0;
  const contacts = (fit.shot.contacts ?? []).map((c) => [fit.take.events[c.from] ?? -Infinity, fit.take.events[c.to] ?? Infinity] as const);
  let prevBend: Record<string, V3 | null> = {};
  let prevPalm: Record<string, V3 | null> = {};
  poses.forEach((p, n) => {
    const g = play.grip(ts[n]!.t);
    const dir = p.bat_handle && p.bat_toe ? unit(sub(p.bat_toe, p.bat_handle)) : null;
    const bend: Record<string, V3 | null> = {};
    const palm: Record<string, V3 | null> = {};
    for (const s of SIDES) {
      for (const [key, a, b, c] of [[`elbow-${s}`, `${s}_shoulder`, `${s}_elbow`, `${s}_wrist`], [`knee-${s}`, `${s}_hip`, `${s}_knee`, `${s}_ankle`]] as const) {
        const ang = angleDeg(sub(p[b], p[a]), sub(p[c], p[b]));
        const nrm = ang > 15 && ang < 165 ? unit(cross(sub(p[c], p[a]), sub(p[b], p[a]))) : null;
        bend[key] = nrm;
        if (nrm && prevBend[key] && dot(nrm, prevBend[key]!) < 0) {
          if (key.startsWith("elbow")) elbowFlips++;
          else kneeFlips++;
        }
      }
      if (dir && p.bat_handle && holds(g, s)) {
        const grip = gripPoint(p.bat_handle, dir, s);
        gripErrCm = Math.max(gripErrCm, Math.abs(distance(p[`${s}_wrist`], grip) - GRIP.hand) * cm);
        wristBendMaxDeg = Math.max(wristBendMaxDeg, angleDeg(sub(p[`${s}_wrist`], p[`${s}_elbow`]), sub(grip, p[`${s}_wrist`])));
        palm[s] = palmNormal(p[`${s}_wrist`], grip, dir, s);
        if (prevPalm[s] && angleDeg(palm[s]!, prevPalm[s]!) > 90) palmFlips++;
      } else palm[s] = null;
    }
    prevBend = bend;
    prevPalm = palm;
    // Collisions: the blade against each leg; the shins against each other.
    if (p.bat_handle && p.bat_toe && dir) {
      const t = ts[n]!.t;
      const allowed = contacts.some(([a, b]) => t >= a && t <= b);
      if (!allowed) {
        const bladeTop = sub(p.bat_toe, [dir[0] * BAT.blade, dir[1] * BAT.blade, dir[2] * BAT.blade]);
        for (const s of SIDES) {
          if (segmentDistance(bladeTop, p.bat_toe, p[`${s}_knee`], p[`${s}_ankle`]) < THICK.blade + THICK.shin * 0.8) collisions++;
          else if (segmentDistance(bladeTop, p.bat_toe, p[`${s}_hip`], p[`${s}_knee`]) < THICK.blade + THICK.thigh * 0.8) collisions++;
        }
      }
    }
    if (segmentDistance(p.front_knee, p.front_ankle, p.back_knee, p.back_ankle) < THICK.shin * 1.2) collisions++;
  });
  // Feet
  let plantedDriftCm = 0;
  let lowestFootCm = Infinity;
  for (const p of poses) for (const s of SIDES) lowestFootCm = Math.min(lowestFootCm, p[`${s}_heel`][1] * cm, p[`${s}_foot`][1] * cm);
  for (const s of SIDES) {
    for (const [point, held] of [["heel", ["planted", "heel"]], ["foot", ["planted", "pivot"]]] as const) {
      let start: V3 | null = null;
      ts.forEach((x, n) => {
        const { i, k } = frameAt(play.times, x.t);
        const st = play.feet[s][i]!;
        const nextSt = play.feet[s][Math.min(play.times.length - 1, i + (k > 0 ? 1 : 0))]!;
        const on = (held as readonly string[]).includes(st) && (held as readonly string[]).includes(nextSt);
        if (!on) return void (start = null);
        const q = poses[n]![`${s}_${point}` as const];
        if (!start) start = q;
        else plantedDriftCm = Math.max(plantedDriftCm, distance(q, start) * cm);
      });
    }
  }
  // Against the evidence, and the truth
  const res: number[] = [];
  const tru: number[] = [];
  play.times.forEach((t, f) => {
    const p = play.at(t);
    for (const j of JOINTS) {
      const e = fit.targets[f]?.[j];
      if (e && e.c >= FIT.seenConf) res.push(distance(p[j], e.p) * cm);
      const truth = take?.truth?.joints[j]?.[f];
      if (truth) {
        const k = take!.units === "metre" ? 1 / take!.statureM : 1;
        let q: V3 = [truth[0]! * k, truth[1]! * k, truth[2]! * k];
        if (j.endsWith("wrist") && take!.wristMark === "grip") {
          const e = take!.truth!.joints[j.replace("wrist", "elbow") as typeof j]![f]!;
          q = wristFromGrip(q, [e[0]! * k, e[1]! * k, e[2]! * k]);
        }
        tru.push(distance(p[j], q) * cm);
      }
    }
  });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    samples: poses.length,
    boneSpreadPct,
    worstBone,
    gripErrCm,
    wristBendMaxDeg,
    elbowFlips,
    kneeFlips,
    palmFlips,
    plantedDriftCm,
    lowestFootCm,
    collisions,
    residualMeanCm: mean(res),
    residualMaxCm: Math.max(0, ...res),
    truthMeanCm: tru.length ? mean(tru) : null,
    truthMaxCm: tru.length ? Math.max(...tru) : null,
  };
}

/** The fit, played as a screen plays it. */
export const playedFit = (fit: Fitted, poseAt: (f: Fitted, t: number) => { pose: Pose; grip: GripState }): Played => ({
  times: fit.times,
  at: (t) => poseAt(fit, t).pose,
  grip: (t) => poseAt(fit, t).grip,
  feet: fit.feet,
});

/** The phase at each of a list of times: the same at any playback speed (the clock is the take's). */
export const phasesAt = (fit: Fitted, ts: number[]) => ts.map((t) => phaseAt(fit.shot, { events: fit.take.events, times: fit.times }, t)?.id ?? null);
