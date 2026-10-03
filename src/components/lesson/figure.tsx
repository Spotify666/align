"use client";
// An illustrated batter drawn from a pose: helmet, shirt, padded legs, gloves and a bat,
// in flat colour with a thin ink line. Limbs taper the way a body does (a thigh is wider
// at the hip than at the knee) and keep their length, so the figure moves like a person.
// Every lesson illustration starts here. Poses are in figure units (see ./pose).

import { mid, type FigurePose, type Pt } from "./pose";

export { alignAt, figurePose, mid, type FigurePose, type Pt } from "./pose";

/** Illustration palette: flat colours on paper, the same in both themes except paper and ink. */
export const INK = "var(--ill-ink)";
export const PAPER = "var(--ill-paper)";
const SHIRT = "#2f6fb0";
const SHIRT_DARK = "#255a91";
const TROUSERS = "#f1ece1";
const TROUSERS_DARK = "#ddd6c6";
const PAD = "#fffaf0";
const PAD_DARK = "#ebe5d6";
const HELMET = "#1f3a5f";
const GRILLE = "#c9ced6";
const SKIN = "#c68e62";
const GLOVE = "#ffffff";
const BAT = "#e2c08a";
const GRIP = "#7a5230";
const SHOE = "#ffffff";
export const GOOD = "#1f9d6b";
export const OFF = "#e05a47";
export const ZONE = "#e8b23a";

/** The bat, from the hands: the tracked bat's direction, else held down beside the front pad. */
function batLine(p: FigurePose): [Pt, Pt] {
  const hands = mid(p.fw, p.bw);
  const target: Pt = p.batH && p.batT ? [hands[0] + p.batT[0] - p.batH[0], hands[1] + p.batT[1] - p.batH[1]] : [p.fk[0] + 5, p.fa[1] - 4];
  const dx = target[0] - hands[0];
  const dy = target[1] - hands[1];
  const L = Math.hypot(dx, dy) || 1;
  // A full-size bat is about half a batter's height.
  const len = 48;
  return [hands, [hands[0] + (dx / L) * len, hands[1] + (dy / L) * len]];
}

const f = (q: Pt) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`;

/** A limb as a tapered capsule from a (width wa) to b (width wb), round at both ends. */
function capsule(a: Pt, b: Pt, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / L;
  const ny = dx / L;
  const ra = wa / 2;
  const rb = wb / 2;
  const p1: Pt = [a[0] + nx * ra, a[1] + ny * ra];
  const p2: Pt = [b[0] + nx * rb, b[1] + ny * rb];
  const p3: Pt = [b[0] - nx * rb, b[1] - ny * rb];
  const p4: Pt = [a[0] - nx * ra, a[1] - ny * ra];
  return `M${f(p1)} L${f(p2)} A${rb.toFixed(2)} ${rb.toFixed(2)} 0 0 0 ${f(p3)} L${f(p4)} A${ra.toFixed(2)} ${ra.toFixed(2)} 0 0 0 ${f(p1)} Z`;
}

/**
 * Parts drawn as one piece: the ink outline of all of them first, then their colours, so
 * a knee or an elbow shows no seam where two segments overlap.
 */
function Piece({ parts }: { parts: Array<{ d: string; fill: string; grow?: number }> }) {
  return (
    <g>
      {parts.map((x, i) => (
        <path key={`o${i}`} d={x.d} fill={INK} stroke={INK} strokeWidth={(x.grow ?? 0) + 1.5} strokeLinejoin="round" />
      ))}
      {parts.map((x, i) => (
        <path key={`f${i}`} d={x.d} fill={x.fill} stroke={x.grow ? x.fill : "none"} strokeWidth={x.grow ?? 0} strokeLinejoin="round" />
      ))}
    </g>
  );
}

const polygon = (pts: Pt[]) => `M${pts.map(f).join(" L")} Z`;

/** Shared SVG definitions: the paper grain. Render once per SVG. */
export function FigureDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-grain`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0" />
      </filter>
    </defs>
  );
}

/**
 * Widths in figure units (standing height 100), from adult proportions: thigh about 9 at
 * the hip narrowing to 6.5 at the knee, a padded shin about 7, upper arm 5, forearm 4, a
 * trunk as broad as the shoulders and hips (never under 11, a chest edge-on), a head
 * about 13 tall.
 */
