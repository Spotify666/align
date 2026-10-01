"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seek } from "@/lib/capture/pose";
import type { Marks, TrackingResult } from "@/lib/capture/build-observation";
import { BONES } from "@/lib/viz";
import { J } from "@/engine/types";
import { MarkHint } from "../guide/mark-illustrations";

type Step = "side" | "stumps" | "bounce" | "contact" | "after" | "bat" | "done";
const ORDER: Step[] = ["side", "stumps", "bounce", "contact", "after", "bat", "done"];

const COPY: Record<Exclude<Step, "done">, { title: string; body: string; skip: string }> = {
  side: { title: "Which side is the bowler?", body: "This sets “forward” for the analysis, so left-handers and either camera side work.", skip: "" },
  stumps: { title: "Mark the stumps", body: "Tap the base of the batter's stumps, then the top. This gives the pitch scale.", skip: "Stumps not visible" },
  bounce: { title: "Find the bounce", body: "Scrub to the frame where the ball hits the pitch, then tap the ball.", skip: "Bounce not visible" },
  contact: { title: "Find contact", body: "Scrub to where bat meets ball, then tap the ball.", skip: "Can't see contact" },
  after: { title: "Ball just after contact", body: "We jumped a few frames ahead. Tap the ball — this measures how dead the bat was.", skip: "Ball not visible" },
  bat: { title: "Mark the bat", body: "On each suggested frame, tap the top hand on the handle, then the toe of the bat.", skip: "Bat not visible" },
};

