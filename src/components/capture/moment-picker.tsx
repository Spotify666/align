"use client";

import { useEffect, useRef } from "react";
import type { ShotWindow } from "@/lib/capture/scan";

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * Pick which shot to analyse when a clip holds several (practice sessions, highlights),
 * preview it on a loop, and nudge the window if needed.
 */
export function MomentPicker({
  url,
  windows,
  selected,
  onSelect,
  current,
  onAdjust,
  duration,
  windowMedia,
  scannedTo,
  cuts,
}: {
  url: string;
  windows: ShotWindow[];
  selected: number;
  onSelect: (i: number) => void;
  current: { start: number; end: number };
  onAdjust: (start: number) => void;
  duration: number;
  windowMedia: number;
  scannedTo: number;
  cuts: number;
}) {
  const v = useRef<HTMLVideoElement>(null);

  // Loop the chosen window at half speed.
  useEffect(() => {
    const el = v.current;
    if (!el) return;
    const loop = () => {
      if (el.currentTime >= current.end || el.currentTime < current.start - 0.05) el.currentTime = current.start;
    };
    el.currentTime = current.start;
    el.playbackRate = 0.5;
    el.play().catch(() => undefined);
    el.addEventListener("timeupdate", loop);
    return () => el.removeEventListener("timeupdate", loop);
  }, [current.start, current.end]);

  const many = windows.length > 1;
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Moment</p>
        <h1 className="display mt-2 text-[2.2rem] sm:text-5xl">{many ? `We found ${windows.length} shots` : "Is this the shot?"}</h1>
        <p className="mt-2 text-fg-muted">
          {many ? "Pick the one to analyse. You can analyse the others afterwards." : "We picked the part of the clip with the stroke. Check it plays the whole shot."}
        </p>
      </div>

      {many && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Shots found in the clip">
          {windows.map((w, i) => (
            <li key={w.start}>
              <button
                onClick={() => onSelect(i)}
                aria-pressed={i === selected}
                className={`group relative block w-full overflow-hidden rounded-xl border-2 text-left transition-colors ${i === selected ? "border-brand" : "border-transparent hover:border-line-strong"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.thumb} alt="" className="aspect-[3/4] w-full bg-stage object-cover sm:aspect-video" />
                <span className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-4 text-[0.7rem] font-medium text-white">
                  <span>Shot {i + 1}</span>
                  <span className="num">{clock(w.peak)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="stage relative overflow-hidden rounded-2xl">
        <video ref={v} src={url} muted playsInline preload="auto" className="mx-auto max-h-[55vh] w-full object-contain" aria-label="Preview of the chosen shot, looping at half speed" />
        <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[0.7rem] font-medium text-white num">
          {clock(current.start)} – {clock(current.end)} · ½ speed
        </span>
      </div>

      {duration > windowMedia + 0.2 && (
        <label className="block">
          <span className="flex items-center justify-between text-sm">
            <span className="font-medium">Fine-tune the window</span>
            <span className="text-xs text-fg-subtle">start just before the ball is bowled</span>
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, duration - (current.end - current.start))}
            step={0.02}
            value={current.start}
            onChange={(e) => onAdjust(Number(e.target.value))}
            className="mt-1 h-11 w-full accent-[var(--color-brand)]"
            aria-label="Window start"
          />
        </label>
      )}

      {windows.length > 0 && windows.every((w) => w.verified === false) && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          We couldn&apos;t find a batter from head to feet anywhere in this clip. You can still try — the quality check will say exactly what&apos;s missing.
        </p>
      )}

      {(scannedTo < duration - 0.5 || cuts > 0) && (
        <ul className="space-y-1 text-xs text-fg-subtle">
          {scannedTo < duration - 0.5 && <li>Long clip: shots were searched in the first {Math.round(scannedTo / 60)} minutes. Use the slider for later moments.</li>}
          {cuts > 0 && <li>Camera cuts found ({cuts}). Each window stays inside one camera shot; replays and close-ups are skipped.</li>}
        </ul>
      )}
    </div>
  );
}
