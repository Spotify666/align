// A batter's or coach's own model of a shot: where each joint is at the moments that matter,
// placed by hand on a figure (/models). Asked for by the owner on 2026-11-16: "inputs of human
// biomechanics w.r.t. joints for a cricketing shot on why it is correct… exported as text…
// optional for analysis: if the user chooses this plotting then analyse based on that, else the
// current logic."
//
// What this file is, and is not:
// - It is the model's format (`aline.pose-model/1`), the geometry of placing joints (bone
//   lengths never change while a joint is dragged), the measures read off a pose, and the check
//   of a tracked clip against a model (`aline.model-check/1`).
// - It is NOT part of the analysis. `analyze` never reads it and the stored result is the same
//   with or without a model (tests/pose-model.test.ts). A model never decides which shot was
//   played: it is applied only to a clip Aline has confirmed as the model's shot (standing rule
//   1: no other shot is ever accepted as a defence).
// - Its tolerances belong to the model (the author's own, saved and exported with it). They are
//   not engine thresholds and are not in the registry.
//
// Axes, as everywhere in the engine: forward (toward the bowler), up, across (toward the off
// side). Joints are named by role (front / back), so a model is never a mirrored picture of the
// other hand: it says which batting side it was made for and is applied to that side only.
// Units: body heights (1 = the batter's standing height).

import { buildScene, type Scene, type SemanticJoint } from "./scene";
import type { AnalysisPayload, CaptureObservation, EventType, Handedness, TargetShot } from "./types";

export const POSE_MODEL_SCHEMA = "aline.pose-model/1" as const;
export const MODEL_CHECK_SCHEMA = "aline.model-check/1" as const;

export type V3 = readonly [number, number, number];
export const MODEL_JOINTS = [
  "head",
  "front_shoulder", "back_shoulder",
  "front_elbow", "back_elbow",
  "front_wrist", "back_wrist",
  "front_hip", "back_hip",
  "front_knee", "back_knee",
  "front_ankle", "back_ankle",
  "front_heel", "back_heel",
  "front_foot", "back_foot",
] as const satisfies readonly SemanticJoint[];
export type Pose = Record<SemanticJoint, V3>;

export const JOINT_LABEL: Record<SemanticJoint, string> = {
  head: "Head",
  front_shoulder: "Front shoulder", back_shoulder: "Back shoulder",
  front_elbow: "Front elbow", back_elbow: "Back elbow",
  front_wrist: "Top hand", back_wrist: "Bottom hand",
  front_hip: "Front hip", back_hip: "Back hip",
  front_knee: "Front knee", back_knee: "Back knee",
  front_ankle: "Front ankle", back_ankle: "Back ankle",
  front_heel: "Front heel", back_heel: "Back heel",
  front_foot: "Front toe", back_foot: "Back toe",
};

/** The moments a model can hold. Contact is always there; the others are optional. */
export const MOMENTS = [
  { id: "backlift", label: "Top of the backlift", event: { front_foot_defence: "backswing_top", back_foot_defence: "backswing_top" } },
  { id: "foot_down", label: "Foot down", event: { front_foot_defence: "front_foot_plant", back_foot_defence: "back_foot_commit" } },
  { id: "contact", label: "Contact", event: { front_foot_defence: "contact", back_foot_defence: "contact" } },
] as const satisfies ReadonlyArray<{ id: string; label: string; event: Record<TargetShot, EventType> }>;
export type MomentId = (typeof MOMENTS)[number]["id"];

/** Which camera positions the author placed the joints from. One angle fixes one plane only. */
export type ModelAngles = "both" | "side" | "front";
export type Plane = "side" | "front";

export interface PoseModel {
  schema: typeof POSE_MODEL_SCHEMA;
  id: string;
  name: string;
  shot: TargetShot;
  /** The batting side it was made for. Never applied to the other side. */
  battingSide: Handedness;
  angles: ModelAngles;
  /** The author's height, when given: lengths are then also shown and exported in centimetres. */
  heightCm: number | null;
  moments: Partial<Record<MomentId, Pose>> & { contact: Pose };
  /** How close a clip must be to count as matching: the author's choice, not an engine threshold. */
  tolerance: { angleDeg: number; offset: number };
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** Starting tolerances a model can be given. The numbers are saved in the model and can be edited in its text. */
export const STRICTNESS = [
  { id: "tight", label: "Tight", angleDeg: 8, offset: 0.04 },
  { id: "normal", label: "Normal", angleDeg: 12, offset: 0.06 },
  { id: "loose", label: "Loose", angleDeg: 18, offset: 0.09 },
] as const;

// ---------- Vectors ----------

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const mid = (a: V3, b: V3): V3 => mul(add(a, b), 0.5);
const unit = (a: V3): V3 | null => {
  const l = len(a);
  return l > 1e-9 ? mul(a, 1 / l) : null;
};
export const distance = (a: V3, b: V3) => len(sub(a, b));

/** Turns `p` about `pivot` by the rotation that takes direction `from` to direction `to` (the shortest way). */
function turn(p: V3, pivot: V3, from: V3, to: V3): V3 {
  const a = unit(from);
  const b = unit(to);
  if (!a || !b) return p;
  const c = Math.min(1, Math.max(-1, dot(a, b)));
  let axis = unit(cross(a, b));
  if (!axis) {
    if (c > 0) return p; // same direction
    // Opposite: any axis square to `a` will do.
    axis = unit(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))!;
  }
  const s = Math.sqrt(1 - c * c);
  const v = sub(p, pivot);
  // Rodrigues' rotation.
  const r = add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
  return add(pivot, r);
}

