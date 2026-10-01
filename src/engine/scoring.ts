// Stage G — domain results, a secondary composite index with published weights,
// and the top strengths/priorities. The composite is never the primary result and
// is withheld unless enough domains are measured.

import { clamp, round } from "./math";
import { DOMAIN_LABELS, INDEX_WEIGHTS_VERSION, METRICS, th } from "./registry";
import { coachingFor } from "./coaching";
import type { DomainResult, Finding, Metric, MetricDomain, PlanItem } from "./types";

const DOMAINS: MetricDomain[] = ["setup", "footwork", "head_trunk", "sequence", "bat_contact", "outcome"];

export function fmt(m: Pick<Metric, "value" | "decimals" | "unit">): string {
  if (m.value === null) return "—";
  const v = m.value.toFixed(m.decimals);
  return m.unit && !m.unit.startsWith("×") && m.unit !== "0–1" ? `${v}${m.unit.startsWith("°") ? "" : " "}${m.unit}` : m.unit === "0–1" ? v : `${v} ${m.unit}`;
}

/** Normalised distance outside the range, in units of half the range width. */
function outside(m: Metric): number {
  if (m.value === null || !m.range) return 0;
  const half = Math.max((m.range.hi - m.range.lo) / 2, 1e-6);
  if (m.value < m.range.lo) return (m.range.lo - m.value) / half;
  if (m.value > m.range.hi) return (m.value - m.range.hi) / half;
  return 0;
}

export function domainResults(metrics: Metric[]): DomainResult[] {
  return DOMAINS.map((domain) => {
    const ms = metrics.filter((m) => m.domain === domain);
    const measured = ms.filter((m) => m.status !== "not_measured" && m.range);
    const review = measured.filter((m) => m.inRange === false);
    const status: DomainResult["status"] = measured.length === 0 ? "not_measured" : review.length ? "review" : "within_range";
    const summary =
      status === "not_measured"
        ? (ms.find((m) => m.reason)?.reason ?? "Not measured for this capture.")
        : status === "review"
          ? `${review.map((m) => m.name).join(", ")} outside current coaching range.`
          : `${measured.length} indicator${measured.length > 1 ? "s" : ""} within current coaching range.`;
    return { domain, label: DOMAIN_LABELS[domain], status, metricIds: ms.map((m) => m.id), summary };
  });
}

export function techniqueIndex(metrics: Metric[], domains: DomainResult[]) {
  const measuredDomains = domains.filter((d) => d.status !== "not_measured").length;
  if (measuredDomains < th("index.min_domains")) return null;
  const used = metrics.filter((m) => m.status !== "not_measured" && m.range && m.value !== null);
  const weightOf = (id: string) => METRICS.find((d) => d.id === id)?.weight ?? 0;
  const score = (m: Metric, value: number) => {
    // Falls to ~0.6 at half a range-width outside; published with the weights version.
    const d = outside({ ...m, value }) / 0.5;
    return Math.exp(-0.5 * d * d);
  };
  let w = 0;
  let s = 0;
  let sLo = 0;
  let sHi = 0;
  const inputs: string[] = [];
  for (const m of used) {
    const wt = weightOf(m.id);
    if (!wt) continue;
    const u = m.uncertainty ?? 0;
    const options = [m.value! - u, m.value!, m.value! + u].map((v) => score(m, v));
    w += wt;
    s += wt * options[1]!;
    sLo += wt * Math.min(...options);
    sHi += wt * Math.max(...options);
    inputs.push(m.id);
  }
  if (!w) return null;
  // Integers only: decimals are not supported by the measurement error.
  const value = Math.round((100 * s) / w);
  const band: [number, number] = [Math.floor((100 * sLo) / w), Math.ceil((100 * sHi) / w)];
  return { value, band, inputs, weightsVersion: INDEX_WEIGHTS_VERSION };
}

export function strengthsAndPriorities(metrics: Metric[]) {
  const usable = metrics.filter((m) => m.status !== "not_measured" && m.range && m.value !== null);
  const weightOf = (id: string) => METRICS.find((d) => d.id === id)?.weight ?? 0;

  const strengths: Finding[] = usable
    .filter((m) => m.inRange)
    .map((m) => {
      const half = (m.range!.hi - m.range!.lo) / 2;
      const centre = (m.range!.hi + m.range!.lo) / 2;
      const centrality = 1 - clamp(Math.abs(m.value! - centre) / half, 0, 1);
      return { m, rank: weightOf(m.id) * m.confidence * (0.5 + centrality) };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 2)
    .map(({ m }) => ({
      metricId: m.id,
      title: m.name,
      observation: `${m.name} ${fmt(m)} — within the current coaching range (${m.range!.lo}–${m.range!.hi}).`,
      evidenceIds: [`metric_${m.id}`, ...m.evidenceIds],
    }));

  const priorities: Finding[] = usable
    .filter((m) => m.inRange === false && coachingFor(m.id))
    .map((m) => ({ m, rank: weightOf(m.id) * m.confidence * Math.min(outside(m), 3) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 2)
    .map(({ m }) => {
      const side = m.value! < m.range!.lo ? "low" : "high";
      const entry = coachingFor(m.id)!;
      return {
        metricId: m.id,
        title: m.name,
        observation: `${entry[side].observation || `${m.name} is outside the coaching range.`} Measured ${fmt(m)} vs range ${m.range!.lo}–${m.range!.hi}.`,
        evidenceIds: [`metric_${m.id}`, ...m.evidenceIds],
      };
    });

  return { strengths, priorities };
}

export function buildPlan(priorities: Finding[], metrics: Metric[]): PlanItem | null {
  const top = priorities[0];
  if (!top) return null;
  const m = metrics.find((x) => x.id === top.metricId)!;
  const entry = coachingFor(top.metricId);
  if (!entry || m.value === null || !m.range) return null;
  const side = m.value < m.range.lo ? "low" : "high";
  return {
    priority: top,
    consequence: entry[side].consequence,
    cue: entry[side].cue,
    drills: entry.drills.slice(0, 2),
    retest: entry.retest,
  };
}

export const roundIndex = (x: number) => round(x, 0);
