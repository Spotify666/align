// Orchestrator. Decision order (never reordered):
//   1. Is the capture usable?
//   2. Can body, bat, ball and pitch be tracked?
//   3. What delivery context occurred?
//   4. What shot family was attempted?
//   5. Is it compatible with the requested analysis?
//   6. Only then: how was it executed?
// The same observation + engine version always yields the same payload (result_hash).

import { canonicalJson, round, sha256, smooth } from "./math";
import {
  BFD_METRIC_VERSION,
  CLASSIFIER_VERSION,
  ENGINE_VERSION,
  METRIC_VERSION,
  METRICS,
  POSE_MODEL,
  RANGE_SOURCE,
  REGISTRY_HASH,
  th,
} from "./registry";
import { FRONTAL_METRICS, FRONTAL_UNGRADED, frontalMetrics, withholdAlongPitch } from "./frontal";
import { assessCapture, bodyCoverage } from "./quality";
import { buildScene } from "./scene";
import { handsSeries, segmentEvents } from "./events";
import { estimateDelivery } from "./delivery";
import { extractFeatures } from "./features";
import { classify, leadingAlternative, SHOT_DISPLAY, type Classification } from "./classify";
import { ALIGNMENT_IDS, computeMetrics } from "./metrics";
import { lineSummary, measureAlignment, type Alignment } from "./alignment";
import { buildPlan, domainResults, nextLevelPlan, strengthsAndPriorities, techniqueIndex } from "./scoring";
import { backFootMetrics, backFootSummary, measureBackFoot, type BackFootReading } from "./backfoot";
import { BFD_METRICS } from "./backfoot-defs";
import type {
  AnalysisPayload,
  AnalysisStatus,
  CaptureObservation,
  Limitation,
  Metric,
  ShotClass,
  TargetShot,
  TrackingSummary,
} from "./types";

/** The shot's name in a sentence. */
export const TARGET_NAME: Record<TargetShot, string> = { front_foot_defence: "front-foot defence", back_foot_defence: "back-foot defence" };

export interface AnalyzeOptions {
  analysisId: string;
  createdAt: string;
}

export function hashObservation(obs: CaptureObservation): string {
  return sha256(canonicalJson(obs));
}

function trackingSummary(obs: CaptureObservation, scene: ReturnType<typeof buildScene>): TrackingSummary {
  const body = bodyCoverage(obs);
  const batCov = scene.n ? scene.batToe.filter(Boolean).length / scene.n : 0;
  const ballPts = scene.ball.filter(Boolean).length;
  return {
    body: { coverage: round(body.coverage, 3), meanConfidence: round(body.meanConfidence, 3), ok: body.coverage >= th("capture.fail_body_coverage") },
    bat: { coverage: round(batCov, 3), source: obs.bat.source, ok: batCov >= th("tracking.bat_min_coverage") },
    ball: { coverage: round(scene.n ? ballPts / scene.n : 0, 3), source: obs.ball.source, ok: ballPts >= th("tracking.ball_min_points") },
    pitch: { calibrated: obs.calibration.metresPerUnit !== null, source: obs.calibration.source, scaleUnit: scene.unit },
    depth: { available: !!scene.depth },
  };
}

function limitationsFor(obs: CaptureObservation, tracking: TrackingSummary, scene: ReturnType<typeof buildScene>): Limitation[] {
  const L: Limitation[] = [];
  if (obs.demo) L.push({ id: "lim_demo", text: "DEMO DATA — synthetic fixture tracks, not a real recording." });
  L.push({
    id: "lim_classifier",
    text: "Shot confidence comes from a transparent prototype model; it is not yet calibrated on labelled cricket clips.",
  });
  L.push({ id: "lim_ranges", text: "Ranges are provisional: built from coaching practice and the few published measurements of the shot (Stretch et al., 1998; Taliep et al., 2007), not yet fitted to measured players." });
  if (!tracking.depth.available)
    L.push({ id: "lim_depth", text: "Single camera: depth-sensitive values (angles, lateral gaps) are estimates." });
  if (scene.plane === "frontal")
    L.push({
      id: "lim_view",
      text: "Filmed along the pitch: forward distances come from a 3D pose estimate, and bounce distance, bat speed and ball speed are not measured.",
    });
  if (scene.cameraMoving)
    L.push({
      id: "lim_camera_moving",
      text: "The camera zoomed or panned during the shot: positions are measured against your own body in each frame, and back-foot movement isn't measured.",
    });
  if (scene.scaleSource === "athlete_height") L.push({ id: "lim_scale", text: "Distances are scaled from your height, not measured pitch markings." });
  if (scene.scaleSource === "none") L.push({ id: "lim_noscale", text: "No scale: distances are expressed as fractions of your height; speeds in m/s are not reported." });
  if (scene.stumpsEstimated && tracking.ball.ok) L.push({ id: "lim_stumps", text: "Stumps position estimated from your stance; bounce distance is approximate." });
  if (obs.media.kind === "video" && (obs.media.fps ?? 0) < th("capture.min_fps_timing"))
    L.push({ id: "lim_fps", text: `Recorded at ${Math.round(obs.media.fps ?? 0)} fps: contact timing and speeds are not precise enough to report.` });
  if (obs.bat.source === "user_marked" || obs.bat.source === "interpolated")
    L.push({ id: "lim_bat_marked", text: "Bat position comes from your marks and is interpolated between them." });
  if (!tracking.bat.ok && obs.media.kind === "video") L.push({ id: "lim_no_bat", text: "Bat not tracked: no bat-path or contact claims are made." });
  if (!tracking.ball.ok && obs.media.kind === "video") L.push({ id: "lim_no_ball", text: "Ball not visible: no line, length or bounce claims are made." });
  return L;
}

function statusOf(
  obs: CaptureObservation,
  cls: Classification,
  tracking: TrackingSummary,
  contactVisibility: number,
  contactObserved: number,
): { status: AnalysisStatus; reason: string } {
  const p = cls.probabilities;
  const pFfd = p.front_foot_defence;
  const nonFfdNamed = Object.entries(p)
    .filter(([k]) => k !== "front_foot_defence" && k !== "unknown")
    .reduce((s, [, v]) => s + v, 0);

  // Rejection may rest on fewer modalities than acceptance (asymmetric gate).
  // Without bat or ball, body and hand evidence may carry the rejection.
  // A shot is decided at contact, so neither verdict is given unless the stroke was seen
  // there: by the batter's body when it is read from the body alone, otherwise by the body
  // or the bat.
  const bodyLed = !tracking.bat.ok || !tracking.ball.ok;
  const rejectCoverage = bodyLed ? Math.max(cls.ffdCoverage, cls.bodyCoverage) : cls.ffdCoverage;
  const minSeen = th("ffd.accept_body.min_contact_visibility");
  const contactSeen = bodyLed ? contactVisibility >= minSeen : contactObserved >= minSeen;
  // A rejection names something: one other shot, or one family of related shots, must
  // carry most of the probability, not several unrelated ones each a little.
  const coherent = leadingAlternative(p) >= th("ffd.reject.min_alternative");
  if (pFfd <= th("ffd.reject.max_probability") && nonFfdNamed >= 0.75 && coherent && rejectCoverage >= th("ffd.reject.min_evidence_coverage") && contactSeen) {
    return { status: "invalid_for_requested_analysis", reason: "different_shot" };
  }

  // Coverage already leaves out what a camera position cannot see, so one bar holds.
  const minCoverage = th("ffd.accept.min_evidence_coverage");
  const accept =
    tracking.body.ok &&
    tracking.bat.ok &&
    tracking.ball.ok &&
    pFfd >= th("ffd.accept.min_probability") &&
    cls.top === "front_foot_defence" &&
    cls.margin >= th("ffd.accept.min_margin") &&
    p.unknown <= th("ffd.accept.max_unknown") &&
    cls.ffdCoverage >= minCoverage &&
    contactSeen;
  if (accept) return { status: "valid", reason: "accepted" };

  // Bat or ball not seen (the usual phone clip): the shot may still be confirmed from
  // body and hand movement, against a higher bar. Their own measures stay unreported.
  const acceptBody =
    tracking.body.ok &&
    contactVisibility >= th("ffd.accept_body.min_contact_visibility") &&
    (!tracking.bat.ok || !tracking.ball.ok) &&
    cls.top === "front_foot_defence" &&
    pFfd >= th("ffd.accept_body.min_probability") &&
    cls.margin >= th("ffd.accept_body.min_margin") &&
    p.unknown <= th("ffd.accept.max_unknown") &&
    cls.bodyCoverage >= th("ffd.accept_body.min_coverage");
  if (acceptBody) return { status: "valid", reason: "accepted_body" };

  if (!contactSeen && !bodyLed) return { status: "uncertain_shot", reason: "contact_hidden" };
  if (!tracking.ball.ok || !tracking.bat.ok) {
    // Read from the body alone, say why it didn't settle: parts unseen, or not decisive.
    if (tracking.body.ok && (contactVisibility < th("ffd.accept_body.min_contact_visibility") || cls.bodyCoverage < th("ffd.accept_body.min_coverage")))
      return { status: "uncertain_shot", reason: "body_hidden" };
    if (tracking.body.ok) return { status: "uncertain_shot", reason: "body_inconclusive" };
    return { status: "uncertain_shot", reason: tracking.ball.ok ? "bat_missing" : "ball_missing" };
  }
  if (cls.ffdCoverage < minCoverage) return { status: "uncertain_shot", reason: "insufficient_evidence" };
  if (p.unknown > th("ffd.accept.max_unknown")) return { status: "uncertain_shot", reason: "out_of_distribution" };
  return { status: "uncertain_shot", reason: "ambiguous" };
}

