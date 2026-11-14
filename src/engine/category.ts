// Category specs: everything that is particular to one supported action, declared in one
// place and versioned. The generic pipeline (capture gate → scene → events → identity → grading)
// reads a spec; it holds no shot-specific wording or policy tables of its own.
//
// What a spec is NOT: a place for clip-specific numbers. Thresholds stay in registry.ts (named,
// hashed, published); a spec only names the ones its gates read, so a reader can see which
// numbers decide acceptance for the category.
//
// Adding a category means adding a spec (and its measurement module), not editing the pipeline.

import { BFD_METRICS, BFD_METRIC_VERSION } from "./backfoot-defs";
import { METRICS, METRIC_VERSION, type MetricDefinition, type ThresholdId } from "./registry";
import type { SemanticJoint } from "./scene";
import type { CameraView, EventType, TargetShot } from "./types";

export const CATEGORY_SCHEMA = "aline.category/1" as const;

/** What the camera and trackers can supply. */
export type Signal = "body" | "bat" | "ball" | "pitch_scale" | "depth" | "user_mark";

/**
 * Open-set outcomes of action identification. Grading happens only on "accepted".
 * - accepted: the requested category, confirmed with sufficient evidence.
 * - recognised_other_supported: another category Aline grades; offered, never graded here.
 * - recognised_unsupported: a named action Aline does not grade.
 * - unknown_action: the movement matches no known action, or its definition was not met.
 * - ambiguous: the evidence fits more than one action.
 * - insufficient_evidence: the deciding evidence was not visible.
 * - capture_failed: the recording itself cannot be analysed.
 */
export const ACTION_OUTCOMES = [
  "accepted",
  "recognised_other_supported",
  "recognised_unsupported",
  "unknown_action",
  "ambiguous",
  "insufficient_evidence",
  "capture_failed",
] as const;
export type ActionOutcome = (typeof ACTION_OUTCOMES)[number];

/** How far a camera position supports a category. */
export type ViewSupport = "graded" | "partial" | "position_only" | "unsupported";

export interface PhaseSpec {
  event: EventType;
  label: string;
  /** Needed for the category's verdict; an optional phase may be missing without a warning. */
  required: boolean;
  /** Signals that detect it directly, and those it can be inferred from when they are missing. */
  primary: Signal[];
  fallback: Signal[];
  /** Body parts whose visibility around the moment bounds how well it can be placed. */
  joints: SemanticJoint[];
  /** Half-width (s) of the stretch of movement the detector reads to place it. */
  windowS: number;
  /** Said when the phase is not found. */
  unavailable: string;
}

export interface AbstentionRule {
  outcome: ActionOutcome;
  /** Why, completing "We can't confirm a <shot>: …". */
  text: string;
  /** What to do differently next time. */
  recapture?: string;
}

/** The parts of a shot a batter can ask a report to lead with (the check screen's focus areas). */
export const FOCUS_AREA_IDS = ["alignment", "footwork", "balance", "bat_contact", "hands", "timing", "outcome", "reference"] as const;
export type FocusArea = (typeof FOCUS_AREA_IDS)[number];

/**
 * How a category's report is presented (read by `present.ts`, never by the analysis): which
 * measures belong to each focus area, the order of importance the levels draw from, and how
 * many checks each level shows. Presentation only: no measure, range or verdict depends on it.
 */
export interface PresentationSpec {
  /** The measures each focus area is about. "reference" is the Comparison section, not a measure. */
  focusGroups: Record<FocusArea, string[]>;
  /** Most important first; the levels take from the top. Measures not listed come last. */
  order: string[];
  /** Checks shown at each level, as [fewest worth showing, most]. Professional shows every one. */
  levels: { beginner: readonly [number, number]; amateur: readonly [number, number] };
}

