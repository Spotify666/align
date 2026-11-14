// The first phone's decision when the second phone's result arrives: put the two clips
// together only when they are two different camera positions and the batter's movement lines
// up in both (the same ball). Otherwise they stay two separate reports, and the reason is said.
// Never paired silently. Pure, so it is tested on generated movement (`tests/pair.test.ts`).

import { angleFamily } from "@/engine/angles";
import { handsHeight, sameBallTwoVideos, shotTime } from "@/engine/same-ball";
import type { AnalysisPayload, CaptureObservation } from "@/engine/types";

export type PairOutcome = { together: true; movementR: number } | { together: false; why: string };

export function pairOutcome(own: { payload: AnalysisPayload; obs: CaptureObservation }, other: { payload: AnalysisPayload; obs: CaptureObservation }): PairOutcome {
  const fa = angleFamily(own.payload);
  const fb = angleFamily(other.payload);
  if (!fa || !fb) return { together: false, why: "Aline couldn't tell where one of the clips was filmed from. Both are kept as separate reports." };
  if (fa === fb) return { together: false, why: "Both clips were filmed from the same place. Both are kept as separate reports." };
  const sa = shotTime(own.payload, own.obs);
  const sb = shotTime(other.payload, other.obs);
  if (sa === null || sb === null) return { together: false, why: "One of the clips has no shot moment to line them up by. Both are kept as separate reports." };
  const check = sameBallTwoVideos({ a: null, b: null }, { a: handsHeight(own.obs), b: handsHeight(other.obs) }, sa, sb);
  if (check.verdict === "same" && check.movement) return { together: true, movementR: check.movement.r };
  return { together: false, why: "The batter's movement doesn't line up in the two clips, so they may be different balls. Both are kept as separate reports." };
}
