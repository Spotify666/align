"use client";
// "Learn the shot": a defence taught as one movement in four stages. One batter (a two-tone
// pictogram) plays the textbook shot in its own continuous motion, slowed down like a replay
// and held at each stage, where the points to copy draw themselves on. Under the feet, a dot
// shows where the weight is all the way through; under the picture, the four stage poses sit
// in a row, joined in order, so the sequence can be read at a glance and any stage replayed.
// A left-handed batter sees the same lesson as a mirror image, the labels still reading
// left to right.

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Ball, BatterFigure, batLine, grip, INK, mid, PAPER, Stumps, type FigurePose, type Pt } from "@/components/lesson/figure";
import { arc, Draw, seg } from "@/components/lesson/lesson";
import type { Story } from "@/components/lesson/pose";
import { loadProfile } from "@/lib/store";

export type StoryShot = "front" | "back";

interface Scene {
  /** The stage's short name (the strip under the picture). */
  k: string;
  /** What to do, in a few words. */
  t: string;
  /** How, in a sentence or two. */
  d: string;
  /** The points to copy, as the picture marks them. */
  copy: string[];
}

const SET_UP: Scene = {
  k: "Set up",
  t: "Side-on, knees soft, eyes level.",
  d: "Feet about shoulder-width apart, weight even on the balls of both feet. Both hands near the top of the handle, the top hand above the bottom hand, the bat resting by the back toe. Stay still as the bowler runs in.",
  copy: ["Feet shoulder-width apart", "Top hand above bottom hand", "Knees slightly bent", "Eyes level, head still"],
};

const SCENES: Record<StoryShot, Scene[]> = {
  front: [
    SET_UP,
    {
      k: "Pick up",
      t: "Bat up straight, head leads.",
      d: "As the ball is bowled, the bat lifts straight back toward the stumps. The head and front shoulder start toward the line of the ball; the feet have not moved yet.",
      copy: ["Bat lifts straight back", "Head moves first, eyes level", "Weight still even"],
    },
    {
      k: "Stride",
      t: "Step to the pitch of the ball.",
      d: "The front foot follows the head and lands where the ball will bounce. The front knee bends as the weight comes onto it, and the bat starts down from the top, slowly.",
      copy: ["Front foot to the ball", "Front knee bends", "Weight moves forward"],
    },
    {
      k: "Contact",
      t: "Meet it under your eyes.",
      d: "Head, front knee and front toe in one line. The bat comes down beside the pad, angled down with the handle ahead. The top hand guides it; the bottom hand stays loose, so the ball drops dead. Hold it.",
      copy: ["Head over the front knee", "Bat angled down beside the pad", "Back leg long, heel up"],
    },
  ],
  back: [
    SET_UP,
    {
      k: "Back and across",
      t: "Back foot first: back and across.",
      d: "To a short ball, the back foot moves first, back toward the stumps and across into the line of the ball. The bat picks up; the head stays still and forward.",
      copy: ["Back foot back and across", "Head still, eyes level", "Bat picks up"],
    },
    {
      k: "Alongside",
      t: "Front foot alongside, stand tall.",
      d: "The front foot slides back next to the back foot. Stand tall and side-on, the weight on the back foot, the head forward over it.",
      copy: ["Front foot alongside", "Stand tall, side-on", "Weight back, head forward"],
    },
    {
      k: "Contact",
      t: "Meet it under your eyes.",
      d: "Front elbow high, the bat straight and angled down, the top hand in control and the bottom hand loose. Meet the ball under your eyes, close to the body, then hold.",
      copy: ["Front elbow high", "Bat straight, angled down", "Soft hands, no push"],
    },
  ],
};

export type BattingHand = "right" | "left";

