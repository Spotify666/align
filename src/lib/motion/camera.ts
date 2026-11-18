// The camera model a motion fit uses: a calibrated pinhole (3 × 4 matrix). Projection, linear
// triangulation of one point seen by two or more cameras (weighted by each sighting's confidence),
// and the reprojection error that says how well a fitted pose agrees with what each camera saw.
// Read by no part of the analysis.

import type { V3 } from "@/engine/rig";
import type { Camera } from "./types";

export function project(c: Camera, p: V3): [number, number] | null {
  const P = c.P;
  const w = P[8]! * p[0] + P[9]! * p[1] + P[10]! * p[2] + P[11]!;
  if (w <= 1e-9) return null; // behind the camera
  return [(P[0]! * p[0] + P[1]! * p[1] + P[2]! * p[2] + P[3]!) / w, (P[4]! * p[0] + P[5]! * p[1] + P[6]! * p[2] + P[7]!) / w];
}

/** Solves the 3 × 3 system A x = b (Cramer's rule); null when it is singular. */
function solve3(A: number[][], b: number[]): V3 | null {
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const d = det(A);
  if (Math.abs(d) < 1e-12) return null;
  const col = (k: number) => A.map((row, i) => row.map((v, j) => (j === k ? b[i]! : v)));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

/**
 * Linear triangulation (DLT, least squares in the inhomogeneous form): each sighting gives two
 * equations, weighted by its confidence and scaled by the image size so cameras of different
 * resolutions count alike. Needs two sightings or more; null otherwise.
 */
export function triangulate(sightings: Array<{ camera: Camera; uv: readonly [number, number]; w: number }>): V3 | null {
  const use = sightings.filter((s) => s.w > 0);
  if (use.length < 2) return null;
  const ATA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const ATb = [0, 0, 0];
  for (const { camera: c, uv, w } of use) {
    const P = c.P;
    const s = w / Math.max(c.width, c.height);
    for (const [r, val] of [[0, uv[0]], [1, uv[1]]] as const) {
      // (u P3 - P1) · X = 0, with X = (x, y, z, 1)
      const row = [0, 1, 2].map((k) => (val * P[8 + k]! - P[r * 4 + k]!) * s);
      const rhs = -(val * P[11]! - P[r * 4 + 3]!) * s;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) ATA[i]![j]! += row[i]! * row[j]!;
        ATb[i]! += row[i]! * rhs;
      }
    }
  }
  return solve3(ATA, ATb);
}

/** Pixels between where a camera saw a point and where the fitted point projects. */
export function reprojectionPx(c: Camera, seen: readonly [number, number], fitted: V3): number | null {
  const q = project(c, fitted);
  return q ? Math.hypot(q[0] - seen[0], q[1] - seen[1]) : null;
}
