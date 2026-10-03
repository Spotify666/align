// Deterministic numeric helpers. Nothing in the engine may depend on wall-clock
// time or Math.random so that one input + one engine version = one report.

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const len2 = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dist2 = (a: Vec2, b: Vec2) => len2(sub2(a, b));
export const mid2 = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Interior angle ABC in degrees (180 = straight). */
export function angleAt(a: Vec2, b: Vec2, c: Vec2): number {
  const ba = sub2(a, b);
  const bc = sub2(c, b);
  const denom = len2(ba) * len2(bc);
  if (denom === 0) return NaN;
  const cos = clamp((ba[0] * bc[0] + ba[1] * bc[1]) / denom, -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of segment from vertical in degrees, 0 = vertical, 90 = horizontal. */
export function angleFromVertical(from: Vec2, to: Vec2): number {
  const d = sub2(to, from);
  const l = len2(d);
  if (l === 0) return NaN;
  return (Math.acos(clamp(Math.abs(d[1]) / l, 0, 1)) * 180) / Math.PI;
}

export function mean(xs: readonly number[]): number {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}

export function std(xs: readonly number[]): number {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

export function weightedMeanStd(xs: readonly number[], ws: readonly number[]) {
  let sw = 0;
  let swx = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const w = ws[i]!;
    if (!Number.isFinite(x) || !(w > 0)) continue;
    sw += w;
    swx += w * x;
  }
  if (sw === 0) return { mean: NaN, sd: NaN, effectiveN: 0 };
  const m = swx / sw;
  let sw2 = 0;
  let swd = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const w = ws[i]!;
    if (!Number.isFinite(x) || !(w > 0)) continue;
    swd += w * (x - m) ** 2;
    sw2 += w * w;
  }
  const effectiveN = (sw * sw) / sw2;
  const sd = effectiveN > 1 ? Math.sqrt(swd / sw / (1 - 1 / effectiveN)) : NaN;
  return { mean: m, sd, effectiveN };
}

/** Centered moving average that ignores NaN gaps. */
export function smooth(xs: readonly number[], radius: number): number[] {
  if (radius <= 0) return [...xs];
  return xs.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      const v = xs[j];
      if (v !== undefined && Number.isFinite(v)) {
        s += v;
        n++;
      }
    }
    return n ? s / n : NaN;
  });
}

/**
 * Drops a reading that too few of its neighbours back up: fewer than half of the frames
 * within ±radius were seen (a lone frame between dropouts). Such a reading can't set a
 * maximum or minimum on its own; a fully seen series is returned unchanged.
 */
export function supported(xs: readonly number[], radius: number): number[] {
  const need = Math.max(2, Math.ceil((2 * radius + 1) / 2));
  return xs.map((x, i) => {
    if (!Number.isFinite(x)) return NaN;
    let seen = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      const v = xs[j];
      if (v !== undefined && Number.isFinite(v)) seen++;
    }
    return seen >= need ? x : NaN;
  });
}

/** Central-difference derivative per second. */
export function derivative(xs: readonly number[], dtSec: number): number[] {
  return xs.map((_, i) => {
    const a = xs[i - 1];
    const b = xs[i + 1];
    if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    return (b - a) / (2 * dtSec);
  });
}

export function argmax(xs: readonly number[], from = 0, to = xs.length - 1): number {
  let best = -1;
  let bv = -Infinity;
  for (let i = Math.max(0, from); i <= Math.min(xs.length - 1, to); i++) {
    const v = xs[i]!;
    if (Number.isFinite(v) && v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

export function argmin(xs: readonly number[], from = 0, to = xs.length - 1): number {
  return argmax(
    xs.map((x) => (Number.isFinite(x) ? -x : NaN)),
    from,
    to,
  );
}

/** Round to a number of significant decimals without float noise. */
export function round(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/** Mulberry32: tiny seeded PRNG, used only for fixture generation. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(next: () => number) {
  const u = Math.max(next(), 1e-12);
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Canonical JSON: sorted keys, fixed number formatting. Used for hashing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "null";
      return JSON.stringify(round(value, 6));
    }
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** Synchronous SHA-256 (FIPS 180-4) so hashing behaves the same in browser, Node and tests. */
export function sha256(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [H[0]!, H[1]!, H[2]!, H[3]!, H[4]!, H[5]!, H[6]!, H[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}