// Which batter the explainers show: chosen once, shared by every explainer on the page and
// remembered on this device; until chosen, the hand in the profile (right by default).
const HAND_KEY = "align.demo.hand";
const handListeners = new Set<() => void>();
let handNow: BattingHand | null = null;
function readHand(): BattingHand {
  try {
    const v = localStorage.getItem(HAND_KEY);
    if (v === "left" || v === "right") return v;
  } catch {
    /* storage unavailable */
  }
  return loadProfile().handedness;
}
function setHand(h: BattingHand) {
  handNow = h;
  try {
    localStorage.setItem(HAND_KEY, h);
  } catch {
    /* private mode: the choice lasts for this page */
  }
  handListeners.forEach((l) => l());
}
function useBattingHand(): BattingHand {
  return useSyncExternalStore(
    (cb) => {
      handListeners.add(cb);
      return () => handListeners.delete(cb);
    },
    () => (handNow ??= readHand()),
    () => "right",
  );
}

/** The picture's width (labels stay inside it) and whether it is mirrored (left-hander). */
const View = createContext({ x0: -Infinity, x1: Infinity, flip: false });

/** Average width of a label character (the hand-lettered face at 7.5). */
const CH = 3.35;

/**
 * A hand-lettered label, ink on a paper halo, drawn on after `delay`. "\n" breaks a line.
 * It is moved in, if need be, to stay inside the picture; in a mirrored picture it sits
 * where the mirror puts it but still reads left to right.
 */
function Tag({ at, text, anchor = "middle", delay = 1.1 }: { at: Pt; text: string; anchor?: "start" | "middle" | "end"; delay?: number }) {
  const v = useContext(View);
  const still = useReducedMotion();
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => l.length)) * CH;
  const left0 = anchor === "start" ? at[0] : anchor === "end" ? at[0] - w : at[0] - w / 2;
  const left = Math.max(v.x0 + 1.5, Math.min(v.x1 - 1.5 - w, left0));
  const ax = anchor === "start" ? left : anchor === "end" ? left + w : left + w / 2;
  const a = v.flip && anchor !== "middle" ? (anchor === "start" ? "end" : "start") : anchor;
  const label = (
    <motion.text
      x={ax}
      y={at[1]}
      textAnchor={a}
      fill="var(--ill-chalk)"
      fontSize={7.5}
      fontWeight={700}
      style={{ fontFamily: "var(--font-hand), cursive", paintOrder: "stroke", stroke: "var(--ill-paper)", strokeWidth: 2.2, strokeLinejoin: "round" }}
      initial={still ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay }}
    >
      {lines.map((l, i) => (
        <tspan key={i} x={ax} dy={i ? "1.05em" : 0}>
          {l}
        </tspan>
      ))}
    </motion.text>
  );
  return v.flip ? <g transform={`matrix(-1 0 0 1 ${2 * ax} 0)`}>{label}</g> : label;
}

// The timeline, in seconds on screen: hold each stage, then play on to the next in slow
// motion (the stroke itself lasts a fifth of a second; real speed would be a blink).
const HOLD = 4.4;
type Step = { hold: number } | { from: number; to: number; speed: number };

