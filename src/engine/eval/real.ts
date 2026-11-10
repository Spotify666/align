// Evaluation of the engine against labelled real clips: per clip, per slice, and leave one
// athlete out. Pure functions over (clip labels, observation) pairs, so the same code runs on
// exported real tracks (scripts/eval/real.probe.ts) and in its own unit test.
//
// What a report can decide: whether one build is better than another on these clips
// (compareReports). What it cannot: anything about clips, athletes or devices not in the set.

import { analyze } from "../analyze";
import { ENGINE_VERSION, REGISTRY_HASH } from "../registry";
import { buildResult, UNCERTAINTY_MODEL } from "../result";
import { contactSensitivity, type Detector } from "../sensitivity";
import type { CaptureObservation, EventType } from "../types";
import { LABEL_EVENTS, slicesOf, sourceMs, type DatasetClip, type LabelEvent } from "./dataset";

export const REPORT_SCHEMA = "aline.evalreport/1" as const;
/** Stated uncertainty is meant to hold the true moment this often. */
export const NOMINAL_COVERAGE = 0.9;
/** Fewer athletes or clips than this cannot support a decision. */
export const MIN_ATHLETES = 3;
export const MIN_CLIPS = 10;

export type { Detector };

export interface EventScore {
  labelMs: number | null;
  visible: boolean;
  predMs: number | null;
  state: string;
  /** predicted − labelled (ms); null unless both exist. */
  errMs: number | null;
  /** The engine's stated ± (ms). */
  uncMs: number | null;
}

export interface ClipScore {
  id: string;
  athlete: string;
  slices: string[];
  outcome: string;
  reason: string;
  accepted: boolean;
  /** The outcome is one of the clip's expected ones. */
  right: boolean;
  /** Accepted although a person says it is another shot, or the capture is unusable. */
  falseAccept: boolean;
  /** Should have been accepted and wasn't. */
  falseAbstain: boolean;
  events: Partial<Record<LabelEvent, EventScore>>;
  /** Contact and Follow on one frame with no reason the category accepts. */
  unexplainedCollapse: boolean;
  orderViolation: boolean;
  /** Where Contact is estimated: does the verdict hold with it at either end of its own stated uncertainty? */
  verdictHolds: boolean | null;
  ms: { analyze: number; result: number };
}

export interface EventSummary {
  /** Labelled visible and found by the engine. */
  n: number;
  medianAbsMs: number | null;
  p90AbsMs: number | null;
  /** Share of those within the engine's stated uncertainty (plus the labeller's own tolerance). */
  coverage: number | null;
  /** Labelled visible, not found. */
  missed: number;
  /** Labelled not visible, yet reported as seen directly. */
  claimedUnseen: number;
}

export interface Summary {
  clips: number;
  right: number;
  falseAccepts: number;
  falseAbstains: number;
  unexplainedCollapses: number;
  orderViolations: number;
  /** Share of clips whose verdict survives Contact moving within its uncertainty. */
  verdictHolds: number | null;
  events: Record<LabelEvent, EventSummary>;
  medianMs: number;
}

export interface EvalReport {
  schema: typeof REPORT_SCHEMA;
  name: string;
  detector: string;
  dataset: { version: string; clips: number; athletes: number; skipped: string[] };
  versions: { engine: string; registry_hash: string; uncertainty_model: string };
  overall: Summary;
  bySlice: Record<string, Summary>;
  /** Each athlete held out in turn: their clips scored, with the uncertainty scale fitted on everyone else. */
  loao: Array<{ athlete: string; summary: Summary; uncertaintyScale: number | null; coverageWithScale: number | null }>;
  clips: ClipScore[];
}

const AT = { analysisId: "eval", createdAt: "2026-01-01T00:00:00.000Z" };
const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : null);

