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
 * Light and shadow, one gradient per colour, defined once per drawing (see FigureDefs):
 * lit on the left, a firm shadow on the right of each part (flat-colour shading, as in an
 * animated film). Defined once, so a moving figure only moves shapes.
 */
const TONES = {
  shirt: [SHIRT, 0.6],
  shirtBack: [SHIRT_BACK, 0.6],
  skin: [SKIN, 0.6],
  skinBack: [SKIN_BACK, 0.6],
  trousers: [TROUSERS, 0.6],
  trousersBack: [TROUSERS_BACK, 0.6],
  pad: [PAD, 0.66],
  padBack: [PAD_BACK, 0.66],
  glove: [GLOVE, 0.62],
  shoe: [SHOE, 0.55],
  bat: [BAT_TONE, 0.55],
} as const satisfies Record<string, readonly [Tone, number]>;
type ToneName = keyof typeof TONES;
const toneFill = (id: string, name: ToneName) => `url(#${id}-${name})`;

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
      {(Object.keys(TONES) as ToneName[]).map((name) => {
        const [[light, shade], split] = TONES[name];
        return (
          <linearGradient key={name} id={`${id}-${name}`} x1={0} y1={0.3} x2={1} y2={0.7}>
            <stop offset={0} stopColor={light} />
            <stop offset={split} stopColor={light} />
            <stop offset={split} stopColor={shade} />
            <stop offset={1} stopColor={shade} />
          </linearGradient>
        );
      })}
      <radialGradient id={`${id}-helmet`} cx="35%" cy="30%" r="75%">
        <stop offset={0} stopColor="#3b5d8f" />
        <stop offset={0.55} stopColor={HELMET[0]} />
        <stop offset={0.56} stopColor={HELMET[1]} />
        <stop offset={1} stopColor={HELMET[1]} />
      </radialGradient>
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
  return (
    <g>
      <path d={`M${f(batA)} L${f(at(13, 0, 0))}`} stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
      <path d={`M${f(batA)} L${f(at(13, 0, 0))}`} stroke="#33302d" strokeWidth={1.5} strokeLinecap="round" />
      <path d={`M${f(at(3, 1, 0.8))} L${f(at(3, -1, 0.8))} M${f(at(6, 1, 0.8))} L${f(at(6, -1, 0.8))} M${f(at(9, 1, 0.8))} L${f(at(9, -1, 0.8))}`} stroke="#5a5550" strokeWidth={0.4} />
      <path d={blade} fill={toneFill(id, "bat")} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
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

/** Points through which a smooth curve passes (Catmull-Rom as cubic Béziers). */
function curveThrough(pts: Pt[]): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d;
}

/**
 * The torso, built around the spine (hips to shoulders): rounded shoulders, the chest, a
 * taper to the waist and out again to the hips. Its width comes from how far apart the
 * shoulders and hips are in the picture (broad when the chest faces the camera, narrower
 * as the batter turns), never thinner than a chest edge-on. The neck rises from a base
 * no further than a neck's length from the head: when the head leans out over the front
 * knee, the upper back and trapezius rise toward it, as a body does, instead of the
 * head floating on a long neck above square shoulders.
 */
