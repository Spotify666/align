"use client";
// A batter drawn from a pose, as a flat two-tone silhouette: helmet, padded legs, gloves and
// bat in solid ink on sage-cream paper, no shading, no detail inside the shape. Like a sports
// pictogram, thin paper cut-lines set the near leg, the arms, the gloves and the bat off
// the body behind them, so a learner can read every limb. Limbs taper the way a body does (a thigh is wider at the hip than at the knee)
// and keep their length, so the silhouette moves like a person. Every lesson illustration
// starts here. Poses are in figure units (see ./pose).

import { mid, type FigurePose, type Pt } from "./pose";

export { alignAt, figurePose, mid, type FigurePose, type Pt } from "./pose";

/** Two tones: solid ink on paper (black on sage-cream), the same in both themes. */
export const INK = "var(--ill-ink)";
export const PAPER = "var(--ill-paper)";
/** Annotations are ink too, set off the silhouette by a thin paper halo: no third colour. */
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

/** Width of the paper cut-line that sets a nearer part off the body behind it. */
const RIM = 1.9;

/**
 * Parts drawn as one shape: each filled with ink and edged with a thin ink line, so two
 * overlapping segments (a thigh and a shin at the knee) close into one silhouette. With
 * `rim`, the shape is first cut out of whatever lies behind it by a thin paper line, as in a
 * sports pictogram: the near leg, the arms, the gloves and the bat stay readable against
 * the body, still in two tones. (Within one piece the fills cover the cut, so a leg's own
 * knee shows no seam.)
 */
