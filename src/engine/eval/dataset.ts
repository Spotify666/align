// The real-media dataset: a versioned manifest of labelled clips. The clips themselves are never
// committed (eval-media/ is ignored); the manifest holds an anonymised id, the file's hash and
// the labels, so anyone holding the same files can reproduce an evaluation exactly.
//
// Times are media time of the source file in ms (what a player shows), never analysed-frame
// numbers, so labels survive any change to how frames are sampled.

import { z } from "zod";
import { ACTION_OUTCOMES } from "../category";
import { SHOT_CLASSES, TARGET_SHOTS, type CaptureObservation } from "../types";

export const DATASET_SCHEMA = "aline.dataset/1" as const;

/** The moments labelled frame by frame. */
export const LABEL_EVENTS = ["trigger", "backswing_top", "bounce", "front_foot_plant", "back_foot_commit", "contact", "follow_through"] as const;
export type LabelEvent = (typeof LABEL_EVENTS)[number];

export const CAPTURE_ISSUES = ["blur", "shake", "zoom", "crop", "occlusion", "multiple_people", "low_light", "bat_hidden", "ball_hidden", "cut", "slow_motion", "variable_frame_rate"] as const;

const eventLabel = z.object({
  /** Media time of the moment (ms); null when it can't be seen in the clip. */
  ms: z.number().nonnegative().nullable(),
  /** Can a person see this moment in the clip? false: the engine must not claim to have seen it. */
  visible: z.boolean(),
  /** The labeller's own doubt (± ms), when the moment is blurred or between frames. */
  toleranceMs: z.number().nonnegative().optional(),
  note: z.string().max(200).optional(),
});

export const clipSchema = z
  .object({
    /** "clip_" + the first 12 hex digits of the file's SHA-256. Never a file name or a person's name. */
    id: z.string().regex(/^clip_[0-9a-f]{12}$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().positive(),
    ext: z.string().regex(/^\.[a-z0-9]{2,5}$/),
    /** Anonymised: "ath_01". The key for leave-one-athlete-out. */
    athlete: z.string().regex(/^ath_[a-z0-9]{1,12}$/),
    /** A device class, not a serial: "android_mid", "iphone_15", "broadcast". */
    device: z.string().regex(/^[a-z0-9_]{2,32}$/),
    view: z.enum(["side_on", "front_on", "behind", "oblique"]),
    fps: z.number().positive(),
    /** Media ms per real ms: 1 for normal clips, 8 for 240 fps saved as 30 fps playback. */
    timeScale: z.number().positive().default(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    lighting: z.enum(["outdoor_day", "outdoor_low", "indoor", "mixed"]),
    handedness: z.enum(["right", "left"]),
    /** What was actually played, by a person who watched it. */
    category: z.enum(["none", ...SHOT_CLASSES.filter((c) => c !== "unknown")]),
    /** What the batter would ask Aline to analyse it as. Recorded; never used as the answer. */
    intended: z.enum(TARGET_SHOTS),
    capture: z.object({ quality: z.enum(["good", "marginal", "unusable"]), issues: z.array(z.enum(CAPTURE_ISSUES)) }),
    /** Every outcome that counts as right for this clip (an abstention can be right on a poor capture). */
    expected: z.array(z.enum(ACTION_OUTCOMES)).min(1),
    events: z.partialRecord(z.enum(LABEL_EVENTS), eventLabel),
    labels: z.object({ by: z.string().regex(/^lab_[a-z0-9]{1,12}$/), revision: z.number().int().positive(), at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    note: z.string().max(300).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.id !== `clip_${c.sha256.slice(0, 12)}`) ctx.addIssue({ code: "custom", message: "id must be clip_ + the first 12 hex digits of sha256" });
    for (const [k, e] of Object.entries(c.events)) if (e && e.visible !== (e.ms !== null)) ctx.addIssue({ code: "custom", message: `${k}: visible needs a time, not visible needs none` });
    const accepted = c.expected.includes("accepted");
    if (accepted && c.category !== c.intended) ctx.addIssue({ code: "custom", message: "a clip of another shot can never expect 'accepted'" });
    if (c.capture.quality === "unusable" && accepted) ctx.addIssue({ code: "custom", message: "an unusable capture can't expect a grade" });
    const at = (k: LabelEvent) => c.events[k]?.ms ?? null;
    for (const [a, b] of [["trigger", "contact"], ["backswing_top", "contact"], ["bounce", "contact"], ["contact", "follow_through"]] as const)
      if (at(a) !== null && at(b) !== null && at(a)! > at(b)!) ctx.addIssue({ code: "custom", message: `${a} is labelled after ${b}` });
  });

export const manifestSchema = z
  .object({
    schema: z.literal(DATASET_SCHEMA),
    /** Bumped on every change to the clips or their labels: minor for new clips, patch for relabelling. */
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    clips: z.array(clipSchema),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    for (const c of m.clips) {
      if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: `duplicate clip ${c.id}` });
      ids.add(c.id);
    }
  });

export type DatasetClip = z.infer<typeof clipSchema>;
export type DatasetManifest = z.infer<typeof manifestSchema>;

/** Media time (ms) of an analysed frame of the observation made from a clip. */
export function sourceMs(obs: CaptureObservation, frame: number, timeScale = 1): number {
  return (obs.media.sourceStartMs ?? 0) + ((obs.t[frame] ?? 0) - (obs.t[0] ?? 0)) * timeScale;
}

/** The slices a clip belongs to, for per-slice reports. */
export function slicesOf(c: DatasetClip): string[] {
  const fps = c.fps / c.timeScale < 45 ? "≤30" : c.fps / c.timeScale < 90 ? "60" : c.fps / c.timeScale < 180 ? "120" : "240";
  return [`athlete:${c.athlete}`, `device:${c.device}`, `view:${c.view}`, `fps:${fps}`, `lighting:${c.lighting}`, `hand:${c.handedness}`, `capture:${c.capture.quality}`, `category:${c.category}`, `intended:${c.intended}`, ...c.capture.issues.map((i) => `issue:${i}`)];
}