/** One clip against its labels. The observation is analysed as the clip's intended shot. */
export function scoreClip(clip: DatasetClip, tracks: CaptureObservation, detector?: Detector): ClipScore {
  const obs: CaptureObservation = { ...tracks, ...(clip.intended === "back_foot_defence" ? { target: clip.intended } : { target: undefined }), athlete: { ...tracks.athlete, handedness: clip.handedness } };
  const opts = { ...AT, ...(detector ? { eventDetector: detector } : {}) };
  let t = performance.now();
  const payload = analyze(obs, opts);
  const tAnalyze = performance.now() - t;
  t = performance.now();
  const result = buildResult(payload, obs);
  const tResult = performance.now() - t;

  const events: ClipScore["events"] = {};
  for (const type of LABEL_EVENTS) {
    const label = clip.events[type];
    if (!label) continue;
    const e = result.events.find((x) => x.type === type) ?? null;
    const raw = payload.events.find((x) => x.type === type);
    const frame = e?.frame ?? raw?.frame ?? null;
    const predMs = frame === null ? null : sourceMs(obs, frame, clip.timeScale);
    events[type] = {
      labelMs: label.ms,
      visible: label.visible,
      predMs,
      state: e?.state ?? (raw ? "unlisted" : "missing"),
      errMs: predMs !== null && label.ms !== null ? Math.round(predMs - label.ms) : null,
      uncMs: e?.uncertainty?.ms != null ? Math.round(e.uncertainty.ms * clip.timeScale + (label.toleranceMs ?? 0)) : null,
    };
  }

  // Would the verdict survive Contact being wrong by as much as the engine itself says it may be?
  const verdictHolds = contactSensitivity(obs, payload, result, detector)?.holds ?? null;

  const accepted = result.action.accepted;
  const shouldAccept = clip.expected.includes("accepted");
  return {
    id: clip.id,
    athlete: clip.athlete,
    slices: slicesOf(clip),
    outcome: result.action.outcome,
    reason: payload.status_reason,
    accepted,
    right: (clip.expected as string[]).includes(result.action.outcome),
    falseAccept: accepted && !shouldAccept,
    falseAbstain: !accepted && clip.expected.length === 1 && shouldAccept,
    events,
    unexplainedCollapse: result.phaseOrder.issues.some((i) => i.kind === "coincident" && !i.explained && [i.a, i.b].includes("contact" as EventType)),
    orderViolation: !result.phaseOrder.valid,
    verdictHolds,
    ms: { analyze: Math.round(tAnalyze * 10) / 10, result: Math.round(tResult * 10) / 10 },
  };
}

export function summarise(clips: ClipScore[], scale = 1): Summary {
  const events = Object.fromEntries(
    LABEL_EVENTS.map((type) => {
      const all = clips.map((c) => c.events[type]).filter((e): e is EventScore => !!e);
      const both = all.filter((e) => e.errMs !== null);
      const abs = both.map((e) => Math.abs(e.errMs!));
      const within = both.filter((e) => e.uncMs !== null && Math.abs(e.errMs!) <= e.uncMs * scale);
      return [
        type,
        {
          n: both.length,
          medianAbsMs: q(abs, 0.5),
          p90AbsMs: q(abs, 0.9),
          coverage: both.length ? within.length / both.length : null,
          missed: all.filter((e) => e.visible && e.predMs === null).length,
          claimedUnseen: all.filter((e) => !e.visible && e.state === "detected").length,
        },
      ];
    }),
  ) as Record<LabelEvent, EventSummary>;
  const held = clips.filter((c) => c.verdictHolds !== null);
  return {
    clips: clips.length,
    right: clips.filter((c) => c.right).length,
    falseAccepts: clips.filter((c) => c.falseAccept).length,
    falseAbstains: clips.filter((c) => c.falseAbstain).length,
    unexplainedCollapses: clips.filter((c) => c.unexplainedCollapse).length,
    orderViolations: clips.filter((c) => c.orderViolation).length,
    verdictHolds: held.length ? held.filter((c) => c.verdictHolds).length / held.length : null,
    events,
    medianMs: q(clips.map((c) => c.ms.analyze + c.ms.result), 0.5) ?? 0,
  };
}

/** |error| ÷ stated uncertainty for every labelled, found event: 1 means exactly at the edge of the band. */
const ratios = (clips: ClipScore[]) =>
  clips.flatMap((c) => Object.values(c.events)).filter((e): e is EventScore => !!e && e.errMs !== null && !!e.uncMs).map((e) => Math.abs(e.errMs!) / e.uncMs!);