/** The point at `child`'s distance from `parent`, in the direction of `target`. */
function aim(parent: V3, child: V3, target: V3): V3 {
  const d = unit(sub(target, parent));
  return d ? add(parent, mul(d, distance(parent, child))) : child;
}

/**
 * Two bones of lengths `a` and `b` from `root`, reaching for `target`: the end goes to the
 * target, or as far toward it as the two bones reach; the middle joint bends toward `pole`
 * (the way it bends now).
 */
function reach(root: V3, a: number, b: number, pole: V3, target: V3): { mid: V3; end: V3 } {
  const span = sub(target, root);
  const dir = unit(span) ?? [0, -1, 0];
  const d = Math.min(Math.max(len(span), Math.abs(a - b) + 1e-6), a + b - 1e-6);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - x * x, 0));
  const perp = unit(sub(pole, mul(dir, dot(pole, dir)))) ?? unit(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))!;
  return { mid: add(add(root, mul(dir, x)), mul(perp, h)), end: add(root, mul(dir, d)) };
}
/** `reach` for a limb as it stands in `pose`, from a root that may have moved. */
function reachLimb(pose: Pose, rootJ: SemanticJoint, midJ: SemanticJoint, endJ: SemanticJoint, root: V3, target: V3) {
  return reach(root, distance(pose[rootJ], pose[midJ]), distance(pose[midJ], pose[endJ]), sub(pose[midJ], pose[rootJ]), target);
}

// ---------- The figure ----------

export const pelvisOf = (p: Pose): V3 => mid(p.front_hip, p.back_hip);
export const chestOf = (p: Pose): V3 => mid(p.front_shoulder, p.back_shoulder);

/** What can be dragged: every joint, and the two centres the body hangs from. */
export type Handle = SemanticJoint | "pelvis" | "chest";
export const HANDLES: readonly Handle[] = ["pelvis", "chest", ...MODEL_JOINTS];
export const HANDLE_LABEL: Record<Handle, string> = { ...JOINT_LABEL, pelvis: "Hips (whole body)", chest: "Chest (lean)" };
export const handlePoint = (p: Pose, h: Handle): V3 => (h === "pelvis" ? pelvisOf(p) : h === "chest" ? chestOf(p) : p[h]);

/** The bones, for drawing and for the lengths that must never change. */
export const BONES: ReadonlyArray<readonly [SemanticJoint, SemanticJoint]> = [
  ["front_shoulder", "back_shoulder"],
  ["front_hip", "back_hip"],
  ["front_shoulder", "front_elbow"], ["front_elbow", "front_wrist"],
  ["back_shoulder", "back_elbow"], ["back_elbow", "back_wrist"],
  ["front_hip", "front_knee"], ["front_knee", "front_ankle"],
  ["back_hip", "back_knee"], ["back_knee", "back_ankle"],
  ["front_ankle", "front_heel"], ["front_ankle", "front_foot"], ["front_heel", "front_foot"],
  ["back_ankle", "back_heel"], ["back_ankle", "back_foot"], ["back_heel", "back_foot"],
];

export interface Segments {
  trunk: number;
  neck: number;
  shoulderWidth: number;
  hipWidth: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  foot: number;
}

/** The figure's own lengths (body heights): the mean of the two sides where there are two. */
export function segments(p: Pose): Segments {
  const both = (a: [SemanticJoint, SemanticJoint], b: [SemanticJoint, SemanticJoint]) => (distance(p[a[0]], p[a[1]]) + distance(p[b[0]], p[b[1]])) / 2;
  return {
    trunk: distance(pelvisOf(p), chestOf(p)),
    neck: distance(chestOf(p), p.head),
    shoulderWidth: distance(p.front_shoulder, p.back_shoulder),
    hipWidth: distance(p.front_hip, p.back_hip),
    upperArm: both(["front_shoulder", "front_elbow"], ["back_shoulder", "back_elbow"]),
    forearm: both(["front_elbow", "front_wrist"], ["back_elbow", "back_wrist"]),
    thigh: both(["front_hip", "front_knee"], ["back_hip", "back_knee"]),
    shin: both(["front_knee", "front_ankle"], ["back_knee", "back_ankle"]),
    foot: both(["front_heel", "front_foot"], ["back_heel", "back_foot"]),
  };
}
export const SEGMENT_LABEL: Record<keyof Segments, string> = {
  trunk: "Trunk (hips to shoulders)",
  neck: "Shoulders to head",
  shoulderWidth: "Shoulder width",
  hipWidth: "Hip width",
  upperArm: "Upper arm",
  forearm: "Forearm",
  thigh: "Thigh",
  shin: "Shin",
  foot: "Foot",
};

