// Event detectors the evaluation can run by name. "current" is the built-in one (events.ts).
// A candidate is added here, evaluated against "current" on the labelled real clips
// (scripts/eval/real.probe.ts, compare-reports.mjs), and only becomes the default when the gate
// in compareReports says accept. None has been added: no labelled real clips exist yet, and a
// detector is not to be tuned on generated movement alone (docs/12).
import type { Detector } from "./real";

export const DETECTORS: Record<"current", Detector | undefined> = {
  current: undefined,
};
