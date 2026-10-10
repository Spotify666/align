"use client";
// The back-foot defence's base (docs/11-back-foot-defence.md): back foot back and across,
// front foot alongside it, head forward over the back foot, contact under the eyes. Two
// pictures:
//  - the position at contact (or at the set position when contact wasn't seen): each part's
//    offset against the provisional coaching range;
//  - when the back foot, the front foot and the head set, against contact.

import type { AnalysisPayload, Metric } from "@/engine/types";

type Row = { id: string; label: string; from: string };
const ROWS: Row[] = [
  { id: "bfd_feet_gap", label: "Front foot", from: "from the back foot" },
  { id: "bfd_head", label: "Head", from: "from the back foot" },
  { id: "bfd_hands_eyes", label: "Hands", from: "from the head" },
];
const NAMES: Record<string, string> = {
  bfd_back_step: "back foot back",
  bfd_feet_gap: "front foot alongside",
  bfd_head: "head forward",
  bfd_tall: "standing tall",
  bfd_head_height: "standing tall",
  bfd_elbow: "front elbow high",
  bfd_hands_eyes: "contact under the eyes",
  bfd_dead_bat: "soft hands",
  bfd_back_first: "back foot first",
  bfd_set_late: "set before the ball",
};

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

function where(id: string, v: number, axis: "forward" | "sideways") {
  const near = Math.abs(v) < 0.005;
  if (id === "bfd_feet_gap") return near ? "level with the back foot" : `${pct(v)} of your height ${v > 0 ? "in front of" : "behind"} the back foot`;
  if (id === "bfd_hands_eyes") {
    if (near) return "right under the eyes";
    if (axis === "forward") return `${pct(v)} of your height ${v > 0 ? "in front of" : "behind"} the head`;
    return `${pct(v)} of your height to the ${v > 0 ? "off" : "leg"} side of the head`;
  }
  if (near) return "right over the back ankle";
  if (axis === "forward") return `${pct(v)} of your height ${v > 0 ? "ahead of" : "behind"} the back ankle`;
  return `${pct(v)} of your height to the ${v > 0 ? "off" : "leg"} side of the back ankle`;
}