export function evaluate(items: Array<{ clip: DatasetClip; obs: CaptureObservation }>, opts: { name: string; datasetVersion: string; detector?: Detector; detectorName?: string; skipped?: string[] }): EvalReport {
  const clips = items.map(({ clip, obs }) => scoreClip(clip, obs, opts.detector));
  const slices = [...new Set(clips.flatMap((c) => c.slices))].sort();
  const athletes = [...new Set(clips.map((c) => c.athlete))].sort();
  return {
    schema: REPORT_SCHEMA,
    name: opts.name,
    detector: opts.detectorName ?? "current",
    dataset: { version: opts.datasetVersion, clips: clips.length, athletes: athletes.length, skipped: opts.skipped ?? [] },
    versions: { engine: ENGINE_VERSION, registry_hash: REGISTRY_HASH, uncertainty_model: UNCERTAINTY_MODEL },
    overall: summarise(clips),
    bySlice: Object.fromEntries(slices.map((s) => [s, summarise(clips.filter((c) => c.slices.includes(s)))])),
    // The uncertainty scale is the only thing fitted, and only on the other athletes: the scale
    // at which the stated bands would have held NOMINAL_COVERAGE of their events.
    loao: athletes.map((athlete) => {
      const held = clips.filter((c) => c.athlete === athlete);
      const scale = q(ratios(clips.filter((c) => c.athlete !== athlete)), NOMINAL_COVERAGE);
      const r = ratios(held);
      return { athlete, summary: summarise(held), uncertaintyScale: scale, coverageWithScale: scale !== null && r.length ? r.filter((x) => x <= scale).length / r.length : null };
    }),
    clips,
  };
}

export interface GateLine {
  criterion: string;
  pass: boolean | null;
  detail: string;
}

