// The landing page's batter: a line drawing of a front-foot defence, seen from the off side,
// that moves through four moments (stance, backlift, stride, contact). It is an illustration,
// drawn by hand as key poses and said to be one on the page: not a recording, not a result.
// Right-handed batter, bowler to the right of the picture; the hands are named by their role
// (top hand, bottom hand), never by side.
//
// Pure: the server draws the still (SVG) and the browser the moving one (canvas, Path2D) from
// the same path strings. Units: the batter's height is 1; x toward the bowler, y up from the ground.

export type P = readonly [number, number];

export interface Pose {
  bAnk: P; bToe: P; bKnee: P; bHip: P;
  fAnk: P; fToe: P; fKnee: P; fHip: P;
  bSh: P; fSh: P;
  head: P;
  /** Where the face points, degrees above the horizontal (negative: looking down). */
  face: number;
  /** The top hand on the handle. */
  grip: P;
  /** Direction of the bat from handle to toe, degrees anticlockwise from "toward the bowler". */
  bat: number;
  fElb: P; bElb: P;
}

/** The movement's own clock, in seconds at real speed. */
export const T_CONTACT = 0.92;
export const T_END = 1.3;

const KEYS: ReadonlyArray<{ t: number; pose: Pose }> = [
  {
    t: 0,
    pose: {
      bAnk: [0, 0.045], bToe: [0.04, 0.004], bKnee: [0.014, 0.272], bHip: [0.04, 0.488],
      fAnk: [0.21, 0.045], fToe: [0.255, 0.004], fKnee: [0.208, 0.272], fHip: [0.172, 0.488],
      bSh: [0.03, 0.712], fSh: [0.206, 0.7],
      head: [0.168, 0.83], face: -6,
      grip: [0.126, 0.442], bat: 260,
      fElb: [0.212, 0.556], bElb: [0.022, 0.55],
    },
  },
  {
    t: 0.4,
    pose: {
      bAnk: [0, 0.045], bToe: [0.04, 0.004], bKnee: [0.018, 0.272], bHip: [0.046, 0.488],
      fAnk: [0.21, 0.047], fToe: [0.255, 0.004], fKnee: [0.212, 0.274], fHip: [0.178, 0.488],
      bSh: [0.02, 0.718], fSh: [0.222, 0.698],
      head: [0.175, 0.83], face: -5,
      grip: [0.078, 0.588], bat: 118,
      fElb: [0.19, 0.542], bElb: [-0.072, 0.6],
    },
  },
  {
    t: 0.62,
    pose: {
      bAnk: [0.004, 0.05], bToe: [0.042, 0.004], bKnee: [0.062, 0.264], bHip: [0.1, 0.484],
      fAnk: [0.36, 0.088], fToe: [0.45, 0.066], fKnee: [0.336, 0.31], fHip: [0.226, 0.48],
      bSh: [0.1, 0.714], fSh: [0.296, 0.684],
      head: [0.278, 0.822], face: -12,
      grip: [0.15, 0.588], bat: 124,
      fElb: [0.256, 0.544], bElb: [-0.004, 0.59],
    },
  },
  {
    // The hands come down first, close to the body; the bat follows them like a pendulum.
    t: 0.72,
    pose: {
      bAnk: [0.009, 0.055], bToe: [0.044, 0.004], bKnee: [0.111, 0.256], bHip: [0.191, 0.472],
      fAnk: [0.469, 0.063], fToe: [0.567, 0.033], fKnee: [0.459, 0.297], fHip: [0.296, 0.467],
      bSh: [0.206, 0.708], fSh: [0.395, 0.674],
      head: [0.397, 0.811], face: -20,
      grip: [0.3, 0.535], bat: 158,
      fElb: [0.435, 0.56], bElb: [0.13, 0.575],
    },
  },
  {
    t: 0.8,
    pose: {
      bAnk: [0.016, 0.06], bToe: [0.048, 0.004], bKnee: [0.152, 0.25], bHip: [0.266, 0.46],
      fAnk: [0.52, 0.045], fToe: [0.62, 0.01], fKnee: [0.536, 0.283], fHip: [0.356, 0.455],
      bSh: [0.312, 0.7], fSh: [0.486, 0.664],
      head: [0.502, 0.8], face: -28,
      grip: [0.47, 0.5], bat: 216,
      fElb: [0.6, 0.6], bElb: [0.31, 0.53],
    },
  },
  {
    t: T_CONTACT,
    pose: {
      bAnk: [0.03, 0.076], bToe: [0.062, 0.004], bKnee: [0.186, 0.245], bHip: [0.31, 0.45],
      fAnk: [0.52, 0.045], fToe: [0.62, 0.01], fKnee: [0.56, 0.275], fHip: [0.4, 0.445],
      bSh: [0.452, 0.682], fSh: [0.575, 0.645],
      head: [0.605, 0.79], face: -38,
      grip: [0.677, 0.468], bat: 260,
      fElb: [0.715, 0.625], bElb: [0.53, 0.525],
    },
  },
];

