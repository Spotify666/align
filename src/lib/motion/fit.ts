// Fitting one take of any batting shot to Aline's one rig (src/engine/rig.ts), and playing it back.
// The same skeleton, bat, camera model and constraints for every shot: a new shot is a take and a
// shot file (types.ts), never a change here.
//
// The pipeline:
//   1. Evidence: the joints in 3D with their confidences: triangulated from two or more calibrated
//      views (with each view's reprojection error), or one camera's 3D estimate (its depth labelled
//      an estimate), in body heights, by role (front / back).
//   2. One skeleton per take: each bone's length fitted once (a confidence-weighted median over the
//      take), then held fixed in every frame and every frame between.
//   3. Time: confidence-weighted local-linear smoothing on the real frame times, never across an
//      impact (bat on ball), so tracker noise goes and the action's own speed stays.
//   4. The feet: planted, pivoting on the toe, landing on the heel, sliding or lifted, read from the
//      smoothed heel and toe; a planted point is held where it stands, nothing goes below the ground.
//   5. Each frame solved hierarchically: the hips (moved, if needed, so the planted legs reach their
//      feet), the trunk, shoulders, head, legs, feet, and the arms with the bat as one rigid body,
//      both hands on its grip anchors while both hold it, one while one does, none after a release.
//      Elbows and knees keep their bend's side through straight positions (no flips).
// `poseAt` plays the fit at any time with the same solve, so a frame between two tracked ones keeps
// every length and the grip too. Read by no part of the analysis.

import { elbowPreference, type Pose } from "@/engine/pose-model";
import {
  BAT, GRIP, add, armToGrip, onSphere, onTwoSpheres, batFrame, distance, gripPoint, holds, len, lerp, mid, mul, slerpDir, sub, twoBone, unit,
  type GripState, type V3,
} from "@/engine/rig";
import type { SemanticJoint } from "@/engine/scene";
import { reprojectionPx, triangulate } from "./camera";
import type { P3c, Shot, Take } from "./types";

export const JOINTS: readonly SemanticJoint[] = [
  "head", "front_shoulder", "back_shoulder", "front_elbow", "back_elbow", "front_wrist", "back_wrist",
  "front_hip", "back_hip", "front_knee", "back_knee", "front_ankle", "back_ankle", "front_heel", "back_heel", "front_foot", "back_foot",
];
const SIDES = ["front", "back"] as const;
type Side = (typeof SIDES)[number];
const J = (s: Side, part: string) => `${s}_${part}` as SemanticJoint;

/**
 * The fit's own settings, with where each comes from. A rig's, not the analysis's (never in the
 * registry). Chosen on the front- and back-foot defences and checked on shots held out of that
 * choice (tests/motion-fit.test.ts, docs/15).
 */
export const FIT = {
  /** Smoothing window (s, one standard deviation): a phone tracker jitters frame to frame (33 ms at 30 fps); a bat changes direction over about 0.1 s. */
  smoothS: 0.03,
  /** Below this confidence a sighting is a guess: it is kept only as a weak pull, and the joint is marked inferred. */
  seenConf: 0.3,
  /** A foot point is on the ground below this height (body heights: about 5 cm on a 1.75 m batter, the tracker's noise at the feet). */
  groundH: 0.03,
  /** …and still below this speed (body heights per second: about 0.5 m/s, well under a stride's). */
  stillV: 0.3,
  /** A contact state lasts at least this long (s), so one noisy frame never plants or lifts a foot. */
  minStateS: 0.06,
} as const;

export type FootState = "planted" | "pivot" | "heel" | "slide" | "lifted";
export interface Lengths {
  hipWidth: number;
  trunk: number;
  shoulderWidth: number;
  neck: number;
  upper: Record<Side, number>;
  fore: Record<Side, number>;
  thigh: Record<Side, number>;
  shin: Record<Side, number>;
  heel: Record<Side, number>;
  toe: Record<Side, number>;
}
export interface Normals {
  elbow: Record<Side, V3 | null>;
  knee: Record<Side, V3 | null>;
}
type Target = { p: V3; c: number } | null;
export type Targets = Record<SemanticJoint, Target>;
interface BatTarget {
  handle: V3 | null;
  dir: V3 | null;
}
interface Anchors {
  heel: V3 | null;
  toe: V3 | null;
}