/**
 * Share of frames within ±150 ms of contact where the batter's body or the bat (handle and
 * toe) is seen (0 without contact). The ball alone shows where contact was, not the stroke.
 */
function contactObserved(scene: ReturnType<typeof buildScene>, contact: number | undefined): number {
  if (contact === undefined || !scene.dt) return 0;
  const k = Math.max(1, Math.round(0.15 / scene.dt));
  let seen = 0;
  let total = 0;
  for (let i = Math.max(0, contact - k); i <= Math.min(scene.n - 1, contact + k); i++) {
    total++;
    const body = (["head", "front_hip", "back_hip", "front_knee", "front_ankle"] as const).every((j) => scene.get(i, j));
    if (body || (scene.batHandle[i] && scene.batToe[i])) seen++;
  }
  return total ? seen / total : 0;
}

/** Share of frames within ±150 ms of contact where head, hips, front knee and front ankle are all seen (0 without contact). */
function contactVisibility(scene: ReturnType<typeof buildScene>, contact: number | undefined): number {
  if (contact === undefined || !scene.dt) return 0;
  const k = Math.max(1, Math.round(0.15 / scene.dt));
  let seen = 0;
  let total = 0;
  for (let i = Math.max(0, contact - k); i <= Math.min(scene.n - 1, contact + k); i++) {
    total++;
    if ((["head", "front_hip", "back_hip", "front_knee", "front_ankle"] as const).every((j) => scene.get(i, j))) seen++;
  }
  return total ? seen / total : 0;
}

/** Did the batter play a stroke? Hands or front foot must move with some speed or reach. */
function strokePlayed(scene: ReturnType<typeof buildScene>, stride: number | undefined): boolean {
  if (!scene.dt || scene.n < 5) return true;
  const r = Math.max(1, Math.round(0.03 / scene.dt));
  const u = smooth(handsSeries(scene, "u"), r);
  const f = smooth(handsSeries(scene, "f"), r);
  let peak = 0;
  for (let i = 1; i < scene.n - 1; i++) {
    const a = i - 1;
    const b = i + 1;
    if ([u[a], u[b], f[a], f[b]].every((x) => Number.isFinite(x))) peak = Math.max(peak, Math.hypot(u[b]! - u[a]!, f[b]! - f[a]!) / (2 * scene.dt));
  }
  return peak / scene.stature >= th("stroke.min_hand_speed") || (stride ?? 0) >= th("stroke.min_stride");
}

/**
 * How far the head and the hips went down from the stance (× stature), up to `upTo`: a
 * front-foot defence bends the front knee and takes the head down over the ball. Standing
 * height: the tallest the batter stood before the stroke (85th percentile, so one bad frame
 * can't set it); lowest: around the reference moment (3-frame medians).
 */
export function lowering(scene: ReturnType<typeof buildScene>, ref: number): { head: number; hips: number } {
  const S = scene.stature;
  const dt = scene.dt ?? 1 / 30;
  const head = (i: number) => (scene.inPicture(i, "head")?.[1] ?? NaN) / S;
  const hips = (i: number) => {
    const a = scene.inPicture(i, "front_hip");
    const b = scene.inPicture(i, "back_hip");
    return a && b ? (a[1] + b[1]) / 2 / S : NaN;
  };
  const q = (xs: number[], p: number) => {
    const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))]! : NaN;
  };
  const drop = (sig: (i: number) => number) => {
    const before = Array.from({ length: Math.max(1, ref + 1) }, (_, i) => sig(i));
    const tall = q(before, 0.85);
    let low = Infinity;
    for (let i = Math.max(1, ref - Math.round(0.2 / dt)); i <= Math.min(scene.n - 2, ref + Math.round(0.3 / dt)); i++) {
      const m = q([sig(i - 1), sig(i), sig(i + 1)], 0.5);
      if (Number.isFinite(m)) low = Math.min(low, m);
    }
    return Number.isFinite(tall) && Number.isFinite(low) ? tall - low : NaN;
  };
  return { head: drop(head), hips: drop(hips) };
}

const UNCERTAIN_TEXT: Record<string, string> = {
  no_stroke: "no batting stroke was found in the clip",
  no_lowering: "the batter's head and hips didn't go forward and down into the ball, as they do in a defence, in this part of the clip",
  camera_zoom: "the camera zoomed in during the stroke, and a zoom makes a stride and a follow-through look like a drive",
  contact_hidden: "the moment the bat meets the ball is hidden, so the shot can't be decided",
  body_hidden: "without the bat or ball in view the shot is read from the body, and the hands or legs are hidden for too much of the stroke",
  body_inconclusive: "without the bat or ball in view, the body movement alone fits more than one shot",
  ball_missing: "the ball isn't visible, so the delivery can't be confirmed",
  bat_missing: "the bat isn't tracked, so a defence can't be separated from a drive",
  insufficient_evidence: "too few deciding signals were visible",
  out_of_distribution: "the movement doesn't match any supported shot closely",
  ambiguous: "the evidence fits more than one shot",
  photo_only: "a photo can't show shot type, timing, bat or ball",
};

const EMPTY_DELIVERY: AnalysisPayload["delivery"] = {
  available: false,
  bounceDistanceM: null,
  bounceUncertaintyM: null,
  heightAtBatterM: null,
  heightAtBatterRel: null,
  length: null,
  lengthLabel: null,
  confidence: 0,
  evidenceIds: [],
};

/** Body observations safe to show without a shot verdict: no bat, ball or timing. */
const OBSERVATION_IDS = ["line_head", "line_shoulder", "line_knee", "line_held", "sync_spread", "stride_length", "front_knee_flexion", "trunk_inclination", "weight_forward"];
/**
 * The front-foot defence position formula: every check one side-on frame can measure.
 * Photos are graded against it; the shot itself (timing, bat path, ball) needs a video.
 */
export const POSITION_FORMULA = ["line_head", "line_shoulder", "line_knee", "foot_spread", "front_knee_flexion", "back_knee_extension", "trunk_inclination", "weight_forward", "hands_ahead_of_knee"];
/**
 * From either end of the pitch a photo shows the line sideways: head over the line of the
 * ball, front shoulder and knee over the front foot, weight over the feet. Graded on those.
 * Forward distances and leg angles are foreshortened there: shown, not graded.
 */
export const FRONT_FORMULA = ["line_head", "line_shoulder", "line_knee", "balance_over_feet"];
const POSTURE_IDS = ["front_knee_flexion", "trunk_inclination"];

/** Strip coaching ranges so an observation can't be read as a grade. */
function ungraded(ms: Metric[]): Metric[] {
  return ms.map((m) => ({
    ...m,
    status: "estimated",
    range: null,
    inRange: null,
    limitation: [m.limitation, "Not graded: the shot wasn't confirmed as a front-foot defence."].filter(Boolean).join(" "),
  }));
}

/** One photo of a set as its own single-frame observation. */
function single(obs: CaptureObservation, i: number): CaptureObservation {
  if (obs.body.length === 1) return obs;
  return {
    ...obs,
    media: { ...obs.media, frameCount: 1 },
    t: [0],
    body: [obs.body[i]!],
    body3d: obs.body3d ? [obs.body3d[i]!] : undefined,
    vizDepth: obs.vizDepth ? [obs.vizDepth[i]!] : undefined,
    poseWorld: obs.poseWorld ? [obs.poseWorld[i]!] : undefined,
    photoPhases: undefined,
    bat: { ...obs.bat, handle: [obs.bat.handle[i] ?? null], toe: [obs.bat.toe[i] ?? null] },
    ball: { ...obs.ball, points: [obs.ball.points[i] ?? null] },
    marks: { bounceFrame: null, contactFrame: null },
  };
}

