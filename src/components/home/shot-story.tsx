"use client";
// "Learn the shot": the forward defence as a short illustrated explainer. One drawn batter
// plays the textbook defence in its own continuous motion (the textbook clip, frame by
// frame), slowed down like a replay and held at each of the four moments that matter,
// where the idea draws itself on with a one-line caption.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { BatterFigure, FigureDefs, GOOD, mid, ZONE, type FigurePose, type Pt } from "@/components/lesson/figure";
import { Draw, Label, Zone, seg } from "@/components/lesson/lesson";
import type { Story } from "@/components/lesson/pose";


const SCENES = [
  { k: "Set up", t: "Side-on, knees soft, eyes level.", d: "Stay still as the bowler runs in. A still head sees the ball earliest." },
  { k: "Pick up", t: "The bat goes up straight.", d: "It lifts back toward the stumps as the stride begins. Eyes stay level on the ball." },
  { k: "Stride", t: "Head leads, front foot follows.", d: "Step toward where the ball will land, the head moving first." },
  { k: "Contact", t: "Meet it under your eyes.", d: "Head over the front knee, bat angled down beside the pad, soft hands: the ball drops dead." },
];

// The timeline, in seconds on screen: hold each moment, then play on to the next one in
// slow motion (the stroke itself lasts a fifth of a second; real speed would be a blink).
const HOLD = 3.8;
type Step = { hold: number } | { from: number; to: number; speed: number };

function timeline(s: Story): Array<Step & { start: number; dur: number }> {
  const [a, b, c, d] = s.moments;
  const end = s.poses.length - 1;
  const steps: Step[] = [
    { hold: 0 },
    { from: a, to: b, speed: 0.5 },
    { hold: 1 },
    { from: b, to: c, speed: 0.15 },
    { hold: 2 },
    { from: c, to: d, speed: 0.15 },
    { hold: 3 },
    { from: d, to: end, speed: 0.3 },
  ];
  let t = 0;
  return steps.map((x) => {
    const dur = "hold" in x ? (x.hold === 3 ? HOLD + 0.8 : HOLD) : (x.to - x.from) / s.fps / x.speed;
    const out = { ...x, start: t, dur };
    t += dur;
    return out;
  });
}

function lerpPose(a: FigurePose, b: FigurePose, u: number): FigurePose {
  const out = {} as FigurePose;
  for (const [k, v] of Object.entries(b) as Array<[keyof FigurePose, Pt]>) {
    const p = a[k] ?? v;
    out[k] = [p[0] + (v[0] - p[0]) * u, p[1] + (v[1] - p[1]) * u];
  }
  return out;
}

/** An arrowhead at b, pointing along a → b. */
function arrowHead(a: Pt, b: Pt, size = 3.2): string {
  const t = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const h = (s: number): Pt => [b[0] - size * Math.cos(t + s), b[1] - size * Math.sin(t + s)];
  return `${seg(b, h(0.5))} ${seg(b, h(-0.5))}`;
}

/** An arrow from a to b, with its head at b. */
const arrow = (a: Pt, b: Pt) => `${seg(a, b)} ${arrowHead(a, b)}`;