export interface Fitted {
  take: Pick<Take, "id" | "label" | "shot" | "battingSide" | "provenance" | "events" | "statureM">;
  shot: Shot;
  times: number[];
  poses: Pose[];
  lengths: Lengths;
  normals: Normals[];
  grip: GripState[];
  feet: Record<Side, FootState[]>;
  anchors: Array<Record<Side, Anchors>>;
  /** The evidence each frame was fitted to (after smoothing, in body heights). */
  targets: Targets[];
  /** Joints placed without a sighting (hidden, or below `FIT.seenConf`), per frame. */
  inferred: SemanticJoint[][];
  /** How the across (depth) axis is known. */
  depth: "triangulated" | "measured" | "estimated";
  /** The bat's across direction, and its roll (the face): seen, or the rig's estimate. */
  batDepth: "measured" | "unobserved";
  batRoll: "unobserved";
  /** Per view: how far the fitted joints land from where that camera saw them (pixels). */
  reprojection: Array<{ camera: string; label: string; meanPx: number; maxPx: number; n: number }>;
}

// ---------- 1. Evidence ----------

export function evidence(take: Take): { raw: Targets[]; bat: BatTarget[]; depth: Fitted["depth"]; batDepth: Fitted["batDepth"] } {
  const k = take.units === "metre" ? 1 / take.statureM : 1;
  const n = take.times.length;
  const scale = (p: V3): V3 => mul(p, k);
  const raw: Targets[] = [];
  const bat: BatTarget[] = [];
  const views = take.views ?? [];
  for (let f = 0; f < n; f++) {
    const t = {} as Targets;
    for (const j of JOINTS) {
      if (views.length >= 2) {
        const s = views.flatMap((v) => {
          const q = v.joints[j]?.[f];
          return q ? [{ camera: v.camera, uv: [q[0], q[1]] as const, w: q[2] }] : [];
        });
        const p = triangulate(s);
        t[j] = p ? { p: scale(p), c: Math.min(...s.map((x) => x.w)) } : null;
      } else {
        const q: P3c = take.points?.joints[j]?.[f] ?? null;
        t[j] = q ? { p: scale([q[0], q[1], q[2]]), c: q[3] } : null;
      }
    }
    if (take.wristMark === "grip") for (const side of SIDES) {
      const w = t[J(side, "wrist")];
      const e = t[J(side, "elbow")];
      if (w && e) t[J(side, "wrist")] = { p: wristFromGrip(w.p, e.p), c: w.c };
    }
    raw.push(t);
    let handle: V3 | null = null;
    let dir: V3 | null = null;
    const vb = views.filter((v) => v.bat);
    if (vb.length >= 2) {
      const tri = (key: "handle" | "toe") =>
        triangulate(vb.flatMap((v) => {
          const q = v.bat![key][f];
          return q ? [{ camera: v.camera, uv: [q[0], q[1]] as const, w: q[2] }] : [];
        }));
      const h = tri("handle");
      const to = tri("toe");
      if (h && to) {
        dir = unit(sub(to, h));
        // A tracked handle marks the top hand's grip (as a clip's bat is marked); the rig's handle
        // point is where the two gloves meet, `GRIP.top` further down.
        handle = add(scale(h), mul(dir ?? [0, -1, 0], GRIP.top));
      }
    }
    const d = take.batDir?.dir[f];
    if (!dir && d) dir = unit([d[0], d[1], d[2]]);
    bat.push({ handle, dir });
  }
  const depth = views.length >= 2 ? "triangulated" : take.points?.depth === "measured" ? "measured" : "estimated";
  const batDepth = (views.filter((v) => v.bat).length >= 2) || take.batDir?.depth === "measured" ? "measured" : "unobserved";
  return { raw, bat, depth, batDepth };
}