/** The four moments a visitor can stop on, and what the arms and body are doing in each. */
export const PHASES = [
  { id: "stance", name: "Stance", at: 0, cue: "Bat down by the back foot, hands together, eyes level." },
  { id: "backlift", name: "Backlift", at: 0.4, cue: "The hands lift the bat straight back. The head stays still." },
  { id: "stride", name: "Stride", at: 0.62, cue: "Head and front shoulder lead and the front foot goes to the ball. The bat is still up." },
  { id: "contact", name: "Contact", at: T_CONTACT, cue: "Front elbow high, top hand in control, bottom hand soft. Bat beside the pad, head over the front foot." },
] as const;

const ORDER = ["bAnk", "bToe", "bKnee", "bHip", "fAnk", "fToe", "fKnee", "fHip", "bSh", "fSh", "head", "grip", "fElb", "bElb"] as const;
const flat = (p: Pose): number[] => [...ORDER.flatMap((k) => [p[k][0], p[k][1]]), p.face, p.bat];
const unflat = (v: number[]): Pose => {
  const out: Record<string, P | number> = {};
  ORDER.forEach((k, i) => (out[k] = [v[2 * i]!, v[2 * i + 1]!]));
  out.face = v[ORDER.length * 2]!;
  out.bat = v[ORDER.length * 2 + 1]!;
  return out as unknown as Pose;
};
const ROWS = KEYS.map((k) => flat(k.pose));
const TIMES = KEYS.map((k) => k.t);

/**
 * The pose at a moment: a monotone cubic through the key poses, so nothing overshoots (a planted
 * foot stays planted) and the movement eases in and out of each one. Held after contact.
 */
