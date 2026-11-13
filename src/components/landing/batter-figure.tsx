"use client";

import { useEffect, useRef, useState } from "react";
import { TRACED } from "@/lib/traced-batter";

const W = TRACED.width;
const H = TRACED.height;
const MOMENTS = [
  { name: "Stance", cue: "Bat held ready, hands together, eyes on the ball." },
  { name: "Backlift", cue: "The hands lift the bat as the weight starts forward." },
  { name: "Stride", cue: "The front foot goes to the ball and the bat starts down." },
  { name: "Contact", cue: "Front knee bent, arms long, bat angled down beside the front leg." },
] as const;
const CONTACT = MOMENTS.length - 1;

interface Traced {
  paths: string[];
  /** Per frame: front foot, front knee, front shoulder, head (x, y pairs). */
  lines: number[][];
}

/**
 * The landing page's batter: a real front-foot defence, traced frame by frame from a clip
 * into line art (`scripts/trace`), played slowly. It can be stopped on four moments, each with
 * what the body is doing; the orange line joins front foot, knee, shoulder and head at contact.
 *
 * A still (the contact frame, drawn on the server) is always there. The other frames are
 * fetched once the page is idle. Movement plays only where it is welcome and affordable; under
 * reduced motion the moments still switch, as stills. It draws nothing off-screen, in a hidden
 * tab, while held on a moment, or once left alone (it comes to rest at contact).
 */
