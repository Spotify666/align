// Geometry for the landing page's figure: a jointed line figure on a pitch, projected from the
// engine's own 3D track of a generated defence. Pure: the server draws the still (SVG) and the
// browser draws the moving one (canvas) from the same numbers.

import { JOINTS, type CaptureObservation } from "@/engine/types";

export type V3 = readonly [number, number, number]; // forward (toward the bowler), up, lateral: metres

export const HERO_JOINTS = ["nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_foot", "right_foot"] as const;
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
  /** Per frame: the bat's handle and toe, where it was tracked. */
  bat: Array<[number[], number[]] | null>;
  /** Per frame: the ball, where it was tracked. */
  ball: Array<number[] | null>;
  /** The engine's ranges for the line: how far ahead of the front ankle each part may be, × stature. */
  bands: Record<LinePart, [number, number]>;
  /** The batter's height (m). */
  stature: number;
}

export type LinePart = "head" | "shoulder" | "knee";
/** Which joint each part of the line is read at, top down. */
export const LINE_PARTS: ReadonlyArray<{ part: LinePart; joint: number; name: string }> = [
  { part: "head", joint: 0, name: "Head" },
  { part: "shoulder", joint: 1, name: "Front shoulder" },
  { part: "knee", joint: 9, name: "Front knee" },
];

/** The stretch of a 3D track around contact, thinned to what a slow loop needs. */
export function heroData(obs: CaptureObservation, contactFrame: number, bands: HeroData["bands"], opts: { before?: number; after?: number; step?: number } = {}): HeroData | null {
  if (!obs.body3d) return null;
  const { before = 72, after = 24, step = 4 } = opts;
  const idx = HERO_JOINTS.map((j) => JOINTS.indexOf(j));
  const frames: number[][][] = [];
  const bat: HeroData["bat"] = [];
  const ball: HeroData["ball"] = [];
  const r2 = (v: number) => Math.round(v * 100) / 100;
  // The bat and ball are tracked in the picture (this example is filmed side-on): placed in the
  // scene by the straight-line fit between where the body's joints are in the picture and in 3D.
  const fit = imageToWorld(obs);
  let contact = 0;
  for (let f = Math.max(0, contactFrame - before); f <= Math.min(obs.body3d.length - 1, contactFrame + after); f += step) {
    const row = obs.body3d[f]!;
    const pts = idx.map((k) => row[k]);
    if (pts.some((p) => !p)) continue;
    if (f <= contactFrame) contact = frames.length;
    frames.push(pts.map((p) => [r2(p![0]), r2(p![1]), r2(p![2])]));
    const hands = (pts[5]![2] + pts[6]![2]) / 2;
    const [bh, bt, bl] = [obs.bat.handle[f], obs.bat.toe[f], obs.ball.points[f]];
    bat.push(fit && bh && bt ? [[r2(fit.f(bh[0])), r2(fit.u(bh[1])), r2(hands)], [r2(fit.f(bt[0])), r2(fit.u(bt[1])), r2(hands)]] : null);
    ball.push(fit && bl ? [r2(fit.f(bl[0])), r2(fit.u(bl[1])), r2(hands)] : null);
  }
  return frames.length > 8 ? { frames, contact, fps: (obs.media.fps ?? 60) / step, bat, ball, bands, stature: (obs.athlete.heightCm ?? 175) / 100 } : null;
}

/** Least-squares line from picture x to forward and picture y to up, over every joint seen in both. */
function imageToWorld(obs: CaptureObservation): { f: (x: number) => number; u: (y: number) => number } | null {
  const line = (xs: number[], ys: number[]) => {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const k = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / sxx : 0;
    return (v: number) => my + k * (v - mx);
  };
  const ix: number[] = [];
  const iy: number[] = [];
  const wf: number[] = [];
  const wu: number[] = [];
  for (let f = 0; f < obs.body.length; f += 6)
    obs.body[f]!.forEach((p, j) => {
      const w = obs.body3d?.[f]?.[j];
      if (!p || !w) return;
      ix.push(p[0]);
      iy.push(p[1]);
      wf.push(w[0]);
      wu.push(w[1]);
    });
  return ix.length > 20 ? { f: line(ix, wf), u: line(iy, wu) } : null;
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

/** A side elevation, as in a technical drawing: forward runs left to right, the pitch is one ground line. */
export const HERO_CAMERA: Camera = { yaw: 0, pitch: 0, dist: 400, target: [1.3, 0.8, 0] };

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
  const unit = pxPerMetre(w, h);
  return [w / 2 + x * s * unit, h * 0.56 - y * s * unit, s];
}