export function poseAt(t: number): Pose {
  const n = TIMES.length;
  const tt = Math.max(TIMES[0]!, Math.min(TIMES[n - 1]!, t));
  let i = 0;
  while (i < n - 2 && tt > TIMES[i + 1]!) i++;
  const h = TIMES[i + 1]! - TIMES[i]!;
  const u = (tt - TIMES[i]!) / h;
  const slope = (c: number, k: number) => (k < 0 || k >= n - 1 ? 0 : (ROWS[k + 1]![c]! - ROWS[k]![c]!) / (TIMES[k + 1]! - TIMES[k]!));
  const tangent = (c: number, k: number) => {
    const a = slope(c, k - 1);
    const b = slope(c, k);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const out = ROWS[0]!.map((_, c) => {
    const y0 = ROWS[i]![c]!;
    const y1 = ROWS[i + 1]![c]!;
    const m0 = tangent(c, i) * h;
    const m1 = tangent(c, i + 1) * h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
  });
  return unflat(out);
}

/** The ball: in from the bowler's end, onto the bat at contact, dead at the batter's feet. */
export function ballAt(t: number): P | null {
  const from = 0.5;
  if (t < from) return null;
  if (t <= T_CONTACT) {
    const k = (t - from) / (T_CONTACT - from);
    return [1.0 - 0.335 * k, 0.05 + 0.07 * k];
  }
  const k = t - T_CONTACT;
  return [0.665 + 0.1 * (1 - Math.exp(-6 * k)), Math.max(0.02, 0.12 - 2.2 * k * k)];
}

// ---------------------------------------------------------------------------------------------
// Drawing

export interface Layer {
  /** Closed shapes that read as one silhouette: outlined together, and hiding what is behind. */
  fill: string[];
  /** Lines drawn on top of the silhouette (seams, ribs, the grille). */
  lines: string[];
}
export interface Art {
  layers: Layer[];
  /** The line at this moment: front foot, front knee, front shoulder, head (picture coordinates). */
  line: Array<[number, number]>;
  groundY: number;
  /** Where the popping crease meets the ground. */
  creaseX: number;
  /** Picture units per body height. */
  scale: number;
  at: (p: P) => [number, number];
}

type V = [number, number];
const add = (a: P, b: P, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: P, b: P): V => [a[0] - b[0], a[1] - b[1]];
const mix = (a: P, b: P, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
const perp = (a: P): V => [-a[1], a[0]];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** How the scene sits in a picture w × h: the batter fills it, the ground near the bottom. */
export function place(w: number, h: number) {
  // Wide enough for the bat to swing back behind the batter and for the ball to come in.
  const scale = Math.min(h / 1.14, w / 1.22);
  const groundY = h - (h - scale * 1.06) / 2 - scale * 0.02;
  const originX = w / 2 - 0.22 * scale;
  const at = (p: P): [number, number] => [originX + p[0] * scale, groundY - p[1] * scale];
  return { scale, groundY, originX, at };
}

export function batterArt(pose: Pose, w: number, h: number): Art {
  const { scale: s, groundY, at } = place(w, h);
  const pt = (p: P) => {
    const [x, y] = at(p);
    return `${r1(x)} ${r1(y)}`;
  };
  const open = (pts: P[]) => pts.map((p, i) => `${i ? "L" : "M"}${pt(p)}`).join("");
  /** A smooth closed outline through the points. */
  const blob = (pts: P[]) => {
    const n = pts.length;
    let d = `M${pt(pts[0]!)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n]!;
      const p1 = pts[i]!;
      const p2 = pts[(i + 1) % n]!;
      const p3 = pts[(i + 2) % n]!;
      d += `C${pt(add(p1, sub(p2, p0), 1 / 6))} ${pt(add(p2, sub(p3, p1), -1 / 6))} ${pt(p2)}`;
    }
    return `${d}Z`;
  };
  /** A smooth open line through the points. */
  const curve = (pts: P[]) => {
    let d = `M${pt(pts[0]!)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      d += `C${pt(add(p1, sub(p2, p0), 1 / 6))} ${pt(add(p2, sub(p3, p1), -1 / 6))} ${pt(p2)}`;
    }
    return d;
  };
  /** A limb: two round ends of different widths joined by straight sides. */
  const limb = (a: P, b: P, ra: number, rb: number) => {
    const u = unit(sub(b, a));
    const n = perp(u);
    const A = (r: number) => `A${r1(r * s)} ${r1(r * s)} 0 0 1 `;
    return `M${pt(add(a, n, ra))}L${pt(add(b, n, rb))}${A(rb)}${pt(add(b, n, -rb))}L${pt(add(a, n, -ra))}${A(ra)}${pt(add(a, n, ra))}Z`;
  };
  /** A point given along and across an axis from an origin. */
  const frame = (o: P, along: P) => {
    const u = unit(along);
    const n = perp(u);
    return (a: number, b: number): V => [o[0] + u[0] * a + n[0] * b, o[1] + u[1] * a + n[1] * b];
  };

  const { bAnk, bToe, bKnee, bHip, fAnk, fToe, fKnee, fHip, bSh, fSh, head, grip, fElb, bElb } = pose;
  const hipC = mix(bHip, fHip, 0.5);
  const shC = mix(bSh, fSh, 0.5);
  const axis = unit(sub(shC, hipC));
  const back = unit(sub(bSh, fSh));
  const hipBack = unit(sub(bHip, fHip));

  // Trousers: seat, thighs and the calves behind the pads.
  const trousers: Layer = {
    fill: [limb(bHip, fHip, 0.064, 0.064), limb(bHip, bKnee, 0.06, 0.047), limb(fHip, fKnee, 0.06, 0.047), limb(bKnee, bAnk, 0.044, 0.03), limb(fKnee, fAnk, 0.044, 0.03)],
    lines: [],
  };

  const shoe = (ank: P, toe: P): Layer => {
    const d = sub(toe, ank);
    const reach = Math.sqrt(Math.max(0.0004, d[0] * d[0] + d[1] * d[1] - 0.04 * 0.04));
    const ang = Math.atan2(d[1], d[0]) + Math.atan2(0.04, reach);
    const f = frame(ank, [Math.cos(ang), Math.sin(ang)]);
    const sole = -0.045;
    return {
      fill: [blob([f(-0.038, sole), f(reach * 0.5, sole - 0.002), f(reach + 0.004, sole), f(reach + 0.012, sole + 0.016), f(reach * 0.72, sole + 0.036), f(0.03, 0.006), f(0.012, 0.03), f(-0.03, 0.03), f(-0.042, -0.012)])],
      lines: [open([f(-0.036, sole + 0.012), f(reach + 0.006, sole + 0.012)])],
    };
  };

  const pad = (ank: P, knee: P): Layer => {
    const L = len(sub(knee, ank));
    const f = frame(ank, sub(knee, ank));
    const o = -0.006; // the pad sits a little to the front of the shin
    const g = (a: number, b: number) => f(a, b + o);
    return {
      fill: [blob([g(-0.012, 0), g(0.012, 0.037), g(L * 0.5, 0.046), g(L - 0.012, 0.052), g(L + 0.05, 0.05), g(L + 0.088, 0.034), g(L + 0.094, 0), g(L + 0.088, -0.034), g(L + 0.05, -0.05), g(L - 0.012, -0.052), g(L * 0.5, -0.046), g(0.012, -0.037)])],
      lines: [
        ...[-0.02, 0, 0.02].map((b) => open([g(0.022, b * 0.85), g(L - 0.034, b)])),
        ...[L - 0.022, L + 0.022, L + 0.058].map((a) => curve([g(a, 0.05), g(a + 0.006, 0), g(a, -0.05)])),
      ],
    };
  };

  // Shirt.
  const shirt: Layer = {
    fill: [
      blob([
        add(add(bHip, hipBack, 0.04), axis, 0.04),
        add(mix(bHip, bSh, 0.6), back, 0.04),
        add(add(bSh, back, 0.026), axis, -0.04),
        add(add(bSh, back, 0.03), axis, 0.018),
        add(add(shC, back, 0.04), axis, 0.05),
        add(add(shC, back, -0.04), axis, 0.05),
        add(add(fSh, back, -0.03), axis, 0.018),
        add(add(fSh, back, -0.026), axis, -0.04),
        add(mix(fHip, fSh, 0.6), back, -0.04),
        add(add(fHip, hipBack, -0.04), axis, 0.04),
        add(hipC, axis, 0.03),
      ]),
    ],
    lines: [
      curve([add(add(shC, back, 0.036), axis, 0.052), add(shC, axis, 0.0), add(add(shC, back, -0.036), axis, 0.052)]),
      open([add(shC, axis, 0.0), add(shC, axis, -0.075)]),
    ],
  };

  // Head: face first, then the helmet over it.
  const fa = (pose.face * Math.PI) / 180;
  const hf = frame(head, [Math.cos(fa), Math.sin(fa)]);
  const R = 0.066;
  const hp = (a: number, b: number) => hf(a * R, b * R);
  const face: Layer = {
    fill: [limb(add(shC, axis, 0.03), hp(-0.25, -0.55), 0.03, 0.03), blob([hp(0.9, 0.2), hp(1.02, -0.12), hp(1.12, -0.32), hp(0.98, -0.42), hp(0.98, -0.62), hp(0.84, -0.9), hp(0.4, -0.92), hp(0.05, -0.7), hp(0.0, 0.0), hp(0.5, 0.3)])],
    lines: [],
  };
  const helmet: Layer = {
    fill: [
      blob([hp(0.98, 0.16), hp(0.9, 0.52), hp(0.55, 0.88), hp(0, 1.04), hp(-0.6, 0.88), hp(-0.98, 0.45), hp(-1.04, -0.05), hp(-0.9, -0.5), hp(-0.5, -0.62), hp(-0.3, -0.95), hp(0.08, -0.95), hp(0.22, -0.5), hp(0.45, -0.12), hp(0.8, 0.02)]),
      blob([hp(0.9, 0.3), hp(1.3, 0.24), hp(1.66, 0.1), hp(1.64, 0.0), hp(1.3, 0.06), hp(0.92, 0.06)]),
    ],
    lines: [
      ...[-0.3, -0.55, -0.8].map((b) => curve([hp(0.2, b - 0.06), hp(0.8, b + 0.02), hp(1.34, b + 0.04)])),
      curve([hp(1.4, 0.04), hp(1.36, -0.45), hp(1.2, -0.98), hp(0.7, -1.06), hp(0.1, -0.95)]),
      curve([hp(-0.92, 0.3), hp(-0.3, 0.16), hp(0.4, 0.14), hp(0.95, 0.2)]),
    ],
  };

  // The bat: handle, blade, one edge line.
  const ba = (pose.bat * Math.PI) / 180;
  const bf = frame(add(grip, [Math.cos(ba), Math.sin(ba)], -0.04), [Math.cos(ba), Math.sin(ba)]);
  const bat: Layer = {
    fill: [
      limb(bf(0, 0), bf(0.17, 0), 0.011, 0.011),
      blob([bf(0.15, 0.011), bf(0.162, 0.02), bf(0.19, 0.028), bf(0.33, 0.029), bf(0.468, 0.028), bf(0.482, 0.016), bf(0.485, 0), bf(0.482, -0.016), bf(0.468, -0.028), bf(0.33, -0.029), bf(0.19, -0.028), bf(0.162, -0.02), bf(0.15, -0.011)]),
    ],
    lines: [open([bf(0.168, 0.02), bf(0.25, 0), bf(0.168, -0.02)]), ...[0.012, 0.13].map((a) => open([bf(a, 0.011), bf(a, -0.011)]))],
  };
  const lower = bf(0.105, 0); // the bottom hand

  const arm = (sh: P, elb: P, hand: P): Layer[] => {
    const wrist = add(hand, unit(sub(elb, hand)), 0.05);
    const gf = frame(hand, [Math.cos(ba), Math.sin(ba)]);
    const hemAt = 0.46;
    const hem = mix(sh, elb, hemAt);
    const u = unit(sub(elb, sh));
    const n = perp(u);
    return [
      { fill: [limb(mix(sh, elb, 0.25), elb, 0.031, 0.028), limb(elb, wrist, 0.028, 0.023)], lines: [] },
      // Sleeve: round at the shoulder, cut square at the hem.
      {
        fill: [blob([add(add(sh, u, -0.034), n, 0.022), add(sh, n, 0.041), add(hem, n, 0.038), add(hem, n, -0.038), add(sh, n, -0.041), add(add(sh, u, -0.034), n, -0.022)])],
        lines: [open([add(add(hem, u, -0.012), n, 0.037), add(add(hem, u, -0.012), n, -0.037)])],
      },
      {
        fill: [limb(hand, add(hand, unit(sub(elb, hand)), 0.052), 0.029, 0.029), blob([gf(-0.04, -0.026), gf(0, -0.031), gf(0.04, -0.026), gf(0.046, 0), gf(0.04, 0.026), gf(0, 0.031), gf(-0.04, 0.026), gf(-0.046, 0)])],
        lines: [...[-0.02, 0, 0.02].map((a) => open([gf(a, -0.028), gf(a, 0.004)])), open([add(wrist, perp(unit(sub(elb, hand))), 0.028), add(wrist, perp(unit(sub(elb, hand))), -0.028)])],
      },
    ];
  };

  const layers: Layer[] = [trousers, shoe(bAnk, bToe), pad(bAnk, bKnee), shoe(fAnk, fToe), pad(fAnk, fKnee), face, shirt, helmet, bat, ...arm(bSh, bElb, lower), ...arm(fSh, fElb, grip)];
  return { layers, line: [at(fAnk), at(fKnee), at(fSh), at(head)], groundY, creaseX: at([0.06, 0])[0], scale: s, at };
}