export function BatterFigure() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moment, setMoment] = useState(CONTACT);
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);
  const wakeRef = useRef<() => void>(() => {});

  const hold = (i: number | null) => {
    heldRef.current = i;
    setHeld(i);
    if (i !== null) setMoment(i);
    wakeRef.current();
  };

  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const ctx = el.getContext("2d");
    if (!ctx || typeof Path2D === "undefined") return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = !!nav.connection?.saveData || (nav.deviceMemory ?? 8) < 4;
    const play = !still && !light;

    const colours = () => {
      const css = getComputedStyle(wrap);
      const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      return { fg: token("--fg", "#F4F1E8"), rule: token("--line-strong", "#4A4944"), brand: token("--brand", "#FF6A00") };
    };
    let col = colours();
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const SLOW = 0.45; // of real speed
    const FRAME = 1000 / TRACED.fps / SLOW;
    const REST = 900; // ms on the stance before moving
    const MOVE = (TRACED.frames - 1) * FRAME;
    const STAY = 2400; // ms held at the end
    const FADE = 320;
    const LOOP = REST + MOVE + STAY + FADE;
    const last = TRACED.frames - 1;

    let data: Traced | null = null;
    let shapes: Array<Path2D | null> = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let running = false;
    let then = 0;
    let clock = REST + TRACED.moments[CONTACT]! * FRAME; // start where the still is
    let at = TRACED.moments[CONTACT] as number;
    let shownMoment = CONTACT;
    let idleAt = performance.now();
    let dead = false;

    const size = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (frame: number, alpha: number) => {
      if (!data) return;
      const i = Math.max(0, Math.min(last, Math.round(frame)));
      const k = Math.min(w / W, h / H);
      const ox = (w - W * k) / 2;
      const oy = (h - H * k) / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = col.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, oy + TRACED.ground * k);
      ctx.lineTo(w, oy + TRACED.ground * k);
      ctx.stroke();
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(k, k);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col.fg;
      const shape = (shapes[i] ??= new Path2D(data.paths[i]!));
      ctx.fill(shape, "evenodd");
      // The line, once the batter has reached the ball.
      const from = TRACED.moments[CONTACT]!;
      const lit = Math.max(0, Math.min(1, (frame - from + 3) / 3));
      const l = data.lines[i];
      if (lit > 0 && l) {
        ctx.globalAlpha = alpha * lit;
        ctx.strokeStyle = col.brand;
        ctx.fillStyle = col.brand;
        ctx.lineWidth = 2 / k;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(l[0]!, l[1]!);
        for (let p = 2; p < l.length; p += 2) ctx.lineTo(l[p]!, l[p + 1]!);
        ctx.stroke();
        for (let p = 0; p < l.length; p += 2) {
          ctx.beginPath();
          ctx.arc(l[p]!, l[p + 1]!, 3.6 / k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const show = (frame: number) => {
      let i = 0;
      TRACED.moments.forEach((f, m) => {
        if (frame >= f - 1) i = m;
      });
      if (i !== shownMoment) {
        shownMoment = i;
        setMoment(i);
      }
    };

    /** One step. Returns false when there is nothing more to draw until something changes. */
    const step = (now: number): boolean => {
      const dt = Math.min(64, now - then);
      then = now;
      const target = heldRef.current;
      if (target !== null || !play) {
        // Held on a moment (or no movement wanted): go to it, then stop drawing.
        const goal = TRACED.moments[target ?? CONTACT]!;
        const d = goal - at;
        const move = play ? dt / (FRAME * 0.5) : Infinity;
        at = Math.abs(d) <= move ? goal : at + Math.sign(d) * move;
        paint(at, 1);
        clock = REST + at * FRAME; // playing resumes from here
        return at !== goal;
      }
      clock = (clock + dt) % LOOP;
      at = Math.max(0, Math.min(last, (clock - REST) / FRAME));
      // After the stay at the end the drawing fades, and comes back in the stance.
      const out = clock - (REST + MOVE + STAY);
      paint(at, out > 0 ? 1 - out / FADE : Math.min(1, clock / FADE));
      show(at);
      // Left alone: come to rest at the end.
      return !(now - idleAt > 20000 && at >= last && out <= 0);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || !data) return (running = false);
      if (now - then >= (coarse ? 1000 / 30 : 0) && !step(now)) return (running = false);
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      idleAt = performance.now();
      if (!running && visible && !document.hidden && data) {
        running = true;
        then = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    wakeRef.current = wake;

    // The frames: fetched when the page is idle (at once on a tap), never on a data-saving phone
    // until asked for.
    let asked = false;
    const fetchFrames = () => {
      if (asked) return;
      asked = true;
      fetch(TRACED.src)
        .then((r) => (r.ok ? (r.json() as Promise<Traced>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (dead || !Array.isArray(d.paths) || d.paths.length !== TRACED.frames) return;
          data = d;
          shapes = new Array(d.paths.length).fill(null);
          size();
          paint(at, 1);
          setLive(true);
          setMoving(play);
          wake();
        })
        .catch(() => undefined); // the still stays
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const queued = light ? 0 : idle ? idle(fetchFrames, { timeout: 2500 }) : window.setTimeout(fetchFrames, 600);
    const onAsk = () => {
      fetchFrames();
      wake();
    };
    wrap.parentElement?.addEventListener("pointerdown", onAsk, { passive: true });

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) wake();
    });
    const ro = new ResizeObserver(() => {
      size();
      if (!running) paint(at, 1);
    });
    const retheme = () => {
      col = colours();
      if (!running) paint(at, 1);
    };
    const mo = new MutationObserver(retheme);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");

    size();
    io.observe(wrap);
    ro.observe(wrap);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    scheme.addEventListener("change", retheme);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    document.addEventListener("visibilitychange", wake);
    (window as unknown as { __batterFrames?: () => boolean }).__batterFrames = () => running;
    return () => {
      dead = true;
      wakeRef.current = () => {};
      cancelAnimationFrame(raf);
      if (!light && !idle) window.clearTimeout(queued);
      wrap.parentElement?.removeEventListener("pointerdown", onAsk);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      scheme.removeEventListener("change", retheme);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  const line = TRACED.stillLine;
  const points = Array.from({ length: line.length / 2 }, (_, i) => [line[i * 2]!, line[i * 2 + 1]!] as const);

  return (
    <figure className="batter-figure overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex min-h-11 items-center gap-2 px-4 pt-4">
        <span className="chip !bg-transparent">Traced from a real clip</span>
        <span className="chip !bg-transparent">Front-foot defence</span>
        {held !== null && moving && (
          <button type="button" onClick={() => hold(null)} className="-my-2 ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-fg">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
              <path d="M2.5 1.2v9.6L10.5 6z" />
            </svg>
            Play
          </button>
        )}
      </div>
      <div ref={box} className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        {/* The still: the contact frame, in the page from the start. */}
        <svg viewBox={`0 0 ${W} ${H}`} className={`absolute inset-0 h-full w-full ${live ? "opacity-0" : "opacity-100"}`} aria-hidden focusable="false">
          <path d={`M0 ${TRACED.ground}H${W}`} stroke="var(--line-strong)" strokeWidth="1.5" fill="none" />
          <path d={TRACED.still} fill="var(--fg)" fillRule="evenodd" />
          <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--brand)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="var(--brand)" />
          ))}
        </svg>
        <canvas ref={canvas} className={`absolute inset-0 h-full w-full ${live ? "opacity-100" : "opacity-0"}`} aria-hidden />
      </div>
      <figcaption className="px-4 pb-4">
        <div role="group" aria-label="Moments of the shot" className="grid grid-cols-4 gap-1.5">
          {MOMENTS.map((m, i) => (
            <button
              key={m.name}
              type="button"
              aria-pressed={held === i}
              onClick={() => hold(held === i ? null : i)}
              className={`min-h-11 rounded-full border px-1 text-[0.82rem] font-medium transition-colors duration-150 ${moment === i ? "border-fg text-fg" : "border-line-strong text-fg-muted hover:text-fg"} ${held === i ? "bg-tint" : ""}`}
            >
              {m.name}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-[2.75rem] text-sm text-fg" aria-live={held === null ? "off" : "polite"}>
          <span className="font-semibold">{MOMENTS[moment]!.name}.</span> <span className="text-fg-muted">{MOMENTS[moment]!.cue}</span>
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          A real batter&apos;s front-foot defence, traced frame by frame from a phone clip. Aline read this clip as a front-foot defence: front knee bent, a good step, front shoulder a little late.
        </p>
      </figcaption>
    </figure>
  );
}
