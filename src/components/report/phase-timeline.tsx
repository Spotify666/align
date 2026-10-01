"use client";

import type { MotionEvent } from "@/engine/types";
import { EVENT_LABEL } from "@/lib/viz";

/** Scrubber with event markers. Keyboard: arrows step frames, markers are buttons. */
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
  const shown = events
    .filter((e) => e.type !== "setup" && e.type !== "recovery" && e.type !== "downswing_onset")
    .sort((a, b) => a.frame - b.frame);
  // Stack labels that would collide into up to three rows.
  const lastInRow: number[] = [];
  const rowOf = shown.map((e) => {
    const x = pct(e.frame);
    let row = lastInRow.findIndex((last) => x - last > 11);
    if (row < 0) row = Math.min(lastInRow.length, 2);
    lastInRow[row] = x;
    return row;
  });
  const rows = Math.max(1, ...rowOf.map((r) => r + 1));
  const t0 = times[0] ?? 0;
  return (
    <div className="select-none">
      <div className="relative" style={{ height: `${rows * 15 + 14}px` }}>
        {shown.map((e, i) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onSeek(e.frame)}
            className="group absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${pct(e.frame)}%`, paddingBottom: 0 }}
            aria-label={`Go to ${EVENT_LABEL[e.type] ?? e.type} at ${((e.tMs - t0) / 1000).toFixed(2)} seconds (${e.method}, confidence ${Math.round(e.confidence * 100)}%)`}
            title={`${EVENT_LABEL[e.type]} · ${e.method}`}
          >
            <span
              className={`text-[0.62rem] uppercase tracking-wider num leading-none px-1 py-0.5 rounded ${
                e.type === "contact" ? "text-gold" : e.type === "bounce" ? "text-cyan" : "text-subtle"
              } ${e.confidence < 0.5 ? "opacity-60 italic" : ""} group-hover:text-text`}
            >
              {EVENT_LABEL[e.type] ?? e.type}
            </span>
            <span className={`mt-0.5 w-px ${e.type === "contact" ? "bg-gold" : "bg-line-strong"}`} style={{ height: `${12 + rowOf[i]! * 15}px` }} />
          </button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, frames - 1)}
        value={frame}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full accent-[var(--color-gold)] h-8"
        aria-label="Scrub through the delivery"
        aria-valuetext={`Frame ${frame + 1} of ${frames}, ${(((times[frame] ?? 0) - t0) / 1000).toFixed(3)} seconds`}
      />
      <div className="tick-rule opacity-60" aria-hidden />
      <div className="mt-1 flex justify-between text-[0.7rem] text-subtle num">
        <span>{(0).toFixed(2)} s</span>
        <span className="text-muted">
          frame {frame + 1}/{frames} · {(((times[frame] ?? 0) - t0) / 1000).toFixed(3)} s
        </span>
        <span>{(((times[frames - 1] ?? 0) - t0) / 1000).toFixed(2)} s</span>
      </div>
    </div>
  );
}
