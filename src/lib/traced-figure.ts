// The shot-model figure: line art traced from the owner's own clips (scripts/trace/rig.py,
// public/art/model-*.json), bent to the pose a person places. Asked for on 2026-11-17 ("the base
// model itself is wrong… do not use this figure at all", with a line-art reference): a real
// batter, drawn from film, instead of a drawn mannequin or a generated pose.
//
// How it bends: every point of the drawing is tied to the one or two bones nearest it in the
// traced pose (its place along the bone and its distance to one side). When the joints move, the
// point keeps that place on the moved bones. In 3D a tracing is a flat cut-out on its own plane at
// the hips' depth, turned with the figure: the side tracing nearer side-on, the bowler's-end one
// nearer front-on. It is never mirrored for a left-hander (standing rule 7: a left-hander needs a
// left-hander's clip).
//
// Pure: no drawing here, no fetching. tests/traced-figure.test.ts holds it to the traced pose.

import { poseInPlane, type Get2, type ModelPoint, type MomentId, type Plane, type Pose, type V3 } from "@/engine/pose-model";
import type { Handedness, TargetShot } from "@/engine/types";

export const TRACED_FIGURE_SCHEMA = "aline.traced-figure/1" as const;
type Xyz = [number, number, number];

/** One moment of a traced clip: the batter's pose, and the drawing in thousandths of their height. */
export interface TracedMoment {
  frame: number;
  pose: Record<string, Xyz>;
  /** The body's lines: closed shapes, flat [x, y, x, y, …] in the plane, filled even-odd. */
  body: number[][];
  /** The bat as traced: where the top hand holds it, its toe (plane units), and its outline (thousandths). */
  bat?: { handle: [number, number]; toe: [number, number]; outline: number[] };
  /** The hands' outlines, drawn over the bat. */
  grips?: number[][];
}
export interface TracedFigure {
  schema: typeof TRACED_FIGURE_SCHEMA;
  shot: TargetShot;
  view: Plane;
  camera: "side_on" | "front_on";
  batting_side: Handedness;
  clip: string;
  moments: Partial<Record<MomentId, TracedMoment>>;
}

/**
 * The traced figures there are, right-handed, from the clips the owner sent (2026-11-17): each
 * shot side-on, and the back-foot defence from the bowler's end. There is no clip of a front-foot
 * defence from the bowler's end, so that view borrows the back-foot one, bent to the pose, and
 * says so (`from`).
 */
export const FIGURE_FILES: Record<TargetShot, Record<Plane, { file: string; from: TargetShot }>> = {
  front_foot_defence: { side: { file: "/art/model-ffd-side.json", from: "front_foot_defence" }, front: { file: "/art/model-bfd-front.json", from: "back_foot_defence" } },
  back_foot_defence: { side: { file: "/art/model-bfd-side.json", from: "back_foot_defence" }, front: { file: "/art/model-bfd-front.json", from: "back_foot_defence" } },
};
/** The figure for a shot seen from one side: null for a left-hander (a tracing is never mirrored). */
export const figureFile = (shot: TargetShot, plane: Plane, side: Handedness) => (side === "right" ? FIGURE_FILES[shot][plane] : null);

/** A traced moment's pose as the model's own pose type (the bat put in its traced direction is left to the caller). */
export function tracedPose(m: TracedMoment): Pose {
  return Object.fromEntries(Object.entries(m.pose).map(([k, v]) => [k, v as V3])) as Pose;
}

// ---------- Bones ----------

type P2 = readonly [number, number];
type Pt = readonly number[];
/** A bone: in the picture's plane (the rest pose) or in 3D (the pose being placed). */
export type Bone<P extends Pt = P2> = { a: P; b: P } | null;
const mid = <P extends Pt>(a: P | null, b: P | null): P | null => (a && b ? (a.map((v, i) => (v + b[i]!) / 2) as unknown as P) : null);
const pair = <P extends Pt>(a: P | null, b: P | null): Bone<P> => (a && b ? { a, b } : null);

/** A pose's points in 3D, the bat too when it has one. */
export const points3 = (pose: Pose) => (p: ModelPoint): V3 | null => pose[p] ?? null;

