// Are two videos the same ball, filmed by two phones at once? Both phones hear the same things:
// the bat meeting the ball, the bounce, voices. So their soundtracks line up, and they line up
// at the offset their pictures give: the shot's moment (the set position or contact) in one
// video against the same moment in the other. Two different balls (or one ball and another
// moment) don't: whatever their sounds share happens at some other offset, or nowhere.
//
// The test: the onset envelope of each soundtrack (how sharply the loudness rises, 100 times a
// second) and their correlation at every offset. Near the offset the pictures give, the best
// correlation must be high enough (several sounds coincide, not one by chance) and stand out
// from all the other offsets (in robust standard deviations).

import { th } from "./registry";
import { J, type AnalysisPayload, type CaptureObservation } from "./types";

/** Envelope samples per second. */
export const ENVELOPE_RATE = 100;

/** How sharply the loudness rises, ENVELOPE_RATE times a second (log energy, rises only). */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / ENVELOPE_RATE));
  const n = Math.floor(samples.length / hop);
  const out = new Float32Array(n);
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) e += samples[k]! * samples[k]!;
    const le = Math.log(Math.sqrt(e / hop) + 1e-4);
    out[i] = Number.isFinite(prev) ? Math.max(0, le - prev) : 0;
    prev = le;
  }
  return out;
}

/** Correlation of a[t + lag] with b[t] over their overlap (NaN when the overlap is too short or flat). */
function correlationAt(a: Float32Array, b: Float32Array, lag: number, minOverlap: number): number {
  const a0 = Math.max(0, lag);
  const b0 = Math.max(0, -lag);
  const L = Math.min(a.length - a0, b.length - b0);
  if (L < minOverlap) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < L; i++) {
    ma += a[a0 + i]!;
    mb += b[b0 + i]!;
  }
  ma /= L;
  mb /= L;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < L; i++) {
    const x = a[a0 + i]! - ma;
    const y = b[b0 + i]! - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((p, q) => p - q);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

export interface SoundAgreement {
  /** How far the best correlation near the expected offset stands out (robust z-score). */
  prominence: number;
  /** That correlation. */
  r: number;
  /** The offset it was found at (s: an event at t in the second video is at t + lag in the first). */
  lagS: number;
}

/**
 * How well two soundtracks line up at the offset the pictures give: `expectedLagS` = the shot's
 * time in the first video minus its time in the second. Null when there isn't enough sound.
 */
export function soundAgreement(a: Float32Array, b: Float32Array, expectedLagS: number): SoundAgreement | null {
  const minOverlap = Math.round(th("pair.audio.min_overlap_s") * ENVELOPE_RATE);
  const w = Math.round(th("pair.audio.window_s") * ENVELOPE_RATE);
  const expected = Math.round(expectedLagS * ENVELOPE_RATE);
  const all: number[] = [];
  for (let lag = -b.length + minOverlap; lag <= a.length - minOverlap; lag++) {
    const r = correlationAt(a, b, lag, minOverlap);
    if (Number.isFinite(r)) all.push(r);
  }
  if (all.length < 20) return null;
  let best = -Infinity;
  let bestLag = expected;
  for (let lag = expected - w; lag <= expected + w; lag++) {
    const r = correlationAt(a, b, lag, minOverlap);
    if (Number.isFinite(r) && r > best) {
      best = r;
      bestLag = lag;
    }
  }
  if (!Number.isFinite(best)) return null;
  const med = median(all);
  const spread = 1.4826 * median(all.map((r) => Math.abs(r - med)));
  if (!(spread > 0)) return null;
  return { prominence: (best - med) / spread, r: best, lagS: bestLag / ENVELOPE_RATE };
}

export type SameBall = { verdict: "same" | "not_confirmed" | "no_sound"; agreement: SoundAgreement | null };

/**
 * The same ball when the two soundtracks clearly line up at the offset the shot gives;
 * otherwise not confirmed (never assumed). Without sound in either video it can't be checked.
 */
export function sameBall(a: Float32Array | null, b: Float32Array | null, shotTimeA: number, shotTimeB: number): SameBall {
  if (!a || !b) return { verdict: "no_sound", agreement: null };
  const agreement = soundAgreement(a, b, shotTimeA - shotTimeB);
  if (!agreement) return { verdict: "no_sound", agreement: null };
  // Both: the sounds match (several events coincide, not one by chance) and that match stands
  // out from every other offset.
  const same = agreement.r >= th("pair.audio.min_r") && agreement.prominence >= th("pair.audio.min_prominence");
  return { verdict: same ? "same" : "not_confirmed", agreement };
}

/**
 * When the shot happened in the video file (s from its start): the frame its result was read at
 * (the set position or contact), placed in the file's own time.
 */
export function shotTime(p: AnalysisPayload, obs: Pick<CaptureObservation, "t" | "media">): number | null {
  const frame = p.back_foot?.referenceFrame ?? p.line?.referenceFrame ?? p.events.find((e) => e.type === "contact")?.frame;
  if (frame === undefined || obs.t[frame] === undefined) return null;
  return ((obs.media.sourceStartMs ?? 0) + (obs.t[frame]! - obs.t[0]!)) / 1000;
}

// ---------------------------------------------------------------------------------------------
// The two-video option ("Two angles of one ball") also checks the same ball by the batter's
// movement: in one ball filmed by two phones, the hands rise into the backlift, come down and
// stop at the set at the same moments in both videos. Their height over time is vertical in the
// picture, so it reads alike from the side and from the front. Sound confirms it when it is
// clear; real phones often hear the bat too faintly for that (a phone at the bowler's end, sound
// compressed by messaging apps), so sound alone no longer refuses a pair there.

/** The hands' height above the feet over the clip, as a share of the batter's height, in file time (s). */
export interface Movement {
  t: number[];
  h: number[];
}

const med = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((p, q) => p - q);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

export function handsHeight(obs: Pick<CaptureObservation, "t" | "body" | "media">): Movement | null {
  const y = (i: number, j: number) => obs.body[i]?.[j]?.[1] ?? NaN;
  const n = obs.body.length;
  const ankles = Array.from({ length: n }, (_, i) => med([y(i, J.left_ankle), y(i, J.right_ankle)]));
  const feet = med(ankles);
  const tall = med(Array.from({ length: n }, (_, i) => ankles[i]! - y(i, J.nose)));
  if (!(tall > 0)) return null;
  const start = (obs.media.sourceStartMs ?? 0) / 1000;
  const t: number[] = [];
  const h: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = [y(i, J.left_wrist), y(i, J.right_wrist)].filter(Number.isFinite);
    if (!w.length) continue;
    t.push(start + (obs.t[i]! - obs.t[0]!) / 1000);
    h.push((feet - w.reduce((p, q) => p + q, 0) / w.length) / tall);
  }
  return t.length >= 10 ? { t, h } : null;
}

