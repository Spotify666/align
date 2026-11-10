// AnalysisResult: the typed, versioned contract the explanation layer reads.
//
// It is a deterministic projection of the stored analysis payload (and, when at hand, the
// observation it was made from): it measures nothing new about technique and overrides nothing.
// What it adds is structure the payload leaves implicit:
//   - the open-set outcome of identification (accepted / another shot / unknown / ambiguous /
//     insufficient evidence / capture failed), with alternatives;
//   - every phase of the category as an event with state (detected, inferred, corrected,
//     missing), confidence, timing uncertainty, evidence sources and limitations;
//   - whether the phases are in a possible order, and why two fall on one frame;
//   - each measure with its availability, whether it was graded, and the events and frames it
//     was read from;
//   - claims that were withheld, and why;
//   - separate confidence per layer (capture, subject, action, events, measures). There is
//     deliberately no single overall confidence.
//
// The legacy payload (`align.analysis/1`) stays the stored format and is not changed by this.

import { downsample } from "./eval/transforms";
import { detectEvents } from "./events";
import { ACTION_OUTCOMES, CATEGORY_SCHEMA, categoryOf, type ActionOutcome, type CategorySpec, type PhaseSpec, type Signal, type ViewSupport } from "./category";
import { canonicalJson, round, sha256 } from "./math";
import { th } from "./registry";
import { buildScene, type Scene } from "./scene";
import { assessTimebase, TIMEBASE_VERSION, type Timebase } from "./timebase";
import { SHOT_CLASSES, TARGET_SHOTS, type AnalysisPayload, type CameraView, type CaptureObservation, type CaptureQuality, type EventType, type Handedness, type Limitation, type Metric, type ShotClass, type TargetShot } from "./types";

export const RESULT_SCHEMA = "aline.result/1" as const;
/** The uncertainty model is a stated heuristic. It has not been fitted to hand-labelled frames. */
export const UNCERTAINTY_MODEL = "event-uncertainty-0.2.0" as const;
/**
 * The engine's own bar between an event that was seen and one that was estimated: analyze.ts
 * treats contact as known from this confidence up, and reads the line at the set position below it.
 */
export const DETECTED_MIN_CONFIDENCE = 0.65;

export type EventState = "detected" | "inferred" | "corrected" | "missing";

export interface EventResult {
  id: string;
  type: EventType;
  label: string;
  required: boolean;
  state: EventState;
  frame: number | null;
  tMs: number | null;
  /** 0 when missing. */
  confidence: number;
  /** ± around the frame; null when missing. `ms` is null when the frame interval is unknown. */
  uncertainty: { frames: number; ms: number | null; parts: { resolution: number; method: number; visibility: number; stability: number | null } } | null;
  /**
   * Did the marker stay put when the same clip was read again at half its frame rate (both
   * halves)? false: it moved further than the stretch its detector reads, so it is approximate.
   * null: not checked (a photo, too few frames, or the marker was placed by a later step).
   */
  stable: boolean | null;
  /** Share of the frames around the moment in which the body parts it rests on were seen. */
  visibility: number | null;
  sources: Signal[];
  method: string;
  limitation?: string;
}

export interface PhaseOrderIssue {
  kind: "out_of_order" | "coincident";
  a: EventType;
  b: EventType;
  /** A coincidence the category expects, with its reason; an unexplained one lowers trust in both events. */
  explained: boolean;
  text: string;
}

export interface MetricResult {
  id: string;
  name: string;
  domain: Metric["domain"];
  availability: "measured" | "estimated" | "withheld";
  /** Compared with a range. Never true unless the action was accepted (or a photo's position check). */
  graded: boolean;
  value: number | null;
  unit: string;
  uncertainty: number | null;
  confidence: number;
  inRange: boolean | null;
  phase: string;
  /** Events it was read at, and the frames it was read from. */
  eventRefs: string[];
  frames: number[];
  /** Lowest confidence among the events it rests on (null when it rests on none). */
  eventConfidence: number | null;
  reason?: string;
  limitation?: string;
}