/** The wrist joint behind a mark at the grip: a hand's length back along the forearm. */
export function wristFromGrip(grip: V3, elbow: V3): V3 {
  return sub(grip, mul(unit(sub(grip, elbow)) ?? ([0, -1, 0] as V3), GRIP.hand));
}

// ---------- 2. One skeleton ----------

function weightedMedian(xs: Array<[number, number]>): number {
  const s = xs.filter(([, w]) => w > 0).sort((a, b) => a[0] - b[0]);
  const total = s.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [x, w] of s) {
    acc += w;
    if (acc >= total / 2) return x;
  }
  return s.length ? s[s.length - 1]![0] : 0;
}
function boneLength(raw: Targets[], f: (t: Targets) => [Target, Target] | null): number {
  const xs: Array<[number, number]> = [];
  for (const t of raw) {
    const pair = f(t);
    if (!pair || !pair[0] || !pair[1]) continue;
    const w = Math.min(pair[0].c, pair[1].c);
    if (w >= FIT.seenConf) xs.push([distance(pair[0].p, pair[1].p), w]);
  }
  return weightedMedian(xs);
}
const midT = (a: Target, b: Target): Target => (a && b ? { p: mid(a.p, b.p), c: Math.min(a.c, b.c) } : null);

export function fitLengths(raw: Targets[]): Lengths {
  const per = (a: string, b: string) => Object.fromEntries(SIDES.map((s) => [s, boneLength(raw, (t) => [t[J(s, a)], t[J(s, b)]])])) as Record<Side, number>;
  return {
    hipWidth: boneLength(raw, (t) => [t.front_hip, t.back_hip]),
    trunk: boneLength(raw, (t) => [midT(t.front_hip, t.back_hip), midT(t.front_shoulder, t.back_shoulder)]),
    shoulderWidth: boneLength(raw, (t) => [t.front_shoulder, t.back_shoulder]),
    neck: boneLength(raw, (t) => [midT(t.front_shoulder, t.back_shoulder), t.head]),
    upper: per("shoulder", "elbow"),
    fore: per("elbow", "wrist"),
    thigh: per("hip", "knee"),
    shin: per("knee", "ankle"),
    heel: per("ankle", "heel"),
    toe: per("ankle", "foot"),
  };
}

// ---------- 3. Time ----------

/** The take's frames split at its impacts: smoothing stays inside a stretch. */
function stretches(times: number[], impacts: number[]): number[] {
  return times.map((t) => impacts.filter((x) => t >= x).length);
}
/** Confidence-weighted local-linear smoothing on the real times, inside each stretch. */
function smoothSeries(times: number[], stretch: number[], values: Array<{ v: number[]; c: number } | null>, sigma: number): Array<{ v: number[]; c: number } | null> {
  const out: Array<{ v: number[]; c: number } | null> = [];
  const dims = values.find((x) => x)?.v.length ?? 3;
  for (let i = 0; i < times.length; i++) {
    let S0 = 0, S1 = 0, S2 = 0, cmax = 0;
    const T0 = new Array<number>(dims).fill(0);
    const T1 = new Array<number>(dims).fill(0);
    for (let j = 0; j < times.length; j++) {
      const x = values[j];
      if (!x || stretch[j] !== stretch[i]) continue;
      const dt = times[j]! - times[i]!;
      if (Math.abs(dt) > 3 * sigma) continue;
      const w = x.c * Math.exp(-0.5 * (dt / sigma) ** 2);
      if (w <= 0) continue;
      S0 += w; S1 += w * dt; S2 += w * dt * dt;
      for (let d = 0; d < dims; d++) {
        T0[d]! += w * x.v[d]!;
        T1[d]! += w * dt * x.v[d]!;
      }
      if (Math.abs(dt) < sigma) cmax = Math.max(cmax, x.c);
    }
    if (S0 < 1e-6) {
      out.push(null);
      continue;
    }
    const det = S0 * S2 - S1 * S1;
    // Local line where the window is well spread; else the weighted mean.
    const v = T0.map((t0, d) => (det > 1e-9 * S0 * S0 ? (S2 * t0 - S1 * T1[d]!) / det : t0 / S0));
    out.push({ v, c: cmax || values[i]?.c || 0 });
  }
  return out;
}
function smoothTargets(times: number[], stretch: number[], raw: Targets[]): Targets[] {
  const out: Targets[] = times.map(() => ({}) as Targets);
  for (const j of JOINTS) {
    const s = smoothSeries(times, stretch, raw.map((t) => (t[j] ? { v: [...t[j]!.p], c: t[j]!.c } : null)), FIT.smoothS);
    s.forEach((x, f) => (out[f]![j] = x ? { p: x.v as unknown as V3, c: x.c } : null));
  }
  return out;
}

