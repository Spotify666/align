// Deterministic synthetic delivery generator for fixtures and the sample report.
// Everything produced here is DEMO DATA: plausible kinematics authored from coaching
// descriptions, rendered through a simulated side-on camera with seeded noise.
// It exists to exercise every engine path, not to stand in for real athletes.

import { clamp, gaussian, rng } from "../math";
import { JOINTS, type CameraPoint, type CaptureObservation, type ImgPoint, type Joint, type TrackSource, type WorldPoint } from "../types";

type V3 = [number, number, number]; // forward (toward bowler), up, lateral (+ = off side), metres
type Key<T> = Array<[t: number, v: T]>;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Non-uniform Catmull–Rom (cubic Hermite with finite-difference tangents). */
function interp(keys: Key<number>, t: number): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  const last = keys[keys.length - 1]!;
  if (t >= last[0]) return last[1];
  let i = 0;
  while (keys[i + 1]![0] < t) i++;
  const [t0, p0] = keys[i]!;
  const [t1, p1] = keys[i + 1]!;
  const tangent = (k: number) => {
    const prev = keys[k - 1];
    const next = keys[k + 1];
    if (!prev || !next) return 0;
    return (next[1] - prev[1]) / (next[0] - prev[0]);
  };
  const h = t1 - t0;
  const s = (t - t0) / h;
  const m0 = tangent(i) * h;
  const m1 = tangent(i + 1) * h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

function interpV(keys: Key<V3>, t: number): V3 {
  return [0, 1, 2].map((k) => interp(keys.map(([tt, v]) => [tt, v[k]!] as [number, number]), t)) as unknown as V3;
}

/** Two-bone IK: joint position between root and end, bending toward `pole`. */
function ik(root: V3, end: V3, a: number, b: number, pole: V3): V3 {
  const span = sub(end, root);
  const d = clamp(norm(span), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const dir = unit(span);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - x * x, 0));
  const perp = unit(sub(pole, mul(dir, dot(pole, dir))));
  return add(add(root, mul(dir, x)), mul(perp, h));
}

export interface BallScript {
  releaseT: number;
  speed: number; // m/s along the pitch
  bounceF: number; // metres from batter's stumps
  contactF: number;
  contactU: number;
  lateral: number;
  exit: V3; // m/s after contact
  visible: boolean;
}

export interface ShotScript {
  frontAnkle: Key<V3>;
  backAnkle: Key<V3>;
  hipC: Key<V3>;
  lean: Key<number>; // degrees toward bowler
  sideLean: Key<number>; // degrees toward off side
  shoulderYaw: Key<number>; // degrees, chest opening
  hipYaw: Key<number>;
  headFwd: Key<number>; // metres, extra head offset toward bowler
  /** Hands keyframes; the contact keyframe is overridden to put the sweet spot on the ball. */
  hands: Key<V3>;
  batDir: Key<V3>;
  backKneeDrop?: Key<number>;
  ball: BallScript;
}

export interface GenerateOptions {
  id: string;
  label: string;
  seed: number;
  fps: number;
  durationS: number;
  statureM: number;
  handedness: "right" | "left";
  script: ShotScript;
  tier?: CaptureObservation["tier"];
  photoAtContact?: boolean;
  withBat?: boolean;
  withBall?: boolean;
  include3d?: boolean;
  noise?: number; // normalised image units
  /** Extra jitter on the bottom hand (normalised image units): often hidden behind the bat, real trackers jitter it most. */
  handNoise?: number;
  occlusion?: { fromT: number; toT: number; joints: Joint[]; dropBat?: boolean; dropBall?: boolean };
  maxPeople?: number;
  marks?: { bounce?: boolean; contact?: boolean };
  batSource?: TrackSource;
  /**
   * Camera placement. "front_on": portrait phone zoomed in from behind the bowler's
   * stumps, looking down the pitch; the observation then carries a noisy monocular 3D
   * estimate (like MediaPipe world landmarks) and no pitch calibration.
   */
  view?: "side_on" | "front_on" | "behind";
}

const CAMERA = { depth: 7.2, centreF: 2.9, height: 1.0, viewWidthM: 8.4 };
const ASPECT = 16 / 9;
const BAT_LEN = 0.86;
const SWEET = 0.7;
const G = 9.81;

