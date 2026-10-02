// Measures in plain cricket terms for reports: values in degrees or as a share of the
// batter's height, and a short reading of what the number means for the defence.

import type { Metric } from "./types";

type M = Pick<Metric, "id" | "value" | "unit" | "decimals" | "range" | "inRange">;

/** One value in the measure's plain unit. */
export function plainNumber(m: Pick<Metric, "unit" | "decimals">, v: number): string {
  if (m.unit === "× stature") return `${Math.round(v * 100)}%`;
  if (m.unit === "0–1") return `${Math.round(v * 100)}%`;
  if (m.unit.startsWith("°")) return `${Math.round(v)}°`;
  return `${v.toFixed(m.decimals)}`;
}

/** The unit after a plain number ("" when the number carries it). */
export function plainUnit(m: Pick<Metric, "unit">): string {
  if (m.unit === "× stature") return "of height";
  if (m.unit === "0–1") return "forward";
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
  head_knee_offset: { ok: "Head over the front knee", low: "Head behind the front knee", high: "Head too far past the knee" },
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
  head_falling_away: { ok: "Head toward the ball", low: "Head toward the ball", high: "Head falling away" },
};

/** What the value means for the defence, in a few words. */
export function plainReading(m: M & { name: string }): string {
  const r = READINGS[m.id];
  if (!r || m.value === null || !m.range) return m.name;
  if (m.inRange === true) return r.ok;
  if (m.value < m.range.lo) return r.low;
  if (m.value > m.range.hi) return r.high;
  return r.ok;
}