// ---------- 4. The feet ----------

function footStates(times: number[], t: Targets[]): Record<Side, FootState[]> {
  const out = {} as Record<Side, FootState[]>;
  for (const s of SIDES) {
    const speed = (j: SemanticJoint, f: number) => {
      const a = t[Math.max(0, f - 1)]![j];
      const b = t[Math.min(t.length - 1, f + 1)]![j];
      const dt = times[Math.min(t.length - 1, f + 1)]! - times[Math.max(0, f - 1)]!;
      return a && b && dt > 0 ? distance(a.p, b.p) / dt : Infinity;
    };
    const raw: FootState[] = t.map((x, f) => {
      const heel = x[J(s, "heel")];
      const toe = x[J(s, "foot")];
      const heelDown = !!heel && heel.p[1] < FIT.groundH;
      const toeDown = !!toe && toe.p[1] < FIT.groundH;
      const heelStill = heelDown && speed(J(s, "heel"), f) < FIT.stillV;
      const toeStill = toeDown && speed(J(s, "foot"), f) < FIT.stillV;
      if (heelStill && toeStill) return "planted";
      if (toeStill) return "pivot";
      if (heelStill) return "heel";
      if (heelDown && toeDown) return "slide";
      return "lifted";
    });
    // A state shorter than `minStateS` takes its neighbours' (the earlier one).
    const st = [...raw];
    let i = 0;
    while (i < st.length) {
      let k = i;
      while (k + 1 < st.length && st[k + 1] === st[i]) k++;
      if (i > 0 && times[k]! - times[i]! < FIT.minStateS) for (let m = i; m <= k; m++) st[m] = st[i - 1]!;
      i = k + 1;
    }
    out[s] = st;
  }
  return out;
}

/** Where each planted point stays: the confidence-weighted median of the stretch it is planted for, on the ground. */
function footAnchors(t: Targets[], feet: Record<Side, FootState[]>): Array<Record<Side, Anchors>> {
  const out: Array<Record<Side, Anchors>> = t.map(() => ({ front: { heel: null, toe: null }, back: { heel: null, toe: null } }));
  for (const s of SIDES) {
    for (const [point, held] of [["heel", ["planted", "heel"]], ["foot", ["planted", "pivot"]]] as const) {
      const key = point === "foot" ? "toe" : "heel";
      let i = 0;
      while (i < t.length) {
        if (!(held as readonly string[]).includes(feet[s][i]!)) {
          i++;
          continue;
        }
        let k = i;
        while (k + 1 < t.length && (held as readonly string[]).includes(feet[s][k + 1]!)) k++;
        const xs = t.slice(i, k + 1).map((x) => x[J(s, point)]).filter((x): x is { p: V3; c: number } => !!x);
        if (xs.length) {
          const a: V3 = [0, 1, 2].map((d) => weightedMedian(xs.map((x) => [x.p[d]!, x.c]))) as unknown as V3;
          const anchor: V3 = [a[0], Math.max(0, a[1]), a[2]];
          for (let m = i; m <= k; m++) out[m]![s][key] = anchor;
        }
        i = k + 1;
      }
    }
  }
  return out;
}

