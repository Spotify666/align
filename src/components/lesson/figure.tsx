"use client";
// An illustrated batter drawn from a pose: helmet, shirt, padded legs, gloves and a bat,
// outlined in ink with a slight hand-drawn wobble. Every lesson illustration starts here.
// Poses come in image coordinates (0..1) and are redrawn in figure units: standing height
// 100, ground at y = 100, facing right (toward the bowler).

import { J, type ImgPoint } from "@/engine/types";

export type Pt = [number, number];
export interface FigurePose {
  head: Pt;
  fs: Pt; bs: Pt; fe: Pt; be: Pt; fw: Pt; bw: Pt;
  fh: Pt; bh: Pt; fk: Pt; bk: Pt; fa: Pt; ba: Pt;
  fheel: Pt; bheel: Pt; ftoe: Pt; btoe: Pt;
  /** Bat handle and toe, when the bat was tracked (otherwise it is drawn held down). */
  batH?: Pt; batT?: Pt;
}

/** Illustration palette: flat colours on paper, the same in both themes except paper and ink. */
export const INK = "var(--ill-ink)";
export const PAPER = "var(--ill-paper)";
const SHIRT = "#2f6fb0";
const SHIRT_DARK = "#255a91";
const TROUSERS = "#f1ece1";
const PAD = "#fffaf0";
const HELMET = "#1f3a5f";
const GLOVE = "#ffffff";
const BAT = "#e2c08a";
const SHOE = "#ffffff";
export const GOOD = "#1f9d6b";
export const OFF = "#e05a47";
export const ZONE = "#e8b23a";

/**
 * Redraw a pose in figure units. Front side from the batting hand; mirrored so the batter
 * faces right. Null when the legs or trunk weren't seen.
 */
export function figurePose(body: ImgPoint[], aspect: number, hand: "right" | "left", bat?: [ImgPoint | null | undefined, ImgPoint | null | undefined]): FigurePose | null {
  const F = hand === "right" ? "left" : "right";
  const B = F === "left" ? "right" : "left";
  const raw = (name: string): Pt | null => {
    const p = body[J[name as keyof typeof J]];
    return p && p[2] >= 0.2 ? [p[0] * aspect, p[1]] : null;
  };
  const req = ["nose", `${F}_shoulder`, `${B}_shoulder`, `${F}_hip`, `${B}_hip`, `${F}_knee`, `${B}_knee`, `${F}_ankle`, `${B}_ankle`];
  if (req.some((n) => !raw(n))) return null;
  const g = (n: string, fb?: Pt): Pt => raw(n) ?? fb!;
  const fa = g(`${F}_ankle`);
  const ba = g(`${B}_ankle`);
  const mirror = fa[0] < ba[0] ? -1 : 1;
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const leg = Math.max(d(g(`${F}_hip`), g(`${F}_knee`)) + d(g(`${F}_knee`), fa), d(g(`${B}_hip`), g(`${B}_knee`)) + d(g(`${B}_knee`), ba));
  const trunk = (d(g(`${F}_hip`), g(`${F}_shoulder`)) + d(g(`${B}_hip`), g(`${B}_shoulder`))) / 2;
  const stature = (leg + trunk) / 0.779;
  if (!(stature > 0)) return null;
  const k = 100 / stature;
  const feet = [`${F}_heel`, `${B}_heel`, `${F}_foot`, `${B}_foot`, `${F}_ankle`, `${B}_ankle`].map(raw).filter((p): p is Pt => !!p);
  const ground = Math.max(...feet.map((p) => p[1]));
  const cx = (fa[0] + ba[0]) / 2;
  const T = (p: Pt): Pt => [(p[0] - cx) * k * mirror, 100 + (p[1] - ground) * k];
  const fs = T(g(`${F}_shoulder`));
  const bs = T(g(`${B}_shoulder`));
  const fh = T(g(`${F}_hip`));
  const bh = T(g(`${B}_hip`));
  const fk = T(g(`${F}_knee`));
  const bk = T(g(`${B}_knee`));
  const faT = T(fa);
  const baT = T(ba);
  const nose = T(g("nose"));
  // Elbows and wrists hidden behind the body: put them where a defence holds them.
  const fe = raw(`${F}_elbow`) ? T(raw(`${F}_elbow`)!) : ([fs[0] + 6, fs[1] + 10] as Pt);
  const be = raw(`${B}_elbow`) ? T(raw(`${B}_elbow`)!) : ([bs[0] + 4, bs[1] + 12] as Pt);
  const fw = raw(`${F}_wrist`) ? T(raw(`${F}_wrist`)!) : ([fe[0] + 4, fe[1] + 10] as Pt);
  const bw = raw(`${B}_wrist`) ? T(raw(`${B}_wrist`)!) : ([fw[0], fw[1] + 3] as Pt);
  const foot = (heel: string, toe: string, ankle: Pt, dir: number): [Pt, Pt] => [
    raw(heel) ? T(raw(heel)!) : ([ankle[0] - 2.5 * dir, ankle[1] + 2] as Pt),
    raw(toe) ? T(raw(toe)!) : ([ankle[0] + 6 * dir, ankle[1] + 2.5] as Pt),
  ];
  const [fheel, ftoe] = foot(`${F}_heel`, `${F}_foot`, faT, 1);
  const [bheel, btoe] = foot(`${B}_heel`, `${B}_foot`, baT, 1);
  // The helmet sits a little behind and above the nose.
  const head: Pt = [nose[0] - 3.2, nose[1] - 1.6];
  const out: FigurePose = { head, fs, bs, fe, be, fw, bw, fh, bh, fk, bk, fa: faT, ba: baT, fheel, bheel, ftoe, btoe };
  const [bh0, bt0] = bat ?? [];
  if (bh0 && bt0 && bh0[2] >= 0.2 && bt0[2] >= 0.2) {
    out.batH = T([bh0[0] * aspect, bh0[1]]);
    out.batT = T([bt0[0] * aspect, bt0[1]]);
  }
  return out;
}

