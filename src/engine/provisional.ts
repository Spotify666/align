// Measures that are specified but not taken. Each is written down in full so it can be
// reviewed, and stays off until it has labelled real examples and a coach's review: nothing
// here is read by the analysis, and no number here is a threshold (those live in the registry
// once a measure is enabled). `tests/provisional.test.ts` holds it off.

import type { SemanticJoint } from "./scene";
import type { EventType } from "./types";

export interface ProvisionalMeasure {
  id: string;
  name: string;
  /** Off until validated. Turning it on means moving it into the registry, with its range. */
  enabled: false;
  /** Why a coach would want it, stated as a hypothesis to check, not a finding. */
  rationale: string;
  /** The stretch of the shot it reads, between two events. */
  phases: [EventType, EventType];
  landmarks: SemanticJoint[];
  /** Camera positions it could be read from. */
  views: Array<"side_on" | "front_on" | "behind">;
  /** What it needs from the recording. */
  needs: string[];
  /** How it would be computed. */
  formula: string;
  /** Where its error would come from, and how it would be stated. */
  uncertainty: string;
  /** What has to happen before it is turned on. */
  toEnable: string[];
}

export const PROVISIONAL_MEASURES: ProvisionalMeasure[] = [
  {
    id: "wrist_elbow_sync",
    name: "Wrist and elbow together",
    enabled: false,
    rationale:
      "In a defence the hands should arrive at the ball soft and under the eyes, the top-hand elbow leading and the wrists following, not flicking through on their own. If the front wrist settles well after the front elbow, the bat is still moving at contact (hard hands). Hypothesis to be checked by a coach on labelled clips.",
    phases: ["backswing_top", "contact"],
    landmarks: ["front_elbow", "front_wrist"],
    views: ["side_on"],
    needs: ["a side-on video at 60 frames a second or more", "the front elbow and wrist seen (confidence 0.5 or more) through the downswing"],
    formula:
      "From the top of the backlift to contact, each joint's speed in body heights per second (smoothed over 3 frames). Each settles when its speed first stays under a fraction of its own peak for 80 ms. The measure is the wrist's settling time minus the elbow's, in seconds: near zero or negative is together (elbow first); a large positive value is the wrist late.",
    uncertainty:
      "One frame of each settling time, plus the stretch in which either joint was hidden; the same clip read at half its frame rate gives the stability check used for the events (docs/12). Stated in seconds, never milliseconds on report screens.",
    toEnable: [
      "Labelled real clips (at least 20, from 3 or more batters, side-on, 60 fps or more) with the settling frames marked by hand.",
      "A coach's review of the rationale and of a proposed range from those clips.",
      "Its fraction and range added to the registry (a new REGISTRY_HASH and its migration), and the metamorphic gate passing.",
    ],
  },
];
