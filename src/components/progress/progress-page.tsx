"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { analyze } from "@/engine/analyze";
import { baselineSeries } from "@/engine/fixtures";
import { buildBaseline } from "@/engine/baseline";
import { ALL_METRICS, th } from "@/engine/registry";
import type { AnalysisPayload, TargetShot } from "@/engine/types";
import { listAnalyses } from "@/lib/store";
import { STATUS_META } from "../report/status";
import { TrendChart } from "./trend-chart";

const KEY_METRICS: Record<TargetShot, string[]> = {
  front_foot_defence: ["line_head", "line_shoulder", "line_knee", "line_held", "sync_spread", "stride_length", "front_knee_flexion", "weight_forward"],
  back_foot_defence: ["bfd_back_step", "bfd_feet_gap", "bfd_head", "bfd_tall", "bfd_elbow", "bfd_hands_eyes", "bfd_dead_bat", "bfd_back_first"],
};
const SHOTS: Array<{ id: TargetShot; label: string; plural: string }> = [
  { id: "front_foot_defence", label: "Front-foot defence", plural: "front-foot defences" },
  { id: "back_foot_defence", label: "Back-foot defence", plural: "back-foot defences" },
];

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
  const [shot, setShot] = useState<TargetShot>("front_foot_defence");
  const shotInfo = SHOTS.find((x) => x.id === shot)!;

  useEffect(() => {
    listAnalyses()
      .then((all) => setRows(all.map((a) => ({ id: a.id, date: a.recordedAt, payload: a.payload })).reverse()))
      .catch(() => setRows([]));
  }, []);

  // One shot at a time: the two defences are measured differently and never share a chart.
  const data = useMemo(() => (demo ? demoSeries() : (rows ?? [])).filter((r) => (r.payload.requested_shot ?? "front_foot_defence") === shot), [demo, rows, shot]);
  const valid = data.filter((r) => r.payload.analysis_status === "valid");
  const baseline = useMemo(() => buildBaseline(valid.slice(0, 10).map((v) => v.payload), { version: 1, createdAt: new Date().toISOString() }), [valid]);
  const counts = (["valid", "invalid_for_requested_analysis", "uncertain_shot", "capture_failed"] as const).map((s) => ({
    s,
    n: data.filter((r) => r.payload.analysis_status === s).length,
  }));

  if (rows === null) return <p className="mx-auto max-w-7xl px-4 py-12 text-fg-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Progress · {shotInfo.label.toLowerCase()}</p>
          <h1 className="display text-5xl mt-2">Change you can measure.</h1>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Shot">
            {SHOTS.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={shot === x.id} onClick={() => setShot(x.id)} className={`chip min-h-10 ${shot === x.id ? "border-brand text-fg" : "border-line-strong text-fg-muted"}`}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <label className="chip border-line-strong text-fg-muted min-h-10 cursor-pointer">
          <input type="checkbox" className="accent-[var(--color-brand)]" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          Show demo athlete
        </label>
      </header>
      {demo && <p className="demo-badge inline-block">DEMO DATA — synthetic athlete, not your recordings</p>}

      {data.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <p className="display text-3xl">No {shotInfo.plural} yet</p>
          <p className="text-fg-muted">Record your first shot. Trends appear after two valid defences; your baseline after {th("baseline.min_deliveries")}.</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href={shot === "back_foot_defence" ? "/analyse?shot=back" : "/analyse"} className="btn btn-primary">Analyse {shotInfo.label.toLowerCase()}</Link>
            {shot === "front_foot_defence" && <button className="btn btn-ghost" onClick={() => setDemo(true)}>See a demo athlete</button>}
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
              <p className="text-sm text-fg-muted">
                {baseline.established
                  ? `Established from ${baseline.n} valid defences${baseline.repeatability !== null ? ` · repeatability ${Math.round(baseline.repeatability * 100)}%` : ""}.`
                  : `${valid.length} of ${th("baseline.min_deliveries")} valid defences recorded.`}
              </p>
            </div>
            <p className="text-xs text-fg-subtle max-w-md">Your baseline (dashed) is separate from the provisional coaching range (shaded). A change only counts when it is larger than the measurement uncertainty.</p>
          </section>

          {valid.length < 2 ? (
            <p className="text-fg-muted">Trends need at least two valid {shotInfo.plural}.</p>
          ) : (
            <section aria-labelledby="trends" className="space-y-3">
              <h2 id="trends" className="display text-3xl">Movement indicators over time</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {KEY_METRICS[shot].map((id) => {
                  const def = ALL_METRICS.find((m) => m.id === id)!;
                  // The line is read along the pitch side-on and sideways from either end:
                  // never mix the two on one chart. Follow the latest shot's camera position.
                  const all = valid.map((r) => ({ r, m: r.payload.metrics.find((x) => x.id === id) }));
                  const axis = [...all].reverse().find(({ m }) => m?.axis)?.m?.axis;
                  const pts = all
                    .filter(({ m }) => m && m.value !== null && m.status !== "not_measured" && (!axis || m.axis === axis))
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
                      range={axis === "sideways" && def.rangeSideways ? def.rangeSideways : def.range}
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
