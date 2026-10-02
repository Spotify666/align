// Every threshold, range, weight and model version the engine uses lives here.
// Values are PROVISIONAL: authored for a prototype and not yet fitted to labelled
// cricket data. The registry hash is written into every analysis payload so a
// report can always be traced to the exact rule set that produced it.

import { canonicalJson, sha256 } from "./math";
import { FRONTAL_METRICS } from "./frontal";

export const ENGINE_VERSION = "0.4.2";
export const METRIC_VERSION = "ffd-0.4.0";
export const CLASSIFIER_VERSION = "prototype-bands-0.4.0";
export const POSE_MODEL = "mediapipe-pose_landmarker_full-float16-v1";

export interface Threshold {
  value: number;
  unit: string;
  rationale: string;
}

export const THRESHOLDS = {
  // Capture quality gate
  "capture.min_short_side_px": { value: 480, unit: "px", rationale: "Below this, wrists and feet occupy too few pixels to localise." },
  "capture.fail_short_side_px": { value: 320, unit: "px", rationale: "Too small for any reliable joint estimate." },
  "capture.min_fps_timing": { value: 60, unit: "fps", rationale: "At 60 fps one frame is ~17 ms; below that contact and timing windows are coarser than the movements they describe." },
  "capture.min_fps_any": { value: 24, unit: "fps", rationale: "Below 24 fps a bat swing spans only a few frames." },
  "capture.min_duration_ms": { value: 1200, unit: "ms", rationale: "Needs setup, delivery and follow-through in one clip." },
  "capture.min_body_coverage": { value: 0.85, unit: "fraction", rationale: "Batter must be visible in most frames." },
  "capture.fail_body_coverage": { value: 0.5, unit: "fraction", rationale: "Batter missing from half the clip." },
  "capture.min_brightness": { value: 0.18, unit: "luma", rationale: "Dark footage raises pose noise." },
  "capture.max_brightness": { value: 0.9, unit: "luma", rationale: "Blown highlights hide the ball and bat edges." },
  "capture.min_contrast": { value: 0.08, unit: "luma sd", rationale: "Flat images hide limb edges." },
  "capture.min_sharpness": { value: 0.012, unit: "laplacian var", rationale: "Motion blur prevents bat and ball tracking." },
  "capture.max_background_motion": { value: 0.06, unit: "fraction", rationale: "Hand-held shake corrupts displacement measures." },

  // Tracking
  "tracking.joint_min_conf": { value: 0.5, unit: "confidence", rationale: "Landmarks below this are treated as unobserved." },
  "tracking.bat_min_coverage": { value: 0.5, unit: "fraction", rationale: "Bat path needs most of the swing." },
  "tracking.ball_min_points": { value: 4, unit: "frames", rationale: "Fewer points cannot fix a trajectory." },

  // Delivery context (pace-oriented; spin needs separate bands)
  "delivery.full_good_boundary_m": { value: 5.5, unit: "m from batter's stumps", rationale: "Provisional pace boundary; refit per bowler type." },
  "delivery.good_short_boundary_m": { value: 8.0, unit: "m from batter's stumps", rationale: "Provisional pace boundary; refit per bowler type." },
  "delivery.boundary_softness_m": { value: 0.9, unit: "m", rationale: "Soft membership avoids hard cliffs at a boundary." },
  "delivery.short_height_rel": { value: 0.62, unit: "stature", rationale: "Ball arriving above ~waist-to-chest height suggests short length." },

  // Classification and acceptance
  "classifier.unknown_log_likelihood": { value: -5.5, unit: "log-lik", rationale: "If no prototype fits better than this, the clip is out of distribution." },
  "classifier.temperature": { value: 1.4, unit: "", rationale: "Softens prototype scores; NOT an empirical calibration." },
  "ffd.accept.min_probability": { value: 0.8, unit: "probability", rationale: "Acceptance is deliberately strict; false acceptance is release-blocking." },
  "ffd.accept.min_margin": { value: 0.3, unit: "probability", rationale: "Top class must clearly beat the runner-up." },
  "ffd.accept.max_unknown": { value: 0.1, unit: "probability", rationale: "Out-of-distribution mass must be small." },
  "ffd.accept.min_evidence_coverage": { value: 0.75, unit: "fraction", rationale: "Most discriminative features must be observed." },
  "stroke.min_hand_speed": { value: 0.6, unit: "× stature/s", rationale: "Below this peak hand speed, and without a front-foot stride, no batting stroke was played (a still pose, someone standing in shot)." },
  "stroke.min_stride": { value: 0.12, unit: "× stature", rationale: "A front-foot movement this large counts as a stroke even when the hands are hidden." },
  "ffd.accept_body.min_probability": { value: 0.8, unit: "probability", rationale: "Bat or ball not seen: the same probability bar as full evidence, plus a wider margin, near-complete body evidence and a fully visible contact." },
  "ffd.accept_body.min_margin": { value: 0.5, unit: "probability", rationale: "Without the bat, a defence must beat the drive and every other shot by a wide margin (full evidence: 0.3)." },
  "ffd.accept_body.min_coverage": { value: 0.85, unit: "fraction", rationale: "Nearly every body and hand signal that this camera position can show must be observed." },
  "ffd.accept_body.min_contact_visibility": { value: 0.7, unit: "fraction", rationale: "A shot is decided at contact: through ±150 ms of it the stroke must be seen in this share of frames (read from the body alone: head, hips, front knee and front ankle; with bat and ball tracked: the body or the whole bat), or no verdict is given either way." },
  "ffd.reject.max_probability": { value: 0.12, unit: "probability", rationale: "Below this, the clip is confidently not a front-foot defence." },
  "ffd.reject.min_alternative": { value: 0.5, unit: "probability", rationale: "A different shot is reported only when one alternative (a shot, or a family of related shots) holds at least half the probability; probability spread over unrelated shots means the movement fits none of them: uncertain." },
  "ffd.reject.min_evidence_coverage": { value: 0.45, unit: "fraction", rationale: "Rejection may rest on fewer modalities than acceptance." },
  "ffd.named_label.min_probability": { value: 0.55, unit: "probability", rationale: "Name the alternative shot only when it clearly leads." },

  // Composite index
  "index.min_domains": { value: 5, unit: "domains", rationale: "A composite needs most domains measured." },

  // Baseline
  "baseline.min_deliveries": { value: 6, unit: "valid deliveries", rationale: "Fewer than six cannot describe a personal distribution." },
} as const satisfies Record<string, Threshold>;

