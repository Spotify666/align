// The landing figure is an instrument, not a drawing of a person: it shows what the engine
// measured on a generated example (the line over the front foot, against the engine's own
// ranges), with the bat, the ball and the pitch to scale.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { HERO_CAMERA, HERO_JOINTS, LINE_PARTS, heroData, instrument, pitchLines, project } from "@/lib/hero-geometry";

const track = fixture("session3d");
const payload = analyze(track, { analysisId: "h", createdAt: "h" });
const contact = payload.events.find((e) => e.type === "contact")!.frame;
const data = heroData(track, contact, payload.line!.bands)!;
const W = 640;
const H = 440;

describe("landing figure", () => {
  it("is a short stretch of the engine's track around contact, small enough to send with the page", () => {
    expect(payload.line).toBeTruthy();
    expect(data.frames.length).toBeGreaterThan(16);
    expect(data.frames.length).toBeLessThan(48);
    expect(data.frames[0]!.length).toBe(HERO_JOINTS.length);
    expect(data.contact).toBeGreaterThan(0);
    expect(data.contact).toBeLessThan(data.frames.length);
    expect(JSON.stringify(data).length).toBeLessThan(12000);
  });

  it("carries the bat and the ball from the same example: handle at the hands, toe below, a believable length", () => {
    const bat = data.bat[data.contact]!;
    const f = data.frames[data.contact]!;
    const hands = [(f[5]![0]! + f[6]![0]!) / 2, (f[5]![1]! + f[6]![1]!) / 2];
    expect(Math.hypot(bat[0][0]! - hands[0]!, bat[0][1]! - hands[1]!)).toBeLessThan(0.3);
    expect(bat[1][1]!).toBeLessThan(bat[0][1]!);
    const length = Math.hypot(bat[1][0]! - bat[0][0]!, bat[1][1]! - bat[0][1]!);
    expect(length).toBeGreaterThan(0.6);
    expect(length).toBeLessThan(1.05);
    expect(data.ball.some(Boolean)).toBe(true);
  });

  it("is a side elevation: forward runs left to right, up is up, the pitch is one ground line", () => {
    const high = project([1.3, 1.7, 0], HERO_CAMERA, W, H);
    const low = project([1.3, 0, 0], HERO_CAMERA, W, H);
    expect(high[1]).toBeLessThan(low[1]);
    expect(project([2, 0, 0], HERO_CAMERA, W, H)[0]).toBeGreaterThan(low[0]);
    const m = instrument(data, data.contact, W, H);
    const ys = pitchLines(undefined, W, H).slice(0, 2).flatMap(([, y1, , y2]) => [y1, y2]);
    for (const y of ys) expect(Math.abs(y - m.groundY)).toBeLessThan(6);
  });

  it("shows exactly what the engine found at contact: each part in its range or not, as in the analysis", () => {
    const m = instrument(data, data.contact, W, H);
    expect(m.parts.map((p) => p.part)).toEqual(LINE_PARTS.map((p) => p.part));
    for (const p of m.parts) {
      const offset = payload.line!.atReference[p.part];
      const [lo, hi] = payload.line!.bands[p.part];
      if (offset === null) continue;
      // Within a rounding step of the engine's own reading at contact.
      const expected = offset < lo - 0.02 ? "behind" : offset > hi + 0.02 ? "ahead" : offset > lo + 0.02 && offset < hi - 0.02 ? "in_line" : p.state;
      expect(p.state, p.part).toBe(expected);
      // The marker sits in its bracket exactly when it is in line.
      const [a, b] = [Math.min(...p.range), Math.max(...p.range)];
      expect(p.at[0] >= a - 0.5 && p.at[0] <= b + 0.5, p.part).toBe(p.state === "in_line");
    }
    // Top down: head above shoulder above knee above the ground.
    expect(m.parts[0]!.at[1]).toBeLessThan(m.parts[1]!.at[1]);
    expect(m.parts[1]!.at[1]).toBeLessThan(m.parts[2]!.at[1]);
    expect(m.parts[2]!.at[1]).toBeLessThan(m.groundY);
  });

  it("stays in the picture and grows its trails as the movement plays", () => {
    const early = instrument(data, 2, W, H);
    const late = instrument(data, data.contact, W, H);
    expect(late.trails[0]!.length).toBeGreaterThan(early.trails[0]!.length);
    for (const p of [...late.parts.map((x) => x.at), late.frontFoot, late.backFoot, ...(late.bat ?? [])]) {
      expect(p[0]).toBeGreaterThan(0);
      expect(p[0]).toBeLessThan(W);
      expect(p[1]).toBeGreaterThan(0);
      expect(p[1]).toBeLessThan(H);
    }
    // The front foot is ahead of the back foot (toward the bowler, to the right).
    expect(late.frontFoot[0]).toBeGreaterThan(late.backFoot[0]);
    expect(late.plumb.x).toBeCloseTo(late.frontFoot[0], 3);
  });
});