const SIDES = ["front", "back"] as const;
type Side = (typeof SIDES)[number];
const j = (side: Side, part: "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle" | "heel" | "foot") => `${side}_${part}` as SemanticJoint;

/** Legs after the hips moved: each foot stays where it is planted while the leg can reach it. */
function plantLegs(next: Pose, before: Pose) {
  for (const side of SIDES) {
    const r = reachLimb(before, j(side, "hip"), j(side, "knee"), j(side, "ankle"), next[j(side, "hip")], before[j(side, "ankle")]);
    const moved = sub(r.end, before[j(side, "ankle")]);
    next[j(side, "knee")] = r.mid;
    next[j(side, "ankle")] = r.end;
    next[j(side, "heel")] = add(before[j(side, "heel")], moved);
    next[j(side, "foot")] = add(before[j(side, "foot")], moved);
  }
}

/**
 * Moves one handle toward `target` and returns the new pose. No bone changes length:
 * - hips (whole body): the body moves, the feet stay planted, the knees bend to suit;
 * - chest: the trunk leans about the hips, carrying the head and arms;
 * - a shoulder or a hip: the line of the shoulders or hips turns about its centre;
 * - an elbow or a knee: swings about the shoulder or hip, carrying what hangs from it;
 * - a hand or an ankle: goes to the target, the elbow or knee bending to suit;
 * - head, heel, toe: swing about the neck or the ankle.
 */
export function dragHandle(pose: Pose, handle: Handle, target: V3): Pose {
  const p: Pose = { ...pose };
  const UPPER: SemanticJoint[] = ["head", "front_shoulder", "back_shoulder", "front_elbow", "back_elbow", "front_wrist", "back_wrist"];

  if (handle === "pelvis") {
    const delta = sub(target, pelvisOf(pose));
    for (const k of [...UPPER, "front_hip", "back_hip"] as SemanticJoint[]) p[k] = add(pose[k], delta);
    plantLegs(p, pose);
    return p;
  }
  if (handle === "chest") {
    const pivot = pelvisOf(pose);
    const from = sub(chestOf(pose), pivot);
    const to = sub(target, pivot);
    for (const k of UPPER) p[k] = turn(pose[k], pivot, from, to);
    return p;
  }
  if (handle === "head") {
    p.head = aim(chestOf(pose), pose.head, target);
    return p;
  }
  const [side, part] = handle.split("_") as [Side, string];
  const other: Side = side === "front" ? "back" : "front";

  if (part === "shoulder") {
    const pivot = chestOf(pose);
    const from = sub(pose[handle], pivot);
    const to = sub(target, pivot);
    for (const s of [side, other]) {
      const moved = sub(turn(pose[j(s, "shoulder")], pivot, from, to), pose[j(s, "shoulder")]);
      for (const part2 of ["shoulder", "elbow", "wrist"] as const) p[j(s, part2)] = add(pose[j(s, part2)], moved);
    }
    return p;
  }
  if (part === "hip") {
    const pivot = pelvisOf(pose);
    const from = sub(pose[handle], pivot);
    const to = sub(target, pivot);
    for (const s of [side, other]) p[j(s, "hip")] = turn(pose[j(s, "hip")], pivot, from, to);
    plantLegs(p, pose);
    return p;
  }
  if (part === "elbow") {
    p[handle] = aim(pose[j(side, "shoulder")], pose[handle], target);
    p[j(side, "wrist")] = add(pose[j(side, "wrist")], sub(p[handle], pose[handle]));
    return p;
  }
  if (part === "wrist") {
    const r = reachLimb(pose, j(side, "shoulder"), j(side, "elbow"), handle, pose[j(side, "shoulder")], target);
    p[j(side, "elbow")] = r.mid;
    p[handle] = r.end;
    return p;
  }
  if (part === "knee") {
    p[handle] = aim(pose[j(side, "hip")], pose[handle], target);
    const moved = sub(p[handle], pose[handle]);
    for (const part2 of ["ankle", "heel", "foot"] as const) p[j(side, part2)] = add(pose[j(side, part2)], moved);
    return p;
  }
  if (part === "ankle") {
    const r = reachLimb(pose, j(side, "hip"), j(side, "knee"), handle, pose[j(side, "hip")], target);
    const moved = sub(r.end, pose[handle]);
    p[j(side, "knee")] = r.mid;
    p[handle] = r.end;
    p[j(side, "heel")] = add(pose[j(side, "heel")], moved);
    p[j(side, "foot")] = add(pose[j(side, "foot")], moved);
    return p;
  }
  // heel or toe: the foot turns about the ankle.
  const pivot = pose[j(side, "ankle")];
  const from = sub(pose[handle], pivot);
  const to = sub(target, pivot);
  p[j(side, "heel")] = turn(pose[j(side, "heel")], pivot, from, to);
  p[j(side, "foot")] = turn(pose[j(side, "foot")], pivot, from, to);
  return p;
}

