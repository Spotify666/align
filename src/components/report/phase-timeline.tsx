"use client";

import { useRef, useState } from "react";
import type { EventResult, PhaseOrderIssue } from "@/engine/result";

const MIN_GAP = 14; // % of track width between labels above the track

const STATE_WORD: Record<EventResult["state"], string> = {
  detected: "Seen",
  inferred: "Estimated",
  corrected: "Marked by you",
  missing: "Not found",
};
const SOURCE_WORD: Record<string, string> = { body: "the body", bat: "the bat", ball: "the ball", user_mark: "your mark", pitch_scale: "pitch markings", depth: "depth" };

/** The mark for each state: filled = seen, ring = estimated, diamond = placed by hand, dash = not found. */
function Glyph({ state }: { state: EventResult["state"] }) {
  if (state === "missing") return <span className="inline-block h-px w-2.5 bg-fg-subtle" aria-hidden />;
  if (state === "corrected") return <span className="inline-block h-2 w-2 rotate-45 bg-fg" aria-hidden />;
  return <span className={`inline-block h-2 w-2 rounded-full ${state === "detected" ? "bg-fg" : "border border-fg"}`} aria-hidden />;
}

/**
 * The shot's timeline: a scrubber with every phase of the shot drawn on it. Each marker shows
 * how it was found (seen, estimated, marked by hand) and a band for how sure its timing is;
 * phases that weren't found are listed with the reason. Arrow keys move between markers when
 * the marker row has focus, and step frames on the scrubber; every marker is a 44 px target.
 */