export interface AnalysisResult {
  schema: typeof RESULT_SCHEMA;
  analysis_id: string;
  demo: boolean;
  mode: AnalysisPayload["mode"];
  category: { schema: typeof CATEGORY_SCHEMA; id: TargetShot; version: string; name: string };
  /** What the athlete said they meant to play. Recorded; never the classifier's ground truth. */
  intended: TargetShot;
  capture: {
    status: CaptureQuality["status"];
    confidence: number;
    checks: CaptureQuality["checks"];
    timebase: Timebase | null;
    recapture: string[];
  };
  subject: {
    handedness: Handedness;
    handednessSource: "declared_or_grip";
    people: number | null;
    bodyCoverage: number;
    bodyConfidence: number;
    view: CameraView | null;
    viewSupport: ViewSupport | null;
    viewNote: string | null;
  };
  action: {
    outcome: ActionOutcome;
    accepted: boolean;
    label: ShotClass | null;
    display: string | null;
    /** Uncalibrated model probability of the named action; null when none was named. */
    probability: number | null;
    calibrated: false;
    basis: "body_bat_ball" | "body_only" | null;
    evidenceCoverage: number | null;
    alternatives: Array<{ label: ShotClass; probability: number; supported: boolean }>;
    reason: { code: string; text: string };
  };
  events: EventResult[];
  phaseOrder: { valid: boolean; issues: PhaseOrderIssue[] };
  metrics: MetricResult[];
  /** Claims the report does not make, and why. */
  withheld: Array<{ claim: string; reason: string }>;
  limitations: Limitation[];
  /** One value per layer, 0–1; null where the layer produced nothing. No overall figure. */
  confidence: {
    capture: number;
    subject: number;
    action: number | null;
    events: { lowest: number; mean: number } | null;
    metrics: { mean: number; measured: number; withheld: number } | null;
  };
  versions: {
    contract: typeof RESULT_SCHEMA;
    engine: string;
    category: string;
    metrics: string;
    classifier: string;
    registry_hash: string;
    pose_model: string;
    uncertainty_model: typeof UNCERTAINTY_MODEL;
    timebase: typeof TIMEBASE_VERSION;
  };
  reproducibility: { input_hash: string; payload_hash: string; result_hash: string };
}

/** A duration for a report screen: seconds, never milliseconds. */
const secs = (ms: number) => `${ms >= 95 ? (ms / 1000).toFixed(1) : (ms / 1000).toFixed(2)} s`;

const SIGNAL_WORD: Record<Signal, string> = { body: "the body", bat: "the bat", ball: "the ball", pitch_scale: "the pitch markings", depth: "depth", user_mark: "a mark you placed" };
const words = (xs: Signal[]) => xs.map((s) => SIGNAL_WORD[s]).join(" and ");

/** The open-set outcome of identification, from the payload's status and the category's abstention policy. */
export function actionOutcome(p: AnalysisPayload, spec: CategorySpec): ActionOutcome {
  if (p.analysis_status === "capture_failed") return "capture_failed";
  if (p.analysis_status === "valid") return "accepted";
  if (p.analysis_status === "invalid_for_requested_analysis") {
    const label = p.observed_shot?.label ?? "unknown";
    if (label === "unknown") return "unknown_action";
    return (TARGET_SHOTS as readonly string[]).includes(label) && label !== (p.requested_shot ?? "front_foot_defence") ? "recognised_other_supported" : "recognised_unsupported";
  }
  return spec.abstention[p.status_reason]?.outcome ?? "insufficient_evidence";
}

/**
 * How far each raw detector's marker moves (ms) when the same clip is read at half its frame
 * rate, taking the even frames and then the odd ones: the detector's sensitivity on this clip,
 * measured rather than assumed. Only for markers the detector itself placed at full rate.
 */
function detectorStability(obs: CaptureObservation | undefined, scene: Scene | null, p: AnalysisPayload): Map<EventType, number> {
  const out = new Map<EventType, number>();
  const fps = obs?.media.fps;
  if (!obs || !scene || !fps || fps / 2 < th("capture.min_fps_any") || obs.t.length < 12) return out;
  const full = detectEvents(obs, scene).byType;
  const halves = [0, 1].map((offset) => {
    const half = downsample(obs, 2, offset);
    return { byType: detectEvents(half, buildScene(half)).byType, t: half.t };
  });
  for (const e of p.events ?? []) {
    const raw = full[e.type];
    if (!raw || raw.frame !== e.frame) continue;
    const tFull = obs.t[e.frame]!;
    let worst = 0;
    for (const h of halves) {
      const eh = h.byType[e.type];
      // Not found at half rate: as unstable as the clip is long.
      worst = Math.max(worst, eh ? Math.abs(h.t[eh.frame]! - tFull) : obs.t[obs.t.length - 1]! - obs.t[0]!);
    }
    out.set(e.type, worst);
  }
  return out;
}