function Piece({ parts, rim = false }: { parts: string[]; rim?: boolean }) {
  return (
    <g strokeLinejoin="round">
      {rim && (
        <g fill={PAPER} stroke={PAPER} strokeWidth={RIM}>
          {parts.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      )}
      <g fill={INK} stroke={INK} strokeWidth={0.6}>
        {parts.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
}

/** A gloved fist along the handle, in figure units (about 10 cm), and across it (8 cm). */
const GLOVE_LEN = 5.6;
const GLOVE_W = 4.6;
/** The handle showing between the two hands (about 4 cm): two hands, not one fist. */
const GRIP_GAP = 2.4;
/** From the point between the hands to each glove's centre. */
const GRIP_HALF = (GLOVE_LEN + GRIP_GAP) / 2;

/**
 * Where the hands hold the bat: the top hand (front side) near the top of the handle, the
 * bottom hand below it with a sliver of handle between them, both centred on the handle (the
 * way a batter grips it), around the point between the tracked wrists. Null when the hands
 * are apart (a hand off the bat): then they are drawn where they were seen.
 */
export function grip(p: FigurePose): { top: Pt; bottom: Pt; u: Pt } | null {
  if (Math.hypot(p.fw[0] - p.bw[0], p.fw[1] - p.bw[1]) > 14) return null;
  const [hands, toe] = batLine(p);
  const L = Math.hypot(toe[0] - hands[0], toe[1] - hands[1]) || 1;
  const u: Pt = [(toe[0] - hands[0]) / L, (toe[1] - hands[1]) / L];
  const h = GRIP_HALF;
  return { top: [hands[0] - u[0] * h, hands[1] - u[1] * h], bottom: [hands[0] + u[0] * h, hands[1] + u[1] * h], u };
}

/** The bat alone (also used, faded, for the trail it leaves when it moves fast). */
export function BatShape({ p }: { p: FigurePose }) {
  const [hands, batB] = batLine(p);
  const L0 = Math.hypot(batB[0] - hands[0], batB[1] - hands[1]) || 1;
  const ux = (batB[0] - hands[0]) / L0;
  const uy = (batB[1] - hands[1]) / L0;
  // From the top of the handle, just above the top hand, to the toe.
  const top = GRIP_HALF + GLOVE_LEN / 2 + 0.8;
  const batA: Pt = [hands[0] - ux * top, hands[1] - uy * top];
  const at = (d: number, side: number, w: number): Pt => [batA[0] + ux * (d + top) - uy * side * w, batA[1] + uy * (d + top) + ux * side * w];
  // Handle, then shoulders of the blade, a toe a touch wider: a cricket bat, not a plank.
  const blade = polygon([at(12, 1, 1.6), at(14.5, 1, 2.9), at(47, 1, 3.1), at(48, 0.6, 3.1), at(48, -0.6, 3.1), at(47, -1, 3.1), at(14.5, -1, 2.9), at(12, -1, 1.6)]);
  const handle = `M${f(batA)} L${f(at(13, 0, 0))}`;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={handle} stroke={PAPER} strokeWidth={2.4 + RIM} />
      <path d={blade} fill={PAPER} stroke={PAPER} strokeWidth={RIM} />
      <path d={handle} stroke={INK} strokeWidth={2.4} />
      <path d={blade} fill={INK} stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

/**
 * The elbow of an arm whose hand reaches `hand` from `shoulder`, keeping the upper arm and
 * forearm their seen lengths and bending the way the seen elbow bends. A hand out of reach
 * leaves the arm straight toward it.
 */
function elbowFor(shoulder: Pt, hand: Pt, l1: number, l2: number, seen: Pt): Pt {
  const dx = hand[0] - shoulder[0];
  const dy = hand[1] - shoulder[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d;
  const uy = dy / d;
  if (d >= l1 + l2 - 1e-3) return [shoulder[0] + ux * d * (l1 / (l1 + l2)), shoulder[1] + uy * d * (l1 / (l1 + l2))];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // Bend to the side the seen elbow is on.
  const side = Math.sign(ux * (seen[1] - shoulder[1]) - uy * (seen[0] - shoulder[0])) || 1;
  return [shoulder[0] + ux * a - uy * h * side, shoulder[1] + uy * a + ux * h * side];
}

/** The batter's stumps and bails, side on, at their base. */
export function Stumps({ at }: { at: Pt }) {
  const h = 40.6; // 71 cm on a 1.75 m batter
  return (
    <g fill={INK}>
      {[-1.4, 0.8].map((o) => (
        <rect key={o} x={at[0] + o - 0.8} y={at[1] - h} width={1.6} height={h} rx={0.6} />
      ))}
      <rect x={at[0] - 2.8} y={at[1] - h - 1.2} width={5.4} height={1.1} rx={0.5} />
    </g>
  );
}

/** The ball: a solid dot. */
export function Ball({ at }: { at: Pt; from?: Pt }) {
  return <circle cx={at[0]} cy={at[1]} r={2} fill={INK} />;
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
  return { outline, neck: N };
}

/**
 * Widths in figure units (standing height 100), from adult proportions: a thigh about 10
 * at the hip swelling slightly and narrowing to 7 at the knee, a padded shin about 7.5
 * with a roll at the knee, a short sleeve over a 5-wide upper arm, a forearm that swells
 * below the elbow, a trunk as broad as the shoulders and hips (never under 11, a chest
 * edge-on) drawing in at the waist, a head about 13 tall.
 */
export function BatterFigure({ p: seen }: { p: FigurePose; id?: string }) {
  // An athlete's build: hips drawn a little narrower than the hip joints read in a picture
  // (a pose model places them wide), so the shoulders stay the broadest part.
  const hm = mid(seen.fh, seen.bh);
  const slim = (q: Pt): Pt => [hm[0] + (q[0] - hm[0]) * 0.74, hm[1] + (q[1] - hm[1]) * 0.74];
  const p: FigurePose = { ...seen, fh: slim(seen.fh), bh: slim(seen.bh) };
  const neckTop: Pt = [p.head[0] - 0.8, p.head[1] + 4.2];
  const chest = torso(p);
  const leg = (side: "f" | "b") => {
    const [h, k, a, heel, toe] = side === "f" ? [p.fh, p.fk, p.fa, p.fheel, p.ftoe] : [p.bh, p.bk, p.ba, p.bheel, p.btoe];
    return [
      capsule(heel, toe, 4.8, 4),
      limb(h, k, [[0, 9.2], [0.3, 9.7], [0.75, 7.3], [1, 6.8]]),
      // The pad: a roll at the knee, then the shin.
      limb(k, a, [[0, 8.2], [0.1, 8.8], [0.22, 7.6], [0.7, 7.3], [1, 6.4]]),
    ];
  };
  // Both hands on the handle, the top one above the bottom one; the arms reach them.
  const hold = grip(p);
  const reach = (s: Pt, e: Pt, w: Pt, to: Pt | undefined): [Pt, Pt] => {
    if (!to) return [e, w];
    const l1 = Math.hypot(e[0] - s[0], e[1] - s[1]);
    const l2 = Math.hypot(w[0] - e[0], w[1] - e[1]);
    return [elbowFor(s, to, l1, l2, e), to];
  };
  const [fe, fw] = reach(p.fs, p.fe, p.fw, hold?.top);
  const [be, bw] = reach(p.bs, p.be, p.bw, hold?.bottom);
  const arm = (side: "f" | "b") => {
    const [s0, e, w] = side === "f" ? [p.fs, fe, fw] : [p.bs, be, bw];
    const s = s0;
    const sleeveEnd = lerp(s, e, 0.45);
    return [limb(s, e, [[0, 6.6], [0.2, 6.8], [0.52, 6], [0.8, 4.8], [1, 4.2]]), limb(e, w, [[0, 4.2], [0.25, 5], [1, 3.3]]), limb(s, sleeveEnd, [[0, 7.6], [0.55, 7.4], [1, 6.9]])];
  };
  const [batA, batB] = batLine(p);
  const bl = Math.hypot(batB[0] - batA[0], batB[1] - batA[1]) || 1;
  const ux = (batB[0] - batA[0]) / bl;
  const uy = (batB[1] - batA[1]) / bl;
  const core = (GLOVE_LEN - GLOVE_W) / 2;
  const glove = (w: Pt) => capsule([w[0] - ux * core, w[1] - uy * core], [w[0] + ux * core, w[1] + uy * core], GLOVE_W + 0.2, GLOVE_W - 0.2);

  const H = p.head;
  // The helmet's outline: the neck guard, the shell, the grille in front of the face, the peak.
  const helmet = [
    `M${f([H[0] - 5.6, H[1] + 3.2])} Q ${f([H[0] - 6.4, H[1] + 7.2])} ${f([H[0] - 2.6, H[1] + 7.4])} L${f([H[0] - 1.6, H[1] + 4.6])} Z`,
    `M${f([H[0] - 6.4, H[1]])} A6.4 6.4 0 1 1 ${f([H[0] + 6.4, H[1]])} A6.4 6.4 0 1 1 ${f([H[0] - 6.4, H[1]])} Z`,
    `M${f([H[0] + 4.1 - 2.9, H[1] + 2.4])} A2.9 3.6 0 1 1 ${f([H[0] + 4.1 + 2.9, H[1] + 2.4])} A2.9 3.6 0 1 1 ${f([H[0] + 4.1 - 2.9, H[1] + 2.4])} Z`,
    `M${f([H[0] + 6.6, H[1] - 2.2])} Q ${f([H[0] + 9.2, H[1] + 1.8])} ${f([H[0] + 5.4, H[1] + 6.2])} L${f([H[0] + 3.4, H[1] + 4.8])} Z`,
    `M${f([H[0] + 1.2, H[1] - 6])} Q ${f([H[0] + 7.8, H[1] - 5.6])} ${f([H[0] + 9.2, H[1] - 2.4])} L${f([H[0] + 5.6, H[1] - 3])} Z`,
  ];
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* far side first, then each nearer part cut out of what lies behind it. Seen from the
          off side the arms are in front of the chest and the legs: the top-hand arm (the
          front arm) behind, the bottom-hand arm, which reaches across the chest to the
          handle, nearest. The two gloves go on last, a gap between them on the handle, so
          each hand and the arm that moves it can be followed. */}
      <Piece parts={leg("b")} />
      <Piece rim parts={[capsule(chest.neck, neckTop, 6.2, 5), capsule(p.bh, p.fh, 9.2, 9.2), chest.outline, ...helmet]} />
      <Piece rim parts={leg("f")} />
      <Piece rim parts={arm("f")} />
      <BatShape p={p} />
      <Piece rim parts={arm("b")} />
      <Piece rim parts={[glove(fw)]} />
      <Piece rim parts={[glove(bw)]} />
    </g>
  );
}

export type GhostPart = "front_leg" | "back_leg" | "head" | "trunk" | "hands" | "stride";

/** The textbook position as a dashed outline: only the part a chapter is about. Ink on a paper halo, so it reads over the silhouette. */
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
