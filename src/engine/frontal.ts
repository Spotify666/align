// Filmed along the pitch (from the bowler's end or behind the batter), forward distances
// come from a monocular 3D estimate that understates depth, so measures built on them are
// shown but not graded. What this view does see well is sideways: whether the head stays
// in line over the front foot, and whether the hands bring the bat down straight. Those
// are graded instead.

import type { MetricDefinition } from "./registry";
import type { Scene } from "./scene";
import type { Metric, RangeRef } from "./types";

/** Measures that rest on the forward axis: not graded when filmed along the pitch. */
export const FRONTAL_UNGRADED = ["stride_length", "head_knee_offset", "weight_forward", "trunk_inclination", "front_knee_flexion", "head_speed_contact", "decision_timing"];

export const FRONTAL_METRICS: MetricDefinition[] = [
  {
    id: "head_line",
    name: "Head in line over front foot",
    domain: "head_trunk",
    unit: "× stature",
    decimals: 2,
    phase: "Contact",
    meaning: "Sideways distance between your head and your front foot at contact, seen from the bowler's end.",
    relevance: "A head in line over the front foot keeps your eyes on the line of the ball and your balance over the shot.",
    // Provisional: a sound defence from the bowler's end reads 0.14–0.17 (the head sits
    // just inside the front foot); falling away to either side reads well above.
    range: { lo: 0, hi: 0.22 },
    requires: ["body", "contact"],
    weight: 1.2,
    direction: "lower",
  },
  {
    id: "hands_line",
    name: "Bat comes down straight",
    domain: "bat_contact",
    unit: "× stature",
    decimals: 2,
    phase: "Downswing to contact",
    meaning: "How far your hands travel sideways from the top of the backlift to contact, seen from the bowler's end.",
    relevance: "Hands that come straight down bring a straight bat to the ball; hands that swing across open the gate.",
    range: { lo: 0, hi: 0.2 },
    requires: ["body", "contact"],
    weight: 1,
    direction: "lower",
  },
];

const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

/** The two sideways measures, from the frames around contact. */
export function frontalMetrics(scene: Scene, contact: number | undefined, top: number | undefined, range: Omit<RangeRef, "lo" | "hi">): Metric[] {
  if (!scene.across || contact === undefined || !scene.dt) return [];
  const S = scene.stature;
  const k = Math.max(1, Math.round(0.05 / scene.dt));
  const around = Array.from({ length: 2 * k + 1 }, (_, o) => contact - k + o).filter((i) => i >= 0 && i < scene.n);
  const hands = (i: number) => {
    const a = scene.across!(i, "front_wrist");
    const b = scene.across!(i, "back_wrist");
    return Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b;
  };
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

  const offset = median(around.map((i) => Math.abs(scene.across!(i, "head") - scene.across!(i, "front_ankle")))) / S;
  if (Number.isFinite(offset)) out.push(make(FRONTAL_METRICS[0]!, offset, [contact]));

  // The downswing only: from the top of the backlift, or 0.4 s before contact if later.
  const from = Math.max(top !== undefined && top < contact ? top : 0, contact - Math.round(0.4 / scene.dt), 0);
  const path = Array.from({ length: contact - from + 1 }, (_, o) => hands(from + o)).filter(Number.isFinite);
  if (path.length >= Math.max(3, (contact - from + 1) * 0.5)) {
    const travel = (Math.max(...path) - Math.min(...path)) / S;
    out.push(make(FRONTAL_METRICS[1]!, travel, [from, contact]));
  }
  return out;
}
