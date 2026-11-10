// Is the answer steady? Contact decides nearly everything (docs/12): every measure at contact,
// most classifier features and the verdict. This asks the engine itself whether its answer
// would be the same if Contact lay at either end of the timing it states for it. It changes no
// result: it says whether the one given is firm or borderline.

import { analyze, type AnalyzeOptions } from "./analyze";
import { detectEvents } from "./events";
import type { AnalysisResult } from "./result";
import type { AnalysisPayload, CaptureObservation } from "./types";

export type Detector = NonNullable<AnalyzeOptions["eventDetector"]>;

export interface ContactSensitivity {
  /** Graded / not graded is the same with Contact at both ends of its stated uncertainty. */
  holds: boolean;
  /** The ± it was moved by (s). */
  bandS: number;
}

const AT = { analysisId: "sensitivity", createdAt: "1970-01-01T00:00:00.000Z" };

export function contactSensitivity(obs: CaptureObservation, payload: AnalysisPayload, result: AnalysisResult, detector?: Detector): ContactSensitivity | null {
  const contact = result.events.find((e) => e.type === "contact");
  // Only where Contact is estimated. A contact that was seen (bat meeting ball) or marked by
  // hand is not going to be several frames out, and moving it off the real impact proves nothing.
  if (payload.mode !== "video" || payload.analysis_status === "capture_failed" || contact?.frame == null || !contact.uncertainty || contact.state !== "inferred") return null;
  const by = Math.max(1, Math.round(contact.uncertainty.frames));
  const graded = payload.analysis_status === "valid";
  const holds = [-by, by].every((d) => {
    const moved: Detector = (o, sc) => {
      const set = (detector ?? detectEvents)(o, sc);
      const c = set.byType.contact;
      if (!c) return set;
      const frame = Math.max(0, Math.min(sc.n - 1, c.frame + d));
      const next = { ...c, frame, tMs: Math.round(sc.t[frame] ?? c.tMs) };
      return { list: set.list.map((x) => (x.type === "contact" ? next : x)), byType: { ...set.byType, contact: next } };
    };
    return (analyze(obs, { ...AT, eventDetector: moved }).analysis_status === "valid") === graded;
  });
  return { holds, bandS: Math.round(((contact.uncertainty.ms ?? 0) / 1000) * 100) / 100 };
}