/**
 * One photo against the position formula. Side-on, every check is graded; along the
 * pitch the formula can't be applied, so a few posture readings are shown ungraded.
 */
/**
 * From a photo taken at an angle (neither square side-on nor along the pitch), the
 * checks that survive the angle: knee angles (an estimate), weight forward (a proportion
 * along the stride, which the angle doesn't change much) and forward lean (an angle can
 * only make a lean look smaller, so a lean that already reads big enough is certain).
 * Stride length and the head and hand distances run toward the camera: not read.
 */
const ANGLED_FORMULA = ["front_knee_flexion", "back_knee_extension", "trunk_inclination", "weight_forward"];

function positionFromPhoto(photo: CaptureObservation, frame: number): { metrics: Metric[]; sideOn: boolean; angled: boolean; front: boolean; alignment: Alignment | null } {
  const angled = photo.camera.view === "oblique";
  const read = computeMetricsSafe(photo);
  const { metrics } = read;
  const sideOn = read.sideOn;
  const front = !sideOn && (photo.camera.view === "front_on" || photo.camera.view === "behind");
  const ids = sideOn ? POSITION_FORMULA : front ? [...FRONT_FORMULA, ...POSTURE_IDS] : POSTURE_IDS;
  const out = ids.map((id) => {
    const m = metrics.find((x) => x.id === id);
    if (angled && !ANGLED_FORMULA.includes(id)) return notVisible(id, "Needs a side-on photo: from this angle the stride runs toward the camera, so this distance can't be read.");
    if (!m || m.status === "not_measured") return notVisible(id, m?.reason);
    // Evidence points at this photo within the set.
    const own = { ...m, evidenceIds: m.evidenceIds.map((e) => (e === "frame_0" ? `frame_${frame}` : e)) };
    if (front) return FRONT_FORMULA.includes(id) ? photoGraded(own) : photoOnly(own);
    if (!sideOn) return photoOnly(own);
    return angled ? photoAngled(own) : photoGraded(own);
  });
  return { metrics: out, sideOn, angled, front, alignment: angled ? null : read.alignment };
}

function computeMetricsSafe(photo: CaptureObservation): { metrics: Metric[]; sideOn: boolean; alignment: Alignment | null } {
  const run = (o: CaptureObservation) => {
    const scene = buildScene(o);
    const events = { list: [], byType: {} };
    const delivery = estimateDelivery(scene, events);
    const features = extractFeatures(scene, events, { ...delivery, available: false, length: null });
    const alignment = measureAlignment(scene, 0, o.camera.view, o.athlete.handedness);
    const ms = computeMetrics({ scene, events, features, delivery, tier: o.tier, postureFrame: 0, alignment });
    return { scene, alignment, metrics: scene.plane === "frontal" ? [...ms, ...frontalMetrics(scene, 0, RANGE_SOURCE)] : ms };
  };
  let { scene, metrics, alignment } = run(photo);
  // The bowler is on the front foot's side: in a stance and in every stroke the front foot
  // is the one nearer the bowler. (Where the head points misleads: a batter looks down at
  // the ball.) Not for photos along the pitch, where forward isn't across the image.
  if (photo.camera.view !== "front_on" && photo.camera.view !== "behind") {
    const fa = scene.get(0, "front_ankle");
    const ba = scene.get(0, "back_ankle");
    if (fa && ba && fa.f < ba.f) ({ scene, metrics, alignment } = run({ ...photo, camera: { ...photo.camera, bowlerSide: photo.camera.bowlerSide === "left" ? "right" : "left" } }));
  }
  return { metrics, sideOn: scene.plane === "sagittal", alignment };
}

function photoAngled(m: Metric): Metric {
  const g = photoGraded(m);
  // A lean seen from an angle reads smaller than it is: enough lean is certain, too little
  // or too much can't be told.
  if (m.id === "trunk_inclination" && m.range && m.value !== null) {
    const ok = m.value >= m.range.lo;
    return { ...g, inRange: ok ? true : null, limitation: [g.limitation, ok ? "From an angle a lean looks smaller than it is: at least this much." : "From an angle a lean looks smaller than it is, so too little lean can't be told."].join(" ") };
  }
  return { ...g, limitation: [g.limitation, "Photo at an angle: an estimate."].join(" ") };
}

function photoGraded(m: Metric): Metric {
  return {
    ...m,
    status: "estimated",
    phase: "Photo",
    limitation: [m.limitation, "One photo: the position at this moment, assumed to be contact."].filter(Boolean).join(" "),
  };
}

function photoOnly(m: Metric): Metric {
  return {
    ...m,
    status: "estimated",
    phase: "Photo",
    range: null,
    inRange: null,
    limitation: [m.limitation, "Not taken square side-on: the position formula needs a side-on photo, so this is shown, not graded."].filter(Boolean).join(" "),
  };
}

export interface PositionCheck {
  met: number;
  checked: number;
  /** Taken at an angle: only the checks that survive the angle were made. */
  angled?: boolean;
  /** Taken from either end of the pitch: the line checked sideways. */
  front?: boolean;
  verdict: "matches" | "mostly" | "partly" | "doesnt_match" | "not_on_front_foot" | "not_enough" | "not_side_on";
}

/** The formula's verdict: how many of the checks this photo could measure are met. */
export function positionCheck(ms: Metric[], sideOn: boolean, angled = false, front = false): PositionCheck {
  const graded = ms.filter((m) => m.inRange !== null);
  const met = graded.filter((m) => m.inRange).length;
  const checked = graded.length;
  if (front) {
    if (checked < 3) return { met, checked, front, verdict: "not_enough" };
    return { met, checked, front, verdict: met === checked ? "matches" : met >= checked - 1 ? "mostly" : met >= checked / 2 ? "partly" : "doesnt_match" };
  }
  if (!sideOn) return { met, checked, verdict: "not_side_on" };
  if (angled) {
    if (checked < 3) return { met, checked, angled, verdict: "not_enough" };
    return { met, checked, angled, verdict: met === checked ? "matches" : met >= checked - 1 ? "mostly" : met >= checked / 2 ? "partly" : "doesnt_match" };
  }
  if (checked < 4) return { met, checked, verdict: "not_enough" };
  const spread = ms.find((m) => m.id === "foot_spread");
  // Feet no wider than a stance: the front foot hasn't gone toward the ball (a stance, a back-foot shot).
  if (spread?.value != null && spread.value < th("photo.min_forward_spread")) return { met, checked, verdict: "not_on_front_foot" };
  // Most checks missed: the position doesn't resemble a defence (a pull, a cut). Otherwise it
  // is a defence with things to work on, however many.
  const verdict = met === checked ? "matches" : met >= checked - 1 ? "mostly" : met >= checked * th("photo.min_resemblance") ? "partly" : "doesnt_match";
  return { met, checked, verdict };
}

function positionHeadline(c: PositionCheck, ms: Metric[], key: number, photos: number, view: CaptureObservation["camera"]["view"]): string {
  const which = photos > 1 ? `photo ${key + 1} of ${photos}` : "this photo";
  const how = c.angled ? "from an angle" : c.front ? "from along the pitch" : "";
  const tag = photos > 1 ? ` (photo ${key + 1} of ${photos}${how ? `, ${how}` : ""})` : how ? ` (photo ${how})` : "";
  const off = ms.filter((m) => m.inRange === false).map((m) => m.name.toLowerCase());
  switch (c.verdict) {
    case "matches":
      return `Front-foot defence ${c.front ? "line" : "position"}${tag}: all ${c.checked} checks met.`;
    case "mostly":
      return `Front-foot defence ${c.front ? "line" : "position"}${tag}: ${c.met} of ${c.checked} checks met. To work on: ${off[0]}.`;
    case "partly":
      return `Front-foot defence ${c.front ? "line" : "position"}${tag}: ${c.met} of ${c.checked} checks met. To work on: ${off.slice(0, 2).join(" and ")}.`;
    case "doesnt_match":
      return `${which[0]!.toUpperCase()}${which.slice(1)} doesn't look like a front-foot defence position: ${c.met} of ${c.checked} checks met.`;
    case "not_on_front_foot":
      return `${which[0]!.toUpperCase()}${which.slice(1)} doesn't show a front-foot defence: the front foot hasn't stepped toward the ball.`;
    case "not_enough":
      return "Not enough of the batter is visible to check the front-foot defence position.";
    case "not_side_on":
      return view === "front_on" || view === "behind"
        ? "Photo from along the pitch: the front-foot defence check needs a side-on photo. Posture shown, not graded."
        : "Photo taken at an angle: the front-foot defence check needs a square side-on photo. Posture shown, not graded.";
  }
}

