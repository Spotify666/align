"use client";

import { useEffect, useRef, useState } from "react";
import { BONES, CHAIN, HERO_CAMERA, LINE, PITCH, blend, posterPaths, project, type HeroData, type V3 } from "@/lib/hero-geometry";

const LABELS: Array<{ joint: number; text: string }> = [
  { joint: 0, text: "Head over the front foot" },
  { joint: 9, text: "Front knee over the foot" },
  { joint: 11, text: "Front foot planted" },
];
const W = 640;
const H = 520;

/**
 * The landing page's figure. A still (SVG, drawn on the server) is always there. Where motion
 * is welcome and the device can afford it, a canvas plays the same movement slowly: energy
 * runs up the front side, and scrolling settles the figure at contact, where the line and its
 * three landmarks appear. It draws nothing off-screen, in a hidden tab, or once left alone.
 */
export function HeroFigure({ data }: { data: HeroData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<HTMLSpanElement | null>>([]);
  const [live, setLive] = useState(false);
  const poster = posterPaths(data, W, H);

  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData || (nav.deviceMemory ?? 8) < 4) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const col = { fg: css.getPropertyValue("--fg").trim() || "#F4F1E8", line: css.getPropertyValue("--line-strong").trim() || "#4A4944", brand: css.getPropertyValue("--brand").trim() || "#FF6A00" };
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const minGap = coarse ? 1000 / 30 : 0;
    const n = data.frames.length;
    const dust = Array.from({ length: coarse ? 90 : 160 }, (_, i) => {
      const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
      return [-1 + r(1) * 7, 0.05 + r(2) * 2.2, -2.2 + r(3) * 4.4] as [number, number, number];
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let last = 0;
    let clock = 0;
    let yaw = 0;
    let wantYaw = 0;
    let settle = 0; // 0 = moving, 1 = held at contact (scroll)
    let idleAt = performance.now();
    let running = false;

    const size = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      w = r.width;
      h = r.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      clock += dt * (1 - settle);
      yaw += (wantYaw - yaw) * 0.08;
      const cam = { ...HERO_CAMERA, yaw: HERO_CAMERA.yaw + yaw };
      const P = (v: V3) => project(v, cam, w, h);
      // The movement loops slowly (a third of real speed); held at contact as the page scrolls.
      const span = (n - 1) / data.fps / 0.33;
      const at = ((clock / 1000) % (span + 1.2)) / span;
      const pos = Math.min(1, at) * (n - 1);
      const loopFrame = blend(data.frames[Math.floor(pos)]!, data.frames[Math.min(n - 1, Math.floor(pos) + 1)]!, pos % 1);
      const frame = settle > 0 ? blend(loopFrame, data.frames[data.contact]!, settle) : loopFrame;
      const joints = frame.map((p) => P(p as unknown as V3));

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = col.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of [...PITCH.lines, ...PITCH.stumps]) {
        const pa = P(a);
        const pb = P(b);
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
      }
      ctx.stroke();

      ctx.fillStyle = col.fg;
      for (const p of dust) {
        const f = ((p[0] - (clock / 1000) * 0.25 + 100) % 7) - 1;
        const s = P([f, p[1], p[2]]);
        ctx.globalAlpha = 0.1 + 0.16 * s[2];
        ctx.fillRect(s[0], s[1], 1.4 * s[2], 1.4 * s[2]);
      }

      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = col.fg;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo(joints[a]![0], joints[a]![1]);
        ctx.lineTo(joints[b]![0], joints[b]![1]);
      }
      const nx = (joints[1]![0] + joints[2]![0]) / 2;
      const ny = (joints[1]![1] + joints[2]![1]) / 2;
      ctx.moveTo(nx, ny);
      ctx.lineTo(joints[0]![0], joints[0]![1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(joints[0]![0], joints[0]![1], Math.max(4, 0.11 * joints[0]![2] * Math.min(h * 0.4, w * 0.3)), 0, Math.PI * 2);
      ctx.stroke();

      // Energy up the front side: foot, knee, hip, shoulder, elbow, wrist. Fades as the figure settles.
      const pulse = ((clock / 1000) * 0.6) % 1.4;
      ctx.strokeStyle = col.brand;
      ctx.lineWidth = 3;
      for (let i = 0; i < CHAIN.length - 1; i++) {
        const mid = (i + 0.5) / (CHAIN.length - 1);
        const glow = Math.max(0, 1 - Math.abs(pulse - mid) * 3.2) * (1 - settle);
        if (glow <= 0.02) continue;
        ctx.globalAlpha = glow;
        ctx.beginPath();
        ctx.moveTo(joints[CHAIN[i]!]![0], joints[CHAIN[i]!]![1]);
        ctx.lineTo(joints[CHAIN[i + 1]!]![0], joints[CHAIN[i + 1]!]![1]);
        ctx.stroke();
      }

      // The line and its landmarks, once settled.
      if (settle > 0.02) {
        ctx.globalAlpha = settle;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        LINE.forEach((j, i) => (i ? ctx.lineTo(joints[j]![0], joints[j]![1]) : ctx.moveTo(joints[j]![0], joints[j]![1])));
        ctx.stroke();
        ctx.fillStyle = col.brand;
        for (const { joint } of LABELS) {
          ctx.beginPath();
          ctx.arc(joints[joint]![0], joints[joint]![1], 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      LABELS.forEach(({ joint }, i) => {
        const node = labels.current[i];
        if (!node) return;
        node.style.opacity = String(settle);
        node.style.transform = `translate(${Math.round(joints[joint]![0] + 12)}px, ${Math.round(joints[joint]![1] - 10)}px)`;
      });
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return (running = false);
      // Left alone and nothing changing: stop until the next input.
      if (now - idleAt > 12000 && Math.abs(wantYaw - yaw) < 0.001) return (running = false);
      if (now - last >= minGap) draw(now);
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      idleAt = performance.now();
      if (!running && visible && !document.hidden) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      wantYaw = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)) * 0.07; // at most 4°
      wake();
    };
    const onScroll = () => {
      const r = wrap.getBoundingClientRect();
      const travel = Math.max(1, Math.min(r.height * 0.7, window.innerHeight * 0.5));
      const p = Math.max(0, Math.min(1, window.scrollY / travel));
      settle = p * p * (3 - 2 * p);
      wake();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) wake();
    });
    const ro = new ResizeObserver(() => {
      size();
      wake();
    });

    size();
    io.observe(wrap);
    ro.observe(wrap);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", wake);
    onScroll();
    const shown = requestAnimationFrame(() => setLive(true));
    (window as unknown as { __heroFrames?: () => boolean }).__heroFrames = () => running;
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(shown);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [data]);

  return (
    <figure className="hero-figure">
      <div ref={box} className="relative aspect-[16/13] w-full overflow-hidden">
        {/* The still: always in the page, the only thing drawn under reduced motion or on a light device. */}
        <svg viewBox={`0 0 ${W} ${H}`} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${live ? "opacity-0" : "opacity-100"}`} aria-hidden focusable="false">
          <path d={poster.pitch} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
          <path d={poster.bones} fill="none" stroke="var(--fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={poster.joints[0]![0]} cy={poster.joints[0]![1]} r={poster.headRadius} fill="none" stroke="var(--fg)" strokeWidth="2.2" />
          <path d={poster.line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {LABELS.map(({ joint }) => (
            <circle key={joint} cx={poster.joints[joint]![0]} cy={poster.joints[joint]![1]} r="4.5" fill="var(--brand)" />
          ))}
        </svg>
        <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${live ? "opacity-100" : "opacity-0"}`} aria-hidden />
        {live &&
          LABELS.map(({ text }, i) => (
            <span key={text} ref={(n) => { labels.current[i] = n; }} className="hero-label" style={{ opacity: 0 }} aria-hidden>
              {text}
            </span>
          ))}
      </div>
      <figcaption className="mt-2 text-xs text-fg-subtle">
        A generated example of a front-foot defence, drawn from the engine&apos;s own track. The orange line runs through the front foot, front knee, front shoulder and head.
      </figcaption>
    </figure>
  );
}
