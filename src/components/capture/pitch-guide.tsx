"use client";

import { useState } from "react";

type View = "side" | "end";

/** What each camera position asks for, in order. Also read by the line-up screen. */
export const CAMERA_STEPS: Record<View, { title: string; steps: string[]; alt: string }> = {
  side: {
    title: "From the side",
    alt: "Plan of the pitch. The phone is square of the batter, level with the crease, 6 to 8 metres away on the off side.",
    steps: [
      "Stand square of the batter, level with the batting crease.",
      "6 to 8 metres away, on either side of the pitch.",
      "Hip height, phone on its side (landscape).",
      "In the picture: the whole batter, the stumps and where the ball bounces.",
      "Keep it still: a tripod, or wedge the phone against something.",
    ],
  },
  end: {
    title: "From the bowler's end",
    alt: "Plan of the pitch. The phone is straight behind the bowler's stumps, in line with middle stump.",
    steps: [
      "Stand straight behind the bowler's stumps, in line with middle stump.",
      "Zoom in until the batter fills about half the height of the picture.",
      "Chest height, phone upright (portrait).",
      "In the picture: the whole batter and the stumps, for the whole ball.",
      "Keep it still: a tripod, or a helper standing where the umpire stands.",
    ],
  },
};

// The plan is to scale: 1 unit = 10 cm. A pitch is 20.12 m between the stumps and 3.05 m wide;
// the batting crease is 1.22 m in front of the stumps.
const CY = 34; // centre line of the pitch
const BAT = 30; // the batter's stumps
const BOWL = BAT + 201.2;
const CREASE = BAT + 12.2;

/**
 * Where to put the phone, on a plan of the pitch drawn to scale: the two camera positions
 * Aline reads (side-on and straight down the pitch), what each must keep in the picture, and
 * where not to film from. Static guidance: nothing here uses the camera or the phone's sensors.
 */
