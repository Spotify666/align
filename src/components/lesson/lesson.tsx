"use client";
// "Your lesson": each graded check as an illustrated chapter, like an animated explainer.
// The batter is redrawn from this shot's own pose, the textbook position sits behind as a
// dashed outline, and the one thing the check is about draws itself on as it scrolls into
// view, with two plain sentences underneath.

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { AnalysisPayload, CaptureObservation, Metric } from "@/engine/types";
import { coachingFor } from "@/engine/coaching";
import { plainReading, plainValue } from "@/engine/plain";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { ffdScript } from "@/engine/fixtures/index";
import { alignAt, BatterFigure, FigureDefs, figurePose, GhostFigure, GOOD, mid, OFF, ZONE, type FigurePose, type GhostPart, type Pt } from "./figure";

const ORDER = ["line_head", "line_shoulder", "line_knee", "front_knee_flexion", "foot_spread", "stride_length", "trunk_inclination", "weight_forward", "hands_ahead_of_knee", "back_knee_extension"];

const CHAPTER: Record<string, string> = {
  line_head: "The line: your head",
  line_shoulder: "The line: your front shoulder",
  line_knee: "The line: your front knee",
  front_knee_flexion: "The front knee",
  foot_spread: "The stride",
  stride_length: "The stride",
  trunk_inclination: "Leaning in",
  weight_forward: "Where the weight is",
  hands_ahead_of_knee: "The hands and the bat",
  back_knee_extension: "The back leg",
};

/** The part of the textbook outline each chapter compares against. */
const GHOST: Record<string, GhostPart[]> = {
  front_knee_flexion: ["front_leg"],
  back_knee_extension: ["back_leg"],
  line_head: ["head"],
  line_shoulder: ["trunk"],
  line_knee: ["front_leg"],
  foot_spread: ["stride"],
  stride_length: ["stride"],
  trunk_inclination: ["trunk", "head"],
  hands_ahead_of_knee: ["hands"],
  weight_forward: [],
};

const textbookCache: Partial<Record<"right" | "left", FigurePose | null>> = {};
/** The textbook defence at contact, from the same generator the engine is validated on. */
function textbook(hand: "right" | "left"): FigurePose | null {
  if (!(hand in textbookCache)) {
    const spec = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!.options;
    const o = generate({ ...spec, script: ffdScript(), photoAtContact: true, withBall: false, handedness: hand, id: `textbook_${hand}` } as never);
    textbookCache[hand] = figurePose(o.body[0]!, o.media.width / o.media.height, hand);
  }
  return textbookCache[hand] ?? null;
}

const frameOf = (m: Metric) => {
  const f = m.evidenceIds.map((id) => /^frame_(\d+)$/.exec(id)?.[1]).find(Boolean);
  return f !== undefined ? Number(f) : null;
};

