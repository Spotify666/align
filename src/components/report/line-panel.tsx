"use client";
// The line: head, front shoulder and front knee over the front foot, held until the bat
// meets the ball, with the foot, knee and shoulder arriving together. Two pictures:
//  - the stack at contact (or at the set position when contact wasn't seen): each part's
//    offset from the front ankle against the band professionals play in;
//  - when each part arrived in its set position, against contact.

import type { AnalysisPayload, LinePartId } from "@/engine/types";

const PARTS: Array<{ id: LinePartId; label: string }> = [
  { id: "head", label: "Head" },
  { id: "shoulder", label: "Front shoulder" },
  { id: "knee", label: "Front knee" },
];

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

function where(v: number, axis: "forward" | "sideways") {
  if (Math.abs(v) < 0.005) return "over the front ankle";
  if (axis === "forward") return `${pct(v)} of your height ${v > 0 ? "ahead of" : "behind"} the front ankle`;
  return `${pct(v)} of your height to the ${v > 0 ? "off" : "leg"} side of the front ankle`;
}

export function LinePanel({ payload: p, fps, onSeek }: { payload: AnalysisPayload; fps: number | null; onSeek?: (frame: number) => void }) {
  const line = p.line;
  if (!line) return null;
  const axis = line.axis;
  const metric = (id: string) => p.metrics.find((m) => m.id === id);
  const inBand = (id: LinePartId) => {
    const v = line.atReference[id];
    if (v === null) return null;
    if (id === "head" && line.sideUnclear) return null;
    return v >= line.bands[id][0] && v <= line.bands[id][1];
  };
  const checks = PARTS.map((x) => inBand(x.id)).filter((x): x is boolean => x !== null);
  const allIn = checks.length > 0 && checks.every(Boolean);
  const off = PARTS.filter((x) => inBand(x.id) === false);
  const moment = line.referenceKind === "contact" ? "contact" : "the set position";
  const title = allIn ? `In line at ${moment}` : off.length ? `Out of line: ${off.map((x) => x.label.toLowerCase()).join(" and ")}` : "The line";

  // Stack chart geometry (stature units → px).
  const [lo, hi] = [-0.25, 0.3];
  const W = 340;
  const L = 96;
  const R = 12;
  const x = (v: number) => L + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - L - R);
  const rowY = (i: number) => 26 + i * 40;
  const H = rowY(PARTS.length) + 30;

  const held = metric("line_held");
  const sync = metric("sync_spread");
  const late = metric("set_late");
  const arrivals = line.arrivals;
  const frameMs = fps ? Math.round(1000 / fps) : null;

  return (
    <section aria-labelledby="line-h" className="card overflow-hidden">
      <div className="px-5 pt-5">
        <p className="eyebrow">The line · head, front shoulder, front knee, front foot</p>
        <h2 id="line-h" className="display mt-1 text-[1.6rem] leading-tight sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-fg-muted">
          A front-foot defence is built on one line: the front shoulder leads into the line of the ball, the head goes over the ball, and the front knee
          and foot stay under them, held until the bat meets the ball. The stride changes with the length of the ball; this stack doesn&apos;t.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <figure>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Where your head, front shoulder and front knee were at ${moment}, against the range professionals play in.`}>
            {/* the front foot's line */}
            <line x1={x(0)} x2={x(0)} y1={8} y2={H - 22} stroke="var(--color-fg-subtle)" strokeDasharray="4 4" strokeWidth={1.2} />
            <text x={x(0)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-fg-subtle)">
              front ankle
            </text>
            <text x={L} y={H - 8} fontSize={9.5} fill="var(--color-fg-subtle)">
              {axis === "forward" ? "← behind" : "← leg side"}
            </text>
            <text x={W - R} y={H - 8} textAnchor="end" fontSize={9.5} fill="var(--color-fg-subtle)">
              {axis === "forward" ? "toward the bowler →" : "off side →"}
            </text>
            {PARTS.map((part, i) => {
              const v = line.atReference[part.id];
              const [blo, bhi] = line.bands[part.id];
              const ok = inBand(part.id);
              const color = ok === false ? "var(--color-bad)" : ok ? "var(--color-ok)" : "var(--color-fg-muted)";
              return (
                <g key={part.id}>
                  <text x={0} y={rowY(i) + 4} fontSize={11.5} fill="var(--color-fg)">
                    {part.label}
                  </text>
                  <rect x={x(blo)} y={rowY(i) - 9} width={Math.max(2, x(bhi) - x(blo))} height={18} rx={9} fill="var(--color-band)" opacity={0.35} />
                  {v !== null && (
                    <>
                      <circle cx={x(v)} cy={rowY(i)} r={7} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
                      {(v < lo || v > hi) && (
                        <text x={x(v) + (v < lo ? 10 : -10)} y={rowY(i) + 4} fontSize={10} textAnchor={v < lo ? "start" : "end"} fill={color}>
                          {v < lo ? "◀" : "▶"}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          <figcaption className="mt-2 space-y-1 text-sm">
            {PARTS.map((part) => {
              const v = line.atReference[part.id];
              if (v === null) return null;
              return (
                <p key={part.id} className="text-fg-muted">
                  <span className={inBand(part.id) === false ? "font-medium text-bad" : "font-medium text-fg"}>{part.label}</span> {where(v, axis)}
                </p>
              );
            })}
            <p className="pt-1 text-xs text-fg-subtle">
              Shaded: where professionals&apos; head, shoulder and knee sit ({axis === "sideways" ? "323 international defences" : "coaching geometry, checked on side-on photos"}). Measured{" "}
              {line.referenceKind === "contact" ? "at contact" : "at the set position (bat and ball not seen, so contact is placed where your body had set)"}.
            </p>
            {onSeek && (
              <button className="mt-1 text-sm font-medium text-brand hover:underline" onClick={() => onSeek(line.referenceFrame)}>
                See this frame
              </button>
            )}
          </figcaption>
        </figure>

        <div className="space-y-4">
          {held?.value != null && (
            <div>
              <p className="text-sm">
                <span className="font-semibold">Held in line: </span>
                <span className={held.inRange === false ? "text-bad" : "text-fg"}>{Math.round(held.value * 100)}% of the time</span>
                <span className="text-fg-muted"> from the front foot&apos;s landing to {moment}</span>
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className={`h-full rounded-full ${held.inRange === false ? "bg-bad" : "bg-ok"}`} style={{ width: `${Math.round(held.value * 100)}%` }} />
              </div>
            </div>
          )}
          {arrivals && <Arrivals arrivals={arrivals} moment={moment} axis={axis} />}
          {sync?.value != null && (
            <p className="text-sm">
              <span className="font-semibold">Foot, knee and shoulder together: </span>
              <span className={sync.inRange === false ? "text-bad" : "text-fg"}>within {Math.round(sync.value)} ms</span>
              <span className="text-fg-muted">
                {" "}
                of each other (aim for 150 ms or less{frameMs ? `; ± ${frameMs} ms, one frame at ${Math.round(1000 / frameMs)} fps` : ""}).
              </span>
            </p>
          )}
          {late?.value != null && (
            <p className="text-sm">
              <span className="font-semibold">Set before the ball: </span>
              <span className={late.inRange === false ? "text-bad" : "text-fg"}>{late.value <= 0 ? "yes, all set before contact" : `still moving ${Math.round(late.value)} ms after contact`}</span>
            </p>
          )}
          {!arrivals && p.mode !== "posture_screen" && (
            <p className="text-sm text-fg-subtle">Timing isn&apos;t measured on this clip (the camera zoomed during the stroke, or too few frames). The stack at contact still is.</p>
          )}
          {axis === "sideways" && (
            <p className="rounded-lg border border-line bg-sunken p-3 text-xs text-fg-muted">
              Filmed from {p.camera_view === "behind" ? "behind the batter" : "the bowler's end"}, the camera sees the line sideways: head over the line of the ball, shoulder and knee
              over the front foot. How far forward they are (head over the front toe) needs a side-on view: the 3D view shows an estimated side view of
              your pose, not graded. Film side-on, or with two phones, to check both.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Arrivals({ arrivals, moment, axis }: { arrivals: NonNullable<NonNullable<AnalysisPayload["line"]>["arrivals"]>; moment: string; axis: "forward" | "sideways" }) {
  const rows: Array<{ id: keyof typeof arrivals; label: string }> = [
    { id: "foot", label: "Front foot lands" },
    { id: "knee", label: "Knee takes the weight" },
    { id: "shoulder", label: "Front shoulder arrives" },
    { id: "head", label: "Head arrives" },
  ];
  const ms = rows.map((r) => arrivals[r.id].ms).filter((v): v is number => v !== null);
  if (ms.length < 2) return null;
  const lo = Math.min(-400, Math.floor(Math.min(...ms) / 100) * 100 - 100);
  const hi = Math.max(200, Math.ceil(Math.max(...ms) / 100) * 100 + 100);
  const W = 340;
  const L = 132;
  const R = 10;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const rowY = (i: number) => 18 + i * 24;
  const H = rowY(rows.length) + 22;
  const key = ["foot", "knee", "shoulder"].map((k) => arrivals[k as keyof typeof arrivals].ms).filter((v): v is number => v !== null);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 100) ticks.push(t);
  return (
    <figure>
      <p className="text-sm font-semibold">When each part arrived</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`When the front foot, knee, shoulder and head reached their set position, in milliseconds from ${moment}.`}>
        {key.length >= 2 && (
          <rect x={x(Math.min(...key))} y={6} width={Math.max(2, x(Math.max(...key)) - x(Math.min(...key)))} height={rowY(2) + 12 - 6} rx={6} fill="var(--color-band)" opacity={0.3} />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={6} y2={H - 16} stroke="var(--color-line)" strokeWidth={t === 0 ? 0 : 1} />
            <text x={x(t)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--color-fg-subtle)">
              {t === 0 ? "" : `${t > 0 ? "+" : ""}${t}`}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={2} y2={H - 14} stroke="var(--color-brand)" strokeWidth={2} />
        <text x={x(0)} y={H - 4} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="var(--color-brand)">
          {moment === "contact" ? "contact" : "set"}
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
                  {a.still ? "hardly moved" : "not seen"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-fg-subtle">Milliseconds from {moment}; negative = before. Shaded: the spread of foot, knee and shoulder.</figcaption>
    </figure>
  );
}