/** Sets the figure on the ground: the lowest point of the feet at height 0. */
export function ground(pose: Pose): Pose {
  const low = Math.min(...(["front_heel", "back_heel", "front_foot", "back_foot"] as SemanticJoint[]).map((k) => pose[k][1]));
  const p = {} as Pose;
  for (const k of MODEL_JOINTS) p[k] = [pose[k][0], pose[k][1] - low, pose[k][2]];
  return p;
}

/**
 * The same pose with other limb lengths (the batter's own measurements): every bone keeps its
 * direction and takes its new length, built outward from the hips.
 */
export function withSegments(pose: Pose, want: Partial<Segments>): Pose {
  const now = segments(pose);
  const k = (name: keyof Segments) => (want[name] && now[name] > 1e-6 ? want[name]! / now[name] : 1);
  const p = {} as Pose;
  const pelvis = pelvisOf(pose);
  const chest = add(pelvis, mul(sub(chestOf(pose), pelvis), k("trunk")));
  p.head = add(chest, mul(sub(pose.head, chestOf(pose)), k("neck")));
  for (const side of SIDES) {
    const sh = add(chest, mul(sub(pose[j(side, "shoulder")], chestOf(pose)), k("shoulderWidth")));
    const el = add(sh, mul(sub(pose[j(side, "elbow")], pose[j(side, "shoulder")]), k("upperArm")));
    p[j(side, "shoulder")] = sh;
    p[j(side, "elbow")] = el;
    p[j(side, "wrist")] = add(el, mul(sub(pose[j(side, "wrist")], pose[j(side, "elbow")]), k("forearm")));
    const hip = add(pelvis, mul(sub(pose[j(side, "hip")], pelvis), k("hipWidth")));
    const knee = add(hip, mul(sub(pose[j(side, "knee")], pose[j(side, "hip")]), k("thigh")));
    const ankle = add(knee, mul(sub(pose[j(side, "ankle")], pose[j(side, "knee")]), k("shin")));
    p[j(side, "hip")] = hip;
    p[j(side, "knee")] = knee;
    p[j(side, "ankle")] = ankle;
    p[j(side, "heel")] = add(ankle, mul(sub(pose[j(side, "heel")], pose[j(side, "ankle")]), k("foot")));
    p[j(side, "foot")] = add(ankle, mul(sub(pose[j(side, "foot")], pose[j(side, "ankle")]), k("foot")));
  }
  return ground(p);
}

// ---------- Measures read off a pose, in one camera's plane ----------

type P2 = readonly [number, number];
/** A joint in a camera's plane: [sideways in that plane, up], in body heights; null when not seen. */
export type Get2 = (joint: SemanticJoint) => P2 | null;

/** A pose as one camera sees it. Side-on: forward and up. From the bowler's end: across and up. */
export const poseInPlane = (pose: Pose, plane: Plane): Get2 => (joint) => (plane === "side" ? [pose[joint][0], pose[joint][1]] : [pose[joint][2], pose[joint][1]]);

const mid2 = (a: P2 | null, b: P2 | null): P2 | null => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null);
const deg = (r: number) => (r * 180) / Math.PI;
/** How far a joint is bent: 0 = straight. */
function bend(a: P2 | null, b: P2 | null, c: P2 | null): number | null {
  if (!a || !b || !c) return null;
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  const lu = Math.hypot(u[0]!, u[1]!);
  const lv = Math.hypot(v[0]!, v[1]!);
  if (lu < 1e-6 || lv < 1e-6) return null;
  return 180 - deg(Math.acos(Math.min(1, Math.max(-1, (u[0]! * v[0]! + u[1]! * v[1]!) / (lu * lv)))));
}
/** Lean of the line from `a` up to `b`, from upright: + toward the plane's positive side. */
const lean = (a: P2 | null, b: P2 | null): number | null => (a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6 ? deg(Math.atan2(b[0] - a[0], b[1] - a[1])) : null);
const ahead = (a: P2 | null, b: P2 | null): number | null => (a && b ? a[0] - b[0] : null);
const above = (a: P2 | null, b: P2 | null): number | null => (a && b ? a[1] - b[1] : null);

export interface FeatureDef {
  id: string;
  label: string;
  plane: Plane;
  unit: "deg" | "height";
  /** How a larger and a smaller value read, against the model: "… than your model". */
  more: string;
  less: string;
  compute: (g: Get2) => number | null;
}

const pelvis2 = (g: Get2) => mid2(g("front_hip"), g("back_hip"));
const chest2 = (g: Get2) => mid2(g("front_shoulder"), g("back_shoulder"));
const hands2 = (g: Get2) => mid2(g("front_wrist"), g("back_wrist"));

/**
 * Every measure a model is compared on. Each is read in one camera's plane only, from the
 * joints as that camera sees them, so the same function reads the model and the clip.
 *
 * Only measures one camera can read reliably are here (tests/pose-model.test.ts holds each to
 * the true pose from every camera position). Left out on purpose: the bend of an elbow (an arm
 * pointing toward or away from the lens is foreshortened, and its angle in the picture is not
 * its angle), and the tilt of the shoulders or hips seen along the pitch (the two ends sit one
 * behind the other); the elbow's height and the shoulders' and hips' levels are read instead.
 */
