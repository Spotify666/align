// Turns on-device tracking plus the athlete's marks into a CaptureObservation.
// Every user-supplied point is labelled as such; nothing is invented between marks
// except straight-line interpolation that is declared "interpolated".

import type { CameraPoint, CaptureObservation, FrameQuality, ImgPoint, PhotoPhase, Tier } from "@/engine/types";
import { J } from "@/engine/types";

export interface Marks {
  bowlerSide: "left" | "right";
  view: CaptureObservation["camera"]["view"];
  stumpsBase: [number, number] | null;
  stumpsTop: [number, number] | null;
  bounce: { frame: number; at: [number, number] } | null;
  contact: { frame: number; at: [number, number] } | null;
  ballAfter: { frame: number; at: [number, number] } | null;
  bat: Array<{ frame: number; handle: [number, number]; toe: [number, number] }>;
}

export const EMPTY_MARKS: Marks = {
  bowlerSide: "right",
  view: "side_on",
  stumpsBase: null,
  stumpsTop: null,
  bounce: null,
  contact: null,
  ballAfter: null,
  bat: [],
};

export interface TrackingResult {
  t: number[];
  body: ImgPoint[][];
  /** Monocular 3D estimate per frame (camera axes), used when filmed along the pitch. */
  world: CameraPoint[][];
  depth: number[][];
  /** Photo sets: the moment each photo shows, when tagged. */
  photoPhases?: Array<PhotoPhase | null>;
  people: number;
  quality: FrameQuality[];
  fps: number;
  fpsSource: CaptureObservation["media"]["fpsSource"];
  width: number;
  height: number;
  durationMs: number;
  kind: "video" | "photo";
  /** Batting hand read from the grip in this clip or photo, when clear (else the profile's). */
  handedness?: "right" | "left";
}

const lerp2 = (a: [number, number], b: [number, number], s: number): [number, number] => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];

function ballTrack(n: number, m: Marks): ImgPoint[] {
  const pts: ImgPoint[] = Array.from({ length: n }, () => null);
  const anchors = [m.bounce, m.contact, m.ballAfter].filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.frame - b.frame);
  if (anchors.length < 2) {
    for (const a of anchors) pts[a.frame] = [a.at[0], a.at[1], 0.7];
    return pts;
  }
  for (let k = 0; k < anchors.length - 1; k++) {
    const a = anchors[k]!;
    const b = anchors[k + 1]!;
    for (let f = a.frame; f <= b.frame; f++) {
      const s = b.frame === a.frame ? 0 : (f - a.frame) / (b.frame - a.frame);
      const p = lerp2(a.at, b.at, s);
      pts[f] = [p[0], p[1], f === a.frame || f === b.frame ? 0.75 : 0.6];
    }
  }
  return pts;
}

/**
 * Bat between marks: the handle follows the tracked hands (mid-wrist) plus the offset
 * seen at the marks; angle and length are interpolated between marked frames.
 */