function visibilityAround(scene: Scene | null, phase: PhaseSpec, frame: number, half: number): { share: number | null; hidden: number } {
  if (!scene || !phase.joints.length) return { share: null, hidden: 0 };
  let seen = 0;
  let total = 0;
  for (let i = Math.max(0, frame - half); i <= Math.min(scene.n - 1, frame + half); i++) {
    total++;
    if (phase.joints.every((j) => scene.get(i, j))) seen++;
  }
  return { share: total ? seen / total : null, hidden: total - seen };
}

/**
 * Every phase of the category as an event result. Uncertainty (± frames) is the sum of:
 *   resolution  half a frame: nothing is seen between frames;
 *   method      (1 − confidence) × the stretch the detector reads (the less sure, the more of
 *               that stretch the true moment may lie in); one frame for a mark placed by hand;
 *   visibility  half the frames around the moment in which the body parts it rests on were hidden.
 * or, when larger, how far the marker moved on re-reading the clip at half its frame rate
 * (stability, measured on this clip). In ms it also carries the timestamps' jitter.
 * The first three are a stated heuristic, not fitted to labelled frames: see UNCERTAINTY_MODEL.
 */
export function eventResults(p: AnalysisPayload, spec: CategorySpec, obs?: CaptureObservation, timebase?: Timebase | null): EventResult[] {
  const scene = obs && obs.media.kind === "video" ? buildScene(obs) : null;
  const dtMs = scene?.dt ? scene.dt * 1000 : frameIntervalMs(p);
  const available = new Set<Signal>(["body"]);
  if (p.tracking.bat.ok) available.add("bat");
  if (p.tracking.ball.ok) available.add("ball");
  const video = p.mode === "video" && p.analysis_status !== "capture_failed";
  const stability = detectorStability(obs, scene, p);

  return spec.phases.map((phase) => {
    const e = (p.events ?? []).find((x) => x.type === phase.event);
    const base = { id: `evt_${phase.event}`, type: phase.event, label: phase.label, required: phase.required };
    if (!e) {
      const why = !video ? (p.mode === "posture_screen" ? "A photo shows one moment: the phases of the movement need a video." : "Not assessed: the recording couldn't be analysed.") : phase.unavailable;
      return { ...base, state: "missing" as const, frame: null, tMs: null, confidence: 0, uncertainty: null, stable: null, visibility: null, sources: [], method: "not found", limitation: why };
    }
    const marked =
      (phase.event === "contact" && obs?.marks?.contactFrame === e.frame) || (phase.event === "bounce" && obs?.marks?.bounceFrame === e.frame && !p.tracking.ball.ok) || /marked by/.test(e.method);
    const movedMs = marked ? undefined : stability.get(phase.event);
    // Seen directly only if it also stays put on a second reading of the clip.
    const stable = movedMs === undefined ? null : movedMs <= phase.windowS * 1000;
    const state: EventState = marked ? "corrected" : e.confidence >= DETECTED_MIN_CONFIDENCE && stable !== false ? "detected" : "inferred";
    const primary = phase.primary.filter((s) => available.has(s));
    const fallback = phase.fallback.filter((s) => available.has(s));
    const sources: Signal[] = state === "corrected" ? ["user_mark"] : state === "detected" && primary.length ? primary : fallback.length ? fallback : primary.length ? primary : ["body"];
    const half = dtMs ? Math.max(1, Math.round((phase.windowS * 1000) / dtMs)) : 1;
    const vis = visibilityAround(scene, phase, e.frame, half);
    const parts = {
      resolution: 0.5,
      method: state === "corrected" ? 1 : round((1 - e.confidence) * half, 2),
      visibility: round(vis.hidden / 2, 2),
      stability: movedMs === undefined || !dtMs ? null : round(movedMs / dtMs, 1),
    };
    const frames = round(Math.max(parts.resolution + parts.method + parts.visibility, parts.resolution + (parts.stability ?? 0)), 1);
    const ms = dtMs ? Math.round(frames * dtMs + (timebase?.jitterMs ?? 0)) : null;
    const notes: string[] = [];
    const unseen = phase.primary.filter((s) => !available.has(s));
    if (state === "inferred" && stable !== false) notes.push(unseen.length ? `Estimated from ${words(sources)}: ${words(unseen)} ${unseen.length > 1 ? "weren't" : "wasn't"} tracked.` : "Estimated: the signal was weak.");
    if (stable === false) notes.push(`Approximate: this marker moved by ${secs(movedMs!)} when the same clip was read at half its frame rate.`);
    if (vis.share !== null && vis.share < 0.7) notes.push("Part of the body it rests on was hidden around this moment.");
    if (dtMs && dtMs > 1000 / th("capture.min_fps_timing")) notes.push(`At this frame rate the frames are ${secs(dtMs)} apart.`);
    return {
      ...base,
      state,
      frame: e.frame,
      tMs: e.tMs,
      confidence: e.confidence,
      uncertainty: { frames, ms, parts },
      stable,
      visibility: vis.share === null ? null : round(vis.share, 2),
      sources,
      method: e.method,
      ...(notes.length ? { limitation: notes.join(" ") } : {}),
    };
  });
}

