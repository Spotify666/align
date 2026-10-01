/**
 * Comparison range: provisional coaching band, optional personal-baseline band,
 * and the measured value with its uncertainty whisker. Meaning never relies on
 * colour alone — the caption states the reading in words.
 */
export function RangeBar({
  value,
  uncertainty,
  range,
  baseline,
  decimals,
  unit,
}: {
  value: number;
  uncertainty: number | null;
  range: { lo: number; hi: number } | null;
  baseline?: { mean: number; sd: number } | null;
  decimals: number;
  unit: string;
}) {
  const u = uncertainty ?? 0;
  const pts = [value - u, value + u];
  if (range) pts.push(range.lo, range.hi);
  if (baseline) pts.push(baseline.mean - baseline.sd, baseline.mean + baseline.sd);
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  const pad = (hi - lo || Math.abs(value) || 1) * 0.25;
  lo -= pad;
  hi += pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const fmt = (v: number) => v.toFixed(decimals);
  const inRange = range ? value >= range.lo && value <= range.hi : null;

  return (
    <figure className="w-full">
      <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="h-7 w-full overflow-visible" role="img"
        aria-label={`Value ${fmt(value)}${unit ? ` ${unit}` : ""}${u ? `, plus or minus ${fmt(u)}` : ""}${range ? `; coaching range ${fmt(range.lo)} to ${fmt(range.hi)}` : ""}${baseline ? `; your usual ${fmt(baseline.mean)}` : ""}`}>
        <line x1="0" x2="100" y1="11" y2="11" stroke="var(--color-line-strong)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {range && (
          <rect x={x(range.lo)} width={Math.max(0.5, x(range.hi) - x(range.lo))} y="6" height="10" rx="1.5"
            fill="color-mix(in srgb, var(--color-lime) 16%, transparent)" stroke="color-mix(in srgb, var(--color-lime) 55%, transparent)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        )}
        {baseline && Number.isFinite(baseline.sd) && (
          <rect x={x(baseline.mean - baseline.sd)} width={Math.max(0.5, x(baseline.mean + baseline.sd) - x(baseline.mean - baseline.sd))} y="3" height="16" rx="1.5"
            fill="none" stroke="var(--color-cyan)" strokeDasharray="2 1.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        {u > 0 && (
          <line x1={x(value - u)} x2={x(value + u)} y1="11" y2="11" stroke="var(--color-text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
        <circle cx={x(value)} cy="11" r="2.6" fill={inRange === false ? "var(--color-coral)" : "var(--color-text)"} stroke="var(--color-carbon)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.72rem] text-subtle num">
        {range && (
          <span>
            <span className="inline-block h-2 w-3 rounded-sm bg-lime/30 align-middle mr-1" />
            range {fmt(range.lo)}–{fmt(range.hi)}
          </span>
        )}
        {baseline && (
          <span>
            <span className="inline-block h-2 w-3 rounded-sm border border-dashed border-cyan align-middle mr-1" />
            yours {fmt(baseline.mean)} ± {fmt(baseline.sd)}
          </span>
        )}
        {inRange !== null && <span className={inRange ? "text-lime" : "text-coral"}>{inRange ? "within range" : "outside range"}</span>}
      </figcaption>
    </figure>
  );
}
