// Metamorphic transforms: the same movement as another recording would show it. Each returns a
// new observation; none reads or changes a result. The evaluation (tests/metamorphic.test.ts,
// scripts/eval/metamorphic.probe.ts) analyses both and compares, so a change that only works on
// one recording of a movement shows up as a broken relation rather than as one passing clip.

import { JOINTS, type CaptureObservation, type ImgPoint, type Joint } from "../types";

type Img = ImgPoint;

const SWAP: Record<Joint, Joint> = Object.fromEntries(
  JOINTS.map((j) => [j, (j.startsWith("left_") ? `right_${j.slice(5)}` : j.startsWith("right_") ? `left_${j.slice(6)}` : j) as Joint]),
) as Record<Joint, Joint>;
const SWAP_INDEX = JOINTS.map((j) => JOINTS.indexOf(SWAP[j]));

const flipX = (p: Img): Img => (p ? [1 - p[0], p[1], p[2]] : null);

/**
 * The mirror image: what a mirrored recording of a batter of the other hand would be. Image x is
 * flipped, left and right joints swap names, the batting hand and the bowler's side swap.
 * After handedness normalisation the engine should say exactly the same thing.
 */
export function mirror(obs: CaptureObservation): CaptureObservation {
  const swapRow = <T>(row: T[]): T[] => SWAP_INDEX.map((k) => row[k]!);
  return {
    ...obs,
    id: `${obs.id}~mirror`,
    athlete: { ...obs.athlete, handedness: obs.athlete.handedness === "right" ? "left" : "right" },
    camera: {
      ...obs.camera,
      bowlerSide: obs.camera.bowlerSide === "left" ? "right" : "left",
      ...(obs.camera.shift ? { shift: obs.camera.shift.map((s) => (s ? ([-s[0], s[1]] as const) : null)) } : {}),
    },
    calibration: { ...obs.calibration, stumpsX: obs.calibration.stumpsX === null ? null : 1 - obs.calibration.stumpsX },
    body: obs.body.map((row) => swapRow(row.map(flipX))),
    ...(obs.body3d ? { body3d: obs.body3d.map((row) => swapRow(row.map((p) => (p ? ([p[0], p[1], -p[2], p[3]] as const) : null)))) } : {}),
    ...(obs.poseWorld ? { poseWorld: obs.poseWorld.map((row) => swapRow(row.map((p) => (p ? ([-p[0], p[1], p[2], p[3]] as const) : null)))) } : {}),
    ...(obs.vizDepth ? { vizDepth: obs.vizDepth.map((row) => swapRow(row.map((d) => -d))) } : {}),
    bat: { ...obs.bat, handle: obs.bat.handle.map(flipX), toe: obs.bat.toe.map(flipX) },
    ball: { ...obs.ball, points: obs.ball.points.map(flipX) },
  };
}

/** The same picture at another resolution (a re-encode or a different phone): normalised tracks don't change. */
export function resize(obs: CaptureObservation, scale: number): CaptureObservation {
  return { ...obs, id: `${obs.id}~x${scale}`, media: { ...obs.media, width: Math.round(obs.media.width * scale), height: Math.round(obs.media.height * scale) } };
}

/** The same frames with every timestamp moved (the stroke cut from a later point of a longer clip). */
export function timeOffset(obs: CaptureObservation, ms: number): CaptureObservation {
  return { ...obs, id: `${obs.id}~t+${ms}`, media: { ...obs.media, sourceStartMs: (obs.media.sourceStartMs ?? 0) + ms }, t: obs.t.map((t) => t + ms) };
}

