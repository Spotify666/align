// The moments of a shot a report shows side by side or prints: the top of the backlift, the
// foot landing, contact (a photo's one position). Each clip's own events place them, so two
// clips are matched by phase of the shot, not by time.

import type { AnalysisPayload, CaptureObservation, EventType } from "@/engine/types";

/** The moments printed, in order: the top of the backlift, the foot landing, contact. */
const MOMENTS: Array<{ types: EventType[]; name: string }> = [
  { types: ["backswing_top", "trigger"], name: "Backlift" },
  { types: ["front_foot_plant", "back_foot_commit"], name: "Foot down" },
  { types: ["contact"], name: "Contact" },
];

export interface Moment {
  name: string;
  frame: number;
  /** Seconds from the start of the clip. */
  at: number;
  contact: boolean;
}

export function momentsOf(p: AnalysisPayload, obs: CaptureObservation): Moment[] {
  if (p.mode === "posture_screen") return [{ name: "Your position", frame: p.line?.referenceFrame ?? 0, at: 0, contact: true }];
  const t0 = obs.t[0] ?? 0;
  const seen = new Set<number>();
  const out: Moment[] = [];
  for (const m of MOMENTS) {
    const e = m.types.map((t) => p.events.find((x) => x.type === t)).find(Boolean);
    if (!e || seen.has(e.frame)) continue;
    seen.add(e.frame);
    out.push({ name: m.name, frame: e.frame, at: ((obs.t[e.frame] ?? t0) - t0) / 1000, contact: e.type === "contact" });
  }
  return out;
}

