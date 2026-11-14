// Which measures a recording can give, before it is made: each measure's prerequisites
// (`requires` in the registry and `backfoot-defs.ts`) against the camera position, the kind of
// media and what is in the picture. The rules mirror the analysis (`computeMetrics`,
// `withholdAlongPitch`, `FRONTAL_UNGRADED`, `backFootMetrics`); `tests/availability.test.ts`
// checks them against real analyses in both directions.
//
// "graded" and "shown" mean the measure is taken when the body parts it rests on are seen:
// a recording can still miss one (a hidden knee, an unclear contact). "not_available" means
// this set-up never gives it.

import { BFD_FRONT_FORMULA, BFD_METRICS, BFD_POSITION_FORMULA } from "./backfoot-defs";
import { FRONTAL_METRICS, FRONTAL_UNGRADED, FRONTAL_WITHHELD } from "./frontal";
import { ALIGNMENT_IDS } from "./metrics";
import { METRICS, type MetricDefinition } from "./registry";
import type { CameraView, TargetShot } from "./types";

export interface CaptureConditions {
  media: "video" | "photo";
  view: CameraView;
  /** The bat tracked for most of the clip. */
  bat: boolean;
  /** The ball seen (and so the bounce). */
  ball: boolean;
  /** Frames per second (video). */
  fps: number;
  /** A scale in metres: the stumps marked, or the batter's height given. */
  scale: boolean;
  /** Depth from two calibrated phones (the 3D session tier). */
  depth?: boolean;
}

export type AvailabilityState = "graded" | "shown" | "not_available";

export interface Availability {
  id: string;
  name: string;
  state: AvailabilityState;
  /** Why it isn't graded here, in a sentence; null when it is. */
  why: string | null;
}

type Requirement = MetricDefinition["requires"][number];

const NEEDS: Record<Requirement, string> = {
  body: "the batter in view",
  bat: "the bat tracked",
  ball: "the ball in view",
  depth: "two calibrated phones (not available yet)",
  timing: "a video at 60 frames a second or more",
  scale: "the stumps marked or your height",
  contact: "the moment of contact",
  bounce: "the ball's bounce in view",
  baseline: "at least 6 earlier confirmed shots",
  side_view: "a side-on camera",
};

const along = (v: CameraView) => v === "front_on" || v === "behind";

function met(r: Requirement, c: CaptureConditions): boolean {
  switch (r) {
    case "body":
    case "contact":
      return true;
    case "bat":
      return c.bat;
    case "ball":
      return c.ball;
    case "bounce":
      return c.ball && c.media === "video";
    case "timing":
      return c.media === "video" && c.fps >= 60;
    case "scale":
      return c.scale;
    case "side_view":
      return !along(c.view);
    case "depth":
      return !!c.depth;
    case "baseline":
      return false;
  }
}

/** The prerequisites a set-up misses, without saying the bounce when the ball is already missing. */
const missingOf = (d: MetricDefinition, c: CaptureConditions) => {
  const miss = d.requires.filter((r) => !met(r, c));
  return miss.includes("ball") ? miss.filter((r) => r !== "bounce") : miss;
};

function fromRequires(d: MetricDefinition, c: CaptureConditions): Availability {
  if (d.only && d.only !== c.media) return { id: d.id, name: d.name, state: "not_available", why: d.only === "video" ? "Needs a video: a photo shows one moment." : "Read from a photo only." };
  const missing = missingOf(d, c);
  if (missing.length) return { id: d.id, name: d.name, state: "not_available", why: `Needs ${missing.map((r) => NEEDS[r]).join(" and ")}.` };
  return { id: d.id, name: d.name, state: "graded", why: null };
}

function frontFoot(c: CaptureConditions): Availability[] {
  const out = METRICS.map((d) => {
    const a = fromRequires(d, c);
    if (a.state !== "graded" || !along(c.view)) return a;
    // Along the pitch: forward distances and in-line angles rest on a 3D estimate.
    if (FRONTAL_WITHHELD.includes(d.id)) return { ...a, state: "not_available" as const, why: "Filmed along the pitch this runs toward the camera: needs a side-on camera." };
    if (FRONTAL_UNGRADED.includes(d.id) && d.range) return { ...a, state: "shown" as const, why: "From along the pitch it comes from a 3D estimate: shown, not graded." };
    if (d.requires.includes("body") && !ALIGNMENT_IDS.includes(d.id)) return { ...a, state: "shown" as const, why: "From along the pitch it comes from a 3D estimate." };
    return a;
  });
  // The bowler's-end view adds the measures only it sees.
  const frontal = FRONTAL_METRICS.map((d) =>
    along(c.view) && c.media === "video" ? fromRequires(d, c) : { id: d.id, name: d.name, state: "not_available" as const, why: "Needs a video from the bowler's end or behind." },
  );
  return [...out, ...frontal];
}

function backFoot(c: CaptureConditions): Availability[] {
  const sideways = along(c.view);
  const photoIds = sideways ? BFD_FRONT_FORMULA : BFD_POSITION_FORMULA;
  return BFD_METRICS.map((d) => {
    if (c.media === "photo" && !photoIds.includes(d.id))
      return { id: d.id, name: d.name, state: "not_available" as const, why: d.only === "video" ? "Needs a video: a photo shows one moment." : "Not read from a photo taken from here." };
    if (c.media === "video" && d.only === "photo") return { id: d.id, name: d.name, state: "not_available" as const, why: "Read from a photo only." };
    const missing = missingOf(d, c);
    if (missing.length) return { id: d.id, name: d.name, state: "not_available" as const, why: `Needs ${missing.map((r) => NEEDS[r]).join(" and ")}.` };
    return { id: d.id, name: d.name, state: "graded" as const, why: null };
  });
}

/** Every measure of a shot, and whether this set-up can give it. */
export function availability(shot: TargetShot, c: CaptureConditions): Availability[] {
  return shot === "back_foot_defence" ? backFoot(c) : frontFoot(c);
}

/** The set-ups the Science page compares. */
export const SETUPS: Array<{ id: string; label: string; conditions: CaptureConditions }> = [
  { id: "side_body", label: "Side-on video", conditions: { media: "video", view: "side_on", bat: false, ball: false, fps: 30, scale: true } },
  { id: "side_full", label: "Side-on, bat and ball, 60 fps", conditions: { media: "video", view: "side_on", bat: true, ball: true, fps: 60, scale: true } },
  { id: "end_body", label: "From the bowler's end", conditions: { media: "video", view: "front_on", bat: false, ball: false, fps: 30, scale: true } },
  { id: "side_photo", label: "Side-on photo", conditions: { media: "photo", view: "side_on", bat: false, ball: false, fps: 0, scale: true } },
];