export interface CategorySpec {
  schema: typeof CATEGORY_SCHEMA;
  id: TargetShot;
  /** Bumped whenever phases, policies or wording change. */
  version: string;
  /** In a sentence ("front-foot defence"). */
  name: string;
  views: Record<CameraView, { support: ViewSupport; note: string }>;
  signals: { required: Signal[]; optional: Signal[] };
  /** In the order they happen. */
  phases: PhaseSpec[];
  /** What must come before what ([earlier, later]). Other pairs have no fixed order (a late plant is a fault to measure, not an error). */
  order: Array<[EventType, EventType]>;
  /** Event pairs that may legitimately fall on one frame, and why. */
  mayCoincide: Array<{ a: EventType; b: EventType; why: string }>;
  metricVersion: string;
  /** Measures with their prerequisites (`requires`) and ranges. */
  metrics: MetricDefinition[];
  acceptance: {
    summary: string;
    /** The registry thresholds the acceptance and rejection gates read. */
    thresholds: ThresholdId[];
  };
  /** status_reason → what kind of non-result it is, why, and what to do. */
  abstention: Record<string, AbstentionRule>;
  grading: { summary: string };
  /** Shown with every report of this category until real validation exists. */
  limitations: string[];
  /** How its report is presented at each analysis level and focus. */
  presentation: PresentationSpec;
}

/** The counts the plan set for the levels (docs/13, section 14): 5–7 checks, 10–14, then all. */
const LEVEL_COUNTS = { beginner: [5, 7], amateur: [10, 14] } as const;

const BODY_PHASE_JOINTS: SemanticJoint[] = ["front_ankle", "back_ankle"];
const HANDS: SemanticJoint[] = ["front_wrist", "back_wrist"];

const COMMON_PHASES = {
  trigger: {
    event: "trigger",
    label: "Trigger",
    required: false,
    primary: ["body"],
    fallback: [],
    joints: BODY_PHASE_JOINTS,
    windowS: 0.1,
    unavailable: "No first movement of the feet was found before the stroke.",
  },
  backswing_top: {
    event: "backswing_top",
    label: "Top",
    required: false,
    primary: ["bat"],
    fallback: ["body"],
    joints: HANDS,
    windowS: 0.12,
    unavailable: "The top of the backswing wasn't found: the hands or the bat weren't seen before contact.",
  },
  bounce: {
    event: "bounce",
    label: "Bounce",
    required: false,
    primary: ["ball"],
    fallback: ["user_mark"],
    joints: [],
    windowS: 0.05,
    unavailable: "The ball wasn't tracked, so where it bounced isn't known. Tap the ball on a few frames to add it.",
  },
  contact: {
    event: "contact",
    label: "Contact",
    required: true,
    primary: ["bat", "ball"],
    fallback: ["body", "user_mark"],
    joints: ["head", "front_hip", "back_hip", "front_knee", "front_ankle"],
    windowS: 0.15,
    unavailable: "The moment the bat meets the ball wasn't found.",
  },
  follow_through: {
    event: "follow_through",
    label: "Follow",
    required: false,
    primary: ["bat"],
    fallback: ["body"],
    joints: HANDS,
    windowS: 0.2,
    unavailable: "No follow-through was found: the clip ends at or just after contact.",
  },
} satisfies Record<string, PhaseSpec>;

/** Reasons either category can give; a spec may override any of them. */
const COMMON_ABSTENTION: Record<string, AbstentionRule> = {
  no_stroke: { outcome: "unknown_action", text: "no batting stroke was found in the clip" },
  camera_zoom: {
    outcome: "insufficient_evidence",
    text: "the camera zoomed in during the stroke, and a zoom makes a stride and a follow-through look like a drive",
    recapture: "Use footage from a fixed camera (a phone on a tripod) that doesn't zoom during the shot.",
  },
  contact_hidden: {
    outcome: "insufficient_evidence",
    text: "the moment the bat meets the ball is hidden, so the shot can't be decided",
    recapture: "Keep the batter, bat and ball in view through the moment of contact.",
  },
  body_hidden: {
    outcome: "insufficient_evidence",
    text: "Aline didn't find the bat and ball on its own, so the shot is read from the body, and the hands or legs are hidden for too much of the stroke",
    recapture: "Tap the ball and the bat on a few frames (Add ball and bat), or film side-on at hip height so the hands and front leg stay visible throughout.",
  },
  body_inconclusive: {
    outcome: "ambiguous",
    text: "Aline didn't find the bat and ball on its own, and the body movement alone fits more than one shot",
    recapture: "Tap the ball and the bat on a few frames (Add ball and bat), or film side-on at hip height so the hands and front leg stay visible throughout.",
  },
  ball_missing: {
    outcome: "insufficient_evidence",
    text: "the ball isn't visible, so the delivery can't be confirmed",
    recapture: "Keep the bounce area and the ball's path to the bat in frame.",
  },
  bat_missing: {
    outcome: "insufficient_evidence",
    text: "the bat isn't tracked, so a defence can't be separated from a drive",
    recapture: "Keep the whole bat in view, or mark the bat handle and toe on three frames.",
  },
  insufficient_evidence: {
    outcome: "insufficient_evidence",
    text: "too few deciding signals were visible",
    recapture: "Film side-on at hip height with nobody between the camera and the batter.",
  },
  out_of_distribution: { outcome: "unknown_action", text: "the movement doesn't match any supported shot closely" },
  ambiguous: {
    outcome: "ambiguous",
    text: "the evidence fits more than one shot",
    recapture: "Film side-on at hip height with nobody between the camera and the batter.",
  },
  photo_only: { outcome: "insufficient_evidence", text: "a photo can't show shot type, timing, bat or ball" },
};

