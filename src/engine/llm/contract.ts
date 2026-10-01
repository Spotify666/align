// The LLM boundary. The model receives a compact, typed payload and must return
// a report in ReportSchema whose every numeric sentence cites payload IDs. It is
// an explanation layer only: it cannot change the status, invent measures, or
// produce medical language. Anything that fails validateReport() is rejected.

import { z } from "zod";
import { ReportSchema, templateReport, validateReport, type Report, type ReportBody, type Violation } from "../report";
import type { AnalysisPayload } from "../types";

export const REPORT_JSON_SCHEMA = z.toJSONSchema(ReportSchema, { target: "draft-2020-12" }) as Record<string, unknown>;

export const SYSTEM_PROMPT = `You write cricket batting reports for Align, a movement-analysis product.
You are the explanation layer, not the measurement engine.

Rules you must follow:
- Use only facts in the ANALYSIS JSON. Never estimate joint angles, ball line, length, contact or confidence yourself.
- The first sentence must restate analysis_status faithfully. If the status is not "valid", say the technique score is withheld and do not mention any score or index.
- Every sentence that contains a number must cite the IDs it came from (metric_<id>, feat_<id>, evt_<type>, frame_<n>, chk_<id>, lim_<id>, or a drill id). Copy numbers exactly as given, with their units.
- Never cite a metric whose status is "not_measured" for a number.
- Coaching ranges are provisional, not norms; say "coaching range", never "normal".
- No medical or injury language (no diagnosis, injury, risk, treatment, clinical, abnormal, unsafe).
- Recommend only drills listed in the payload's plan/drill_candidates.
- One priority, at most two drills. Be specific and calm. Write for the stated audience.
Return JSON matching the schema.`;

/** Strip large arrays the model doesn't need; keep everything a sentence could cite. */
export function compactPayload(p: AnalysisPayload) {
  return {
    analysis_status: p.analysis_status,
    status_reason: p.status_reason,
    headline: p.headline,
    mode: p.mode,
    tier: p.tier,
    demo: p.demo,
    requested_shot: p.requested_shot,
    observed_shot: p.observed_shot,
    capture_confidence: p.capture_confidence,
    capture_checks: p.capture.checks.filter((c) => c.status !== "pass").map(({ id, label, status, value, correction }) => ({ id, label, status, value, correction })),
    delivery: p.delivery,
    events: p.events.map(({ id, type, frame, tMs, confidence }) => ({ id, type, frame, tMs, confidence })),
    features: p.features.map(({ id, label, value, unit, reading }) => ({ id, label, value, unit, reading })),
    metrics: p.metrics.map(({ id, name, status, value, uncertainty, unit, range, inRange, reason, limitation }) => ({
      id: `metric_${id}`,
      name,
      status,
      value,
      uncertainty,
      unit,
      coaching_range: range ? [range.lo, range.hi] : null,
      inRange,
      reason,
      limitation,
    })),
    strengths: p.strengths,
    priorities: p.priorities,
    plan: p.plan,
    limitations: p.limitations,
    recapture: p.recapture,
  };
}

export function userPrompt(p: AnalysisPayload, audience: ReportBody["audience"]) {
  return `Audience: ${audience}\n\nANALYSIS JSON:\n${JSON.stringify(compactPayload(p))}`;
}

export interface ReportProvider {
  id: string;
  model: string;
  /** Returns the raw JSON object the model produced. */
  generate(system: string, user: string): Promise<unknown>;
}

export interface GenerationResult {
  report: Report;
  violations: Violation[];
  attempts: number;
  fellBackToTemplate: boolean;
  rejected: Array<{ attempt: number; violations: Violation[] }>;
}

/**
 * Ask the provider for a report, validate it against the payload, retry once, and
 * fall back to the deterministic template if the model cannot satisfy the contract.
 */
export async function generateReport(
  p: AnalysisPayload,
  provider: ReportProvider | null,
  audience: ReportBody["audience"] = "player",
  maxAttempts = 2,
): Promise<GenerationResult> {
  const rejected: GenerationResult["rejected"] = [];
  if (provider) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const raw = await provider.generate(SYSTEM_PROMPT, userPrompt(p, audience));
        const parsed = ReportSchema.safeParse(raw);
        if (!parsed.success) {
          rejected.push({ attempt, violations: [{ section: -1, sentence: -1, rule: "schema", detail: parsed.error.message.slice(0, 300) }] });
          continue;
        }
        const violations = validateReport(parsed.data, p);
        if (violations.length === 0) {
          return {
            report: { ...parsed.data, generator: `llm:${provider.id}:${provider.model}`, payloadHash: p.result_hash, drillLibrary: templateReport(p).drillLibrary },
            violations,
            attempts: attempt,
            fellBackToTemplate: false,
            rejected,
          };
        }
        rejected.push({ attempt, violations });
      } catch (err) {
        rejected.push({ attempt, violations: [{ section: -1, sentence: -1, rule: "schema", detail: String(err).slice(0, 300) }] });
      }
    }
  }
  const report = templateReport(p, audience);
  return { report, violations: validateReport(report, p), attempts: rejected.length, fellBackToTemplate: !!provider, rejected };
}
