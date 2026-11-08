// Real batting motion from the KU CricShot 3D poses (Sourav-017/Cricket-Shot-Analysis-Framework,
// `KU_Cric_Shot_3d/ku_cric_shot_3d.zip`: MeTRAbs SMPL+head 30-joint estimates of international
// batters filmed from the bowler's end, 20 frames per shot, camera axes in mm). The data is
// third-party and stays outside the repo (KU_DIR); this only turns it into observations.
//
// Each shot is seen through a virtual phone placed anywhere round the batter (front-on from
// the bowler's end, side-on from either side, behind, angled), so a rule can be checked on
// real movement from every camera position the app accepts.

import { readFileSync } from "node:fs";
import { JOINTS, type CameraPoint, type CaptureObservation, type Handedness, type ImgPoint, type Joint, type TargetShot } from "@/engine/types";

type V3 = [number, number, number];
const SMPL: Record<string, number> = { pelv: 0, lhip: 1, rhip: 2, lkne: 4, rkne: 5, lank: 7, rank: 8, ltoe: 10, rtoe: 11, head: 15, lsho: 16, rsho: 17, lelb: 18, relb: 19, lwri: 20, rwri: 21, htop: 29 };

export interface KuShot {
  id: string;
  /** frames × 30 joints, metres, camera axes (x right, y down, z away from the bowler's-end camera). */
  frames: V3[][];
  handedness: Handedness;
  stature: number;
}

export function readKu(file: string, id: string): KuShot | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length < 8) return null;
  const frames: V3[][] = [];
  for (const fr of raw as unknown[]) {
    if (!Array.isArray(fr) || fr.length !== 30 || !Array.isArray(fr[0]) || (fr[0] as unknown[]).length !== 3 || typeof (fr[0] as unknown[])[0] !== "number") return null; // multi-person
    frames.push((fr as number[][]).map((p) => [p[0]! / 1000, p[1]! / 1000, p[2]! / 1000]));
  }
  const st = (j: number) => avg(frames.slice(0, 3).map((f) => f[j]!));
  // The front foot is the one nearer the bowler (the camera) in the stance.
  const handedness: Handedness = st(SMPL.lank!)[2] < st(SMPL.rank!)[2] ? "right" : "left";
  const tall = frames.map((f) => Math.max(f[SMPL.lank!]![1], f[SMPL.rank!]![1]) - f[SMPL.htop!]![1]).sort((a, b) => a - b);
  const stature = tall[Math.floor(tall.length * 0.75)]!;
  return { id, frames, handedness, stature };
}

const avg = (ps: V3[]): V3 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length, ps.reduce((s, p) => s + p[2], 0) / ps.length];

/**
 * Footwork read from the 3D estimate itself (independent of the engine): how much the gap
 * between the feet along the pitch grew (a stride toward the bowler) or closed (the front foot
 * drawn back alongside), and the head's drop, × height.
 */
export function footwork(s: KuShot): { grow: number; close: number; headDrop: number } {
  const front = s.handedness === "right" ? SMPL.lank! : SMPL.rank!;
  const back = s.handedness === "right" ? SMPL.rank! : SMPL.lank!;
  const gap = s.frames.map((f) => (f[back]![2] - f[front]![2]) / s.stature);
  const g0 = (gap[0]! + gap[1]! + gap[2]!) / 3;
  const headH = s.frames.map((f) => (Math.max(f[SMPL.lank!]![1], f[SMPL.rank!]![1]) - f[SMPL.head!]![1]) / s.stature);
  const h0 = (headH[0]! + headH[1]! + headH[2]!) / 3;
  return { grow: Math.max(...gap) - g0, close: g0 - Math.min(...gap), headDrop: h0 - Math.min(...headH) };
}

/** A defence's footwork, by the coaching definition: a stride forward, or back with the front foot drawn in. */
export function defenceKind(s: KuShot): "front" | "back" | "unclear" {
  const { grow, close } = footwork(s);
  if (grow >= 0.15 && close <= 0.05) return "front";
  if (close >= 0.1 && grow <= 0.1) return "back";
  return "unclear";
}

export interface View {
  /** Degrees round the batter from the bowler's end (0 = front-on, 180 = behind, ±90 = side-on). */
  yaw: number;
  /** Camera distance (m): perspective. */
  distance: number;
}

const toSmpl: Record<Joint, (f: V3[]) => V3> = {
  nose: (f) => avg([24, 25, 26, 27, 28].map((j) => f[j]!)),
  left_shoulder: (f) => f[SMPL.lsho!]!,
  right_shoulder: (f) => f[SMPL.rsho!]!,
  left_elbow: (f) => f[SMPL.lelb!]!,
  right_elbow: (f) => f[SMPL.relb!]!,
  left_wrist: (f) => f[SMPL.lwri!]!,
  right_wrist: (f) => f[SMPL.rwri!]!,
  left_hip: (f) => f[SMPL.lhip!]!,
  right_hip: (f) => f[SMPL.rhip!]!,
  left_knee: (f) => f[SMPL.lkne!]!,
  right_knee: (f) => f[SMPL.rkne!]!,
  left_ankle: (f) => f[SMPL.lank!]!,
  right_ankle: (f) => f[SMPL.rank!]!,
  left_heel: (f) => heel(f[SMPL.lank!]!, f[SMPL.ltoe!]!),
  right_heel: (f) => heel(f[SMPL.rank!]!, f[SMPL.rtoe!]!),
  left_foot: (f) => f[SMPL.ltoe!]!,
  right_foot: (f) => f[SMPL.rtoe!]!,
};
function heel(ank: V3, toe: V3): V3 {
  return [ank[0] + 0.3 * (ank[0] - toe[0]), toe[1], ank[2] + 0.3 * (ank[2] - toe[2])];
}

