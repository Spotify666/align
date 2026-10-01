import { describe, expect, it } from "vitest";
import { batterCandidates, findWindows, fullBodyBox, type ScanSample } from "@/lib/capture/scan";
import type { Box } from "@/lib/capture/pose";

const batter: Box = { x: 0.4, y: 0.3, w: 0.12, h: 0.36, score: 0.8 };
const bowlerHand: Box = { x: 0.9, y: 0.4, w: 0.1, h: 0.6, score: 0.5 };

/** Samples every 0.2 s with a motion bump (a stroke) at each time in `strokes`. */
function clip(duration: number, strokes: number[], opts: { cutAt?: number[]; people?: (t: number) => Box[] } = {}): ScanSample[] {
  const out: ScanSample[] = [];
  for (let t = 0; t <= duration; t += 0.2) {
    const m = strokes.reduce((a, s) => a + Math.exp(-((t - s) ** 2) / 0.08), 0) * 0.1 + 0.005;
    const cut = (opts.cutAt ?? []).some((c) => Math.abs(c - t) < 0.1);
    out.push({ t, people: opts.people ? opts.people(t) : [batter], motion: cut ? 0 : m, cut, thumb: "" });
  }
  return out;
}

describe("shot windows", () => {
  it("finds each stroke in a practice clip with repeated shots", () => {
    const strokes = [3, 6.2, 9.4, 12.5, 15.8, 19];
    const w = findWindows(clip(22, strokes), 2.5, 22);
    expect(w).toHaveLength(strokes.length);
    for (const s of strokes) expect(w.some((x) => Math.abs(x.peak - s) < 0.3 && x.start <= s && x.end >= s)).toBe(true);
    for (const x of w) expect(x.end - x.start).toBeCloseTo(2.5, 5);
  });
  it("keeps the stroke inside the window, toward its end", () => {
    const [w] = findWindows(clip(10, [5]), 2.5, 10);
    expect(w!.start).toBeLessThan(5);
    expect((5 - w!.start) / (w!.end - w!.start)).toBeGreaterThan(0.45);
  });
  it("never lets a window cross a camera cut", () => {
    // Stroke right before a cut to a close-up: the window must end at the cut.
    const w = findWindows(clip(10, [4.6], { cutAt: [5] }), 2.5, 10);
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) expect(x.end <= 5.01 || x.start >= 4.99).toBe(true);
  });
  it("ignores motion when no whole person is in view (close-ups, crowd)", () => {
    const w = findWindows(clip(10, [2, 7], { people: (t) => (t > 5 ? [] : [batter]) }), 2.5, 10);
    expect(w.every((x) => x.peak < 5)).toBe(true);
  });
  it("treats a short clip as one window covering the whole clip", () => {
    const w = findWindows(clip(2.8, [1.6]), 2.5, 2.8);
    expect(w).toHaveLength(1);
    expect(w[0]!.start).toBe(0);
    expect(w[0]!.end).toBeCloseTo(2.8);
  });
  it("still offers a window when nothing moves", () => {
    const w = findWindows(clip(12, []), 2.5, 12);
    expect(w).toHaveLength(1);
  });
});

describe("batter candidates", () => {
  it("prefers the person seen whole through the window over a hand at the frame edge", () => {
    const samples = clip(6, [3], { people: (t) => (t > 2.6 && t < 3.4 ? [bowlerHand, batter] : [batter]) });
    const { candidates, at } = batterCandidates(samples, { start: 1.5, end: 4, peak: 3 });
    expect(Math.abs(at - 3)).toBeLessThan(0.21);
    expect(candidates[0]!.box).toEqual(batter);
    expect(fullBodyBox(bowlerHand)).toBe(false); // touches the bottom edge
  });
});
