// Typed contracts for the analysis engine.
// Raw observations (input), derived evidence and the immutable analysis payload
// are separate types so they can be stored separately and versioned.

export const JOINTS = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot",
  "right_foot",
] as const;
export type Joint = (typeof JOINTS)[number];
export const J: Record<Joint, number> = Object.fromEntries(JOINTS.map((j, i) => [j, i])) as Record<Joint, number>;

export type Handedness = "right" | "left";
export type Tier = "quick" | "session3d" | "lab";
export type TrackSource = "fixture" | "model" | "user_marked" | "interpolated" | "none";

export const SHOT_CLASSES = [
  "front_foot_defence",
  "front_foot_drive",
  "back_foot_defence",
  "pull",
  "hook",
  "cut",
  "sweep",
  "leave",
  "unknown",
] as const;
export type ShotClass = (typeof SHOT_CLASSES)[number];

export type AnalysisStatus = "valid" | "invalid_for_requested_analysis" | "uncertain_shot" | "capture_failed";

/** Normalised image point: x in [0,1] of width, y in [0,1] of height (y down), c = confidence. */
export type ImgPoint = readonly [number, number, number] | null;
/** Batter-centric 3D point in metres: forward (toward bowler), up, lateral (toward off side), confidence. */
export type WorldPoint = readonly [number, number, number, number] | null;
/**
 * Monocular 3D pose ESTIMATE in camera axes (metres, origin at the hip centre):
 * x to image right, y down, z away from the camera, plus confidence. MediaPipe
 * "world landmarks" have this shape. Used only to recover the forward axis when
 * the camera looks along the pitch (front-on or behind the batter).
 */
export type CameraPoint = readonly [number, number, number, number] | null;

/** Where the phone was: side-on (square of the pitch), front-on (bowler's end) or behind the batter. */
export type CameraView = "side_on" | "front_on" | "behind" | "oblique" | "unknown";

/** Moment a photo shows, when the athlete tags it. */
export type PhotoPhase = "stance" | "stride" | "contact" | "finish";

export interface FrameQuality {
  frame: number;
  /** Mean luma 0..1 */
  brightness: number;
  /** Luma standard deviation 0..1 */
  contrast: number;
  /** Normalised Laplacian variance; higher is sharper */
  sharpness: number;
  /** Mean absolute background change vs previous sample 0..1 (camera shake proxy) */
  backgroundMotion: number;
}

export interface CaptureObservation {
  schema: "align.observation/1";
  id: string;
  source: "fixture" | "browser_capture";
  /** Fixtures and synthetic data must be shown as DEMO DATA everywhere. */
  demo: boolean;
  label?: string;
  media: {
    kind: "video" | "photo";
    width: number;
    height: number;
    /** Frames per second of the analysed samples; null for a photo. */
    fps: number | null;
    fpsSource: "container" | "playback" | "fixture" | "unknown";
    durationMs: number;
    frameCount: number;
  };
  tier: Tier;
  athlete: {
    handedness: Handedness;
    heightCm: number | null;
  };
  camera: {
    view: CameraView;
    /** Which image edge the bowler is on, so "forward" is semantic, not a screen direction. */
    bowlerSide: "left" | "right";
  };
  calibration: {
    source: "fixture" | "user_marked" | "none";
    /** Metres per normalised image-height unit at the batter's depth. */
    metresPerUnit: number | null;
    /** Image x of the batter's stumps base (normalised). */
    stumpsX: number | null;
    /** Image y of the ground at the batter (normalised). */
    groundY: number | null;
  };
  quality: {
    frames: FrameQuality[];
    /** Largest number of people detected in any frame. */
    maxPeople: number;
  };
  /** Timestamp (ms) for each analysed frame. */
  t: number[];
  /** body[frame][jointIndex] in JOINTS order. */
  body: ImgPoint[][];
  /** Optional triangulated body for the 3D tier, body3d[frame][jointIndex]. */
  body3d?: WorldPoint[][];
  /**
   * Monocular depth ESTIMATE (lateral metres per frame per joint) for the 3D viewer only.
   * Never read by the engine; drawn as "estimated" so it is not mistaken for a measurement.
   */
  vizDepth?: number[][];
  /** Monocular 3D pose estimate per frame (see CameraPoint). Read only for front-on / behind views. */
  poseWorld?: CameraPoint[][];
  /** Photo sets: each frame is a separate photo, optionally tagged with the moment it shows. */
  photoPhases?: Array<PhotoPhase | null>;
  bat: { source: TrackSource; handle: ImgPoint[]; toe: ImgPoint[] };
  ball: { source: TrackSource; points: ImgPoint[] };
  /** Event marks supplied by the athlete or coach (frame indices). */
  marks: { bounceFrame: number | null; contactFrame: number | null };
}

// ----- Derived evidence -----

export type CheckStatus = "pass" | "warn" | "fail" | "not_applicable";

export interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  value: string;
  requirement: string;
  /** Concrete correction for the next recording, when not passing. */
  correction?: string;
}