// ---------- 5. One frame ----------

/** Puts a foot point `length` from the ankle toward its target, never below the ground. */
function footPoint(ankle: V3, target: V3, length: number): V3 {
  let d = unit(sub(target, ankle)) ?? ([0, -1, 0] as V3);
  if (ankle[1] + d[1] * length < 0) {
    const y = -ankle[1] / length;
    const flat = unit([d[0], 0, d[2]]) ?? ([1, 0, 0] as V3);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    d = [flat[0] * r, Math.max(-1, y), flat[2] * r];
  }
  return add(ankle, mul(d, length));
}

export interface FrameInput {
  targets: Targets;
  bat: BatTarget;
  grip: GripState;
  anchors: Record<Side, Anchors>;
  prev: Normals | null;
  /** A pose to fall back on for a joint with no sighting (the previous frame's). */
  fallback: Pose | null;
}

/** Solves one frame on the rig: every length held, the feet on their anchors, the hands on the bat. */
export function solveFrame(L: Lengths, x: FrameInput): { pose: Pose; normals: Normals; inferred: SemanticJoint[] } {
  const inferred: SemanticJoint[] = [];
  const T = (j: SemanticJoint): { p: V3; c: number } => {
    const t = x.targets[j];
    if (t && t.c >= FIT.seenConf) return t;
    inferred.push(j);
    if (t) return t;
    if (x.fallback) return { p: x.fallback[j], c: 0 };
    return { p: [0, 0.5, 0], c: 0 };
  };
  const t = Object.fromEntries(JOINTS.map((j) => [j, T(j)])) as Record<SemanticJoint, { p: V3; c: number }>;
  const p = {} as Record<SemanticJoint, V3>;

  // Where each foot's ankle must be: moved with its anchored points, as a rigid foot.
  const ankleGoal = {} as Record<Side, V3>;
  const heelGoal = {} as Record<Side, V3>;
  const toeGoal = {} as Record<Side, V3>;
  const anchored = {} as Record<Side, boolean>;
  for (const s of SIDES) {
    const a = x.anchors[s];
    const [ank, heel, toe] = [t[J(s, "ankle")].p, t[J(s, "heel")].p, t[J(s, "foot")].p];
    const shift = a.heel && a.toe ? sub(mid(a.heel, a.toe), mid(heel, toe)) : a.toe ? sub(a.toe, toe) : a.heel ? sub(a.heel, heel) : ([0, 0, 0] as V3);
    // The ankle hangs where its planted points stay exactly at the foot's own lengths from it.
    const near = add(ank, shift);
    ankleGoal[s] =
      a.heel && a.toe ? onTwoSpheres(a.heel, L.heel[s], a.toe, L.toe[s], near) : a.toe ? onSphere(a.toe, L.toe[s], near) : a.heel ? onSphere(a.heel, L.heel[s], near) : near;
    heelGoal[s] = a.heel ?? add(heel, shift);
    toeGoal[s] = a.toe ?? add(toe, shift);
    anchored[s] = !!(a.heel || a.toe);
  }

  // The hips, the trunk, the head. The hips move (if they must) so planted legs reach their feet.
  const hipMid = mid(t.front_hip.p, t.back_hip.p);
  const hipAxis = unit(sub(t.front_hip.p, t.back_hip.p)) ?? ([1, 0, 0] as V3);
  const trunkDir = unit(sub(mid(t.front_shoulder.p, t.back_shoulder.p), hipMid)) ?? ([0, 1, 0] as V3);
  let pelvis = hipMid;
  for (let i = 0; i < 8; i++) {
    let move: V3 = [0, 0, 0];
    let n = 0;
    for (const s of SIDES) {
      if (!anchored[s]) continue;
      const hip = add(pelvis, mul(hipAxis, (s === "front" ? 1 : -1) * L.hipWidth / 2));
      const need = distance(hip, ankleGoal[s]) - (L.thigh[s] + L.shin[s]) * 0.999;
      if (need > 0) {
        move = add(move, mul(unit(sub(ankleGoal[s], hip))!, need));
        n++;
      }
    }
    if (!n) break;
    pelvis = add(pelvis, mul(move, 1 / n));
  }
  p.front_hip = add(pelvis, mul(hipAxis, L.hipWidth / 2));
  p.back_hip = sub(pelvis, mul(hipAxis, L.hipWidth / 2));
  const chest = add(pelvis, mul(trunkDir, L.trunk));
  // The shoulders' line as seen (it need not be square to the spine: the shoulder girdle moves on the chest).
  const shAxis = unit(sub(t.front_shoulder.p, t.back_shoulder.p)) ?? hipAxis;
  p.front_shoulder = add(chest, mul(shAxis, L.shoulderWidth / 2));
  p.back_shoulder = sub(chest, mul(shAxis, L.shoulderWidth / 2));
  p.head = add(chest, mul(unit(sub(t.head.p, mid(t.front_shoulder.p, t.back_shoulder.p))) ?? trunkDir, L.neck));

  // The legs: the knee toward where it was seen, else the way the foot points; never flipping.
  const normals: Normals = { elbow: { front: null, back: null }, knee: { front: null, back: null } };
  for (const s of SIDES) {
    const hip = p[J(s, "hip")];
    const footDir = unit(sub(toeGoal[s], heelGoal[s])) ?? ([1, 0, 0] as V3);
    const seen = unit(sub(t[J(s, "knee")].p, hip));
    const w = Math.min(1, t[J(s, "knee")].c);
    const pole = add(mul(seen ?? footDir, w), mul(footDir, 1 - w));
    const r = twoBone(hip, L.thigh[s], L.shin[s], ankleGoal[s], pole, x.prev?.knee[s] ?? null);
    p[J(s, "knee")] = r.mid;
    p[J(s, "ankle")] = r.end;
    normals.knee[s] = r.normal;
    const moved = sub(r.end, ankleGoal[s]);
    p[J(s, "heel")] = footPoint(r.end, add(heelGoal[s], moved), L.heel[s]);
    p[J(s, "foot")] = footPoint(r.end, add(toeGoal[s], moved), L.toe[s]);
  }

  // The arms and the bat.
  const pose = p as Pose;
  const pref = elbowPreference({ ...pose, front_elbow: t.front_elbow.p, back_elbow: t.back_elbow.p, front_wrist: t.front_wrist.p, back_wrist: t.back_wrist.p } as Pose);
  const free = (s: Side) => {
    const sh = p[J(s, "shoulder")];
    const seen = unit(sub(t[J(s, "elbow")].p, sh));
    const w = Math.min(1, t[J(s, "elbow")].c);
    const pole = add(mul(seen ?? pref[s], w), mul(unit(pref[s])!, 1 - w));
    const r = twoBone(sh, L.upper[s], L.fore[s], t[J(s, "wrist")].p, pole, x.prev?.elbow[s] ?? null);
    p[J(s, "elbow")] = r.mid;
    p[J(s, "wrist")] = r.end;
    normals.elbow[s] = r.normal;
  };
  const dir = x.bat.dir;
  let out: Pose;
  if (dir && x.grip !== "none") {
    const d = unit(dir)!;
    const holding = SIDES.filter((s) => holds(x.grip, s));
    for (const s of SIDES) if (!holding.includes(s)) free(s);
    let handle = x.bat.handle ?? mid(t.front_wrist.p, t.back_wrist.p);
    for (let i = 0; i < 16; i++) {
      let short: V3 = [0, 0, 0];
      for (const s of holding) {
        const arm = armToGrip({
          shoulder: p[J(s, "shoulder")],
          upper: L.upper[s],
          fore: L.fore[s],
          grip: gripPoint(handle, d, s),
          wristHint: t[J(s, "wrist")].p,
          elbowHint: t[J(s, "elbow")].p,
          hintWeight: t[J(s, "elbow")].c,
          preferred: pref[s],
          prevNormal: x.prev?.elbow[s] ?? null,
        });
        p[J(s, "elbow")] = arm.elbow;
        p[J(s, "wrist")] = arm.wrist;
        normals.elbow[s] = arm.normal;
        short = add(short, mul(arm.short, 1 / holding.length));
      }
      handle = add(handle, short);
      if (len(short) < 1e-6) break;
    }
    out = { ...pose, bat_handle: handle, bat_toe: add(handle, mul(d, BAT.handsToToe)) };
  } else {
    for (const s of SIDES) free(s);
    out = dir && x.bat.handle ? { ...pose, bat_handle: x.bat.handle, bat_toe: add(x.bat.handle, mul(unit(dir)!, BAT.handsToToe)) } : { ...pose };
  }
  return { pose: out, normals, inferred };
}