export function MarkEvidence({
  video,
  tracking,
  marks,
  onChange,
  onDone,
}: {
  video: HTMLVideoElement;
  tracking: TrackingResult;
  marks: Marks;
  onChange: (m: Marks) => void;
  onDone: (final: Marks) => void;
}) {
  const n = tracking.t.length;
  const [step, setStep] = useState<Step>("side");
  const [frame, setFrame] = useState(Math.round(n / 2));
  const [pending, setPending] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const aspect = tracking.width / tracking.height;

  // Suggested bat frames: start, highest hands (top of backlift), contact, end.
  const batFrames = useMemo(() => {
    let top = 0;
    let best = Infinity;
    tracking.body.forEach((fr, i) => {
      const w = fr[J.left_wrist] ?? fr[J.right_wrist];
      if (w && w[2] > 0.5 && w[1] < best) {
        best = w[1];
        top = i;
      }
    });
    const c = marks.contact?.frame ?? Math.min(n - 1, top + Math.round(tracking.fps * 0.25));
    return [...new Set([0, top, c, n - 1])].sort((a, b) => a - b);
  }, [tracking, marks.contact, n]);
  const batIndex = marks.bat.length;

  const view = useMemo(() => {
    if (!zoom) return { x: 0, y: 0, w: 1, h: 1 };
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const fr of tracking.body) for (const p of fr) if (p && p[2] > 0.5) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    if (x1 <= x0) return { x: 0, y: 0, w: 1, h: 1 };
    const s = Math.min(1, Math.max((y1 - y0) * 1.6, (x1 - x0) * 1.6));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return { x: Math.max(0, Math.min(1 - s, cx - s / 2)), y: Math.max(0, Math.min(1 - s, cy - s / 2)), w: s, h: s };
  }, [zoom, tracking.body]);

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = c.clientWidth;
    const H = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => ((x - view.x) / view.w) * W;
    const Y = (y: number) => ((y - view.y) / view.h) * H;
    if (video.readyState >= 2) ctx.drawImage(video, view.x * video.videoWidth, view.y * video.videoHeight, view.w * video.videoWidth, view.h * video.videoHeight, 0, 0, W, H);
    const fr = tracking.body[frame] ?? [];
    ctx.strokeStyle = "rgba(94,214,230,0.8)";
    ctx.lineWidth = 2;
    for (const [a, b] of BONES) {
      const pa = fr[J[a]];
      const pb = fr[J[b]];
      if (!pa || !pb || pa[2] < 0.5 || pb[2] < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(X(pa[0]), Y(pa[1]));
      ctx.lineTo(X(pb[0]), Y(pb[1]));
      ctx.stroke();
    }
    const dot = (p: [number, number], color: string, label?: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(p[0]), Y(p[1]), 6, 0, Math.PI * 2);
      ctx.fill();
      if (label) {
        ctx.font = "600 12px system-ui";
        ctx.fillText(label, X(p[0]) + 9, Y(p[1]) - 8);
      }
    };
    if (marks.stumpsBase) dot(marks.stumpsBase, "#e9e3d3", "base");
    if (marks.stumpsTop) dot(marks.stumpsTop, "#e9e3d3", "top");
    for (const k of ["bounce", "contact", "after"] as const) {
      const mk = k === "after" ? marks.ballAfter : marks[k];
      if (mk && mk.frame === frame) dot(mk.at, "#e2463a", k);
    }
    for (const b of marks.bat)
      if (b.frame === frame) {
        ctx.strokeStyle = "#d7a62a";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(X(b.handle[0]), Y(b.handle[1]));
        ctx.lineTo(X(b.toe[0]), Y(b.toe[1]));
        ctx.stroke();
      }
    if (pending) dot(pending, "#d7a62a", "hands");
  }, [video, view, tracking.body, frame, marks, pending]);

  useEffect(() => {
    let alive = true;
    seek(video, (tracking.t[frame] ?? 0) / 1000 + 0.0005).then(() => alive && draw());
    return () => {
      alive = false;
    };
  }, [frame, video, tracking.t, draw]);

  // Move to a step and jump to a sensible frame for it.
  const goTo = (target: Step, m: Marks = marks) => {
    if (target === "after" && m.contact) setFrame(Math.min(n - 1, m.contact.frame + Math.max(2, Math.round(tracking.fps * 0.05))));
    if (target === "bat") setFrame(batFrames[Math.min(m.bat.length, batFrames.length - 1)] ?? 0);
    setStep(target);
    if (target === "done") onDone(m);
  };
  const next = (m: Marks = marks) => goTo(ORDER[ORDER.indexOf(step) + 1] ?? "done", m);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p: [number, number] = [view.x + ((e.clientX - r.left) / r.width) * view.w, view.y + ((e.clientY - r.top) / r.height) * view.h];
    if (step === "stumps") {
      if (!marks.stumpsBase) onChange({ ...marks, stumpsBase: p });
      else {
        const m = { ...marks, stumpsTop: p };
        onChange(m);
        next(m);
      }
    } else if (step === "bounce") onChange({ ...marks, bounce: { frame, at: p } });
    else if (step === "contact") onChange({ ...marks, contact: { frame, at: p } });
    else if (step === "after") onChange({ ...marks, ballAfter: { frame, at: p } });
    else if (step === "bat") {
      if (!pending) setPending(p);
      else {
        const bat = [...marks.bat.filter((b) => b.frame !== frame), { frame, handle: pending, toe: p }];
        const m = { ...marks, bat };
        onChange(m);
        setPending(null);
        const nextFrame = batFrames[bat.length];
        if (nextFrame === undefined) next(m);
        else setFrame(nextFrame);
      }
    }
  };

  if (step === "done") return null;
  const copy = COPY[step];
  const tappable = step !== "side";
  const ready =
    (step === "bounce" && marks.bounce) || (step === "contact" && marks.contact) || (step === "after" && marks.ballAfter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="num text-xs text-fg-subtle">
          Step {ORDER.indexOf(step) + 1} of 6 · everything you mark is labelled “marked by you” in the report
        </p>
        <button className="chip border-line text-fg-muted min-h-9" onClick={() => setZoom((z) => !z)} aria-pressed={zoom}>
          {zoom ? "Batter view" : "Full frame"}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem] sm:items-center">
        <div>
          <h2 className="display text-3xl">{copy.title}{step === "bat" && ` · ${Math.min(batIndex + 1, batFrames.length)} of ${batFrames.length}`}</h2>
          <p className="mt-2 text-fg-muted">{step === "bat" && pending ? "Now tap the toe of the bat." : copy.body}</p>
        </div>
        <div className="max-w-[11rem]" aria-hidden>{MarkHint[step]()}</div>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-line bg-sunken" style={{ aspectRatio: zoom ? "1" : `${aspect}` }}>
        <canvas
          ref={canvas}
          onPointerUp={tappable ? onTap : undefined}
          className={`absolute inset-0 h-full w-full ${tappable ? "cursor-crosshair touch-none" : ""}`}
          aria-label={`Frame ${frame + 1}. ${tappable ? "Tap to mark." : ""}`}
        />
      </div>

      {step !== "side" && step !== "stumps" && (
        <div className="flex items-center gap-2">
          <button className="chip border-line min-h-11 px-3" onClick={() => setFrame((f) => Math.max(0, f - 1))} aria-label="Previous frame">−1</button>
          <input type="range" min={0} max={n - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} className="flex-1 h-11 accent-[var(--color-brand)]" aria-label="Choose frame" />
          <button className="chip border-line min-h-11 px-3" onClick={() => setFrame((f) => Math.min(n - 1, f + 1))} aria-label="Next frame">+1</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {step === "side" ? (
          <>
            <button className="btn btn-ghost flex-1" onClick={() => { const m = { ...marks, bowlerSide: "left" as const }; onChange(m); next(m); }}>← Bowler on the left</button>
            <button className="btn btn-ghost flex-1" onClick={() => { const m = { ...marks, bowlerSide: "right" as const }; onChange(m); next(m); }}>Bowler on the right →</button>
          </>
        ) : (
          <>
            {ready && <button className="btn btn-primary" onClick={() => next()}>Confirm and continue</button>}
            {step === "stumps" && marks.stumpsBase && !marks.stumpsTop && <span className="text-sm text-brand self-center">Base marked — now tap the top.</span>}
            {copy.skip && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const m = step === "stumps" ? { ...marks, stumpsBase: null, stumpsTop: null } : marks;
                  if (step === "stumps") onChange(m);
                  if (step === "bat") setPending(null);
                  next(m);
                }}
              >
                {step === "bat" && marks.bat.length ? "Finish bat marking" : copy.skip}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