function torso(p: FigurePose) {
  const S = mid(p.fs, p.bs);
  const Hm = mid(p.fh, p.bh);
  let ux = S[0] - Hm[0];
  let uy = S[1] - Hm[1];
  const Ls = Math.hypot(ux, uy) || 1;
  ux /= Ls;
  uy /= Ls;
  // Across the body, toward the front shoulder.
  let vx = -uy;
  let vy = ux;
  if ((p.fs[0] - p.bs[0]) * vx + (p.fs[1] - p.bs[1]) * vy < 0) [vx, vy] = [-vx, -vy];
  const ws = Math.abs((p.fs[0] - p.bs[0]) * vx + (p.fs[1] - p.bs[1]) * vy) / 2;
  const wh = Math.abs((p.fh[0] - p.bh[0]) * vx + (p.fh[1] - p.bh[1]) * vy) / 2;
  const sw = Math.max(5.8, ws);
  // An athlete's V: broad across the shoulders, narrowing through the lats to a trim waist,
  // the shirt tucked in at the belt. A chest seen edge-on keeps its depth instead.
  const waist = Math.max(Math.min(5.6, sw * 0.95), Math.min(sw * 0.56, 7));
  const belt = Math.max(6, Math.min(waist + 0.8, wh + 2.2));
  const P = (s: number, x: number): Pt => [Hm[0] + ux * s * Ls + vx * x, Hm[1] + uy * s * Ls + vy * x];
  // The neck's base: above the shoulders, drawn toward the head when it leans away.
  const toHead: Pt = [p.head[0] - S[0], p.head[1] - S[1]];
  const dh = Math.hypot(toHead[0], toHead[1]) || 1;
  const rise = Math.min(dh * 0.55, Math.max(3.4, dh - 12));
  const N: Pt = [S[0] + (toHead[0] / dh) * rise, S[1] + (toHead[1] / dh) * rise];
  // Across the neck, toward the front shoulder.
  let nx = -toHead[1] / dh;
  let ny = toHead[0] / dh;
  if (nx * vx + ny * vy < 0) [nx, ny] = [-nx, -ny];
  const off = (q: Pt, x: number, y: number): Pt => [q[0] + vx * x + ux * y, q[1] + vy * x + uy * y];
  // One side, neck to hip; the other is its mirror.
  const side = (k: 1 | -1) => {
    const sh = k === 1 ? p.fs : p.bs;
    const neck: Pt = [N[0] + nx * k * 3.1, N[1] + ny * k * 3.1];
    // The shoulder: a rounded corner over the joint. The deltoid's bulge is the sleeve's,
    // so a shoulder with its arm reaching out of sight shows no knob.
    const cap = [off(sh, -k * 0.2, 3), off(sh, k * 1.6, -0.8)];
    // The trapezius: a convex slope from the neck to the top of the shoulder, rounder the
    // further the neck is drawn from the shoulder (the upper back curving over).
    const top = cap[0]!;
    const m = lerp(neck, top, 0.5);
    const len = Math.hypot(top[0] - neck[0], top[1] - neck[1]) || 1;
    let ox = -(top[1] - neck[1]) / len;
    let oy = (top[0] - neck[0]) / len;
    if (ox * (m[0] - Hm[0]) + oy * (m[1] - Hm[1]) < 0) [ox, oy] = [-ox, -oy];
    const bulge = 0.3 + len * 0.035;
    // Then down from under the arm through the lats to the waist.
    return [neck, [m[0] + ox * bulge, m[1] + oy * bulge] as Pt, ...cap, P(0.78, k * Math.max(5.4, sw - 0.4)), P(0.58, k * Math.max(5.2, sw * 0.74)), P(0.3, k * waist), P(0.02, k * belt)];
  };
  const r = side(1);
  const l = side(-1).reverse();
  const outline = `M${f(r[0]!)}${curveThrough(r)} L${f(l[0]!)}${curveThrough(l)} Z`;
  // Form: the far side (away from the light, upper left) in shadow down the lats, a band
  // that follows the body's edge from under the shoulder to the waist.
  const edge = r.slice(3);
  const depth = [0.8, 3, 3.4, 2.4, 2];
  const inner = edge.map((q, i): Pt => [q[0] - vx * depth[i]!, q[1] - vy * depth[i]!]).reverse();
  const shade = `M${f(edge[0]!)}${curveThrough(edge)} L${f(inner[0]!)}${curveThrough(inner)} Z`;
  // The placket, then a white collar at the neck.
  const down: Pt = [-toHead[0] / dh, -toHead[1] / dh];
  const at = (x: number, y: number): Pt => [N[0] + nx * x + down[0] * y, N[1] + ny * x + down[1] * y];
  // A chest facing the camera shows the line under each pectoral.
  const pecs = ws > 8 ? ([1, -1] as const).map((k) => `M${f(P(0.71, k * 0.6))} Q${f(P(0.6, k * sw * 0.42))} ${f(P(0.69, k * sw * 0.8))}`).join(" ") : "";
  const details = `M${f(at(0, 3.4))} L${f(P(0.62, 0))} ${pecs}`;
  const collar = `M${f(at(3.2, -0.4))} L${f(at(0, 3.6))} L${f(at(-3.2, -0.4))} L${f(at(-1.5, 0.6))} L${f(at(0, 1.6))} L${f(at(1.5, 0.6))} Z`;
  return { outline, details, collar, shade, neck: N };
}

/**
 * Widths in figure units (standing height 100), from adult proportions: a thigh about 10
 * at the hip swelling slightly and narrowing to 7 at the knee, a padded shin about 7.5
 * with a roll at the knee, a short sleeve over a 5-wide upper arm, a forearm that swells
 * below the elbow, a trunk as broad as the shoulders and hips (never under 11, a chest
 * edge-on) drawing in at the waist, a head about 13 tall.
 */