export const FEATURES: readonly FeatureDef[] = [
  // Side-on: along the pitch.
  { id: "head_over_front_foot", label: "Head over the front foot", plane: "side", unit: "height", more: "further forward", less: "further back", compute: (g) => ahead(g("head"), g("front_foot")) },
  { id: "shoulder_over_front_foot", label: "Front shoulder over the front foot", plane: "side", unit: "height", more: "further forward", less: "further back", compute: (g) => ahead(g("front_shoulder"), g("front_foot")) },
  { id: "knee_over_front_foot", label: "Front knee over the front foot", plane: "side", unit: "height", more: "further forward", less: "further back", compute: (g) => ahead(g("front_knee"), g("front_foot")) },
  { id: "stride", label: "Feet apart along the pitch", plane: "side", unit: "height", more: "wider", less: "narrower", compute: (g) => ahead(g("front_ankle"), g("back_ankle")) },
  { id: "front_knee_bend", label: "Front knee bend", plane: "side", unit: "deg", more: "more bent", less: "straighter", compute: (g) => bend(g("front_hip"), g("front_knee"), g("front_ankle")) },
  { id: "back_knee_bend", label: "Back knee bend", plane: "side", unit: "deg", more: "more bent", less: "straighter", compute: (g) => bend(g("back_hip"), g("back_knee"), g("back_ankle")) },
  { id: "trunk_lean", label: "Lean toward the bowler", plane: "side", unit: "deg", more: "leaning further forward", less: "more upright or leaning back", compute: (g) => lean(pelvis2(g), chest2(g)) },
  { id: "front_shin_lean", label: "Front shin over the foot", plane: "side", unit: "deg", more: "leaning further forward", less: "more upright", compute: (g) => lean(g("front_ankle"), g("front_knee")) },
  { id: "front_elbow_height", label: "Front elbow against the shoulder", plane: "side", unit: "height", more: "higher", less: "lower", compute: (g) => above(g("front_elbow"), g("front_shoulder")) },
  { id: "hands_ahead", label: "Hands ahead of the front foot", plane: "side", unit: "height", more: "further forward", less: "further back", compute: (g) => ahead(hands2(g), g("front_foot")) },
  { id: "hands_height", label: "Hands against the hips", plane: "side", unit: "height", more: "higher", less: "lower", compute: (g) => above(hands2(g), pelvis2(g)) },
  { id: "hip_height", label: "Hips above the front ankle", plane: "side", unit: "height", more: "higher", less: "lower", compute: (g) => above(pelvis2(g), g("front_ankle")) },
  // From the bowler's end (or behind): across the pitch.
  { id: "head_across", label: "Head across from the front foot", plane: "front", unit: "height", more: "further to the off side", less: "further to the leg side", compute: (g) => ahead(g("head"), g("front_foot")) },
  { id: "trunk_side_lean", label: "Lean to the off side", plane: "front", unit: "deg", more: "leaning further to the off side", less: "more upright or leaning to the leg side", compute: (g) => lean(pelvis2(g), chest2(g)) },
  { id: "shoulder_level", label: "Front shoulder against the back shoulder", plane: "front", unit: "height", more: "higher", less: "lower", compute: (g) => above(g("front_shoulder"), g("back_shoulder")) },
  { id: "hip_level", label: "Front hip against the back hip", plane: "front", unit: "height", more: "higher", less: "lower", compute: (g) => above(g("front_hip"), g("back_hip")) },
  { id: "feet_across", label: "Front foot across from the back foot", plane: "front", unit: "height", more: "further to the off side", less: "further to the leg side", compute: (g) => ahead(g("front_ankle"), g("back_ankle")) },
  { id: "front_knee_across", label: "Front knee across from the front foot", plane: "front", unit: "height", more: "further to the off side", less: "further to the leg side", compute: (g) => ahead(g("front_knee"), g("front_ankle")) },
  { id: "hands_across", label: "Hands across from the head", plane: "front", unit: "height", more: "further to the off side", less: "further to the leg side", compute: (g) => ahead(hands2(g), g("head")) },
  { id: "front_elbow_height_front", label: "Front elbow against the shoulder", plane: "front", unit: "height", more: "higher", less: "lower", compute: (g) => above(g("front_elbow"), g("front_shoulder")) },
];

/** A measure's own value in words: which way a positive and a negative value lie. Null: it has no direction (a bend). */
export function directionOf(f: Pick<FeatureDef, "id" | "plane" | "unit">): readonly [string, string] | null {
  if (f.id.includes("bend") || f.id === "stride") return null;
  if (f.unit === "deg") return f.plane === "side" ? ["forward", "back"] : ["to the off side", "to the leg side"];
  if (/height|level|hip_height/.test(f.id)) return ["above", "below"];
  return f.plane === "side" ? ["ahead", "behind"] : ["to the off side", "to the leg side"];
}