/** Shift a pose so its front ankle lands on `at` (for the textbook outline). */
export function alignAt(p: FigurePose, at: Pt): FigurePose {
  const dx = at[0] - p.fa[0];
  const dy = at[1] - p.fa[1];
  const out = {} as FigurePose;
  for (const [k, v] of Object.entries(p) as Array<[keyof FigurePose, Pt]>) out[k] = [v[0] + dx, v[1] + dy];
  return out;
}

export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The bat, from the hands. */
function batLine(p: FigurePose): [Pt, Pt] {
  const hands = mid(p.fw, p.bw);
  // The tracked bat's direction from the hands, else held down beside the front pad.
  const target: Pt = p.batH && p.batT ? [hands[0] + p.batT[0] - p.batH[0], hands[1] + p.batT[1] - p.batH[1]] : [p.fk[0] + 5, p.fa[1] - 4];
  const dx = target[0] - hands[0];
  const dy = target[1] - hands[1];
  const L = Math.hypot(dx, dy) || 1;
  const len = 46;
  return [hands, [hands[0] + (dx / L) * len, hands[1] + (dy / L) * len]];
}

const Limb = ({ a, b, w, fill }: { a: Pt; b: Pt; w: number; fill: string }) => (
  <>
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={INK} strokeWidth={w + 2.2} strokeLinecap="round" />
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={fill} strokeWidth={w} strokeLinecap="round" />
  </>
);