const KEY_EVENTS: LabelEvent[] = ["contact", "front_foot_plant", "back_foot_commit", "trigger", "follow_through", "backswing_top", "bounce"];
const macro = (r: EvalReport, f: (s: Summary) => number | null) => {
  const xs = r.loao.map((l) => f(l.summary)).filter((x): x is number => x !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};
const fmt = (x: number | null, unit = "") => (x === null ? "n/a" : `${Math.round(x * 10) / 10}${unit}`);

/**
 * May `after` replace `before`? The four criteria this data can decide (the synthetic ratchet is
 * the fifth, checked by tests/metamorphic.test.ts). null = not enough data to say.
 */
export function compareReports(before: EvalReport, after: EvalReport, opts: { maxSlowdown?: number } = {}): { decision: "accept" | "reject" | "insufficient_data"; lines: GateLine[]; slices: string[] } {
  const lines: GateLine[] = [];
  const enough = after.dataset.athletes >= MIN_ATHLETES && after.dataset.clips >= MIN_CLIPS && before.dataset.version === after.dataset.version;
  lines.push({
    criterion: "Enough labelled real clips, the same set for both",
    pass: enough,
    detail: `${after.dataset.clips} clips, ${after.dataset.athletes} athletes (need ${MIN_CLIPS} and ${MIN_ATHLETES}); dataset ${before.dataset.version} vs ${after.dataset.version}`,
  });

  // 1. Timing on held-out athletes: no key event worse on average, Contact not worse for any athlete, something better.
  const timing = KEY_EVENTS.map((e) => ({ e, b: macro(before, (s) => s.events[e].medianAbsMs), a: macro(after, (s) => s.events[e].medianAbsMs) })).filter((x) => x.a !== null && x.b !== null);
  const worse = timing.filter((x) => x.a! > x.b! + 1);
  const better = timing.filter((x) => x.a! < x.b! - 1);
  const athleteWorse = after.loao.filter((l) => {
    const b = before.loao.find((x) => x.athlete === l.athlete)?.summary.events.contact.medianAbsMs;
    const a = l.summary.events.contact.medianAbsMs;
    return a != null && b != null && a > b + 1;
  });
  lines.push({
    criterion: "Event timing improves on held-out athletes",
    pass: timing.length ? worse.length === 0 && athleteWorse.length === 0 && better.length > 0 : null,
    detail: timing.map((x) => `${x.e} ${fmt(x.b, " ms")} → ${fmt(x.a, " ms")}`).join("; ") + (athleteWorse.length ? `; Contact worse for ${athleteWorse.map((l) => l.athlete).join(", ")}` : ""),
  });

  // 2. No verdict regression, clip by clip.
  const prev = new Map(before.clips.map((c) => [c.id, c]));
  const regressed = after.clips.filter((c) => prev.get(c.id)?.right && !c.right);
  const newFalseAccepts = after.clips.filter((c) => c.falseAccept && !prev.get(c.id)?.falseAccept);
  lines.push({
    criterion: "No supported / unsupported verdict regression",
    pass: regressed.length === 0 && newFalseAccepts.length === 0,
    detail: `right ${before.overall.right}/${before.overall.clips} → ${after.overall.right}/${after.overall.clips}; false accepts ${before.overall.falseAccepts} → ${after.overall.falseAccepts}` + (regressed.length ? `; now wrong: ${regressed.map((c) => `${c.id} (${c.outcome})`).join(", ")}` : ""),
  });

  // 3. Uncertainty stays calibrated to the error seen on athletes it wasn't fitted on.
  const cov = (r: EvalReport) => {
    const xs = r.loao.map((l) => l.coverageWithScale).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const [cb, ca] = [cov(before), cov(after)];
  const raw = (r: EvalReport) => r.overall.events.contact.coverage;
  lines.push({
    criterion: "Uncertainty stays calibrated to observed error",
    pass: ca === null ? null : ca >= NOMINAL_COVERAGE - 0.1 && (cb === null || ca >= cb - 0.05),
    detail: `held-out coverage at the fitted scale ${fmt(cb === null ? null : cb * 100, "%")} → ${fmt(ca === null ? null : ca * 100, "%")} (aim ${NOMINAL_COVERAGE * 100}%); Contact inside its stated band, unscaled: ${fmt(raw(before) === null ? null : raw(before)! * 100, "%")} → ${fmt(raw(after) === null ? null : raw(after)! * 100, "%")}`,
  });

  // 4. Cost.
  const limit = opts.maxSlowdown ?? 1.25;
  lines.push({
    criterion: "Processing time stays acceptable",
    pass: after.overall.medianMs <= Math.max(before.overall.medianMs * limit, before.overall.medianMs + 5),
    detail: `engine + contract, median per clip: ${fmt(before.overall.medianMs, " ms")} → ${fmt(after.overall.medianMs, " ms")} on this machine (limit ×${limit}); phone timings come from the browser run`,
  });

  lines.push({
    criterion: "Contact and Follow never share a frame without a reason; phases in a possible order",
    pass: after.overall.unexplainedCollapses <= before.overall.unexplainedCollapses && after.overall.orderViolations <= before.overall.orderViolations,
    detail: `unexplained collapses ${before.overall.unexplainedCollapses} → ${after.overall.unexplainedCollapses}; order violations ${before.overall.orderViolations} → ${after.overall.orderViolations}`,
  });

  const slices = Object.keys(after.bySlice)
    .filter((s) => before.bySlice[s])
    .map((s) => {
      const [b, a] = [before.bySlice[s]!, after.bySlice[s]!];
      return `${s}\t${a.clips}\tright ${b.right}→${a.right}\tcontact ${fmt(b.events.contact.medianAbsMs)}→${fmt(a.events.contact.medianAbsMs)} ms\tplant ${fmt(b.events.front_foot_plant.medianAbsMs)}→${fmt(a.events.front_foot_plant.medianAbsMs)} ms\ttrigger ${fmt(b.events.trigger.medianAbsMs)}→${fmt(a.events.trigger.medianAbsMs)} ms\tverdict holds ${fmt(b.verdictHolds === null ? null : b.verdictHolds * 100)}→${fmt(a.verdictHolds === null ? null : a.verdictHolds * 100)}%`;
    });
  const decided = lines.slice(1);
  const decision = !enough || decided.some((l) => l.pass === null) ? "insufficient_data" : decided.every((l) => l.pass) ? "accept" : "reject";
  return { decision: decided.some((l) => l.pass === false) ? "reject" : decision, lines, slices };
}

