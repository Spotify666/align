"use client";
// A real front-foot defence, played on Aline's mannequin: the owner's own side-on clip, traced frame
// by frame (scripts/trace/rig.py), fitted to the one rig every figure uses (src/lib/motion: every
// bone one length, the hands on the bat's grip, the planted feet held, the frames between tracked
// ones solved too), at half speed. The orange line joins the head, front shoulder, front knee and
// front toe, the line Aline reads; the phase and its cue come from the shot's own file
// (public/motion/shots), and change exactly at the take's events.
//
// The clip was filmed by one camera, so its depth is an estimate: it plays from where that camera
// stood, never turned round (src/lib/motion/view.ts, `canOrbit`), and says so.
//
// Like the landing's batter: a still first (contact), and the movement only while on screen, in a
// visible tab and with motion allowed; it stops on contact after three plays and plays again on a tap.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createMannequinScene, type MannequinScene } from "@/components/model/mannequin-view";
import { fitTake, phaseAt, poseAt, type Fitted } from "@/lib/motion/fit";
import { cameraFor, loadTake, toScreen, VIEW_YAW } from "@/lib/motion/view";

const W = 360;
const H = 380;
const SCALE = 300;
const GROUND = 350;
const SPEED = 0.5; // half speed: the movement is quick
const PLAYS = 3;
const TAKE = "real-ffd-side";
const READ = [
  { ok: true, text: "Front knee bent" },
  { ok: true, text: "A good step" },
  { ok: false, text: "Front shoulder a little late" },
];
const camera = cameraFor({ W, H, scale: SCALE, groundY: GROUND, yaw: VIEW_YAW.source, pitch: 0, centre: [0.02, 0] });

export function MotionFigure() {
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fitted | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [plays, setPlays] = useState(0);
  const scene = useRef<MannequinScene | null>(null);

  // Fetch and fit the take once the panel is near the screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      loadTake(TAKE)
        .then(({ take, shot }) => setFit(fitTake(take, shot)))
        .catch(() => setFailed(true));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const contact = fit ? fit.take.events.contact! : 0;

  // The 3D scene, and the movement.
  useEffect(() => {
    const el = box.current;
    if (!el || !fit) return;
    const s = createMannequinScene(el);
    if (!s) {
      setFailed(true);
      return;
    }
    scene.current = s;
    // The figure is drawn from `time` (below), in the same paint as the line over it.
    s.draw(poseAt(fit, contact).pose, camera);
    const still = () => setTime(contact);
    still();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || plays >= PLAYS) return () => s.dispose();

    const t0 = fit.times[0]!;
    const end = fit.times[fit.times.length - 1]!;
    let raf = 0;
    let visible = false;
    let start = 0;
    let played = plays;
    const loop = (now: number) => {
      if (!start) start = now;
      // The take's own clock, slowed: a phase changes at its event whatever the speed.
      const t = t0 + ((now - start) / 1000) * SPEED;
      if (t >= end + 0.4) {
        // A breath at the end, then again; after the last play, rest on contact.
        played += 1;
        if (played >= PLAYS) {
          setPlays(played);
          still();
          return;
        }
        start = now;
      }
      setTime(Math.min(t, end));
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
  }, [fit, contact, plays]);

  // Figure and line from one time, in one paint. Drawn straight from the animation loop, the
  // figure ran a frame ahead of the line, and on each restart the line hung beside the batter.
  useLayoutEffect(() => {
    if (fit && time !== null) scene.current?.draw(poseAt(fit, time).pose, camera);
  }, [fit, time]);

  // The line Aline reads, over the figure: head, front shoulder, front knee, front toe.
  const line = useMemo(() => {
    if (!fit || time === null) return null;
    const p = poseAt(fit, time).pose;
    return [p.head, p.front_shoulder, p.front_knee, p.front_foot].map((q) => toScreen(camera, q));
  }, [fit, time]);
  const phase = fit && time !== null ? phaseAt(fit.shot, { events: fit.take.events, times: fit.times }, time) : null;
  const atContact = fit !== null && time !== null && time >= contact;

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
        {(fit?.shot.events ?? []).map((e) => (
          <li key={e.id} className={`chip text-xs ${fit && time !== null && time >= fit.take.events[e.id]! ? "border-brand text-fg" : "text-fg-subtle"}`}>{e.label}</li>
        ))}
      </ol>
      <p className="mt-3 min-h-[2.75rem] text-sm" aria-live="off">
        {phase && (
          <>
            <span className="font-semibold">{phase.label}.</span> <span className="text-fg-muted">{phase.cue}</span>
          </>
        )}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {READ.map((r) => (
          <li key={r.text} className={atContact ? "text-fg-muted" : "text-fg-subtle"}>
            <span aria-hidden className={r.ok ? "text-ok" : "text-warn"}>{r.ok ? "✓ " : "! "}</span>
            {r.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-subtle">Filmed by one camera, so shown from where it stood.</p>
      {plays >= PLAYS && (
        <button type="button" className="btn btn-ghost mt-4" onClick={() => setPlays(0)}>Play again</button>
      )}
    </div>
  );
}
