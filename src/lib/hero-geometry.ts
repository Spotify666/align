// Geometry for the landing page's figure: a jointed line figure on a pitch, projected from the
// engine's own 3D track of a generated defence. Pure: the server draws the still (SVG) and the
// browser draws the moving one (canvas) from the same numbers.

import { JOINTS, type CaptureObservation } from "@/engine/types";

export type V3 = readonly [number, number, number]; // forward (toward the bowler), up, lateral: metres

export const HERO_JOINTS = ["nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"] as const;
/** Bones as pairs of HERO_JOINTS indices. */
export const BONES: ReadonlyArray<readonly [number, number]> = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12]];
/** The front side of a right-hander, ground up: ankle, knee, hip, shoulder, elbow, wrist. */
export const CHAIN: readonly number[] = [11, 9, 7, 1, 3, 5];
/** The line: front foot, front knee, front shoulder, head. */
export const LINE: readonly number[] = [11, 9, 1, 0];

export interface HeroData {
  /** frames[frame][joint] = [forward, up, lateral] in metres, rounded to the centimetre. */
  frames: number[][][];
  /** Index in `frames` of the moment the bat meets the ball. */
  contact: number;
  fps: number;
}

/** The stretch of a 3D track around contact, thinned to what a slow loop needs. */
export function heroData(obs: CaptureObservation, contactFrame: number, opts: { before?: number; after?: number; step?: number } = {}): HeroData | null {
  if (!obs.body3d) return null;
  const { before = 72, after = 24, step = 3 } = opts;
  const idx = HERO_JOINTS.map((j) => JOINTS.indexOf(j));
  const frames: number[][][] = [];
  let contact = 0;
  for (let f = Math.max(0, contactFrame - before); f <= Math.min(obs.body3d.length - 1, contactFrame + after); f += step) {
    const row = obs.body3d[f]!;
    const pts = idx.map((k) => row[k]);
    if (pts.some((p) => !p)) continue;
    if (f <= contactFrame) contact = frames.length;
    frames.push(pts.map((p) => [Math.round(p![0] * 100) / 100, Math.round(p![1] * 100) / 100, Math.round(p![2] * 100) / 100]));
  }
  return frames.length > 8 ? { frames, contact, fps: (obs.media.fps ?? 60) / step } : null;
}

export interface Camera {
  /** Turn about the vertical (radians): 0 = square side-on, the bowler to the right. */
  yaw: number;
  /** Looking down (radians). */
  pitch: number;
  /** Distance from the point looked at (m). */
  dist: number;
  target: V3;
}

export const HERO_CAMERA: Camera = { yaw: 0.5, pitch: 0.16, dist: 7.5, target: [1.35, 0.78, 0] };

/** Where a point lands on a w × h picture, and how near it is (larger = nearer). */
export function project(p: V3, cam: Camera, w: number, h: number): [number, number, number] {
  const f = p[0] - cam.target[0];
  const u = p[1] - cam.target[1];
  const l = p[2] - cam.target[2];
  const x = f * Math.cos(cam.yaw) + l * Math.sin(cam.yaw);
  const z0 = -f * Math.sin(cam.yaw) + l * Math.cos(cam.yaw);
  const y = u * Math.cos(cam.pitch) - z0 * Math.sin(cam.pitch);
  const z = u * Math.sin(cam.pitch) + z0 * Math.cos(cam.pitch);
  const s = cam.dist / (cam.dist + z);
  const unit = Math.min(h * 0.4, w * 0.3);
  return [w / 2 + x * s * unit, h * 0.6 - y * s * unit, s];
}

/** The pitch to scale: its edges, the two creases at the batter's end and the stumps (m). */
export const PITCH: { lines: Array<readonly [V3, V3]>; stumps: Array<readonly [V3, V3]> } = (() => {
  const half = 1.525; // a pitch is 3.05 m wide
  const from = -0.9;
  const to = 5.2;
  const lines: Array<readonly [V3, V3]> = [
    [[from, 0, -half], [to, 0, -half]],
    [[from, 0, half], [to, 0, half]],
    [[0, 0, -half], [0, 0, half]], // bowling crease, through the stumps
    [[1.22, 0, -half], [1.22, 0, half]], // popping crease, 1.22 m in front
  ];
  const stumps = [-0.114, 0, 0.114].map((l) => [[0, 0, l], [0, 0.711, l]] as const);
  return { lines, stumps };
})();

/** Two frames blended (t from 0 to 1). */
export function blend(a: number[][], b: number[][], t: number): number[][] {
  return a.map((p, i) => p.map((v, k) => v + (b[i]![k]! - v) * t));
}

const pt = (p: number[]) => p as unknown as V3;
const d = (pts: Array<[number, number, number]>) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

/** The still: path data for the pitch, the figure at contact and the line, on a w × h picture. */
export function posterPaths(data: HeroData, w: number, h: number, cam: Camera = HERO_CAMERA) {
  const frame = data.frames[data.contact]!;
  const P = (v: V3) => project(v, cam, w, h);
  const joints = frame.map((p) => P(pt(p)));
  const head: [number, number, number] = [joints[0]![0], joints[0]![1], joints[0]![2]];
  const neck: [number, number, number] = [(joints[1]![0] + joints[2]![0]) / 2, (joints[1]![1] + joints[2]![1]) / 2, 1];
  return {
    pitch: [...PITCH.lines, ...PITCH.stumps].map(([a, b]) => d([P(a), P(b)])).join(""),
    bones: BONES.map(([a, b]) => d([joints[a]!, joints[b]!])).join("") + d([neck, head]),
    line: d(LINE.map((i) => joints[i]!)),
    joints: joints.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]),
    headRadius: Math.max(4, 0.11 * joints[0]![2] * Math.min(h * 0.4, w * 0.3)),
  };
}