function notVisible(id: string, why?: string): Metric {
  const def = (METRICS.find((d) => d.id === id) ?? FRONTAL_METRICS.find((d) => d.id === id))!;
  return {
    id,
    name: def.name,
    domain: def.domain,
    status: "not_measured",
    value: null,
    uncertainty: null,
    unit: def.unit,
    decimals: def.decimals,
    confidence: 0,
    phase: "Photo",
    meaning: def.meaning,
    relevance: def.relevance,
    range: null,
    inRange: null,
    evidenceIds: [],
    reason: why ?? "Not measured: the batter isn't fully visible in this photo.",
  };
}

/** Which photo of a set carries the headline: the one tagged contact, then stride, then the one with most checks measured. */
function keyPhoto(phases: Array<string | null>, per: Metric[][]): number {
  for (const ph of ["contact", "stride"]) {
    const i = phases.indexOf(ph);
    if (i >= 0) return i;
  }
  const measured = per.map((ms) => ms.filter((m) => m.status !== "not_measured").length);
  return Math.max(0, measured.indexOf(Math.max(...measured)));
}

export function analyze(obs: CaptureObservation, opts: AnalyzeOptions): AnalysisPayload {
  const target: TargetShot = obs.target ?? "front_foot_defence";
  const capture = assessCapture(obs);
  const scene = buildScene(obs);
  const tracking = trackingSummary(obs, scene);
  const limitations = limitationsFor(obs, tracking, scene);
  const recapture = capture.checks.filter((c) => c.correction).map((c) => c.correction!);

  const base = {
    schema: "align.analysis/1" as const,
    analysis_id: opts.analysisId,
    created_at: opts.createdAt,
    demo: obs.demo,
    label: obs.label,
    tier: obs.tier,
    requested_shot: target,
    capture,
    capture_confidence: round(capture.confidence, 2),
    tracking,
    handedness: obs.athlete.handedness,
    versions: {
      engine: ENGINE_VERSION,
      metric_version: target === "back_foot_defence" ? BFD_METRIC_VERSION : METRIC_VERSION,
      classifier: CLASSIFIER_VERSION,
      registry_hash: REGISTRY_HASH,
      pose_model: obs.source === "fixture" ? "fixture-generator-0.1.0" : POSE_MODEL,
      bat_source: obs.bat.source,
      ball_source: obs.ball.source,
    },
    input_hash: hashObservation(obs),
    camera_view: obs.camera.view,
  };

  const withheld = {
    technique_index: null,
    strengths: [],
    priorities: [],
    drill_candidates: [],
    plan: null,
    domains: [],
  };

  const finish = (p: Omit<AnalysisPayload, "result_hash">): AnalysisPayload => {
    const { analysis_id: _a, created_at: _c, ...rest } = p;
    void _a;
    void _c;
    return { ...p, result_hash: sha256(canonicalJson(rest)).slice(0, 32) };
  };

  // 1. Capture gate.
  if (capture.status === "fail" || !tracking.body.ok) {
    const failing = capture.checks.filter((c) => c.status === "fail");
    return finish({
      ...base,
      ...withheld,
      mode: obs.media.kind === "photo" ? "posture_screen" : "video",
      analysis_status: "capture_failed",
      status_reason: failing[0]?.id ?? "body_not_tracked",
      headline:
        failing[0]?.id === "chk_duration" && obs.media.trimmed
          ? obs.media.durationMs < 400
            ? "This recording can't be analysed yet: the batter couldn't be followed through the stroke, because the camera cuts or zooms away."
            : `This recording can't be analysed yet: the batter is in view for only ${(obs.media.durationMs / 1000).toFixed(1)} s before the camera cuts or zooms away.`
          : failing[0]?.id === "chk_resolution"
            ? `This ${obs.media.kind === "photo" ? "photo" : "recording"} can't be analysed yet: the batter is ${failing[0].value.replace(/ \(.*$/, "")} (at least ${th("capture.fail_batter_px")} px is needed, ${th("capture.min_batter_px")} px or more for full accuracy).`
            : `This recording can't be analysed yet: ${(failing[0]?.label ?? "batter not tracked").toLowerCase()}.`,
      observed_shot: null,
      shot_probabilities: null,
      classifier: null,
      delivery: { available: false, bounceDistanceM: null, bounceUncertaintyM: null, heightAtBatterM: null, heightAtBatterRel: null, length: null, lengthLabel: null, confidence: 0, evidenceIds: [], reason: "Not assessed — capture failed." },
      events: [],
      features: [],
      metrics: [],
      limitations,
      recapture: recapture.length ? recapture : ["Keep the whole batter in frame for the full delivery."],
      evidence_frames: [],
    });
  }

  // Photo(s) of a back-foot defence: the same, against its own position formula.
  if (obs.media.kind === "photo" && target === "back_foot_defence") return finish(backFootPhotos(obs, base, withheld, limitations));

  // Photo(s): the position at one moment, checked against the front-foot defence formula.
  // No shot identity, timing, bat path or ball claims: those need a video.
  if (obs.media.kind === "photo") {
    const frames = obs.body.length;
    const per = Array.from({ length: frames }, (_, i) => positionFromPhoto(single(obs, i), i));
    const perPhoto = per.map((x) => x.metrics);
    const phases = obs.photoPhases ?? [];
    const key = keyPhoto(phases, perPhoto);
    const set = frames > 1;
    const metrics = perPhoto[key] ?? [];
    const check = positionCheck(metrics, per[key]?.sideOn ?? false, per[key]?.angled ?? false, per[key]?.front ?? false);
    const graded = check.verdict !== "not_side_on" && check.verdict !== "not_enough" && check.verdict !== "not_on_front_foot";
    const { strengths, priorities } = graded ? strengthsAndPriorities(metrics) : { strengths: [], priorities: [] };
    const plan = graded ? buildPlan(priorities, metrics) : null;
    return finish({
      ...base,
      ...withheld,
      strengths,
      priorities,
      plan,
      drill_candidates: plan?.drills ?? [],
      mode: "posture_screen",
      analysis_status: "uncertain_shot",
      status_reason: "photo_only",
      headline: positionHeadline(check, metrics, key, frames, obs.camera.view),
      position_check: { ...check, frame: key },
      ...(per[key]?.alignment ? { line: { ...lineSummary(per[key]!.alignment!), referenceFrame: key } } : {}),
      observed_shot: null,
      shot_probabilities: null,
      classifier: null,
      delivery: { ...EMPTY_DELIVERY, reason: "Photos cannot show ball flight." },
      events: [],
      features: [],
      metrics,
      limitations: [
        ...limitations,
        { id: "lim_photo", text: "A photo checks the position at one moment, taken to be contact. It can't show timing, the bat's path or the ball, so it never confirms the shot itself." },
        ...(set ? [{ id: "lim_photo_set", text: "Each photo is measured on its own; photos are not treated as one continuous movement." }] : []),
      ],
      // Only what gets a fuller check; camera details stay in the recording checks.
      recapture: [
        ...(check.verdict === "not_side_on" || check.angled ? ["Take a side-on photo at the moment of contact to check the stride, head and hands too."] : []),
        "Record a short video of the whole delivery to check the shot itself: timing, bat path and ball.",
      ],
      evidence_frames: set ? Array.from({ length: Math.min(frames, 12) }, (_, i) => i) : [0],
      ...(set
        ? {
            photo_set: perPhoto.map((observations, i) => ({
              frame: i,
              phase: phases[i] ?? null,
              observations,
              ...(observations.every((m) => m.status === "not_measured") ? { note: "Batter not fully visible in this photo." } : {}),
            })),
          }
        : {}),
    });
  }

  // 2–5. Tracking, events, delivery, shot recognition, compatibility.
  const events = segmentEvents(obs, scene);
  const delivery = estimateDelivery(scene, events);
  const features = extractFeatures(scene, events, delivery);
  const frontal = scene.plane === "frontal";
  // No stroke at all (a still pose, someone standing in front of the camera): say so
  // instead of naming a shot.
  if (!strokePlayed(scene, features.values.front_stride)) {
    return finish({
      ...base,
      ...withheld,
      mode: "video",
      analysis_status: "uncertain_shot",
      status_reason: "no_stroke",
      headline: `We can't confirm a ${TARGET_NAME[target]}: ${UNCERTAIN_TEXT.no_stroke}.`,
      observed_shot: null,
      shot_probabilities: null,
      classifier: null,
      delivery: { ...EMPTY_DELIVERY, reason: "No stroke found." },
      events: [],
      features: features.list,
      metrics: [],
      limitations,
      recapture: ["Record the whole shot: start before the ball is bowled and stop after the follow-through.", ...recapture],
      evidence_frames: [],
    });
  }
  if (target === "back_foot_defence") return finish(analyzeBackFoot(obs, scene, tracking, events, delivery, features, base, withheld, limitations, recapture));
  const cls = classify(features, { frontal, batSeen: tracking.bat.ok, cameraMoving: scene.cameraMoving });
  const contactEv = events.byType.contact;
  // Contact is known when the bat meeting the ball was seen (or marked); otherwise it is an
  // estimate from the body, and the line is read at the set position instead (alignment.ts).
  const contactKnown = !!contactEv && contactEv.confidence >= 0.65;
  const alignment: Alignment | null = contactEv ? measureAlignment(scene, contactEv.frame, obs.camera.view, obs.athlete.handedness, { contactKnown }) : null;
  let { status, reason } = statusOf(obs, cls, tracking, contactVisibility(scene, contactEv?.frame), contactObserved(scene, contactEv?.frame));
  // Without bat and ball, contact is placed at the set position: the defence meets the ball
  // from there, and the body shows it far better than the gloved hands do.
  if (contactEv && alignment?.referenceKind === "set" && alignment.reference !== contactEv.frame) {
    const moved = {
      ...contactEv,
      frame: alignment.reference,
      tMs: Math.round(scene.t[alignment.reference] ?? 0),
      method: "set position: front foot, knee and shoulder all arrived (bat and ball not seen)",
    };
    events.list = events.list.map((e) => (e.type === "contact" ? moved : e)).sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type));
    events.byType.contact = moved;
  }
  // Along the pitch the old landing time came from the 3D estimate's forward axis; the
  // picture itself shows when the front foot stops (alignment.ts): use that.
  const landed = alignment?.arrivals?.foot.frame;
  if (frontal && landed !== null && landed !== undefined) {
    const plant = {
      id: "evt_front_foot_plant",
      type: "front_foot_plant" as const,
      frame: landed,
      tMs: Math.round(scene.t[landed] ?? 0),
      confidence: 0.7,
      method: "front foot stops moving in the picture",
    };
    events.list = [...events.list.filter((e) => e.type !== "front_foot_plant"), plant].sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type));
    events.byType.front_foot_plant = plant;
  }
  // A heavy zoom during the stroke (broadcast footage) stretches the stride and sweeps the
  // hands through the picture: never name a different shot on that.
  if (status === "invalid_for_requested_analysis" && scene.zoom >= th("stroke.max_zoom_for_rejection")) {
    status = "uncertain_shot";
    reason = "camera_zoom";
  }
  // A defence goes forward and down into the ball. Without that, whatever else fits, it
  // isn't one (a stance, a backlift, a shuffle).
  if (status === "valid") {
    const ref = events.byType.contact?.frame ?? scene.n - 1;
    const low = lowering(scene, ref);
    if (!(low.head >= th("ffd.min_head_drop")) && !(low.hips >= th("ffd.min_hip_drop"))) {
      status = "uncertain_shot";
      reason = "no_lowering";
    }
  }
  const bodyLed = status === "valid" && reason === "accepted_body";
  if (bodyLed) {
    const unseen = [!tracking.bat.ok && "bat", !tracking.ball.ok && "ball"].filter(Boolean).join(" and ");
    limitations.push({
      id: "lim_body_led",
      text: `The ${unseen} weren't seen, so the shot was confirmed from body and hand movement only. Measures that need the ${unseen} are not reported.`,
    });
  }

  const probs = Object.fromEntries(Object.entries(cls.probabilities).map(([k, v]) => [k, round(v, 3)])) as Record<ShotClass, number>;
  const decisiveIds = cls.decisive.map((d) => `feat_${d.feature}`);
  const keyEvents = (["bounce", "contact", "front_foot_plant", "back_foot_commit"] as const)
    .map((t) => events.byType[t]?.id)
    .filter((x): x is string => !!x);
  const evidenceFrames = [...new Set(events.list.filter((e) => e.type !== "setup" || events.list.length < 3).map((e) => e.frame))].slice(0, 8);

  // A leave is defined by no contact, which needs both bat and ball to observe.
  // A leave is defined by no contact, and a cut by a horizontal bat: without the bat
  // (and ball) neither can be named from the body alone.
  const named =
    cls.top !== "unknown" &&
    cls.probabilities[cls.top] >= th("ffd.named_label.min_probability") &&
    !(cls.top === "leave" && features.values.contact_found === undefined) &&
    !(cls.top === "cut" && !tracking.bat.ok);
  const observed =
    status === "invalid_for_requested_analysis"
      ? {
          label: named ? cls.top : ("unknown" as ShotClass),
          display: named ? SHOT_DISPLAY[cls.top] : (cls.family ?? "a different shot"),
          probability: round(named ? cls.probabilities[cls.top] : 1 - cls.probabilities.front_foot_defence - cls.probabilities.unknown, 2),
          evidence_ids: [...decisiveIds, ...keyEvents],
        }
      : status === "valid"
        ? {
            label: "front_foot_defence" as ShotClass,
            display: SHOT_DISPLAY.front_foot_defence,
            probability: round(cls.probabilities.front_foot_defence, 2),
            evidence_ids: [...features.list.map((f) => f.id).slice(0, 4), ...keyEvents],
          }
        : null;

  const common = {
    ...base,
    mode: "video" as const,
    observed_shot: observed,
    shot_probabilities: probs,
    classifier: { version: CLASSIFIER_VERSION, calibrated: false as const, evidenceCoverage: round(cls.ffdCoverage, 2) },
    delivery,
    events: events.list,
    features: features.list,
    limitations,
    evidence_frames: evidenceFrames,
  };

  if (status !== "valid") {
    const extraRecapture: string[] = [];
    if (reason === "camera_zoom") extraRecapture.push("Use footage from a fixed camera (a phone on a tripod) that doesn't zoom during the shot.");
    if (reason === "no_lowering") extraRecapture.push("Record the whole stroke: from the stance until after the bat meets the ball.");
    if (reason === "body_hidden" || reason === "body_inconclusive")
      extraRecapture.push("Keep the bat and the ball's path in frame, or film side-on at hip height so the hands and front leg stay visible throughout.");
    if (reason === "ball_missing") extraRecapture.push("Keep the bounce area and the ball's path to the bat in frame.");
    if (reason === "bat_missing") extraRecapture.push("Keep the whole bat in view, or mark the bat handle and toe on three frames.");
    if (reason === "contact_hidden") extraRecapture.push("Keep the batter, bat and ball in view through the moment of contact.");
    if (reason === "insufficient_evidence" || reason === "ambiguous") extraRecapture.push("Film side-on at hip height with nobody between the camera and the batter.");
    const headline =
      status === "invalid_for_requested_analysis"
        ? `This appears to be ${named ? `a ${SHOT_DISPLAY[cls.top].toLowerCase()}` : (cls.family ?? "a different shot")}, not a front-foot defence.`
        : `We can't confirm a front-foot defence: ${UNCERTAIN_TEXT[reason] ?? "the evidence is incomplete"}.`;
    // Uncertain (never a different shot): neutral body observations, ungraded.
    // Filmed along the pitch, the sideways measures that view sees, in place of forward ones.
    const observations =
      status === "uncertain_shot"
        ? ungraded(
            frontal
              ? [
                  ...computeMetrics({ scene, events, features, delivery, tier: obs.tier, alignment }).filter((m) => ALIGNMENT_IDS.includes(m.id) && m.status !== "not_measured"),
                  ...frontalMetrics(scene, events.byType.contact?.frame, RANGE_SOURCE).filter((m) => m.status !== "not_measured"),
                ]
              : computeMetrics({ scene, events, features, delivery, tier: obs.tier, alignment }).filter((m) => OBSERVATION_IDS.includes(m.id) && m.status !== "not_measured"),
          )
        : [];
    return finish({
      ...common,
      ...withheld,
      analysis_status: status,
      status_reason: reason,
      headline,
      metrics: [],
      ...(observations.length ? { observations } : {}),
      recapture: status === "uncertain_shot" ? [...extraRecapture, ...recapture] : recapture,
    });
  }

  // 6. Valid: technique measures. Filmed along the pitch, forward distances and in-line
  // angles rest on a 3D estimate: withheld (timing ones shown, not graded); the sideways
  // measures that view sees well are graded.
  let metrics = computeMetrics({ scene, events, features, delivery, tier: obs.tier, alignment });
  if (frontal) {
    metrics = [
      ...metrics.map(withholdAlongPitch).map((m) =>
        FRONTAL_UNGRADED.includes(m.id) && m.status !== "not_measured" && m.range
          ? {
              ...m,
              range: null,
              inRange: null,
              limitation: [m.limitation, "Filmed along the pitch: this forward distance comes from a 3D estimate, so it's shown but not graded."].filter(Boolean).join(" "),
            }
          : m,
      ),
      ...frontalMetrics(scene, events.byType.contact?.frame, RANGE_SOURCE),
    ];
  }
  const domains = domainResults(metrics);
  const index = techniqueIndex(metrics, domains);
  const { strengths, priorities } = strengthsAndPriorities(metrics);
  const plan = buildPlan(priorities, metrics) ?? nextLevelPlan(metrics);
  const headline = priorities[0]
    ? `Valid front-foot defence. To work on: ${priorities[0].title.toLowerCase()}.`
    : "Valid front-foot defence. Every check is in range.";

  return finish({
    ...common,
    analysis_status: "valid",
    status_reason: reason,
    evidence_basis: bodyLed ? "body" : "full",
    headline,
    metrics,
    ...(alignment ? { line: lineSummary(alignment) } : {}),
    domains,
    technique_index: index,
    strengths,
    priorities,
    drill_candidates: plan?.drills ?? [],
    plan,
    recapture,
  });
}