export function Lesson({ payload: p, obs }: { payload: AnalysisPayload; obs: CaptureObservation }) {
  const hand = p.handedness ?? obs.athlete.handedness;
  const aspect = obs.media.width / obs.media.height;
  const side = p.camera_view !== "front_on" && p.camera_view !== "behind";
  const chapters = useMemo(() => {
    if (!side) return [];
    const fallback = p.position_check?.frame ?? p.events.find((e) => e.type === "contact")?.frame ?? 0;
    return ORDER.map((id) => p.metrics.find((m) => m.id === id))
      .filter((m): m is Metric => !!m && m.inRange !== null && m.value !== null)
      .map((m) => {
        const body = obs.body[frameOf(m) ?? fallback] ?? obs.body[fallback];
        const pose = body ? figurePose(body, aspect, hand) : null;
        return pose ? { m, pose } : null;
      })
      .filter((x): x is { m: Metric; pose: FigurePose } => !!x);
  }, [p, obs, aspect, hand, side]);
  const ghost = useMemo(() => textbook(hand), [hand]);
  if (!chapters.length) return null;

  return (
    <section aria-labelledby="lesson-h" className="space-y-4">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">Your lesson</p>
        <h2 id="lesson-h" className="display text-[1.75rem] sm:text-4xl">What this shot teaches you</h2>
        <p className="text-sm text-fg-subtle max-w-3xl">
          You, drawn from your {p.mode === "posture_screen" ? "photo" : "clip"}. Dashed gold: where the textbook defence puts it.
        </p>
      </header>
      <ol className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
        {chapters.map(({ m, pose }, i) => (
          <li key={m.id} className="w-[86%] shrink-0 snap-center sm:w-auto">
            <Chapter n={i + 1} of={chapters.length} m={m} pose={pose} ghost={ghost} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Chapter({ n, of, m, pose, ghost }: { n: number; of: number; m: Metric; pose: FigurePose; ghost: FigurePose | null }) {
  const ok = m.inRange === true;
  const entry = coachingFor(m.id);
  const side = m.range && m.value !== null ? (m.value < m.range.lo ? "low" : "high") : null;
  const cue = !ok && side && entry ? entry[side].cue : null;
  const g = ghost ? alignAt(ghost, pose.fa) : null;
  const id = `lesson-${m.id}`;
  // Frame the figure, the outline and room for labels.
  const pts = Object.values(pose).concat(g && (GHOST[m.id] ?? []).length ? Object.values(g) : []);
  // Labels sit mostly on the bowler's side (right): leave more room there.
  const x0 = Math.min(...pts.map((q) => q[0])) - 16;
  const x1 = Math.max(...pts.map((q) => q[0])) + 30;
  const y0 = Math.min(...pts.map((q) => q[1])) - 14;
  const y1 = 112;
  return (
    <article className="lesson-card h-full">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
          Chapter {n} <span className="font-normal">of {of}</span> · {CHAPTER[m.id] ?? m.name}
        </p>
        <span className={`chip ${ok ? "border-ok/50 text-ok" : "border-bad/50 text-bad"}`}>{ok ? "✓ In range" : "To work on"}</span>
      </div>
      <h3 className="px-4 pt-1 text-xl font-semibold tracking-tight">{plainReading(m)}</h3>
      <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} className="mt-2 block w-full" role="img" aria-label={`${m.name}: ${plainValue(m)}`}>
        <FigureDefs id={id} />
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--ill-paper)" />
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} filter={`url(#${id}-grain)`} />
        {/* ground */}
        <ellipse cx={(pose.fa[0] + pose.ba[0]) / 2} cy={101.5} rx={Math.abs(pose.fa[0] - pose.ba[0]) / 2 + 12} ry={2.2} fill="var(--ill-ink)" opacity={0.08} />
        <motion.path d={`M${x0 + 4} 101.2 Q ${(x0 + x1) / 2} 100.4 ${x1 - 4} 101.4`} stroke="var(--ill-chalk)" strokeWidth={0.7} fill="none" opacity={0.55} />
        <BatterFigure p={pose} id={id} />
        {g && <GhostFigure p={g} parts={GHOST[m.id] ?? []} />}
        <Annotation m={m} p={pose} />
      </svg>
      <div className="space-y-1.5 px-4 pb-4 pt-3 text-sm">
        <p>
          <span className="font-semibold">{m.name}: {plainValue(m)}</span>
          {m.range && <span className="text-fg-subtle"> · aim {rangeText(m)}</span>}
        </p>
        <p className="text-fg-muted">{m.relevance}</p>
        {cue && <p className="font-medium text-brand">Try: “{cue}”</p>}
      </div>
    </article>
  );
}

const rangeText = (m: Metric) => {
  const f = (v: number) => (m.unit === "× stature" || m.unit === "0–1" ? `${Math.round(v * 100)}%` : `${Math.round(v)}°`);
  return m.range ? `${f(m.range.lo)}–${f(m.range.hi)}` : "";
};

/* ---------- annotations: what each check is about, drawn on ---------- */

export function Draw({ d, color, w = 1.4, delay = 0.35, dash }: { d: string; color: string; w?: number; delay?: number; dash?: string }) {
  const still = useReducedMotion();
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={w}
      strokeLinecap="round"
      strokeDasharray={dash}
      initial={still ? false : { pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.9, delay, ease: "easeInOut" }}
    />
  );
}

export function Label({ at, text, color = "var(--ill-chalk)", delay = 1.1, anchor = "middle" }: { at: Pt; text: string; color?: string; delay?: number; anchor?: "start" | "middle" | "end" }) {
  const still = useReducedMotion();
  return (
    <motion.text
      x={at[0]}
      y={at[1]}
      textAnchor={anchor}
      fill={color}
      fontSize={7.5}
      fontWeight={700}
      style={{ fontFamily: "var(--font-hand), cursive", paintOrder: "stroke", stroke: "var(--ill-paper)", strokeWidth: 2.2, strokeLinejoin: "round" }}
      initial={still ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.5, delay }}
    >
      {text}
    </motion.text>
  );
}

