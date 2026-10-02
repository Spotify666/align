// Picking the batter in a photo, on skeletons measured from a real photo: a batter in a
// forward defence (bottom hand hidden behind the bat, feet at the photo's bottom edge)
// with the wicketkeeper half-crouched behind. The keeper was once analysed instead.
import { describe, expect, it } from "vitest";
import { batterLikeness, ownsBox, type PoseFrame } from "@/lib/capture/pose";
import { batterScore } from "@/lib/capture/photos";
import type { ImgPoint } from "@/engine/types";

// nose, shoulders, elbows, wrists, hips, knees, ankles, heels, toes (left, right): x, y, visibility.
const body = (pts: number[][]): ImgPoint[] => pts.map((p) => [p[0]!, p[1]!, p[2]!] as ImgPoint);
const frame = (pts: number[][]): PoseFrame => ({ body: body(pts), world: [], depth: [], people: 1, hip: null }) as unknown as PoseFrame;

const BATTER = frame([
  [0.53, 0.15, 1], [0.63, 0.15, 1], [0.48, 0.25, 1], [0.65, 0.22, 0.9], [0.5, 0.34, 0.3], [0.55, 0.3, 0.5], [0.5, 0.35, 0.2],
  [0.73, 0.44, 1], [0.65, 0.47, 1], [0.61, 0.61, 0.93], [0.66, 0.66, 0.63], [0.62, 0.88, 0.95], [0.77, 0.86, 0.75],
  [0.66, 0.89, 0.92], [0.81, 0.87, 0.67], [0.57, 0.96, 0.93], [0.77, 0.93, 0.63],
]);
const KEEPER = frame([
  [0.35, 0.31, 1], [0.43, 0.39, 1], [0.23, 0.38, 1], [0.43, 0.54, 0.86], [0.21, 0.54, 0.94], [0.38, 0.62, 0.5], [0.23, 0.62, 0.71],
  [0.37, 0.58, 1], [0.24, 0.58, 1], [0.45, 0.69, 0.87], [0.15, 0.65, 0.95], [0.36, 0.89, 0.78], [0.12, 0.89, 0.93],
  [0.32, 0.94, 0.84], [0.13, 0.94, 0.88], [0.43, 0.96, 0.75], [0.05, 0.97, 0.88],
]);
const BATTER_BOX = { x: 0.41, y: 0.02, w: 0.45, h: 0.99, score: 0.86 };
const KEEPER_BOX = { x: 0.04, y: 0.18, w: 0.47, h: 0.8, score: 0.87 };

describe("picking the batter in a photo", () => {
  it("a skeleton belongs only to the person it sits on", () => {
    expect(ownsBox(BATTER, BATTER_BOX)).toBe(true);
    expect(ownsBox(KEEPER, KEEPER_BOX)).toBe(true);
    // The crop around the batter also held the keeper; the keeper's skeleton isn't the batter's.
    expect(ownsBox(KEEPER, BATTER_BOX)).toBe(false);
  });

  it("a skeleton squashed into a corner of its box is a misread", () => {
    const squashed = frame(BATTER.body.map((p) => [0.6 + (p![0] - 0.5) * 0.2, 0.36 + (p![1] - 0.5) * 0.08, p![2]]));
    expect(ownsBox(squashed, { x: 0.6, y: 0.34, w: 0.22, h: 0.19 })).toBe(false);
  });

  it("the keeper's crouch (both knees bent and splayed) counts against being the batter", () => {
    expect(batterLikeness(KEEPER.body, 1)).toBeLessThan(0.4);
  });

  it("a batter's hidden bottom hand doesn't count as hands apart", () => {
    expect(batterLikeness(BATTER.body, 1)).toBeGreaterThanOrEqual(0.75);
  });

  it("the batter outranks the keeper by a clear margin", () => {
    const b = batterScore(BATTER, BATTER_BOX, 1);
    const k = batterScore(KEEPER, KEEPER_BOX, 1);
    expect(b).toBeGreaterThan(k / 0.8); // not even close enough to ask
  });
});