/**
 * Where a tracing's bones are for a pose being placed: the traced pose, moved by how far each
 * joint has been moved from the model's starting pose. A tracing and the starting pose come
 * from different balls (the side-on and the bowler's-end clips are two takes), so bending a
 * tracing straight onto the starting pose would pull it out of shape; this way a tracing is
 * shown as traced until a joint is moved, then follows the move. The bat is a rigid blade in the
 * hands: it goes where the model's bat is.
 */
export function followFrom(traced: Pose, start: Pose, now: Pose, plane: Plane) {
  // The tracing stands where the starting pose stands: its hips over the same spot on the ground.
  const hips = (q: Pose) => [(q.front_hip[0] + q.back_hip[0]) / 2, (q.front_hip[2] + q.back_hip[2]) / 2];
  const [dx, dz] = [hips(start)[0]! - hips(traced)[0]!, hips(start)[1]! - hips(traced)[1]!];
  // A tracing has its shape in its own plane only, so it stays a flat cut-out at the hips' depth:
  // bent round bones that point toward the camera, its lines would tear (2026-11-17, a 3D turn).
  const depth = plane === "side" ? 2 : 0;
  const flat = (now.front_hip[depth] + now.back_hip[depth]) / 2;
  return (p: ModelPoint): V3 | null => {
    if (p === "bat_handle" || p === "bat_toe") return now[p] ?? null;
    const r = traced[p];
    const a = start[p];
    const b = now[p];
    if (!r || !a || !b) return null;
    const out: [number, number, number] = [r[0] + dx + b[0] - a[0], r[1] + b[1] - a[1], r[2] + dz + b[2] - a[2]];
    out[depth] = flat;
    return out;
  };
}

/** The bones the body's lines are tied to, in one order: the trunk, head, shoulders, hips, then each limb. */
export function bodyBones<P extends Pt>(g: (p: ModelPoint) => P | null): Bone<P>[] {
  const pelvis = mid(g("front_hip"), g("back_hip"));
  const chest = mid(g("front_shoulder"), g("back_shoulder"));
  const out: Bone<P>[] = [pair(pelvis, chest), pair(chest, g("head")), pair(g("back_shoulder"), g("front_shoulder")), pair(g("back_hip"), g("front_hip"))];
  for (const s of ["front", "back"] as const) {
    const j = (part: string) => g(`${s}_${part}` as ModelPoint);
    out.push(pair(j("shoulder"), j("elbow")), pair(j("elbow"), j("wrist")), pair(j("hip"), j("knee")), pair(j("knee"), j("ankle")), pair(j("ankle"), j("foot")), pair(j("heel"), j("foot")));
  }
  return out;
}
/** The forearms only: the hands' outlines are tied to them. */
export const handBones = <P extends Pt>(g: (p: ModelPoint) => P | null): Bone<P>[] => [pair(g("front_elbow"), g("front_wrist")), pair(g("back_elbow"), g("back_wrist"))];
export const batBones = <P extends Pt>(g: (p: ModelPoint) => P | null): Bone<P>[] => [pair(g("bat_handle"), g("bat_toe"))];

/** The traced moment's own points in its plane, the bat as traced. */
export function restPoints(m: TracedMoment, plane: Plane): Get2 {
  const pose = poseInPlane(tracedPose(m), plane);
  return (p) => (p === "bat_handle" ? m.bat?.handle ?? null : p === "bat_toe" ? m.bat?.toe ?? null : pose(p));
}

// ---------- Tying the drawing to the bones, and bending it ----------

/** Per point: two bones, the place along each (a share of its length) and the distance to one side, and the first bone's weight. */
export interface Bound {
  shapes: Float32Array[];
}
const SHORT = 0.02; // a bone shorter than this in the picture (seen end-on) can't carry a drawing

/**
 * Ties shapes (flat, thousandths) to the nearest one or two bones of the rest pose. A point
 * well inside one bone's reach follows that bone alone; near a joint it blends the two, so the
 * line bends round the joint instead of tearing.
 */