/** Side-on pinhole camera on the off side, looking across the pitch. */
function project(p: V3): [number, number] {
  const fx = (ASPECT / CAMERA.viewWidthM) * CAMERA.depth;
  const depth = CAMERA.depth - p[2];
  const xu = ASPECT / 2 + (fx * (p[0] - CAMERA.centreF)) / depth;
  const yu = 0.5 - (fx * (p[1] - CAMERA.height)) / depth;
  return [xu / ASPECT, yu];
}

/** Front-on camera: behind the bowler's stumps, portrait, zoomed so the batter fills about half the frame. */
const FRONT = { f: 24, height: 1.0, viewHeightM: 3.6, aspect: 9 / 16 };
function projectFront(p: V3): [number, number] {
  const depth = FRONT.f - p[0];
  const k = (FRONT.f - 0.5) / FRONT.viewHeightM;
  const xu = FRONT.aspect / 2 + (k * -p[2]) / depth;
  const yu = 0.5 - (k * (p[1] - FRONT.height)) / depth;
  return [xu / FRONT.aspect, yu];
}

/** Behind the batter: on the pitch line beyond the keeper, looking toward the bowler. */
const BEHIND = { f: -7, height: 1.2, viewHeightM: 3.4, aspect: 9 / 16 };
function projectBehind(p: V3): [number, number] {
  const depth = p[0] - BEHIND.f;
  const k = (0.5 - BEHIND.f) / BEHIND.viewHeightM;
  const xu = BEHIND.aspect / 2 + (k * p[2]) / depth;
  const yu = 0.5 - (k * (p[1] - BEHIND.height)) / depth;
  return [xu / BEHIND.aspect, yu];
}

export const FIXTURE_CALIBRATION = (() => {
  const fx = (ASPECT / CAMERA.viewWidthM) * CAMERA.depth;
  const [sx, gy] = project([0, 0, 0]);
  return { metresPerUnit: CAMERA.depth / fx, stumpsX: sx, groundY: gy };
})();

function ballAt(b: BallScript, t: number, contactT: number, contactP: V3): V3 | null {
  if (t < b.releaseT) return null;
  if (t <= contactT) {
    // Pre-contact: straight line in plan, parabola down to bounce, then rebound.
    const releaseF = 18.5;
    const releaseU = 2.1;
    const tb = b.releaseT + (releaseF - b.bounceF) / b.speed;
    if (t <= tb) {
      const s = (t - b.releaseT) / (tb - b.releaseT);
      const f = releaseF + (b.bounceF - releaseF) * s;
      const T = tb - b.releaseT;
      const vu0 = (0 - releaseU + 0.5 * G * T * T) / T;
      const tt = t - b.releaseT;
      return [f, releaseU + vu0 * tt - 0.5 * G * tt * tt, b.lateral];
    }
    // Post-bounce path solved to arrive exactly at the contact point.
    const T2 = contactT - tb;
    const tt = t - tb;
    const vu = (contactP[1] + 0.5 * G * T2 * T2) / T2;
    const f = b.bounceF + ((contactP[0] - b.bounceF) * tt) / T2;
    return [f, vu * tt - 0.5 * G * tt * tt, b.lateral + ((contactP[2] - b.lateral) * tt) / T2];
  }
  // Post-contact: ballistic flight with damped ground bounces (restitution 0.45).
  let tt = t - contactT;
  let p0: V3 = [...contactP];
  let v: V3 = [...b.exit];
  for (let hop = 0; hop < 8; hop++) {
    const disc = v[1] * v[1] + 2 * G * Math.max(0, p0[1] - 0.036);
    const tGround = (v[1] + Math.sqrt(disc)) / G;
    if (tt <= tGround || !Number.isFinite(tGround)) break;
    p0 = [p0[0] + v[0] * tGround, 0.036, p0[2] + v[2] * tGround];
    v = [v[0] * 0.8, Math.abs(v[1] - G * tGround) * 0.45, v[2] * 0.8];
    tt -= tGround;
  }
  return [p0[0] + v[0] * tt, Math.max(0.036, p0[1] + v[1] * tt - 0.5 * G * tt * tt), p0[2] + v[2] * tt];
}

