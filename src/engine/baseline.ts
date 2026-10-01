// Personal baseline: a confidence-weighted distribution over 6–10 valid deliveries,
// versioned, and kept separate from population coaching ranges.

import { clamp, round, weightedMeanStd } from "./math";
import { METRICS, th } from "./registry";
import type { AnalysisPayload, Metric } from "./types";

export interface BaselineMetric {
  id: string;
  mean: number;
  sd: number;
  n: number;
  unit: string;
}

export interface Baseline {
  schema: "align.baseline/1";
  version: number;
  createdAt: string;
  analysisIds: string[];
  established: boolean;
  n: number;
  metrics: Record<string, BaselineMetric>;
  repeatability: number | null;
}

export interface BaselineComparison {
  metricId: string;
  name: string;
  unit: string;
  decimals: number;
  value: number;
  uncertainty: number;
  baselineMean: number;
  baselineSd: number;
  delta: number;
  z: number;
  reading: "within your usual range" | "above your usual range" | "below your usual range";
}

export function buildBaseline(payloads: AnalysisPayload[], opts: { version: number; createdAt: string }): Baseline {
  const valid = payloads.filter((p) => p.analysis_status === "valid");
  const metrics: Record<string, BaselineMetric> = {};
  const consistency: number[] = [];
  for (const def of METRICS) {
    const rows = valid
      .map((p) => p.metrics.find((m) => m.id === def.id))
      .filter((m): m is Metric => !!m && m.value !== null && m.status !== "not_measured");
    if (rows.length < 2) continue;
    const { mean, sd, effectiveN } = weightedMeanStd(
      rows.map((m) => m.value!),
      rows.map((m) => m.confidence),
    );
    metrics[def.id] = { id: def.id, mean: round(mean, def.decimals + 2), sd: round(sd, def.decimals + 2), n: rows.length, unit: def.unit };
    if (def.range && Number.isFinite(sd) && effectiveN >= 2) {
      consistency.push(1 - clamp(sd / ((def.range.hi - def.range.lo) / 2), 0, 1));
    }
  }
  const established = valid.length >= th("baseline.min_deliveries");
  return {
    schema: "align.baseline/1",
    version: opts.version,
    createdAt: opts.createdAt,
    analysisIds: valid.map((p) => p.analysis_id),
    established,
    n: valid.length,
    metrics,
    repeatability: established && consistency.length ? round(consistency.reduce((a, b) => a + b, 0) / consistency.length, 2) : null,
  };
}

export function compareToBaseline(payload: AnalysisPayload, baseline: Baseline): BaselineComparison[] {
  if (!baseline.established || payload.analysis_status !== "valid") return [];
  const out: BaselineComparison[] = [];
  for (const m of payload.metrics) {
    const b = baseline.metrics[m.id];
    if (!b || m.value === null || m.status === "not_measured" || !Number.isFinite(b.sd)) continue;
    const unc = m.uncertainty ?? 0;
    const spread = Math.sqrt(b.sd ** 2 + unc ** 2) || 1e-9;
    const delta = m.value - b.mean;
    const z = delta / spread;
    out.push({
      metricId: m.id,
      name: m.name,
      unit: m.unit,
      decimals: m.decimals,
      value: m.value,
      uncertainty: unc,
      baselineMean: b.mean,
      baselineSd: b.sd,
      delta: round(delta, m.decimals + 1),
      z: round(z, 2),
      reading: Math.abs(z) <= 1 ? "within your usual range" : z > 0 ? "above your usual range" : "below your usual range",
    });
  }
  return out;
}
