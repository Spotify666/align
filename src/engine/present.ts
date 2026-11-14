// What a report shows at each analysis level and focus: a pure view of the stored analysis.
//
// The analysis itself (`align.analysis/1`) is the same at every level: it never reads the level
// or the focus. This only chooses which of its checks a report leads with and how many it
// shows, from the category's own presentation spec (`category.ts`):
//
// - Only checks the analysis measured are shown (never a measure it couldn't take).
// - The engine's own priorities (the faults its plan ranks first) are always shown, in focus
//   or not: a serious finding is never hidden by a choice of focus.
// - Then the chosen focus areas, faults first; then the rest by the category's order.
// - Beginner sees up to 7 checks, Amateur up to 14, Professional every one. Everything else
//   stays one tap away in Technical details (`more` says how many).

import { categoryOf, type FocusArea } from "./category";
import type { AnalysisLevel, ReadingLevel } from "./summary";
import type { AnalysisPayload, Metric } from "./types";

export const PRESENTATION_VERSION = "present-1.0.0";

/** Why a check is on the list. */
export type ShownBecause = "priority" | "focus" | "level";

export interface PresentedCheck {
  metric: Metric;
  because: ShownBecause;
}

export interface ReportModel {
  schema: "aline.report-model/1";
  version: string;
  level: AnalysisLevel;
  focus: FocusArea[];
  /** Whether the checks are graded (an accepted shot, or a graded photo position) or only seen. */
  graded: boolean;
  /** The checks this level shows, in order. */
  checks: PresentedCheck[];
  /** Measured checks not on the list: shown under Technical details. */
  more: number;
  /** Focus areas chosen that this analysis has no measure for (e.g. the ball's speed without a ball). */
  unmeasuredFocus: FocusArea[];
}

/** The level a report reads at when none was chosen: from the reading level the batter's age gives. */
export const levelFromReading = (r: ReadingLevel): AnalysisLevel => (r === "simple" ? "beginner" : r === "detailed" ? "professional" : "amateur");

/** A photo's position check that was graded (not "not side-on" or "not enough"). */
const positionGraded = (p: AnalysisPayload) => !!p.position_check && !["not_side_on", "not_enough", "not_on_front_foot"].includes(p.position_check.verdict);

/** The checks an analysis can show: measured, and graded when the result is graded. */
export function availableChecks(p: AnalysisPayload): { checks: Metric[]; graded: boolean } {
  const isValid = p.analysis_status === "valid";
  const graded = isValid || positionGraded(p);
  const shown = (isValid || p.mode === "posture_screen" ? p.metrics : (p.observations ?? [])).filter((m) => m.status !== "not_measured" && m.value !== null);
  // With a verdict, only the checks that were graded: an ungraded estimate beside them reads like a score.
  const withRange = shown.filter((m) => m.inRange !== null);
  return { checks: withRange.length ? withRange : shown, graded };
}

export function present(p: AnalysisPayload, level: AnalysisLevel, focus: readonly FocusArea[] = []): ReportModel {
  const spec = categoryOf(p.requested_shot).presentation;
  const { checks: available, graded } = availableChecks(p);
  const inFocus = new Set(focus.flatMap((f) => spec.focusGroups[f] ?? []));
  const priority = new Set(graded ? p.priorities.map((f) => f.metricId) : []);
  const rankOf = (id: string) => {
    const i = spec.order.indexOf(id);
    return i < 0 ? spec.order.length : i;
  };
  const tier = (m: Metric) => {
    if (priority.has(m.id)) return 0;
    const out = m.inRange === false;
    if (inFocus.has(m.id)) return out ? 1 : 2;
    return out ? 3 : 4;
  };
  const sorted = [...available].sort((a, b) => tier(a) - tier(b) || rankOf(a.id) - rankOf(b.id) || a.id.localeCompare(b.id));
  const cap = level === "professional" ? Infinity : spec.levels[level][1];
  // Never cut a priority: if there were ever more priorities than the cap, they all stay.
  const keep = Math.max(Math.min(cap, sorted.length), sorted.filter((m) => priority.has(m.id)).length);
  const checks = sorted.slice(0, keep).map((metric) => ({ metric, because: (priority.has(metric.id) ? "priority" : inFocus.has(metric.id) ? "focus" : "level") as ShownBecause }));
  const measuredIds = new Set(available.map((m) => m.id));
  return {
    schema: "aline.report-model/1",
    version: PRESENTATION_VERSION,
    level,
    focus: [...focus],
    graded,
    checks,
    more: available.length - checks.length,
    unmeasuredFocus: focus.filter((f) => f !== "reference" && !(spec.focusGroups[f] ?? []).some((id) => measuredIds.has(id))),
  };
}