export function Zone({ x0, x1, y0, y1, delay = 0.2 }: { x0: number; x1: number; y0: number; y1: number; delay?: number }) {
  const still = useReducedMotion();
  return (
    <motion.rect
      x={Math.min(x0, x1)}
      y={y0}
      width={Math.abs(x1 - x0)}
      height={y1 - y0}
      rx={1.5}
      fill={ZONE}
      initial={still ? false : { opacity: 0 }}
      whileInView={{ opacity: 0.22 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.6, delay }}
    />
  );
}

export const arc = (c: Pt, a: Pt, b: Pt, r: number) => {
  const ta = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const tb = Math.atan2(b[1] - c[1], b[0] - c[0]);
  let d = tb - ta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const p0: Pt = [c[0] + r * Math.cos(ta), c[1] + r * Math.sin(ta)];
  const p1: Pt = [c[0] + r * Math.cos(tb), c[1] + r * Math.sin(tb)];
  return { d: `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`, mid: [c[0] + (r + 7) * Math.cos(ta + d / 2), c[1] + (r + 7) * Math.sin(ta + d / 2)] as Pt };
};
export const seg = (a: Pt, b: Pt) => `M${a[0].toFixed(2)} ${a[1].toFixed(2)} L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;

function Annotation({ m, p }: { m: Metric; p: FigurePose }) {
  const color = m.inRange ? GOOD : OFF;
  const v = m.value!;
  const r = m.range;
  switch (m.id) {
    case "front_knee_flexion":
    case "back_knee_extension": {
      const front = m.id === "front_knee_flexion";
      const [h, k, a] = front ? [p.fh, p.fk, p.fa] : [p.bh, p.bk, p.ba];
      const ar = arc(k, h, a, 7);
      // A near-straight leg: no arc to draw, just the line of the leg.
      const straight = v > 172;
      return (
        <g>
          <Draw d={`${seg(h, k)} ${seg(k, a)}`} color={color} w={2} delay={0.2} />
          {!straight && <Draw d={ar.d} color={color} w={1.6} delay={0.7} />}
          <Label at={straight ? [k[0] - 9, k[1] - 3] : [ar.mid[0], ar.mid[1] + 2]} text={`${Math.round(v)}°`} color={color} />
        </g>
      );
    }
    case "line_head":
    case "line_shoulder":
    case "line_knee": {
      // The line rises from the front ankle; the part should sit on it (inside the band).
      const part = m.id === "line_head" ? p.head : m.id === "line_shoulder" ? p.fs : p.fk;
      const top = p.head[1] - 10;
      const word = m.id === "line_head" ? "head" : m.id === "line_shoulder" ? "front shoulder" : "front knee";
      const off = (part[0] - p.fa[0]) / 100;
      return (
        <g>
          {r && <Zone x0={p.fa[0] + r.lo * 100} x1={p.fa[0] + r.hi * 100} y0={part[1] - 5} y1={part[1] + 5} />}
          <Draw d={seg([p.fa[0], top], [p.fa[0], 103])} color="var(--ill-chalk)" w={1.1} dash="2.2 1.8" delay={0.3} />
          <Draw d={seg([p.fa[0], part[1]], [part[0], part[1]])} color={color} w={1.7} delay={0.8} />
          <motion.circle cx={part[0]} cy={part[1]} r={2.2} fill={color} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.7 }} />
          <Label at={[p.fa[0], top - 2]} text="the line" delay={0.6} />
          <Label at={[part[0] + (off >= 0 ? 4 : -4), part[1] - 7]} text={Math.abs(off) < 0.01 ? `${word} on it` : `${word} ${off > 0 ? "ahead" : "behind"}`} color={color} anchor={off >= 0 ? "start" : "end"} />
        </g>
      );
    }
    case "foot_spread":
    case "stride_length": {
      const y = 106;
      const from = m.id === "stride_length" ? p.fa[0] - v * 100 : p.ba[0];
      return (
        <g>
          {r && <Zone x0={from + r.lo * 100} x1={from + r.hi * 100} y0={y - 3} y1={y + 3} />}
          <Draw d={`M${from} ${y - 3} L${from} ${y + 3} M${from} ${y} L${p.fa[0]} ${y} M${p.fa[0]} ${y - 3} L${p.fa[0]} ${y + 3}`} color={color} w={1.6} delay={0.5} />
          <Label at={[(from + p.fa[0]) / 2, y - 5]} text={`${Math.round(v * 100)}% of height`} color={color} />
        </g>
      );
    }
    case "trunk_inclination": {
      const hip = mid(p.fh, p.bh);
      const sh = mid(p.fs, p.bs);
      const up: Pt = [hip[0], hip[1] - 32];
      const ar = arc(hip, up, sh, 13);
      return (
        <g>
          <Draw d={seg(hip, up)} color="var(--ill-chalk)" w={1} dash="2 1.8" delay={0.3} />
          <Draw d={seg(hip, [hip[0] + (sh[0] - hip[0]) * 1.3, hip[1] + (sh[1] - hip[1]) * 1.3])} color={color} w={1.8} delay={0.5} />
          <Draw d={ar.d} color={color} w={1.5} delay={0.9} />
          <Label at={[ar.mid[0] + 2, ar.mid[1]]} text={`${Math.round(v)}°`} color={color} />
        </g>
      );
    }
    case "weight_forward": {
      const y = 106;
      const span = p.fa[0] - p.ba[0];
      const at = p.ba[0] + span * v;
      const com: Pt = [0.6 * (p.fh[0] + p.bh[0]) / 2 + 0.4 * (p.fs[0] + p.bs[0]) / 2, 0.6 * (p.fh[1] + p.bh[1]) / 2 + 0.4 * (p.fs[1] + p.bs[1]) / 2];
      return (
        <g>
          {r && <Zone x0={p.ba[0] + span * r.lo} x1={p.ba[0] + span * r.hi} y0={y - 2.5} y1={y + 2.5} />}
          <Draw d={seg([p.ba[0], y], [p.fa[0], y])} color="var(--ill-chalk)" w={1} delay={0.3} />
          <Draw d={seg([at, com[1]], [at, y])} color={color} w={1.3} dash="2 1.6" delay={0.6} />
          <motion.circle cx={at} cy={com[1]} r={2.4} fill={color} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5 }} />
          {/* Feet close together in the picture: set the two labels either side of the middle. */}
          {Math.abs(span) < 34 ? (
            <>
              <Label at={[(p.ba[0] + p.fa[0]) / 2 - 2, y + 6]} text="back foot" anchor="end" delay={1.2} />
              <Label at={[(p.ba[0] + p.fa[0]) / 2 + 2, y + 6]} text="front foot" anchor="start" delay={1.3} />
            </>
          ) : (
            <>
              <Label at={[p.ba[0], y + 6]} text="back foot" delay={1.2} />
              <Label at={[p.fa[0], y + 6]} text="front foot" delay={1.3} />
            </>
          )}
          <Label at={[at, y - 4]} text={`${Math.round(v * 100)}%`} color={color} />
        </g>
      );
    }
    case "hands_ahead_of_knee": {
      const hands = mid(p.fw, p.bw);
      return (
        <g>
          {r && <Zone x0={p.fk[0] + r.lo * 100} x1={p.fk[0] + r.hi * 100} y0={hands[1] - 6} y1={p.fk[1]} />}
          <Draw d={seg([p.fk[0], p.fk[1]], [p.fk[0], hands[1] - 6])} color="var(--ill-chalk)" w={1} dash="2 1.8" delay={0.3} />
          <Draw d={seg([p.fk[0], hands[1]], hands)} color={color} w={1.7} delay={0.7} />
          <Label at={[hands[0], hands[1] - 7]} text={v >= 0 ? "hands ahead" : "hands back"} color={color} />
        </g>
      );
    }
    default:
      return null;
  }
}
