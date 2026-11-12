// Checking a shot without saying which one first.
//
// Aline grades two shots. Asked nothing, it checks the recording as a front-foot defence, as it
// always has. When that result itself points to the other shot ("this looks like a back-foot
// defence", or the shot is named one), the same tracks are checked as that shot, by its own
// gate. This is the report's "Check as back-foot defence" button pressed for the batter: no new
// rule, no threshold, and never more than the two analyses Aline already runs.
//
// A result that is accepted when asked is never changed by this; a shot neither analysis
// accepts is still not accepted.

import { analyze, type AnalyzeOptions } from "./analyze";
import { TARGET_SHOTS, type AnalysisPayload, type CaptureObservation, type TargetShot } from "./types";

const asked = (p: AnalysisPayload): TargetShot => p.requested_shot ?? "front_foot_defence";

/** The other shot Aline grades that this result itself points to, or null. */
export function pointsTo(p: AnalysisPayload): TargetShot | null {
  const shot = asked(p);
  // A front-foot analysis that saw the back-foot defence's whole definition.
  if (shot === "front_foot_defence" && p.status_reason === "looks_back_foot") return "back_foot_defence";
  // The shot was named as the other one Aline grades.
  const seen = p.observed_shot?.label;
  if (p.analysis_status === "invalid_for_requested_analysis" && seen && seen !== shot && (TARGET_SHOTS as readonly string[]).includes(seen)) return seen as TargetShot;
  return null;
}

/** The observation asked as one shot (the front-foot defence is the engine's unmarked default). */
export function askedAs(obs: CaptureObservation, target: TargetShot): CaptureObservation {
  const { target: _was, ...rest } = obs;
  void _was;
  return target === "front_foot_defence" ? rest : { ...rest, target };
}

export interface Unchosen {
  payload: AnalysisPayload;
  /** The observation as it was analysed (it carries the shot the result is for). */
  obs: CaptureObservation;
  /** True when the first analysis pointed to the other shot and that analysis is the one shown. */
  handedOff: boolean;
}

/**
 * Analyse a recording whose shot the batter didn't choose. The front-foot analysis is shown
 * unless it points to the other shot; then that shot's analysis is, unless it only points back
 * (each calls it the other: the first answer stands, and the report still offers the switch).
 */
export function analyzeUnchosen(obs: CaptureObservation, opts: AnalyzeOptions): Unchosen {
  const first = askedAs(obs, "front_foot_defence");
  const payload = analyze(first, opts);
  const to = pointsTo(payload);
  if (!to) return { payload, obs: first, handedOff: false };
  const second = askedAs(obs, to);
  const other = analyze(second, opts);
  if (other.analysis_status !== "valid" && pointsTo(other)) return { payload, obs: first, handedOff: false };
  return { payload: other, obs: second, handedOff: true };
}