// ---------- The whole take ----------

const eventTime = (take: Pick<Take, "events" | "times">, id: string) =>
  id === "start" ? take.times[0]! : id === "end" ? take.times[take.times.length - 1]! : take.events[id];

/** How the hands hold the bat at time `t`, from the shot's grip events. */
export function gripAt(shot: Shot, take: Pick<Take, "events" | "times">, t: number): GripState {
  let state: GripState = shot.grip[0]?.state ?? "both";
  for (const g of shot.grip) {
    const at = eventTime(take, g.from);
    if (at !== undefined && t >= at - 1e-9) state = g.state;
  }
  return state;
}
/** The phase at time `t` (the last one begun), with its name and cue; null outside them. */
export function phaseAt(shot: Shot, take: Pick<Take, "events" | "times">, t: number) {
  let found: (typeof shot.phases)[number] | null = null;
  for (const ph of shot.phases) {
    const a = eventTime(take, ph.from);
    const b = eventTime(take, ph.to);
    if (a !== undefined && b !== undefined && t >= a - 1e-9 && t < b + (ph.to === "end" ? 1e-9 : 0)) found = ph;
  }
  return found;
}

/** Fits a take of any shot. Throws only on a take that names another shot or lacks a shot's event. */
export function fitTake(take: Take, shot: Shot): Fitted {
  if (take.shot !== shot.shot) throw new Error(`take ${take.id} is a ${take.shot}, not a ${shot.shot}`);
  for (const e of shot.events) if (take.events[e.id] === undefined) throw new Error(`take ${take.id} has no time for ${e.id}`);
  const { raw, bat, depth, batDepth } = evidence(take);
  const times = take.times;
  const stretch = stretches(times, shot.impacts.map((id) => eventTime(take, id)!).filter((x) => x !== undefined));
  const L = fitLengths(raw);
  const targets = smoothTargets(times, stretch, raw);
  const handles = smoothSeries(times, stretch, bat.map((b) => (b.handle ? { v: [...b.handle], c: 1 } : null)), FIT.smoothS);
  const dirs = smoothSeries(times, stretch, bat.map((b) => (b.dir ? { v: [...b.dir], c: 1 } : null)), FIT.smoothS);
  const feet = footStates(times, targets);
  const anchors = footAnchors(targets, feet);
  const poses: Pose[] = [];
  const normals: Normals[] = [];
  const inferred: SemanticJoint[][] = [];
  const grip: GripState[] = [];
  for (let f = 0; f < times.length; f++) {
    const g = gripAt(shot, take, times[f]!);
    const r = solveFrame(L, {
      targets: targets[f]!,
      bat: { handle: handles[f] ? (handles[f]!.v as unknown as V3) : null, dir: dirs[f] ? unit(dirs[f]!.v as unknown as V3) : null },
      grip: g,
      anchors: anchors[f]!,
      prev: normals[f - 1] ?? null,
      fallback: poses[f - 1] ?? null,
    });
    poses.push(r.pose);
    normals.push(r.normals);
    inferred.push(r.inferred);
    grip.push(g);
  }
  // How well the fit agrees with each camera.
  const reprojection = (take.views ?? []).map((v) => {
    const k = take.units === "metre" ? take.statureM : 1;
    const errs: number[] = [];
    poses.forEach((pose, f) => {
      for (const j of JOINTS) {
        const q = v.joints[j]?.[f];
        if (!q || q[2] < FIT.seenConf) continue;
        const e = reprojectionPx(v.camera, [q[0], q[1]], mul(pose[j], k));
        if (e !== null) errs.push(e);
      }
    });
    return { camera: v.camera.id, label: v.camera.label, meanPx: errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length), maxPx: Math.max(0, ...errs), n: errs.length };
  });
  return {
    take: { id: take.id, label: take.label, shot: take.shot, battingSide: take.battingSide, provenance: take.provenance, events: take.events, statureM: take.statureM },
    shot,
    times,
    poses,
    lengths: L,
    normals,
    grip,
    feet,
    anchors,
    targets,
    inferred,
    depth,
    batDepth,
    batRoll: "unobserved",
    reprojection,
  };
}