// ---------------------------------------------------------------------------------------
// The back-foot defence (docs/11-back-foot-defence.md). The same decision order and the same
// strict, asymmetric gate as the front-foot defence, centred on the back-foot defence.

type Base = Omit<AnalysisPayload, "result_hash" | "mode" | "analysis_status" | "status_reason" | "headline" | "observed_shot" | "shot_probabilities" | "classifier" | "delivery" | "events" | "features" | "metrics" | "limitations" | "recapture" | "evidence_frames" | "technique_index" | "strengths" | "priorities" | "drill_candidates" | "plan" | "domains">;
type Withheld = Pick<AnalysisPayload, "technique_index" | "strengths" | "priorities" | "drill_candidates" | "plan" | "domains">;

const BFD_UNCERTAIN: Record<string, string> = {
  ...UNCERTAIN_TEXT,
  not_back: "the batter didn't go back onto the back foot and stay tall, as a back-foot defence does, in this part of the clip",
  bat_missing: "the bat isn't tracked, so a block can't be separated from a pull or a cut",
};

function statusOfBackFoot(cls: Classification, tracking: TrackingSummary, contactVisibilityShare: number, contactObservedShare: number): { status: AnalysisStatus; reason: string } {
  const target = "back_foot_defence" as const;
  const p = cls.probabilities;
  const pT = p[target];
  const others = Object.entries(p)
    .filter(([k]) => k !== target && k !== "unknown")
    .reduce((s, [, v]) => s + v, 0);
  const bodyLed = !tracking.bat.ok || !tracking.ball.ok;
  const rejectCoverage = bodyLed ? Math.max(cls.ffdCoverage, cls.bodyCoverage) : cls.ffdCoverage;
  const minSeen = th("ffd.accept_body.min_contact_visibility");
  const contactSeen = bodyLed ? contactVisibilityShare >= minSeen : contactObservedShare >= minSeen;
  const coherent = leadingAlternative(p, target) >= th("ffd.reject.min_alternative");
  if (pT <= th("bfd.reject.max_probability") && others >= 0.75 && coherent && rejectCoverage >= th("ffd.reject.min_evidence_coverage") && contactSeen)
    return { status: "invalid_for_requested_analysis", reason: "different_shot" };
  const accept =
    tracking.body.ok &&
    tracking.bat.ok &&
    tracking.ball.ok &&
    pT >= th("bfd.accept.min_probability") &&
    cls.top === target &&
    cls.margin >= th("bfd.accept.min_margin") &&
    p.unknown <= th("ffd.accept.max_unknown") &&
    cls.ffdCoverage >= th("ffd.accept.min_evidence_coverage") &&
    contactSeen;
  if (accept) return { status: "valid", reason: "accepted" };
  const acceptBody =
    tracking.body.ok &&
    contactVisibilityShare >= minSeen &&
    bodyLed &&
    cls.top === target &&
    pT >= th("bfd.accept_body.min_probability") &&
    cls.margin >= th("bfd.accept_body.min_margin") &&
    p.unknown <= th("ffd.accept.max_unknown") &&
    cls.bodyCoverage >= th("bfd.accept_body.min_coverage");
  if (acceptBody) return { status: "valid", reason: "accepted_body" };
  if (!contactSeen && !bodyLed) return { status: "uncertain_shot", reason: "contact_hidden" };
  if (bodyLed) {
    if (tracking.body.ok && (contactVisibilityShare < minSeen || cls.bodyCoverage < th("bfd.accept_body.min_coverage"))) return { status: "uncertain_shot", reason: "body_hidden" };
    if (tracking.body.ok) return { status: "uncertain_shot", reason: "body_inconclusive" };
    return { status: "uncertain_shot", reason: tracking.ball.ok ? "bat_missing" : "ball_missing" };
  }
  if (cls.ffdCoverage < th("ffd.accept.min_evidence_coverage")) return { status: "uncertain_shot", reason: "insufficient_evidence" };
  if (p.unknown > th("ffd.accept.max_unknown")) return { status: "uncertain_shot", reason: "out_of_distribution" };
  return { status: "uncertain_shot", reason: "ambiguous" };
}

