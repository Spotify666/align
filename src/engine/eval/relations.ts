// Relations between the result on a recording and the result on a transformed copy of it.
// Shared by the regression tests and the slice report so both judge by the same rules.

import { analyze } from "../analyze";
import type { ActionOutcome } from "../category";
import { buildResult, type EventResult } from "../result";
import type { CaptureObservation } from "../types";

export interface Signature {
  status: string;
  reason: string;
  outcome: ActionOutcome;
  shot: string | null;
  index: number | null;
  events: Record<string, { frame: number; tMs: number; ms: number | null; frames: number; state: EventResult["state"] }>;
  metrics: Record<string, { value: number | null; inRange: boolean | null; status: string; decimals: number; unit: string; width: number | null; graded: boolean }>;
  withheld: string[];
}

const AT = { analysisId: "eval", createdAt: "2026-01-01T00:00:00.000Z" };

export function signature(obs: CaptureObservation): Signature {
  const p = analyze(obs, AT);
  const r = buildResult(p, obs);
  return {
    status: p.analysis_status,
    reason: p.status_reason,
    outcome: r.action.outcome,
    shot: p.observed_shot?.label ?? null,
    index: p.technique_index?.value ?? null,
    events: Object.fromEntries(
      r.events.filter((e) => e.frame !== null).map((e) => [e.type, { frame: e.frame!, tMs: e.tMs!, ms: e.uncertainty?.ms ?? null, frames: e.uncertainty?.frames ?? 0, state: e.state }]),
    ),
    metrics: Object.fromEntries(
      p.metrics.map((m) => [m.id, { value: m.value, inRange: m.inRange, status: m.status, decimals: m.decimals, unit: m.unit, width: m.range ? m.range.hi - m.range.lo : null, graded: r.metrics.find((x) => x.id === m.id)?.graded ?? false }]),
    ),
    withheld: r.withheld.map((w) => w.claim),
  };
}

export interface Difference {
  kind: "verdict" | "event" | "metric" | "grade";
  what: string;
  a: unknown;
  b: unknown;
}

export interface Relation {
  /** Frames the transformed copy starts later by (events move back by this many). */
  frameShift?: number;
  /** Source frames per transformed frame (2 = every second frame). */
  frameScale?: number;
  /** Timestamps moved by (ms). */
  timeShiftMs?: number;
  /**
   * "exact": the same frames, so the same events and values (one step of the last shown digit
   * for arithmetic). "resampled": other frames of the same movement, so events within their
   * stated uncertainty and values within `metricTolerance` of the range width.
   */
  mode: "exact" | "resampled";
  /** Resampled: share of a measure's range width its value may move by (timing in ms: see timingToleranceMs). */
  metricTolerance?: number;
  timingToleranceMs?: number;
}

/** Everything that differs beyond what the relation allows. Empty = the relation holds. */
export function differences(a: Signature, b: Signature, rel: Relation): Difference[] {
  const out: Difference[] = [];
  if (a.status !== b.status || a.reason !== b.reason) out.push({ kind: "verdict", what: "status", a: `${a.status}/${a.reason}`, b: `${b.status}/${b.reason}` });
  if (a.outcome !== b.outcome) out.push({ kind: "verdict", what: "outcome", a: a.outcome, b: b.outcome });
  if (a.shot !== b.shot) out.push({ kind: "verdict", what: "shot", a: a.shot, b: b.shot });
  const scale = rel.frameScale ?? 1;
  const shift = rel.frameShift ?? 0;
  const tShift = rel.timeShiftMs ?? 0;
  for (const type of new Set([...Object.keys(a.events), ...Object.keys(b.events)])) {
    // The first analysed frame and the end of the clip are not moments of the movement.
    if (type === "setup" || type === "recovery") continue;
    const ea = a.events[type];
    const eb = b.events[type];
    if (!ea || !eb) {
      out.push({ kind: "event", what: `${type} present`, a: !!ea, b: !!eb });
      continue;
    }
    if (rel.mode === "exact") {
      if (ea.frame - shift !== eb.frame) out.push({ kind: "event", what: `${type} frame`, a: ea.frame - shift, b: eb.frame });
      if (Math.abs(ea.tMs + tShift - eb.tMs) > 1) out.push({ kind: "event", what: `${type} time`, a: ea.tMs + tShift, b: eb.tMs });
    } else {
      const allowed = (ea.ms ?? 0) + (eb.ms ?? 0);
      if (Math.abs(ea.tMs + tShift - eb.tMs) > allowed) out.push({ kind: "event", what: `${type} time beyond ±${allowed} ms`, a: ea.tMs + tShift, b: eb.tMs });
    }
    void scale;
  }
  for (const id of new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)])) {
    const ma = a.metrics[id];
    const mb = b.metrics[id];
    if (!ma || !mb) {
      out.push({ kind: "metric", what: `${id} present`, a: !!ma, b: !!mb });
      continue;
    }
    if ((ma.value === null) !== (mb.value === null)) {
      out.push({ kind: "metric", what: `${id} measured`, a: ma.status, b: mb.status });
      continue;
    }
    if (ma.value === null || mb.value === null) continue;
    const step = 10 ** -ma.decimals;
    const tol =
      rel.mode === "exact"
        ? step * 1.01
        : Math.max(step * 1.01, ma.unit === "ms" ? (rel.timingToleranceMs ?? 0) : (rel.metricTolerance ?? 0) * (ma.width ?? Math.abs(ma.value)));
    if (Math.abs(ma.value - mb.value) > tol) out.push({ kind: "metric", what: `${id} (±${Number(tol.toPrecision(2))} ${ma.unit})`, a: ma.value, b: mb.value });
    else if (rel.mode === "exact" && ma.inRange !== mb.inRange) out.push({ kind: "grade", what: `${id} in range`, a: ma.inRange, b: mb.inRange });
  }
  return out;
}
