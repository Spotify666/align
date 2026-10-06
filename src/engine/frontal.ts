// Filmed along the pitch (from the bowler's end or behind the batter), forward distances
// come from a monocular 3D estimate. On real footage that estimate is wrong in size and
// in direction (a broadcast defence read as a straight front knee, the head behind the
// knee and a lean back, where the picture shows the opposite), so measures built on it
// are withheld, not shown. What this view does see well is sideways: whether the body stays
// balanced over the feet (here) and whether the head, front shoulder and front knee line up
// over the front foot (the line: alignment.ts). Those are graded instead, against physical
// limits and professionals' positions, never any clip's own readings.
// (A straight bat is the bat's own tilt from vertical, graded only when the bat is
// tracked: hands move sideways toward the line of the ball even with a straight bat.)

import type { MetricDefinition } from "./registry";
import type { Scene, SemanticJoint } from "./scene";
import type { Metric, RangeRef } from "./types";

/** Measures that rest on the forward axis: not graded when filmed along the pitch. */
export const FRONTAL_UNGRADED = ["stride_length", "weight_forward", "trunk_inclination", "front_knee_flexion", "head_speed_contact", "decision_timing"];

/** Forward distances and in-line angles: withheld when filmed along the pitch (see above). */
export const FRONTAL_WITHHELD = ["stride_length", "weight_forward", "trunk_inclination", "front_knee_flexion"];

/** A forward-axis measure from along the pitch, as not measured. Others unchanged. */
export function withholdAlongPitch(m: Metric): Metric {
  if (!FRONTAL_WITHHELD.includes(m.id) || m.status === "not_measured") return m;
  return {
    ...m,
    status: "not_measured",
    value: null,
    uncertainty: null,
    confidence: 0,
    inRange: null,
    evidenceIds: [],
    limitation: undefined,
    reason: "Not measured: it needs a side-on camera (this clip was filmed along the pitch).",
  };
}

export const FRONTAL_METRICS: MetricDefinition[] = [
  {
    id: "balance_over_feet",
    name: "Balanced over your feet",
    domain: "footwork",
    unit: "× stature",
    decimals: 2,
    phase: "Contact",
    meaning: "How far your estimated centre of mass sits sideways outside your feet (heels to toes) at contact, seen from the bowler's end. 0 = over them.",
    relevance: "A defence is played from a stable base: with your weight outside your feet you are falling over to the off side or away to the leg side, and the bat follows.",
    // Physics, not fitted to any clip: a body is statically stable only with its centre of
    // mass over the base of support. Tolerance is landmark error at hips and feet only.
    range: { lo: 0, hi: 0.02 },
    requires: ["body", "contact"],
    weight: 1.1,
    direction: "lower",
  },
];

const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

const FEET = ["front_heel", "front_foot", "front_ankle", "back_heel", "back_foot", "back_ankle"] as const;

// Lateral centre of mass from segment mass fractions (after Dempster/Winter): head 8%,
// trunk 50% (midway hips to shoulders), arms 10% (at the shoulders), thighs 20% (midway
// hip to knee), shanks and feet 12% (midway knee to ankle).
function comAcross(across: (j: SemanticJoint) => number): number {
  const mid = (a: SemanticJoint, b: SemanticJoint) => (across(a) + across(b)) / 2;
  const hips = mid("front_hip", "back_hip");
  const shoulders = mid("front_shoulder", "back_shoulder");
  const thighs = (mid("front_hip", "front_knee") + mid("back_hip", "back_knee")) / 2;
  const shanks = (mid("front_knee", "front_ankle") + mid("back_knee", "back_ankle")) / 2;
  return 0.08 * across("head") + 0.5 * (hips + shoulders) / 2 + 0.1 * shoulders + 0.2 * thighs + 0.12 * shanks;
}

/** The sideways measures, from the frames around contact (a photo: its one frame). */
export function frontalMetrics(scene: Scene, contact: number | undefined, range: Omit<RangeRef, "lo" | "hi">): Metric[] {
  const across = scene.across;
  if (!across || contact === undefined) return [];
  const S = scene.stature;
  const k = scene.dt ? Math.max(1, Math.round(0.05 / scene.dt)) : 0;
  const around = Array.from({ length: 2 * k + 1 }, (_, o) => contact - k + o).filter((i) => i >= 0 && i < scene.n);
  const out: Metric[] = [];
  const make = (def: MetricDefinition, value: number, evidence: number[]): Metric => {
    const r = def.range!;
    return {
      id: def.id,
      name: def.name,
      domain: def.domain,
      status: "measured",
      value: Math.round(value * 10 ** def.decimals) / 10 ** def.decimals,
      uncertainty: null,
      unit: def.unit,
      decimals: def.decimals,
      confidence: 0.7,
      phase: def.phase,
      meaning: def.meaning,
      relevance: def.relevance,
      range: { lo: r.lo, hi: r.hi, ...range },
      inRange: value >= r.lo && value <= r.hi,
      evidenceIds: evidence.map((f) => `frame_${f}`),
    };
  };

  // Centre of mass outside the sideways span of both feet (0 inside it). The span needs a
  // toe and a heel or ankle of each foot, so it is a base, not a point.
  const footSeen = (side: "front" | "back", i: number) =>
    Number.isFinite(across(i, `${side}_foot`)) && (Number.isFinite(across(i, `${side}_heel`)) || Number.isFinite(across(i, `${side}_ankle`)));
  const outside = around.map((i) => {
    if (!footSeen("front", i) || !footSeen("back", i)) return NaN;
    const feet = FEET.map((j) => across(i, j)).filter(Number.isFinite);
    const com = comAcross((j) => across(i, j));
    if (!Number.isFinite(com)) return NaN;
    return Math.max(0, Math.min(...feet) - com, com - Math.max(...feet)) / S;
  });
  const balance = median(outside);
  if (Number.isFinite(balance)) out.push(make(FRONTAL_METRICS[0]!, balance, [contact]));

  return out;
}