/** Frame interval from the events themselves, for a payload read without its observation. */
function frameIntervalMs(p: AnalysisPayload): number | null {
  const es = [...(p.events ?? [])].sort((a, b) => a.frame - b.frame);
  const first = es[0];
  const last = es[es.length - 1];
  return first && last && last.frame > first.frame ? (last.tMs - first.tMs) / (last.frame - first.frame) : null;
}

/** Are the phases in a possible order, and is every coincidence one the category expects? */
export function checkPhaseOrder(events: EventResult[], spec: CategorySpec): { valid: boolean; issues: PhaseOrderIssue[] } {
  const by = new Map(events.filter((e) => e.frame !== null).map((e) => [e.type, e]));
  const issues: PhaseOrderIssue[] = [];
  for (const [a, b] of spec.order) {
    const ea = by.get(a);
    const eb = by.get(b);
    if (!ea || !eb) continue;
    const slack = (ea.uncertainty?.frames ?? 0) + (eb.uncertainty?.frames ?? 0);
    if (ea.frame! - eb.frame! > slack) {
      issues.push({ kind: "out_of_order", a, b, explained: false, text: `${ea.label} was placed after ${eb.label}, which can't be: one of the two is wrong, so measures that rest on them are less sure.` });
    } else if (ea.frame === eb.frame) {
      const known = spec.mayCoincide.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
      issues.push({
        kind: "coincident",
        a,
        b,
        explained: !!known,
        text: known ? `${ea.label} and ${eb.label} fall on the same frame. ${known.why}` : `${ea.label} and ${eb.label} fall on the same frame and couldn't be told apart.`,
      });
    }
  }
  return { valid: issues.every((i) => i.kind !== "out_of_order"), issues };
}