export const pxPerMetre = (w: number, h: number) => Math.min(h * 0.42, w * 0.3);

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

/** The pitch's lines on a w × h picture. */
export function pitchLines(cam: Camera | undefined, w: number, h: number): Array<[number, number, number, number]> {
  cam ??= HERO_CAMERA;
  return [...PITCH.lines, ...PITCH.stumps].map(([a, b]) => {
    const pa = project(a, cam, w, h);
    const pb = project(b, cam, w, h);
    return [pa[0], pa[1], pb[0], pb[1]];
  });
}

type XY = [number, number];

/** Everything the instrument draws at one moment, in picture coordinates. */
export interface Instrument {
  groundY: number;
  /** The vertical the line is judged against: straight up from the front ankle. */
  plumb: { x: number; top: number };
  /** Top down: where each part is, the range it should be in, and whether it is. */
  parts: Array<{ part: LinePart; name: string; at: XY; range: [number, number]; state: "in_line" | "behind" | "ahead" }>;
  frontFoot: XY;
  backFoot: XY;
  /** The path each part and each foot took to get here. */
  trails: XY[][];
  bat: [XY, XY] | null;
  ball: XY | null;
  ballPath: XY[];
}

/** The line as an instrument at frame position `pos` (fractions blend two frames). */
export function instrument(data: HeroData, pos: number, w: number, h: number, cam: Camera = HERO_CAMERA): Instrument {
  const n = data.frames.length;
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(pos)));
  const i1 = Math.min(n - 1, i0 + 1);
  const frame = blend(data.frames[i0]!, data.frames[i1]!, Math.max(0, Math.min(1, pos - i0)));
  const near = pos - i0 < 0.5 ? i0 : i1;
  const P = (v: number[]): XY => {
    const p = project(pt(v), cam, w, h);
    return [p[0], p[1]];
  };
  const foot = frame[11]!;
  const S = data.stature;
  const parts = LINE_PARTS.map(({ part, joint, name }) => {
    const j = frame[joint]!;
    const [lo, hi] = data.bands[part];
    const offset = (j[0]! - foot[0]!) / S;
    return {
      part,
      name,
      at: P(j),
      range: [P([foot[0]! + lo * S, j[1]!, j[2]!])[0], P([foot[0]! + hi * S, j[1]!, j[2]!])[0]] as [number, number],
      state: offset < lo ? ("behind" as const) : offset > hi ? ("ahead" as const) : ("in_line" as const),
    };
  });
  const path = (joint: number) => [...data.frames.slice(0, i0 + 1).map((f) => P(f[joint]!)), P(frame[joint]!)];
  const bat = data.bat[near];
  const ballAt = data.ball[near];
  return {
    groundY: P([0, 0, 0])[1],
    plumb: { x: P([foot[0]!, 0, foot[2]!])[0], top: P([foot[0]!, S * 1.02, foot[2]!])[1] },
    parts,
    frontFoot: P([foot[0]!, 0, foot[2]!]),
    backFoot: P([frame[12]![0]!, 0, frame[12]![2]!]),
    trails: [...LINE_PARTS.map(({ joint }) => path(joint)), path(11), path(12)],
    bat: bat ? [P(bat[0]), P(bat[1])] : null,
    ball: ballAt ? P(ballAt) : null,
    ballPath: data.ball.slice(0, near + 1).filter((b): b is number[] => !!b).map(P),
  };
}
