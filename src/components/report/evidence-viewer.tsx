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
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-subtle">Loading 3D…</div>,
});

export type ViewMode = "original" | "overlay" | "3d" | "compare";
export interface EvidenceViewerHandle {
  seek: (frame: number, highlight?: string) => void;
}

interface Props {
  obs: CaptureObservation;
  payload: AnalysisPayload;
  videoUrl?: string | null;
  keyframes?: Record<number, string>;
  reference?: { obs: CaptureObservation; offset: number; label: string } | null;
}

const COL = { body: "#5ed6e6", bat: "#d7a62a", ball: "#e2463a", trail: "rgba(94,214,230,0.55)", low: "rgba(167,176,184,0.5)", lime: "#b7f34a", coral: "#f06b5f", text: "#f3f0e8", gold: "#d7a62a" };

export const EvidenceViewer = forwardRef<EvidenceViewerHandle, Props>(function EvidenceViewer({ obs, payload, videoUrl, keyframes, reference }, ref) {
  const n = obs.body.length;
  const contact = payload.events.find((e) => e.type === "contact");
  const [frame, setFrame] = useState(() => (contact ? contact.frame : Math.min(n - 1, Math.round(n * 0.5))));
  const [mode, setMode] = useState<ViewMode>(videoUrl || keyframes ? "overlay" : "overlay");
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [layers, setLayers] = useState({ body: true, bat: true, ball: true, centre: true });
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => buildScene(obs), [obs]);
  const aspect = obs.media.width / obs.media.height;
  const isPhoto = obs.media.kind === "photo";

  useImperativeHandle(ref, () => ({
    seek: (f, h) => {
      setPlaying(false);
      setFrame(Math.max(0, Math.min(n - 1, f)));
      setHighlight(h ?? null);
      if (mode === "3d" || mode === "compare") setMode("overlay");
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  }));

  const draw = useCallback(() => {
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
    const X = (x: number) => x * W;
    const Y = (y: number) => y * H;

    // Background: real frame when available, else a schematic of the pitch.
    const v = video.current;
    const kf = keyframes?.[frame];
    if (v && videoUrl && v.readyState >= 2) {
      ctx.drawImage(v, 0, 0, W, H);
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
      if (kf) {
        const img = new Image();
        img.src = kf;
        if (img.complete) ctx.drawImage(img, 0, 0, W, H);
      }
      // Ground, distance ticks, crease and stumps from the batter-centric scene.
      const [, gy] = scene.toImage({ f: 0, u: 0 });
      ctx.strokeStyle = "rgba(243,240,232,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Y(gy));
      ctx.lineTo(W, Y(gy));
      ctx.stroke();
      if (scene.unit === "m") {
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
    if (layers.centre) {
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
    if (highlight) drawPin(ctx, highlight, frame, obs, scene, W, H);
  }, [frame, mode, layers, highlight, obs, payload.events, scene, videoUrl, keyframes]);

  // Video sync: seek, then draw on "seeked".
  useEffect(() => {
    const v = video.current;
    if (v && videoUrl && !playing) {
      const target = (obs.t[frame] ?? 0) / 1000;
      if (Math.abs(v.currentTime - target) > 0.002) {
        v.currentTime = target;
        return;
      }
    }
    draw();
  }, [frame, draw, videoUrl, obs.t, playing]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // Playback in real time (or 4× slow motion).
  useEffect(() => {
    if (!playing || isPhoto) return;
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
  }, [playing, slow, n, obs.media.fps, isPhoto]);

  const modes: Array<{ id: ViewMode; label: string; disabled?: boolean }> = [
    { id: "original", label: videoUrl || keyframes ? "Original" : "Pitch only" },
    { id: "overlay", label: videoUrl || keyframes ? "Tracked" : "Reconstruction" },
    { id: "3d", label: "3D" },
    { id: "compare", label: "Compare", disabled: !reference },
  ];

  return (
    <section ref={wrap} aria-label="Evidence viewer" className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div role="tablist" aria-label="View" className="flex rounded-lg border border-line p-0.5">
          {modes.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              disabled={m.disabled}
              onClick={() => setMode(m.id)}
              className={`min-h-9 rounded-md px-3 text-sm ${mode === m.id ? "bg-raised text-text" : "text-muted"} disabled:opacity-40`}
              title={m.disabled ? "Needs a reference delivery" : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(mode === "overlay" || mode === "original") && (
          <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="Layers">
            {(Object.keys(layers) as Array<keyof typeof layers>).map((k) => (
              <label key={k} className="chip cursor-pointer border-line text-muted has-[:checked]:text-text">
                <input type="checkbox" className="accent-[var(--color-gold)]" checked={layers[k]} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
                {k === "centre" ? "centre / base" : k}
              </label>
            ))}
          </div>
        )}
        {payload.demo && <span className="demo-badge ml-auto">DEMO DATA · no video</span>}
      </div>

      <div className="relative w-full bg-graphite" style={{ aspectRatio: `${aspect}` }}>
        {videoUrl && (
          <video ref={video} src={videoUrl} muted playsInline preload="auto" className="hidden" onSeeked={draw} onLoadedData={draw} />
        )}
        {mode === "3d" || mode === "compare" ? (
          <Scene3D
            obs={obs}
            frame={frame}
            reference={mode === "compare" && reference ? { obs: reference.obs, offset: reference.offset } : null}
            className="absolute inset-0"
          />
        ) : (
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={`Frame ${frame + 1}: tracked body, bat and ball overlay`} />
        )}
        {highlight && mode === "overlay" && (
          <button onClick={() => setHighlight(null)} className="absolute right-2 top-2 chip border-gold/60 bg-carbon/80 text-gold">
            {highlight.replaceAll("_", " ")} · clear
          </button>
        )}
      </div>

      {!isPhoto && (
        <div className="px-3 pb-3 pt-2">
          <div className="mb-1 flex items-center gap-2">
            <button onClick={() => setPlaying((p) => !p)} className="btn btn-ghost !min-h-10 !px-3" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={() => setSlow((s) => !s)} className="chip border-line text-muted min-h-9" aria-pressed={slow}>
              {slow ? "¼ speed" : "1× speed"}
            </button>
            <button onClick={() => setFrame((f) => Math.max(0, f - 1))} className="chip border-line text-muted min-h-9" aria-label="Previous frame">−1 f</button>
            <button onClick={() => setFrame((f) => Math.min(n - 1, f + 1))} className="chip border-line text-muted min-h-9" aria-label="Next frame">+1 f</button>
          </div>
          <PhaseTimeline events={payload.events} frames={n} frame={frame} times={obs.t} onSeek={(f) => { setPlaying(false); setFrame(f); }} />
        </div>
      )}
    </section>
  );
});

function drawPin(ctx: CanvasRenderingContext2D, metric: string, frame: number, obs: CaptureObservation, scene: ReturnType<typeof buildScene>, W: number, H: number) {
  const g = (s: Parameters<typeof scene.get>[1]) => {
    const p = obs.body[frame]?.[J[semanticToJoint(s, scene.front)]];
    return p ? ([p[0] * W, p[1] * H] as const) : null;
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
      ctx.moveTo(h[0] * W, h[1] * H);
      ctx.lineTo(h[0] * W, h[1] * H + 90);
      ctx.stroke();
      ctx.setLineDash([]);
      label(h[0] * W + 8, h[1] * H - 6, metric === "bat_angle_contact" ? "bat vs vertical" : "bat speed here");
    }
  } else {
    const hip = g("front_hip");
    if (hip) label(hip[0] + 10, hip[1], metric.replaceAll("_", " "));
  }
}
