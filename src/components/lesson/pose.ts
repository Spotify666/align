// A pose redrawn in figure units, for illustrations: standing height 100, ground at
// y = 100, facing right (toward the bowler). Pure geometry, so the server can prepare
// poses (the home explainer's motion) and the browser can draw them.

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
  const foot = (heel: string, toe: string, ankle: Pt): [Pt, Pt] => [
    raw(heel) ? T(raw(heel)!) : ([ankle[0] - 2.5, ankle[1] + 2] as Pt),
    raw(toe) ? T(raw(toe)!) : ([ankle[0] + 6, ankle[1] + 2.5] as Pt),
  ];
  const [fheel, ftoe] = foot(`${F}_heel`, `${F}_foot`, faT);
  const [bheel, btoe] = foot(`${B}_heel`, `${B}_foot`, baT);
  // The head's centre sits a little behind and above the nose.
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

/** The textbook defence as continuous motion, for the home explainer. */
export interface Story {
  /** The batter, every 1/fps s of the clip, in figure units, back foot planted. */
  poses: FigurePose[];
  fps: number;
  /** Pose index of each moment: set up, pick up, stride, contact. */
  moments: [number, number, number, number];
}
