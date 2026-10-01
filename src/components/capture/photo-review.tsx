"use client";

import { useEffect, useRef } from "react";
import type { PhotoPhase } from "@/engine/types";
import type { PhotoItem } from "@/lib/capture/photos";
import { BONES } from "@/lib/viz";
import { J } from "@/engine/types";
import { Check, Cross } from "../icons";

const PHASES: Array<{ id: PhotoPhase | ""; label: string }> = [
  { id: "", label: "Not sure" },
  { id: "stance", label: "Stance" },
  { id: "stride", label: "Stride" },
  { id: "contact", label: "Contact" },
  { id: "finish", label: "Finish" },
];

function Thumb({ item }: { item: PhotoItem }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = c.current;
    if (!el) return;
    const W = 360;
    const H = Math.round((W * item.canvas.height) / item.canvas.width);
    el.width = W;
    el.height = H;
    const ctx = el.getContext("2d")!;
    ctx.drawImage(item.canvas, 0, 0, W, H);
    const fr = item.frame?.body;
    if (!fr) return;
    ctx.strokeStyle = "#5ed6e6";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const [a, b] of BONES) {
      const p = fr[J[a]];
      const q = fr[J[b]];
      if (!p || !q || p[2] < 0.4 || q[2] < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(p[0] * W, p[1] * H);
      ctx.lineTo(q[0] * W, q[1] * H);
      ctx.stroke();
    }
  }, [item]);
  return <canvas ref={c} className="block w-full bg-stage" aria-label={`${item.name}${item.frame ? ", batter detected" : ", no batter found"}`} />;
}

export function PhotoReview({
  items,
  failed,
  onPhase,
  onRemove,
}: {
  items: PhotoItem[];
  failed: Array<{ name: string; reason: string }>;
  onPhase: (id: string, phase: PhotoPhase | null) => void;
  onRemove: (id: string) => void;
}) {
  const found = items.filter((i) => i.frame).length;
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Photos</p>
        <h1 className="display mt-2 text-[2.2rem] sm:text-5xl">{items.length === 1 ? "Your photo" : `${items.length} photos`}</h1>
        <p className="mt-2 text-fg-muted">
          Photos give a posture screen: knee bend, head position and trunk lean. Tag what each photo shows — the one tagged <strong className="text-fg">Contact</strong> leads the report.
          {found < items.length && ` ${items.length - found} without a clear batter will be skipped.`}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it, k) => (
          <li key={it.id} className="card overflow-hidden">
            <div className="relative">
              <Thumb item={it} />
              <span className={`absolute left-2 top-2 chip !border-transparent ${it.frame ? "!bg-ok !text-white" : "!bg-bad !text-white"}`}>
                {it.frame ? <Check size={12} /> : <Cross size={12} />} {it.frame ? "Batter found" : "No batter"}
              </span>
              <button onClick={() => onRemove(it.id)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white" aria-label={`Remove photo ${k + 1}`}>
                <Cross size={14} />
              </button>
            </div>
            <label className="block p-2.5">
              <span className="sr-only">What photo {k + 1} shows</span>
              <select className="field !min-h-10 !py-1.5 text-sm" value={it.phase ?? ""} onChange={(e) => onPhase(it.id, (e.target.value || null) as PhotoPhase | null)}>
                {PHASES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <div className="card border-warn/40 p-4">
          <p className="font-medium">{failed.length === 1 ? "1 file couldn't be used" : `${failed.length} files couldn't be used`}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-muted">
            {failed.map((f) => (
              <li key={f.name}><span className="font-medium text-fg">{f.name}</span> — {f.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