function batTrack(body: ImgPoint[][], marks: Marks["bat"], aspect: number) {
  const n = body.length;
  const handle: ImgPoint[] = Array.from({ length: n }, () => null);
  const toe: ImgPoint[] = Array.from({ length: n }, () => null);
  const sorted = [...marks].sort((a, b) => a.frame - b.frame);
  if (!sorted.length) return { handle, toe };
  const hands = (f: number): [number, number] | null => {
    const l = body[f]?.[J.left_wrist];
    const r = body[f]?.[J.right_wrist];
    if (l && r && l[2] > 0.4 && r[2] > 0.4) return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
    return null;
  };
  const polar = (m: (typeof sorted)[number]) => {
    const dx = (m.toe[0] - m.handle[0]) * aspect;
    const dy = m.toe[1] - m.handle[1];
    const h = hands(m.frame);
    return { ang: Math.atan2(dy, dx), len: Math.hypot(dx, dy), off: h ? [m.handle[0] - h[0], m.handle[1] - h[1]] : [0, 0], h: m.handle };
  };
  const P = sorted.map(polar);
  const first = sorted[0]!.frame;
  const last = sorted[sorted.length - 1]!.frame;
  for (let f = first; f <= last; f++) {
    let k = 0;
    while (k < sorted.length - 2 && sorted[k + 1]!.frame < f) k++;
    const a = sorted[k]!;
    const b = sorted[Math.min(k + 1, sorted.length - 1)]!;
    const pa = P[k]!;
    const pb = P[Math.min(k + 1, P.length - 1)]!;
    const s = b.frame === a.frame ? 0 : Math.max(0, Math.min(1, (f - a.frame) / (b.frame - a.frame)));
    let dAng = pb.ang - pa.ang;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    if (dAng < -Math.PI) dAng += 2 * Math.PI;
    const ang = pa.ang + dAng * s;
    const len = pa.len + (pb.len - pa.len) * s;
    const h = hands(f);
    const off = [pa.off[0]! + (pb.off[0]! - pa.off[0]!) * s, pa.off[1]! + (pb.off[1]! - pa.off[1]!) * s];
    const hp: [number, number] = h ? [h[0] + off[0]!, h[1] + off[1]!] : lerp2(pa.h, pb.h, s);
    const marked = f === a.frame || f === b.frame;
    handle[f] = [hp[0], hp[1], marked ? 0.8 : 0.65];
    toe[f] = [hp[0] + (Math.cos(ang) * len) / aspect, hp[1] + Math.sin(ang) * len, marked ? 0.8 : 0.6];
  }
  return { handle, toe };
}

export function buildObservation(opts: {
  id: string;
  tracking: TrackingResult;
  marks: Marks;
  tier: Tier;
  handedness: "right" | "left";
  heightCm: number | null;
}): CaptureObservation {
  const { tracking: tr, marks: m } = opts;
  const aspect = tr.width / tr.height;
  const n = tr.body.length;
  const bat = batTrack(tr.body, m.bat, aspect);
  const ball = ballTrack(n, m);

  let metresPerUnit: number | null = null;
  if (m.stumpsBase && m.stumpsTop) {
    const d = Math.hypot((m.stumpsTop[0] - m.stumpsBase[0]) * aspect, m.stumpsTop[1] - m.stumpsBase[1]);
    if (d > 0.01) metresPerUnit = 0.711 / d;
  }

  return {
    schema: "align.observation/1",
    id: opts.id,
    source: "browser_capture",
    demo: false,
    media: {
      kind: tr.kind,
      width: tr.width,
      height: tr.height,
      fps: tr.kind === "photo" ? null : tr.fps,
      fpsSource: tr.fpsSource,
      durationMs: tr.durationMs,
      frameCount: n,
    },
    tier: opts.tier,
    athlete: { handedness: opts.handedness, heightCm: opts.heightCm },
    camera: { view: m.view, bowlerSide: m.bowlerSide },
    calibration: {
      source: metresPerUnit ? "user_marked" : "none",
      metresPerUnit,
      stumpsX: m.stumpsBase ? m.stumpsBase[0] : null,
      groundY: m.stumpsBase ? m.stumpsBase[1] : null,
    },
    quality: { frames: tr.quality, maxPeople: tr.people },
    t: tr.t,
    body: tr.body,
    vizDepth: tr.depth,
    ...(tr.world.some((f) => f.some(Boolean)) ? { poseWorld: tr.world } : {}),
    ...(tr.photoPhases ? { photoPhases: tr.photoPhases } : {}),
    bat: { source: m.bat.length >= 2 ? "interpolated" : m.bat.length === 1 ? "user_marked" : "none", handle: bat.handle, toe: bat.toe },
    ball: { source: ball.some(Boolean) ? "user_marked" : "none", points: ball },
    marks: { bounceFrame: m.bounce?.frame ?? null, contactFrame: m.contact?.frame ?? null },
  };
}