export interface MovementAgreement {
  /** How closely the hands' height follows the same course in both videos at the best offset. */
  r: number;
  /** That offset (s: a moment at t in the second video is at t + lag in the first). */
  lagS: number;
  /** How long the two videos overlap at that offset (s). */
  overlapS: number;
}

const RATE = 30;
function resample(m: Movement, from: number, to: number): number[] {
  const out: number[] = [];
  let k = 0;
  for (let x = from; x <= to + 1e-9; x += 1 / RATE) {
    while (k < m.t.length - 2 && m.t[k + 1]! < x) k++;
    const t0 = m.t[k]!;
    const t1 = m.t[k + 1] ?? t0;
    if (x < m.t[0]! || x > m.t[m.t.length - 1]!) out.push(NaN);
    else out.push(t1 > t0 ? m.h[k]! + ((m.h[k + 1]! - m.h[k]!) * (x - t0)) / (t1 - t0) : m.h[k]!);
  }
  return out;
}

/**
 * How well the two videos' movement lines up near the offset their shots give (`expectedLagS` =
 * the shot's time in the first minus its time in the second). Null when they overlap too little.
 */
export function movementAgreement(a: Movement, b: Movement, expectedLagS: number): MovementAgreement | null {
  const w = th("pair.motion.window_s");
  const minOverlap = th("pair.motion.min_overlap_s");
  let best: MovementAgreement | null = null;
  for (let lag = expectedLagS - w; lag <= expectedLagS + w + 1e-9; lag += 1 / RATE) {
    const from = Math.max(a.t[0]!, b.t[0]! + lag);
    const to = Math.min(a.t[a.t.length - 1]!, b.t[b.t.length - 1]! + lag);
    if (to - from < minOverlap) continue;
    const xa = resample(a, from, to);
    const xb = resample(b, from - lag, to - lag);
    const pairs = xa.map((v, i) => [v, xb[i]!] as const).filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q));
    if (pairs.length < minOverlap * RATE * 0.8) continue;
    const ma = pairs.reduce((s, [p]) => s + p, 0) / pairs.length;
    const mb = pairs.reduce((s, [, q]) => s + q, 0) / pairs.length;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (const [p, q] of pairs) {
      sab += (p - ma) * (q - mb);
      saa += (p - ma) ** 2;
      sbb += (q - mb) ** 2;
    }
    if (!(saa > 0 && sbb > 0)) continue;
    const r = sab / Math.sqrt(saa * sbb);
    if (!best || r > best.r) best = { r, lagS: lag, overlapS: to - from };
  }
  return best;
}

export type SameBallTwo = { verdict: "same" | "not_confirmed"; by: "sound" | "movement" | null; sound: SoundAgreement | null; movement: MovementAgreement | null };

/**
 * The two-video option's same-ball check: the same ball when the sound clearly says so (as
 * `sameBall`), or when the batter's movement lines up in both videos near the offset their shots
 * give. Otherwise not confirmed (never assumed).
 */
export function sameBallTwoVideos(
  sound: { a: Float32Array | null; b: Float32Array | null },
  move: { a: Movement | null; b: Movement | null },
  shotTimeA: number,
  shotTimeB: number,
): SameBallTwo {
  const s = sameBall(sound.a, sound.b, shotTimeA, shotTimeB);
  const m = move.a && move.b ? movementAgreement(move.a, move.b, shotTimeA - shotTimeB) : null;
  if (s.verdict === "same") return { verdict: "same", by: "sound", sound: s.agreement, movement: m };
  const ok = !!m && m.r >= th("pair.motion.min_r");
  return { verdict: ok ? "same" : "not_confirmed", by: ok ? "movement" : null, sound: s.agreement, movement: m };
}
