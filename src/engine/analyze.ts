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
  CLASSIFIER_VERSION,
  ENGINE_VERSION,
  METRIC_VERSION,
  METRICS,
  POSE_MODEL,
  RANGE_SOURCE,
  REGISTRY_HASH,
  th,
} from "./registry";
import { FRONTAL_UNGRADED, frontalMetrics, withholdAlongPitch } from "./frontal";
import { assessCapture, bodyCoverage } from "./quality";
import { buildScene } from "./scene";
import { handsSeries, segmentEvents } from "./events";
import { estimateDelivery } from "./delivery";
import { extractFeatures } from "./features";
import { classify, leadingAlternative, SHOT_DISPLAY, type Classification } from "./classify";
import { computeMetrics } from "./metrics";
import { buildPlan, domainResults, strengthsAndPriorities, techniqueIndex } from "./scoring";
import type {
  AnalysisPayload,
  AnalysisStatus,
  CaptureObservation,
  Limitation,
  Metric,
  ShotClass,
  TrackingSummary,
} from "./types";

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

const UNCERTAIN_TEXT: Record<string, string> = {
  no_stroke: "no batting stroke was found in the clip",
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
const OBSERVATION_IDS = ["stride_length", "front_knee_flexion", "head_knee_offset", "trunk_inclination", "weight_forward"];
/**
 * The front-foot defence position formula: every check one side-on frame can measure.
 * Photos are graded against it; the shot itself (timing, bat path, ball) needs a video.
 */
export const POSITION_FORMULA = ["foot_spread", "front_knee_flexion", "back_knee_extension", "head_knee_offset", "trunk_inclination", "weight_forward", "hands_ahead_of_knee"];
// Filmed along the pitch, forward distances and leg angles are foreshortened: shown, not graded.
const POSTURE_IDS = ["front_knee_flexion", "head_knee_offset", "trunk_inclination"];

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

function positionFromPhoto(photo: CaptureObservation, frame: number): { metrics: Metric[]; sideOn: boolean; angled: boolean } {
  const angled = photo.camera.view === "oblique";
  const read = computeMetricsSafe(photo);
  const { metrics } = read;
  const sideOn = read.sideOn;
  const ids = sideOn ? POSITION_FORMULA : POSTURE_IDS;
  const out = ids.map((id) => {
    const m = metrics.find((x) => x.id === id);
    if (angled && !ANGLED_FORMULA.includes(id)) return notVisible(id, "Needs a side-on photo: from this angle the stride runs toward the camera, so this distance can't be read.");
    if (!m || m.status === "not_measured") return notVisible(id, m?.reason);
    // Evidence points at this photo within the set.
    const own = { ...m, evidenceIds: m.evidenceIds.map((e) => (e === "frame_0" ? `frame_${frame}` : e)) };
    if (!sideOn) return photoOnly(own);
    return angled ? photoAngled(own) : photoGraded(own);
  });
  return { metrics: out, sideOn, angled };
}

function computeMetricsSafe(photo: CaptureObservation): { metrics: Metric[]; sideOn: boolean } {
  const run = (o: CaptureObservation) => {
    const scene = buildScene(o);
    const events = { list: [], byType: {} };
    const delivery = estimateDelivery(scene, events);
    const features = extractFeatures(scene, events, { ...delivery, available: false, length: null });
    return { scene, metrics: computeMetrics({ scene, events, features, delivery, tier: o.tier, postureFrame: 0 }) };
  };
  let { scene, metrics } = run(photo);
  // The bowler is on the front foot's side: in a stance and in every stroke the front foot
  // is the one nearer the bowler. (Where the head points misleads: a batter looks down at
  // the ball.) Not for photos along the pitch, where forward isn't across the image.
  if (photo.camera.view !== "front_on" && photo.camera.view !== "behind") {
    const fa = scene.get(0, "front_ankle");
    const ba = scene.get(0, "back_ankle");
    if (fa && ba && fa.f < ba.f) ({ scene, metrics } = run({ ...photo, camera: { ...photo.camera, bowlerSide: photo.camera.bowlerSide === "left" ? "right" : "left" } }));
  }
  return { metrics, sideOn: scene.plane === "sagittal" };
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
  verdict: "matches" | "mostly" | "partly" | "doesnt_match" | "not_on_front_foot" | "not_enough" | "not_side_on";
}

/** The formula's verdict: how many of the checks this photo could measure are met. */
export function positionCheck(ms: Metric[], sideOn: boolean, angled = false): PositionCheck {
  const graded = ms.filter((m) => m.inRange !== null);
  const met = graded.filter((m) => m.inRange).length;
  const checked = graded.length;
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
  const tag = photos > 1 ? ` (photo ${key + 1} of ${photos}${c.angled ? ", from an angle" : ""})` : c.angled ? " (photo from an angle)" : "";
  const off = ms.filter((m) => m.inRange === false).map((m) => m.name.toLowerCase());
  switch (c.verdict) {
    case "matches":
      return `Front-foot defence position${tag}: all ${c.checked} checks met.`;
    case "mostly":
      return `Front-foot defence position${tag}: ${c.met} of ${c.checked} checks met. To work on: ${off[0]}.`;
    case "partly":
      return `Front-foot defence position${tag}: ${c.met} of ${c.checked} checks met. To work on: ${off.slice(0, 2).join(" and ")}.`;
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
  const def = METRICS.find((d) => d.id === id)!;
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
    requested_shot: "front_foot_defence" as const,
    capture,
    capture_confidence: round(capture.confidence, 2),
    tracking,
    handedness: obs.athlete.handedness,
    versions: {
      engine: ENGINE_VERSION,
      metric_version: METRIC_VERSION,
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
      headline: `This recording can't be analysed yet: ${(failing[0]?.label ?? "batter not tracked").toLowerCase()}.`,
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
    const check = positionCheck(metrics, per[key]?.sideOn ?? false, per[key]?.angled ?? false);
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
      headline: `We can't confirm a front-foot defence: ${UNCERTAIN_TEXT.no_stroke}.`,
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
  const cls = classify(features, { frontal, batSeen: tracking.bat.ok, cameraMoving: scene.cameraMoving });
  const { status, reason } = statusOf(obs, cls, tracking, contactVisibility(scene, events.byType.contact?.frame), contactObserved(scene, events.byType.contact?.frame));
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
              ? frontalMetrics(scene, events.byType.contact?.frame, RANGE_SOURCE).filter((m) => m.status !== "not_measured")
              : computeMetrics({ scene, events, features, delivery, tier: obs.tier }).filter((m) => OBSERVATION_IDS.includes(m.id) && m.status !== "not_measured"),
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
  let metrics = computeMetrics({ scene, events, features, delivery, tier: obs.tier });
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
  const plan = buildPlan(priorities, metrics);
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
    domains,
    technique_index: index,
    strengths,
    priorities,
    drill_candidates: plan?.drills ?? [],
    plan,
    recapture,
  });
}