export function PitchGuide() {
  const [view, setView] = useState<View>("side");
  const g = CAMERA_STEPS[view];
  const cam = view === "side" ? { x: CREASE, y: CY + 70 } : { x: BOWL + 24, y: CY };
  const zone = view === "side" ? { x: CREASE - 15, y: CY + 60, w: 30, h: 20 } : { x: BOWL + 14, y: CY - 8, w: 22, h: 16 };
  const other = view === "side" ? { x: BOWL + 24, y: CY } : { x: CREASE, y: CY + 70 };
  // What the phone must see: side-on, from the stumps to the bounce; from the end, the batter.
  const sight = view === "side" ? [[BAT - 6, CY], [CREASE + 75, CY]] : [[CREASE + 4, CY - 13], [CREASE + 4, CY + 13]];

  return (
    <figure className="rounded-lg border border-line p-4">
      <div role="group" aria-label="Camera position" className="grid grid-cols-2 gap-2">
        {(["side", "end"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-md border px-2 text-sm font-medium transition-colors duration-150 ${view === v ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
          >
            {CAMERA_STEPS[v].title}
          </button>
        ))}
      </div>

      <svg viewBox="0 0 280 126" className="mt-4 w-full" role="img" aria-label={g.alt}>
        {/* The pitch, its creases and both sets of stumps. */}
        <rect x={BAT - 12} y={CY - 15.25} width={BOWL - BAT + 24} height="30.5" fill="var(--tint)" stroke="var(--line-strong)" strokeWidth="0.6" />
        {[CREASE, BOWL - 12.2].map((x) => (
          <line key={x} x1={x} y1={CY - 15.25} x2={x} y2={CY + 15.25} stroke="var(--fg-subtle)" strokeWidth="0.6" />
        ))}
        {[BAT, BOWL].map((x) => (
          <line key={x} x1={x} y1={CY - 1.2} x2={x} y2={CY + 1.2} stroke="var(--fg)" strokeWidth="1.6" />
        ))}
        {/* The batter, and roughly where a good-length ball bounces. */}
        <circle cx={CREASE - 3} cy={CY} r="3.2" fill="var(--fg)" />
        <text x={CREASE - 3} y={CY - 19} textAnchor="middle" fontSize="7" fill="var(--fg-muted)">batter</text>
        <ellipse cx={CREASE + 55} cy={CY} rx="20" ry="9" fill="none" stroke="var(--fg-subtle)" strokeWidth="0.6" strokeDasharray="2 2" />
        <text x={CREASE + 55} y={CY + 2.5} textAnchor="middle" fontSize="6.5" fill="var(--fg-subtle)">ball bounces</text>
        <text x={BOWL} y={CY - 19} textAnchor="middle" fontSize="7" fill="var(--fg-muted)">bowler</text>

        {/* Where to stand, the phone, and what it must see. */}
        <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="2" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="0.8" />
        {sight.map(([x, y], i) => (
          <line key={i} x1={cam.x} y1={cam.y} x2={x} y2={y} stroke="var(--brand)" strokeWidth="0.7" strokeDasharray="2.5 2.5" />
        ))}
        <rect x={cam.x - 4.5} y={cam.y - 2.8} width="9" height="5.6" rx="1.2" fill="var(--brand)" />
        <text x={view === "side" ? cam.x - 15 : cam.x - 4} y={cam.y + 16} textAnchor={view === "side" ? "start" : "middle"} fontSize="7" fill="var(--fg)">
          {view === "side" ? "phone · 6–8 m · hip height" : "phone · chest height"}
        </text>
        {/* The other position Aline reads, dimmed. */}
        <rect x={other.x - 4.5} y={other.y - 2.8} width="9" height="5.6" rx="1.2" fill="none" stroke="var(--fg-subtle)" strokeWidth="0.7" />
        {/* Not from here. */}
        <g stroke="var(--warn)" strokeWidth="0.8" fill="none">
          <rect x="128" y={CY + 40} width="92" height="26" rx="2" strokeDasharray="3 2.5" />
          <path d={`M134 ${CY + 49} l8 8 m0 -8 l-8 8`} />
        </g>
        <text x="147" y={CY + 51} fontSize="6.5" fill="var(--fg-muted)">Not at an angle:</text>
        <text x="147" y={CY + 59} fontSize="6.5" fill="var(--fg-muted)">the line can&apos;t be read</text>
      </svg>

      <figcaption className="mt-3">
        <ol className="grid gap-1.5 text-sm text-fg-muted">
          {g.steps.map((s, i) => (
            <li key={s} className="flex gap-2.5">
              <span className="num w-4 shrink-0 text-fg-subtle">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-fg-subtle">Drawn to scale. Side-on gives every measure; from the bowler&apos;s end the line is read sideways and forward distances are not graded.</p>
      </figcaption>
    </figure>
  );
}

/**
 * The same plan with both phones on it, for filming one ball from two angles at once: one
 * square of the crease, one straight behind the bowler's stumps. To scale.
 */
export function DualPlan() {
  const side = { x: CREASE, y: CY + 70 };
  const end = { x: BOWL + 24, y: CY };
  return (
    <svg
      viewBox="0 0 280 126"
      className="w-full"
      role="img"
      aria-label="Plan of the pitch with two phones: one square of the batter, level with the crease, 6 to 8 metres away; one straight behind the bowler's stumps."
    >
      <rect x={BAT - 12} y={CY - 15.25} width={BOWL - BAT + 24} height="30.5" fill="var(--tint)" stroke="var(--line-strong)" strokeWidth="0.6" />
      {[CREASE, BOWL - 12.2].map((x) => (
        <line key={x} x1={x} y1={CY - 15.25} x2={x} y2={CY + 15.25} stroke="var(--fg-subtle)" strokeWidth="0.6" />
      ))}
      {[BAT, BOWL].map((x) => (
        <line key={x} x1={x} y1={CY - 1.2} x2={x} y2={CY + 1.2} stroke="var(--fg)" strokeWidth="1.6" />
      ))}
      <circle cx={CREASE - 3} cy={CY} r="3.2" fill="var(--fg)" />
      <text x={CREASE - 3} y={CY - 19} textAnchor="middle" fontSize="7" fill="var(--fg-muted)">batter</text>
      <text x={BOWL} y={CY - 19} textAnchor="middle" fontSize="7" fill="var(--fg-muted)">bowler</text>
      {[side, end].map((c, i) => (
        <g key={i}>
          <line x1={c.x} y1={c.y} x2={CREASE - 3} y2={CY} stroke="var(--brand)" strokeWidth="0.7" strokeDasharray="2.5 2.5" />
          <rect x={c.x - 4.5} y={c.y - 2.8} width="9" height="5.6" rx="1.2" fill="var(--brand)" />
        </g>
      ))}
      <text x={side.x + 9} y={side.y + 2.5} fontSize="7" fill="var(--fg)">side phone · 6–8 m</text>
      <text x={end.x} y={end.y + 14} textAnchor="middle" fontSize="7" fill="var(--fg)">front phone</text>
    </svg>
  );
}
