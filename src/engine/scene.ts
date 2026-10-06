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
  /**
   * Frontal views only: sideways (image-plane) position of a joint in scene units, for
   * movement across the body that side-on footage can't see.
   */
  across: ((frame: number, joint: SemanticJoint) => number) | null;
  /**
   * Where a joint is in the picture itself, in scene units: [horizontal, up]. Side-on the
   * horizontal is the forward axis (as `get`); along the pitch it is sideways (as `across`),
   * never the 3D estimate. For movement timing, which any camera position sees.
   */
  inPicture: (frame: number, joint: SemanticJoint) => [number, number] | null;
  /**
   * The camera zoomed or panned during the shot (broadcast footage). Positions are then
   * measured per frame against the batter's own size, feet and back ankle, so whole-body
   * travel (back-foot movement) can't be observed.
   */
  cameraMoving: boolean;
  /** How much the batter's size in the picture changed across the clip (largest ÷ smallest; 1 = a fixed camera). */
  zoom: number;
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

  // Filmed along the pitch, where the batter stands along the camera's line of sight moves
  // the feet up and down the image (nearer is lower), so a ground line taken from the
  // first fifth of the clip (in a practice montage often the end of the previous ball,
  // front foot thrust toward the lens) can sit well off. There the ground comes from the
  // whole clip: the median of each frame's lowest foot.
  const alongPitch = (obs.camera.view === "front_on" || obs.camera.view === "behind") && obs.media.kind === "video";
  const refEnd = alongPitch ? n : setupEnd;
  const FEET_J = ["left_heel", "right_heel", "left_foot", "right_foot", "left_ankle", "right_ankle"] as Joint[];

  // Ground line: from calibration, otherwise the lowest foot points during setup (along
  // the pitch: see above).
  let groundY = obs.calibration.groundY;
  if (groundY === null) {
    const ys: number[] = [];
    const lows: number[] = [];
    for (let i = 0; i < refEnd; i++) {
      const fy = FEET_J.map((j) => rawImg(i, j)?.[1]).filter((y): y is number => y !== undefined);
      ys.push(...fy);
      if (fy.length) lows.push(Math.max(...fy));
    }
    lows.sort((a, b) => a - b);
    groundY = alongPitch && lows.length ? lows[Math.floor(lows.length / 2)]! : ys.length ? Math.max(...ys) : 1;
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
  const backAnkleImg = semanticToJoint("back_ankle", front);
  if (stumpsEstimated) {
    const xs: number[] = [];
    for (let i = 0; i < setupEnd; i++) {
      const p = rawImg(i, backAnkleImg);
      if (p) xs.push(p[0]);
    }
    const back = mean(xs);
    stumpsXu = (Number.isFinite(back) ? back : aspect / 2) - (dir * 0.25 * stature) / mpu;
  }

  // Moving camera: the batter's apparent size changes by more than a fifth across the
  // shot (a person doesn't change size; the lens did). Then every frame is measured
  // against that frame's own body size, ground (lowest foot) and back ankle.
  const frameStature: number[] = [];
  const frameGround: number[] = [];
  const frameBack: number[] = [];
  for (let i = 0; i < n; i++) {
    const L = (a: Joint, b: Joint) => {
      const pa = rawImg(i, a);
      const pb = rawImg(i, b);
      return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) : NaN;
    };
    const leg = Math.max(L("left_hip", "left_knee") + L("left_knee", "left_ankle"), L("right_hip", "right_knee") + L("right_knee", "right_ankle"));
    const trunk = mean([L("left_hip", "left_shoulder"), L("right_hip", "right_shoulder")]);
    frameStature.push(Number.isFinite(leg) && Number.isFinite(trunk) ? (leg + trunk) / SEGMENT_FRACTION_OF_STATURE : NaN);
    const feet = (["left_heel", "right_heel", "left_foot", "right_foot", "left_ankle", "right_ankle"] as Joint[]).map((j) => rawImg(i, j)?.[1] ?? NaN).filter(Number.isFinite);
    frameGround.push(feet.length ? Math.max(...feet) : NaN);
    frameBack.push(rawImg(i, backAnkleImg)?.[0] ?? NaN);
  }
  const statureTrack = rollingMedian(frameStature, Math.max(3, Math.round(n / 12)));
  const finiteStature = statureTrack.filter(Number.isFinite);
  const cameraMoving =
    obs.media.kind === "video" && finiteStature.length > n * 0.5 && Math.max(...finiteStature) / Math.min(...finiteStature) > 1.2;
  const groundTrack = rollingMedian(frameGround, 2);
  const backTrack = rollingMedian(frameBack, 2);
  const at = (xs: number[], i: number, fallback: number) => (Number.isFinite(xs[i]!) ? xs[i]! : fallback);

  const toScene = (x: number, y: number, c: number, frame?: number): P => {
    if (!cameraMoving || frame === undefined) return { f: (x - stumpsXu) * dir * mpu, u: (groundY! - y) * mpu, c };
    const k = mpu * (statureImg / at(statureTrack, frame, statureImg));
    const stumps = at(backTrack, frame, stumpsXu) - (dir * 0.25 * stature) / k;
    return { f: (x - stumps) * dir * k, u: (at(groundTrack, frame, groundY!) - y) * k, c };
  };

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
    const sp = toScene(p[0], p[1], p[2], frame);
    if (plane === "sagittal") return sp;
    const f = frontalF(frame, joint);
    return Number.isFinite(f) ? { f, u: sp.u, c: p[2] } : null;
  };

  const track = (pts: ImgPoint[]) =>
    pts.map((p, i) => {
      const q = img(p);
      return q ? toScene(q[0], q[1], q[2], i) : null;
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

  const across =
    plane === "frontal"
      ? (frame: number, joint: SemanticJoint): number => {
          const p = rawImg(frame, semanticToJoint(joint, front));
          return p ? toScene(p[0], p[1], p[2], frame).f * dir : NaN;
        }
      : null;

  const inPicture = (frame: number, joint: SemanticJoint): [number, number] | null => {
    const p = rawImg(frame, semanticToJoint(joint, front));
    if (!p) return null;
    const sp = toScene(p[0], p[1], p[2], frame);
    return [plane === "frontal" ? sp.f * dir : sp.f, sp.u];
  };

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
    across,
    inPicture,
    cameraMoving,
    zoom: finiteStature.length ? Math.max(...finiteStature) / Math.min(...finiteStature) : 1,
    toImage: ({ f, u }) => [(f / (dir * mpu) + stumpsXu) / aspect, groundY! - u / mpu],
  };
}

function rollingMedian(xs: number[], radius: number): number[] {
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - radius), i + radius + 1).filter(Number.isFinite).sort((a, b) => a - b);
    return w.length ? w[Math.floor(w.length / 2)]! : NaN;
  });
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
