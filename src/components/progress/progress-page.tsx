"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { analyze } from "@/engine/analyze";
import { baselineSeries } from "@/engine/fixtures";
import { buildBaseline } from "@/engine/baseline";
import { METRICS, th } from "@/engine/registry";
import type { AnalysisPayload } from "@/engine/types";
import { listAnalyses } from "@/lib/store";
import { STATUS_META } from "../report/status";
import { TrendChart } from "./trend-chart";

const KEY_METRICS = ["head_knee_offset", "stride_length", "front_knee_flexion", "head_speed_contact", "bat_angle_contact", "weight_forward"];

function demoSeries(): Array<{ id: string; date: string; payload: AnalysisPayload }> {
  return baselineSeries(9).map((o, i) => {
    const date = new Date(Date.UTC(2026, 8, 3 + i * 3, 17)).toISOString();
    return { id: `demo_${i}`, date, payload: analyze(o, { analysisId: `demo_${i}`, createdAt: date }) };
  });
}

export function ProgressPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Array<{ id: string; date: string; payload: AnalysisPayload }> | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    listAnalyses()
      .then((all) => setRows(all.map((a) => ({ id: a.id, date: a.recordedAt, payload: a.payload })).reverse()))
      .catch(() => setRows([]));
  }, []);

  const data = useMemo(() => (demo ? demoSeries() : (rows ?? [])), [demo, rows]);
  const valid = data.filter((r) => r.payload.analysis_status === "valid");
  const baseline = useMemo(() => buildBaseline(valid.slice(0, 10).map((v) => v.payload), { version: 1, createdAt: new Date().toISOString() }), [valid]);
  const counts = (["valid", "invalid_for_requested_analysis", "uncertain_shot", "capture_failed"] as const).map((s) => ({
    s,
    n: data.filter((r) => r.payload.analysis_status === s).length,
  }));

  if (rows === null) return <p className="mx-auto max-w-7xl px-4 py-12 text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Progress · front-foot defence</p>
          <h1 className="display text-5xl mt-2">Change you can measure.</h1>
        </div>
        <label className="chip border-line-strong text-muted min-h-10 cursor-pointer">
          <input type="checkbox" className="accent-[var(--color-gold)]" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          Show demo athlete
        </label>
      </header>
      {demo && <p className="demo-badge inline-block">DEMO DATA — synthetic athlete, not your recordings</p>}

      {data.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <p className="display text-3xl">No front-foot defences yet</p>
          <p className="text-muted">Record your first shot. Trends appear after two valid defences; your baseline after {th("baseline.min_deliveries")}.</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/analyse" className="btn btn-primary">Analyse front-foot defence</Link>
            <button className="btn btn-ghost" onClick={() => setDemo(true)}>See a demo athlete</button>
          </div>
        </div>
      ) : (
        <>
          <section aria-labelledby="outcomes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <h2 id="outcomes" className="sr-only">Outcomes so far</h2>
            {counts.map(({ s, n }) => {
              const m = STATUS_META[s];
              return (
                <div key={s} className="card p-4 flex items-center justify-between">
                  <span className={`chip ${m.ring} ${m.tone}`}><m.Icon size={14} /> {m.label}</span>
                  <span className="num text-2xl">{n}</span>
                </div>
              );
            })}
          </section>

          <section className="card p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-60">
              <p className="font-semibold">Personal baseline</p>
              <p className="text-sm text-muted">
                {baseline.established
                  ? `Established from ${baseline.n} valid defences${baseline.repeatability !== null ? ` · repeatability ${Math.round(baseline.repeatability * 100)}%` : ""}.`
                  : `${valid.length} of ${th("baseline.min_deliveries")} valid defences recorded.`}
              </p>
            </div>
            <p className="text-xs text-subtle max-w-md">Your baseline (dashed) is separate from the provisional coaching range (shaded). A change only counts when it is larger than the measurement uncertainty.</p>
          </section>

          {valid.length < 2 ? (
            <p className="text-muted">Trends need at least two valid front-foot defences.</p>
          ) : (
            <section aria-labelledby="trends" className="space-y-3">
              <h2 id="trends" className="display text-3xl">Movement indicators over time</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {KEY_METRICS.map((id) => {
                  const def = METRICS.find((m) => m.id === id)!;
                  const pts = valid
                    .map((r) => ({ r, m: r.payload.metrics.find((x) => x.id === id) }))
                    .filter(({ m }) => m && m.value !== null && m.status !== "not_measured")
                    .map(({ r, m }) => ({ id: r.id, date: r.date, value: m!.value!, uncertainty: m!.uncertainty }));
                  if (pts.length < 2) return null;
                  const b = baseline.established ? baseline.metrics[id] : undefined;
                  return (
                    <TrendChart
                      key={id}
                      title={def.name}
                      unit={def.unit}
                      decimals={def.decimals}
                      points={pts}
                      range={def.range}
                      baseline={b ? { mean: b.mean, sd: b.sd } : null}
                      onOpen={demo ? undefined : (rid) => router.push(`/report/${rid}`)}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