export function BackFootPanel({ payload: p, fps, onSeek }: { payload: AnalysisPayload; fps: number | null; onSeek?: (frame: number) => void }) {
  const bf = p.back_foot;
  if (!bf || p.requested_shot !== "back_foot_defence") return null;
  const graded = p.analysis_status === "valid" || (p.position_check && !["not_side_on", "not_enough", "not_on_back_foot"].includes(p.position_check.verdict));
  if (!graded) return null;
  const axis = bf.axis;
  const metric = (id: string) => p.metrics.find((m) => m.id === id && m.value !== null);
  const off = p.metrics.filter((m) => m.inRange === false).map((m) => NAMES[m.id] ?? m.name.toLowerCase());
  const checked = p.metrics.filter((m) => m.inRange !== null);
  const moment = p.mode === "posture_screen" ? "this photo" : bf.referenceKind === "contact" ? "contact" : "the set position";
  const title = !checked.length ? "The back-foot position" : off.length ? `Work on: ${[...new Set(off)].slice(0, 2).join(" and ")}` : `Back, tall and over the ball at ${moment}`;

  // Position chart geometry (stature units → px).
  const [lo, hi] = [-0.2, 0.35];
  const W = 340;
  const L = 96;
  const R = 12;
  const x = (v: number) => L + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - L - R);
  const rows = ROWS.filter((r) => metric(r.id));
  const rowY = (i: number) => 32 + i * 40;
  const H = rowY(rows.length) + 24;

  const step = metric("bfd_back_step");
  const tall = metric("bfd_tall") ?? metric("bfd_head_height");
  const elbow = metric("bfd_elbow");
  const soft = metric("bfd_dead_bat");
  const first = metric("bfd_back_first");
  const late = metric("bfd_set_late");
  const frameMs = fps ? Math.round(1000 / fps) : null;
  const tone = (m?: Metric) => (m?.inRange === false ? "text-bad" : "text-fg");

  return (
    <section aria-labelledby="bfd-h" className="card overflow-hidden">
      <div className="px-5 pt-5">
        <p className="eyebrow">The base · back foot, front foot, head, hands</p>
        <h2 id="bfd-h" className="display mt-1 text-[1.6rem] leading-tight sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-fg-muted">
          A back-foot defence is played to a short ball on the stumps: the back foot goes back and across toward the stumps, the front foot follows until it
          is alongside, and you stay tall and side-on with the head forward over the ball. The front elbow stays high and the ball is met under the eyes
          with soft hands, then held.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {rows.length > 0 && (
          <figure>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Where your front foot, head and hands were at ${moment}, against the coaching range.`}>
              <line x1={x(0)} x2={x(0)} y1={12} y2={H - 22} stroke="var(--color-fg-subtle)" strokeDasharray="4 4" strokeWidth={1.2} />
              <text x={x(0)} y={8} textAnchor="middle" fontSize={9.5} fill="var(--color-fg-subtle)">
                base
              </text>
              <text x={L} y={H - 8} fontSize={9.5} fill="var(--color-fg-subtle)">
                {axis === "forward" ? "← toward the stumps" : "← leg side"}
              </text>
              <text x={W - R} y={H - 8} textAnchor="end" fontSize={9.5} fill="var(--color-fg-subtle)">
                {axis === "forward" ? "toward the bowler →" : "off side →"}
              </text>
              {rows.map((r, i) => {
                const m = metric(r.id)!;
                const v = m.value!;
                const color = m.inRange === false ? "var(--color-bad)" : m.inRange ? "var(--color-ok)" : "var(--color-fg-muted)";
                return (
                  <g key={r.id}>
                    <text x={0} y={rowY(i) + 1} fontSize={11.5} fill="var(--color-fg)">
                      {r.label}
                    </text>
                    <text x={0} y={rowY(i) + 13} fontSize={8.5} fill="var(--color-fg-subtle)">
                      {r.from}
                    </text>
                    {m.range && <rect x={x(m.range.lo)} y={rowY(i) - 9} width={Math.max(2, x(m.range.hi) - x(m.range.lo))} height={18} rx={9} fill="#e8b23a" opacity={0.32} />}
                    <circle cx={x(v)} cy={rowY(i)} r={7} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
                    {(v < lo || v > hi) && (
                      <text x={x(v) + (v < lo ? 10 : -10)} y={rowY(i) + 4} fontSize={10} textAnchor={v < lo ? "start" : "end"} fill={color}>
                        {v < lo ? "◀" : "▶"}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <figcaption className="mt-2 space-y-1 text-sm">
              {rows.map((r) => {
                const m = metric(r.id)!;
                return (
                  <p key={r.id} className="text-fg-muted">
                    <span className={m.inRange === false ? "font-medium text-bad" : "font-medium text-fg"}>{r.label}</span> {where(r.id, m.value!, axis)}
                  </p>
                );
              })}
              <p className="pt-1 text-xs text-fg-subtle">
                Gold: the coaching range (provisional: coaching geometry from published coaching guides; no lab measurements of this shot exist yet). Measured{" "}
                {p.mode === "posture_screen" ? "on this photo, taken to be contact" : bf.referenceKind === "contact" ? "at contact" : "at the set position (bat and ball not seen, so contact is placed where your body had set)"}.
              </p>
              {onSeek && (
                <button className="mt-1 text-sm font-medium text-brand hover:underline" onClick={() => onSeek(bf.referenceFrame)}>
                  See this frame
                </button>
              )}
            </figcaption>
          </figure>
        )}

        <div className="space-y-3">
          {step && (
            <p className="text-sm">
              <span className="font-semibold">Back foot back: </span>
              <span className={tone(step)}>{pct(step.value!)} of your height</span>
              <span className="text-fg-muted"> toward the stumps (aim for 5–35%).</span>
            </p>
          )}
          {tall && (
            <p className="text-sm">
              <span className="font-semibold">Standing tall: </span>
              {tall.id === "bfd_tall" ? (
                <span className={tone(tall)}>{tall.value! > 0.005 ? `head ${pct(tall.value!)} of your height lower than in the stance` : "head as high as in the stance"}</span>
              ) : (
                <span className={tone(tall)}>head at {pct(tall.value!)} of your height above the feet</span>
              )}
              <span className="text-fg-muted">{tall.id === "bfd_tall" ? " (aim for a drop of 6% or less)." : " (aim for 80% or more)."}</span>
            </p>
          )}
          {elbow && (
            <p className="text-sm">
              <span className="font-semibold">Front elbow: </span>
              <span className={tone(elbow)}>{elbow.value! >= -0.005 ? `${pct(elbow.value!)} of your height above` : `${pct(elbow.value!)} of your height below`} the front shoulder</span>
              <span className="text-fg-muted"> (aim for no lower than 14% below it).</span>
            </p>
          )}
          {soft && (
            <p className="text-sm">
              <span className="font-semibold">Soft hands: </span>
              <span className={tone(soft)}>hands moved {pct(soft.value!)} of your height</span>
              <span className="text-fg-muted"> in the 250 ms after the ball (aim for 12% or less: the bat gives, no push).</span>
            </p>
          )}
          {bf.arrivals && p.mode !== "posture_screen" && <Arrivals arrivals={bf.arrivals} moment={bf.referenceKind === "contact" ? "contact" : "set"} axis={axis} />}
          {first && (
            <p className="text-sm">
              <span className="font-semibold">Back foot first: </span>
              <span className={tone(first)}>
                {first.value! >= 0 ? `${Math.round(first.value!)} ms before the front foot` : `the front foot set ${Math.round(-first.value!)} ms before the back foot`}
              </span>
              <span className="text-fg-muted">
                {" "}
                (aim for 0–350 ms{frameMs ? `; ± ${frameMs} ms, one frame` : ""}).
              </span>
            </p>
          )}
          {late && (
            <p className="text-sm">
              <span className="font-semibold">Set before the ball: </span>
              <span className={tone(late)}>{late.value! <= 0 ? "yes, set before contact" : `still moving ${Math.round(late.value!)} ms after contact`}</span>
            </p>
          )}
          {!bf.arrivals && p.mode !== "posture_screen" && (
            <p className="text-sm text-fg-subtle">Timing isn&apos;t measured on this clip (the camera zoomed during the stroke, or too few frames). The position at contact still is.</p>
          )}
          {axis === "sideways" && (
            <p className="rounded-lg border border-line bg-sunken p-3 text-xs text-fg-muted">
              Filmed from {p.camera_view === "behind" ? "behind the batter" : "the bowler's end"}, going back runs toward the camera, so how far the back foot
              went and the gap between the feet can&apos;t be measured; the head and hands are read sideways (over the line of the ball). Film side-on to measure
              the footwork too.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Arrivals({ arrivals, moment, axis }: { arrivals: NonNullable<NonNullable<AnalysisPayload["back_foot"]>["arrivals"]>; moment: "contact" | "set"; axis: "forward" | "sideways" }) {
  const rows: Array<{ id: keyof typeof arrivals; label: string }> = [
    { id: "back_foot", label: "Back foot sets" },
    { id: "front_foot", label: "Front foot alongside" },
    { id: "head", label: "Head settles" },
  ];
  const ms = rows.map((r) => arrivals[r.id].ms).filter((v): v is number => v !== null);
  if (ms.length < 2) return null;
  const lo = Math.min(-400, Math.floor(Math.min(...ms) / 100) * 100 - 100);
  const hi = Math.max(200, Math.ceil(Math.max(...ms) / 100) * 100 + 100);
  const W = 340;
  const L = 132;
  const R = 10;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const rowY = (i: number) => 24 + i * 24;
  const H = rowY(rows.length) + 22;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 100) ticks.push(t);
  return (
    <figure>
      <p className="text-sm font-semibold">When each part set</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`When the back foot, the front foot and the head set, in milliseconds from ${moment}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={6} y2={H - 16} stroke="var(--color-line)" strokeWidth={t === 0 ? 0 : 1} />
            <text x={x(t)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--color-fg-subtle)">
              {t === 0 ? "0" : `${t > 0 ? "+" : ""}${t}`}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={10} y2={H - 14} stroke="var(--color-brand)" strokeWidth={2} />
        <text x={x(0) + 3} y={8} textAnchor="start" fontSize={9.5} fontWeight={600} fill="var(--color-brand)">
          {moment}
        </text>
        {rows.map((r, i) => {
          const a = arrivals[r.id];
          return (
            <g key={r.id}>
              <text x={0} y={rowY(i) + 4} fontSize={10.5} fill={a.ms === null ? "var(--color-fg-subtle)" : "var(--color-fg)"}>
                {r.label}
              </text>
              {a.ms !== null ? (
                <circle cx={x(a.ms)} cy={rowY(i)} r={5.5} fill={a.ms > 70 && moment === "contact" ? "var(--color-bad)" : "var(--color-data)"} />
              ) : (
                <text x={L} y={rowY(i) + 4} fontSize={9.5} fill="var(--color-fg-subtle)">
                  {a.still ? (r.id !== "head" && axis === "sideways" ? "toward the camera: not timed" : "hardly moved") : "not seen"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-fg-subtle">Milliseconds from {moment === "contact" ? "contact" : "the set position"}; negative = before. The back foot moves first, the front foot follows.</figcaption>
    </figure>
  );
}
