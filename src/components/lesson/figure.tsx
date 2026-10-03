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
export const GOOD = "#1f9d6b";
export const OFF = "#e05a47";
export const ZONE = "#e8b23a";

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

const f = (q: Pt) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
const lerp = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/**
 * A limb from a to b whose full width follows `profile` ([t along the limb, width] pairs):
 * a thigh swells above the knee and narrows into it, a forearm swells below the elbow.
 * Round at both ends.
 */
function limb(a: Pt, b: Pt, profile: Array<[number, number]>): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / L;
  const ny = dx / L;
  const width = (t: number) => {
    for (let i = 1; i < profile.length; i++) {
      const [t0, w0] = profile[i - 1]!;
      const [t1, w1] = profile[i]!;
      if (t <= t1) {
        const u = (t - t0) / (t1 - t0 || 1);
        const e = u * u * (3 - 2 * u);
        return w0 + (w1 - w0) * e;
      }
    }
    return profile[profile.length - 1]![1];
  };
  const N = 12;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = width(t) / 2;
    const c: Pt = [a[0] + dx * t, a[1] + dy * t];
    left.push([c[0] + nx * w, c[1] + ny * w]);
    right.push([c[0] - nx * w, c[1] - ny * w]);
  }
  const ra = (width(0) / 2).toFixed(2);
  const rb = (width(1) / 2).toFixed(2);
  return `M${left.map(f).join(" L")} A${rb} ${rb} 0 0 0 ${f(right[N]!)} L${right.reverse().map(f).join(" L")} A${ra} ${ra} 0 0 0 ${f(left[0]!)} Z`;
}

const capsule = (a: Pt, b: Pt, wa: number, wb: number) => limb(a, b, [[0, wa], [1, wb]]);
const polygon = (pts: Pt[]) => `M${pts.map(f).join(" L")} Z`;

/** A colour lit from the upper left: its light and shadow tones. */
type Tone = readonly [light: string, shade: string];
const SHIRT: Tone = ["#3a7cc2", "#245a93"];
const SHIRT_BACK: Tone = ["#2f6aa8", "#1e4c7e"];
const SKIN: Tone = ["#c98f63", "#a26b45"];
const SKIN_BACK: Tone = ["#b98159", "#93603e"];
const TROUSERS: Tone = ["#f6f1e6", "#d9d1bf"];
const TROUSERS_BACK: Tone = ["#e4ddcd", "#c7bea9"];
const PAD: Tone = ["#fffdf7", "#e1dac8"];
const PAD_BACK: Tone = ["#eee8da", "#d2cab6"];
const HELMET: Tone = ["#2a4a77", "#142a49"];
const GLOVE: Tone = ["#ffffff", "#d5d9df"];
const SHOE: Tone = ["#ffffff", "#d3d6db"];
const BAT_TONE: Tone = ["#e8c891", "#c49d62"];

/**
 * Light and shadow across a part running from a to b, `w` wide: lit on its upper-left
 * side, a firm shadow on the other (flat-colour shading, as in an animated film).
 */
function shading(id: string, a: Pt, b: Pt, w: number, tone: Tone, split = 0.6) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1e-6;
  let nx = -dy / L;
  let ny = dx / L;
  // Toward the shadow: away from a light at the upper left.
  if (nx * 0.6 + ny * 0.8 < 0) [nx, ny] = [-nx, -ny];
  const m = mid(a, b);
  const def = (
    <linearGradient key={id} id={id} gradientUnits="userSpaceOnUse" x1={m[0] - (nx * w) / 2} y1={m[1] - (ny * w) / 2} x2={m[0] + (nx * w) / 2} y2={m[1] + (ny * w) / 2}>
      <stop offset={0} stopColor={tone[0]} />
      <stop offset={split} stopColor={tone[0]} />
      <stop offset={split} stopColor={tone[1]} />
      <stop offset={1} stopColor={tone[1]} />
    </linearGradient>
  );
  return { fill: `url(#${id})`, def };
}

/**
 * Parts drawn as one piece: the ink outline of all of them first, then their colours, so
 * a knee or an elbow shows no seam where two segments overlap.
 */
function Piece({ parts }: { parts: Array<{ d: string; fill: string; grow?: number }> }) {
  return (
    <g>
      {parts.map((x, i) => (
        <path key={`o${i}`} d={x.d} fill={INK} stroke={INK} strokeWidth={(x.grow ?? 0) + 1.4} strokeLinejoin="round" />
      ))}
      {parts.map((x, i) => (
        <path key={`f${i}`} d={x.d} fill={x.fill} stroke={x.grow ? x.fill : "none"} strokeWidth={x.grow ?? 0} strokeLinejoin="round" />
      ))}
    </g>
  );
}

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