/** Shared SVG definitions: the hand-drawn wobble and paper grain. Render once per SVG. */
export function FigureDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-wobble`} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={`${id}-grain`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0" />
      </filter>
    </defs>
  );
}

export function BatterFigure({ p, id }: { p: FigurePose; id: string }) {
  const [batA, batB] = batLine(p);
  const bdx = batB[0] - batA[0];
  const bdy = batB[1] - batA[1];
  const bl = Math.hypot(bdx, bdy) || 1;
  const nx = -bdy / bl;
  const ny = bdx / bl;
  const handleEnd: Pt = [batA[0] + (bdx / bl) * 12, batA[1] + (bdy / bl) * 12];
  const blade = [
    [handleEnd[0] + nx * 2.6, handleEnd[1] + ny * 2.6],
    [batB[0] + nx * 3.2, batB[1] + ny * 3.2],
    [batB[0] - nx * 3.2, batB[1] - ny * 3.2],
    [handleEnd[0] - nx * 2.6, handleEnd[1] - ny * 2.6],
  ]
    .map((q) => q.map((v) => v.toFixed(2)).join(" "))
    .join(" L");
  const torso = [p.fs, p.bs, p.bh, p.fh].map((q) => q.map((v) => v.toFixed(2)).join(" ")).join(" L");
  return (
    <g filter={`url(#${id}-wobble)`} strokeLinejoin="round">
      {/* back side first */}
      <Limb a={p.bheel} b={p.btoe} w={3.6} fill={SHOE} />
      <Limb a={p.bh} b={p.bk} w={7.4} fill={TROUSERS} />
      <Limb a={p.bk} b={p.ba} w={8.6} fill={PAD} />
      <line x1={p.bk[0]} y1={p.bk[1] + 2} x2={p.ba[0]} y2={p.ba[1] - 2} stroke={INK} strokeWidth={0.5} opacity={0.5} />
      <Limb a={p.bs} b={p.be} w={5} fill={SHIRT_DARK} />
      <Limb a={p.be} b={p.bw} w={4.6} fill={SHIRT_DARK} />
      {/* trunk and head */}
      {/* neck: shirt collar up to the helmet */}
      <Limb a={mid(p.fs, p.bs)} b={[p.head[0] - 0.5, p.head[1] + 4]} w={4.6} fill={SHIRT} />
      {/* a rounded torso: ink first, the shirt inset over it */}
      <path d={`M${torso} Z`} fill={INK} stroke={INK} strokeWidth={7.2} />
      <path d={`M${torso} Z`} fill={SHIRT} stroke={SHIRT} strokeWidth={5} />
      <circle cx={p.head[0]} cy={p.head[1]} r={6.9} fill={HELMET} stroke={INK} strokeWidth={1.1} />
      <path d={`M${p.head[0] + 2.2} ${p.head[1] - 6.4} q 6.4 1.4 6.4 6.4`} fill="none" stroke={INK} strokeWidth={1.1} />
      {/* grille */}
      <path d={`M${p.head[0] + 4.6} ${p.head[1] - 1} l 3.6 0.6 M${p.head[0] + 4.4} ${p.head[1] + 1.6} l 3.6 0.4 M${p.head[0] + 3.8} ${p.head[1] + 4} l 3.2 0.2 M${p.head[0] + 6.4} ${p.head[1] - 1} l 0.4 5.4`} stroke="#c9ced6" strokeWidth={0.9} strokeLinecap="round" />
      {/* front leg */}
      <Limb a={p.fheel} b={p.ftoe} w={3.6} fill={SHOE} />
      <Limb a={p.fh} b={p.fk} w={7.6} fill={TROUSERS} />
      <Limb a={p.fk} b={p.fa} w={8.8} fill={PAD} />
      <line x1={p.fk[0] - 1.6} y1={p.fk[1] + 2} x2={p.fa[0] - 1.6} y2={p.fa[1] - 2} stroke={INK} strokeWidth={0.5} opacity={0.5} />
      <line x1={p.fk[0] + 1.6} y1={p.fk[1] + 2} x2={p.fa[0] + 1.6} y2={p.fa[1] - 2} stroke={INK} strokeWidth={0.5} opacity={0.5} />
      {/* bat, then the front arm and gloves over it */}
      <line x1={batA[0]} y1={batA[1]} x2={handleEnd[0]} y2={handleEnd[1]} stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <line x1={batA[0]} y1={batA[1]} x2={handleEnd[0]} y2={handleEnd[1]} stroke="#7a5230" strokeWidth={1.6} strokeLinecap="round" />
      <path d={`M${blade} Z`} fill={BAT} stroke={INK} strokeWidth={1.1} />
      <Limb a={p.fs} b={p.fe} w={5.2} fill={SHIRT} />
      <Limb a={p.fe} b={p.fw} w={4.8} fill={SHIRT} />
      <circle cx={p.bw[0]} cy={p.bw[1]} r={3.4} fill={GLOVE} stroke={INK} strokeWidth={1.1} />
      <circle cx={p.fw[0]} cy={p.fw[1]} r={3.6} fill={GLOVE} stroke={INK} strokeWidth={1.1} />
    </g>
  );
}

export type GhostPart = "front_leg" | "back_leg" | "head" | "trunk" | "hands" | "stride";

/** The textbook position as a dashed outline: only the part a chapter is about. */
export function GhostFigure({ p, parts }: { p: FigurePose; parts: GhostPart[] }) {
  const seg: Array<[Pt, Pt]> = [];
  if (parts.includes("front_leg")) seg.push([p.fh, p.fk], [p.fk, p.fa]);
  if (parts.includes("back_leg") || parts.includes("stride")) seg.push([p.bh, p.bk], [p.bk, p.ba]);
  if (parts.includes("trunk")) seg.push([mid(p.fh, p.bh), mid(p.fs, p.bs)]);
  if (parts.includes("hands")) seg.push([p.fe, p.fw]);
  return (
    <g stroke={ZONE} strokeWidth={1.5} strokeDasharray="2.4 2" strokeLinecap="round" fill="none">
      {seg.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      ))}
      {parts.includes("head") && <circle cx={p.head[0]} cy={p.head[1]} r={6.6} />}
      {parts.includes("hands") && <circle cx={mid(p.fw, p.bw)[0]} cy={mid(p.fw, p.bw)[1]} r={3.6} />}
      {parts.includes("stride") && <ellipse cx={p.ba[0]} cy={p.ba[1] + 1.5} rx={4.5} ry={2} />}
    </g>
  );
}
