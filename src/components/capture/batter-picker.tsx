"use client";

import { useEffect, useState } from "react";
import type { BatterCandidate } from "@/lib/capture/scan";

/** Crops of each candidate from the reference frame, so small people are easy to tap. */
function useCrops(image: string, candidates: BatterCandidate[]) {
  const [crops, setCrops] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const out = candidates.map((c) => {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const pad = 0.15;
        const x = Math.max(0, (c.box.x - c.box.w * pad) * W);
        const y = Math.max(0, (c.box.y - c.box.h * pad) * H);
        const w = Math.min(W - x, c.box.w * (1 + 2 * pad) * W);
        const h = Math.min(H - y, c.box.h * (1 + 2 * pad) * H);
        const cv = document.createElement("canvas");
        const s = 160 / Math.max(1, h);
        cv.width = Math.max(1, Math.round(w * s));
        cv.height = 160;
        cv.getContext("2d")!.drawImage(img, x, y, w, h, 0, 0, cv.width, cv.height);
        return cv.toDataURL("image/jpeg", 0.8);
      });
      setCrops(out);
    };
    img.src = image;
    return () => {
      alive = false;
    };
  }, [image, candidates]);
  return crops;
}

/** Tap the batter when more than one person is in view (bowler, keeper, umpire, fielders). */
export function BatterPicker({
  image,
  aspect,
  candidates,
  selected,
  onSelect,
}: {
  image: string;
  aspect: number;
  candidates: BatterCandidate[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const crops = useCrops(image, candidates);
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Moment</p>
        <h1 className="display mt-2 text-[2.2rem] sm:text-5xl">Which one is the batter?</h1>
        <p className="mt-2 text-fg-muted">We see {candidates.length} people. Tap the batter — only they are tracked.</p>
      </div>
      <div className="stage relative mx-auto overflow-hidden rounded-2xl" style={{ aspectRatio: `${aspect}`, maxHeight: "62vh", maxWidth: `calc(62vh * ${aspect})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="Frame at the stroke" className="absolute inset-0 h-full w-full object-contain" />
        {candidates.map((c, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            aria-pressed={i === selected}
            aria-label={`Person ${i + 1}${i === 0 ? " (suggested)" : ""}`}
            className={`absolute rounded-lg border-2 transition-colors ${i === selected ? "border-brand bg-brand/15" : "border-white/70 bg-white/5 hover:bg-white/15"}`}
            style={{ left: `${c.box.x * 100}%`, top: `${c.box.y * 100}%`, width: `${c.box.w * 100}%`, height: `${c.box.h * 100}%`, minWidth: 28, minHeight: 28 }}
          >
            <span className={`absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[0.68rem] font-semibold ${i === selected ? "bg-brand text-brand-fg" : "bg-black/70 text-white"}`}>
              {i === selected ? "Batter" : i === 0 ? "Suggested" : `Person ${i + 1}`}
            </span>
          </button>
        ))}
      </div>
      {crops.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="People in view">
          {candidates.map((c, i) => (
            <li key={i} className="shrink-0">
              <button
                onClick={() => onSelect(i)}
                aria-pressed={i === selected}
                className={`block overflow-hidden rounded-xl border-2 text-left ${i === selected ? "border-brand" : "border-line"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {crops[i] && <img src={crops[i]} alt="" className="h-28 w-auto bg-stage" />}
                <span className={`block px-2 py-1 text-xs font-medium ${i === selected ? "bg-brand text-brand-fg" : "bg-surface text-fg-muted"}`}>
                  {i === selected ? "Batter" : `Person ${i + 1}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
