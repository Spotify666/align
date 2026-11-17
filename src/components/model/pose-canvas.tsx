"use client";
// The figure a shot model is placed on (/models/edit). One projection serves every view: the
// camera sits on the batter's off side (Side), at the bowler's end (Front), or anywhere between
// (3D, turned by dragging the background). A joint is dragged in the plane of the picture, so
// from the side it moves along the pitch and up, from the front across and up; the bones keep
// their lengths (dragHandle). A left-hander is drawn as a left-hander, seen from their own off
// side: nothing is mirrored from a right-hander's picture.
//
// The figure is a real batter: line art traced from the owner's own clip at this moment
// (lib/traced-figure.ts), bent to the joints as they are placed. It is drawn only in the view it
// was traced from (side, or the bowler's end) and only for the batting side of the clip; in any
// other view, or for a left-hander, the joints and the bones between them are shown, and the
// caption says why. The bat and the hands over it are drawn only when the model has a bat.
//
// Drawn in SVG, on demand: nothing moves unless the person moves it, so it draws nothing
// off-screen, when idle or under reduced motion.

import { useMemo, useRef } from "react";
import { BAT, BONES, HANDLE_LABEL, chestOf, ground, handlePoint, handlesOf, pelvisOf, type Handle, type Plane, type Pose, type V3 } from "@/engine/pose-model";
import { batBones, bend, bind, bodyBones, followFrom, handBones, plainBat, restPoints, tracedPose, type TracedMoment } from "@/lib/traced-figure";
import type { Handedness } from "@/engine/types";

export interface View {
  /** Degrees round the batter from their off side toward the bowler's end: 0 = side-on, 90 = front-on. */
  yaw: number;
  /** Degrees the camera is raised. */
  pitch: number;
}
export const VIEWS = { side: { yaw: 0, pitch: 0 }, front: { yaw: 90, pitch: 0 }, round: { yaw: 38, pitch: 16 } } as const;

const W = 360;
const HGT = 430;
const SCALE = 330; // viewBox units per body height
const GROUND_Y = 392;
const rad = (d: number) => (d * Math.PI) / 180;