export type ThresholdId = keyof typeof THRESHOLDS;
export const th = (id: ThresholdId): number => THRESHOLDS[id].value;

const PROVISIONAL = "Align provisional coaching range v0.1 (coach-authored, not yet validated)";
const ADULT = "Adult club-level batters, medium pace, side-on capture";

export interface MetricDefinition {
  id: string;
  name: string;
  domain: "setup" | "footwork" | "head_trunk" | "sequence" | "bat_contact" | "outcome";
  unit: string;
  decimals: number;
  phase: string;
  meaning: string;
  relevance: string;
  range: { lo: number; hi: number } | null;
  /** "side_view": needs the forward axis in the image plane (side-on camera). */
  requires: Array<"body" | "bat" | "ball" | "depth" | "timing" | "scale" | "contact" | "bounce" | "baseline" | "side_view">;
  /** Weight in the secondary technique index, 0 = excluded. */
  weight: number;
  /** "lower is better" style hint used only for wording. */
  direction: "band" | "lower" | "higher";
}

export const METRICS: MetricDefinition[] = [
  {
    id: "decision_timing",
    name: "Decision timing",
    domain: "setup",
    unit: "ms",
    decimals: 0,
    phase: "Bounce",
    meaning: "When the front foot starts moving, relative to the ball's bounce. Negative means before bounce.",
    relevance: "Early commitment gives time to get the head and front foot to the line of the ball.",
    range: { lo: -260, hi: 40 },
    requires: ["body", "ball", "bounce", "timing"],
    weight: 1,
    direction: "band",
  },
  {
    id: "stride_length",
    name: "Front-foot stride",
    domain: "footwork",
    unit: "× stature",
    decimals: 2,
    phase: "Front-foot plant",
    meaning: "How far the front foot travels toward the bowler, as a fraction of standing height.",
    relevance: "Reaching toward the pitch of the ball smothers movement off the surface.",
    range: { lo: 0.3, hi: 0.46 },
    requires: ["body"],
    weight: 1.2,
    direction: "band",
  },
  {
    id: "front_knee_flexion",
    name: "Front-knee angle",
    domain: "footwork",
    unit: "°",
    decimals: 0,
    phase: "Contact",
    meaning: "Interior angle at the front knee (180° = straight leg).",
    relevance: "A flexed front knee lets the head travel forward and down over the ball.",
    range: { lo: 118, hi: 152 },
    requires: ["body", "contact"],
    weight: 1,
    direction: "band",
  },
  {
    id: "weight_forward",
    name: "Weight over front foot",
    domain: "footwork",
    unit: "0–1",
    decimals: 2,
    phase: "Contact",
    meaning: "Where the estimated centre of mass sits between back foot (0) and front foot (1).",
    relevance: "Weight forward keeps the bat and head over the ball rather than falling back.",
    range: { lo: 0.55, hi: 0.9 },
    requires: ["body", "contact"],
    weight: 1,
    direction: "band",
  },
  {
    id: "head_knee_offset",
    name: "Head over front knee",
    domain: "head_trunk",
    unit: "× stature",
    decimals: 2,
    phase: "Contact",
    meaning: "Forward distance of the head relative to the front knee. Positive = head ahead of knee.",
    relevance: "Head level with or slightly ahead of the front knee keeps the bat face over the ball.",
    range: { lo: -0.03, hi: 0.09 },
    requires: ["body", "contact"],
    weight: 1.3,
    direction: "band",
  },
  {
    id: "head_speed_contact",
    name: "Head stillness at contact",
    domain: "head_trunk",
    unit: "× stature/s",
    decimals: 2,
    phase: "±100 ms around contact",
    meaning: "Net head travel across the 200 ms around contact, as speed. Lower is stiller.",
    relevance: "A still head improves judgement of line and bounce at the moment of contact.",
    range: { lo: 0, hi: 0.32 },
    requires: ["body", "contact", "timing"],
    weight: 1.2,
    direction: "lower",
  },
  {
    id: "trunk_inclination",
    name: "Forward trunk lean",
    domain: "head_trunk",
    unit: "°",
    decimals: 0,
    phase: "Contact",
    meaning: "Angle of the hip-to-shoulder line from vertical, leaning toward the bowler.",
    relevance: "A moderate lean keeps the head forward without collapsing the base.",
    range: { lo: 12, hi: 38 },
    requires: ["body", "contact"],
    weight: 0.8,
    direction: "band",
  },
  {
    id: "pelvis_thorax_separation",
    name: "Pelvis–thorax separation",
    domain: "sequence",
    unit: "°",
    decimals: 0,
    phase: "Downswing",
    meaning: "Peak rotation difference between hip and shoulder axes.",
    relevance: "Large separation suggests an attacking, rotational stroke rather than a block.",
    range: { lo: 0, hi: 20 },
    requires: ["body", "depth"],
    weight: 0.6,
    direction: "lower",
  },
  {
    id: "bat_angle_contact",
    name: "Bat angle at contact",
    domain: "bat_contact",
    unit: "° from vertical",
    decimals: 0,
    phase: "Contact",
    meaning: "How far the bat is tilted from vertical when it meets the ball.",
    relevance: "A near-vertical bat presents the full face to a full or good-length ball.",
    range: { lo: 0, hi: 24 },
    requires: ["bat", "contact"],
    weight: 1.2,
    direction: "lower",
  },
  {
    id: "contact_ahead_of_knee",
    name: "Contact point vs front knee",
    domain: "bat_contact",
    unit: "× stature",
    decimals: 2,
    phase: "Contact",
    meaning: "Forward distance of the contact point from the front knee. Negative = beside or behind the pad.",
    relevance: "Meeting the ball beside or just ahead of the front pad keeps it under the eyes.",
    range: { lo: -0.06, hi: 0.1 },
    requires: ["body", "bat", "contact", "side_view"],
    weight: 1,
    direction: "band",
  },
  {
    id: "bat_speed_contact",
    name: "Bat speed at contact",
    domain: "bat_contact",
    unit: "m/s",
    decimals: 1,
    phase: "Contact",
    meaning: "Speed of the bat's sweet-spot region at contact.",
    relevance: "A defence absorbs the ball; high bat speed suggests a drive or pushed defence.",
    range: { lo: 0, hi: 6 },
    requires: ["bat", "contact", "timing", "scale", "side_view"],
    weight: 1,
    direction: "lower",
  },
  {
    id: "bat_pad_gap",
    name: "Bat–pad gap",
    domain: "bat_contact",
    unit: "cm",
    decimals: 0,
    phase: "Contact",
    meaning: "Smallest lateral gap between bat and front pad near contact.",
    relevance: "A closed gap stops the ball deflecting between bat and pad.",
    range: { lo: 0, hi: 12 },
    requires: ["body", "bat", "depth"],
    weight: 0.8,
    direction: "lower",
  },
  {
    id: "ball_exit_speed",
    name: "Ball speed off the bat",
    domain: "outcome",
    unit: "m/s",
    decimals: 1,
    phase: "Post-contact",
    meaning: "Speed of the ball in the first frames after contact.",
    relevance: "A controlled defence deadens the ball; a fast exit suggests hard hands.",
    range: { lo: 0, hi: 8 },
    requires: ["ball", "contact", "timing", "scale", "side_view"],
    weight: 0.9,
    direction: "lower",
  },
  {
    id: "repeatability",
    name: "Repeatability",
    domain: "outcome",
    unit: "",
    decimals: 2,
    phase: "Across deliveries",
    meaning: "How consistent the key measures are across your valid deliveries.",
    relevance: "Repeatable movement is what turns practice into match performance.",
    range: null,
    requires: ["baseline"],
    weight: 0,
    direction: "higher",
  },
];

export const RANGE_SOURCE = { kind: "provisional_coaching" as const, cohort: ADULT, source: PROVISIONAL };

export const DOMAIN_LABELS: Record<MetricDefinition["domain"], string> = {
  setup: "Setup and perception",
  footwork: "Footwork and base",
  head_trunk: "Head and trunk control",
  sequence: "Kinetic sequence",
  bat_contact: "Bat path and contact",
  outcome: "Outcome and repeatability",
};

export const INDEX_WEIGHTS_VERSION = "index-weights-0.1.0";

export const REGISTRY_HASH = sha256(
  canonicalJson({
    ENGINE_VERSION,
    METRIC_VERSION,
    CLASSIFIER_VERSION,
    POSE_MODEL,
    THRESHOLDS,
    METRICS,
    FRONTAL_METRICS,
    INDEX_WEIGHTS_VERSION,
  }),
).slice(0, 16);
