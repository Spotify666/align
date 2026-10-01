"use client";

import type { MotionEvent } from "@/engine/types";
import { EVENT_LABEL } from "@/lib/viz";

/** Key moments get a label above the track first; the rest only if they fit. */
const PRIORITY = ["contact", "bounce", "front_foot_plant", "back_foot_commit", "backswing_top", "trigger", "follow_through"];
const MIN_GAP = 14; // % of track width between labels

const dot = (t: string) => (t === "contact" ? "bg-brand" : t === "bounce" ? "bg-data" : "bg-fg-subtle");
const ink = (t: string) => (t === "contact" ? "text-brand" : t === "bounce" ? "text-data" : "text-fg-subtle");

/**
 * Scrubber with event ticks. Labels above the track are placed only where they
 * fit, so nothing overlaps at any width; every moment is also a tappable chip
 * below. Keyboard: arrows step frames on the slider, chips are buttons.
 */
export function PhaseTimeline({
  events,
  frames,
  frame,
  times,
  onSeek,
}: {
  events: MotionEvent[];
  frames: number;
  frame: number;
  times: number[];
  onSeek: (frame: number) => void;
}) {
  const pct = (f: number) => (frames > 1 ? (f / (frames - 1)) * 100 : 0);
  const shown = events.filter((e) => PRIORITY.includes(e.type)).sort((a, b) => a.frame - b.frame);
  const placed: number[] = [];
  const labelled = new Set<string>();
  for (const type of PRIORITY) {
    const e = shown.find((x) => x.type === type);
    if (!e) continue;
    const x = pct(e.frame);
    if (placed.every((p) => Math.abs(p - x) >= MIN_GAP)) {
      placed.push(x);
      labelled.add(e.id);
    }
  }
  const t0 = times[0] ?? 0;
  const secs = (f: number) => (((times[f] ?? 0) - t0) / 1000).toFixed(2);

  return (
    <div className="select-none">
      <div className="relative h-5" aria-hidden>
        {shown.map((e) =>
          labelled.has(e.id) ? (
            <span
              key={e.id}
              className={`absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[0.64rem] font-medium uppercase tracking-wider ${ink(e.type)} ${e.confidence < 0.5 ? "italic opacity-70" : ""}`}
              style={{ left: `clamp(1.75rem, ${pct(e.frame)}%, calc(100% - 1.75rem))` }}
            >
              {EVENT_LABEL[e.type]}
            </span>
          ) : null,
        )}
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-[7px] top-1/2" aria-hidden>
          {shown.map((e) => (
            <span
              key={e.id}
              className={`absolute h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot(e.type)} ${labelled.has(e.id) ? "" : "opacity-60"}`}
              style={{ left: `${pct(e.frame)}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, frames - 1)}
          value={frame}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="relative h-9 w-full accent-[var(--color-brand)]"
          aria-label="Scrub through the shot"
          aria-valuetext={`Frame ${frame + 1} of ${frames}, ${secs(frame)} seconds`}
        />
      </div>
      <div className="flex justify-between text-[0.7rem] text-fg-subtle num">
        <span>0.00 s</span>
        <span className="text-fg-muted">
          frame {frame + 1}/{frames} · {secs(frame)} s
        </span>
        <span>{secs(frames - 1)} s</span>
      </div>
      <ul className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Jump to a moment">
        {shown.map((e) => (
          <li key={e.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSeek(e.frame)}
              className={`chip min-h-9 cursor-pointer transition-colors hover:bg-tint ${frame === e.frame ? "border-brand/60 bg-brand-soft text-fg" : "text-fg-muted"}`}
              aria-label={`Go to ${EVENT_LABEL[e.type]} at ${secs(e.frame)} seconds (${e.method}, confidence ${Math.round(e.confidence * 100)}%)`}
              title={e.method}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dot(e.type)}`} aria-hidden />
              <span className={e.confidence < 0.5 ? "italic" : ""}>{EVENT_LABEL[e.type]}</span>
              <span className="num font-normal text-fg-subtle">{secs(e.frame)}s</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