export interface CaptureQuality {
  status: "pass" | "warn" | "fail";
  confidence: number;
  checks: QualityCheck[];
}

export interface TrackingSummary {
  body: { coverage: number; meanConfidence: number; ok: boolean };
  bat: { coverage: number; source: TrackSource; ok: boolean };
  ball: { coverage: number; source: TrackSource; ok: boolean };
  pitch: { calibrated: boolean; source: CaptureObservation["calibration"]["source"]; scaleUnit: "m" | "stature" };
  depth: { available: boolean };
}

export type EventType =
  | "setup"
  | "trigger"
  | "bounce"
  | "front_foot_plant"
  | "back_foot_commit"
  | "backswing_top"
  | "downswing_onset"
  | "contact"
  | "follow_through"
  | "recovery";

export interface MotionEvent {
  id: string;
  type: EventType;
  frame: number;
  tMs: number;
  confidence: number;
  method: string;
}

export interface DeliveryContext {
  available: boolean;
  reason?: string;
  bounceDistanceM: number | null;
  bounceUncertaintyM: number | null;
  heightAtBatterM: number | null;
  /** Height at batter divided by stature, comparable without scale. */
  heightAtBatterRel: number | null;
  length: { full: number; good: number; short: number } | null;
  lengthLabel: "full" | "good" | "short" | "uncertain" | null;
  confidence: number;
  evidenceIds: string[];
}

export interface ShotFeature {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  /** Plain-language reading of the value, e.g. "horizontal bat at contact". */
  reading: string;
  evidenceIds: string[];
  modality: "body" | "bat" | "ball" | "body+bat" | "body+ball" | "bat+ball";
}

export interface RangeRef {
  lo: number;
  hi: number;
  kind: "provisional_coaching" | "personal_baseline";
  cohort: string;
  source: string;
}

export type MetricDomain = "setup" | "footwork" | "head_trunk" | "sequence" | "bat_contact" | "outcome";

export interface Metric {
  id: string;
  name: string;
  domain: MetricDomain;
  status: "measured" | "estimated" | "not_measured";
  value: number | null;
  uncertainty: number | null;
  unit: string;
  decimals: number;
  confidence: number;
  phase: string;
  meaning: string;
  relevance: string;
  range: RangeRef | null;
  inRange: boolean | null;
  evidenceIds: string[];
  limitation?: string;
  /** Why it was not measured. */
  reason?: string;
}

export interface DomainResult {
  domain: MetricDomain;
  label: string;
  status: "within_range" | "review" | "not_measured";
  metricIds: string[];
  summary: string;
}

export interface Finding {
  metricId: string;
  title: string;
  observation: string;
  evidenceIds: string[];
}

export interface Drill {
  id: string;
  name: string;
  constraint: string;
  dosage: string;
  passCondition: string;
  cue: string;
}

export interface PlanItem {
  priority: Finding;
  consequence: string;
  cue: string;
  drills: Drill[];
  retest: string;
}

export interface Limitation {
  id: string;
  text: string;
}

export interface AnalysisPayload {
  schema: "align.analysis/1";
  analysis_id: string;
  created_at: string;
  demo: boolean;
  label?: string;
  mode: "video" | "posture_screen";
  tier: Tier;
  analysis_status: AnalysisStatus;
  status_reason: string;
  /**
   * What confirmed a valid shot: "full" = body, bat and ball; "body" = body and hand
   * movement only (bat and/or ball not seen; their measures are not reported).
   */
  evidence_basis?: "full" | "body";
  headline: string;
  requested_shot: "front_foot_defence";
  observed_shot: {
    label: ShotClass;
    display: string;
    probability: number;
    evidence_ids: string[];
  } | null;
  shot_probabilities: Record<ShotClass, number> | null;
  classifier: { version: string; calibrated: false; evidenceCoverage: number } | null;
  capture_confidence: number;
  capture: CaptureQuality;
  tracking: TrackingSummary;
  handedness: Handedness;
  delivery: DeliveryContext;
  events: MotionEvent[];
  features: ShotFeature[];
  metrics: Metric[];
  domains: DomainResult[];
  technique_index: { value: number; band: [number, number]; inputs: string[]; weightsVersion: string } | null;
  strengths: Finding[];
  priorities: Finding[];
  drill_candidates: Drill[];
  plan: PlanItem | null;
  limitations: Limitation[];
  recapture: string[];
  evidence_frames: number[];
  /** Camera position the analysis assumed (absent on payloads made before views were supported). */
  camera_view?: CameraView;
  /**
   * Ungraded movement observations for an uncertain shot: no ranges, no score.
   * Shown so the athlete still learns something, without implying a defence verdict.
   */
  observations?: Metric[];
  /** Photo sets: per-photo posture observations, in the order the photos were given. */
  photo_set?: Array<{ frame: number; phase: PhotoPhase | null; observations: Metric[]; note?: string }>;
  versions: {
    engine: string;
    metric_version: string;
    classifier: string;
    registry_hash: string;
    pose_model: string;
    bat_source: TrackSource;
    ball_source: TrackSource;
  };
  input_hash: string;
  result_hash: string;
}
