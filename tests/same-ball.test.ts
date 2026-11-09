// Two videos are the same ball only when their soundtracks line up at the offset their shots give.
import { describe, expect, it } from "vitest";
import { handsHeight, movementAgreement, onsetEnvelope, sameBall, sameBallTwoVideos, type Movement } from "@/engine/same-ball";
import { J } from "@/engine/types";

const RATE = 8000;
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;

/** A soundtrack: quiet background with sharp knocks (bat on ball, bounce, steps) at the given times. */
function track(seconds: number, knocks: number[], noise = 0.01): Float32Array {
  const x = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < x.length; i++) x[i] = noise * rnd();
  for (const t of knocks) {
    const i0 = Math.round(t * RATE);
    for (let k = 0; k < 400 && i0 + k < x.length; k++) x[i0 + k]! += Math.exp(-k / 60) * rnd();
  }
  return x;
}
const env = (x: Float32Array) => onsetEnvelope(x, RATE);
const events = [0.4, 1.1, 1.35, 2.2, 2.9, 3.5];

describe("the same ball, from two phones", () => {
  it("two phones recording one ball: their sounds line up at the offset the shots give", () => {
    const a = track(4, events);
    // The other phone started 0.8 s later, hears the same knocks quieter and a little later, with its own noise.
    const b = track(4, events.map((t) => t - 0.8 + 0.02).filter((t) => t > 0), 0.03);
    const r = sameBall(env(a), env(b), 2.2, 1.4); // the shot at 2.2 s in one, 1.4 s in the other
    expect(r.verdict).toBe("same");
    expect(r.agreement!.lagS).toBeCloseTo(0.78, 1);
  });

  it("two different balls: their sounds don't line up where the shots say", () => {
    const a = track(4, events);
    const b = track(4, [0.3, 0.9, 1.7, 2.6, 3.1]);
    expect(sameBall(env(a), env(b), 2.2, 1.4).verdict).toBe("not_confirmed");
  });

  it("the same recording at the wrong offset (another moment) is not the same ball", () => {
    const a = track(4, events);
    const b = track(4, events.map((t) => t - 0.8).filter((t) => t > 0));
    // The pictures say the shots are 1.6 s apart; the sounds line up at 0.8 s.
    expect(sameBall(env(a), env(b), 2.2, 0.6).verdict).toBe("not_confirmed");
  });

  it("without sound in either video it can't be checked", () => {
    expect(sameBall(null, env(track(4, events)), 2, 1).verdict).toBe("no_sound");
    const silent = new Float32Array(4 * RATE);
    expect(sameBall(env(silent), env(silent), 2, 2).verdict).toBe("no_sound");
  });
});

// The two-video option also checks the same ball by movement: the hands' height over time.
describe("the same ball, from the batter's movement (two-video option)", () => {
  // Hands near the waist, a backlift, down to the set, held: a back-foot defence over time.
  const course = (t: number) => (t < 1 ? 0.5 + 0.03 * Math.sin(6 * t) : t < 1.4 ? 0.5 + 0.45 * ((t - 1) / 0.4) : t < 1.8 ? 0.95 - 0.25 * ((t - 1.4) / 0.4) : 0.7 + 0.01 * Math.sin(9 * t));
  const take = (from: number, to: number, shift: number, f = course, noise = 0.01): Movement => {
    const t: number[] = [];
    const h: number[] = [];
    let s = 3;
    for (let x = from; x <= to; x += 1 / 30) {
      s = (s * 1103515245 + 12345) % 2147483648;
      t.push(x);
      h.push(f(x + shift) + noise * (s / 2147483648 - 0.5));
    }
    return { t, h };
  };
  // The side phone recorded 0–4 s; the front phone started 1.2 s later and recorded 2.5 s.
  const side = take(0, 4, 0);
  const front = take(0, 2.5, 1.2);

  it("lines up where the shots say: the same ball, without any sound", () => {
    const m = movementAgreement(side, front, 1.8 - 0.65);
    expect(m!.r).toBeGreaterThan(0.95);
    expect(m!.lagS).toBeCloseTo(1.2, 1);
    const two = sameBallTwoVideos({ a: null, b: null }, { a: side, b: front }, 1.8, 0.65);
    expect(two.verdict).toBe("same");
    expect(two.by).toBe("movement");
  });

  it("another shot (the hands go another way) is not the same ball", () => {
    // A stride forward: no high backlift, the hands go down with the stride and rise late.
    const stride = (t: number) => (t < 1.3 ? 0.5 : t < 1.8 ? 0.5 - 0.3 * ((t - 1.3) / 0.5) : t < 2.4 ? 0.2 : 0.2 + 0.6 * Math.min(1, (t - 2.4) / 0.5));
    const other = take(0, 2.5, 1.2, stride);
    expect(sameBallTwoVideos({ a: null, b: null }, { a: side, b: other }, 1.8, 0.65).verdict).toBe("not_confirmed");
  });

  it("movement that lines up only far from where the shots say doesn't count", () => {
    // The pictures put the shots 0.4 s apart; the movement lines up at 1.2 s.
    expect(sameBallTwoVideos({ a: null, b: null }, { a: side, b: front }, 1.8, 1.4).verdict).toBe("not_confirmed");
  });

  it("too short an overlap can't be compared", () => {
    const short = take(0, 1, 1.2);
    expect(movementAgreement(side, short, 1.2)).toBeNull();
    expect(sameBallTwoVideos({ a: null, b: null }, { a: side, b: short }, 1.8, 0.65).verdict).toBe("not_confirmed");
  });

  it("clear sound still confirms on its own", () => {
    const a = track(4, events);
    const b = track(4, events.map((t) => t - 0.8 + 0.02).filter((t) => t > 0), 0.03);
    const two = sameBallTwoVideos({ a: env(a), b: env(b) }, { a: null, b: null }, 2.2, 1.4);
    expect(two.verdict).toBe("same");
    expect(two.by).toBe("sound");
  });

  it("reads the hands' height above the feet as a share of the batter's height", () => {
    const n = 20;
    const body = Array.from({ length: n }, (_, i) => {
      const f: Array<readonly [number, number, number] | null> = Array(33).fill(null);
      f[J.nose] = [0.5, 0.2, 0.9];
      f[J.left_ankle] = [0.48, 0.8, 0.9];
      f[J.right_ankle] = [0.52, 0.8, 0.9];
      f[J.left_wrist] = [0.5, 0.5 - 0.01 * i, 0.9];
      f[J.right_wrist] = [0.5, 0.5 - 0.01 * i, 0.9];
      return f;
    });
    const m = handsHeight({ t: body.map((_, i) => (i * 1000) / 30), body: body as never, media: { sourceStartMs: 500 } as never })!;
    expect(m.t[0]).toBeCloseTo(0.5, 5);
    expect(m.h[0]).toBeCloseTo(0.5, 5); // 0.3 of a 0.6-tall batter above the feet
    expect(m.h[10]).toBeCloseTo((0.3 + 0.1) / 0.6, 5);
  });
});