function timeline(s: Story): Array<Step & { start: number; dur: number }> {
  const [a, b, c, d] = s.moments;
  const end = s.poses.length - 1;
  const steps: Step[] = [
    { hold: 0 },
    { from: a, to: b, speed: 0.45 },
    { hold: 1 },
    { from: b, to: c, speed: 0.2 },
    { hold: 2 },
    { from: c, to: d, speed: 0.2 },
    { hold: 3 },
    { from: d, to: end, speed: 0.35 },
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

/**
 * Where the weight is, along the ground: the body's centre of mass from its segments'
 * masses (Dempster's proportions: head 8%, trunk 50%, arms 10%, thighs 20%, shins and
 * feet 12%).
 */
function weightAt(p: FigurePose): number {
  const hip = mid(p.fh, p.bh)[0];
  const sh = mid(p.fs, p.bs)[0];
  const hands = mid(p.fw, p.bw)[0];
  const thigh = (h: Pt, k: Pt) => h[0] + (k[0] - h[0]) * 0.43;
  const shin = (k: Pt, a: Pt) => (k[0] + a[0]) / 2;
  return 0.081 * p.head[0] + 0.497 * (hip + sh) / 2 + 0.1 * (sh + hands) / 2 + 0.1 * thigh(p.fh, p.fk) + 0.1 * thigh(p.bh, p.bk) + 0.061 * shin(p.fk, p.fa) + 0.061 * shin(p.bk, p.ba);
}

/** The weight between the feet: a track from the back foot to the front foot, the dot on it. */
function WeightTrack({ p }: { p: FigurePose }) {
  const { flip } = useContext(View);
  const y = 106.5;
  const [x0, x1] = [p.ba[0], p.fa[0]];
  const w = Math.max(Math.min(x0, x1) - 2, Math.min(Math.max(x0, x1) + 2, weightAt(p)));
  return (
    <g>
      <path d={`${seg([x0, y], [x1, y])} ${seg([x0, y - 1.6], [x0, y + 1.6])} ${seg([x1, y - 1.6], [x1, y + 1.6])}`} stroke={INK} strokeWidth={0.7} fill="none" />
      <circle cx={w} cy={y} r={2.1} fill={INK} stroke={PAPER} strokeWidth={0.8} />
      <text x={w} y={y + 6.2} textAnchor="middle" fontSize={4.4} fill={INK} transform={flip ? `matrix(-1 0 0 1 ${2 * w} 0)` : undefined} style={{ fontFamily: "var(--font-hand), cursive" }}>
        weight
      </text>
    </g>
  );
}

const eyeOf = (p: FigurePose): Pt => [p.head[0] + 4.4, p.head[1] + 0.6];
const batTip = (p: FigurePose): Pt => batLine(p)[1];
const deg = (a: Pt, c: Pt, b: Pt) => {
  const t = Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]);
  let d = Math.abs((t * 180) / Math.PI);
  if (d > 180) d = 360 - d;
  return Math.round(d);
};