/** The bat alone (also used, faded, for the trail it leaves when it moves fast). */
export function BatShape({ p, id, ghost }: { p: FigurePose; id: string; ghost?: number }) {
  const [batA, batB] = batLine(p);
  const L = Math.hypot(batB[0] - batA[0], batB[1] - batA[1]) || 1;
  const ux = (batB[0] - batA[0]) / L;
  const uy = (batB[1] - batA[1]) / L;
  const at = (d: number, side: number, w: number): Pt => [batA[0] + ux * d - uy * side * w, batA[1] + uy * d + ux * side * w];
  // Handle, then shoulders of the blade, a toe a touch wider: a cricket bat, not a plank.
  const blade = polygon([at(12, 1, 1.6), at(14.5, 1, 2.9), at(47, 1, 3.1), at(48, 0.6, 3.1), at(48, -0.6, 3.1), at(47, -1, 3.1), at(14.5, -1, 2.9), at(12, -1, 1.6)]);
  if (ghost !== undefined) return <path d={blade} fill={BAT_TONE[0]} opacity={ghost} />;
  const sh = shading(`${id}-bat`, at(30, 0, 0), at(31, 0, 0), 6.2, BAT_TONE, 0.55);
  return (
    <g>
      <defs>{sh.def}</defs>
      <path d={`M${f(batA)} L${f(at(13, 0, 0))}`} stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
      <path d={`M${f(batA)} L${f(at(13, 0, 0))}`} stroke="#33302d" strokeWidth={1.5} strokeLinecap="round" />
      <path d={`M${f(at(3, 1, 0.8))} L${f(at(3, -1, 0.8))} M${f(at(6, 1, 0.8))} L${f(at(6, -1, 0.8))} M${f(at(9, 1, 0.8))} L${f(at(9, -1, 0.8))}`} stroke="#5a5550" strokeWidth={0.4} />
      <path d={blade} fill={sh.fill} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

/** The batter's stumps and bails, side on, at their base. */
export function Stumps({ at }: { at: Pt }) {
  const h = 40.6; // 71 cm on a 1.75 m batter
  return (
    <g>
      {[-1.4, 0.8].map((o) => (
        <rect key={o} x={at[0] + o - 0.8} y={at[1] - h} width={1.6} height={h} rx={0.6} fill="#f2e6cc" stroke={INK} strokeWidth={0.5} />
      ))}
      <rect x={at[0] - 2.8} y={at[1] - h - 1.2} width={5.4} height={1.1} rx={0.5} fill="#f2e6cc" stroke={INK} strokeWidth={0.4} />
    </g>
  );
}

/** The ball, with its seam and a streak behind it when it is moving fast. */
export function Ball({ at, from }: { at: Pt; from?: Pt }) {
  const r = 2;
  const v = from ? [at[0] - from[0], at[1] - from[1]] : [0, 0];
  const sp = Math.hypot(v[0]!, v[1]!);
  return (
    <g>
      {sp > 1.2 && (
        <path d={`M${f(at)} L${f([at[0] - (v[0]! / sp) * Math.min(14, sp * 2.2), at[1] - (v[1]! / sp) * Math.min(14, sp * 2.2)])}`} stroke="#c8352b" strokeWidth={2.6} strokeLinecap="round" opacity={0.18} />
      )}
      <circle cx={at[0]} cy={at[1]} r={r} fill="#c8352b" stroke={INK} strokeWidth={0.5} />
      <path d={`M${f([at[0] - 1.2, at[1] - 1.5])} Q ${f([at[0] + 0.4, at[1]])} ${f([at[0] - 1.2, at[1] + 1.5])}`} stroke="#f6e6d8" strokeWidth={0.45} fill="none" />
    </g>
  );
}

/**
 * Widths in figure units (standing height 100), from adult proportions: a thigh about 10
 * at the hip swelling slightly and narrowing to 7 at the knee, a padded shin about 7.5
 * with a roll at the knee, a short sleeve over a 5-wide upper arm, a forearm that swells
 * below the elbow, a trunk as broad as the shoulders and hips (never under 11, a chest
 * edge-on) drawing in at the waist, a head about 13 tall.
 */
export function BatterFigure({ p, id = "fig" }: { p: FigurePose; id?: string }) {
  const defs: React.ReactNode[] = [];
  const tone = (key: string, a: Pt, b: Pt, w: number, t: Tone, split?: number) => {
    const sh = shading(`${id}-${key}`, a, b, w, t, split);
    defs.push(sh.def);
    return sh.fill;
  };
  const shoulders = mid(p.fs, p.bs);
  const hips = mid(p.fh, p.bh);
  const neckTop: Pt = [p.head[0] - 0.8, p.head[1] + 4.2];
  const spineAt = (u: number) => lerp(shoulders, hips, u);
  const inward = (q: Pt, u: number): Pt => lerp(q, spineAt(0.62), u);
  const waistF = inward(lerp(p.fs, p.fh, 0.66), 0.22);
  const waistB = inward(lerp(p.bs, p.bh, 0.66), 0.22);
  const broad = Math.max(12, Math.hypot(p.fs[0] - p.bs[0], p.fs[1] - p.bs[1]) + 5);
  const leg = (side: "f" | "b") => {
    const [h, k, a, heel, toe] = side === "f" ? [p.fh, p.fk, p.fa, p.fheel, p.ftoe] : [p.bh, p.bk, p.ba, p.bheel, p.btoe];
    const back = side === "b";
    return [
      { d: capsule(heel, toe, 4.8, 4), fill: tone(`${side}shoe`, heel, toe, 4.8, SHOE, 0.55) },
      { d: limb(h, k, [[0, 10], [0.3, 10.4], [0.75, 7.6], [1, 7]]), fill: tone(`${side}thigh`, h, k, 10.4, back ? TROUSERS_BACK : TROUSERS) },
      { d: limb(k, a, [[0, 8.2], [0.1, 8.8], [0.22, 7.6], [0.7, 7.3], [1, 6.4]]), fill: tone(`${side}pad`, k, a, 8.8, back ? PAD_BACK : PAD, 0.66) },
    ];
  };
  const arm = (side: "f" | "b") => {
    const [s, e, w] = side === "f" ? [p.fs, p.fe, p.fw] : [p.bs, p.be, p.bw];
    const back = side === "b";
    const sleeveEnd = lerp(s, e, 0.45);
    return [
      { d: limb(s, e, [[0, 5.2], [0.35, 5], [0.65, 4.3], [1, 3.7]]), fill: tone(`${side}upper`, s, e, 5.2, back ? SKIN_BACK : SKIN) },
      { d: limb(e, w, [[0, 3.7], [0.3, 4.1], [1, 2.9]]), fill: tone(`${side}fore`, e, w, 4.1, back ? SKIN_BACK : SKIN) },
      { d: limb(s, sleeveEnd, [[0, 6.2], [1, 5.8]]), fill: tone(`${side}sleeve`, s, sleeveEnd, 6.2, back ? SHIRT_BACK : SHIRT) },
    ];
  };
  const [batA, batB] = batLine(p);
  const bl = Math.hypot(batB[0] - batA[0], batB[1] - batA[1]) || 1;
  const ux = (batB[0] - batA[0]) / bl;
  const uy = (batB[1] - batA[1]) / bl;
  const glove = (w: Pt, key: string) => {
    const a: Pt = [w[0] - ux * 2, w[1] - uy * 2];
    const b: Pt = [w[0] + ux * 2, w[1] + uy * 2];
    return { d: capsule(a, b, 4.6, 4.4), fill: tone(key, a, b, 4.6, GLOVE, 0.62) };
  };
  const fingers = (w: Pt) => [-1.1, 0, 1.1].map((o) => `M${f([w[0] + ux * o - uy * 1.2, w[1] + uy * o + ux * 1.2])} L${f([w[0] + ux * o + uy * 1.6, w[1] + uy * o - ux * 1.6])}`).join(" ");
  const canes = (k: Pt, a: Pt) =>
    [-1.6, 0, 1.6]
      .map((o) => {
        const d = Math.hypot(a[0] - k[0], a[1] - k[1]) || 1;
        const nx = -(a[1] - k[1]) / d;
        const ny = (a[0] - k[0]) / d;
        const p0 = lerp(k, a, 0.24);
        const p1 = lerp(k, a, 0.9);
        return `M${f([p0[0] + nx * o, p0[1] + ny * o])} L${f([p1[0] + nx * o, p1[1] + ny * o])}`;
      })
      .join(" ");
  const trunkFill = tone("trunk", shoulders, hips, broad, SHIRT, 0.62);
  const helmetFill = `url(#${id}-helmet)`;
  defs.push(
    <radialGradient key={`${id}-helmet`} id={`${id}-helmet`} cx="35%" cy="30%" r="75%">
      <stop offset={0} stopColor="#3b5d8f" />
      <stop offset={0.55} stopColor={HELMET[0]} />
      <stop offset={0.56} stopColor={HELMET[1]} />
      <stop offset={1} stopColor={HELMET[1]} />
    </radialGradient>,
  );
  const H = p.head;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>{defs}</defs>
      {/* contact shadows: the feet on the ground */}
      {[mid(p.bheel, p.btoe), mid(p.fheel, p.ftoe)].map((q, i) => (
        <ellipse key={i} cx={q[0]} cy={101.2} rx={6.5} ry={1.3} fill={INK} opacity={0.14} />
      ))}
      {/* back side first, a shade darker */}
      <Piece parts={leg("b")} />
      <path d={canes(p.bk, p.ba)} stroke={INK} strokeWidth={0.35} opacity={0.3} fill="none" />
      <Piece parts={arm("b")} />
      {/* trunk, neck and head */}
      <Piece parts={[{ d: capsule(shoulders, neckTop, 5, 4.6), fill: tone("neck", shoulders, neckTop, 5, SKIN) }]} />
      {/* trunk: broad, rounded shoulders drawing in to the waist; trousers from the belt */}
      <Piece
        parts={[
          { d: polygon([p.fs, p.bs, waistB, p.bh, p.fh, waistF]), fill: trunkFill, grow: 4 },
          { d: capsule(spineAt(0.85), spineAt(0.05), 10.5, 11.5), fill: trunkFill },
          { d: capsule(p.fs, lerp(p.fs, p.fe, 0.18), 7.4, 6.6), fill: trunkFill },
          { d: capsule(p.bs, lerp(p.bs, p.be, 0.18), 7.4, 6.6), fill: trunkFill },
        ]}
      />
      <Piece parts={[{ d: capsule(p.bh, p.fh, 9.6, 9.6), fill: tone("seat", p.bh, p.fh, 9.6, TROUSERS) }]} />
      <path d={`M${f(lerp(p.bh, p.fh, -0.12))} L${f(lerp(p.fh, p.bh, -0.12))}`} transform={`translate(0 ${-3.6})`} stroke={INK} strokeWidth={0.5} opacity={0.35} />
      {/* collar */}
      <path d={`M${f(lerp(shoulders, p.fs, 0.35))} L${f(lerp(shoulders, spineAt(0.25), 0.6))} L${f(lerp(shoulders, p.bs, 0.35))}`} stroke="#ffffff" strokeWidth={0.9} fill="none" opacity={0.85} />
      {/* helmet: shell, neck guard, the face behind the grille, the peak */}
      <path d={`M${f([H[0] - 5.6, H[1] + 3.2])} Q ${f([H[0] - 6.4, H[1] + 7.2])} ${f([H[0] - 2.6, H[1] + 7.4])} L${f([H[0] - 1.6, H[1] + 4.6])} Z`} fill={HELMET[1]} stroke={INK} strokeWidth={0.6} />
      <circle cx={H[0]} cy={H[1]} r={6.4} fill={helmetFill} stroke={INK} strokeWidth={0.9} />
      <ellipse cx={H[0] + 4.1} cy={H[1] + 2.4} rx={2.9} ry={3.6} fill={SKIN[0]} stroke={INK} strokeWidth={0.5} />
      <path d={`M${f([H[0] + 1.2, H[1] - 6])} Q ${f([H[0] + 7.8, H[1] - 5.6])} ${f([H[0] + 9.2, H[1] - 2.4])} L${f([H[0] + 5.6, H[1] - 3])} Z`} fill={HELMET[0]} stroke={INK} strokeWidth={0.7} />
      <path
        d={`M${f([H[0] + 6.6, H[1] - 2.2])} Q ${f([H[0] + 9.2, H[1] + 1.8])} ${f([H[0] + 5.4, H[1] + 6.2])} M${f([H[0] + 4, H[1] - 0.2])} L${f([H[0] + 8.1, H[1] + 0.1])} M${f([H[0] + 3.6, H[1] + 2.4])} L${f([H[0] + 7.6, H[1] + 2.7])} M${f([H[0] + 3.4, H[1] + 4.8])} L${f([H[0] + 6.6, H[1] + 5])}`}
        stroke="#d4d8de"
        strokeWidth={0.75}
        fill="none"
      />
      {/* front leg */}
      <Piece parts={leg("f")} />
      <path d={canes(p.fk, p.fa)} stroke={INK} strokeWidth={0.35} opacity={0.3} fill="none" />
      {/* bat, then the front arm and gloves over it */}
      <BatShape p={p} id={id} />
      <Piece parts={arm("f")} />
      <Piece parts={[glove(p.bw, "bglove"), glove(p.fw, "fglove")]} />
      <path d={`${fingers(p.bw)} ${fingers(p.fw)}`} stroke={INK} strokeWidth={0.35} opacity={0.45} />
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