export function BatterFigure({ p: seen, id = "fig" }: { p: FigurePose; id?: string }) {
  // An athlete's build: hips drawn a little narrower than the hip joints read in a picture
  // (a pose model places them wide), so the shoulders stay the broadest part.
  const hm = mid(seen.fh, seen.bh);
  const slim = (q: Pt): Pt => [hm[0] + (q[0] - hm[0]) * 0.74, hm[1] + (q[1] - hm[1]) * 0.74];
  const p: FigurePose = { ...seen, fh: slim(seen.fh), bh: slim(seen.bh) };
  const tone = (name: ToneName) => toneFill(id, name);
  const neckTop: Pt = [p.head[0] - 0.8, p.head[1] + 4.2];
  const chest = torso(p);
  const leg = (side: "f" | "b") => {
    const [h, k, a, heel, toe] = side === "f" ? [p.fh, p.fk, p.fa, p.fheel, p.ftoe] : [p.bh, p.bk, p.ba, p.bheel, p.btoe];
    const back = side === "b";
    return [
      { d: capsule(heel, toe, 4.8, 4), fill: tone("shoe") },
      { d: limb(h, k, [[0, 9.2], [0.3, 9.7], [0.75, 7.3], [1, 6.8]]), fill: tone(back ? "trousersBack" : "trousers") },
      { d: limb(k, a, [[0, 8.2], [0.1, 8.8], [0.22, 7.6], [0.7, 7.3], [1, 6.4]]), fill: tone(back ? "padBack" : "pad") },
    ];
  };
  const arm = (side: "f" | "b") => {
    const [s0, e, w] = side === "f" ? [p.fs, p.fe, p.fw] : [p.bs, p.be, p.bw];
    const back = side === "b";
    const sleeveEnd = lerp(s0, e, 0.45);
    // The back arm starts just inside the torso, so its rounded end never shows past the back.
    const s = back ? lerp(s0, e, 0.22) : s0;
    return [
      { d: limb(s, e, [[0, 6.6], [0.2, 6.8], [0.52, 6], [0.8, 4.8], [1, 4.2]]), fill: tone(back ? "skinBack" : "skin") },
      { d: limb(e, w, [[0, 4.2], [0.25, 5], [1, 3.3]]), fill: tone(back ? "skinBack" : "skin") },
      { d: limb(s, sleeveEnd, [[0, 7.6], [0.55, 7.4], [1, 6.9]]), fill: tone(back ? "shirtBack" : "shirt") },
    ];
  };
  const [batA, batB] = batLine(p);
  const bl = Math.hypot(batB[0] - batA[0], batB[1] - batA[1]) || 1;
  const ux = (batB[0] - batA[0]) / bl;
  const uy = (batB[1] - batA[1]) / bl;
  const glove = (w: Pt) => {
    const a: Pt = [w[0] - ux * 2, w[1] - uy * 2];
    const b: Pt = [w[0] + ux * 2, w[1] + uy * 2];
    return { d: capsule(a, b, 4.6, 4.4), fill: tone("glove") };
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
  const trunkFill = SHIRT[0];
  const helmetFill = `url(#${id}-helmet)`;

  const H = p.head;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* contact shadows: the feet on the ground */}
      {[mid(p.bheel, p.btoe), mid(p.fheel, p.ftoe)].map((q, i) => (
        <ellipse key={i} cx={q[0]} cy={101.2} rx={6.5} ry={1.3} fill={INK} opacity={0.14} />
      ))}
      {/* back side first, a shade darker */}
      <Piece parts={leg("b")} />
      <path d={canes(p.bk, p.ba)} stroke={INK} strokeWidth={0.35} opacity={0.3} fill="none" />
      <Piece parts={arm("b")} />
      {/* trunk, neck and head */}
      <Piece parts={[{ d: capsule(chest.neck, neckTop, 6.2, 5), fill: tone("skin") }]} />
      {/* trousers at the hips, then the shirted torso tucked into them */}
      <Piece parts={[{ d: capsule(p.bh, p.fh, 9.2, 9.2), fill: tone("trousers") }]} />
      <Piece parts={[{ d: chest.outline, fill: trunkFill }]} />
      <path d={chest.shade} fill={SHIRT[1]} opacity={0.75} />
      <path d={chest.details} stroke={INK} strokeWidth={0.45} fill="none" opacity={0.28} />
      <path d={chest.collar} fill="#f4f6f9" stroke={INK} strokeWidth={0.5} />
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
      <Piece parts={[glove(p.bw), glove(p.fw)]} />
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
