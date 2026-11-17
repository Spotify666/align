"use client";
// A real front-foot defence, played on Aline's mannequin: the owner's own side-on clip, traced
// frame by frame (scripts/trace/rig.py, MOTION_OUT) and smoothed, at half speed. The orange line
// joins the head, front shoulder, front knee and front toe, the line Aline reads, and the moments
// light up as they come. Asked for on 2026-11-17 ("see how seamless the motion and action feel…
// make sure it blends in with the app's use case"): the movement is the batter's own, not an
// animation, and what is said under it is what Aline read on that clip.
//
// Like the landing's batter: a still first (contact), and the movement only while on screen, in a
// visible tab and with motion allowed; it stops on contact after three plays and plays again on a tap.

import { useEffect, useMemo, useRef, useState } from "react";
import { placeBat, type Pose, type V3 } from "@/engine/pose-model";
import { createMannequinScene, type Camera, type MannequinScene } from "@/components/model/mannequin-view";

type Motion = { fps: number; moments: Record<string, number>; frames: Array<{ frame: number; pose: Record<string, V3>; bat: V3 }> };

const W = 360;
const H = 380;
const SCALE = 300;
const GROUND = 350;
const SPEED = 0.5; // half speed: the movement is quick
const PLAYS = 3;
const MOMENTS = [
  { id: "backlift", label: "Backlift" },
  { id: "foot_down", label: "Foot down" },
  { id: "contact", label: "Contact" },
] as const;
const READ = [
  { ok: true, text: "Front knee bent" },
  { ok: true, text: "A good step" },
  { ok: false, text: "Front shoulder a little late" },
];

