"use client";

import { useState } from "react";

export interface TrendPoint {
  id: string;
  date: string;
  value: number;
  uncertainty: number | null;
}

/**
 * One measure over time: a single series (no legend box — the title names it),
 * provisional coaching range as a band, personal baseline as a dashed band,
 * hover/focus tooltip on each point, and a table view for screen readers.
 */
export function TrendChart({
  title,
  unit,
  decimals,
  points,
  range,
  baseline,
  onOpen,
}: {
  title: string;
  unit: string;
  decimals: number;
  points: TrendPoint[];
  range: { lo: number; hi: number } | null;
  baseline: { mean: number; sd: number } | null;
  onOpen?: (id: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 320;
  const H = 150;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const ys = points.flatMap((p) => [p.value - (p.uncertainty ?? 0), p.value + (p.uncertainty ?? 0)]);
  if (range) ys.push(range.lo, range.hi);
  if (baseline) ys.push(baseline.mean - baseline.sd, baseline.mean + baseline.sd);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  const span = hi - lo || 1;
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (i: number) => pad.l + (points.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const fmt = (v: number) => v.toFixed(decimals);
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const last = points[points.length - 1];

  return (
    <figure className="card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="num text-sm text-fg-muted">{last ? `${fmt(last.value)} ${unit}` : "—"}</span>
      </figcaption>
      {table ? (
        <table className="mt-3 w-full text-sm num">
          <caption className="sr-only">{title} by session</caption>
          <thead>
            <tr className="text-fg-subtle text-left"><th className="font-normal">Date</th><th className="font-normal">Value</th><th className="font-normal">±</th></tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-1">{new Date(p.date).toLocaleDateString()}</td>
                <td>{fmt(p.value)} {unit}</td>
                <td>{p.uncertainty !== null ? fmt(p.uncertainty) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title} trend over ${points.length} sessions`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--color-fg-subtle)" className="num">{fmt(t)}</text>
              </g>
            ))}
            {range && (
              <rect x={pad.l} width={W - pad.l - pad.r} y={y(range.hi)} height={Math.max(1, y(range.lo) - y(range.hi))} fill="color-mix(in srgb, var(--color-ok) 12%, transparent)" />
            )}
            {baseline && Number.isFinite(baseline.sd) && (
              <rect x={pad.l} width={W - pad.l - pad.r} y={y(baseline.mean + baseline.sd)} height={Math.max(1, y(baseline.mean - baseline.sd) - y(baseline.mean + baseline.sd))}
                fill="none" stroke="var(--color-data)" strokeDasharray="4 3" strokeWidth="1" opacity="0.7" />
            )}
            {points.length > 1 && (
              <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--color-data)" strokeWidth="2" strokeLinejoin="round" />
            )}
            {points.map((p, i) => (
              <g key={p.id}>
                {p.uncertainty !== null && (
                  <line x1={x(i)} x2={x(i)} y1={y(p.value - p.uncertainty)} y2={y(p.value + p.uncertainty)} stroke="var(--color-fg-muted)" strokeWidth="1.2" />
                )}
                <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} fill="var(--color-data)" stroke="var(--color-surface)" strokeWidth="2" />
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r="14"
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${new Date(p.date).toLocaleDateString()}: ${fmt(p.value)} ${unit}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onOpen?.(p.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpen?.(p.id)}
                  style={{ cursor: onOpen ? "pointer" : "default", outline: "none" }}
                />
              </g>
            ))}
            <text x={pad.l} y={H - 6} fontSize="9" fill="var(--color-fg-subtle)">{points[0] ? new Date(points[0].date).toLocaleDateString() : ""}</text>
            <text x={W - pad.r} y={H - 6} fontSize="9" textAnchor="end" fill="var(--color-fg-subtle)">{last ? new Date(last.date).toLocaleDateString() : ""}</text>
          </svg>
          {hover !== null && points[hover] && (
            <div className="pointer-events-none absolute -top-1 rounded-md border border-line-strong bg-bg px-2 py-1 text-xs num shadow-lg"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: "translate(-50%, -100%)" }}>
              {new Date(points[hover].date).toLocaleDateString()} · <span className="text-fg">{fmt(points[hover].value)} {unit}</span>
              {points[hover].uncertainty !== null && <span className="text-fg-subtle"> ± {fmt(points[hover].uncertainty!)}</span>}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-fg-subtle">
        {range && <span><span className="inline-block h-2 w-3 bg-ok/25 align-middle mr-1" />coaching range (provisional)</span>}
        {baseline && <span><span className="inline-block h-2 w-3 border border-dashed border-data align-middle mr-1" />your baseline</span>}
        <button className="ml-auto underline min-h-8" onClick={() => setTable((t) => !t)}>{table ? "Chart" : "Table"}</button>
      </div>
    </figure>
  );
}
