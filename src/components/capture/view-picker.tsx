"use client";

import type { CameraView } from "@/engine/types";

type Choice = Extract<CameraView, "side_on" | "front_on" | "behind">;

const OPTIONS: Array<{ id: Choice; title: string; body: string; badge?: string }> = [
  { id: "side_on", title: "Side-on", body: "From the side of the pitch, square to the batter.", badge: "Best" },
  { id: "front_on", title: "From the bowler's end", body: "Looking down the pitch at the batter (front-on)." },
  { id: "behind", title: "From behind the batter", body: "Behind the stumps or keeper, looking toward the bowler." },
];

/** Top-down pitch sketch with the camera position. */
function Diagram({ id }: { id: Choice }) {
  const cam = id === "side_on" ? { x: 40, y: 50, r: 0 } : id === "front_on" ? { x: 108, y: 26, r: 90 } : { x: -28, y: 26, r: -90 };
  return (
    <svg viewBox="-40 0 160 64" className="h-14 w-full" aria-hidden>
      <rect x="0" y="18" width="80" height="16" rx="2" fill="color-mix(in srgb, var(--color-ok) 18%, transparent)" stroke="var(--color-line-strong)" />
      <line x1="6" y1="18" x2="6" y2="34" stroke="var(--color-fg-subtle)" strokeWidth="1.5" />
      <line x1="74" y1="18" x2="74" y2="34" stroke="var(--color-fg-subtle)" strokeWidth="1.5" />
      <circle cx="12" cy="26" r="3.2" fill="var(--color-data)" />
      <text x="12" y="13" textAnchor="middle" fontSize="7" fill="var(--color-fg-subtle)">batter</text>
      <text x="70" y="13" textAnchor="middle" fontSize="7" fill="var(--color-fg-subtle)">bowler</text>
      <g transform={`translate(${cam.x} ${cam.y}) rotate(${cam.r})`}>
        <rect x="-5" y="-3.5" width="10" height="7" rx="1.5" fill="var(--color-brand)" />
        <path d="M0 -3.5 L-7 -15 L7 -15 Z" fill="color-mix(in srgb, var(--color-brand) 25%, transparent)" />
      </g>
    </svg>
  );
}

export function ViewPicker({
  view,
  bowlerSide,
  suggested,
  onView,
  onBowlerSide,
  image,
  aspect,
  compact = false,
}: {
  view: Choice;
  bowlerSide: "left" | "right";
  suggested: Choice | null;
  onView: (v: Choice) => void;
  onBowlerSide: (s: "left" | "right") => void;
  image?: string | null;
  aspect?: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-5">
      {!compact && (
        <div>
          <p className="eyebrow">Moment</p>
          <h1 className="display mt-2 text-[2.2rem] sm:text-5xl">Where was the phone?</h1>
          <p className="mt-2 text-fg-muted">This sets which way is &ldquo;forward&rdquo;. {suggested ? "We've pre-selected our best guess — check it." : ""}</p>
        </div>
      )}
      {image && aspect && (
        <div className="stage mx-auto overflow-hidden rounded-2xl" style={{ aspectRatio: `${aspect}`, maxHeight: "34vh", maxWidth: `calc(34vh * ${aspect})` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="The batter at the start of the shot" className="h-full w-full object-contain" />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Camera position">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={view === o.id}
            onClick={() => onView(o.id)}
            className={`card p-3 text-left transition-colors ${view === o.id ? "border-brand ring-1 ring-brand/40" : "hover:border-line-strong"}`}
          >
            <Diagram id={o.id} />
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{o.title}</span>
              {o.badge && <span className="chip border-ok/50 text-ok !py-0 !text-[0.66rem]">{o.badge}</span>}
              {suggested === o.id && <span className="chip border-data/50 text-data !py-0 !text-[0.66rem]">Our guess</span>}
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">{o.body}</span>
          </button>
        ))}
      </div>
      {view === "side_on" && (
        <div>
          <p className="text-sm font-medium">Which side of the picture is the bowler on?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["left", "right"] as const).map((s) => (
              <button key={s} onClick={() => onBowlerSide(s)} aria-pressed={bowlerSide === s} className={`btn ${bowlerSide === s ? "btn-primary" : "btn-ghost"}`}>
                {s === "left" ? "← Left" : "Right →"}
              </button>
            ))}
          </div>
        </div>
      )}
      {view !== "side_on" && (
        <p className="rounded-xl bg-tint p-3 text-sm text-fg-muted">
          Filmed along the pitch, forward distances come from a 3D pose estimate, and bounce distance, bat speed and ball speed aren&apos;t measured. Side-on gives the most complete report.
        </p>
      )}
    </div>
  );
}
