import { describe, expect, it } from "vitest";
import { batterCandidates, findWindows, fullBodyBox, type ScanSample } from "@/lib/capture/scan";
import { strokeSegment } from "@/lib/capture/segments";
import type { Box } from "@/lib/capture/pose";

const batter: Box = { x: 0.4, y: 0.3, w: 0.12, h: 0.36, score: 0.8 };
const bowlerHand: Box = { x: 0.9, y: 0.4, w: 0.1, h: 0.6, score: 0.5 };

/** Samples every 0.2 s with a motion bump (a stroke) at each time in `strokes`. */
function clip(duration: number, strokes: number[], opts: { cutAt?: number[]; people?: (t: number) => Box[] } = {}): ScanSample[] {
  const out: ScanSample[] = [];
  for (let t = 0; t <= duration; t += 0.2) {
    const m = strokes.reduce((a, s) => a + Math.exp(-((t - s) ** 2) / 0.08), 0) * 0.1 + 0.005;
    const cut = (opts.cutAt ?? []).some((c) => Math.abs(c - t) < 0.1);
    out.push({ t, people: opts.people ? opts.people(t) : [batter], bats: [], motion: cut ? 0 : m, cut, thumb: "" });
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
  it("keeps the movement peak inside the window, with more room after it for the stroke", () => {
    const [w] = findWindows(clip(10, [5]), 3.4, 10);
    expect(w!.start).toBeLessThan(5);
    const at = (5 - w!.start) / (w!.end - w!.start);
    expect(at).toBeGreaterThan(0.3);
    expect(at).toBeLessThan(0.5);
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

describe("camera cuts inside a tracked shot", () => {
  const person = (cx: number, cy: number, h: number) =>
    Array.from({ length: 17 }, (_, j) => [cx + ((j % 3) - 1) * h * 0.12, cy - h / 2 + (j / 16) * h, 0.9] as [number, number, number]);
  it("finds a cut and keeps the camera shot holding the stroke", () => {
    // Wide shot (small batter) for 30 frames, zooming smoothly, then a cut to a different wide shot.
    const body = Array.from({ length: 80 }, (_, i) => (i < 50 ? person(0.5, 0.4, 0.15 + i * 0.006) : person(0.2, 0.7, 0.12)));
    const [a, b] = strokeSegment(body, 1, 35, 20);
    expect([a, b]).toEqual([0, 50]);
  });
  it("leaves a smooth zoom alone", () => {
    const body = Array.from({ length: 60 }, (_, i) => person(0.5, 0.5, 0.2 * 1.02 ** i));
    expect(strokeSegment(body, 1, 30, 20)).toEqual([0, 60]);
  });
});

describe("strokes found from posture", () => {
  it("centres windows on the head dropping, not on walking between balls", () => {
    // Batter walks (big motion, head tall) at 3 s, plays a defence (head drops) at 7 s.
    const samples = clip(12, [3]).map((s) => ({ ...s, head: s.t > 6.4 && s.t < 7.6 ? 0.92 - 0.2 * (1 - Math.abs(s.t - 7) / 0.6) : 0.92 }));
    const w = findWindows(samples, 3.4, 12);
    expect(w.length).toBeGreaterThan(0);
    const best = w.reduce((a, b) => (b.score > a.score ? b : a));
    expect(Math.abs(best.peak - 7)).toBeLessThan(0.3);
    expect(best.start).toBeLessThan(7);
    expect(best.end).toBeGreaterThan(7.8);
  });
  it("falls back to movement when pose didn't run", () => {
    const w = findWindows(clip(12, [3]), 3.4, 12);
    expect(w.some((x) => Math.abs(x.peak - 3) < 0.3)).toBe(true);
  });
});

describe("batter lost inside a tracked shot", () => {
  const person = (cx: number, cy: number, h: number) =>
    Array.from({ length: 17 }, (_, j) => [cx + ((j % 3) - 1) * h * 0.12, cy - h / 2 + (j / 16) * h, 0.9] as [number, number, number]);
  const lost = () => Array.from({ length: 17 }, () => null);
  it("ends the analysed stretch where the batter is lost for a long time (zoom-out, cut)", () => {
    // Seen for 30 frames around the stroke, then lost for 30 (the camera zoomed out).
    const body = Array.from({ length: 60 }, (_, i) => (i < 30 ? person(0.5, 0.5, 0.4) : lost()));
    expect(strokeSegment(body, 1, 15, 20)).toEqual([0, 30]);
  });
  it("bridges a short dropout", () => {
    const body = Array.from({ length: 60 }, (_, i) => (i >= 28 && i < 31 ? lost() : person(0.5, 0.5, 0.4)));
    expect(strokeSegment(body, 1, 15, 20)).toEqual([0, 60]);
  });
});