/**
 * A measure's value as a person reads it: degrees, or centimetres when the batter's height is
 * known (else a share of it), with which way it lies. Never a minus sign.
 */
export function valueInWords(f: Pick<FeatureDef, "id" | "plane" | "unit">, value: number | null, heightCm: number | null): string {
  if (value === null) return "not seen";
  const dir = directionOf(f);
  const way = dir ? (value >= 0 ? dir[0] : dir[1]) : "";
  if (f.unit === "deg") {
    const n = Math.round(Math.abs(value));
    return dir ? (n === 0 ? "upright" : `${n}° ${way}`) : `${n}°`;
  }
  const n = heightCm ? Math.round(Math.abs(value) * heightCm) : Math.round(Math.abs(value) * 100);
  if (n === 0) return "level";
  return `${n}${heightCm ? " cm" : "% of height"} ${way}`.trim();
}

export const planesOf = (angles: ModelAngles): Plane[] => (angles === "both" ? ["side", "front"] : [angles]);

export interface Measure {
  id: string;
  label: string;
  plane: Plane;
  unit: "deg" | "height";
  value: number | null;
}
/** The model's own numbers at one moment, for the planes it was placed in. */
export function measuresOf(pose: Pose, angles: ModelAngles): Measure[] {
  const planes = planesOf(angles);
  return FEATURES.filter((f) => planes.includes(f.plane)).map((f) => ({ id: f.id, label: f.label, plane: f.plane, unit: f.unit, value: f.compute(poseInPlane(pose, f.plane)) }));
}

// ---------- A clip against a model ----------

export interface ModelCheckRow {
  id: string;
  label: string;
  plane: Plane;
  unit: "deg" | "height";
  /** The clip's value; null when the camera didn't see the joints it needs. */
  yours: number | null;
  model: number;
  /** yours − model; null when not seen. */
  diff: number | null;
  within: boolean | null;
  /** The difference in words ("more bent"), when outside the model's tolerance. */
  reads: string | null;
}
export interface ModelCheckMoment {
  id: MomentId;
  label: string;
  frame: number;
  rows: ModelCheckRow[];
  compared: number;
  matched: number;
}
export type NotAppliedReason = "not_confirmed" | "other_shot" | "other_side" | "camera" | "photo" | "no_contact" | "nothing_seen";
export interface ModelCheck {
  schema: typeof MODEL_CHECK_SCHEMA;
  modelId: string;
  modelName: string;
  applied: boolean;
  /** Why the model was not applied, in a sentence. */
  reason: NotAppliedReason | null;
  says: string | null;
  plane: Plane | null;
  moments: ModelCheckMoment[];
  compared: number;
  matched: number;
}

const SHOT_NAME: Record<TargetShot, string> = { front_foot_defence: "front-foot defence", back_foot_defence: "back-foot defence" };
const NOT_APPLIED: Record<NotAppliedReason, (m: PoseModel) => string> = {
  not_confirmed: (m) => `Your model is for the ${SHOT_NAME[m.shot]}. Aline couldn't confirm this clip as one, so the model wasn't applied.`,
  other_shot: (m) => `Your model is for the ${SHOT_NAME[m.shot]}. This clip is a different shot, so the model wasn't applied.`,
  other_side: (m) => `Your model was made for a ${m.battingSide}-handed batter. It is never flipped for the other side, so it wasn't applied.`,
  camera: (m) =>
    m.angles === "both"
      ? "Your model needs a clip filmed from the side or from the bowler's end. This camera position can't be compared with it."
      : `Your model was placed from ${m.angles === "side" ? "the side" : "the bowler's end"} only. This clip was filmed from another position, so it wasn't applied.`,
  photo: () => "A photo can't show which shot was played, so your model wasn't applied. Send a video.",
  no_contact: () => "Aline couldn't find the moment of contact in this clip, so there was nothing to set your model against.",
  nothing_seen: () => "The camera didn't see the joints your model is placed on at the moments it holds.",
};

/** Which way the off side is in a picture taken along the pitch: +1 when it is on the right. */
const offSideRight = (view: CaptureObservation["camera"]["view"], side: Handedness) => (view === "front_on" ? -1 : 1) * (side === "right" ? 1 : -1);

/** The clip's joints at one frame, in the camera's plane, in body heights, off side or bowler positive. */
export function clipInPlane(scene: Scene, obs: CaptureObservation, frame: number): Get2 {
  const k = scene.plane === "frontal" ? offSideRight(obs.camera.view, obs.athlete.handedness) : 1;
  return (joint) => {
    const p = scene.inPicture(frame, joint);
    return p && scene.stature > 0 ? [(k * p[0]) / scene.stature, p[1] / scene.stature] : null;
  };
}

/**
 * Sets a tracked clip against a model. Pure: reads the stored result and tracks, changes
 * neither. The model is applied only when Aline confirmed the clip as the model's shot, for the
 * batting side it was made for, from a camera position it was placed in.
 */