/**
 * The shot as a phone at `view` would record it: 30 fps over `durationS` (the 20 poses are
 * spread over the shot), image points normalised to a 1280×720 frame, and the pose estimate
 * (hip-centred, depth compressed as monocular estimates are) for front-on and behind views.
 * `depthGain` undoes the estimate's depth compression before the camera moves round
 * (side-on footage shows the stride about twice as long as these estimates do).
 */
export function kuObservation(s: KuShot, view: View, opts: { durationS?: number; depthGain?: number; target?: TargetShot } = {}): CaptureObservation {
  const T = opts.durationS ?? 2;
  const fps = 30;
  const n = Math.round(T * fps);
  const gain = opts.depthGain ?? 1.8;
  const pelv0 = avg(s.frames.slice(0, 3).map((f) => f[SMPL.pelv!]!));
  const th = (view.yaw * Math.PI) / 180;
  const [c, sn] = [Math.cos(th), Math.sin(th)];
  // Into the virtual camera: depth decompressed about the stance pelvis, then turned round the vertical.
  const cam = (p: V3): V3 => {
    const x = p[0] - pelv0[0];
    const y = p[1] - pelv0[1];
    const z = (p[2] - pelv0[2]) * gain;
    return [x * c + z * sn, y, -x * sn + z * c];
  };
  const W = 1280;
  const H = 720;
  const a = W / H;
  const k = 0.5 / s.stature; // the batter about half the frame tall
  const proj = (p: V3): [number, number] => {
    const q = cam(p);
    const persp = view.distance / (view.distance + q[2]);
    return [0.5 + (q[0] * k * persp) / a, 0.56 + q[1] * k * persp];
  };
  // The estimates come from crops that follow the batter, so their absolute position is not
  // the batter's: stand the body on the ground (the lower ankle at the stance's ground level).
  const ground0 = avg(s.frames.slice(0, 3).map((f) => [0, Math.max(f[SMPL.lank!]![1], f[SMPL.rank!]![1]), 0] as V3))[1];
  const grounded = s.frames.map((f) => {
    const dy = ground0 - Math.max(f[SMPL.lank!]![1], f[SMPL.rank!]![1]);
    return f.map((p) => [p[0], p[1] + dy, p[2]] as V3);
  });
  const at = (t: number): V3[] => {
    const u = (t / T) * (grounded.length - 1);
    const i = Math.min(grounded.length - 2, Math.floor(u));
    const w = u - i;
    return grounded[i]!.map((p, j) => {
      const q = grounded[i + 1]![j]!;
      return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w] as V3;
    });
  };
  const t: number[] = [];
  const body: ImgPoint[][] = [];
  const world: CameraPoint[][] = [];
  for (let i = 0; i < n; i++) {
    const tt = i / fps;
    const f = at(tt);
    t.push(Math.round(tt * 1000 * 100) / 100);
    body.push(JOINTS.map((j) => [...proj(toSmpl[j](f)), 0.95] as const));
    const hip = avg([f[SMPL.lhip!]!, f[SMPL.rhip!]!]);
    const hc = cam(hip);
    world.push(
      JOINTS.map((j) => {
        const q = cam(toSmpl[j](f));
        // Hip-centred metres; depth compressed again as a monocular estimate reads it.
        return [q[0] - hc[0], q[1] - hc[1], ((q[2] - hc[2]) / gain) * 1, 0.95] as const;
      }),
    );
  }
  const yaw = ((view.yaw % 360) + 360) % 360;
  const frontal = yaw <= 30 || yaw >= 330 || (yaw >= 150 && yaw <= 210);
  const behind = yaw >= 150 && yaw <= 210;
  // The bowler is toward −z of the original camera; after turning, toward −sin, −cos.
  const bowlerX = -Math.sin(th);
  const bowlerSide: "left" | "right" = bowlerX < 0 ? "left" : "right";
  const quality = Array.from({ length: 24 }, (_, kq) => ({ frame: Math.floor((kq * n) / 24), brightness: 0.5, contrast: 0.2, sharpness: 0.02, backgroundMotion: 0.008 }));
  return {
    schema: "align.observation/1",
    id: `${s.id}@${view.yaw}`,
    source: "browser_capture",
    demo: false,
    media: { kind: "video", width: W, height: H, fps, fpsSource: "container", durationMs: T * 1000, frameCount: n },
    tier: "quick",
    athlete: { handedness: s.handedness, heightCm: null },
    camera: { view: frontal ? (behind ? "behind" : "front_on") : "side_on", bowlerSide },
    calibration: { source: "none", metresPerUnit: null, stumpsX: null, groundY: null },
    quality: { frames: quality, maxPeople: 1 },
    t,
    body,
    poseWorld: world,
    bat: { source: "none", handle: body.map(() => null), toe: body.map(() => null) },
    ball: { source: "none", points: body.map(() => null) },
    marks: { bounceFrame: null, contactFrame: null },
    ...(opts.target && opts.target !== "front_foot_defence" ? { target: opts.target } : {}),
  };
}
