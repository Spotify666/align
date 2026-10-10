// Measures in plain cricket terms for reports: values in degrees or as a share of the
// batter's height, and a short reading of what the number means for the defence.

import type { Metric } from "./types";

type M = Pick<Metric, "id" | "value" | "unit" | "decimals" | "range" | "inRange"> & { axis?: Metric["axis"] };

/** One value in the measure's plain unit. */
export function plainNumber(m: Pick<Metric, "unit" | "decimals">, v: number): string {
  if (m.unit === "× stature") return `${Math.round(v * 100)}%`;
  if (m.unit === "0–1" || m.unit === "share of frames") return `${Math.round(v * 100)}%`;
  if (m.unit.startsWith("°")) return `${Math.round(v)}°`;
  return `${v.toFixed(m.decimals)}`;
}

/** The unit after a plain number ("" when the number carries it). */
export function plainUnit(m: Pick<Metric, "unit">): string {
  if (m.unit === "× stature") return "of height";
  if (m.unit === "0–1") return "forward";
  if (m.unit === "share of frames") return "of the time";
  if (m.unit === "° from vertical") return "from upright";
  if (m.unit.startsWith("°")) return "";
  return m.unit.replace("× stature/s", "× height/s");
}

export const plainValue = (m: M) => (m.value === null ? "—" : `${plainNumber(m, m.value)} ${plainUnit(m)}`.trim());
export const plainRange = (m: M) => (m.range ? `${plainNumber(m, m.range.lo)}–${plainNumber(m, m.range.hi)} ${plainUnit(m)}`.trim() : "");

const READINGS: Record<string, { ok: string; low: string; high: string }> = {
  foot_spread: { ok: "Long stride to the ball", low: "Short stride", high: "Over-stretched stride" },
  stride_length: { ok: "Good stride to the ball", low: "Short stride", high: "Over-long stride" },
  front_knee_flexion: { ok: "Front knee bent", low: "Hips sinking below the knee", high: "Front leg too straight" },
  back_knee_extension: { ok: "Back leg long", low: "Back knee bent", high: "Back leg long" },
  line_head: { ok: "Head over the ball", low: "Head behind the front foot", high: "Head past the front foot" },
  line_shoulder: { ok: "Front shoulder in the line", low: "Front shoulder held back", high: "Front shoulder over-leaning" },
  line_knee: { ok: "Front knee over the foot", low: "Front leg propped straight", high: "Front knee collapsing past the toe" },
  line_held: { ok: "Line held to contact", low: "Line not held to contact", high: "Line held to contact" },
  sync_spread: { ok: "Foot, knee and shoulder together", low: "Foot, knee and shoulder together", high: "Foot, knee and shoulder out of sync" },
  set_late: { ok: "Set before the ball arrived", low: "Set before the ball arrived", high: "Still moving at contact" },
  trunk_inclination: { ok: "Leaning into the shot", low: "Too upright", high: "Bent over too far" },
  weight_forward: { ok: "Weight on the front foot", low: "Weight back", high: "Weight too far forward" },
  hands_ahead_of_knee: { ok: "Hands ahead, bat angled down", low: "Hands behind the front pad", high: "Hands pushed out" },
  head_speed_contact: { ok: "Head still at contact", low: "Head still at contact", high: "Head moving at contact" },
  bat_angle_contact: { ok: "Bat angled down", low: "Bat too upright", high: "Bat angled too far" },
  contact_ahead_of_knee: { ok: "Ball met beside the front pad", low: "Ball met behind the pad", high: "Reaching for the ball" },
  decision_timing: { ok: "Moved forward in time", low: "Moved very early", high: "Moved late" },
  bat_speed_contact: { ok: "Soft hands", low: "Soft hands", high: "Bat moving fast: hard hands" },
  ball_exit_speed: { ok: "Ball deadened", low: "Ball deadened", high: "Ball came off fast" },
  balance_over_feet: { ok: "Balanced over your feet", low: "Balanced over your feet", high: "Falling over" },
  // The back-foot defence.
  bfd_back_step: { ok: "Back and across", low: "Stuck on the crease", high: "Too deep, onto the stumps" },
  bfd_feet_gap: { ok: "Front foot alongside", low: "Front foot alongside", high: "Front foot left out in front" },
  bfd_head: { ok: "Head forward over the ball", low: "Head falling back", high: "Leaning toward the bowler" },
  bfd_tall: { ok: "Standing tall", low: "Up on the toes", high: "Sinking under the ball" },
  bfd_head_height: { ok: "Standing tall", low: "Crouched", high: "Standing tall" },
  bfd_elbow: { ok: "Front elbow high", low: "Front elbow dropped", high: "Elbow up too high" },
  bfd_hands_eyes: { ok: "Under the eyes", low: "Played late, beside you", high: "Hands pushed out in front" },
  bfd_dead_bat: { ok: "Soft hands", low: "Soft hands", high: "Pushed through the ball" },
  bfd_back_first: { ok: "Back foot first", low: "Front foot moved first", high: "Front foot left behind" },
  bfd_set_late: { ok: "Set before the ball arrived", low: "Set before the ball arrived", high: "Still moving at contact" },
};

/** The line read from either end of the pitch: the same parts, sideways. */
const SIDEWAYS: Record<string, { ok: string; low: string; high: string }> = {
  line_head: { ok: "Head over the line of the ball", low: "Head falling away to the leg side", high: "Head reaching across to the off side" },
  line_shoulder: { ok: "Front shoulder down the line", low: "Front shoulder opening up", high: "Front shoulder diving across" },
  line_knee: { ok: "Front knee over the foot", low: "Front knee falling in", high: "Front knee pushed out" },
  bfd_head: { ok: "Head in line, over the back foot", low: "Head falling away to the leg side", high: "Head reaching across" },
  bfd_hands_eyes: { ok: "Under the eyes", low: "Playing across the body", high: "Reaching away from the body" },
};

/** What the value means for the defence, in a few words. */
export function plainReading(m: M & { name: string }): string {
  const r = (m.axis === "sideways" && SIDEWAYS[m.id]) || READINGS[m.id];
  if (!r || m.value === null || !m.range) return m.name;
  if (m.inRange === true) return r.ok;
  if (m.value < m.range.lo) return r.low;
  if (m.value > m.range.hi) return r.high;
  return r.ok;
}