export function checkAgainstModel(model: PoseModel, obs: CaptureObservation, payload: AnalysisPayload): ModelCheck {
  const base = { schema: MODEL_CHECK_SCHEMA, modelId: model.id, modelName: model.name, moments: [] as ModelCheckMoment[], compared: 0, matched: 0 };
  const no = (reason: NotAppliedReason, plane: Plane | null = null): ModelCheck => ({ ...base, applied: false, reason, says: NOT_APPLIED[reason](model), plane });

  if (payload.mode === "posture_screen" || obs.media.kind === "photo") return no("photo");
  if (payload.requested_shot !== model.shot) return no("other_shot");
  if (payload.analysis_status !== "valid") return no(payload.analysis_status === "invalid_for_requested_analysis" ? "other_shot" : "not_confirmed");
  if (obs.athlete.handedness !== model.battingSide) return no("other_side");
  const view = obs.camera.view;
  const plane: Plane | null = view === "side_on" ? "side" : view === "front_on" || view === "behind" ? "front" : null;
  if (!plane || !planesOf(model.angles).includes(plane)) return no("camera", plane);

  const scene = buildScene(obs);
  const frameOf = (type: EventType) => payload.events.find((e) => e.type === type)?.frame ?? null;
  if (frameOf("contact") === null) return no("no_contact", plane);

  const moments: ModelCheckMoment[] = [];
  for (const m of MOMENTS) {
    const pose = model.moments[m.id];
    const frame = frameOf(m.event[model.shot]);
    if (!pose || frame === null) continue;
    const mine = clipInPlane(scene, obs, frame);
    const theirs = poseInPlane(pose, plane);
    const rows: ModelCheckRow[] = [];
    for (const f of FEATURES) {
      if (f.plane !== plane) continue;
      const want = f.compute(theirs);
      if (want === null) continue;
      const got = f.compute(mine);
      const diff = got === null ? null : got - want;
      const tol = f.unit === "deg" ? model.tolerance.angleDeg : model.tolerance.offset;
      const within = diff === null ? null : Math.abs(diff) <= tol;
      rows.push({ id: f.id, label: f.label, plane: f.plane, unit: f.unit, yours: got, model: want, diff, within, reads: within === false ? (diff! > 0 ? f.more : f.less) : null });
    }
    const compared = rows.filter((r) => r.within !== null).length;
    moments.push({ id: m.id, label: m.label, frame, rows, compared, matched: rows.filter((r) => r.within).length });
  }
  const compared = moments.reduce((n, m) => n + m.compared, 0);
  if (!compared) return no("nothing_seen", plane);
  return { ...base, applied: true, reason: null, says: null, plane, moments, compared, matched: moments.reduce((n, m) => n + m.matched, 0) };
}

/** An amount in everyday words: degrees, or a share of the batter's height. Never a minus sign. */
export function amount(unit: "deg" | "height", value: number): string {
  const v = Math.abs(value);
  return unit === "deg" ? `${Math.round(v)}°` : `${Math.round(v * 100)}% of your height`;
}

export interface ModelLine {
  kind: "good" | "fix" | "info";
  text: string;
}
/**
 * The check in a few plain sentences, the largest differences first (as a share of the model's
 * own tolerance, so degrees and distances can be ranked together). `numbers` false: no figures.
 */
export function modelLines(check: ModelCheck, model: PoseModel, numbers: boolean, max = 3): ModelLine[] {
  if (!check.applied) return [{ kind: "info", text: check.says ?? "" }];
  const out: ModelLine[] = [];
  const contact = check.moments.find((m) => m.id === "contact") ?? check.moments[check.moments.length - 1]!;
  out.push({
    kind: check.matched === check.compared ? "good" : "info",
    text: check.matched === check.compared ? `Every one of the ${check.compared} checks matches your model.` : `${check.matched} of ${check.compared} checks match your model.`,
  });
  const size = (r: ModelCheckRow) => Math.abs(r.diff!) / (r.unit === "deg" ? model.tolerance.angleDeg : model.tolerance.offset);
  const off = check.moments
    .flatMap((m) => m.rows.filter((r) => r.within === false).map((r) => ({ m, r })))
    .sort((a, b) => (a.m.id === b.m.id ? size(b.r) - size(a.r) : a.m.id === contact.id ? -1 : b.m.id === contact.id ? 1 : size(b.r) - size(a.r)));
  for (const { m, r } of off.slice(0, max)) {
    const at = m.id === "contact" ? "At contact" : m.id === "backlift" ? "At the top of the backlift" : "When the foot lands";
    out.push({ kind: "fix", text: numbers ? `${at}, ${r.label.toLowerCase()}: ${amount(r.unit, r.diff!)} ${r.reads} than your model.` : `${at}, ${r.label.toLowerCase()}: ${r.reads} than your model.` });
  }
  return out;
}

// ---------- As text ----------

const round = (n: number) => Math.round(n * 10000) / 10000;
const AXES = "Positions are in body heights (1 = the batter's standing height), from the point on the ground under the hips at contact. forward: toward the bowler. up: above the ground. across: toward the off side. Joints are named by role: front is the side nearer the bowler; the top hand is the front wrist.";

