"use client";
// The motion inspector (/models/motion): a development view of the shared motion fit
// (src/lib/motion, docs/15). Any take of any shot, fitted to the one rig, played at full, half or
// quarter speed or paused and stepped, from the filmed camera, side-on, the bowler's end, or turned
// round (only when the take saw depth). Over the figure, on request: each elbow's bend plane, the
// forearm's axis and the palm's facing, the grip anchors on the handle, and each foot's contact state.
// Beside it, the same take played the old way (each frame as tracked, the bat put in the hands), and
// the measures of both. It reads takes and shot files only; it changes nothing and saves nothing.

import { useEffect, useMemo, useRef, useState } from "react";
import { createMannequinScene, type Camera, type MannequinScene } from "@/components/model/mannequin-view";
import type { Pose } from "@/engine/pose-model";
import { add, gripPoint, holds, mul, palmNormal, sub, unit, type V3 } from "@/engine/rig";
import { playedBefore } from "@/lib/motion/baseline";
import { fitTake, phaseAt, poseAt, type Fitted } from "@/lib/motion/fit";
import { measure, playedFit, type Played, type Quality } from "@/lib/motion/quality";
import type { Shot, Take } from "@/lib/motion/types";
import { VIEWS, VIEW_YAW, cameraFor, canOrbit, loadTake, toScreen, type ViewId } from "@/lib/motion/view";

const W = 360;
const H = 400;
type Entry = { id: string; label: string; shot: string; source: string };
const SPEEDS = [1, 0.5, 0.25] as const;
const ZOOMS = [
  { id: "whole", label: "Whole" },
  { id: "hands", label: "Hands" },
  { id: "feet", label: "Feet" },
] as const;
type Zoom = (typeof ZOOMS)[number]["id"];
const OVERLAYS = [
  { id: "elbow", label: "Elbow planes" },
  { id: "forearm", label: "Forearms, palms" },
  { id: "grip", label: "Grip anchors" },
  { id: "feet", label: "Foot contact" },
] as const;
type Overlay = (typeof OVERLAYS)[number]["id"];