function pick(obs: CaptureObservation, idx: number[], fps: number | null, id: string): CaptureObservation {
  const remap = (f: number | null) => {
    if (f === null) return null;
    let best = 0;
    for (let k = 1; k < idx.length; k++) if (Math.abs(idx[k]! - f) < Math.abs(idx[best]! - f)) best = k;
    return best;
  };
  const take = <T>(xs: T[]): T[] => idx.map((i) => xs[i]!);
  return {
    ...obs,
    id,
    media: { ...obs.media, fps, frameCount: idx.length, durationMs: idx.length > 1 ? obs.t[idx[idx.length - 1]!]! - obs.t[idx[0]!]! + (obs.t[1]! - obs.t[0]!) : obs.media.durationMs },
    camera: { ...obs.camera, ...(obs.camera.shift ? { shift: take(obs.camera.shift) } : {}) },
    quality: { ...obs.quality, frames: obs.quality.frames.filter((q) => idx.includes(q.frame)).map((q) => ({ ...q, frame: idx.indexOf(q.frame) })) },
    t: take(obs.t),
    body: take(obs.body),
    ...(obs.body3d ? { body3d: take(obs.body3d) } : {}),
    ...(obs.poseWorld ? { poseWorld: take(obs.poseWorld) } : {}),
    ...(obs.vizDepth ? { vizDepth: take(obs.vizDepth) } : {}),
    bat: { ...obs.bat, handle: take(obs.bat.handle), toe: take(obs.bat.toe) },
    ball: { ...obs.ball, points: take(obs.ball.points) },
    marks: { bounceFrame: remap(obs.marks.bounceFrame), contactFrame: remap(obs.marks.contactFrame) },
  };
}

/** Every `k`-th frame: the same movement filmed at 1/k of the frame rate. */
export function downsample(obs: CaptureObservation, k: number, offset = 0): CaptureObservation {
  const idx = Array.from({ length: Math.ceil((obs.t.length - offset) / k) }, (_, i) => offset + i * k);
  return pick(obs, idx, obs.media.fps ? obs.media.fps / k : null, `${obs.id}~every${k}${offset ? `+${offset}` : ""}`);
}

/** The clip started `frames` later (still before the stroke): events move, event-relative measures must not. */
export function trimStart(obs: CaptureObservation, frames: number): CaptureObservation {
  const idx = Array.from({ length: obs.t.length - frames }, (_, i) => i + frames);
  return pick(obs, idx, obs.media.fps, `${obs.id}~from${frames}`);
}

/**
 * A variable-frame-rate recording of the same movement: frames kept at uneven steps (the
 * repeating pattern, in source frames), with their true timestamps and the average rate declared.
 */
export function variableFrameRate(obs: CaptureObservation, pattern: number[] = [1, 3, 2, 1, 2, 3]): CaptureObservation {
  const idx: number[] = [];
  for (let i = 0, k = 0; i < obs.t.length; i += pattern[k++ % pattern.length]!) idx.push(i);
  const span = obs.t[idx[idx.length - 1]!]! - obs.t[idx[0]!]!;
  return pick(obs, idx, span > 0 ? ((idx.length - 1) * 1000) / span : obs.media.fps, `${obs.id}~vfr`);
}

/** The bat and/or the ball not tracked: what depends on them must be withheld, not invented. */
export function withoutEvidence(obs: CaptureObservation, drop: { bat?: boolean; ball?: boolean }): CaptureObservation {
  return {
    ...obs,
    id: `${obs.id}~no${drop.bat ? "bat" : ""}${drop.ball ? "ball" : ""}`,
    ...(drop.bat ? { bat: { source: "none" as const, handle: obs.bat.handle.map(() => null), toe: obs.bat.toe.map(() => null) } } : {}),
    ...(drop.ball ? { ball: { source: "none" as const, points: obs.ball.points.map(() => null) }, marks: { ...obs.marks, bounceFrame: null } } : {}),
  };
}

/** Body parts hidden for a stretch of frames (someone walks across, a net post). */
export function occlude(obs: CaptureObservation, joints: Joint[], from: number, to: number): CaptureObservation {
  const hide = new Set(joints.map((j) => JOINTS.indexOf(j)));
  return { ...obs, id: `${obs.id}~hidden`, body: obs.body.map((row, i) => (i >= from && i <= to ? row.map((p, k) => (hide.has(k) ? null : p)) : row)) };
}