/**
 * Went back and stayed tall. Side-on (fixed camera): the back foot travelled back toward the
 * stumps, or the front foot came back toward it. From either end of the pitch (or a moving
 * camera) that travel runs toward the camera: the front foot must not have strided forward.
 * Always: the head didn't go down into the ball as in a front-foot stroke.
 */
function wentBack(scene: ReturnType<typeof buildScene>, features: ReturnType<typeof extractFeatures>, r: BackFootReading | null): boolean {
  const drop = r && Number.isFinite(r.headDrop) ? r.headDrop : lowering(scene, r?.reference ?? features.refFrame).head;
  if (Number.isFinite(drop) && drop > th("bfd.max_head_drop")) return false;
  if (scene.plane === "sagittal" && !scene.cameraMoving && r) return r.backStep >= th("bfd.min_back_step") || r.frontBack >= th("bfd.min_front_back");
  const stride = features.values.front_stride;
  return stride !== undefined && stride <= th("bfd.max_front_stride");
}

/** Side-on, fixed camera: does the back foot still go back toward the stumps after this frame (by the back-step gate)? */
function backFootGoesBackAfter(scene: ReturnType<typeof buildScene>, frame: number): boolean {
  if (scene.plane !== "sagittal" || scene.cameraMoving) return false;
  const x = (i: number) => scene.inPicture(i, "back_ankle")?.[0] ?? NaN;
  const at = [frame - 1, frame, frame + 1].map(x).filter(Number.isFinite).sort((a, b) => a - b)[1] ?? NaN;
  let least = Infinity;
  for (let i = frame + 1; i < scene.n - 1; i++) {
    const m = [x(i - 1), x(i), x(i + 1)].filter(Number.isFinite).sort((a, b) => a - b)[1];
    if (m !== undefined) least = Math.min(least, m);
  }
  return Number.isFinite(at) && Number.isFinite(least) && (at - least) / scene.stature >= th("bfd.min_back_step");
}

