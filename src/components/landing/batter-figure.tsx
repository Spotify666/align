"use client";

import { useEffect, useRef, useState } from "react";
import { PHASES, T_CONTACT, T_END, ballAt, batterArt, poseAt, type Art } from "@/lib/batter-art";

const W = 600;
const H = 560;
const CONTACT = PHASES.length - 1;

/**
 * The landing page's batter: a line drawing of a front-foot defence that plays slowly and can be
 * stopped on any of its four moments, each with what the arms and body are doing. It is an
 * illustration (key poses drawn by hand), and the page says so; the measured example is further
 * down the page.
 *
 * A still (SVG, drawn on the server) is always there, and is all there is under reduced motion
 * or on a light device: the moments still switch, without movement. Otherwise a canvas plays
 * the shot. It draws nothing off-screen, in a hidden tab, while held on a moment, or once left
 * alone (it comes to rest at contact).
 */
export function BatterFigure() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState(CONTACT);
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);
  const wakeRef = useRef<() => void>(() => {});

  const hold = (i: number | null) => {
    heldRef.current = i;
    setHeld(i);
    if (i !== null) setPhase(i);
    wakeRef.current();
  };

  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData || (nav.deviceMemory ?? 8) < 4) return;
    const ctx = el.getContext("2d");
    if (!ctx || typeof Path2D === "undefined") return;

    const colours = () => {
      const css = getComputedStyle(wrap);
      const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      return { fg: token("--fg", "#F4F1E8"), rule: token("--line-strong", "#4A4944"), brand: token("--brand", "#FF6A00"), ground: token("--surface", "#121212") };
    };
    let col = colours();
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const minGap = coarse ? 1000 / 30 : 0;
    const SLOW = 0.42; // of real speed
    const REST = 900; // ms in the stance before moving
    const MOVE = (T_END / SLOW) * 1000;
    const STAY = 2200; // ms held at contact
    const FADE = 320;
    const LOOP = REST + MOVE + STAY + FADE;

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let running = false;
    let last = 0;
    let clock = REST + (T_CONTACT / SLOW) * 1000; // start where the still is: at contact
    let tau = T_CONTACT;
    let shownPhase = CONTACT;
    let idleAt = performance.now();

    const size = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (t: number, alpha: number) => {
      const art = batterArt(poseAt(t), w, h);
      const lw = Math.max(1.3, art.scale * 0.0045);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = col.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, art.groundY);
      ctx.lineTo(w, art.groundY);
      ctx.moveTo(art.creaseX, art.groundY);
      ctx.lineTo(art.creaseX, art.groundY + 7);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col.ground;
      ctx.strokeStyle = col.fg;
      for (const layer of art.layers) {
        const shapes = layer.fill.map((d) => new Path2D(d));
        ctx.lineWidth = lw * 2;
        for (const s of shapes) ctx.stroke(s);
        for (const s of shapes) ctx.fill(s);
        if (layer.lines.length) {
          ctx.lineWidth = lw * 0.7;
          ctx.stroke(new Path2D(layer.lines.join("")));
        }
      }
      const ball = ballAt(t);
      if (ball) {
        const [x, y] = art.at(ball);
        ctx.fillStyle = col.fg;
        ctx.beginPath();
        ctx.arc(x, y, art.scale * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
      // The line, once the bat has met the ball.
      const lit = Math.max(0, Math.min(1, (t - T_CONTACT + 0.05) / 0.05));
      if (lit > 0) {
        ctx.globalAlpha = alpha * lit;
        ctx.strokeStyle = col.brand;
        ctx.fillStyle = col.brand;
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        art.line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        for (const [x, y] of art.line) {
          ctx.beginPath();
          ctx.arc(x, y, lw * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const show = (t: number) => {
      let i = 0;
      PHASES.forEach((p, k) => {
        if (t >= p.at - 0.03) i = k;
      });
      if (i !== shownPhase) {
        shownPhase = i;
        setPhase(i);
      }
    };

    /** One step. Returns false when there is nothing more to draw until something changes. */
    const step = (now: number): boolean => {
      const dt = Math.min(64, now - last);
      last = now;
      const target = heldRef.current;
      if (target !== null) {
        // Held on a moment: travel there, then stop drawing.
        const goal = PHASES[target]!.at;
        const d = goal - tau;
        const move = (dt / 1000) * 1.1;
        tau = Math.abs(d) <= move ? goal : tau + Math.sign(d) * move;
        paint(tau, 1);
        clock = REST + (tau / SLOW) * 1000; // playing resumes from here
        return tau !== goal;
      }
      clock = (clock + dt) % LOOP;
      tau = Math.max(0, Math.min(T_END, ((clock - REST) / 1000) * SLOW));
      // After the stay at contact the drawing fades, and comes back in the stance.
      const out = clock - (REST + MOVE + STAY);
      paint(tau, out > 0 ? 1 - out / FADE : Math.min(1, clock / FADE));
      show(tau);
      // Left alone: come to rest at contact.
      return !(now - idleAt > 20000 && tau >= T_END && out <= 0);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return (running = false);
      if (now - last >= minGap && !step(now)) return (running = false);
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
    wakeRef.current = wake;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) wake();
    });
    const ro = new ResizeObserver(() => {
      size();
      if (running) return;
      paint(tau, 1);
    });

    // The theme can change under the drawing (dark, daylight): take the new colours.
    const retheme = () => {
      col = colours();
      if (!running) paint(tau, 1);
    };
    const mo = new MutationObserver(retheme);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");

    size();
    paint(tau, 1);
    io.observe(wrap);
    ro.observe(wrap);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    scheme.addEventListener("change", retheme);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    document.addEventListener("visibilitychange", wake);
    const shown = requestAnimationFrame(() => setLive(true));
    (window as unknown as { __batterFrames?: () => boolean }).__batterFrames = () => running;
    return () => {
      wakeRef.current = () => {};
      cancelAnimationFrame(raf);
      cancelAnimationFrame(shown);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      scheme.removeEventListener("change", retheme);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  // The still: the moment being held, or contact.
  const at = PHASES[held ?? CONTACT]!.at;
  const still: Art = batterArt(poseAt(at), W, H);
  const ball = ballAt(at);
  const ballAtPx = ball ? still.at(ball) : null;
  const lw = Math.max(1.3, still.scale * 0.0045);

  return (
    <figure className="batter-figure overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex min-h-11 items-center gap-2 px-4 pt-4">
        <span className="chip !bg-transparent">Illustration</span>
        <span className="chip !bg-transparent">Front-foot defence</span>
        {held !== null && live && (
          <button type="button" onClick={() => hold(null)} className="-my-2 ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-fg">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
              <path d="M2.5 1.2v9.6L10.5 6z" />
            </svg>
            Play
          </button>
        )}
      </div>
      <div ref={box} className="relative aspect-[15/14] w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className={`absolute inset-0 h-full w-full ${live ? "opacity-0" : "opacity-100"}`} aria-hidden focusable="false">
          <path d={`M0 ${still.groundY}H${W}M${still.creaseX} ${still.groundY}v7`} stroke="var(--line-strong)" strokeWidth="1" fill="none" />
          {still.layers.map((l, i) => (
            <g key={i} stroke="var(--fg)" strokeLinejoin="round" strokeLinecap="round" fill="none">
              <path d={l.fill.join("")} strokeWidth={lw * 2} />
              {l.fill.map((d, k) => (
                <path key={k} d={d} fill="var(--surface)" stroke="none" />
              ))}
              {l.lines.length > 0 && <path d={l.lines.join("")} strokeWidth={lw * 0.7} />}
            </g>
          ))}
          {ballAtPx && <circle cx={ballAtPx[0]} cy={ballAtPx[1]} r={still.scale * 0.02} fill="var(--fg)" />}
          {at >= T_CONTACT && (
            <g>
              <polyline points={still.line.map((p) => p.map((v) => Math.round(v * 10) / 10).join(",")).join(" ")} fill="none" stroke="var(--brand)" strokeWidth={lw * 1.5} strokeLinecap="round" strokeLinejoin="round" />
              {still.line.map(([x, y], i) => (
                <circle key={i} cx={Math.round(x * 10) / 10} cy={Math.round(y * 10) / 10} r={lw * 2.6} fill="var(--brand)" />
              ))}
            </g>
          )}
        </svg>
        <canvas ref={canvas} className={`absolute inset-0 h-full w-full ${live ? "opacity-100" : "opacity-0"}`} aria-hidden />
      </div>
      <figcaption className="px-4 pb-4">
        <div role="group" aria-label="Moments of the shot" className="grid grid-cols-4 gap-1.5">
          {PHASES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={held === i}
              onClick={() => hold(held === i ? null : i)}
              className={`min-h-11 rounded-full border px-1 text-[0.82rem] font-medium transition-colors duration-150 ${phase === i ? "border-fg text-fg" : "border-line-strong text-fg-muted hover:text-fg"} ${held === i ? "bg-tint" : ""}`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-[3.75rem] text-sm text-fg" aria-live={held === null ? "off" : "polite"}>
          <span className="font-semibold">{PHASES[phase]!.name}.</span> <span className="text-fg-muted">{PHASES[phase]!.cue}</span>
        </p>
        <p className="mt-1 text-xs text-fg-subtle">A drawing of a right-handed batter, seen from the off side. Tap a moment to stop on it; tap it again to play. Not a recording.</p>
      </figcaption>
    </figure>
  );
}
