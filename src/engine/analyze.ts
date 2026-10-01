// Orchestrator. Decision order (never reordered):
//   1. Is the capture usable?
//   2. Can body, bat, ball and pitch be tracked?
//   3. What delivery context occurred?
//   4. What shot family was attempted?
//   5. Is it compatible with the requested analysis?
//   6. Only then: how was it executed?
// The same observation + engine version always yields the same payload (result_hash).

import { canonicalJson, round, sha256 } from "./math";
import {
  CLASSIFIER_VERSION,
  ENGINE_VERSION,
  METRIC_VERSION,
  METRICS,
  POSE_MODEL,
  REGISTRY_HASH,
  th,
} from "./registry";
import { assessCapture, bodyCoverage } from "./quality";
import { buildScene } from "./scene";
import { segmentEvents } from "./events";
import { estimateDelivery } from "./delivery";
import { extractFeatures } from "./features";
import { classify, SHOT_DISPLAY, type Classification } from "./classify";
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
  L.push({ id: "lim_ranges", text: "Coaching ranges are provisional (coach-authored, v0.1) and not population norms." });
  if (!tracking.depth.available)
    L.push({ id: "lim_depth", text: "Single camera: depth-sensitive values (angles, lateral gaps) are estimates." });
  if (scene.plane === "frontal")
    L.push({
      id: "lim_view",
      text: "Filmed along the pitch: forward distances come from a 3D pose estimate, and bounce distance, bat speed and ball speed are not measured.",
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
): { status: AnalysisStatus; reason: string } {
  const p = cls.probabilities;
  const pFfd = p.front_foot_defence;
  const nonFfdNamed = Object.entries(p)
    .filter(([k]) => k !== "front_foot_defence" && k !== "unknown")
    .reduce((s, [, v]) => s + v, 0);

  // Rejection may rest on fewer modalities than acceptance (asymmetric gate).
  if (pFfd <= th("ffd.reject.max_probability") && nonFfdNamed >= 0.75 && cls.ffdCoverage >= th("ffd.reject.min_evidence_coverage")) {
    return { status: "invalid_for_requested_analysis", reason: "different_shot" };
  }

  // Filmed along the pitch some signals are unobservable by geometry (not by tracking
  // failure); acceptance then demands nearly all of the remaining evidence instead.
  const frontal = obs.camera.view === "front_on" || obs.camera.view === "behind";
  const minCoverage = th(frontal ? "ffd.accept.min_evidence_coverage_frontal" : "ffd.accept.min_evidence_coverage");
  const accept =
    tracking.body.ok &&
    tracking.bat.ok &&
    tracking.ball.ok &&
    pFfd >= th("ffd.accept.min_probability") &&
    cls.top === "front_foot_defence" &&
    cls.margin >= th("ffd.accept.min_margin") &&
    p.unknown <= th("ffd.accept.max_unknown") &&
    cls.ffdCoverage >= minCoverage;
  if (accept) return { status: "valid", reason: "accepted" };

  if (!tracking.ball.ok) return { status: "uncertain_shot", reason: "ball_missing" };
  if (!tracking.bat.ok) return { status: "uncertain_shot", reason: "bat_missing" };
  if (cls.ffdCoverage < minCoverage) return { status: "uncertain_shot", reason: "insufficient_evidence" };
  if (p.unknown > th("ffd.accept.max_unknown")) return { status: "uncertain_shot", reason: "out_of_distribution" };
  return { status: "uncertain_shot", reason: "ambiguous" };
}

const UNCERTAIN_TEXT: Record<string, string> = {
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
// Photos never report weight transfer: one frame cannot show where the weight is going.
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

/** Posture observations from one photo (never "contact": the moment isn't confirmed). */
function postureFromPhoto(photo: CaptureObservation): Metric[] {
  if (bodyCoverage(photo).coverage < 1) {
    return POSTURE_IDS.map((id) => {
      const m = computeMetricsSafe(photo).find((x) => x.id === id);
      return m && m.status !== "not_measured" ? photoOnly(m) : notVisible(id);
    });
  }
  return computeMetricsSafe(photo)
    .filter((m) => POSTURE_IDS.includes(m.id))
    .map((m) => (m.status === "not_measured" ? m : photoOnly(m)));
}

function computeMetricsSafe(photo: CaptureObservation): Metric[] {
  const scene = buildScene(photo);
  const events = { list: [], byType: {} };
  const delivery = estimateDelivery(scene, events);
  const features = extractFeatures(scene, events, { ...delivery, available: false, length: null });
  return computeMetrics({ scene, events, features, delivery, tier: photo.tier, postureFrame: 0 });
}

function photoOnly(m: Metric): Metric {
  return {
    ...m,
    status: "estimated",
    phase: "Single photo",
    inRange: null,
    limitation: [m.limitation, "Photo: one moment, not confirmed as contact. Shown as a posture observation only."].filter(Boolean).join(" "),
  };
}

function notVisible(id: string): Metric {
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
    phase: "Single photo",
    meaning: def.meaning,
    relevance: def.relevance,
    range: null,
    inRange: null,
    evidenceIds: [],
    reason: "Not measured: the batter isn't fully visible in this photo.",
  };
}

/** Which photo of a set carries the headline measures: the one tagged contact, then stride. */
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

  // Photo(s): posture screen only. No shot identity, timing, bat speed or ball claims.
  if (obs.media.kind === "photo") {
    const frames = obs.body.length;
    const perPhoto = Array.from({ length: frames }, (_, i) => postureFromPhoto(single(obs, i)));
    const phases = obs.photoPhases ?? [];
    const key = keyPhoto(phases, perPhoto);
    const set = frames > 1;
    return finish({
      ...base,
      ...withheld,
      mode: "posture_screen",
      analysis_status: "uncertain_shot",
      status_reason: "photo_only",
      headline: set
        ? `Posture screen from ${frames} photos — photos can't show shot type, timing, bat or ball.`
        : "Posture screen only — a photo can't show shot type, timing, bat or ball.",
      observed_shot: null,
      shot_probabilities: null,
      classifier: null,
      delivery: { ...EMPTY_DELIVERY, reason: "Photos cannot show ball flight." },
      events: [],
      features: [],
      metrics: perPhoto[key] ?? [],
      limitations: [
        ...limitations,
        { id: "lim_photo", text: "Photo mode never reports shot identity, timing, bat speed, ball length or weight transfer." },
        ...(set ? [{ id: "lim_photo_set", text: "Each photo is measured on its own; photos are not treated as one continuous movement." }] : []),
      ],
      recapture: ["Record a short video of the whole delivery in slow-motion mode.", ...recapture.filter((r) => !r.startsWith("Record a short video"))],
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
  const cls = classify(features);
  const { status, reason } = statusOf(obs, cls, tracking);

  const probs = Object.fromEntries(Object.entries(cls.probabilities).map(([k, v]) => [k, round(v, 3)])) as Record<ShotClass, number>;
  const decisiveIds = cls.decisive.map((d) => `feat_${d.feature}`);
  const keyEvents = (["bounce", "contact", "front_foot_plant", "back_foot_commit"] as const)
    .map((t) => events.byType[t]?.id)
    .filter((x): x is string => !!x);
  const evidenceFrames = [...new Set(events.list.filter((e) => e.type !== "setup" || events.list.length < 3).map((e) => e.frame))].slice(0, 8);

  const named = cls.top !== "unknown" && cls.probabilities[cls.top] >= th("ffd.named_label.min_probability");
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
    if (reason === "ball_missing") extraRecapture.push("Keep the bounce area and the ball's path to the bat in frame.");
    if (reason === "bat_missing") extraRecapture.push("Keep the whole bat in view, or mark the bat handle and toe on three frames.");
    if (reason === "insufficient_evidence" || reason === "ambiguous") extraRecapture.push("Film side-on at hip height with nobody between the camera and the batter.");
    const headline =
      status === "invalid_for_requested_analysis"
        ? `This appears to be ${named ? `a ${SHOT_DISPLAY[cls.top].toLowerCase()}` : (cls.family ?? "a different shot")}, not a front-foot defence.`
        : `We can't confirm a front-foot defence: ${UNCERTAIN_TEXT[reason] ?? "the evidence is incomplete"}.`;
    // Uncertain (never a different shot): neutral body observations, ungraded.
    const observations =
      status === "uncertain_shot"
        ? ungraded(computeMetrics({ scene, events, features, delivery, tier: obs.tier }).filter((m) => OBSERVATION_IDS.includes(m.id) && m.status !== "not_measured"))
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

  // 6. Valid: technique measures.
  const metrics = computeMetrics({ scene, events, features, delivery, tier: obs.tier });
  const domains = domainResults(metrics);
  const index = techniqueIndex(metrics, domains);
  const { strengths, priorities } = strengthsAndPriorities(metrics);
  const plan = buildPlan(priorities, metrics);
  const headline = priorities[0]
    ? `Valid front-foot defence. Main priority: ${priorities[0].title.toLowerCase()}.`
    : "Valid front-foot defence. All measured indicators are within the current coaching range.";

  return finish({
    ...common,
    analysis_status: "valid",
    status_reason: reason,
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