function analyzeBackFoot(
  obs: CaptureObservation,
  scene: ReturnType<typeof buildScene>,
  tracking: TrackingSummary,
  events: ReturnType<typeof segmentEvents>,
  delivery: ReturnType<typeof estimateDelivery>,
  featuresIn: ReturnType<typeof extractFeatures>,
  base: Base,
  withheld: Withheld,
  limitations: Limitation[],
  recapture: string[],
): Omit<AnalysisPayload, "result_hash"> {
  const target = "back_foot_defence" as const;
  const frontal = scene.plane === "frontal";
  const features = featuresIn;
  // The shot is identified at the contact the events found (from the bat and ball, or from the
  // hands' downswing): moving it to the body's set position before identifying the shot made
  // cuts read as back-foot defences (their head settles after the swing). Measured below at the
  // set position, as the front-foot defence is.
  const cls = classify(features, { frontal, batSeen: tracking.bat.ok, cameraMoving: scene.cameraMoving, target });
  let contactEv = events.byType.contact;
  let { status, reason } = statusOfBackFoot(cls, tracking, contactVisibility(scene, contactEv?.frame), contactObserved(scene, contactEv?.frame));
  const contactKnown = !!contactEv && contactEv.confidence >= 0.65;
  const reading = measureBackFoot(scene, contactEv?.frame ?? features.refFrame, obs.camera.view, obs.athlete.handedness, { contactKnown });
  // Read from the body alone, the shot is named at a contact estimated from the hands. A
  // back-foot shot meets the ball after the back foot has gone back: an estimate well before
  // the back foot set reads the stroke too early (the hands still on their way to the ball),
  // so no other shot is named on it.
  const landed = reading?.arrivals?.back_foot.frame;
  const early =
    !contactKnown &&
    !!contactEv &&
    ((landed !== null && landed !== undefined && !!scene.dt && (landed - contactEv.frame) * scene.dt > th("bfd.max_contact_before_landing_s")) || backFootGoesBackAfter(scene, contactEv.frame));
  if (status === "invalid_for_requested_analysis" && early) {
    status = "uncertain_shot";
    reason = "body_inconclusive";
  }
  // Without bat and ball, contact is placed where the back foot, front foot and head have set.
  if (contactEv && reading?.referenceKind === "set" && reading.reference !== contactEv.frame) {
    const moved = {
      ...contactEv,
      frame: reading.reference,
      tMs: Math.round(scene.t[reading.reference] ?? 0),
      method: "set position: back foot, front foot and head all set (bat and ball not seen)",
    };
    events.list = events.list.map((e) => (e.type === "contact" ? moved : e)).sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type));
    events.byType.contact = moved;
    contactEv = moved;
  }
  if (status === "invalid_for_requested_analysis" && scene.zoom >= th("stroke.max_zoom_for_rejection")) {
    status = "uncertain_shot";
    reason = "camera_zoom";
  }
  // A front-foot shot goes down into the ball. Read as one while the head stayed tall, the
  // reading (often a contact found after the ball dropped) is contradicted: name nothing.
  const frontShot = cls.top === "front_foot_defence" || cls.top === "front_foot_drive";
  const drop = reading && Number.isFinite(reading.headDrop) ? reading.headDrop : NaN;
  if (status === "invalid_for_requested_analysis" && frontShot && Number.isFinite(drop) && drop <= th("bfd.min_tall_for_front_shot")) {
    status = "uncertain_shot";
    reason = "ambiguous";
  }
  if (status === "valid" && !wentBack(scene, features, reading)) {
    status = "uncertain_shot";
    reason = "not_back";
  }
  const bodyLed = status === "valid" && reason === "accepted_body";
  if (bodyLed) {
    const unseen = [!tracking.bat.ok && "bat", !tracking.ball.ok && "ball"].filter(Boolean).join(" and ");
    limitations.push({
      id: "lim_body_led",
      text: `The ${unseen} weren't seen, so the shot was confirmed from body and hand movement only. Measures that need the ${unseen} are not reported.`,
    });
  }
  limitations.push({ id: "lim_bfd_ranges", text: "Back-foot defence ranges are coaching geometry: no published measurements of the shot exist yet. Provisional." });

  const probs = Object.fromEntries(Object.entries(cls.probabilities).map(([k, v]) => [k, round(v, 3)])) as Record<ShotClass, number>;
  const decisiveIds = cls.decisive.map((d) => `feat_${d.feature}`);
  const keyEvents = (["bounce", "contact", "back_foot_commit", "front_foot_plant"] as const).map((t) => events.byType[t]?.id).filter((x): x is string => !!x);
  const evidenceFrames = [...new Set(events.list.filter((e) => e.type !== "setup" || events.list.length < 3).map((e) => e.frame))].slice(0, 8);
  const named =
    cls.top !== "unknown" &&
    cls.probabilities[cls.top] >= th("ffd.named_label.min_probability") &&
    !(cls.top === "leave" && features.values.contact_found === undefined) &&
    !(cls.top === "cut" && !tracking.bat.ok);
  const observed =
    status === "invalid_for_requested_analysis"
      ? {
          label: named ? cls.top : ("unknown" as ShotClass),
          display: named ? SHOT_DISPLAY[cls.top] : (cls.family ?? "a different shot"),
          probability: round(named ? cls.probabilities[cls.top] : 1 - cls.probabilities[target] - cls.probabilities.unknown, 2),
          evidence_ids: [...decisiveIds, ...keyEvents],
        }
      : status === "valid"
        ? { label: target as ShotClass, display: SHOT_DISPLAY[target], probability: round(cls.probabilities[target], 2), evidence_ids: [...features.list.map((f) => f.id).slice(0, 4), ...keyEvents] }
        : null;
  const common = {
    ...base,
    mode: "video" as const,
    observed_shot: observed,
    shot_probabilities: probs,
    classifier: { version: CLASSIFIER_VERSION, calibrated: false as const, evidenceCoverage: round(cls.ffdCoverage, 2) },
    delivery,
    events: events.list,
    features: features.list,
    limitations,
    evidence_frames: evidenceFrames,
  };

  if (status !== "valid") {
    const extra: string[] = [];
    if (reason === "camera_zoom") extra.push("Use footage from a fixed camera (a phone on a tripod) that doesn't zoom during the shot.");
    if (reason === "not_back") extra.push("Record the whole stroke, from the stance until after the bat meets the ball, side-on so going back can be seen.");
    if (reason === "body_hidden" || reason === "body_inconclusive")
      extra.push("Keep the bat and the ball's path in frame, or film side-on at hip height so the hands and both feet stay visible throughout.");
    if (reason === "ball_missing") extra.push("Keep the bounce area and the ball's path to the bat in frame.");
    if (reason === "bat_missing") extra.push("Keep the whole bat in view, or mark the bat handle and toe on three frames.");
    if (reason === "contact_hidden") extra.push("Keep the batter, bat and ball in view through the moment of contact.");
    if (reason === "insufficient_evidence" || reason === "ambiguous") extra.push("Film side-on at hip height with nobody between the camera and the batter.");
    const front = named && cls.top === "front_foot_defence";
    const headline =
      status === "invalid_for_requested_analysis"
        ? `This appears to be ${named ? `a ${SHOT_DISPLAY[cls.top].toLowerCase()}` : (cls.family ?? "a different shot")}, not a back-foot defence.${front ? " Analyse it as a front-foot defence instead." : ""}`
        : `We can't confirm a back-foot defence: ${BFD_UNCERTAIN[reason] ?? "the evidence is incomplete"}.`;
    const observations = status === "uncertain_shot" && reading ? ungradedBackFoot(backFootMetrics(reading, scene).filter((m) => m.status !== "not_measured")) : [];
    return {
      ...common,
      ...withheld,
      analysis_status: status,
      status_reason: reason,
      headline,
      metrics: [],
      ...(observations.length ? { observations } : {}),
      recapture: status === "uncertain_shot" ? [...extra, ...recapture] : recapture,
    };
  }

  const metrics = reading ? backFootMetrics(reading, scene) : BFD_METRICS.filter((d) => d.only !== "photo").map((d) => bfdNotVisible(d.id, "Not measured: the back foot and head weren't seen at contact."));
  const domains = domainResults(metrics);
  const index = techniqueIndex(metrics, domains);
  const { strengths, priorities } = strengthsAndPriorities(metrics);
  const plan = buildPlan(priorities, metrics) ?? nextLevelPlan(metrics);
  const headline = priorities[0] ? `Valid back-foot defence. To work on: ${priorities[0].title.toLowerCase()}.` : "Valid back-foot defence. Every check is in range.";
  return {
    ...common,
    analysis_status: "valid",
    status_reason: reason,
    evidence_basis: bodyLed ? "body" : "full",
    headline,
    metrics,
    ...(reading ? { back_foot: backFootSummary(reading) } : {}),
    domains,
    technique_index: index,
    strengths,
    priorities,
    drill_candidates: plan?.drills ?? [],
    plan,
    recapture,
  };
}

function ungradedBackFoot(ms: Metric[]): Metric[] {
  return ms.map((m) => ({
    ...m,
    status: "estimated",
    range: null,
    inRange: null,
    limitation: [m.limitation, "Not graded: the shot wasn't confirmed as a back-foot defence."].filter(Boolean).join(" "),
  }));
}

function bfdNotVisible(id: string, why: string): Metric {
  const def = BFD_METRICS.find((d) => d.id === id)!;
  return {
    id,
    name: def.name,
    domain: def.domain,
    status: "not_measured",
    value: null,
    uncertainty: null,
    unit: def.unit,
    decimals: def.decimals,
    confidence: 0,
    phase: "Photo",
    meaning: def.meaning,
    relevance: def.relevance,
    range: null,
    inRange: null,
    evidenceIds: [],
    reason: why,
  };
}

