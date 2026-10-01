// Provider-independent report evaluation. Every candidate model is scored on the
// same typed payloads; vendor benchmarks are not acceptance tests.

import { validateReport, type ReportBody } from "../report";
import type { AnalysisPayload } from "../types";

export interface EvalCase {
  id: string;
  payload: AnalysisPayload;
}

export interface EvalScore {
  provider: string;
  cases: number;
  schemaValid: number;
  /** Share of cases with zero contract violations. */
  faithful: number;
  unknownCitations: number;
  numberMismatches: number;
  uncitedNumbers: number;
  statusContradictions: number;
  medicalLanguage: number;
  meanLatencyMs: number;
  /** Provider-reported or estimated USD; null when unknown. */
  estCostUsd: number | null;
}

export async function evaluate(
  provider: string,
  cases: EvalCase[],
  produce: (p: AnalysisPayload) => Promise<{ body: unknown; latencyMs: number; costUsd?: number }>,
): Promise<EvalScore> {
  let schemaValid = 0;
  let faithful = 0;
  const counts = { unknown_citation: 0, number_mismatch: 0, uncited_number: 0, status_contradiction: 0, medical_language: 0 } as Record<string, number>;
  let latency = 0;
  let cost = 0;
  let costKnown = true;
  for (const c of cases) {
    const { body, latencyMs, costUsd } = await produce(c.payload);
    latency += latencyMs;
    if (costUsd === undefined) costKnown = false;
    else cost += costUsd;
    const v = validateReport(body as ReportBody, c.payload);
    if (!v.some((x) => x.rule === "schema")) schemaValid++;
    if (v.length === 0) faithful++;
    for (const x of v) counts[x.rule] = (counts[x.rule] ?? 0) + 1;
  }
  return {
    provider,
    cases: cases.length,
    schemaValid,
    faithful,
    unknownCitations: counts.unknown_citation ?? 0,
    numberMismatches: counts.number_mismatch ?? 0,
    uncitedNumbers: counts.uncited_number ?? 0,
    statusContradictions: counts.status_contradiction ?? 0,
    medicalLanguage: counts.medical_language ?? 0,
    meanLatencyMs: cases.length ? Math.round(latency / cases.length) : 0,
    estCostUsd: costKnown ? Math.round(cost * 1e5) / 1e5 : null,
  };
}

/** Candidate routes from the specification. Only adapters with a configured key run. */
export const MODEL_ROUTES = [
  { id: "anthropic", model: "claude-sonnet-5-5", role: "Quality-first report candidate (default when configured)", env: "ANTHROPIC_API_KEY", implemented: true },
  { id: "openai", model: "gpt-6.1-sol", role: "Quality-first bake-off candidate", env: "OPENAI_API_KEY", implemented: false },
  { id: "openai-economy", model: "gpt-6-luna", role: "Economy route after it passes the quality bar", env: "OPENAI_API_KEY", implemented: false },
  { id: "gemini", model: "gemini-3.5-flash-lite", role: "Native-video qualitative reviewer (never measurement)", env: "GEMINI_API_KEY", implemented: false },
  { id: "qwen", model: "qwen3-vl-flash", role: "Low-cost benchmark; privacy review before athlete data", env: "DASHSCOPE_API_KEY", implemented: false },
  { id: "deepseek", model: "deepseek-v4.1-flash", role: "Low-cost benchmark; privacy review before athlete data", env: "DEEPSEEK_API_KEY", implemented: false },
] as const;
