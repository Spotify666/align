// Converts raw image-space observations into a batter-centric scene.
// "Forward" always means toward the bowler and "front" always means the batter's
// leading side, derived from handedness, so left-handers are handled semantically
// rather than by screen direction.

import { mean } from "./math";
import { th } from "./registry";
import { J, type CaptureObservation, type CameraPoint, type ImgPoint, type Joint, type WorldPoint } from "./types";

/** Scene point: forward (toward bowler), up, confidence. Units are metres, or stature when unscaled. */
export interface P {
  f: number;
  u: number;
  c: number;
}

export type SemanticJoint =
  | "head"
  | "front_shoulder"
  | "back_shoulder"
  | "front_elbow"
  | "back_elbow"
  | "front_wrist"
  | "back_wrist"
  | "front_hip"
  | "back_hip"
  | "front_knee"
  | "back_knee"
  | "front_ankle"
  | "back_ankle"
  | "front_heel"
  | "back_heel"
  | "front_foot"
  | "back_foot";

export interface Scene {
  n: number;
  /**
   * Image plane relative to the pitch. "sagittal" (side-on): image x is the forward axis.
   * "frontal" (front-on / behind): image x is lateral, so body forward positions come from
   * the 3D pose estimate, and bat/ball points carry image-plane (lateral) coordinates in `f`
   * that must never be compared with body forward positions.
   */
  plane: "sagittal" | "frontal";
  t: number[];
  fps: number | null;
  /** Seconds per frame, or null for a photo. */
  dt: number | null;
  unit: "m" | "stature";
  scaleSource: "calibration" | "athlete_height" | "none";
  /** Standing height in scene units (1 when unit = stature). */
  stature: number;
  stumpsEstimated: boolean;
  front: "left" | "right";
  get: (frame: number, joint: SemanticJoint) => P | null;
  getRaw: (frame: number, joint: Joint) => P | null;
  batHandle: (P | null)[];
  batToe: (P | null)[];
  ball: (P | null)[];
  /** Batter-centric metres (forward, up, lateral-to-off-side) when the 3D tier provides them. */
  depth: ((frame: number, joint: SemanticJoint) => WorldPoint) | null;
  /**
   * Frontal views only: horizontal angle (radians) of the segment a→b from the 3D pose
   * ESTIMATE, 0 = pointing along the pitch toward the bowler. Used for trunk rotation.
   */
  estYaw: ((frame: number, a: SemanticJoint, b: SemanticJoint) => number) | null;
  /** Map a scene point back to normalised image coordinates (for overlays). */
  toImage: (p: { f: number; u: number }) => [number, number];
}

const SEGMENT_FRACTION_OF_STATURE = 0.779; // thigh + shank + trunk (Winter anthropometrics)

export function semanticToJoint(s: SemanticJoint, front: "left" | "right"): Joint {
  if (s === "head") return "nose";
  const back = front === "left" ? "right" : "left";
  const [side, part] = s.split("_") as ["front" | "back", string];
  return `${side === "front" ? front : back}_${part}` as Joint;
}