export function BatterFigure({ p }: { p: FigurePose; id?: string }) {
  const [batA, batB] = batLine(p);
  const bdx = batB[0] - batA[0];
  const bdy = batB[1] - batA[1];
  const bl = Math.hypot(bdx, bdy) || 1;
  const ux = bdx / bl;
  const uy = bdy / bl;
  const along = (d: number): Pt => [batA[0] + ux * d, batA[1] + uy * d];
  const handleEnd = along(13);
  const shoulders = mid(p.fs, p.bs);
  const hips = mid(p.fh, p.bh);
  const neckTop: Pt = [p.head[0] - 0.8, p.head[1] + 4.2];
  // The trunk follows the shoulders and hips (broad when the chest faces the camera, as
  // it does side-on, narrower as it turns), never thinner than a chest seen edge-on.
  // Shoulders broader than the waist: the sides draw in a little above the hips.
  const lerp = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const spine = (q: Pt, u: number): Pt => [q[0] + (lerp(shoulders, hips, 0.62)[0] - q[0]) * u, q[1] + (lerp(shoulders, hips, 0.62)[1] - q[1]) * u];
  const waistF = spine(lerp(p.fs, p.fh, 0.62), 0.14);
  const waistB = spine(lerp(p.bs, p.bh, 0.62), 0.14);
  const trunk = [
    { d: polygon([p.fs, p.bs, waistB, p.bh, p.fh, waistF]), fill: SHIRT, grow: 4 },
    { d: capsule(lerp(hips, shoulders, 0.15), lerp(hips, shoulders, 0.95), 10.5, 11.5), fill: SHIRT },
  ];
  const leg = (h: Pt, k: Pt, a: Pt, heel: Pt, toe: Pt, shade: number) => [
    { d: capsule(heel, toe, 4.4, 3.6), fill: SHOE },
    { d: capsule(h, k, 9, 6.4), fill: shade ? TROUSERS_DARK : TROUSERS },
    { d: capsule(k, a, 7.4, 6.2), fill: shade ? PAD_DARK : PAD },
  ];
  const arm = (s: Pt, e: Pt, w: Pt, fill: string) => [
    { d: capsule(s, e, 5, 4), fill },
    { d: capsule(e, w, 4, 3.2), fill },
  ];
  const canes = (k: Pt, a: Pt) => {
    const dx = a[0] - k[0];
    const dy = a[1] - k[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const from = (o: number): Pt => [k[0] + dx * 0.18 + nx * o, k[1] + dy * 0.18 + ny * o];
    const to = (o: number): Pt => [k[0] + dx * 0.9 + nx * o, k[1] + dy * 0.9 + ny * o];
    return `M${f(from(-1.2))} L${f(to(-1.1))} M${f(from(1.2))} L${f(to(1.1))}`;
  };
  const glove = (w: Pt) => capsule([w[0] - ux * 1.6, w[1] - uy * 1.6], [w[0] + ux * 1.6, w[1] + uy * 1.6], 3.6, 3.6);
  const blade = [
    [handleEnd[0] - uy * 2.4, handleEnd[1] + ux * 2.4],
    [batB[0] - uy * 2.9, batB[1] + ux * 2.9],
    [batB[0] + uy * 2.9, batB[1] - ux * 2.9],
    [handleEnd[0] + uy * 2.4, handleEnd[1] - ux * 2.4],
  ]
    .map((q) => f(q as Pt))
    .join(" L");
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* back side first, a shade darker */}
      <Piece parts={leg(p.bh, p.bk, p.ba, p.bheel, p.btoe, 1)} />
      <path d={canes(p.bk, p.ba)} stroke={INK} strokeWidth={0.4} opacity={0.35} fill="none" />
      <Piece parts={arm(p.bs, p.be, p.bw, SHIRT_DARK)} />
      {/* trunk, neck and head */}
      <Piece parts={[{ d: capsule(shoulders, neckTop, 4.8, 4.4), fill: SKIN }]} />
      <Piece parts={trunk} />
      <circle cx={p.head[0]} cy={p.head[1]} r={6.3} fill={HELMET} stroke={INK} strokeWidth={0.8} />
      {/* peak and grille, facing the bowler */}
      <path d={`M${f([p.head[0] + 1.5, p.head[1] - 5.9])} Q ${f([p.head[0] + 7.6, p.head[1] - 5.2])} ${f([p.head[0] + 8.6, p.head[1] - 2.4])} L${f([p.head[0] + 5.4, p.head[1] - 3.2])} Z`} fill={HELMET} stroke={INK} strokeWidth={0.7} />
      <path
        d={`M${f([p.head[0] + 5.8, p.head[1] - 1.6])} Q ${f([p.head[0] + 8.4, p.head[1] + 1.6])} ${f([p.head[0] + 5.2, p.head[1] + 5.4])} M${f([p.head[0] + 4.6, p.head[1] + 0.4])} L${f([p.head[0] + 7.6, p.head[1] + 0.6])} M${f([p.head[0] + 4.4, p.head[1] + 2.8])} L${f([p.head[0] + 7.0, p.head[1] + 3.0])}`}
        stroke={GRILLE}
        strokeWidth={0.7}
        fill="none"
      />
      {/* front leg */}
      <Piece parts={leg(p.fh, p.fk, p.fa, p.fheel, p.ftoe, 0)} />
      <path d={canes(p.fk, p.fa)} stroke={INK} strokeWidth={0.4} opacity={0.35} fill="none" />
      {/* bat, then the front arm and gloves over it */}
      <path d={`M${f(batA)} L${f(handleEnd)}`} stroke={INK} strokeWidth={2.6} />
      <path d={`M${f(batA)} L${f(handleEnd)}`} stroke={GRIP} strokeWidth={1.4} />
      <path d={`M${blade} Z`} fill={BAT} stroke={INK} strokeWidth={0.8} />
      <Piece parts={arm(p.fs, p.fe, p.fw, SHIRT)} />
      <Piece
        parts={[
          { d: glove(p.bw), fill: GLOVE },
          { d: glove(p.fw), fill: GLOVE },
        ]}
      />
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