const PROTOTYPE_LIMITATIONS = [
  "Prototype: shot identification is a transparent rule model, not yet calibrated on labelled cricket clips.",
  "Ranges are provisional coaching ranges, not norms fitted to measured players.",
  "Event timing uncertainty is a stated heuristic (frame rate, visibility, detection method), not yet checked against hand-labelled frames.",
];

export const FRONT_FOOT_DEFENCE: CategorySpec = {
  schema: CATEGORY_SCHEMA,
  id: "front_foot_defence",
  version: "ffd-spec-1.0.0",
  name: "front-foot defence",
  views: {
    side_on: { support: "graded", note: "Every measure: the line is read along the pitch." },
    front_on: { support: "partial", note: "The line is read sideways; forward distances come from a 3D estimate and are shown, not graded." },
    behind: { support: "partial", note: "As from the bowler's end: sideways measures graded, forward ones not." },
    oblique: { support: "position_only", note: "From an angle only the checks that survive the angle are made." },
    unknown: { support: "unsupported", note: "The camera position couldn't be told." },
  },
  signals: { required: ["body"], optional: ["bat", "ball", "pitch_scale", "depth", "user_mark"] },
  phases: [
    COMMON_PHASES.trigger,
    COMMON_PHASES.backswing_top,
    COMMON_PHASES.bounce,
    {
      event: "front_foot_plant",
      label: "Plant",
      required: true,
      primary: ["body"],
      fallback: [],
      joints: ["front_ankle", "front_foot"],
      windowS: 0.1,
      unavailable: "The front foot landing wasn't found: no forward stride was seen, or the front foot was hidden.",
    },
    COMMON_PHASES.contact,
    COMMON_PHASES.follow_through,
  ],
  order: [
    ["trigger", "front_foot_plant"],
    ["trigger", "contact"],
    ["backswing_top", "contact"],
    ["bounce", "contact"],
    ["contact", "follow_through"],
  ],
  mayCoincide: [
    { a: "front_foot_plant", b: "contact", why: "In a late defence the front foot lands as the bat meets the ball." },
    { a: "backswing_top", b: "trigger", why: "A short backlift can peak as the feet first move." },
    { a: "contact", b: "follow_through", why: "A defence stops at the ball: there is little or no follow-through to find." },
  ],
  metricVersion: METRIC_VERSION,
  metrics: METRICS,
  acceptance: {
    summary:
      "Accepted on body, bat and ball together, or on the body alone against a higher bar; a different shot is named only when one alternative carries most of the evidence and contact was seen. Otherwise it is not confirmed.",
    thresholds: [
      "ffd.accept.min_probability",
      "ffd.accept.min_margin",
      "ffd.accept.max_unknown",
      "ffd.accept.min_evidence_coverage",
      "ffd.accept_body.min_probability",
      "ffd.accept_body.min_margin",
      "ffd.accept_body.min_coverage",
      "ffd.accept_body.min_contact_visibility",
      "ffd.reject.max_probability",
      "ffd.reject.min_alternative",
      "ffd.reject.min_evidence_coverage",
      "ffd.min_head_drop",
      "ffd.min_hip_drop",
      "stroke.max_zoom_for_rejection",
    ],
  },
  abstention: {
    ...COMMON_ABSTENTION,
    no_lowering: {
      outcome: "unknown_action",
      text: "the batter's head and hips didn't go forward and down into the ball, as they do in a defence, in this part of the clip",
      recapture: "Record the whole stroke: from the stance until after the bat meets the ball.",
    },
    looks_back_foot: {
      outcome: "recognised_other_supported",
      text: "this looks like a back-foot defence (the batter went back, stayed tall and the front foot didn't stride), so analyse it as a back-foot defence",
    },
  },
  grading: { summary: "Each measure against its provisional range; the technique index is secondary and only for an accepted defence." },
  limitations: PROTOTYPE_LIMITATIONS,
  presentation: {
    focusGroups: {
      alignment: ["line_head", "line_shoulder", "line_knee", "line_held", "trunk_inclination", "head_speed_contact"],
      footwork: ["stride_length", "foot_spread", "front_knee_flexion", "back_knee_extension"],
      balance: ["weight_forward", "balance_over_feet", "trunk_inclination", "head_speed_contact"],
      bat_contact: ["bat_angle_contact", "contact_ahead_of_knee", "bat_pad_gap", "bat_speed_contact", "hands_ahead_of_knee"],
      hands: ["hands_ahead_of_knee", "bat_pad_gap", "bat_angle_contact"],
      timing: ["sync_spread", "set_late", "decision_timing", "pelvis_thorax_separation"],
      outcome: ["ball_exit_speed", "repeatability"],
      reference: [],
    },
    // The line first (the shot's definition), then how it was built, then the bat.
    order: [
      "line_head",
      "line_shoulder",
      "line_knee",
      "line_held",
      "sync_spread",
      "stride_length",
      "front_knee_flexion",
      "weight_forward",
      "trunk_inclination",
      "hands_ahead_of_knee",
      "bat_angle_contact",
      "balance_over_feet",
      "foot_spread",
      "back_knee_extension",
      "head_speed_contact",
      "set_late",
      "contact_ahead_of_knee",
      "bat_pad_gap",
      "decision_timing",
      "pelvis_thorax_separation",
      "bat_speed_contact",
      "ball_exit_speed",
      "repeatability",
    ],
    levels: LEVEL_COUNTS,
  },
};