export function buildScene(obs: CaptureObservation): Scene {
  const minConf = th("tracking.joint_min_conf");
  const aspect = obs.media.width / obs.media.height;
  const dir = obs.camera.bowlerSide === "right" ? 1 : -1;
  const front: "left" | "right" = obs.athlete.handedness === "right" ? "left" : "right";
  const n = obs.body.length;
  const setupEnd = Math.max(1, Math.round(n * 0.2));

  const img = (p: ImgPoint): [number, number, number] | null =>
    p && p[2] >= minConf ? [p[0] * aspect, p[1], p[2]] : null;
  const rawImg = (frame: number, joint: Joint) => img(obs.body[frame]?.[J[joint]] ?? null);

  // Ground line: from calibration, otherwise the lowest foot points during setup.
  let groundY = obs.calibration.groundY;
  if (groundY === null) {
    const ys: number[] = [];
    for (let i = 0; i < setupEnd; i++) {
      for (const j of ["left_heel", "right_heel", "left_foot", "right_foot", "left_ankle", "right_ankle"] as Joint[]) {
        const p = rawImg(i, j);
        if (p) ys.push(p[1]);
      }
    }
    groundY = ys.length ? Math.max(...ys) : 1;
  }

  // Stature in image units from posture-invariant segment lengths.
  const segSums: number[] = [];
  for (let i = 0; i < setupEnd; i++) {
    const L = (a: Joint, b: Joint) => {
      const pa = rawImg(i, a);
      const pb = rawImg(i, b);
      return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) : NaN;
    };
    const leg = mean([L("left_hip", "left_knee") + L("left_knee", "left_ankle"), L("right_hip", "right_knee") + L("right_knee", "right_ankle")]);
    const trunk = mean([L("left_hip", "left_shoulder"), L("right_hip", "right_shoulder")]);
    if (Number.isFinite(leg) && Number.isFinite(trunk)) segSums.push(leg + trunk);
  }
  segSums.sort((a, b) => a - b);
  const robustSeg = segSums.length ? segSums[Math.floor(segSums.length * 0.75)]! : NaN;
  const statureImg = robustSeg / SEGMENT_FRACTION_OF_STATURE;

  // Scale: calibration > athlete height > none.
  let mpu: number;
  let unit: Scene["unit"];
  let scaleSource: Scene["scaleSource"];
  if (obs.calibration.metresPerUnit) {
    mpu = obs.calibration.metresPerUnit;
    unit = "m";
    scaleSource = "calibration";
  } else if (obs.athlete.heightCm && Number.isFinite(statureImg)) {
    mpu = obs.athlete.heightCm / 100 / statureImg;
    unit = "m";
    scaleSource = "athlete_height";
  } else {
    mpu = Number.isFinite(statureImg) ? 1 / statureImg : 1;
    unit = "stature";
    scaleSource = "none";
  }
  const stature =
    unit === "stature" ? 1 : obs.athlete.heightCm ? obs.athlete.heightCm / 100 : Number.isFinite(statureImg) ? statureImg * mpu : 1.75;

  // Stumps: calibration, otherwise estimated a fixed fraction of stature behind the back foot at setup.
  let stumpsXu = obs.calibration.stumpsX !== null ? obs.calibration.stumpsX * aspect : NaN;
  const stumpsEstimated = !Number.isFinite(stumpsXu);
  if (stumpsEstimated) {
    const backAnkle = semanticToJoint("back_ankle", front);
    const xs: number[] = [];
    for (let i = 0; i < setupEnd; i++) {
      const p = rawImg(i, backAnkle);
      if (p) xs.push(p[0]);
    }
    const back = mean(xs);
    stumpsXu = (Number.isFinite(back) ? back : aspect / 2) - (dir * 0.25 * stature) / mpu;
  }

  const toScene = (x: number, y: number, c: number): P => ({
    f: (x - stumpsXu) * dir * mpu,
    u: (groundY! - y) * mpu,
    c,
  });

  // Frontal views: the forward axis points along the camera's line of sight. Forward
  // positions come from the monocular 3D estimate, expressed relative to the back ankle
  // in the same frame (the estimate is hip-centred, so whole-body travel is not observed).
  const plane: Scene["plane"] = obs.camera.view === "front_on" || obs.camera.view === "behind" ? "frontal" : "sagittal";
  const W = plane === "frontal" ? obs.poseWorld : undefined;
  const zSign = obs.camera.view === "front_on" ? -1 : 1; // front-on: toward the camera (−z) is toward the bowler
  const wpt = (frame: number, joint: Joint): CameraPoint => {
    const p = W?.[frame]?.[J[joint]] ?? null;
    return p && p[3] >= minConf * 0.6 ? p : null;
  };
  let fScale = NaN;
  if (W) {
    const sums: number[] = [];
    for (let i = 0; i < Math.max(setupEnd, Math.min(n, 6)); i++) {
      const L = (a: Joint, b: Joint) => {
        const pa = wpt(i, a);
        const pb = wpt(i, b);
        return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) : NaN;
      };
      const leg = mean([L("left_hip", "left_knee") + L("left_knee", "left_ankle"), L("right_hip", "right_knee") + L("right_knee", "right_ankle")]);
      const trunk = mean([L("left_hip", "left_shoulder"), L("right_hip", "right_shoulder")]);
      if (Number.isFinite(leg) && Number.isFinite(trunk)) sums.push(leg + trunk);
    }
    sums.sort((a, b) => a - b);
    const worldStature = sums.length ? sums[Math.floor(sums.length * 0.75)]! / SEGMENT_FRACTION_OF_STATURE : NaN;
    fScale = worldStature > 0.5 ? stature / worldStature : NaN;
  }
  const backAnkleJoint = semanticToJoint("back_ankle", front);
  const backF0 = 0.25 * stature; // back foot assumed a quarter-stature in front of the stumps, as in side-on
  const frontalF = (frame: number, joint: Joint): number => {
    if (!W || !Number.isFinite(fScale)) return NaN;
    const p = wpt(frame, joint);
    const b = wpt(frame, backAnkleJoint);
    if (!p || !b) return NaN;
    return backF0 + zSign * (p[2] - b[2]) * fScale;
  };

  const getRaw = (frame: number, joint: Joint): P | null => {
    const p = rawImg(frame, joint);
    if (!p) return null;
    const sp = toScene(p[0], p[1], p[2]);
    if (plane === "sagittal") return sp;
    const f = frontalF(frame, joint);
    return Number.isFinite(f) ? { f, u: sp.u, c: p[2] } : null;
  };

  const track = (pts: ImgPoint[]) =>
    pts.map((p) => {
      const q = img(p);
      return q ? toScene(q[0], q[1], q[2]) : null;
    });

  const depth = obs.body3d
    ? (frame: number, joint: SemanticJoint): WorldPoint => obs.body3d?.[frame]?.[J[semanticToJoint(joint, front)]] ?? null
    : null;

  const estYaw = W
    ? (frame: number, a: SemanticJoint, b: SemanticJoint): number => {
        const pa = wpt(frame, semanticToJoint(a, front));
        const pb = wpt(frame, semanticToJoint(b, front));
        if (!pa || !pb) return NaN;
        return Math.atan2(Math.abs(pa[0] - pb[0]), zSign * (pa[2] - pb[2]));
      }
    : null;

  const fps = obs.media.kind === "photo" ? null : obs.media.fps;

  return {
    n,
    plane,
    t: obs.t,
    fps,
    dt: fps ? 1 / fps : null,
    unit,
    scaleSource,
    stature,
    stumpsEstimated,
    front,
    get: (frame, joint) => getRaw(frame, semanticToJoint(joint, front)),
    getRaw,
    batHandle: track(obs.bat.handle),
    batToe: track(obs.bat.toe),
    ball: track(obs.ball.points),
    depth,
    estYaw,
    toImage: ({ f, u }) => [(f / (dir * mpu) + stumpsXu) / aspect, groundY! - u / mpu],
  };
}

/** Body centre estimate: weighted mean of hips (0.6) and shoulders (0.4) — a CoM proxy, not a measured CoM. */
export function bodyCentre(scene: Scene, frame: number): P | null {
  const fh = scene.get(frame, "front_hip");
  const bh = scene.get(frame, "back_hip");
  const fs = scene.get(frame, "front_shoulder");
  const bs = scene.get(frame, "back_shoulder");
  if (!fh || !bh || !fs || !bs) return null;
  return {
    f: 0.3 * (fh.f + bh.f) + 0.2 * (fs.f + bs.f),
    u: 0.3 * (fh.u + bh.u) + 0.2 * (fs.u + bs.u),
    c: Math.min(fh.c, bh.c, fs.c, bs.c),
  };
}

/** Bat sweet-spot proxy: 70% of the way from handle to toe. */
export function sweetSpot(scene: Scene, frame: number): P | null {
  const h = scene.batHandle[frame];
  const t = scene.batToe[frame];
  if (!h || !t) return null;
  return { f: h.f + 0.7 * (t.f - h.f), u: h.u + 0.7 * (t.u - h.u), c: Math.min(h.c, t.c) };
}