export function ShotStory({ story }: { story: Story }) {
  const still = useReducedMotion();
  const steps = useMemo(() => timeline(story), [story]);
  const cycle = steps.reduce((t, x) => t + x.dur, 0);
  const holdStart = (i: number) => steps.find((x) => "hold" in x && x.hold === i)!.start;

  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.4 });
  const auto = playing && inView && !still;
  const clockRef = useRef(0);

  // One clock for the whole explainer; it runs only while playing and on screen.
  useEffect(() => {
    if (!auto) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clockRef.current = (clockRef.current + (now - last) / 1000) % cycle;
      last = now;
      setClock(clockRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, cycle]);

  const jump = (i: number) => {
    clockRef.current = holdStart(i) + 0.001;
    setClock(clockRef.current);
  };

  // Where the clock is: a held moment, or the motion between two.
  const step = steps.find((x) => clock >= x.start && clock < x.start + x.dur) ?? steps[0]!;
  const held = "hold" in step ? step.hold : null;
  let fi: number;
  if ("hold" in step) fi = story.moments[step.hold] ?? 0;
  else fi = step.from + Math.min(1, (clock - step.start) / step.dur) * (step.to - step.from);
  // The caption shows the moment held, or the one being played toward.
  const scene = held ?? Math.min(3, steps.filter((x) => "hold" in x && x.start <= clock).length);
  const i0 = Math.floor(fi);
  const pose = lerpPose(story.poses[i0]!, story.poses[Math.min(story.poses.length - 1, i0 + 1)]!, fi - i0);
  const heldPoses = story.moments.map((m) => story.poses[m]!);

  const view = useMemo(() => {
    const pts = story.poses.flatMap((p) => [p.head, p.fa, p.ba, p.ftoe, p.btoe, p.fs, p.bs, p.fw, p.bw]);
    const x0 = Math.min(...pts.map((q) => q[0])) - 30;
    const x1 = Math.max(...pts.map((q) => q[0])) + 44;
    const y0 = Math.min(...pts.map((q) => q[1])) - 30;
    return { x0, x1, y0, y1: 113 };
  }, [story]);
  const { x0, x1, y0, y1 } = view;
  const s = SCENES[scene]!;
  // Progress through the cycle, per moment (hold plus the motion that follows it).
  const segs = SCENES.map((_, i) => {
    const from = holdStart(i);
    const to = i < 3 ? holdStart(i + 1) : cycle;
    return Math.max(0, Math.min(1, (clock - from) / (to - from)));
  });

  return (
    <div ref={box} className="lesson-card">
      {/* chapter progress, like a video's chapter markers */}
      <div className="flex gap-1.5 px-4 pt-4" aria-hidden>
        {SCENES.map((x, i) => (
          <span key={x.k} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${(still ? (i <= scene ? 1 : 0) : segs[i]!) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} className="block w-full" role="img" aria-label={`${s.k}: ${s.t}`}>
          <FigureDefs id="story" />
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--ill-paper)" />
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} filter="url(#story-grain)" />
          <ellipse cx={(pose.fa[0] + pose.ba[0]) / 2} cy={101.6} rx={Math.abs(pose.fa[0] - pose.ba[0]) / 2 + 10} ry={2} fill="var(--ill-ink)" opacity={0.08} />
          <path d={`M${x0 + 4} 101.2 Q ${(x0 + x1) / 2} 100.4 ${x1 - 4} 101.4`} stroke="var(--ill-chalk)" strokeWidth={0.7} fill="none" opacity={0.55} />
          <BatterFigure p={pose} />
          {held !== null && (
            <g key={`${held}-${Math.floor(clock / cycle)}`}>
              <SceneNotes n={held} p={heldPoses[held]!} poses={heldPoses} />
            </g>
          )}
        </svg>
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <motion.div key={scene} initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <p className="flex items-baseline gap-2 text-fg-subtle">
              <span className="text-4xl leading-none text-brand" style={{ fontFamily: "var(--font-hand), cursive" }}>{scene + 1}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.08em]">{s.k}</span>
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{s.t}</h3>
            <p className="mt-2 text-fg-muted">{s.d}</p>
          </motion.div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-brand-soft sm:h-9 sm:w-9"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>
              )}
            </button>
            {SCENES.map((x, i) => (
              <button
                key={x.k}
                type="button"
                onClick={() => jump(i)}
                aria-pressed={i === scene}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${i === scene ? "border-brand bg-brand-soft text-fg" : "border-line text-fg-muted hover:text-fg"}`}
              >
                <span className="hidden sm:inline">{i + 1} · </span>
                {x.k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** What each move is about, drawn on while the moment is held. */
function SceneNotes({ n, p, poses }: { n: number; p: FigurePose; poses: FigurePose[] }) {
  const T = 0.25;
  const ink = "var(--ill-chalk)";
  switch (n) {
    case 0: {
      const eye: Pt = [p.head[0] + 5, p.head[1] - 0.5];
      return (
        <g>
          <Draw d={seg(eye, [eye[0] + 26, eye[1]])} color={GOOD} w={1.3} dash="2.2 1.8" delay={T} />
          <Label at={[eye[0] + 27, eye[1] + 2.4]} text="eyes level" color={GOOD} anchor="start" delay={T + 0.6} />
          <Draw d={`M${p.ba[0]} 103 L${p.ba[0]} 109 M${p.ba[0]} 106 L${p.fa[0]} 106 M${p.fa[0]} 103 L${p.fa[0]} 109`} color={ink} w={1.2} delay={T + 0.5} />
          <Label at={[p.fa[0] + 4, 108.6]} text="feet apart" anchor="start" delay={T + 1.1} />
        </g>
      );
    }
    case 1: {
      const before = poses[0]!;
      const tip = (q: FigurePose): Pt => {
        const h = mid(q.fw, q.bw);
        if (!q.batH || !q.batT) return [q.fk[0] + 5, q.fa[1] - 4];
        const dx = q.batT[0] - q.batH[0];
        const dy = q.batT[1] - q.batH[1];
        const L = Math.hypot(dx, dy) || 1;
        return [h[0] + (dx / L) * 48, h[1] + (dy / L) * 48];
      };
      const a = tip(before);
      const b = tip(p);
      const c: Pt = [Math.min(a[0], b[0]) - 14, (a[1] + b[1]) / 2];
      const head = p.head;
      return (
        <g>
          <Draw d={`M${a[0].toFixed(2)} ${a[1].toFixed(2)} Q ${c[0].toFixed(2)} ${c[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`} color={ZONE} w={1.4} dash="2.4 2" delay={T} />
          <Draw d={arrowHead(c, b)} color={ZONE} w={1.4} delay={T + 0.8} />
          <Label at={[b[0] + 7, b[1] - 2]} text="bat up straight" color={ZONE} anchor="start" delay={T + 0.7} />
          <Draw d={seg([head[0] - 9, head[1] - 9], [head[0] + 9, head[1] - 9])} color={GOOD} w={1.2} dash="2 1.6" delay={T + 0.4} />
          <Label at={[head[0], head[1] - 11.5]} text="eyes level" color={GOOD} delay={T + 1} />
        </g>
      );
    }
    case 2: {
      const before = poses[1]!;
      const h0: Pt = [before.head[0], before.head[1] - 10];
      const h1: Pt = [p.head[0] + 1, p.head[1] - 10];
      const f0: Pt = [before.fa[0] + 2, 106];
      const f1: Pt = [p.fa[0] + 4, 106];
      return (
        <g>
          <Draw d={arrow(h0, h1)} color={GOOD} w={1.5} delay={T} />
          <Label at={[h1[0] + 3, h1[1] + 1]} text="head leads" color={GOOD} anchor="start" delay={T + 0.6} />
          <Draw d={arrow(f0, f1)} color={ink} w={1.3} delay={T + 0.7} />
          <Label at={[f1[0] + 3, 108.4]} text="foot follows" anchor="start" delay={T + 1.3} />
        </g>
      );
    }
    default: {
      const hands = mid(p.fw, p.bw);
      return (
        <g>
          <Zone x0={p.fk[0] - 4} x1={p.fk[0] + 5} y0={p.head[1] - 8} y1={p.fk[1]} delay={T} />
          <Draw d={seg([p.head[0] + 1, p.head[1] + 7], [p.head[0] + 1, p.fk[1]])} color={GOOD} w={1.3} dash="2.2 1.8" delay={T + 0.2} />
          <Label at={[p.head[0] + 1, p.head[1] - 10]} text="head over front knee" color={GOOD} delay={T + 0.8} />
          <Draw d={arrow([hands[0] + 14, hands[1] - 9], [hands[0] + 4.5, hands[1] - 2.5])} color={ink} w={1.1} delay={T + 1.1} />
          <Label at={[hands[0] + 15, hands[1] - 10.5]} text="soft hands" anchor="start" delay={T + 1.4} />
        </g>
      );
    }
  }
}