/** Measures that survive a photo taken at an angle: vertical ones (heights), which the angle doesn't shorten. */
const BFD_ANGLED = ["bfd_head_height", "bfd_elbow"];

/** One photo of a back-foot defence against its position formula. */
function backFootFromPhoto(photo: CaptureObservation, frame: number): { metrics: Metric[]; sideOn: boolean; angled: boolean; front: boolean; reading: BackFootReading | null } {
  const angled = photo.camera.view === "oblique";
  const front = photo.camera.view === "front_on" || photo.camera.view === "behind";
  const run = (o: CaptureObservation) => {
    const scene = buildScene(o);
    return { scene, reading: measureBackFoot(scene, 0, o.camera.view, o.athlete.handedness, { contactKnown: true }) };
  };
  let { scene, reading } = run(photo);
  // The bowler is on the front foot's side (the front foot comes alongside, still nearer the bowler).
  if (!front) {
    const fa = scene.get(0, "front_ankle");
    const ba = scene.get(0, "back_ankle");
    if (fa && ba && fa.f < ba.f) ({ scene, reading } = run({ ...photo, camera: { ...photo.camera, bowlerSide: photo.camera.bowlerSide === "left" ? "right" : "left" } }));
  }
  const sideOn = scene.plane === "sagittal";
  const ids = sideOn ? ["bfd_feet_gap", "bfd_head", "bfd_head_height", "bfd_elbow", "bfd_hands_eyes"] : front ? ["bfd_head", "bfd_head_height", "bfd_elbow", "bfd_hands_eyes"] : ["bfd_head_height", "bfd_elbow"];
  const read = reading ? backFootMetrics(reading, scene, { photo: true, evidenceFrame: frame }) : [];
  const metrics = ids.map((id) => {
    if (angled && !BFD_ANGLED.includes(id)) return bfdNotVisible(id, "Needs a side-on photo: from this angle the distance runs toward the camera, so it can't be read.");
    const m = read.find((x) => x.id === id);
    if (!m || m.status === "not_measured") return bfdNotVisible(id, m?.reason ?? "Not measured: the batter isn't fully visible in this photo.");
    const own = { ...m, phase: "Photo", limitation: [m.limitation, "One photo: the position at this moment, assumed to be contact."].filter(Boolean).join(" ") };
    // At an angle: shown, not graded (the position check needs a side-on photo or one from either end).
    if (!sideOn && !front) return { ...own, range: null, inRange: null, limitation: [own.limitation, "Photo at an angle: shown, not graded."].join(" ") };
    return own;
  });
  return { metrics, sideOn, angled, front, reading };
}

function backFootPhotoCheck(ms: Metric[], sideOn: boolean, angled: boolean, front: boolean, r: BackFootReading | null): NonNullable<AnalysisPayload["position_check"]> extends infer T ? Omit<T & object, "frame"> : never {
  const graded = ms.filter((m) => m.inRange !== null);
  const met = graded.filter((m) => m.inRange).length;
  const checked = graded.length;
  const grade = () => (met === checked ? "matches" : met >= checked - 1 ? "mostly" : met >= checked * th("photo.min_resemblance") ? "partly" : "doesnt_match") as "matches" | "mostly" | "partly" | "doesnt_match";
  // At an angle only heights survive: too little to judge a back-foot position on.
  if (angled || (!sideOn && !front)) return { met, checked, verdict: "not_side_on" };
  // Down in a stride (the front foot well out, the head low) is a front-foot position.
  const down = r && Number.isFinite(r.headHeight) && r.headHeight < th(front ? "bfd.photo.min_head_height_front" : "bfd.photo.min_head_height");
  const out = r && Number.isFinite(r.at.front_ankle) && r.at.front_ankle > th("bfd.photo.max_alongside");
  if (front) {
    if (checked < 3) return { met, checked, verdict: "not_enough" };
    if (down) return { met, checked, verdict: "not_on_back_foot" };
    return { met, checked, verdict: grade() };
  }
  if (checked < 3) return { met, checked, verdict: "not_enough" };
  if (down && out) return { met, checked, verdict: "not_on_back_foot" };
  return { met, checked, verdict: grade() };
}

function backFootPhotos(obs: CaptureObservation, base: Base, withheld: Withheld, limitations: Limitation[]): Omit<AnalysisPayload, "result_hash"> {
  const frames = obs.body.length;
  const per = Array.from({ length: frames }, (_, i) => backFootFromPhoto(single(obs, i), i));
  const perPhoto = per.map((x) => x.metrics);
  const phases = obs.photoPhases ?? [];
  const key = keyPhoto(phases, perPhoto);
  const set = frames > 1;
  const k = per[key];
  const metrics = k?.metrics ?? [];
  const check = backFootPhotoCheck(metrics, k?.sideOn ?? false, k?.angled ?? false, k?.front ?? false, k?.reading ?? null);
  const graded = check.verdict !== "not_side_on" && check.verdict !== "not_enough" && check.verdict !== "not_on_back_foot";
  const { strengths, priorities } = graded ? strengthsAndPriorities(metrics) : { strengths: [], priorities: [] };
  const plan = graded ? buildPlan(priorities, metrics) : null;
  const which = set ? `photo ${key + 1} of ${frames}` : "this photo";
  const how = check.angled ? "from an angle" : k?.front ? "from along the pitch" : "";
  const tag = set ? ` (photo ${key + 1} of ${frames}${how ? `, ${how}` : ""})` : how ? ` (photo ${how})` : "";
  const off = metrics.filter((m) => m.inRange === false).map((m) => m.name.toLowerCase());
  const Which = `${which[0]!.toUpperCase()}${which.slice(1)}`;
  const headline =
    check.verdict === "matches"
      ? `Back-foot defence position${tag}: all ${check.checked} checks met.`
      : check.verdict === "mostly"
        ? `Back-foot defence position${tag}: ${check.met} of ${check.checked} checks met. To work on: ${off[0]}.`
        : check.verdict === "partly"
          ? `Back-foot defence position${tag}: ${check.met} of ${check.checked} checks met. To work on: ${off.slice(0, 2).join(" and ")}.`
          : check.verdict === "doesnt_match"
            ? `${Which} doesn't look like a back-foot defence position: ${check.met} of ${check.checked} checks met.`
            : check.verdict === "not_on_back_foot"
              ? k?.front
                ? `${Which} doesn't show a back-foot defence: the head is down low, as in a front-foot shot.`
                : `${Which} doesn't show a back-foot defence: the front foot has strided forward and the head is down, as in a front-foot shot.`
              : check.verdict === "not_enough"
                ? "Not enough of the batter is visible to check the back-foot defence position."
                : "Photo taken at an angle: the back-foot defence check needs a side-on photo. Heights shown, not graded.";
  return {
    ...base,
    ...withheld,
    strengths,
    priorities,
    plan,
    drill_candidates: plan?.drills ?? [],
    mode: "posture_screen",
    analysis_status: "uncertain_shot",
    status_reason: "photo_only",
    headline,
    position_check: { ...check, frame: key },
    ...(k?.reading ? { back_foot: { ...backFootSummary(k.reading), referenceFrame: key } } : {}),
    observed_shot: null,
    shot_probabilities: null,
    classifier: null,
    delivery: { ...EMPTY_DELIVERY, reason: "Photos cannot show ball flight." },
    events: [],
    features: [],
    metrics,
    limitations: [
      ...limitations,
      { id: "lim_photo", text: "A photo checks the position at one moment, taken to be contact. It can't show going back, timing, the bat's path or the ball, so it never confirms the shot itself." },
      { id: "lim_bfd_ranges", text: "Back-foot defence ranges are coaching geometry: no published measurements of the shot exist yet. Provisional." },
      ...(set ? [{ id: "lim_photo_set", text: "Each photo is measured on its own; photos are not treated as one continuous movement." }] : []),
    ],
    recapture: [
      ...(check.verdict === "not_side_on" || check.angled ? ["Take a side-on photo at the moment of contact to check the feet, head and hands too."] : []),
      "Record a short video of the whole delivery to check going back, the timing and soft hands.",
    ],
    evidence_frames: set ? Array.from({ length: Math.min(frames, 12) }, (_, i) => i) : [0],
    ...(set
      ? {
          photo_set: perPhoto.map((observations, i) => ({
            frame: i,
            phase: phases[i] ?? null,
            observations,
            ...(observations.every((m) => m.status === "not_measured") ? { note: "Batter not fully visible in this photo." } : {}),
          })),
        }
      : {}),
  };
}