export const BACK_FOOT_DEFENCE: CategorySpec = {
  schema: CATEGORY_SCHEMA,
  id: "back_foot_defence",
  version: "bfd-spec-1.0.0",
  name: "back-foot defence",
  views: {
    side_on: { support: "graded", note: "Every measure, including how far the back foot went back." },
    front_on: { support: "partial", note: "Sideways measures; the step back runs toward the camera and isn't measured." },
    behind: { support: "partial", note: "As from the bowler's end." },
    oblique: { support: "position_only", note: "From an angle only the checks that survive the angle are made." },
    unknown: { support: "unsupported", note: "The camera position couldn't be told." },
  },
  signals: { required: ["body"], optional: ["bat", "ball", "pitch_scale", "depth", "user_mark"] },
  phases: [
    COMMON_PHASES.trigger,
    COMMON_PHASES.backswing_top,
    COMMON_PHASES.bounce,
    {
      event: "back_foot_commit",
      label: "Back foot",
      required: true,
      primary: ["body"],
      fallback: [],
      joints: ["back_ankle", "back_foot"],
      windowS: 0.1,
      unavailable: "The back foot going back wasn't found: it didn't move toward the stumps, or it was hidden.",
    },
    COMMON_PHASES.contact,
    COMMON_PHASES.follow_through,
  ],
  order: [
    ["trigger", "contact"],
    ["back_foot_commit", "contact"],
    ["backswing_top", "contact"],
    ["bounce", "contact"],
    ["contact", "follow_through"],
  ],
  mayCoincide: [
    { a: "back_foot_commit", b: "trigger", why: "Going back is often the first movement." },
    { a: "contact", b: "follow_through", why: "A dead-bat block stops at the ball: there is little or no follow-through to find." },
  ],
  metricVersion: BFD_METRIC_VERSION,
  metrics: BFD_METRICS,
  acceptance: {
    summary:
      "Accepted when every part of the definition is seen and met on the body: no stride, went back, stayed tall, a defensive bat. A part not met, or not seen, is the reason it is not confirmed.",
    thresholds: [
      "bfd.formula.max_gap_end",
      "bfd.formula.min_gap_closed",
      "bfd.formula.min_hips_back",
      "bfd.formula.max_hip_drop",
      "bfd.formula.max_head_drop",
      "bfd.formula.max_follow",
      "bfd.formula.max_hands_sweep",
      "bfd.formula.max_shoulder_turn",
      "bfd.formula.max_ball_exit",
      "bfd.accept.min_probability",
      "bfd.accept.min_margin",
      "bfd.reject.max_probability",
      "stroke.max_zoom_for_rejection",
    ],
  },
  abstention: {
    ...COMMON_ABSTENTION,
    not_back: {
      outcome: "unknown_action",
      text: "no movement back toward the stumps was seen: the feet didn't close up and the weight didn't go back",
      recapture: "Record the whole stroke, from the stance until after the bat meets the ball, with both feet in view.",
    },
    stride: {
      outcome: "unknown_action",
      text: "the feet ended a stride apart along the pitch; a back-foot defence brings the front foot back beside the back foot",
    },
    not_tall: { outcome: "unknown_action", text: "the batter went down into the shot (hips or head well below the stance) instead of standing tall" },
    not_dead_bat: {
      outcome: "ambiguous",
      text: "the hands didn't stop at the ball in front of the body (they carried on, swept across, or the shoulders turned open), which an attacking stroke does; without the bat and ball the two can't be told apart",
      recapture: "Tap the ball and the bat on a few frames: where the ball goes after the bat tells a block from an attacking stroke.",
    },
    part_unseen: {
      outcome: "insufficient_evidence",
      text: "part of the movement couldn't be seen from this camera",
      recapture: "Record the whole stroke, from the stance until after the bat meets the ball, with both feet in view.",
    },
    bat_missing: {
      outcome: "insufficient_evidence",
      text: "the bat isn't tracked, so a block can't be separated from a pull or a cut",
      recapture: "Keep the whole bat in view, or mark the bat handle and toe on three frames.",
    },
    body_hidden: {
      ...COMMON_ABSTENTION.body_hidden!,
      recapture: "Tap the ball and the bat on a few frames (Add ball and bat), or film side-on at hip height so the hands and both feet stay visible throughout.",
    },
    body_inconclusive: {
      ...COMMON_ABSTENTION.body_inconclusive!,
      recapture: "Tap the ball and the bat on a few frames (Add ball and bat), or film side-on at hip height so the hands and both feet stay visible throughout.",
    },
  },
  grading: { summary: "Each measure against its coaching-geometry range; the technique index is secondary and only for an accepted defence." },
  limitations: PROTOTYPE_LIMITATIONS,
  presentation: {
    focusGroups: {
      alignment: ["bfd_head", "bfd_tall"],
      footwork: ["bfd_back_step", "bfd_feet_gap", "bfd_back_first"],
      balance: ["bfd_tall", "bfd_head_height", "bfd_feet_gap"],
      bat_contact: ["bfd_dead_bat", "bfd_elbow", "bfd_hands_eyes"],
      hands: ["bfd_elbow", "bfd_hands_eyes"],
      timing: ["bfd_back_first", "bfd_set_late"],
      outcome: [],
      reference: [],
    },
    // Back and tall first (the shot's definition), then the head, then the bat.
    order: ["bfd_back_step", "bfd_tall", "bfd_head", "bfd_head_height", "bfd_dead_bat", "bfd_elbow", "bfd_hands_eyes", "bfd_feet_gap", "bfd_back_first", "bfd_set_late"],
    levels: LEVEL_COUNTS,
  },
};

export const CATEGORIES: Record<TargetShot, CategorySpec> = {
  front_foot_defence: FRONT_FOOT_DEFENCE,
  back_foot_defence: BACK_FOOT_DEFENCE,
};

export const categoryOf = (target: TargetShot | undefined): CategorySpec => CATEGORIES[target ?? "front_foot_defence"];

/** Why a result wasn't confirmed, in the category's words. */
export const abstentionText = (spec: CategorySpec, reason: string): string => spec.abstention[reason]?.text ?? "the evidence is incomplete";

/** What to do differently, for this reason (none when the reason has no specific advice). */
export const abstentionRecapture = (spec: CategorySpec, reason: string): string[] => {
  const r = spec.abstention[reason]?.recapture;
  return r ? [r] : [];
};
