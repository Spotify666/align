"use client";

import { useEffect, useRef, useState } from "react";
import { instrument, pitchLines, type HeroData, type Instrument } from "@/lib/hero-geometry";

const W = 640;
const H = 440;
const STATE_WORDS = { in_line: "in line over the front foot", behind: "behind the line", ahead: "ahead of the line" } as const;

/**
 * The landing page's figure: the line as an instrument, not a drawing of a person. A side
 * elevation to scale (ground, stumps), the front and back foot, the bat and the ball, and the
 * three things Aline reads above the front foot (head, front shoulder, front knee), each with
 * the range the engine holds it to. As the ball arrives they travel into place; the orange line
 * joins them. Every position and every range comes from the engine's analysis of one generated
 * example, including what is out of line in it.
 *
 * A still (SVG, drawn on the server) is always there. Where motion is welcome and the device
 * can afford it, a canvas plays the movement; scrolling holds it at contact. It draws nothing
 * off-screen, in a hidden tab, or once left alone.
 */
export function HeroFigure({ data }: { data: HeroData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const still = instrument(data, data.contact, W, H);
  const ground = pitchLines(undefined, W, H);

  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData || (nav.deviceMemory ?? 8) < 4) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const col = { fg: token("--fg", "#F4F1E8"), dim: token("--fg-subtle", "#A9A59D"), rule: token("--line-strong", "#4A4944"), brand: token("--brand", "#FF6A00"), warn: token("--warn", "#E0B354"), ground: token("--paper", "#050505") };
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const minGap = coarse ? 1000 / 30 : 0;
    const n = data.frames.length;
    const slow = 0.3; // a third of real speed
    const lead = data.contact / data.fps / slow;
    const hold = 1.8;
    const tail = (n - 1 - data.contact) / data.fps / slow;

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let last = 0;
    let clock = 0;
    let settle = 0; // 0 = playing, 1 = held at contact (scroll)
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
    const path = (pts: Array<[number, number]>) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    };

    const paint = (m: Instrument, lit: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Ground and stumps, to scale.
      ctx.strokeStyle = col.rule;
      ctx.lineWidth = 1;
      for (const [x1, y1, x2, y2] of pitchLines(undefined, w, h)) path([[x1, y1], [x2, y2]]);
      // Where each part has been.
      ctx.strokeStyle = col.dim;
      ctx.globalAlpha = 0.4;
      for (const t of m.trails) path(t);
      // The ball's path, and the ball.
      ctx.fillStyle = col.dim;
      for (const [x, y] of m.ballPath) ctx.fillRect(x - 1, y - 1, 2, 2);
      ctx.globalAlpha = 1;
      if (m.ball) {
        ctx.fillStyle = col.fg;
        ctx.beginPath();
        ctx.arc(m.ball[0], m.ball[1], 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // The vertical above the front foot, and the range each part should be in.
      ctx.strokeStyle = col.rule;
      ctx.setLineDash([3, 5]);
      path([[m.plumb.x, m.groundY], [m.plumb.x, m.plumb.top]]);
      ctx.setLineDash([]);
      ctx.font = "500 11px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      for (const p of m.parts) {
        const [a, b] = p.range;
        ctx.strokeStyle = col.dim;
        ctx.lineWidth = 1.5;
        path([[a, p.at[1] - 5], [a, p.at[1] + 5]]);
        path([[b, p.at[1] - 5], [b, p.at[1] + 5]]);
        path([[a, p.at[1]], [b, p.at[1]]]);
        ctx.fillStyle = col.dim;
        const right = Math.max(a, b, p.at[0]) + 12;
        const fits = right + 60 < w;
        ctx.textAlign = fits ? "left" : "right";
        ctx.fillText(p.part[0]!.toUpperCase() + p.part.slice(1), fits ? right : Math.min(a, b, p.at[0]) - 12, p.at[1]);
      }
      // Feet on the ground; the bat.
      ctx.lineWidth = 5;
      ctx.strokeStyle = col.dim;
      path([[m.backFoot[0] - 9, m.groundY - 3], [m.backFoot[0] + 9, m.groundY - 3]]);
      ctx.strokeStyle = col.fg;
      path([[m.frontFoot[0] - 9, m.groundY - 3], [m.frontFoot[0] + 9, m.groundY - 3]]);
      if (m.bat) {
        ctx.lineWidth = 3.5;
        path(m.bat);
      }
      // The line: front foot, knee, shoulder, head.
      ctx.strokeStyle = col.brand;
      ctx.lineWidth = 2.5 + lit;
      path([[m.frontFoot[0], m.groundY - 3], ...[...m.parts].reverse().map((p) => p.at)]);
      for (const p of m.parts) {
        if (p.state === "in_line") {
          ctx.fillStyle = col.brand;
          ctx.beginPath();
          ctx.arc(p.at[0], p.at[1], 6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Out of its range: a ring, not a dot, joined to the range by the gap still to close.
          const edge = p.state === "behind" ? Math.min(...p.range) : Math.max(...p.range);
          ctx.strokeStyle = col.warn;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 4]);
          path([[p.at[0], p.at[1]], [edge, p.at[1]]]);
          ctx.setLineDash([]);
          ctx.fillStyle = col.ground;
          ctx.beginPath();
          ctx.arc(p.at[0], p.at[1], 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    };

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      clock += dt * (1 - settle);
      const t = (clock / 1000) % (lead + hold + tail + 0.6);
      const playing = t < lead ? (t / lead) * data.contact : t < lead + hold ? data.contact : Math.min(n - 1, data.contact + ((t - lead - hold) / Math.max(0.01, tail)) * (n - 1 - data.contact));
      const pos = playing + (data.contact - playing) * settle;
      const atContact = Math.abs(pos - data.contact) < 0.01;
      paint(instrument(data, pos, w, h), atContact ? 1 : 0);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return (running = false);
      // Left alone: stop until the next input.
      if (now - idleAt > 14000) return (running = false);
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
    window.addEventListener("pointermove", wake, { passive: true });
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
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [data]);

  const pts = (xs: Array<[number, number]>) => xs.map((p) => p.join(",")).join(" ");

  return (
    <figure className="hero-figure">
      <div ref={box} className="relative aspect-[16/11] w-full overflow-hidden">
        {/* The still: always in the page, the only thing drawn under reduced motion or on a light device. */}
        <svg viewBox={`0 0 ${W} ${H}`} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${live ? "opacity-0" : "opacity-100"}`} aria-hidden focusable="false">
          {ground.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-strong)" strokeWidth="1" />
          ))}
          {still.trails.map((t, i) => (
            <polyline key={i} points={pts(t)} fill="none" stroke="var(--fg-subtle)" strokeWidth="1" opacity="0.4" />
          ))}
          <line x1={still.plumb.x} y1={still.groundY} x2={still.plumb.x} y2={still.plumb.top} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 5" />
          {still.parts.map((p) => (
            <g key={p.part} stroke="var(--fg-subtle)" strokeWidth="1.5">
              <line x1={p.range[0]} y1={p.at[1]} x2={p.range[1]} y2={p.at[1]} />
              <line x1={p.range[0]} y1={p.at[1] - 5} x2={p.range[0]} y2={p.at[1] + 5} />
              <line x1={p.range[1]} y1={p.at[1] - 5} x2={p.range[1]} y2={p.at[1] + 5} />
            </g>
          ))}
          <line x1={still.backFoot[0] - 9} y1={still.groundY - 3} x2={still.backFoot[0] + 9} y2={still.groundY - 3} stroke="var(--fg-subtle)" strokeWidth="5" strokeLinecap="round" />
          <line x1={still.frontFoot[0] - 9} y1={still.groundY - 3} x2={still.frontFoot[0] + 9} y2={still.groundY - 3} stroke="var(--fg)" strokeWidth="5" strokeLinecap="round" />
          {still.bat && <polyline points={pts(still.bat)} fill="none" stroke="var(--fg)" strokeWidth="3.5" strokeLinecap="round" />}
          {still.ball && <circle cx={still.ball[0]} cy={still.ball[1]} r="3.5" fill="var(--fg)" />}
          <polyline points={pts([[still.frontFoot[0], still.groundY - 3], ...[...still.parts].reverse().map((p) => p.at)])} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {still.parts.map((p) =>
            p.state === "in_line" ? <circle key={p.part} cx={p.at[0]} cy={p.at[1]} r="6" fill="var(--brand)" /> : <circle key={p.part} cx={p.at[0]} cy={p.at[1]} r="6.5" fill="var(--paper)" stroke="var(--warn)" strokeWidth="2.5" />,
          )}
        </svg>
        <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${live ? "opacity-100" : "opacity-0"}`} aria-hidden />
      </div>
      <figcaption className="mt-3 text-sm text-fg-muted">
        <p className="font-medium text-fg">The line at contact, as Aline reads it.</p>
        <ul className="mt-2 grid gap-1.5">
          {still.parts.map((p) => (
            <li key={p.part} className="flex items-center gap-2.5">
              <span className={`h-3 w-3 shrink-0 rounded-full ${p.state === "in_line" ? "bg-brand" : "border-2 border-warn"}`} aria-hidden />
              <span>
                {p.name}: <span className={p.state === "in_line" ? "" : "text-fg"}>{STATE_WORDS[p.state]}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-fg-subtle">
          Side-on, to scale: stumps, both feet, bat and ball. The brackets are the range each part should be in. A generated example, measured by the same engine that checks your shot.
        </p>
      </figcaption>
    </figure>
  );
}