export function ShotStory({ story, shot = "front" }: { story: Story; shot?: StoryShot }) {
  const scenes = SCENES[shot];
  const hand = useBattingHand();
  const flip = hand === "left";
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

  // One clock for the whole explainer; it runs only while playing and on screen. It
  // redraws at most 25 times a second while the batter moves, and only the progress bars
  // (4 a second) while a stage is held: phones stay smooth.
  useEffect(() => {
    if (!auto) return;
    let raf = 0;
    let last = performance.now();
    let drawnAt = 0;
    const tick = (now: number) => {
      clockRef.current = (clockRef.current + (now - last) / 1000) % cycle;
      last = now;
      const c = clockRef.current;
      const st = steps.find((x) => c >= x.start && c < x.start + x.dur);
      const every = st && "hold" in st ? 250 : 40;
      if (now - drawnAt >= every) {
        drawnAt = now;
        setClock(c);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, cycle, steps]);

  const jump = (i: number) => {
    clockRef.current = holdStart(i) + 0.001;
    setClock(clockRef.current);
  };

  // Where the clock is: a held stage, or the motion between two.
  const step = steps.find((x) => clock >= x.start && clock < x.start + x.dur) ?? steps[0]!;
  const held = "hold" in step ? step.hold : null;
  let fi: number;
  if ("hold" in step) fi = story.moments[step.hold] ?? 0;
  else fi = step.from + Math.min(1, (clock - step.start) / step.dur) * (step.to - step.from);
  // The caption shows the stage held, or the one being played toward.
  const scene = held ?? Math.min(3, steps.filter((x) => "hold" in x && x.start <= clock).length);
  const poseAt = (x: number) => {
    const c = Math.max(0, Math.min(story.poses.length - 1, x));
    const i0 = Math.floor(c);
    return lerpPose(story.poses[i0]!, story.poses[Math.min(story.poses.length - 1, i0 + 1)]!, c - i0);
  };
  const pose = poseAt(fi);
  const ballFrom = pose.ball ? poseAt(fi - 1.5).ball : undefined;
  const stumps = story.poses[0]!.stumps;
  // The drawing changes only when the batter does (not on every progress tick).
  const fKey = Math.round(fi * 4);
  const figure = useMemo(
    () => (
      <>
        {stumps && <Stumps at={stumps} />}
        <BatterFigure p={pose} />
        {pose.ball && <Ball at={pose.ball} from={ballFrom} />}
        <WeightTrack p={pose} />
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the pose position
    [fKey, flip],
  );
  const stagePoses = story.moments.map((m) => story.poses[m]!);

  const view = useMemo(() => {
    const pts = story.poses.flatMap((p) => [p.head, p.fa, p.ba, p.ftoe, p.btoe, p.fs, p.bs, p.fw, p.bw, batTip(p)]);
    const st = story.poses[0]!.stumps;
    const x0 = Math.min(...pts.map((q) => q[0]), st ? st[0] - 8 : Infinity) - 18;
    const x1 = Math.max(...pts.map((q) => q[0])) + 46;
    const y0 = Math.min(...pts.map((q) => q[1])) - 22;
    return { x0, x1, y0, y1: 122 };
  }, [story]);
  const { x0, x1, y0, y1 } = view;
  const viewCtx = useMemo(() => ({ x0, x1, flip }), [x0, x1, flip]);
  const s = scenes[scene]!;
  // Progress through the cycle, per stage (hold plus the motion that follows it).
  const segs = scenes.map((_, i) => {
    const from = holdStart(i);
    const to = i < 3 ? holdStart(i + 1) : cycle;
    return Math.max(0, Math.min(1, (clock - from) / (to - from)));
  });

  return (
    <div ref={box} className="lesson-card">
      <div className="flex items-center justify-end gap-2 px-3 pt-3 sm:px-4">
        <span className="text-xs text-fg-subtle" id={`${shot}-hand`}>
          Batter
        </span>
        <div role="radiogroup" aria-labelledby={`${shot}-hand`} className="inline-flex rounded-full border border-line-strong p-0.5 text-xs">
          {(["right", "left"] as const).map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={hand === h}
              onClick={() => setHand(h)}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${hand === h ? "bg-brand text-brand-fg" : "text-fg-muted hover:text-fg"}`}
            >
              {h === "right" ? "Right-handed" : "Left-handed"}
            </button>
          ))}
        </div>
      </div>
      {/* stage progress, like a video's chapter markers */}
      <div className="flex gap-1.5 px-4 pt-3" aria-hidden>
        {scenes.map((x, i) => (
          <span key={x.k} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${(still ? (i <= scene ? 1 : 0) : segs[i]!) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <svg
          viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
          className="paper-grain block w-full [contain:paint]"
          role="img"
          aria-label={`Stage ${scene + 1}, ${s.k}: ${s.t} (${hand}-handed batter)`}
        >
          <View.Provider value={viewCtx}>
            <g transform={flip ? `matrix(-1 0 0 1 ${x0 + x1} 0)` : undefined}>
              {figure}
              {held !== null && (
                <g key={`${held}-${hand}-${Math.floor(clock / cycle)}`}>
                  {shot === "front" ? <FrontNotes n={held} poses={stagePoses} hand={hand} /> : <BackNotes n={held} poses={stagePoses} hand={hand} />}
                </g>
              )}
            </g>
          </View.Provider>
        </svg>
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <motion.div key={`${shot}-${scene}`} initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
            <p className="text-sm text-fg-subtle">
              Stage {scene + 1} of 4 · {s.k}
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{s.t}</h3>
            <p className="mt-2 text-fg-muted">{s.d}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {s.copy.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-fg" />
                  {c}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
      {/* The four stages in order: one movement. Tap a stage to replay it. */}
      <div className="flex items-center gap-2 border-t border-line px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-tint"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>
          )}
        </button>
        <ol className="grid flex-1 grid-cols-4 gap-1.5" aria-label="The four stages">
          {stagePoses.map((p, i) => (
            <li key={i} className="relative">
              {i > 0 && (
                <span aria-hidden className="absolute -left-[0.55rem] top-[38%] text-xs text-fg-subtle">
                  ›
                </span>
              )}
              <button
                type="button"
                onClick={() => jump(i)}
                aria-pressed={i === scene}
                aria-label={`Stage ${i + 1}: ${scenes[i]!.k}`}
                className={`flex w-full flex-col items-center rounded-xl border px-1 pb-1.5 pt-1 transition-colors ${i === scene ? "border-fg" : "border-line hover:border-line-strong"}`}
              >
                <StagePose p={p} flip={flip} />
                <span className={`mt-0.5 text-center text-[0.68rem] leading-tight sm:text-xs ${i === scene ? "font-semibold text-fg" : "text-fg-muted"}`}>
                  {i + 1}. {scenes[i]!.k}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** One stage's pose, small, framed on the batter (the strip under the picture). */
function StagePose({ p, flip }: { p: FigurePose; flip: boolean }) {
  const pts = [p.head, p.fa, p.ba, p.ftoe, p.btoe, p.fw, p.bw, batTip(p)];
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const [x0, x1] = [Math.min(...xs) - 6, Math.max(...xs) + 6];
  const [ya, yb] = [Math.min(...ys) - 8, 104];
  const w = Math.max(x1 - x0, (yb - ya) * 0.9);
  const cx = (x0 + x1) / 2;
  return (
    <svg viewBox={`${cx - w / 2} ${ya} ${w} ${yb - ya}`} className="paper-grain block aspect-[0.9] w-full rounded-lg" aria-hidden>
      <g transform={flip ? `matrix(-1 0 0 1 ${2 * cx} 0)` : undefined}>
        <BatterFigure p={p} />
      </g>
    </svg>
  );
}

/* ---------- the points to copy, drawn on while a stage is held ---------- */

const T = 0.25;

/** The grip: which hand is on top (the front arm's) and which below, a gap between them. */
function GripNotes({ p, hand, delay }: { p: FigurePose; hand: BattingHand; delay: number }) {
  const g = grip(p);
  if (!g) return null;
  const [topHand, bottomHand] = hand === "right" ? ["left", "right"] : ["right", "left"];
  const x = Math.max(g.top[0], g.bottom[0]) + 16;
  // Two-line labels, the top one well above the bottom one and both clear of the knee.
  const yt = Math.min(g.top[1], g.bottom[1]) - 11;
  const yb = yt + 17;
  const edge = (q: Pt): Pt => [q[0] + 2.6, q[1]];
  return (
    <g>
      <Draw d={`${seg(edge(g.top), [x - 1.5, yt - 2])} ${seg(edge(g.bottom), [x - 1.5, yb - 2])}`} color={INK} w={0.9} delay={delay} />
      <Tag at={[x, yt]} text={`top hand\n(${topHand})`} anchor="start" delay={delay + 0.3} />
      <Tag at={[x, yb]} text={`bottom hand\n(${bottomHand})`} anchor="start" delay={delay + 0.5} />
    </g>
  );
}

function SetUpNotes({ p, hand }: { p: FigurePose; hand: BattingHand }) {
  const eye = eyeOf(p);
  const knee = arc(p.fk, p.fh, p.fa, 6);
  return (
    <g>
      <Draw d={seg(eye, [eye[0] + 24, eye[1]])} color={INK} w={1.2} dash="2.2 1.8" delay={T} />
      <Tag at={[eye[0] + 25, eye[1] + 2.4]} text="eyes level" anchor="start" delay={T + 0.6} />
      <GripNotes p={p} hand={hand} delay={T + 0.8} />
      <Draw d={knee.d} color={INK} w={1.2} delay={T + 1.2} />
      <Tag at={[p.fk[0] + 8, p.fk[1] + 5]} text="knees soft" anchor="start" delay={T + 1.6} />
      <Draw d={`M${p.ba[0]} 102 L${p.ba[0]} 104.5 M${p.fa[0]} 102 L${p.fa[0]} 104.5`} color={INK} w={1.1} delay={T + 1.8} />
      <Tag at={[p.fa[0] + 4, 103.6]} text="shoulder-width" anchor="start" delay={T + 2.1} />
    </g>
  );
}

function FrontNotes({ n, poses, hand }: { n: number; poses: FigurePose[]; hand: BattingHand }) {
  const p = poses[n]!;
  switch (n) {
    case 0:
      return <SetUpNotes p={p} hand={hand} />;
    case 1: {
      const before = poses[0]!;
      const a = batTip(before);
      const b = batTip(p);
      const c: Pt = [Math.min(a[0], b[0]) - 14, (a[1] + b[1]) / 2];
      const eye = eyeOf(p);
      return (
        <g>
          <Draw d={`M${a[0].toFixed(2)} ${a[1].toFixed(2)} Q ${c[0].toFixed(2)} ${c[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`} color={INK} w={1.3} dash="2.4 2" delay={T} />
          <Draw d={arrowHead(c, b)} color={INK} w={1.3} delay={T + 0.8} />
          <Tag at={[b[0] + 6, b[1] - 1]} text={"bat up,\nstraight back"} anchor="start" delay={T + 0.7} />
          <Draw d={seg(eye, [eye[0] + 22, eye[1]])} color={INK} w={1.2} dash="2.2 1.8" delay={T + 0.5} />
          <Tag at={[eye[0] + 23, eye[1] + 2.4]} text={"head leads,\neyes level"} anchor="start" delay={T + 1.1} />
        </g>
      );
    }
    case 2: {
      const before = poses[1]!;
      const h0: Pt = [before.head[0], before.head[1] - 10];
      const h1: Pt = [p.head[0] + 1, p.head[1] - 10];
      const f0: Pt = [before.fa[0] + 2, 109];
      const f1: Pt = [p.fa[0] + 4, 109];
      const knee = arc(p.fk, p.fh, p.fa, 7);
      return (
        <g>
          <Draw d={arrow(h0, h1)} color={INK} w={1.4} delay={T} />
          <Tag at={[h1[0] + 3, h1[1] + 1]} text={"head and\nshoulder lead"} anchor="start" delay={T + 0.6} />
          <Draw d={knee.d} color={INK} w={1.4} delay={T + 0.7} />
          <Tag at={[p.fk[0] + 9, p.fk[1] + 1]} text={`front knee\nbends (${deg(p.fh, p.fk, p.fa)}°)`} anchor="start" delay={T + 1.1} />
          <Draw d={arrow(f0, f1)} color={INK} w={1.2} delay={T + 1.2} />
          <Tag at={[f1[0] + 3, 119.5]} text="foot to the ball" anchor="start" delay={T + 1.6} />
        </g>
      );
    }
    default: {
      const eye = eyeOf(p);
      const [hands, tip] = batLine(p);
      const down: Pt = [hands[0], hands[1] + 16];
      const along: Pt = [hands[0] + ((tip[0] - hands[0]) / 48) * 16, hands[1] + ((tip[1] - hands[1]) / 48) * 16];
      const wedge = arc(hands, down, along, 10);
      const ball = p.ball;
      return (
        <g>
          {/* the line: head, front knee, front toe */}
          <Draw d={seg([p.head[0], p.head[1] - 9], p.ftoe)} color={INK} w={1.2} dash="2.2 1.8" delay={T} />
          {[p.head, p.fk, p.ftoe].map((q, i) => (
            <motion.circle key={i} cx={q[0]} cy={q[1]} r={1.6} fill={PAPER} stroke={INK} strokeWidth={0.8} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T + 0.3 + i * 0.15 }} />
          ))}
          <Tag at={[p.head[0] - 2, p.head[1] - 11]} text="head, knee, toe: one line" anchor="middle" delay={T + 0.7} />
          <Draw d={`${seg(hands, down)} ${wedge.d}`} color={INK} w={1} dash="1.6 1.4" delay={T + 0.9} />
          <Tag at={[hands[0] + 12, hands[1] + 4]} text={`bat angled\ndown (${deg(down, hands, along)}°)`} anchor="start" delay={T + 1.3} />
          {ball && <Draw d={seg(eye, ball)} color={INK} w={0.9} dash="1.4 1.6" delay={T + 1.5} />}
          {ball && <Tag at={[ball[0] + 5, ball[1] + 1]} text={"under\nyour eyes"} anchor="start" delay={T + 1.9} />}
          <Tag at={[p.bheel[0] - 1, p.bheel[1] - 14]} text={"back leg long,\nheel up"} anchor="middle" delay={T + 2.2} />
        </g>
      );
    }
  }
}

function BackNotes({ n, poses, hand }: { n: number; poses: FigurePose[]; hand: BattingHand }) {
  const p = poses[n]!;
  switch (n) {
    case 0:
      return <SetUpNotes p={p} hand={hand} />;
    case 1: {
      const before = poses[0]!;
      const b0: Pt = [before.ba[0] + 1, 109];
      const b1: Pt = [p.ba[0] - 1, 109];
      const eye = eyeOf(p);
      return (
        <g>
          <Draw d={arrow(b0, b1)} color={INK} w={1.4} delay={T} />
          <Tag at={[b1[0] - 2, 119.5]} text="back foot back and across" anchor="start" delay={T + 0.6} />
          <motion.circle cx={before.head[0]} cy={before.head[1]} r={8.4} fill="none" stroke={INK} strokeWidth={0.9} strokeDasharray="1.8 1.6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T + 0.8 }} />
          <Draw d={seg(eye, [eye[0] + 22, eye[1]])} color={INK} w={1.2} dash="2.2 1.8" delay={T + 1} />
          <Tag at={[eye[0] + 23, eye[1] + 2.4]} text={"head still,\neyes level"} anchor="start" delay={T + 1.4} />
        </g>
      );
    }
    case 2: {
      const before = poses[1]!;
      const f0: Pt = [before.fa[0] + 2, 109];
      const f1: Pt = [p.fa[0] + 2, 109];
      const x = Math.min(p.ba[0], p.bheel[0], p.bs[0], p.bh[0]) - 7;
      const top = p.head[1] - 6;
      return (
        <g>
          <Draw d={arrow(f0, f1)} color={INK} w={1.4} delay={T} />
          <Tag at={[f1[0] - 2, 119.5]} text="front foot alongside" anchor="start" delay={T + 0.6} />
          <Draw d={`${arrow([x, 101], [x, top])} ${seg([x - 1.6, 101], [x + 1.6, 101])}`} color={INK} w={1.2} delay={T + 0.8} />
          <Tag at={[x - 3, top + 14]} text="stand tall" anchor="end" delay={T + 1.2} />
          <Draw d={seg([p.head[0], p.head[1] + 8], [p.head[0], 101])} color={INK} w={1} dash="2 1.8" delay={T + 1.3} />
          <Tag at={[p.head[0] + 9, p.head[1] - 7]} text={"head forward,\nweight back"} anchor="start" delay={T + 1.7} />
        </g>
      );
    }
    default: {
      const eye = eyeOf(p);
      const [hands, tip] = batLine(p);
      const down: Pt = [hands[0], hands[1] + 16];
      const along: Pt = [hands[0] + ((tip[0] - hands[0]) / 48) * 16, hands[1] + ((tip[1] - hands[1]) / 48) * 16];
      const wedge = arc(hands, down, along, 10);
      const ball = p.ball;
      return (
        <g>
          <motion.circle cx={p.fe[0]} cy={p.fe[1]} r={3.4} fill="none" stroke={INK} strokeWidth={1} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T }} />
          <Tag at={[p.fe[0] + 5, p.fe[1] - 9]} text={"front elbow\nhigh"} anchor="start" delay={T + 0.4} />
          <Draw d={`${seg(hands, down)} ${wedge.d}`} color={INK} w={1} dash="1.6 1.4" delay={T + 0.7} />
          <Tag at={[hands[0] + 10, hands[1] + 21]} text={`straight bat,\nangled (${deg(down, hands, along)}°)`} anchor="start" delay={T + 1.1} />
          {ball && <Draw d={seg(eye, ball)} color={INK} w={0.9} dash="1.4 1.6" delay={T + 1.3} />}
          {ball && <Tag at={[ball[0] + 5, ball[1] + 6]} text={"under\nyour eyes"} anchor="start" delay={T + 1.7} />}
        </g>
      );
    }
  }
}
