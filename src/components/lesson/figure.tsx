"use client";
// The batter in the lesson illustrations, drawn as the tracker saw them: points and bones on
// paper, solid where it was sure, faint and dotted where it was unsure, nothing where it saw
// nothing. No filled body: a silhouette looks more certain than the data behind it. Poses are
// in figure units (see ./pose).

import { mid, type FigureJoint, type FigurePose, type Pt } from "./pose";
import { SEEN_MIN, SURE_MIN } from "@/lib/viz";

export { alignAt, figurePose, mid, posePoints, type FigurePose, type Pt } from "./pose";

/** Ink on paper, the same in both themes. */
export const INK = "var(--ill-ink)";
export const PAPER = "var(--ill-paper)";
/** Annotations are ink too, set off the figure by a thin paper halo: no third colour. */
export const GOOD = INK;
export const OFF = INK;
export const ZONE = INK;

/** The bat, from the hands: the tracked bat's direction, else held down beside the front pad. */
export function batLine(p: FigurePose): [Pt, Pt] {
  const hands = mid(p.fw, p.bw);
  const target: Pt = p.batH && p.batT ? [hands[0] + p.batT[0] - p.batH[0], hands[1] + p.batT[1] - p.batH[1]] : [p.fk[0] + 5, p.fa[1] - 4];
  const dx = target[0] - hands[0];
  const dy = target[1] - hands[1];
  const L = Math.hypot(dx, dy) || 1;
  // A full-size bat is about half a batter's height.
  const len = 48;
  return [hands, [hands[0] + (dx / L) * len, hands[1] + (dy / L) * len]];
}

/** Bones of the landmark figure, as pairs of points. */
const LANDMARK_BONES: Array<[FigureJoint, FigureJoint]> = [
  ["fs", "bs"], ["fs", "fh"], ["bs", "bh"], ["fh", "bh"],
  ["bs", "be"], ["be", "bw"], ["fs", "fe"], ["fe", "fw"],
  ["bh", "bk"], ["bk", "ba"], ["fh", "fk"], ["fk", "fa"],
  ["ba", "bheel"], ["bheel", "btoe"], ["ba", "btoe"], ["fa", "fheel"], ["fheel", "ftoe"], ["fa", "ftoe"],
];
/** The shared rule (lib/viz): not drawn below SEEN, faint and dotted below SURE. */
const SEEN = SEEN_MIN;
const SURE = SURE_MIN;

/**
 * The batter as the tracker saw them: points and bones, no filled body. A point the tracker
 * was sure of is solid; one it was unsure of is faint and dotted; one it didn't see is not
 * drawn, and neither is the bat when it wasn't tracked. Nothing is filled in by guess, so the
 * figure never looks more certain than the data behind it.
 */
export function LandmarkFigure({ p }: { p: FigurePose }) {
  const c = (j: FigureJoint) => p.seen?.[j] ?? 1;
  const bones = LANDMARK_BONES.filter(([a, b]) => c(a) >= SEEN && c(b) >= SEEN);
  const points = (Object.keys(p.seen ?? {}) as FigureJoint[]).filter((j) => j !== "head" && c(j) >= SEEN);
  const line = (a: Pt, b: Pt, sure: boolean, key: string, width: number, colour: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={colour} strokeWidth={sure ? width : width * 0.6} strokeDasharray={sure ? undefined : "1 2.5"} opacity={sure ? 1 : 0.55} />
  );
  return (
    <g strokeLinecap="round" fill="none">
      {/* A paper halo under the ink, so annotations and the outline read across it. */}
      {bones.map(([a, b]) => line(p[a], p[b], true, `h${a}${b}`, 3.4, PAPER))}
      {bones.map(([a, b]) => line(p[a], p[b], Math.min(c(a), c(b)) >= SURE, `${a}${b}`, 1.6, INK))}
      {c("head") >= SEEN && <circle cx={p.head[0]} cy={p.head[1]} r={6} stroke={INK} strokeWidth={c("head") >= SURE ? 1.4 : 0.9} strokeDasharray={c("head") >= SURE ? undefined : "1 2.5"} />}
      {points.map((j) => (
        <circle key={j} cx={p[j][0]} cy={p[j][1]} r={c(j) >= SURE ? 1.5 : 1} fill={c(j) >= SURE ? INK : PAPER} stroke={INK} strokeWidth={0.6} opacity={c(j) >= SURE ? 1 : 0.6} />
      ))}
      {/* The bat, only where it was tracked. */}
      {p.batH && p.batT && (
        <>
          {line(mid(p.fw, p.bw), batLine(p)[1], true, "bath", 4.2, PAPER)}
          {line(mid(p.fw, p.bw), batLine(p)[1], true, "bat", 2.6, INK)}
        </>
      )}
    </g>
  );
}

export type GhostPart = "front_leg" | "back_leg" | "head" | "trunk" | "hands" | "stride";

/** The textbook position as a dashed outline: only the part a chapter is about. Ink on a paper halo, so it reads over the figure. */
export function GhostFigure({ p, parts }: { p: FigurePose; parts: GhostPart[] }) {
  const seg: Array<[Pt, Pt]> = [];
  if (parts.includes("front_leg")) seg.push([p.fh, p.fk], [p.fk, p.fa]);
  if (parts.includes("back_leg") || parts.includes("stride")) seg.push([p.bh, p.bk], [p.bk, p.ba]);
  if (parts.includes("trunk")) seg.push([mid(p.fh, p.bh), mid(p.fs, p.bs)]);
  if (parts.includes("hands")) seg.push([p.fe, p.fw]);
  const shapes = (stroke: string, width: number, dash?: string) => (
    <g stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" fill="none">
      {seg.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      ))}
      {parts.includes("head") && <circle cx={p.head[0]} cy={p.head[1]} r={6.6} />}
      {parts.includes("hands") && <circle cx={mid(p.fw, p.bw)[0]} cy={mid(p.fw, p.bw)[1]} r={3.6} />}
      {parts.includes("stride") && <ellipse cx={p.ba[0]} cy={p.ba[1] + 1.5} rx={4.5} ry={2} />}
    </g>
  );
  return (
    <g>
      {shapes(PAPER, 3.2)}
      {shapes(INK, 1.3, "2.4 2")}
    </g>
  );
}
