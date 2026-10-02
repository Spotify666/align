"use client";

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { AnalysisPayload, CaptureObservation, ImgPoint } from "@/engine/types";
import { J } from "@/engine/types";
import { bodyCentre, buildScene, semanticToJoint } from "@/engine/scene";
import { angleAt } from "@/engine/math";
import { BONES } from "@/lib/viz";
import { PhaseTimeline } from "./phase-timeline";
import { Pause, Play } from "../icons";

const Scene3D = dynamic(() => import("./scene-3d"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-fg-subtle">Loading 3D…</div>,
});

export type ViewMode = "original" | "overlay" | "3d" | "compare";
export interface EvidenceViewerHandle {
  seek: (frame: number, highlight?: string) => void;
  /** PNG of the current 2D evidence frame (for the PDF), or null in 3D mode. */
  snapshot: () => string | null;
}

interface Props {
  obs: CaptureObservation;
  payload: AnalysisPayload;
  videoUrl?: string | null;
  /** Media time (s) of each analysed frame when it differs from obs.t (trimmed or slowed clips). */
  mediaTimes?: number[] | null;
  keyframes?: Record<number, string>;
  reference?: { obs: CaptureObservation; offset: number; label: string } | null;
}

const COL = { body: "#5ed6e6", bat: "#d7a62a", ball: "#e2463a", trail: "rgba(94,214,230,0.55)", low: "rgba(167,176,184,0.5)", lime: "#b7f34a", coral: "#f06b5f", text: "#f3f0e8", gold: "#d7a62a" };

