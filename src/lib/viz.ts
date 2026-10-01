// Shared geometry for the 2D evidence viewer and the 3D replay.
import { buildScene, bodyCentre, type Scene } from "@/engine/scene";
import { J, JOINTS, type CaptureObservation, type Joint } from "@/engine/types";

export type V3 = [number, number, number];

export const BONES: Array<[Joint, Joint]> = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["left_ankle", "left_heel"],
  ["left_heel", "left_foot"],
  ["left_ankle", "left_foot"],
  ["right_ankle", "right_heel"],
  ["right_heel", "right_foot"],
  ["right_ankle", "right_foot"],
];

export interface WorldFrames {
  scene: Scene;
  /** joints[frame][jointIndex] in metres: x = forward, y = up, z = lateral (off side). */
  joints: (V3 | null)[][];
  conf: number[][];
  depth: "measured" | "estimated" | "none";
  bat: Array<[V3, V3] | null>;
  ball: (V3 | null)[];
  centre: (V3 | null)[];
  scaleNote: string | null;
}

export function worldFrames(obs: CaptureObservation): WorldFrames {
  const scene = buildScene(obs);
  const k = scene.unit === "stature" ? 1.75 : 1; // display scale for unscaled captures
  const depth: WorldFrames["depth"] = obs.body3d ? "measured" : obs.vizDepth ? "estimated" : "none";
  const lateral = (frame: number, j: number) => {
    if (obs.body3d) return obs.body3d[frame]?.[j]?.[2] ?? 0;
    if (obs.vizDepth) return obs.vizDepth[frame]?.[j] ?? 0;
    return 0;
  };
  const joints: (V3 | null)[][] = [];
  const conf: number[][] = [];
  const bat: WorldFrames["bat"] = [];
  const ball: WorldFrames["ball"] = [];
  const centre: WorldFrames["centre"] = [];
  for (let i = 0; i < scene.n; i++) {
    joints.push(
      JOINTS.map((jn, j) => {
        const p = scene.getRaw(i, jn);
        return p ? [p.f * k, p.u * k, lateral(i, j)] : null;
      }),
    );
    conf.push(JOINTS.map((jn) => obs.body[i]?.[J[jn]]?.[2] ?? 0));
    const h = scene.batHandle[i];
    const t = scene.batToe[i];
    const handLat = (lateral(i, J.left_wrist) + lateral(i, J.right_wrist)) / 2;
    bat.push(h && t ? [[h.f * k, h.u * k, handLat], [t.f * k, t.u * k, handLat]] : null);
    const b = scene.ball[i];
    ball.push(b ? [b.f * k, b.u * k, 0] : null);
    const c = bodyCentre(scene, i);
    centre.push(c ? [c.f * k, c.u * k, (lateral(i, J.left_hip) + lateral(i, J.right_hip)) / 2] : null);
  }
  return {
    scene,
    joints,
    conf,
    depth,
    bat,
    ball,
    centre,
    scaleNote: scene.unit === "stature" ? "No pitch scale: shown at an assumed 1.75 m height." : null,
  };
}

export const EVENT_LABEL: Record<string, string> = {
  setup: "Setup",
  trigger: "Trigger",
  bounce: "Bounce",
  front_foot_plant: "Plant",
  back_foot_commit: "Back foot",
  backswing_top: "Top",
  downswing_onset: "Down",
  contact: "Contact",
  follow_through: "Follow",
  recovery: "Recover",
};

// ---------------------------------------------------------------------------
// Display smoothing for the 3D replay. Measurements never use this: the engine
// reads the raw tracks. Zero-phase, so nothing lags; gaps stay gaps.

function gaussSeries(xs: (V3 | null)[], sigma: number): (V3 | null)[] {
  if (sigma < 0.5) return xs;
  const r = Math.ceil(sigma * 2.5);
  const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)));
  return xs.map((p, i) => {
    if (!p) return null;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let sw = 0;
    for (let k = -r; k <= r; k++) {
      const q = xs[i + k];
      if (!q) continue;
      const wk = w[k + r]!;
      sx += q[0] * wk;
      sy += q[1] * wk;
      sz += q[2] * wk;
      sw += wk;
    }
    return [sx / sw, sy / sw, sz / sw];
  });
}