export function generate(opts: GenerateOptions): CaptureObservation {
  const H = opts.statureM;
  const s = opts.script;
  const R = rng(opts.seed);
  const RD = rng(opts.seed ^ 0x5eed); // separate stream so viewer depth never perturbs tracked data
  const noise = opts.noise ?? 0.0035;
  const fps = opts.fps;
  const n = opts.photoAtContact ? 1 : Math.round(opts.durationS * fps);

  // Contact time: when the ball reaches the contact plane, snapped to a frame.
  const releaseF = 18.5;
  const tb = s.ball.releaseT + (releaseF - s.ball.bounceF) / s.ball.speed;
  const postSpeed = s.ball.speed * 0.88;
  const rawContactT = tb + (s.ball.bounceF - s.ball.contactF) / postSpeed;
  const contactT = Math.round(rawContactT * fps) / fps;
  const contactP: V3 = [s.ball.contactF, s.ball.contactU, s.ball.lateral * 0.5];

  // Re-time the designated contact keyframe (nearest to ball arrival) to the snapped
  // contact time, and move the hands so the bat's sweet spot meets the ball there.
  const retime = <T,>(keys: Key<T>, value?: (v: T) => T): Key<T> => {
    let best = -1;
    for (let k = 0; k < keys.length; k++) {
      if (Math.abs(keys[k]![0] - rawContactT) < 0.1 && (best < 0 || Math.abs(keys[k]![0] - rawContactT) < Math.abs(keys[best]![0] - rawContactT))) best = k;
    }
    if (best < 0) return [...keys, [contactT, value ? value(keys[keys.length - 1]![1]) : keys[keys.length - 1]![1]] as [number, T]].sort((a, b) => a[0] - b[0]);
    return keys.map(([t, v], k) => (k === best ? [contactT, value ? value(v) : v] : [t, v]));
  };
  const batDir = retime(s.batDir);
  const dirAtContact = unit(interpV(batDir, contactT));
  const handsAtContact = sub(contactP, mul(dirAtContact, BAT_LEN * SWEET));
  const hands = retime(s.hands, () => handsAtContact);

  const seg = { thigh: 0.245 * H, shank: 0.246 * H, trunk: 0.288 * H, upperArm: 0.186 * H, forearm: 0.146 * H, shoulderW: 0.23 * H, hipW: 0.17 * H };

  const times = opts.photoAtContact ? [contactT] : Array.from({ length: n }, (_, i) => i / fps);
  const body: ImgPoint[][] = [];
  const body3d: WorldPoint[][] = [];
  const vizDepth: number[][] = [];
  const handle: ImgPoint[] = [];
  const toe: ImgPoint[] = [];
  const ball: ImgPoint[] = [];

  const behind = opts.view === "behind";
  const frontOn = opts.view === "front_on" || behind; // any view along the pitch
  const proj = behind ? projectBehind : opts.view === "front_on" ? projectFront : project;
  const aspect = frontOn ? FRONT.aspect : ASPECT;
  const RW = rng(opts.seed ^ 0x3d3d); // separate stream for the monocular 3D estimate
  const poseWorld: CameraPoint[][] = [];
  const jitter = (p: [number, number], c: number): ImgPoint => {
    const sd = noise * (1.4 - c);
    return [p[0] + (gaussian(R) * sd) / aspect, p[1] + gaussian(R) * sd, c];
  };

  for (const t of times) {
    const fa = interpV(s.frontAnkle, t);
    const ba = interpV(s.backAnkle, t);
    const hip = interpV(s.hipC, t);
    const lean = (interp(s.lean, t) * Math.PI) / 180;
    const side = (interp(s.sideLean, t) * Math.PI) / 180;
    const yaw = (interp(s.shoulderYaw, t) * Math.PI) / 180;
    const hyaw = (interp(s.hipYaw, t) * Math.PI) / 180;
    const trunkDir = unit([Math.sin(lean), Math.cos(lean) * Math.cos(side), Math.sin(side)]);
    const shC = add(hip, mul(trunkDir, seg.trunk));
    const shAxis: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const hipAxis: V3 = [Math.cos(hyaw), 0, -Math.sin(hyaw)];
    const fSh = add(shC, mul(shAxis, seg.shoulderW / 2));
    const bSh = sub(shC, mul(shAxis, seg.shoulderW / 2));
    const fHip = add(hip, mul(hipAxis, seg.hipW / 2));
    const bHip = sub(hip, mul(hipAxis, seg.hipW / 2));
    const headC = add(add(shC, mul(trunkDir, 0.17 * H)), [interp(s.headFwd, t), 0, 0]);
    const nose = add(headC, [0.09, -0.02, 0.02]);

    const kneeDrop = s.backKneeDrop ? interp(s.backKneeDrop, t) : 0;
    const fKnee = ik(fHip, fa, seg.thigh, seg.shank, [1, 0, 0.3]);
    let bKnee = ik(bHip, ba, seg.thigh, seg.shank, [1, 0, 0.3]);
    if (kneeDrop) bKnee = [bKnee[0] + kneeDrop * 0.4, Math.max(0.05, bKnee[1] - kneeDrop), bKnee[2]];

    const hd = interpV(hands, t);
    const bd = unit(interpV(batDir, t));
    const fWrist = hd;
    const bWrist = add(hd, mul(bd, 0.09));
    const fElbow = ik(fSh, fWrist, seg.upperArm, seg.forearm, [0.2, -1, 0.6]);
    const bElbow = ik(bSh, bWrist, seg.upperArm, seg.forearm, [-0.3, -1, 0.5]);

    const heel = (a: V3): V3 => [a[0] - 0.05, Math.max(0.02, a[1] - 0.05), a[2]];
    const foot = (a: V3, dir: V3): V3 => [a[0] + dir[0] * 0.15, Math.max(0.02, a[1] - 0.06), a[2] + dir[2] * 0.15];

    const world: Record<Joint, V3> = {
      nose,
      left_shoulder: fSh,
      right_shoulder: bSh,
      left_elbow: fElbow,
      right_elbow: bElbow,
      left_wrist: fWrist,
      right_wrist: bWrist,
      left_hip: fHip,
      right_hip: bHip,
      left_knee: fKnee,
      right_knee: bKnee,
      left_ankle: fa,
      right_ankle: ba,
      left_heel: heel(fa),
      right_heel: heel(ba),
      left_foot: foot(fa, [0.9, 0, 0.4]),
      right_foot: foot(ba, [0.2, 0, 0.98]),
    };

    const occluded = (j: Joint) =>
      !!opts.occlusion && t >= opts.occlusion.fromT && t <= opts.occlusion.toT && opts.occlusion.joints.includes(j);
    const frame: ImgPoint[] = [];
    const frame3d: WorldPoint[] = [];
    const frameCam: CameraPoint[] = [];
    const hipMid = mul(add(fHip, bHip), 0.5);
    for (const j of JOINTS) {
      const w = world[j];
      const farSide = j.startsWith("right_") && !j.includes("shoulder");
      const c = occluded(j) ? 0.25 : farSide ? 0.78 : 0.93;
      const p2 = jitter(proj(w), c);
      frame.push(j === "right_wrist" && opts.handNoise && p2 ? [p2[0] + (gaussian(R) * opts.handNoise) / aspect, p2[1] + gaussian(R) * opts.handNoise, p2[2]] : p2);
      frame3d.push([w[0], w[1], w[2], c]);
      // Monocular estimate in camera axes (x right, y down, z away), hip-centred:
      // depth is compressed and noisier than the image-plane axes, as with real models.
      const r = sub(w, hipMid);
      const sx = behind ? 1 : -1; // camera right is the off side from behind, the leg side from the bowler's end
      frameCam.push([sx * r[2] + gaussian(RW) * 0.015, -r[1] + gaussian(RW) * 0.015, sx * r[0] * 0.88 + gaussian(RW) * 0.035, c]);
    }
    body.push(frame);
    body3d.push(frame3d);
    poseWorld.push(frameCam);
    // Simulated monocular depth estimate for the viewer: true lateral plus noise.
    vizDepth.push(JOINTS.map((j) => world[j][2] + gaussian(RD) * 0.04));

    const batOccluded = !!opts.occlusion?.dropBat && t >= opts.occlusion.fromT && t <= opts.occlusion.toT;
    if (opts.withBat === false || batOccluded) {
      handle.push(null);
      toe.push(null);
    } else {
      handle.push(jitter(proj(hd), 0.85));
      toe.push(jitter(proj(add(hd, mul(bd, BAT_LEN))), 0.8));
    }

    const bp = ballAt(s.ball, t, contactT, contactP);
    const ballOccluded = !!opts.occlusion?.dropBall && t >= opts.occlusion.fromT && t <= contactT + 0.05;
    const offStage = behind
      ? bp !== null && bp[0] < -0.4
      : frontOn
        ? bp !== null && FRONT.f - bp[0] < 6
        : bp !== null && (bp[0] > CAMERA.centreF + CAMERA.viewWidthM / 2 || bp[0] < -1.2);
    if (!bp || opts.withBall === false || !s.ball.visible || ballOccluded || offStage) {
      ball.push(null);
    } else {
      const ip = proj(bp);
      ball.push(ip[0] >= 0 && ip[0] <= 1 && ip[1] >= 0 && ip[1] <= 1 ? jitter(ip, 0.8) : null);
    }
  }

  // Mirror for a left-handed batter: flip the image and swap anatomical sides, so
  // the front (right) leg of a left-hander carries the same motion.
  let outBody = body;
  let outHandle = handle;
  let outToe = toe;
  let outBall = ball;
  let out3d = body3d;
  let outDepth = vizDepth;
  let outCam = poseWorld;
  let bowlerSide: "left" | "right" = "right";
  let stumpsX = FIXTURE_CALIBRATION.stumpsX;
  if (opts.handedness === "left") {
    const swap = (j: Joint): Joint => (j.startsWith("left_") ? (j.replace("left_", "right_") as Joint) : j.startsWith("right_") ? (j.replace("right_", "left_") as Joint) : j);
    const mirror = (p: ImgPoint): ImgPoint => (p ? [1 - p[0], p[1], p[2]] : null);
    outBody = body.map((fr) => JOINTS.map((j) => mirror(fr[JOINTS.indexOf(swap(j))] ?? null)));
    out3d = body3d.map((fr) => JOINTS.map((j) => fr[JOINTS.indexOf(swap(j))] ?? null));
    outDepth = vizDepth.map((fr) => JOINTS.map((j) => fr[JOINTS.indexOf(swap(j))] ?? 0));
    outCam = poseWorld.map((fr) =>
      JOINTS.map((j) => {
        const p = fr[JOINTS.indexOf(swap(j))] ?? null;
        return p ? ([-p[0], p[1], p[2], p[3]] as const) : null;
      }),
    );
    outHandle = handle.map(mirror);
    outToe = toe.map(mirror);
    outBall = ball.map(mirror);
    bowlerSide = "left";
    stumpsX = 1 - stumpsX;
  }

  const bounceFrame = Math.round(tb * fps);
  const contactFrame = Math.round(contactT * fps);
  const qualityFrames = Array.from({ length: Math.min(n, 24) }, (_, k) => {
    const i = Math.floor((k * n) / Math.min(n, 24));
    return { frame: i, brightness: 0.52 + 0.02 * gaussian(R), contrast: 0.21, sharpness: fps >= 100 ? 0.034 : 0.02, backgroundMotion: 0.008 };
  });

  return {
    schema: "align.observation/1",
    id: opts.id,
    source: "fixture",
    demo: true,
    label: opts.label,
    media: {
      kind: opts.photoAtContact ? "photo" : "video",
      width: frontOn ? 1080 : 1920,
      height: frontOn ? 1920 : 1080,
      fps: opts.photoAtContact ? null : fps,
      fpsSource: opts.photoAtContact ? "unknown" : "fixture",
      durationMs: opts.photoAtContact ? 0 : Math.round(opts.durationS * 1000),
      frameCount: n,
    },
    tier: opts.tier ?? "quick",
    athlete: { handedness: opts.handedness, heightCm: Math.round(H * 100) },
    camera: { view: behind ? "behind" : frontOn ? "front_on" : "side_on", bowlerSide },
    calibration: frontOn
      ? { source: "none", metresPerUnit: null, stumpsX: null, groundY: null }
      : { source: "fixture", metresPerUnit: FIXTURE_CALIBRATION.metresPerUnit, stumpsX, groundY: FIXTURE_CALIBRATION.groundY },
    quality: { frames: qualityFrames, maxPeople: opts.maxPeople ?? 1 },
    t: times.map((t) => Math.round(t * 1000 * 100) / 100),
    body: outBody,
    body3d: opts.include3d ? out3d : undefined,
    vizDepth: outDepth,
    ...(frontOn ? { poseWorld: outCam } : {}),
    bat: { source: opts.withBat === false ? "none" : (opts.batSource ?? "fixture"), handle: outHandle, toe: outToe },
    ball: { source: opts.withBall === false || !s.ball.visible ? "none" : "fixture", points: outBall },
    marks: {
      bounceFrame: opts.marks?.bounce && !opts.photoAtContact ? bounceFrame : null,
      contactFrame: opts.marks?.contact && !opts.photoAtContact ? contactFrame : null,
    },
  };
}

/** Visualisation-only lateral positions for the 3D viewer (never used by metrics). */
export function fixtureWorld(obs: CaptureObservation) {
  return obs.body3d ?? null;
}