export const EvidenceViewer = forwardRef<EvidenceViewerHandle, Props>(function EvidenceViewer({ obs, payload, videoUrl, mediaTimes, keyframes, reference }, ref) {
  const n = obs.body.length;
  const contact = payload.events.find((e) => e.type === "contact");
  const [frame, setFrame] = useState(() => {
    if (obs.media.kind === "photo") return Math.max(0, payload.photo_set?.findIndex((p) => p.phase === "contact") ?? 0);
    return contact ? contact.frame : Math.min(n - 1, Math.round(n * 0.5));
  });
  const [mode, setMode] = useState<ViewMode>(videoUrl || keyframes ? "overlay" : "overlay");
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [layers, setLayers] = useState({ body: true, bat: true, ball: true, centre: true });
  const [zoom, setZoom] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => buildScene(obs), [obs]);
  const aspect = obs.media.width / obs.media.height;
  const isPhoto = obs.media.kind === "photo";
  const frontal = scene.plane === "frontal";
  const [kfReady, setKfReady] = useState(0);
  const kfImages = useMemo(() => {
    const out: Record<number, HTMLImageElement> = {};
    if (typeof window === "undefined" || !keyframes) return out;
    for (const [k, src] of Object.entries(keyframes)) {
      const im = new Image();
      im.onload = () => setKfReady((r) => r + 1);
      im.src = src;
      out[Number(k)] = im;
    }
    return out;
  }, [keyframes]);

  // Zoom window around the batter (all frames), keeping the frame's aspect ratio.
  const batterView = useMemo(() => {
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const fr of obs.body)
      for (const p of fr)
        if (p && p[2] >= 0.5) {
          x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
          y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        }
    for (const p of [...obs.bat.toe, ...obs.bat.handle])
      if (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: 1, h: 1 };
    let h = Math.min(1, (y1 - y0) * 1.3);
    let w = Math.min(1, Math.max((x1 - x0) * 1.5, h));
    h = Math.min(1, Math.max(h, w)); w = h;
    const cx = (x0 + x1) / 2 + w * 0.12;
    const cy = (y0 + y1) / 2;
    return { x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h / 2)), w, h };
  }, [obs]);
  const view = zoom ? batterView : { x: 0, y: 0, w: 1, h: 1 };

  useImperativeHandle(ref, () => ({
    seek: (f, h) => {
      setPlaying(false);
      setFrame(Math.max(0, Math.min(n - 1, f)));
      setHighlight(h ?? null);
      if (mode === "3d" || mode === "compare") setMode("overlay");
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    snapshot: () => {
      try {
        return canvas.current ? canvas.current.toDataURL("image/png") : null;
      } catch {
        return null;
      }
    },
  }));

  const drawAt = useCallback((frame: number) => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => ((x - view.x) / view.w) * W;
    const Y = (y: number) => ((y - view.y) / view.h) * H;

    // Background: real frame when available, else a schematic of the pitch.
    const v = video.current;
    const kf = kfImages[frame];
    if (v && videoUrl && v.readyState >= 2) {
      ctx.drawImage(v, view.x * v.videoWidth, view.y * v.videoHeight, view.w * v.videoWidth, view.h * v.videoHeight, 0, 0, W, H);
      if (mode === "overlay") {
        ctx.fillStyle = "rgba(10,13,16,0.25)";
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0e1318");
      g.addColorStop(1, "#151b21");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (kf && kf.complete && kf.naturalWidth) {
        ctx.drawImage(kf, view.x * kf.naturalWidth, view.y * kf.naturalHeight, view.w * kf.naturalWidth, view.h * kf.naturalHeight, 0, 0, W, H);
      }
      // Ground, distance ticks, crease and stumps from the batter-centric scene.
      // Filmed along the pitch the image's x axis is lateral, so only the ground line applies.
      const [, gy] = scene.toImage({ f: 0, u: 0 });
      ctx.strokeStyle = "rgba(243,240,232,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Y(gy));
      ctx.lineTo(W, Y(gy));
      ctx.stroke();
      if (scene.unit === "m" && !frontal && !isPhoto) {
        ctx.fillStyle = "rgba(167,176,184,0.75)";
        ctx.font = "10px var(--font-plex-mono), monospace";
        for (let m = -1; m <= 9; m++) {
          const [mx] = scene.toImage({ f: m, u: 0 });
          if (mx < 0 || mx > 1) continue;
          ctx.fillRect(X(mx), Y(gy), 1, m % 2 === 0 ? 7 : 4);
          if (m % 2 === 0 && m > 0) ctx.fillText(`${m} m`, X(mx) + 3, Y(gy) + 16);
        }
        const [cx] = scene.toImage({ f: 1.22, u: 0 });
        ctx.strokeStyle = "rgba(243,240,232,0.55)";
        ctx.beginPath();
        ctx.moveTo(X(cx), Y(gy) - 2);
        ctx.lineTo(X(cx), Y(gy) + 10);
        ctx.stroke();
        const [sx, sy] = scene.toImage({ f: 0, u: 0.711 });
        ctx.fillStyle = "rgba(233,227,211,0.85)";
        ctx.fillRect(X(sx) - 2, Y(sy), 4, Y(gy) - Y(sy));
      }
    }
    if (mode === "original") return;

    const pt = (p: ImgPoint | undefined) => (p ? [X(p[0]), Y(p[1]), p[2]] as const : null);

    // Ball trajectory: past points solid, future faint.
    if (layers.ball) {
      obs.ball.points.forEach((p, i) => {
        const q = pt(p ?? undefined);
        if (!q) return;
        ctx.fillStyle = i <= frame ? COL.trail : "rgba(94,214,230,0.18)";
        ctx.beginPath();
        ctx.arc(q[0], q[1], i === frame ? 0 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
      const bounce = payload.events.find((e) => e.type === "bounce");
      const bq = bounce ? pt(obs.ball.points[bounce.frame] ?? undefined) : null;
      if (bq) {
        ctx.strokeStyle = COL.body;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bq[0] - 6, bq[1] - 6);
        ctx.lineTo(bq[0] + 6, bq[1] + 6);
        ctx.moveTo(bq[0] + 6, bq[1] - 6);
        ctx.lineTo(bq[0] - 6, bq[1] + 6);
        ctx.stroke();
      }
      const cur = pt(obs.ball.points[frame] ?? undefined);
      if (cur) {
        ctx.fillStyle = COL.ball;
        ctx.beginPath();
        ctx.arc(cur[0], cur[1], 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bat: toe trail, then the bat at this frame. Interpolated bats are dashed.
    if (layers.bat) {
      ctx.strokeStyle = "rgba(215,166,42,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = Math.max(0, frame - 40); i <= frame; i++) {
        const q = pt(obs.bat.toe[i] ?? undefined);
        if (!q) {
          started = false;
          continue;
        }
        if (!started) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
        started = true;
      }
      ctx.stroke();
      const h = pt(obs.bat.handle[frame] ?? undefined);
      const t = pt(obs.bat.toe[frame] ?? undefined);
      if (h && t) {
        ctx.setLineDash(obs.bat.source === "interpolated" || obs.bat.source === "user_marked" ? [7, 5] : []);
        ctx.strokeStyle = COL.bat;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(h[0], h[1]);
        ctx.lineTo(t[0], t[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Body: confident bones solid, low-confidence bones dotted grey.
    if (layers.body) {
      const fr = obs.body[frame] ?? [];
      for (const [a, b] of BONES) {
        const pa = pt(fr[J[a]] ?? undefined);
        const pb = pt(fr[J[b]] ?? undefined);
        if (!pa || !pb) continue;
        const low = Math.min(pa[2], pb[2]) < 0.5;
        ctx.setLineDash(low ? [2, 4] : []);
        ctx.strokeStyle = low ? COL.low : COL.body;
        ctx.lineWidth = low ? 1.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      fr.forEach((p) => {
        const q = pt(p ?? undefined);
        if (!q) return;
        ctx.fillStyle = q[2] < 0.5 ? COL.low : COL.text;
        ctx.beginPath();
        ctx.arc(q[0], q[1], 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
      const nose = pt(fr[J.nose] ?? undefined);
      if (nose) {
        ctx.strokeStyle = COL.body;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nose[0], nose[1], Math.max(8, W * 0.012), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Centre-of-mass estimate projected onto the base of support.
    if (layers.centre && frontal) {
      // Lateral balance: centre estimate between the feet as seen from along the pitch.
      const fr = obs.body[frame] ?? [];
      const P = (j: keyof typeof J) => fr[J[j]];
      const hips = [P("left_hip"), P("right_hip")];
      const shs = [P("left_shoulder"), P("right_shoulder")];
      const fa = fr[J[semanticToJoint("front_ankle", scene.front)]];
      const ba = fr[J[semanticToJoint("back_ankle", scene.front)]];
      if (hips.every(Boolean) && shs.every(Boolean) && fa && ba) {
        const cx = 0.3 * (hips[0]![0] + hips[1]![0]) + 0.2 * (shs[0]![0] + shs[1]![0]);
        const cy = 0.3 * (hips[0]![1] + hips[1]![1]) + 0.2 * (shs[0]![1] + shs[1]![1]);
        const gyy = Math.max(fa[1], ba[1]);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = COL.lime;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(X(cx), Y(cy));
        ctx.lineTo(X(cx), Y(gyy));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COL.lime;
        ctx.beginPath();
        ctx.arc(X(cx), Y(cy), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (layers.centre) {
      const c = bodyCentre(scene, frame);
      const fa = obs.body[frame]?.[J[semanticToJoint("front_ankle", scene.front)]];
      const ba = obs.body[frame]?.[J[semanticToJoint("back_ankle", scene.front)]];
      if (c && fa && ba) {
        const [cx, cy] = scene.toImage(c);
        const [, gy] = scene.toImage({ f: c.f, u: 0 });
        const inside = (cx - fa[0]) * (cx - ba[0]) <= 0;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = inside ? COL.lime : COL.coral;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(X(cx), Y(cy));
        ctx.lineTo(X(cx), Y(gy));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(X(fa[0]), Y(gy));
        ctx.lineTo(X(ba[0]), Y(gy));
        ctx.stroke();
        ctx.fillStyle = inside ? COL.lime : COL.coral;
        ctx.beginPath();
        ctx.arc(X(cx), Y(cy), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Metric pin for the measure the athlete is inspecting.
    if (highlight) drawPin(ctx, highlight, frame, obs, scene, X, Y);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kfReady redraws once photos/keyframes decode
  }, [mode, layers, highlight, obs, payload.events, scene, videoUrl, kfImages, kfReady, frontal, isPhoto, view.x, view.y, view.w, view.h]);
  const draw = useCallback(() => drawAt(frame), [drawAt, frame]);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // Media time of every analysed frame: the video and the tracks share this one clock.
  const times = useMemo(() => (mediaTimes && mediaTimes.length === n ? mediaTimes : obs.t.map((t) => t / 1000)), [mediaTimes, obs.t, n]);
  const playsVideo = !!videoUrl && !isPhoto;

  // Paused: seek the video to the frame, then draw on "seeked".
  useEffect(() => {
    const v = video.current;
    if (playing && playsVideo) return; // playback draws each displayed frame itself
    if (v && playsVideo) {
      const target = times[frame] ?? 0;
      if (Math.abs(v.currentTime - target) > 0.002) {
        v.currentTime = target;
        return;
      }
    }
    draw();
  }, [frame, draw, playsVideo, times, playing]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // Playback in real time (or 4× slow motion). With the video, the video itself plays and
  // each displayed frame is drawn with the tracks of that same frame, so they can't drift.
  useEffect(() => {
    if (!playing || isPhoto) return;
    const v = video.current;
    if (v && playsVideo && times.length) {
      let stopped = false;
      let raf = 0;
      const nearest = (mt: number) => {
        let lo = 0;
        let hi = times.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (times[mid]! < mt) lo = mid + 1;
          else hi = mid;
        }
        return lo > 0 && Math.abs(times[lo - 1]! - mt) <= Math.abs(times[lo]! - mt) ? lo - 1 : lo;
      };
      const last = times[times.length - 1]!;
      const onTime = (mt: number) => {
        if (stopped) return;
        const f = nearest(mt + 0.01);
        drawAt(f);
        setFrame(f);
        if (mt >= last - 0.001 || f >= n - 1) {
          stopped = true;
          v.pause();
          setPlaying(false);
        }
      };
      type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      const rvfc = (v as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(v);
      const loop = rvfc
        ? (_: number, meta: { mediaTime: number }) => {
            onTime(meta.mediaTime);
            if (!stopped) rvfc(loop);
          }
        : () => {
            onTime(v.currentTime);
            if (!stopped) raf = requestAnimationFrame(loop as () => void);
          };
      const start = frameRef.current >= n - 1 ? 0 : frameRef.current;
      v.currentTime = times[start] ?? 0;
      v.playbackRate = slow ? 0.25 : 1;
      if (rvfc) rvfc(loop);
      else raf = requestAnimationFrame(loop as () => void);
      v.play().catch(() => setPlaying(false));
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
        v.pause();
        v.playbackRate = 1;
      };
    }
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const fps = obs.media.fps ?? 30;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * fps * (slow ? 0.25 : 1);
      last = now;
      if (acc >= 1) {
        const step = Math.floor(acc);
        acc -= step;
        setFrame((f) => {
          if (f + step >= n - 1) {
            setPlaying(false);
            return n - 1;
          }
          return f + step;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, slow, n, obs.media.fps, isPhoto, playsVideo, times, drawAt]);

  const modes: Array<{ id: ViewMode; label: string; disabled?: boolean }> = [
    { id: "original", label: isPhoto ? "Photo" : videoUrl || keyframes ? "Video" : "Pitch" },
    { id: "overlay", label: "Tracked" },
    { id: "3d", label: "3D" },
    { id: "compare", label: "Compare", disabled: !reference },
  ];

  return (
    <section ref={wrap} aria-label="Evidence viewer" className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <div role="tablist" aria-label="View" className="grid w-full grid-cols-4 rounded-xl border border-line bg-sunken p-0.5 sm:w-auto">
          {modes.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              disabled={m.disabled}
              onClick={() => setMode(m.id)}
              className={`min-h-9 whitespace-nowrap rounded-[10px] px-3 text-sm transition-colors ${mode === m.id ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"} disabled:opacity-40`}
              title={m.disabled ? "Needs a reference shot" : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(mode === "overlay" || mode === "original") && (
          <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="Layers">
            {(Object.keys(layers) as Array<keyof typeof layers>).map((k) => (
              <label key={k} className="chip cursor-pointer border-line text-fg-muted has-[:checked]:text-fg">
                <input type="checkbox" className="accent-[var(--color-brand)]" checked={layers[k]} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
                {k === "centre" ? "centre / base" : k}
              </label>
            ))}
          </div>
        )}
        {(mode === "overlay" || mode === "original") && (
          <button onClick={() => setZoom((z) => !z)} className="chip border-line text-fg-muted min-h-9" aria-pressed={zoom}>
            {zoom ? "Zoomed to batter" : "Zoom to batter"}
          </button>
        )}
        {payload.demo && <span className="demo-badge ml-auto">DEMO DATA · no video</span>}
      </div>

      <div className="stage relative w-full" style={{ aspectRatio: `${aspect}` }}>
        {videoUrl && (
          <video
            ref={video}
            src={videoUrl}
            muted
            playsInline
            preload="auto"
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
            onSeeked={() => !playing && draw()}
            onLoadedData={draw}
          />
        )}
        {mode === "3d" || mode === "compare" ? (
          <Scene3D
            obs={obs}
            frame={frame}
            reference={mode === "compare" && reference ? { obs: reference.obs, offset: reference.offset } : null}
            className="absolute inset-0"
          />
        ) : (
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={isPhoto ? `Photo ${frame + 1} of ${n} with the tracked body` : `Frame ${frame + 1}: tracked body, bat and ball overlay`} />
        )}
        {highlight && mode === "overlay" && (
          <button onClick={() => setHighlight(null)} className="absolute right-2 top-2 chip !bg-black/70 !border-white/20 !text-white">
            {highlight.replaceAll("_", " ")} · clear
          </button>
        )}
      </div>

      {isPhoto && n > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <button onClick={() => setFrame((f) => Math.max(0, f - 1))} disabled={frame === 0} className="btn btn-ghost !min-h-10 !px-3" aria-label="Previous photo">‹ Prev</button>
          <span className="text-sm text-fg-muted">
            Photo <span className="num text-fg">{frame + 1}</span> of <span className="num">{n}</span>
            {payload.photo_set?.[frame]?.phase ? ` · ${payload.photo_set[frame]!.phase}` : ""}
          </span>
          <button onClick={() => setFrame((f) => Math.min(n - 1, f + 1))} disabled={frame >= n - 1} className="btn btn-ghost !min-h-10 !px-3" aria-label="Next photo">Next ›</button>
        </div>
      )}
      {!isPhoto && (
        <div className="px-3 pb-3 pt-2">
          <div className="mb-1 flex items-center gap-2">
            <button onClick={() => setPlaying((p) => !p)} className="btn btn-ghost !min-h-10 !px-3" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={() => setSlow((s) => !s)} className="chip border-line text-fg-muted min-h-9" aria-pressed={slow}>
              {slow ? "¼ speed" : "1× speed"}
            </button>
            <button onClick={() => setFrame((f) => Math.max(0, f - 1))} className="chip border-line text-fg-muted min-h-9" aria-label="Previous frame">−1 f</button>
            <button onClick={() => setFrame((f) => Math.min(n - 1, f + 1))} className="chip border-line text-fg-muted min-h-9" aria-label="Next frame">+1 f</button>
          </div>
          <PhaseTimeline events={payload.events} frames={n} frame={frame} times={obs.t} onSeek={(f) => { setPlaying(false); setFrame(f); }} />
        </div>
      )}
    </section>
  );
});

function drawPin(
  ctx: CanvasRenderingContext2D,
  metric: string,
  frame: number,
  obs: CaptureObservation,
  scene: ReturnType<typeof buildScene>,
  X: (x: number) => number,
  Y: (y: number) => number,
) {
  const g = (s: Parameters<typeof scene.get>[1]) => {
    const p = obs.body[frame]?.[J[semanticToJoint(s, scene.front)]];
    return p ? ([X(p[0]), Y(p[1])] as const) : null;
  };
  ctx.font = "600 12px var(--font-plex-mono), monospace";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COL.gold;
  ctx.fillStyle = COL.gold;
  const label = (x: number, y: number, text: string) => {
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = "rgba(10,13,16,0.85)";
    ctx.fillRect(x, y - 14, w, 18);
    ctx.fillStyle = COL.gold;
    ctx.fillText(text, x + 5, y);
  };
  if (metric === "head_knee_offset") {
    const h = g("head");
    const k = g("front_knee");
    if (h && k) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(h[0], h[1]);
      ctx.lineTo(h[0], k[1] + 20);
      ctx.moveTo(k[0], k[1] - 20);
      ctx.lineTo(k[0], k[1] + 20);
      ctx.stroke();
      ctx.setLineDash([]);
      label(Math.max(h[0], k[0]) + 8, k[1] + 4, "head vs front knee");
    }
  } else if (metric === "front_knee_flexion") {
    const h = g("front_hip");
    const k = g("front_knee");
    const a = g("front_ankle");
    if (h && k && a) {
      const ang = angleAt([h[0], -h[1]], [k[0], -k[1]], [a[0], -a[1]]);
      ctx.beginPath();
      ctx.arc(k[0], k[1], 18, 0, Math.PI * 2);
      ctx.stroke();
      label(k[0] + 22, k[1], `${Math.round(ang)}° (2D)`);
    }
  } else if (metric === "bat_angle_contact" || metric === "bat_speed_contact") {
    const h = obs.bat.handle[frame];
    if (h) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(h[0]), Y(h[1]));
      ctx.lineTo(X(h[0]), Y(h[1]) + 90);
      ctx.stroke();
      ctx.setLineDash([]);
      label(X(h[0]) + 8, Y(h[1]) - 6, metric === "bat_angle_contact" ? "bat vs vertical" : "bat speed here");
    }
  } else {
    const hip = g("front_hip");
    if (hip) label(hip[0] + 10, hip[1], metric.replaceAll("_", " "));
  }
}