function metricResults(p: AnalysisPayload, events: EventResult[], accepted: boolean): MetricResult[] {
  const gradedMode = accepted || p.mode === "posture_screen";
  const list = (accepted || p.mode === "posture_screen" ? p.metrics : p.observations) ?? [];
  return list.map((m) => {
    const ids = m.evidenceIds ?? [];
    const eventRefs = ids.filter((id) => id.startsWith("evt_"));
    const frames = ids.filter((id) => id.startsWith("frame_")).map((id) => Number(id.slice(6))).filter(Number.isFinite);
    const refd = eventRefs.map((id) => events.find((e) => e.id === id)).filter((e): e is EventResult => !!e && e.state !== "missing");
    return {
      id: m.id,
      name: m.name,
      domain: m.domain,
      availability: m.status === "not_measured" ? ("withheld" as const) : m.status,
      graded: gradedMode && m.status !== "not_measured" && m.range !== null && m.inRange !== null,
      value: m.value,
      unit: m.unit,
      uncertainty: m.uncertainty,
      confidence: m.confidence,
      inRange: m.inRange,
      phase: m.phase,
      eventRefs,
      frames,
      eventConfidence: refd.length ? Math.min(...refd.map((e) => e.confidence)) : null,
      ...(m.reason ? { reason: m.reason } : {}),
      ...(m.limitation ? { limitation: m.limitation } : {}),
    };
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function buildResult(p: AnalysisPayload, obs?: CaptureObservation): AnalysisResult {
  const spec = categoryOf(p.requested_shot);
  const outcome = actionOutcome(p, spec);
  const accepted = outcome === "accepted";
  // A session saved by an older build may hold an observation this build can't re-read: the
  // contract then falls back to what the stored payload alone supports, and never throws.
  let timebase: Timebase | null = null;
  let events: EventResult[];
  try {
    timebase = obs ? assessTimebase(obs) : null;
    events = eventResults(p, spec, obs, timebase);
  } catch {
    timebase = null;
    events = eventResults(p, spec);
  }
  const phaseOrder = checkPhaseOrder(events, spec);
  const metrics = metricResults(p, events, accepted);
  const seen = p.camera_view ?? obs?.camera?.view ?? null;
  const view = seen && spec.views[seen] ? seen : null;

  const alternatives = p.shot_probabilities
    ? SHOT_CLASSES.map((label) => ({ label, probability: p.shot_probabilities![label] ?? 0, supported: (TARGET_SHOTS as readonly string[]).includes(label) }))
        .filter((a) => a.probability >= 0.01)
        .sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label))
    : [];

  const reasonText =
    outcome === "capture_failed" || accepted || p.analysis_status === "invalid_for_requested_analysis"
      ? p.headline
      : (spec.abstention[p.status_reason]?.text ?? "the evidence is incomplete");

  const withheld: AnalysisResult["withheld"] = [];
  if (!accepted) {
    const why =
      outcome === "capture_failed"
        ? "The recording couldn't be analysed."
        : p.mode === "posture_screen"
          ? "A photo shows a position, not the shot: no shot verdict, timing, bat or ball claims."
          : `The action wasn't accepted as a ${spec.name}, and technique is only graded for an accepted action.`;
    withheld.push({ claim: "Technique score, strengths and priorities", reason: why });
  }
  if (!p.delivery?.available) withheld.push({ claim: "Ball line, length and bounce", reason: p.delivery?.reason ?? "The ball wasn't tracked." });
  for (const m of metrics) if (m.availability === "withheld") withheld.push({ claim: m.name, reason: m.reason ?? "Not measured." });
  for (const e of events) if (e.state === "missing" && e.required && p.mode === "video" && outcome !== "capture_failed") withheld.push({ claim: `${e.label} timing`, reason: e.limitation ?? "Not found." });
  if (timebase?.kind === "irregular") withheld.push({ claim: "Exact timing", reason: `${timebase.issues.join(" ")} Times are measured as if frames were evenly spaced, so timing measures are less sure.` });

  const present = events.filter((e) => e.state !== "missing");
  const measured = metrics.filter((m) => m.availability !== "withheld");
  const body = {
    schema: RESULT_SCHEMA,
    demo: p.demo,
    mode: p.mode,
    category: { schema: CATEGORY_SCHEMA, id: spec.id, version: spec.version, name: spec.name },
    intended: p.requested_shot ?? ("front_foot_defence" as const),
    capture: { status: p.capture.status, confidence: p.capture_confidence, checks: p.capture.checks, timebase, recapture: p.recapture ?? [] },
    subject: {
      handedness: p.handedness,
      handednessSource: "declared_or_grip" as const,
      people: obs?.quality?.maxPeople ?? null,
      bodyCoverage: p.tracking.body.coverage,
      bodyConfidence: p.tracking.body.meanConfidence,
      view,
      viewSupport: view ? spec.views[view].support : null,
      viewNote: view ? spec.views[view].note : null,
    },
    action: {
      outcome,
      accepted,
      label: p.observed_shot?.label ?? null,
      display: p.observed_shot?.display ?? null,
      probability: p.observed_shot?.probability ?? null,
      calibrated: false as const,
      basis: p.evidence_basis === "full" ? ("body_bat_ball" as const) : p.evidence_basis === "body" ? ("body_only" as const) : null,
      evidenceCoverage: p.classifier?.evidenceCoverage ?? null,
      alternatives,
      reason: { code: p.status_reason, text: reasonText },
    },
    events,
    phaseOrder,
    metrics,
    withheld,
    limitations: [...(p.limitations ?? []), ...spec.limitations.map((text, i) => ({ id: `lim_spec_${i + 1}`, text })).filter((l) => !(p.limitations ?? []).some((x) => x.text === l.text))],
    confidence: {
      capture: p.capture_confidence,
      subject: round(p.tracking.body.coverage * p.tracking.body.meanConfidence, 2),
      action: p.observed_shot?.probability ?? null,
      events: present.length ? { lowest: Math.min(...present.map((e) => e.confidence)), mean: round(mean(present.map((e) => e.confidence)), 2) } : null,
      metrics: metrics.length ? { mean: round(mean(measured.map((m) => m.confidence)), 2), measured: measured.length, withheld: metrics.length - measured.length } : null,
    },
    versions: {
      contract: RESULT_SCHEMA,
      engine: p.versions.engine,
      category: spec.version,
      metrics: p.versions.metric_version,
      classifier: p.versions.classifier,
      registry_hash: p.versions.registry_hash,
      pose_model: p.versions.pose_model,
      uncertainty_model: UNCERTAINTY_MODEL,
      timebase: TIMEBASE_VERSION,
    },
  };
  return {
    ...body,
    analysis_id: p.analysis_id,
    reproducibility: { input_hash: p.input_hash, payload_hash: p.result_hash, result_hash: sha256(canonicalJson(body)).slice(0, 32) },
  };
}

export { ACTION_OUTCOMES };
