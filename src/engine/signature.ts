// A shot's signature: the measures that define how this batter played the defence, and the
// line's path into contact, in units that don't depend on the camera, the batter's size or
// the length of the ball. Two signatures can be compared whoever played them: your shot
// against your earlier ones, a textbook model, professionals, or another player who shared.
//
// Match: each measure both shots have is compared in units of its coaching range's half
// width (the size of a meaningful difference), similarity exp(−d²/2) (1 = the same, 0.6 =
// half a range apart, 0.14 = two half ranges apart), weighted as the technique index weighs
// it; the line's path counts as one more measure. Never across camera positions: a line read
// sideways and one read along the pitch are different measures.

import { LINE_BANDS, LINE_PARTS, type LineAxis, type LinePart } from "./alignment";
import { METRICS } from "./registry";
import { FRONTAL_METRICS } from "./frontal";
import type { AnalysisPayload } from "./types";

export const SIGNATURE_VERSION = "sig-1";

/** The measures a signature carries: the line, its timing, and the shape around it. */
export const SIGNATURE_IDS = [
  "line_head",
  "line_shoulder",
  "line_knee",
  "line_held",
  "sync_spread",
  "stride_length",
  "foot_spread",
  "front_knee_flexion",
  "back_knee_extension",
  "trunk_inclination",
  "weight_forward",
  "hands_ahead_of_knee",
  "balance_over_feet",
  "bat_angle_contact",
] as const;

const LINE_IDS = new Set(["line_head", "line_shoulder", "line_knee"]);
const SAMPLES = 11;

export interface ShotSignature {
  version: string;
  shot: "front_foot_defence";
  /** Axis the line was read along (camera position): forward = side-on, sideways = from either end. */
  axis: LineAxis | null;
  media: "video" | "photo";
  values: Partial<Record<(typeof SIGNATURE_IDS)[number], number>>;
  /** The line over the last 300 ms into the reference frame, resampled to 11 points per part. */
  path?: Record<LinePart, number[]>;
}

function resample(xs: (number | null)[], n: number): number[] | null {
  const pts = xs.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null && Number.isFinite(p[1]));
  if (pts.length < 3) return null;
  const last = xs.length - 1;
  return Array.from({ length: n }, (_, k) => {
    const t = (k / (n - 1)) * last;
    const j = pts.findIndex((p) => p[0] >= t);
    if (j <= 0) return pts[Math.max(0, j)]![1];
    const [t0, v0] = pts[j - 1]!;
    const [t1, v1] = pts[j]!;
    return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
  });
}

/** The signature of a graded front-foot defence (a valid video, or a photo checked against the formula). */
export function signatureOf(p: AnalysisPayload, fps?: number | null): ShotSignature | null {
  const graded = p.analysis_status === "valid" || (p.position_check && !["not_side_on", "not_enough", "not_on_front_foot"].includes(p.position_check.verdict));
  if (!graded) return null;
  const values: ShotSignature["values"] = {};
  for (const m of p.metrics) {
    if (!(SIGNATURE_IDS as readonly string[]).includes(m.id) || m.value === null || m.status === "not_measured" || m.inRange === null) continue;
    values[m.id as (typeof SIGNATURE_IDS)[number]] = m.value;
  }
  if (Object.keys(values).length < 3) return null;
  let path: ShotSignature["path"];
  const line = p.line;
  if (line && line.trace.to > line.trace.from) {
    // From 300 ms before the reference frame up to it.
    const per = fps ? Math.max(2, Math.round(0.3 * fps)) : 9;
    const end = line.referenceFrame - line.trace.from;
    const start = Math.max(0, end - per);
    const cut = (xs: (number | null)[]) => resample(xs.slice(start, end + 1), SAMPLES);
    const parts = LINE_PARTS.map((part) => [part, cut(line.trace[part])] as const);
    if (parts.every(([, v]) => v)) path = Object.fromEntries(parts) as Record<LinePart, number[]>;
  }
  return { version: SIGNATURE_VERSION, shot: "front_foot_defence", axis: line?.axis ?? null, media: p.mode === "posture_screen" ? "photo" : "video", values, ...(path ? { path } : {}) };
}

export interface MatchPart {
  id: string;
  name: string;
  you: number;
  them: number;
  unit: string;
  decimals: number;
  /** Difference in half-ranges (signed: + = yours is higher). */
  d: number;
  similarity: number;
}

export interface Match {
  /** 0–100, or null when fewer than three measures are comparable. */
  score: number | null;
  parts: MatchPart[];
  /** The line's path into contact: similarity 0–1, when both have one. */
  path: number | null;
  /** Measures in one but not both (for "not compared"). */
  missing: string[];
}

const def = (id: string) => METRICS.find((d) => d.id === id) ?? FRONTAL_METRICS.find((d) => d.id === id);

function halfRange(id: string, axis: LineAxis | null): number {
  const d = def(id);
  const r = axis === "sideways" && d?.rangeSideways ? d.rangeSideways : d?.range;
  if (!r) return 1;
  // One-sided measures (e.g. 0–150 ms) use their full width.
  return Math.max(1e-6, d?.direction === "band" ? (r.hi - r.lo) / 2 : r.hi - r.lo);
}

/** How closely `you` matches `them` (see the header). */
export function matchSignatures(you: ShotSignature, them: ShotSignature): Match {
  const sameAxis = you.axis !== null && you.axis === them.axis;
  const parts: MatchPart[] = [];
  const missing: string[] = [];
  let w = 0;
  let s = 0;
  for (const id of SIGNATURE_IDS) {
    const a = you.values[id];
    const b = them.values[id];
    if (a === undefined || b === undefined || (LINE_IDS.has(id) && !sameAxis)) {
      if (a !== undefined || b !== undefined) missing.push(id);
      continue;
    }
    const d = (a - b) / halfRange(id, you.axis);
    const similarity = Math.exp(-0.5 * d * d);
    const weight = def(id)?.weight || 0.6;
    w += weight;
    s += weight * similarity;
    const m = def(id)!;
    parts.push({ id, name: m.name, you: a, them: b, unit: m.unit, decimals: m.decimals, d, similarity });
  }
  let path: number | null = null;
  if (sameAxis && you.path && them.path && you.axis) {
    const axis = you.axis;
    let sq = 0;
    let n = 0;
    for (const part of LINE_PARTS) {
      const half = (LINE_BANDS[axis][part][1] - LINE_BANDS[axis][part][0]) / 2;
      you.path[part].forEach((v, k) => {
        const o = them.path![part][k];
        if (o === undefined) return;
        sq += ((v - o) / half) ** 2;
        n++;
      });
    }
    if (n) {
      path = Math.exp(-0.5 * (sq / n));
      w += 1.2;
      s += 1.2 * path;
    }
  }
  parts.sort((a, b) => a.similarity - b.similarity);
  return { score: parts.length >= 3 ? Math.round((100 * s) / w) : null, parts, path, missing };
}

/**
 * Professionals' line, read sideways (from either end of the pitch): medians of 323
 * front-foot defences by international batters (KU CricShot 3D pose estimates), at the
 * deepest point of the stride. Sideways only: those estimates compress distances toward the
 * camera (along the pitch), so they can't stand in for a side-on reading.
 */
export const PRO_SIDEWAYS: ShotSignature = {
  version: SIGNATURE_VERSION,
  shot: "front_foot_defence",
  axis: "sideways",
  media: "video",
  values: { line_head: 0.135, line_shoulder: 0.012, line_knee: -0.02 },
};