/**
 * A model as text (JSON), complete enough to rebuild it anywhere: every joint at every moment,
 * the tolerances, and (for reading, ignored when read back) the lengths and measures they give.
 * An axis the author did not place (a single-angle model) is written as null.
 */
export function modelToText(model: PoseModel): string {
  const cm = (v: number) => (model.heightCm ? Math.round(v * model.heightCm * 10) / 10 : null);
  const moments: Record<string, unknown> = {};
  for (const m of MOMENTS) {
    const pose = model.moments[m.id];
    if (!pose) continue;
    const joints: Record<string, unknown> = {};
    for (const k of MODEL_JOINTS) {
      joints[k] = {
        forward: model.angles === "front" ? null : round(pose[k][0]),
        up: round(pose[k][1]),
        across: model.angles === "side" ? null : round(pose[k][2]),
      };
    }
    moments[m.id] = {
      label: m.label,
      joints,
      measures: Object.fromEntries(measuresOf(pose, model.angles).map((x) => [x.id, x.value === null ? null : { value: round(x.value), unit: x.unit === "deg" ? "degrees" : "body heights", plane: x.plane }])),
    };
  }
  const seg = segments(model.moments.contact);
  return JSON.stringify(
    {
      schema: POSE_MODEL_SCHEMA,
      name: model.name,
      shot: model.shot,
      batting_side: model.battingSide,
      angles: model.angles,
      height_cm: model.heightCm,
      units: AXES,
      tolerance: { angle_degrees: model.tolerance.angleDeg, offset_body_heights: model.tolerance.offset },
      note: model.note,
      moments,
      segments: Object.fromEntries((Object.keys(seg) as Array<keyof Segments>).map((k) => [k, { body_heights: round(seg[k]), cm: cm(seg[k]) }])),
    },
    null,
    2,
  );
}

export type ReadModel = { ok: true; model: Omit<PoseModel, "id" | "createdAt" | "updatedAt"> } | { ok: false; problem: string };

/**
 * Reads a model back from its text. `fill` gives the pose to take an unplaced axis from (a
 * single-angle model writes that axis as null). Says plainly what is wrong when it can't.
 */
export function modelFromText(text: string, fill: (shot: TargetShot, moment: MomentId) => Pose): ReadModel {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, problem: "This isn't a model's text: it can't be read as JSON." };
  }
  if (!o || typeof o !== "object") return { ok: false, problem: "This isn't a model's text." };
  if (o.schema !== POSE_MODEL_SCHEMA) return { ok: false, problem: `Not an Aline shot model (its schema should be "${POSE_MODEL_SCHEMA}").` };
  const shot = o.shot as TargetShot;
  if (shot !== "front_foot_defence" && shot !== "back_foot_defence") return { ok: false, problem: "The shot must be front_foot_defence or back_foot_defence." };
  const battingSide = o.batting_side as Handedness;
  if (battingSide !== "right" && battingSide !== "left") return { ok: false, problem: "batting_side must be right or left." };
  const angles = (o.angles ?? "both") as ModelAngles;
  if (!["both", "side", "front"].includes(angles)) return { ok: false, problem: "angles must be both, side or front." };
  const src = (o.moments ?? {}) as Record<string, { joints?: Record<string, { forward?: number | null; up?: number | null; across?: number | null }> }>;
  const moments = {} as PoseModel["moments"];
  for (const m of MOMENTS) {
    const joints = src[m.id]?.joints;
    if (!joints) continue;
    const base = fill(shot, m.id);
    const pose = {} as Pose;
    for (const k of MODEL_JOINTS) {
      const q = joints[k];
      if (!q) return { ok: false, problem: `"${m.id}" is missing the joint ${k}.` };
      const v: [number, number, number] = [q.forward ?? base[k][0], q.up ?? NaN, q.across ?? base[k][2]];
      if (!v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 4)) return { ok: false, problem: `"${m.id}", ${k}: each of forward, up and across must be a number of body heights.` };
      pose[k] = v;
    }
    moments[m.id] = pose;
  }
  if (!moments.contact) return { ok: false, problem: "A model needs the contact moment." };
  const t = (o.tolerance ?? {}) as { angle_degrees?: number; offset_body_heights?: number };
  const angleDeg = typeof t.angle_degrees === "number" && t.angle_degrees > 0 && t.angle_degrees <= 90 ? t.angle_degrees : STRICTNESS[1].angleDeg;
  const offset = typeof t.offset_body_heights === "number" && t.offset_body_heights > 0 && t.offset_body_heights <= 1 ? t.offset_body_heights : STRICTNESS[1].offset;
  const heightCm = typeof o.height_cm === "number" && o.height_cm >= 90 && o.height_cm <= 230 ? o.height_cm : null;
  return {
    ok: true,
    model: {
      schema: POSE_MODEL_SCHEMA,
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 80) : "Imported model",
      shot,
      battingSide,
      angles,
      heightCm,
      moments,
      tolerance: { angleDeg, offset },
      note: typeof o.note === "string" ? o.note.slice(0, 2000) : "",
    },
  };
}
