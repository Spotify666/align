// The landing page's batter is a tracing of a real clip, stored as shapes. These checks keep
// the stored drawing usable: every frame drawable and inside the picture, the still the same
// as the frame it stands for, the moments in order, and the line read on the batter's front side.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TRACED } from "@/lib/traced-batter";

const data = JSON.parse(readFileSync(`public${TRACED.src}`, "utf8")) as { size: [number, number]; fps: number; ground: number; lines: number[][]; paths: string[] };

/** The points of a path written as a start point and steps ("M x y l dx dy dx dy … z"). */
function points(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const sub of d.split("M").filter(Boolean)) {
    const [start, rest] = sub.replace(/z$/, "").split("l");
    let [x, y] = start!.trim().split(" ").map(Number) as [number, number];
    out.push([x, y]);
    const steps = rest!.trim().split(" ").map(Number);
    for (let i = 0; i < steps.length; i += 2) {
      x += steps[i]!;
      y += steps[i + 1]!;
      out.push([x, y]);
    }
  }
  return out;
}

describe("the traced batter", () => {
  it("matches what the page was told about it", () => {
    expect(data.size).toEqual([TRACED.width, TRACED.height]);
    expect(data.paths).toHaveLength(TRACED.frames);
    expect(data.lines).toHaveLength(TRACED.frames);
    expect(data.fps).toBe(TRACED.fps);
    expect(data.ground).toBe(TRACED.ground);
    const contact = TRACED.moments[TRACED.moments.length - 1]!;
    expect(data.paths[contact]).toBe(TRACED.still);
    expect(data.lines[contact]).toEqual([...TRACED.stillLine]);
  });

  it("stops on four moments, in order, inside the clip", () => {
    expect(TRACED.moments).toHaveLength(4);
    expect(TRACED.moments[0]).toBe(0);
    for (let i = 1; i < TRACED.moments.length; i++) expect(TRACED.moments[i]!).toBeGreaterThan(TRACED.moments[i - 1]!);
    expect(TRACED.moments[3]!).toBeLessThan(TRACED.frames);
  });

  it("holds only shapes a browser can fill, inside the picture", () => {
    for (const [i, d] of data.paths.entries()) {
      expect(d, `frame ${i}`).toMatch(/^(M-?\d+ -?\d+l(-?\d+ -?\d+ ?)+z)+$/);
      const pts = points(d);
      expect(pts.length, `frame ${i}`).toBeGreaterThan(200);
      for (const [x, y] of pts) {
        expect(x >= -2 && x <= TRACED.width + 2 && y >= -2 && y <= TRACED.height + 2, `frame ${i}: ${x},${y}`).toBe(true);
      }
    }
  });

  it("is a batter going forward: the feet on the ground, the front foot planted well ahead, the head over it at the end", () => {
    const first = data.lines[0]!;
    const end = data.lines[TRACED.frames - 1]!;
    const stature = TRACED.ground - first[7]!; // head to ground in the stance
    for (const l of data.lines) {
      expect(l).toHaveLength(8);
      // Front foot near the ground; knee, shoulder and head above it, in that order.
      expect(TRACED.ground - l[1]!).toBeLessThan(stature * 0.16);
      expect(l[3]!).toBeLessThan(l[1]!);
      expect(l[5]!).toBeLessThan(l[3]!);
      expect(l[7]!).toBeLessThan(l[3]!);
    }
    // The front foot travels forward by a real stride and then stays.
    expect(end[0]! - first[0]!).toBeGreaterThan(stature * 0.25);
    const contact = data.lines[TRACED.moments[3]!]!;
    expect(Math.abs(end[0]! - contact[0]!)).toBeLessThan(stature * 0.06);
    // The head finishes ahead of where it started, over or past the front foot.
    expect(end[6]!).toBeGreaterThan(first[6]! + stature * 0.3);
    expect(end[6]!).toBeGreaterThan(end[0]! - stature * 0.1);
  });

  it("is small enough to send to a phone", () => {
    expect(JSON.stringify(data).length).toBeLessThan(300_000);
    expect(TRACED.still.length).toBeLessThan(9_000);
  });
});