const rad = (d: number) => (d * Math.PI) / 180;
function cameraFor(yaw: number, pitch: number): Camera {
  const t = rad(yaw);
  const p = rad(pitch);
  return {
    W, H, scale: SCALE, groundY: GROUND, flip: 1, centre: [0.02, 0],
    right: [Math.cos(t), 0, -Math.sin(t)],
    up: [-Math.sin(p) * Math.sin(t), Math.cos(p), -Math.sin(p) * Math.cos(t)],
    toward: [Math.cos(p) * Math.sin(t), Math.sin(p), Math.cos(p) * Math.cos(t)],
  };
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toScreen = (c: Camera, p: V3) => {
  const q: V3 = [p[0] - c.centre[0], p[1], p[2] - c.centre[1]];
  return [W / 2 + dot(q, c.right) * SCALE, GROUND - dot(q, c.up) * SCALE] as const;
};

/** The pose at a time in the clip (frames, fractional), between its two nearest frames, holding the bat. */
function poseAt(m: Motion, f: number): Pose {
  const n = m.frames.length;
  const i = Math.max(0, Math.min(n - 1, Math.floor(f)));
  const j = Math.min(n - 1, i + 1);
  const k = Math.max(0, Math.min(1, f - i));
  const a = m.frames[i]!;
  const b = m.frames[j]!;
  const pose = Object.fromEntries(Object.keys(a.pose).map((key) => [key, a.pose[key]!.map((v, d) => v + (b.pose[key]![d]! - v) * k) as unknown as V3])) as Pose;
  const bat = a.bat.map((v, d) => v + (b.bat[d]! - v) * k) as unknown as V3;
  return placeBat(pose, bat);
}

export function MotionFigure() {
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState<Motion | null>(null);
  const [frame, setFrame] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [plays, setPlays] = useState(0);
  const scene = useRef<MannequinScene | null>(null);

  // Fetch the movement once the panel is near the screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fetch("/art/motion-ffd-side.json")
        .then((r) => (r.ok ? (r.json() as Promise<Motion>) : null))
        .then((m) => m && setMotion(m))
        .catch(() => setFailed(true));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const contactIndex = useMemo(() => (motion ? Math.max(0, motion.frames.findIndex((f) => f.frame === motion.moments.contact)) : 0), [motion]);

  // The 3D scene, and the movement.
  useEffect(() => {
    const el = box.current;
    if (!el || !motion) return;
    const s = createMannequinScene(el);
    if (!s) {
      setFailed(true);
      return;
    }
    scene.current = s;
    const still = () => {
      s.draw(poseAt(motion, contactIndex), cameraFor(20, 6));
      setFrame(contactIndex);
    };
    still();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || plays >= PLAYS) return () => s.dispose();

    let raf = 0;
    let visible = false;
    let start = 0;
    let played = plays;
    const loop = (now: number) => {
      if (!start) start = now;
      const t = ((now - start) / 1000) * SPEED;
      const f = t * motion.fps;
      const n = motion.frames.length - 1;
      if (f >= n + motion.fps * 0.4) {
        // A breath at the end, then again; after the last play, rest on contact.
        played += 1;
        if (played >= PLAYS) {
          setPlays(played);
          still();
          return;
        }
        start = now;
      }
      const at = Math.min(f, n);
      // The camera drifts a little round the batter as the shot is played.
      const yaw = 16 + 10 * Math.sin((at / n) * Math.PI);
      s.draw(poseAt(motion, at), cameraFor(yaw, 6));
      setFrame(at);
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const go = () => {
      cancelAnimationFrame(raf);
      if (visible && !document.hidden) {
        start = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      go();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", go);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", go);
      s.dispose();
      scene.current = null;
    };
  }, [motion, contactIndex, plays]);

  // The line Aline reads, over the figure: head, front shoulder, front knee, front toe.
  const line = useMemo(() => {
    if (!motion || frame === null) return null;
    const p = poseAt(motion, frame);
    const n = motion.frames.length - 1;
    const c = cameraFor(16 + 10 * Math.sin((Math.min(frame, n) / n) * Math.PI), 6);
    return [p.head, p.front_shoulder, p.front_knee, p.front_foot].map((q) => toScreen(c, q));
  }, [motion, frame]);
  const reached = (id: string) => (motion && frame !== null ? frame >= motion.frames.findIndex((f) => f.frame === motion.moments[id]) : false);
  const atContact = motion !== null && frame !== null && frame >= contactIndex;

  return (
    <div ref={wrap} className="panel overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip text-xs">Traced from a real clip</span>
        <span className="chip text-xs">Front-foot defence</span>
      </div>
      <div className="relative mx-auto mt-4 w-full max-w-sm" style={{ aspectRatio: `${W} / ${H}` }}>
        <div ref={box} className="absolute inset-0" aria-hidden />
        {line && (
          <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <line x1={8} y1={GROUND} x2={W - 8} y2={GROUND} stroke="var(--line-strong)" strokeWidth={1.2} />
            <polyline points={line.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={atContact ? 1 : 0.55} />
            {line.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={3.5} fill="var(--brand)" />
            ))}
          </svg>
        )}
        {failed && <p className="absolute inset-0 grid place-items-center text-sm text-fg-muted">The figure couldn&apos;t be drawn on this device.</p>}
      </div>
      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Moments">
        {MOMENTS.map((m) => (
          <li key={m.id} className={`chip text-xs ${reached(m.id) ? "border-brand text-fg" : "text-fg-subtle"}`}>{m.label}</li>
        ))}
      </ol>
      <ul className="mt-3 space-y-1 text-sm">
        {READ.map((r) => (
          <li key={r.text} className={atContact ? "text-fg-muted" : "text-fg-subtle"}>
            <span aria-hidden className={r.ok ? "text-ok" : "text-warn"}>{r.ok ? "✓ " : "! "}</span>
            {r.text}
          </li>
        ))}
      </ul>
      {plays >= PLAYS && (
        <button type="button" className="btn btn-ghost mt-4" onClick={() => setPlays(0)}>Play again</button>
      )}
    </div>
  );
}