// ---------- Playing it back ----------

/** The frame index at or before `t`, and how far toward the next. */
export function frameAt(times: number[], t: number): { i: number; k: number } {
  const n = times.length;
  if (t <= times[0]!) return { i: 0, k: 0 };
  if (t >= times[n - 1]!) return { i: n - 1, k: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (times[m]! <= t) lo = m;
    else hi = m;
  }
  return { i: lo, k: (t - times[lo]!) / (times[hi]! - times[lo]!) };
}

/**
 * The fitted pose at any time, between frames too: the two nearest solved poses blended and solved
 * again on the rig (every length, the grip and the planted feet held), the bat turned between them
 * on the shortest arc. The same solve as the fit: what is played is what was fitted.
 */
export function poseAt(fit: Fitted, t: number): { pose: Pose; normals: Normals; grip: GripState; feet: Record<Side, FootState> } {
  const { i, k } = frameAt(fit.times, t);
  const a = fit.poses[i]!;
  const feet = { front: fit.feet.front[i]!, back: fit.feet.back[i]! };
  if (k < 1e-9 || i === fit.times.length - 1) return { pose: a, normals: fit.normals[i]!, grip: fit.grip[i]!, feet };
  const b = fit.poses[i + 1]!;
  const targets = Object.fromEntries(JOINTS.map((j) => [j, { p: lerp(a[j], b[j], k), c: 1 }])) as Targets;
  const dirA = a.bat_handle && a.bat_toe ? sub(a.bat_toe, a.bat_handle) : null;
  const dirB = b.bat_handle && b.bat_toe ? sub(b.bat_toe, b.bat_handle) : null;
  const dir = dirA && dirB ? slerpDir(dirA, dirB, k) : dirA ?? dirB;
  const handle = a.bat_handle && b.bat_handle ? lerp(a.bat_handle, b.bat_handle, k) : a.bat_handle ?? null;
  // A foot planted in both frames keeps its anchor; otherwise it moves with the blend.
  const anchors = Object.fromEntries(
    SIDES.map((s) => {
      const A = fit.anchors[i]![s];
      const B = fit.anchors[i + 1]![s];
      const same = (x: V3 | null, y: V3 | null) => (x && y && distance(x, y) < 1e-9 ? x : null);
      return [s, { heel: same(A.heel, B.heel), toe: same(A.toe, B.toe) }];
    }),
  ) as Record<Side, Anchors>;
  const r = solveFrame(fit.lengths, { targets, bat: { handle, dir }, grip: fit.grip[i]!, anchors, prev: fit.normals[i]!, fallback: a });
  return { pose: r.pose, normals: r.normals, grip: fit.grip[i]!, feet };
}

/** The bat's frame for a pose (its face an estimate unless a take observed it). */
export const batFrameOf = (p: Pose) => (p.bat_handle && p.bat_toe ? batFrame(sub(p.bat_toe, p.bat_handle)) : null);
