"use client";

import type { Metric } from "@/engine/types";
import type { BaselineComparison } from "@/engine/baseline";
import { RangeBar } from "./range-bar";
import { Target } from "../icons";

const STATUS_LABEL: Record<Metric["status"], { text: string; cls: string }> = {
  measured: { text: "Measured", cls: "border-data/50 text-data" },
  estimated: { text: "Estimate", cls: "border-warn/50 text-warn" },
  not_measured: { text: "Not measured", cls: "border-line-strong text-fg-subtle" },
};

export function MetricCard({
  m,
  baseline,
  onEvidence,
}: {
  m: Metric;
  baseline?: BaselineComparison;
  onEvidence?: (frame: number, metricId: string) => void;
}) {
  const s = STATUS_LABEL[m.status];
  const frame = m.evidenceIds.map((id) => /^frame_(\d+)$/.exec(id)?.[1]).find(Boolean);
  const value = m.value !== null ? m.value.toFixed(m.decimals) : null;
  return (
    <article id={`metric_${m.id}`} className="card p-4 flex flex-col gap-3 scroll-mt-24" aria-labelledby={`h_${m.id}`}>
      <header className="flex items-start justify-between gap-3">
        <h4 id={`h_${m.id}`} className="font-semibold leading-tight">{m.name}</h4>
        <span className={`chip ${s.cls}`}>{s.text}</span>
      </header>

      {m.status === "not_measured" ? (
        <p className="text-sm text-fg-muted">{m.reason ?? "Not measured for this capture."}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="num text-3xl font-semibold">{value}</span>
            <span className="text-sm text-fg-muted">{m.unit}</span>
            {m.uncertainty !== null && <span className="num text-sm text-fg-subtle">± {m.uncertainty.toFixed(m.decimals)}</span>}
            <span className="ml-auto num text-xs text-fg-subtle" title="Signal confidence">conf {Math.round(m.confidence * 100)}%</span>
          </div>
          {m.inRange !== null || baseline ? (
            <RangeBar
              value={m.value!}
              uncertainty={m.uncertainty}
              range={m.range}
              baseline={baseline ? { mean: baseline.baselineMean, sd: baseline.baselineSd } : null}
              decimals={m.decimals}
              unit={m.unit}
            />
          ) : null}
          {baseline && (
            <p className="text-sm">
              <span className="text-data">You vs your baseline:</span> {baseline.reading}
              <span className="num text-fg-subtle"> (Δ {baseline.delta > 0 ? "+" : ""}{baseline.delta.toFixed(m.decimals)})</span>
            </p>
          )}
        </>
      )}

      <p className="text-sm text-fg-muted">{m.meaning}</p>
      <details className="group text-sm">
        <summary className="list-none flex items-center gap-1 text-fg-subtle hover:text-fg min-h-9">
          <span className="group-open:rotate-90 transition-transform">›</span> Why it matters for a defence
        </summary>
        <p className="mt-1 text-fg-muted">{m.relevance}</p>
        {m.range && (
          <p className="mt-2 text-xs text-fg-subtle">
            Range: {m.range.source}. Cohort: {m.range.cohort}.
          </p>
        )}
      </details>
      {m.limitation && <p className="text-xs text-warn/90 border-l-2 border-warn/50 pl-2">{m.limitation}</p>}
      {frame && onEvidence && m.status !== "not_measured" && (
        <button onClick={() => onEvidence(Number(frame), m.id)} className="self-start chip border-brand/50 text-brand min-h-9">
          <Target size={14} /> See it at frame {Number(frame) + 1}
        </button>
      )}
    </article>
  );
}
