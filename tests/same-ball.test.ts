// Two videos are the same ball only when their soundtracks line up at the offset their shots give.
import { describe, expect, it } from "vitest";
import { onsetEnvelope, sameBall } from "@/engine/same-ball";

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