function axes(view: View) {
  const t = rad(view.yaw);
  const p = rad(view.pitch);
  return {
    right: [Math.cos(t), 0, -Math.sin(t)] as V3,
    up: [-Math.sin(p) * Math.sin(t), Math.cos(p), -Math.sin(p) * Math.cos(t)] as V3,
    toward: [Math.cos(p) * Math.sin(t), Math.sin(p), Math.cos(p) * Math.cos(t)] as V3,
  };
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function PoseCanvas({
  pose, side, view, centre, selected, onSelect, onDrag, onDragEnd, onOrbit, ghost, label, drawings, start: startPose,
}: {
  pose: Pose;
  side: Handedness;
  view: View;
  /** The point (forward, across) kept in the middle of the picture. */
  centre: readonly [number, number];
  selected: Handle | null;
  onSelect: (h: Handle | null) => void;
  onDrag: (h: Handle, target: V3) => void;
  onDragEnd: () => void;
  /** Present when the picture may be turned (a model placed from both angles). */
  onOrbit?: (next: View) => void;
  /** Another moment, shown faintly behind for reference. */
  ghost?: Pose | null;
  label: string;
  /** The traced batter for this moment and the plane it was traced in; null: none for this model. */
  /** The traced batter at this moment, from each side it was traced from. */
  drawings?: Partial<Record<Plane, TracedMoment>>;
  /** The pose this moment started from: a tracing moves by how far each joint is moved from it. */
  start?: Pose | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "joint"; handle: Handle; from: V3; x: number; y: number } | { kind: "orbit"; view: View; x: number; y: number } | null>(null);
  const ax = useMemo(() => axes(view), [view]);
  const flip = side === "right" ? 1 : -1;

  const project = (p: V3) => {
    const q: V3 = [p[0] - centre[0], p[1], p[2] - centre[1]];
    return { x: W / 2 + flip * dot(q, ax.right) * SCALE, y: GROUND_Y - dot(q, ax.up) * SCALE, d: dot(q, ax.toward) };
  };
  const unitsPerPx = () => (svg.current ? W / svg.current.getBoundingClientRect().width : 1);

  const start = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: "joint", handle, from: handlePoint(pose, handle), x: e.clientX, y: e.clientY };
    onSelect(handle);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = unitsPerPx();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    if (d.kind === "joint") {
      const r = (flip * dx) / SCALE;
      const u = -dy / SCALE;
      onDrag(d.handle, [d.from[0] + ax.right[0] * r + ax.up[0] * u, d.from[1] + ax.right[1] * r + ax.up[1] * u, d.from[2] + ax.right[2] * r + ax.up[2] * u]);
    } else if (onOrbit) {
      onOrbit({ yaw: Math.round(d.view.yaw - flip * dx * 0.5), pitch: Math.min(70, Math.max(0, Math.round(d.view.pitch + dy * 0.35))) });
    }
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.kind === "joint") onDragEnd();
    drag.current = null;
    svg.current?.releasePointerCapture?.(e.pointerId);
  };

  const handles = handlesOf(pose);
  const pts = Object.fromEntries(handles.map((h) => [h, project(handlePoint(pose, h))])) as Record<Handle, { x: number; y: number; d: number }>;
  // The traced drawing nearer this view (side tracing nearer side-on, the bowler's-end one nearer
  // front-on): tied to its own pose once, bent to this one in 3D on each change.
  const plane = drawingPlane(view);
  const drawing = drawings?.[plane] ?? null;
  const tied = useMemo(() => {
    if (!drawing) return null;
    const rest = restPoints(drawing, plane);
    return {
      traced: ground(tracedPose(drawing)),
      body: bind(drawing.body, bodyBones(rest)),
      bat: drawing.bat ? bind([drawing.bat.outline], batBones(rest)) : PLAIN_BAT,
      grips: drawing.bat && drawing.grips?.length ? bind(drawing.grips, handBones(rest)) : null,
    };
  }, [drawing, plane]);
  const art = tied ? artPaths(tied, pose, startPose ?? pose, plane, project) : null;
  const sideOn = Math.abs(Math.sin(rad(view.yaw))) < 0.2 && view.pitch < 8;
  const frontOn = Math.abs(Math.cos(rad(view.yaw))) < 0.2 && view.pitch < 8;
  const toe = pts.front_foot;
  // The ground under the figure: a few lines along and across the pitch, so a turned picture reads as a floor.
  const floor: Array<[V3, V3]> = [];
  for (const a of [-0.3, 0, 0.3]) floor.push([[centre[0] - 0.75, 0, centre[1] + a], [centre[0] + 0.75, 0, centre[1] + a]]);
  for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) floor.push([[centre[0] + f, 0, centre[1] - 0.3], [centre[0] + f, 0, centre[1] + 0.3]]);
  const bowlerRight = flip * ax.right[0] > 0;
  const ghostPts = ghost ? (Object.fromEntries(Object.entries(ghost).map(([k, v]) => [k, project(v)])) as Record<string, { x: number; y: number }>) : null;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${HGT}`}
      role="group"
      aria-label={label}
      className="block h-auto max-h-[62vh] w-full touch-none select-none"
      onPointerDown={(e) => {
        if (!onOrbit) return onSelect(null);
        svg.current?.setPointerCapture(e.pointerId);
        drag.current = { kind: "orbit", view, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {floor.map(([a, b], i) => {
        const p = project(a);
        const q = project(b);
        return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--line)" strokeWidth={1} />;
      })}
      {(sideOn || frontOn) && <line x1={8} y1={GROUND_Y} x2={W - 8} y2={GROUND_Y} stroke="var(--line-strong)" strokeWidth={1.5} />}
      {/* The line: straight up from the front toe, as Aline reads it from the side. */}
      {sideOn && <line x1={toe.x} y1={GROUND_Y} x2={toe.x} y2={24} stroke="var(--brand)" strokeWidth={1.5} strokeDasharray="5 5" />}
      {sideOn && (
        <text x={bowlerRight ? W - 10 : 10} y={GROUND_Y + 22} textAnchor={bowlerRight ? "end" : "start"} fontSize={11} fill="var(--fg-subtle)">
          {bowlerRight ? "to the bowler →" : "← to the bowler"}
        </text>
      )}
      {frontOn && (
        <text x={flip * ax.right[2] > 0 ? W - 10 : 10} y={GROUND_Y + 22} textAnchor={flip * ax.right[2] > 0 ? "end" : "start"} fontSize={11} fill="var(--fg-subtle)">
          {flip * ax.right[2] > 0 ? "off side →" : "← off side"}
        </text>
      )}

      {ghostPts && (
        <g aria-hidden opacity={0.35}>
          {BONES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={ghostPts[a]!.x} y1={ghostPts[a]!.y} x2={ghostPts[b]!.x} y2={ghostPts[b]!.y} stroke="var(--fg-subtle)" strokeWidth={1.5} strokeDasharray="3 4" />
          ))}
        </g>
      )}

      {art ? (
        <g aria-hidden>
          <path d={art.body} fill="none" stroke="var(--fg)" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
          {art.bat && <path d={art.bat} fill="var(--surface)" stroke="var(--fg)" strokeWidth={1.6} strokeLinejoin="round" />}
          {art.grips && <path d={art.grips} fill="var(--surface)" stroke="var(--fg)" strokeWidth={1.3} strokeLinejoin="round" />}
        </g>
      ) : (
        <g aria-hidden stroke="var(--fg)" strokeLinecap="round" strokeOpacity={0.7}>
          {BONES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y} strokeWidth={2} />
          ))}
          <line x1={project(pelvisOf(pose)).x} y1={project(pelvisOf(pose)).y} x2={project(chestOf(pose)).x} y2={project(chestOf(pose)).y} strokeWidth={2} />
          <line x1={project(chestOf(pose)).x} y1={project(chestOf(pose)).y} x2={pts.head.x} y2={pts.head.y} strokeWidth={2} />
          {pose.bat_handle && pose.bat_toe && (
            <line x1={project(pose.bat_handle).x} y1={project(pose.bat_handle).y} x2={project(pose.bat_toe).x} y2={project(pose.bat_toe).y} strokeWidth={5} />
          )}
        </g>
      )}

      {/* Handles: the far ones first, so a near joint is the one a finger finds. */}
      {[...handles].sort((a, b) => pts[a].d - pts[b].d).map((h) => {
        const p = pts[h];
        const on = selected === h;
        const centreHandle = h === "pelvis" || h === "chest";
        return (
          <g key={h} role="button" aria-label={HANDLE_LABEL[h]} aria-pressed={on} tabIndex={-1} onPointerDown={(e) => start(e, h)} style={{ cursor: "grab", outline: "none" }}>
            <circle cx={p.x} cy={p.y} r={20} fill="transparent" />
            {centreHandle ? (
              <rect x={p.x - (on ? 6 : 4.5)} y={p.y - (on ? 6 : 4.5)} width={on ? 12 : 9} height={on ? 12 : 9} rx={2} transform={`rotate(45 ${p.x} ${p.y})`} fill="var(--bg)" stroke={on ? "var(--brand)" : "var(--fg)"} strokeWidth={on ? 3 : 1.6} />
            ) : (
              <circle cx={p.x} cy={p.y} r={on ? 7 : h === "bat_toe" ? 5 : 3.4} fill={on ? "var(--bg)" : "var(--fg)"} fillOpacity={on ? 1 : 0.85} stroke={on ? "var(--brand)" : "var(--bg)"} strokeWidth={on ? 3 : 1.2} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

type Projected = { x: number; y: number; d: number };
type Tied = { traced: Pose; body: ReturnType<typeof bind>; bat: ReturnType<typeof bind> | null; grips: ReturnType<typeof bind> | null };

/** Which tracing a view shows: the side one nearer side-on, the bowler's-end one nearer front-on. */
export const drawingPlane = (view: View): Plane => (Math.abs(Math.sin(rad(view.yaw))) < Math.SQRT1_2 ? "side" : "front");

/** A drawn bat for a moment whose clip didn't show the bat clearly enough to trace. */
const PLAIN_BAT = plainBat(BAT.handsToToe, BAT.aboveHands, BAT.blade, BAT.width);

/** The traced drawing bent to `pose` in 3D, as SVG paths in the picture. The bat and hands only when the model holds a bat. */
function artPaths(tied: Tied, pose: Pose, start: Pose, plane: Plane, project: (p: V3) => Projected) {
  const at = followFrom(tied.traced, start, pose, plane);
  const path = (shapes: V3[][], closed = true) =>
    shapes
      .filter((s) => s.length > (closed ? 2 : 1))
      .map((s) => `M${s.map((p) => { const q = project(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join("L")}${closed ? "Z" : ""}`)
      .join("");
  const hasBat = !!(pose.bat_handle && pose.bat_toe);
  return {
    body: path(bend(tied.body, bodyBones(at), plane, true), false),
    bat: hasBat && tied.bat ? path(bend(tied.bat, batBones(at), plane)) : null,
    grips: hasBat && tied.grips ? path(bend(tied.grips, handBones(at), plane)) : null,
  };
}
