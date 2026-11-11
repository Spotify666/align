// The landing figure is drawn from the engine's own 3D track of a generated defence.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { BONES, CHAIN, HERO_CAMERA, HERO_JOINTS, LINE, heroData, posterPaths, project } from "@/lib/hero-geometry";

const track = fixture("session3d");
const contact = analyze(track, { analysisId: "h", createdAt: "h" }).events.find((e) => e.type === "contact")!.frame;
const data = heroData(track, contact)!;

describe("landing figure", () => {
  it("is a short stretch of the real track around contact, small enough to send with the page", () => {
    expect(data.frames.length).toBeGreaterThan(20);
    expect(data.frames.length).toBeLessThan(48);
    expect(data.frames[0]!.length).toBe(HERO_JOINTS.length);
    expect(data.contact).toBeGreaterThan(0);
    expect(data.contact).toBeLessThan(data.frames.length);
    expect(JSON.stringify(data).length).toBeLessThan(12000);
  });

  it("is a standing batter: head above hips above ankles, front foot forward at contact", () => {
    const f = data.frames[data.contact]!;
    const up = (i: number) => f[i]![1]!;
    expect(up(0)).toBeGreaterThan(up(7));
    expect(up(7)).toBeGreaterThan(up(11));
    // Right-hander: the left foot is the front foot, nearer the bowler.
    expect(f[11]![0]!).toBeGreaterThan(f[12]![0]!);
    for (const [a, b] of BONES) expect(Math.hypot(f[a]![0]! - f[b]![0]!, f[a]![1]! - f[b]![1]!, f[a]![2]! - f[b]![2]!)).toBeLessThan(0.9);
  });

  it("projects into the picture, upright, nearer things larger", () => {
    const [x, y, s] = project(HERO_CAMERA.target, HERO_CAMERA, 640, 520);
    expect(x).toBeCloseTo(320, 0);
    expect(y).toBeGreaterThan(0);
    expect(s).toBeCloseTo(1, 5);
    const high = project([1.3, 1.7, 0], HERO_CAMERA, 640, 520);
    const low = project([1.3, 0, 0], HERO_CAMERA, 640, 520);
    expect(high[1]).toBeLessThan(low[1]);
    const p = posterPaths(data, 640, 520);
    for (const [px, py] of p.joints) {
      expect(px).toBeGreaterThan(0);
      expect(px).toBeLessThan(640);
      expect(py).toBeGreaterThan(0);
      expect(py).toBeLessThan(520);
    }
    expect(p.line.startsWith("M")).toBe(true);
    expect(p.bones).not.toMatch(/NaN/);
  });

  it("the energy path and the line run through the front side only", () => {
    expect(CHAIN.map((i) => HERO_JOINTS[i])).toEqual(["left_ankle", "left_knee", "left_hip", "left_shoulder", "left_elbow", "left_wrist"]);
    expect(LINE.map((i) => HERO_JOINTS[i])).toEqual(["left_ankle", "left_knee", "left_shoulder", "nose"]);
  });
});