export function PhaseTimeline({
  events,
  issues,
  frames,
  frame,
  times,
  onSeek,
}: {
  events: EventResult[];
  issues: PhaseOrderIssue[];
  frames: number;
  frame: number;
  times: number[];
  onSeek: (frame: number) => void;
}) {
  const [picked, setPicked] = useState<EventResult["type"] | null>(null);
  const [pulse, setPulse] = useState(0);
  const row = useRef<HTMLUListElement>(null);
  const pct = (f: number) => (frames > 1 ? (Math.max(0, Math.min(frames - 1, f)) / (frames - 1)) * 100 : 0);
  const found = events.filter((e) => e.frame !== null).sort((a, b) => a.frame! - b.frame!);
  const ordered = [...found, ...events.filter((e) => e.frame === null)];
  const t0 = times[0] ?? 0;
  const secs = (f: number) => (((times[f] ?? 0) - t0) / 1000).toFixed(2);

  // Labels above the track: contact first, then the rest in order, only where they fit.
  const placed: number[] = [];
  const labelled = new Set<string>();
  for (const e of [...found].sort((a, b) => Number(b.type === "contact") - Number(a.type === "contact") || Number(b.required) - Number(a.required))) {
    const x = pct(e.frame!);
    if (placed.every((p) => Math.abs(p - x) >= MIN_GAP)) {
      placed.push(x);
      labelled.add(e.id);
    }
  }

  // The marker being explained: the one picked, while the scrubber is still on it (or it has no frame).
  const pickedEvent = events.find((e) => e.type === picked);
  const current = pickedEvent && (pickedEvent.frame === null || pickedEvent.frame === frame) ? pickedEvent : (found.find((e) => e.frame === frame) ?? null);
  const related = current ? issues.filter((i) => i.a === current.type || i.b === current.type) : [];

  const go = (e: EventResult) => {
    setPicked(e.type);
    if (e.frame !== null) {
      onSeek(e.frame);
      setPulse((k) => k + 1);
    }
  };
  const onKeys = (ev: React.KeyboardEvent<HTMLUListElement>) => {
    const step = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    if (!step && ev.key !== "Home" && ev.key !== "End") return;
    ev.preventDefault();
    const buttons = [...(row.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = ev.key === "Home" ? 0 : ev.key === "End" ? ordered.length - 1 : Math.max(0, Math.min(ordered.length - 1, at + step));
    buttons[next]?.focus();
    const target = ordered[next];
    if (target) go(target);
  };
  const active = current ? ordered.indexOf(current) : 0;

  return (
    <div className="select-none">
      <div className="relative h-5" aria-hidden>
        {found.map((e) =>
          labelled.has(e.id) ? (
            <span
              key={e.id}
              className={`absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[0.68rem] font-medium ${e.type === "contact" ? "text-fg" : "text-fg-subtle"} ${e.state === "inferred" ? "italic" : ""}`}
              style={{ left: `clamp(1.75rem, ${pct(e.frame!)}%, calc(100% - 1.75rem))` }}
            >
              {e.label}
            </span>
          ) : null,
        )}
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-[7px] top-1/2 z-10" aria-hidden>
          {found.map((e) => {
            const u = e.uncertainty?.frames ?? 0;
            const lo = pct(e.frame! - u);
            const hi = pct(e.frame! + u);
            const on = current?.id === e.id;
            return (
              <span key={e.id}>
                {/* How sure the timing is: the true moment is taken to lie inside the band. */}
                <span className={`absolute top-[11px] h-[3px] rounded-sm ${on ? "bg-fg" : "bg-fg/35"} transition-colors duration-150`} style={{ left: `${lo}%`, width: `${Math.max(0.6, hi - lo)}%` }} />
                <span
                  key={on ? `p${pulse}` : "idle"}
                  className={`absolute h-5 -translate-x-1/2 -translate-y-1/2 ${e.state === "inferred" ? "w-0 border-l border-dashed border-fg" : "w-0.5 rounded-full bg-fg"} ${on ? "tl-pulse" : labelled.has(e.id) ? "" : "opacity-60"}`}
                  style={{ left: `${pct(e.frame!)}%` }}
                />
                {e.state === "corrected" && <span className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-[13px] rotate-45 bg-fg" style={{ left: `${pct(e.frame!)}%` }} />}
              </span>
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, frames - 1)}
          value={frame}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="relative h-11 w-full accent-[var(--color-brand)]"
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

      <ul ref={row} onKeyDown={onKeys} className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Moments of the shot. Left and right arrows move between them.">
        {ordered.map((e, i) => {
          const on = current?.id === e.id;
          return (
            <li key={e.id} className="shrink-0">
              <button
                type="button"
                tabIndex={i === active ? 0 : -1}
                onClick={() => go(e)}
                aria-pressed={on}
                aria-label={
                  e.frame === null
                    ? `${e.label}: not found`
                    : `${e.label} at ${secs(e.frame)} seconds, ${STATE_WORD[e.state].toLowerCase()}${e.uncertainty?.ms ? `, within ${e.uncertainty.ms} milliseconds` : ""}`
                }
                className={`chip min-h-11 cursor-pointer transition-colors duration-150 hover:bg-tint ${on ? "border-fg bg-brand-soft text-fg" : e.frame === null ? "border-dashed text-fg-subtle" : "text-fg-muted"}`}
              >
                <Glyph state={e.state} />
                <span className={e.state === "inferred" ? "italic" : ""}>{e.label}</span>
                {e.frame !== null && <span className="num font-normal text-fg-subtle">{secs(e.frame)}s</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 min-h-[4.5rem] text-sm" aria-live="polite">
        {current ? (
          <div key={current.id} className="tl-in">
            <p className="text-fg">
              <span className="font-medium">{current.label}</span>
              {current.frame !== null && (
                <span className="num">
                  {" "}
                  at {secs(current.frame)} s{current.uncertainty?.ms ? `, give or take ${current.uncertainty.ms / 1000 >= 0.1 ? `${(current.uncertainty.ms / 1000).toFixed(1)} s` : `${(current.uncertainty.ms / 1000).toFixed(2)} s`}` : ""}
                </span>
              )}
              <span className="text-fg-muted"> · {STATE_WORD[current.state]}{current.sources.length ? ` from ${current.sources.map((s) => SOURCE_WORD[s] ?? s).join(" and ")}` : ""}</span>
            </p>
            {current.frame !== null && (
              <p className="mt-0.5 text-fg-muted">
                How: {current.method}. Confidence {Math.round(current.confidence * 100)}% (not yet calibrated).
              </p>
            )}
            {current.limitation && <p className="mt-0.5 text-fg-muted">{current.limitation}</p>}
            {related.map((i) => (
              <p key={`${i.a}-${i.b}`} className="mt-0.5 text-fg-muted">
                {i.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-fg-subtle">Pick a moment to see how it was found and how sure its timing is.</p>
        )}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-fg-subtle">
        <span className="inline-flex items-center gap-1.5"><Glyph state="detected" /> seen</span>
        <span className="inline-flex items-center gap-1.5"><Glyph state="inferred" /> estimated</span>
        <span className="inline-flex items-center gap-1.5"><Glyph state="corrected" /> marked by you</span>
        <span className="inline-flex items-center gap-1.5"><Glyph state="missing" /> not found</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded-sm bg-fg/60" aria-hidden /> bar under a marker: how sure its timing is</span>
      </p>
    </div>
  );
}