/** Least-squares quadratic in time per axis; null when the fit is poor (not free flight). */
function fitFlight(idx: number[], pts: V3[]): V3[] | null {
  const n = idx.length;
  if (n < 4) return null;
  const t0 = idx[0]!;
  const ts = idx.map((i) => i - t0);
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  for (const t of ts) {
    s1 += t;
    s2 += t * t;
    s3 += t ** 3;
    s4 += t ** 4;
  }
  const A = [
    [n, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ];
  const det3 = (m: number[][]) =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det3(A);
  if (Math.abs(D) < 1e-9) return null;
  const coef = [0, 1, 2].map((axis) => {
    let b0 = 0, b1 = 0, b2 = 0;
    ts.forEach((t, k) => {
      const v = pts[k]![axis]!;
      b0 += v;
      b1 += v * t;
      b2 += v * t * t;
    });
    const b = [b0, b1, b2];
    return [0, 1, 2].map((c) => det3(A.map((row, r) => row.map((x, j) => (j === c ? b[r]! : x)))) / D);
  });
  const out = ts.map((t) => coef.map(([a, b, c]) => a! + b! * t + c! * t * t) as V3);
  const rms = Math.sqrt(out.reduce((s, p, k) => s + (p[0] - pts[k]![0]) ** 2 + (p[1] - pts[k]![1]) ** 2, 0) / n);
  return rms < 0.06 ? out : null;
}

/**
 * Ball: split the track at bounces, the bat contact and gaps (sharp turns in direction),
 * then fit each free-flight piece as a parabola. Corners stay sharp; noise goes.
 */
function smoothBall(ball: (V3 | null)[], fps: number): (V3 | null)[] {
  const light = gaussSeries(ball, 1.2);
  const k = Math.max(1, Math.round(0.02 * fps));
  const angle = ball.map((_, i) => {
    const a = light[i - k];
    const b = light[i];
    const c = light[i + k];
    if (!a || !b || !c) return 0;
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    const nu = Math.hypot(u[0]!, u[1]!);
    const nv = Math.hypot(v[0]!, v[1]!);
    if (nu < 1e-4 || nv < 1e-4) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (u[0]! * v[0]! + u[1]! * v[1]!) / (nu * nv))));
  });
  const isBreak = (i: number) => {
    if (angle[i]! < 0.6) return false;
    for (let j = i - k; j <= i + k; j++) if (j !== i && (angle[j] ?? 0) > angle[i]!) return false;
    return true;
  };
  const out: (V3 | null)[] = ball.map(() => null);
  let seg: number[] = [];
  const flush = () => {
    if (!seg.length) return;
    const pts = seg.map((i) => ball[i]!);
    const fit = fitFlight(seg, pts);
    const smoothed = fit ?? (gaussSeries(seg.map((i) => ball[i] ?? null), Math.max(0.8, 0.012 * fps)) as V3[]);
    seg.forEach((i, j) => {
      if (!out[i]) out[i] = smoothed[j]!;
    });
  };
  for (let i = 0; i < ball.length; i++) {
    if (!ball[i]) {
      if (seg.length && i - seg[seg.length - 1]! > 2) {
        flush();
        seg = [];
      }
      continue;
    }
    seg.push(i);
    if (isBreak(i)) {
      flush();
      seg = [i]; // the corner belongs to both pieces
    }
  }
  flush();
  return out;
}

/** A smoothed copy of the world frames for the 3D replay (≈35 ms on the body, 20 ms on the bat). */
export function smoothWorld(w: WorldFrames, fps: number | null): WorldFrames {
  const f = fps && fps > 0 ? fps : 30;
  const body = Math.max(0.6, 0.035 * f);
  const batS = Math.max(0.5, 0.02 * f);
  const nj = w.joints[0]?.length ?? 0;
  const joints: (V3 | null)[][] = w.joints.map(() => []);
  for (let j = 0; j < nj; j++) {
    const s = gaussSeries(w.joints.map((fr) => fr[j] ?? null), body);
    s.forEach((p, i) => (joints[i]![j] = p));
  }
  const handle = gaussSeries(w.bat.map((b) => b?.[0] ?? null), batS);
  const toe = gaussSeries(w.bat.map((b) => b?.[1] ?? null), batS);
  return {
    ...w,
    joints,
    bat: w.bat.map((b, i) => (b && handle[i] && toe[i] ? [handle[i]!, toe[i]!] : null)),
    ball: smoothBall(w.ball, f),
    centre: gaussSeries(w.centre, body),
  };
}