export function bind(shapes: number[][], rest: Bone[]): Bound {
  const usable = rest.map((b) => (b && Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) >= SHORT ? b : null));
  return {
    shapes: shapes.map((flat) => {
      const n = flat.length / 2;
      const out = new Float32Array(n * 7);
      for (let i = 0; i < n; i++) {
        const x = flat[2 * i]! / 1000;
        const y = flat[2 * i + 1]! / 1000;
        let best = [-1, Infinity, 0, 0];
        let next = [-1, Infinity, 0, 0];
        usable.forEach((b, k) => {
          if (!b) return;
          const ux = b.b[0] - b.a[0];
          const uy = b.b[1] - b.a[1];
          const L = Math.hypot(ux, uy);
          const t = ((x - b.a[0]) * ux + (y - b.a[1]) * uy) / (L * L);
          const c = Math.min(1, Math.max(0, t));
          const d = Math.hypot(x - (b.a[0] + ux * c), y - (b.a[1] + uy * c));
          const off = ((x - b.a[0]) * -uy + (y - b.a[1]) * ux) / L;
          const row = [k, d, t, off];
          if (d < best[1]!) {
            next = best;
            best = row;
          } else if (d < next[1]!) next = row;
        });
        // One bone per point: a part moves rigidly with its bone (a cut-out pinned at the joints).
        // Blending two bones stretched lines across the body when a joint moved far (2026-11-17).
        void next;
        out.set([best[0]!, best[2]!, best[3]!, best[0]!, best[2]!, best[3]!, 1], i * 7);
      }
      return out;
    }),
  };
}

/**
 * The plane a drawing was traced in, as the direction it is seen along: a bone's sideways
 * direction in the drawing is (this × the bone). Side: forward and up, seen along the across
 * axis; front: across and up, seen along the pitch.
 */
export const PLANE_NORMAL: Record<Plane, V3> = { side: [0, 0, 1], front: [-1, 0, 0] };

/** Where a point tied at (t along, off to one side) of a bone is, on the bone as it is now in 3D. */
function place(b: Bone<V3>, t: number, off: number, n: V3): V3 | null {
  if (!b) return null;
  const u: V3 = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]];
  let side: V3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  let L = Math.hypot(...side);
  if (L < 1e-9) {
    // The bone points straight along the line of sight: its sideways direction is taken as up.
    side = [0, 1, 0];
    L = 1;
  }
  return [b.a[0] + u[0] * t + (side[0] / L) * off, b.a[1] + u[1] * t + (side[1] / L) * off, b.a[2] + u[2] * t + (side[2] / L) * off];
}

/**
 * The shapes on the bones as they are now, in 3D. With `cut`, a traced line is cut where it
 * passes from one body part to the next, and each piece is returned as an open line on its own
 * part, so a part that moves never drags a line across the body. A point whose bone is unseen is
 * dropped.
 */
export function bend(bound: Bound, now: Bone<V3>[], plane: Plane, cut = false): V3[][] {
  const n = PLANE_NORMAL[plane];
  const out: V3[][] = [];
  for (const v of bound.shapes) {
    let piece: V3[] = [];
    let bone = -1;
    for (let i = 0; i < v.length; i += 7) {
      const p = place(now[v[i]!] ?? null, v[i + 1]!, v[i + 2]!, n);
      if (cut && v[i] !== bone && piece.length) {
        out.push(piece);
        piece = [];
      }
      bone = v[i]!;
      if (p) piece.push(p);
    }
    if (piece.length) out.push(piece);
  }
  return out;
}

/**
 * A bat's outline for a moment whose clip didn't show the bat clearly enough to trace: a
 * full-size blade and handle (BAT's sizes), tied to the bat's own bone from the top hand to the toe.
 */
export function plainBat(handsToToe: number, aboveHands: number, blade: number, width: number): Bound {
  const t = (d: number) => d / handsToToe;
  const half = width / 2;
  const grip = 0.0125;
  const shoulder = 1 - t(blade);
  const outline: Array<[number, number]> = [
    [t(-aboveHands), -grip], [shoulder, -grip], [shoulder + 0.02, -half], [0.985, -half], [1, -half * 0.7],
    [1, half * 0.7], [0.985, half], [shoulder + 0.02, half], [shoulder, grip], [t(-aboveHands), grip],
  ];
  const v = new Float32Array(outline.length * 7);
  outline.forEach(([along, off], i) => v.set([0, along, off, 0, along, off, 1], i * 7));
  return { shapes: [v] };
}