function Seg<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (v: T) => void; disabled?: (v: T) => boolean }) {
  return (
    <fieldset>
      <legend className="text-xs text-fg-subtle">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} disabled={disabled?.(o.id)} onClick={() => onChange(o.id)}
            className={`min-h-11 rounded-full border px-3 text-sm font-medium disabled:opacity-40 ${value === o.id ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** One decimal, never "-0.0" (a value that rounds to nothing reads as 0). */
const f1 = (x: number | null) => (x === null ? "none" : Math.abs(x) < 0.05 ? "0.0" : x.toFixed(1));
const ROWS: Array<[string, (q: Quality) => string]> = [
  ["Bones: largest change of length", (q) => (q.boneSpreadPct < 0.05 ? "none" : `${f1(q.boneSpreadPct)}% (${q.worstBone})`)],
  ["Hands off their grip", (q) => `${f1(q.gripErrCm)} cm`],
  ["Wrist bend, largest", (q) => `${f1(q.wristBendMaxDeg)}°`],
  ["Elbow, knee, palm flips", (q) => `${q.elbowFlips}, ${q.kneeFlips}, ${q.palmFlips}`],
  ["Planted foot sliding", (q) => `${f1(q.plantedDriftCm)} cm`],
  ["Lowest foot point", (q) => `${f1(q.lowestFootCm)} cm`],
  ["Bat through a leg (samples)", (q) => String(q.collisions)],
  ["From the evidence, mean and worst", (q) => `${f1(q.residualMeanCm)}, ${f1(q.residualMaxCm)} cm`],
  ["From the truth, mean and worst", (q) => (q.truthMeanCm === null ? "no truth" : `${f1(q.truthMeanCm)}, ${f1(q.truthMaxCm)} cm`)],
];

export function MotionInspector() {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<MannequinScene | null>(null);
  const [list, setList] = useState<Entry[]>([]);
  const [id, setId] = useState("real-ffd-side");
  const [data, setData] = useState<{ take: Take; shot: Shot; fit: Fitted } | null>(null);
  const [mode, setMode] = useState<"after" | "before">("after");
  const [view, setView] = useState<ViewId>("source");
  const [yaw, setYaw] = useState(35);
  const [zoom, setZoom] = useState<Zoom>("whole");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.5);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [on, setOn] = useState<Set<Overlay>>(new Set(["elbow", "grip", "feet"]));
  const [failed, setFailed] = useState<string | null>(null);
  const wantT = useRef<number | null>(null);

  useEffect(() => {
    fetch("/motion/takes/index.json").then((r) => r.json()).then(setList).catch(() => setFailed("The takes couldn't be loaded."));
    // The address may set what is shown (?take=gen-pull&played=before&view=end&zoom=hands&t=0.88),
    // so a contact sheet is the same every time (scripts/motion/sheets.mjs): read once on arrival.
    const q = new URLSearchParams(window.location.search);
    const take = q.get("take");
    /* eslint-disable react-hooks/set-state-in-effect */
    if (take) setId(take);
    if (q.get("played") === "before") setMode("before");
    const v = q.get("view");
    if (v && VIEWS.some((x) => x.id === v)) setView(v as ViewId);
    const z = q.get("zoom");
    if (z && ZOOMS.some((x) => x.id === z)) setZoom(z as Zoom);
    if (q.get("yaw")) setYaw(Number(q.get("yaw")));
    if (q.get("t")) wantT.current = Number(q.get("t"));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    let dead = false;
    loadTake(id)
      .then(({ take, shot }) => {
        if (dead) return;
        const fit = fitTake(take, shot);
        setData({ take, shot, fit });
        setT(wantT.current ?? take.events.contact ?? take.times[0]!);
        wantT.current = null;
        if (!canOrbit(fit)) setView((v) => (v === "orbit" ? "source" : v));
      })
      .catch(() => setFailed("This take couldn't be fitted."));
    return () => {
      dead = true;
    };
  }, [id]);

  const played: { after: Played; before: Played } | null = useMemo(
    () => (data ? { after: playedFit(data.fit, poseAt), before: playedBefore(data.take, data.fit) } : null),
    [data],
  );
  const quality = useMemo(() => (data && played ? { after: measure(played.after, data.fit, data.take), before: measure(played.before, data.fit, data.take) } : null), [data, played]);
  const pose: Pose | null = useMemo(() => (played ? played[mode].at(t) : null), [played, mode, t]);
  const grip = played ? played.after.grip(t) : "both";

  const camera: Camera | null = useMemo(() => {
    if (!pose) return null;
    // The whole batter: centred between the feet and the bat's reach, at a size that holds a full stride and swing.
    const whole: V3 = mul(add(add(pose.front_ankle, pose.back_ankle), add(pose.head, pose.bat_handle ?? pose.head)), 0.25);
    const focus: V3 = zoom === "hands" && pose.bat_handle ? pose.bat_handle : zoom === "feet" ? mul(add(pose.front_ankle, pose.back_ankle), 0.5) : whole;
    const scale = zoom === "whole" ? 250 : zoom === "feet" ? 480 : 820;
    const groundY = zoom === "whole" ? 372 : H / 2 + focus[1] * scale;
    const y = view === "orbit" ? yaw : VIEW_YAW[view];
    return cameraFor({ W, H, scale, groundY, yaw: y, pitch: view === "orbit" ? 8 : 0, centre: [focus[0], focus[2]] });
  }, [pose, zoom, view, yaw]);

  // The 3D figure: made once, drawn when anything shown changes.
  useEffect(() => {
    if (!box.current) return;
    const s = createMannequinScene(box.current);
    if (!s) {
      // WebGL is missing: say so instead of drawing.
      setFailed("This device can't draw the figure in 3D.");
      return;
    }
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    if (pose && camera) scene.current?.draw(pose, camera);
  }, [pose, camera]);

  // Playing: the take's own clock, slowed; stops at the end. Nothing runs while paused.
  useEffect(() => {
    if (!playing || !data) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Under reduced motion the shot is stepped, not played.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    const end = data.fit.times.at(-1)!;
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      if (document.hidden) return;
      if (last) {
        let done = false;
        setT((x) => {
          const next = x + ((now - last) / 1000) * speed;
          if (next >= end) done = true;
          return Math.min(next, end);
        });
        if (done) return setPlaying(false);
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, data, speed]);

  const phase = data ? phaseAt(data.shot, { events: data.take.events, times: data.fit.times }, t) : null;
  const frameStep = (k: number) => {
    if (!data) return;
    const ts = data.fit.times;
    let i = ts.findIndex((x) => x > t + 1e-6);
    if (k < 0) i = Math.max(0, ts.findLastIndex((x) => x < t - 1e-6));
    setPlaying(false);
    setT(ts[Math.max(0, Math.min(ts.length - 1, i < 0 ? ts.length - 1 : i))]!);
  };

  // What is drawn over the figure.
  const overlay = useMemo(() => {
    if (!pose || !camera || !data) return null;
    const P = (q: V3) => toScreen(camera, q);
    const out: Array<{ key: string; d?: string; x?: number; y?: number; r?: number; text?: string; tone: "brand" | "fg" | "muted" }> = [];
    const path = (pts: V3[], close = false) => pts.map((q, i) => `${i ? "L" : "M"}${P(q)[0].toFixed(1)} ${P(q)[1].toFixed(1)}`).join(" ") + (close ? "Z" : "");
    const dir = pose.bat_handle && pose.bat_toe ? unit(sub(pose.bat_toe, pose.bat_handle)) : null;
    for (const s of ["front", "back"] as const) {
      const [sh, el, wr] = [pose[`${s}_shoulder`], pose[`${s}_elbow`], pose[`${s}_wrist`]];
      if (on.has("elbow")) out.push({ key: `plane-${s}`, d: path([sh, el, wr], true), tone: "brand" });
      if (on.has("forearm")) {
        const ax = unit(sub(wr, el));
        if (ax) out.push({ key: `axis-${s}`, d: path([sub(el, mul(ax, 0.04)), add(wr, mul(ax, 0.06))]), tone: "fg" });
        if (dir && pose.bat_handle && holds(grip, s)) {
          const g = gripPoint(pose.bat_handle, dir, s);
          out.push({ key: `palm-${s}`, d: path([wr, add(wr, mul(palmNormal(wr, g, dir, s), 0.05))]), tone: "brand" });
        }
      }
      if (on.has("grip") && dir && pose.bat_handle) {
        const g = P(gripPoint(pose.bat_handle, dir, s));
        out.push({ key: `grip-${s}`, x: g[0], y: g[1], r: 4, tone: holds(grip, s) ? "brand" : "muted" });
      }
      if (on.has("feet")) {
        const { i } = { i: data.fit.times.findLastIndex((x) => x <= t + 1e-9) };
        const st = data.fit.feet[s][Math.max(0, i)]!;
        const a = P(pose[`${s}_heel`]);
        out.push({ key: `foot-${s}`, x: a[0], y: Math.min(H - 4, a[1] + (s === "front" ? 16 : 28)), text: `${s === "front" ? "Front" : "Back"}: ${st}`, tone: st === "lifted" ? "muted" : "fg" });
      }
    }
    return out;
  }, [pose, camera, data, on, grip, t]);

  const orbitOk = data ? canOrbit(data.fit) : false;
  const take = data?.take;

  return (
    <div className="space-y-5">
      <div className="panel space-y-4 p-4 sm:p-5">
        <label className="block text-sm">
          <span className="text-fg-muted">Take</span>
          <select className="mt-1 block min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-fg" value={id} onChange={(e) => setId(e.target.value)}>
            {(list.length ? list : [{ id, label: id, shot: "", source: "" }]).map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>
        {take && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="chip">{take.provenance.source === "traced" ? "Real clip, traced" : "Generated example"}</span>
            <span className="chip">{data!.fit.depth === "triangulated" ? `${take.views?.length} calibrated cameras` : "One camera: depth estimated"}</span>
            {data!.fit.batDepth === "unobserved" && <span className="chip">Bat seen in the picture only</span>}
            <span className="chip">Bat face: not seen</span>
          </div>
        )}
        <Seg label="Played" value={mode} options={[{ id: "after", label: "Fitted (now)" }, { id: "before", label: "As tracked (before)" }]} onChange={setMode} />
      </div>

      <div className="panel overflow-hidden p-3 sm:p-4">
        <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: `${W} / ${H}` }}>
          <div ref={box} className="absolute inset-0" aria-hidden />
          {overlay && camera && (
            <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {zoom === "whole" && <line x1={6} y1={camera.groundY} x2={W - 6} y2={camera.groundY} stroke="var(--line-strong)" strokeWidth={1} />}
              {overlay.map((o) =>
                o.d ? (
                  <path key={o.key} d={o.d} fill={o.d.endsWith("Z") ? "var(--brand)" : "none"} fillOpacity={0.18} stroke={o.tone === "brand" ? "var(--brand)" : "var(--fg)"} strokeWidth={1.6} />
                ) : o.text ? (
                  <text key={o.key} x={o.x} y={o.y} textAnchor="middle" fontSize={11} fill={o.tone === "muted" ? "var(--fg-subtle)" : "var(--fg)"}>{o.text}</text>
                ) : (
                  <circle key={o.key} cx={o.x} cy={o.y} r={o.r} fill={o.tone === "brand" ? "var(--brand)" : "none"} stroke="var(--brand)" strokeWidth={1.5} />
                ),
              )}
            </svg>
          )}
          {failed && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-fg-muted">{failed}</p>}
        </div>
        <p className="mt-2 min-h-11 text-sm" aria-live="polite">
          {phase ? (
            <>
              <span className="font-semibold">{phase.label}.</span> <span className="text-fg-muted">{phase.cue}</span>
            </>
          ) : null}
        </p>
        {data && (
          <div className="space-y-3">
            <label className="block text-xs text-fg-subtle">
              Time in the take: {t.toFixed(2)} s
              <input type="range" className="mt-1 block min-h-11 w-full" min={data.fit.times[0]} max={data.fit.times.at(-1)} step={0.001} value={t}
                onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => { if (t >= data.fit.times.at(-1)! - 1e-6) setT(data.fit.times[0]!); setPlaying((p) => !p); }}>{playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn btn-quiet" onClick={() => frameStep(-1)} aria-label="Previous tracked frame">Frame back</button>
              <button type="button" className="btn btn-quiet" onClick={() => frameStep(1)} aria-label="Next tracked frame">Frame on</button>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Events">
              {data.shot.events.map((e) => (
                <button key={e.id} type="button" className="min-h-11 rounded-full border border-line-strong px-3 text-sm text-fg-muted" onClick={() => { setPlaying(false); setT(data.take.events[e.id]!); }}>{e.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel space-y-4 p-4 sm:p-5">
        <Seg label="Speed" value={speed} options={SPEEDS.map((s) => ({ id: s, label: s === 1 ? "Full" : s === 0.5 ? "Half" : "Quarter" }))} onChange={setSpeed} />
        <Seg label="Seen from" value={view} options={VIEWS} onChange={setView} disabled={(v) => v === "orbit" && !orbitOk} />
        {view === "orbit" && (
          <label className="block text-xs text-fg-subtle">
            Turned {Math.round(yaw)}° from side-on
            <input type="range" className="mt-1 block min-h-11 w-full" min={0} max={360} value={yaw} onChange={(e) => setYaw(Number(e.target.value))} />
          </label>
        )}
        {!orbitOk && data && <p className="text-xs text-fg-subtle">One camera saw this take, so it isn&apos;t turned round.</p>}
        <Seg label="Close-up" value={zoom} options={ZOOMS} onChange={setZoom} />
        <fieldset>
          <legend className="text-xs text-fg-subtle">Show</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {OVERLAYS.map((o) => (
              <button key={o.id} type="button" aria-pressed={on.has(o.id)} onClick={() => setOn((x) => { const n = new Set(x); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })}
                className={`min-h-11 rounded-full border px-3 text-sm font-medium ${on.has(o.id) ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {quality && (
        <div className="panel p-4 sm:p-5">
          <h2 className="text-base font-semibold">Measured on this take</h2>
          <p className="mt-1 text-xs text-fg-subtle">On every tracked frame and three between each pair.</p>
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Measures, before and after">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-subtle">
                  <th scope="col" className="py-1 pr-3 font-normal">Measure</th>
                  <th scope="col" className="py-1 pr-3 font-normal">As tracked</th>
                  <th scope="col" className="py-1 font-normal">Fitted</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, f]) => (
                  <tr key={label} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-fg-muted">{label}</th>
                    <td className="py-1.5 pr-3 tabular-nums">{f(quality.before)}</td>
                    <td className="py-1.5 tabular-nums">{f(quality.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
