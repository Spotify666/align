// The shot-model figure: line art traced from the owner's own clips (scripts/trace/rig.py,
// public/art/model-*.json), bent to the pose a person places. Asked for on 2026-11-17 ("the base
// model itself is wrong… do not use this figure at all", with a line-art reference): a real
// batter, drawn from film, instead of a drawn mannequin or a generated pose.
//
// How it bends: every point of the drawing is tied to the one or two bones nearest it in the
// traced pose (its place along the bone and its distance to one side). When the joints move, the
// point keeps that place on the moved bones. The drawing is in one camera's plane (side: forward
// and up; front: across and up), so it is shown only in that view; it is never mirrored for a
// left-hander (standing rule 7: a left-hander needs a left-hander's clip).
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
 * The traced figures there are: side-on, right-handed, from the clips the owner sent. None from
 * the bowler's end yet: the one clip from there (a back-foot defence at the nets) shows the batter
 * too small to trace cleanly (2026-11-17), so that view shows the joints only.
 */
export const FIGURE_FILES: Record<TargetShot, Partial<Record<Plane, string>>> = {
  front_foot_defence: { side: "/art/model-ffd-side.json" },
  back_foot_defence: { side: "/art/model-bfd-side.json" },
};
export const figureFile = (shot: TargetShot, plane: Plane, side: Handedness): string | null => (side === "right" ? FIGURE_FILES[shot][plane] ?? null : null);

/** A traced moment's pose as the model's own pose type (the bat put in its traced direction is left to the caller). */
export function tracedPose(m: TracedMoment): Pose {
  return Object.fromEntries(Object.entries(m.pose).map(([k, v]) => [k, v as V3])) as Pose;
}

// ---------- Bones ----------

type P2 = readonly [number, number];
export type Bone = { a: P2; b: P2 } | null;
const mid = (a: P2 | null, b: P2 | null): P2 | null => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null);
const pair = (a: P2 | null, b: P2 | null): Bone => (a && b ? { a, b } : null);

/** The bones the body's lines are tied to, in one order: the trunk, head, shoulders, hips, then each limb. */
export function bodyBones(g: Get2): Bone[] {
  const pelvis = mid(g("front_hip"), g("back_hip"));
  const chest = mid(g("front_shoulder"), g("back_shoulder"));
  const out: Bone[] = [pair(pelvis, chest), pair(chest, g("head")), pair(g("back_shoulder"), g("front_shoulder")), pair(g("back_hip"), g("front_hip"))];
  for (const s of ["front", "back"] as const) {
    const j = (part: string) => g(`${s}_${part}` as ModelPoint);
    out.push(pair(j("shoulder"), j("elbow")), pair(j("elbow"), j("wrist")), pair(j("hip"), j("knee")), pair(j("knee"), j("ankle")), pair(j("ankle"), j("foot")), pair(j("heel"), j("foot")));
  }
  return out;
}
/** The forearms only: the hands' outlines are tied to them. */
export const handBones = (g: Get2): Bone[] => [pair(g("front_elbow"), g("front_wrist")), pair(g("back_elbow"), g("back_wrist"))];
export const batBones = (g: Get2): Bone[] => [pair(g("bat_handle"), g("bat_toe"))];

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
        const w1 = next[0]! < 0 ? 1 : (1 / (best[1]! + 0.004) ** 4) / (1 / (best[1]! + 0.004) ** 4 + 1 / (next[1]! + 0.004) ** 4);
        out.set([best[0]!, best[2]!, best[3]!, next[0]! < 0 ? best[0]! : next[0]!, next[2]!, next[3]!, w1], i * 7);
      }
      return out;
    }),
  };
}

/** Where a point tied at (t along, off to one side) of a bone is, on the bone as it is now. */
function place(b: Bone, t: number, off: number): [number, number] | null {
  if (!b) return null;
  const ux = b.b[0] - b.a[0];
  const uy = b.b[1] - b.a[1];
  const L = Math.hypot(ux, uy);
  if (L < 1e-9) return [b.a[0], b.a[1]];
  return [b.a[0] + ux * t + (-uy / L) * off, b.a[1] + uy * t + (ux / L) * off];
}

/** The shapes on the bones as they are now, in plane units. A point whose bones are both unseen is dropped. */
export function bend(bound: Bound, now: Bone[]): Array<Array<[number, number]>> {
  return bound.shapes.map((v) => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < v.length; i += 7) {
      const p = place(now[v[i]!] ?? null, v[i + 1]!, v[i + 2]!);
      const q = place(now[v[i + 3]!] ?? null, v[i + 4]!, v[i + 5]!);
      const w = v[i + 6]!;
      if (p && q) pts.push([p[0] * w + q[0] * (1 - w), p[1] * w + q[1] * (1 - w)]);
      else if (p || q) pts.push((p ?? q)!);
    }
    return pts;
  });
}
