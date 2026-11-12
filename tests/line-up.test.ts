// Lining up the camera: what the screen says from one pose reading and from gravity.
import { describe, expect, it } from "vitest";
import { GUIDES, LEVEL_WITHIN, framing, ready, tiltFromGravity } from "@/lib/capture/line-up";
import { JOINTS, type ImgPoint } from "@/engine/types";

/** A standing person: head at `top`, feet at `bottom`, centred at x. */
const person = (top: number, bottom: number, x = 0.5, conf = 0.9): ImgPoint[] => {
  const h = bottom - top;
  const y: Record<string, number> = { nose: 0, shoulder: 0.16, elbow: 0.32, wrist: 0.45, hip: 0.5, knee: 0.74, ankle: 0.95, heel: 0.98, foot: 1 };
  return JOINTS.map((j) => {
    const part = j.replace(/^(left|right)_/, "");
    const side = j.startsWith("left") ? -0.03 : j.startsWith("right") ? 0.03 : 0;
    return [x + side, top + h * y[part]!, conf] as const;
  });
};
const LAND = { w: 1280, h: 720 };
const PORT = { w: 720, h: 1280 };

describe("the picture", () => {
  it("passes a whole batter of the size the guide asks for", () => {
    const side = framing(person(0.3, 0.8), 1, "side", LAND);
    expect(side).toMatchObject({ whole: "pass", size: "pass", one: "pass", turned: "pass", sizeHint: null });
    const end = framing(person(0.25, 0.78), 1, "end", PORT);
    expect(end).toMatchObject({ whole: "pass", size: "pass", turned: "pass" });
    expect(ready(side, null)).toBe(true);
  });

  it("says which way to move when the batter is too small or too big", () => {
    expect(framing(person(0.5, 0.62), 1, "side", LAND)).toMatchObject({ size: "warn", sizeHint: "closer" });
    expect(framing(person(0.05, 0.95), 1, "side", LAND)).toMatchObject({ size: "warn", sizeHint: "back" });
    // The same batter can be right from the side and too small from the bowler's end.
    const small = person(0.4, 0.68);
    expect(framing(small, 1, "side", LAND).size).toBe("pass");
    expect(framing(small, 1, "end", PORT).sizeHint).toBe("closer");
    for (const v of ["side", "end"] as const) expect(GUIDES[v].size[0]).toBeLessThan(GUIDES[v].size[1]);
  });

  it("notices a head or feet out of the picture", () => {
    expect(framing(person(0.3, 1.02), 1, "side", LAND).whole).toBe("warn");
    expect(framing(person(-0.02, 0.6), 1, "side", LAND).whole).toBe("warn");
    const noFeet = person(0.3, 0.8).map((p, i) => (JOINTS[i]!.match(/ankle|heel|foot/) ? null : p));
    expect(framing(noFeet, 1, "side", LAND)).toMatchObject({ whole: "warn", size: "unknown" });
    expect(ready(framing(person(0.3, 1.02), 1, "side", LAND), null)).toBe(false);
  });

  it("claims nothing when nobody is seen", () => {
    const f = framing(JOINTS.map(() => null), 0, "side", LAND);
    expect(f).toMatchObject({ whole: "unknown", size: "unknown", one: "unknown", height: null });
    expect(ready(f, null)).toBe(false);
    expect(ready(null, null)).toBe(false);
  });

  it("wants the phone on its side from the side and upright from the bowler's end", () => {
    expect(framing(person(0.3, 0.8), 1, "side", PORT).turned).toBe("warn");
    expect(framing(person(0.3, 0.8), 1, "end", LAND).turned).toBe("warn");
    expect(framing(person(0.3, 0.8), 1, "end", PORT).turned).toBe("pass");
  });

  it("flags a second person", () => {
    const f = framing(person(0.3, 0.8), 2, "side", LAND);
    expect(f.one).toBe("warn");
    expect(ready(f, null)).toBe(false);
  });
});

describe("the level", () => {
  const g = 9.81;
  const at = (deg: number) => [g * Math.sin((deg * Math.PI) / 180), g * Math.cos((deg * Math.PI) / 180)] as const;

  it("reads level whichever way the phone is turned and whichever sign the phone reports", () => {
    for (const base of [0, 90, 180, -90]) {
      const [x, y] = at(base);
      expect(Math.abs(tiltFromGravity(x, y, 0)!.roll)).toBeLessThan(0.01);
      const [x2, y2] = at(base + 5);
      expect(tiltFromGravity(x2, y2, 0)!.roll).toBeCloseTo(5, 5);
      expect(tiltFromGravity(-x2, -y2, 0)!.roll).toBeCloseTo(5, 5);
    }
  });

  it("gives no level without a sensor or with the phone lying flat", () => {
    expect(tiltFromGravity(null, null, null)).toBeNull();
    expect(tiltFromGravity(undefined, 1, 1)).toBeNull();
    expect(tiltFromGravity(0, 0, 0)).toBeNull(); // a desktop reporting zeros
    expect(tiltFromGravity(0.2, 0.3, 9.8)).toBeNull();
    expect(tiltFromGravity(0, 9, 3)!.lean).toBeGreaterThan(15);
  });

  it("is part of being ready only when there is a reading", () => {
    const ok = framing(person(0.3, 0.8), 1, "side", LAND);
    expect(ready(ok, { roll: LEVEL_WITHIN, lean: 5 })).toBe(true);
    expect(ready(ok, { roll: LEVEL_WITHIN + 2, lean: 5 })).toBe(false);
    expect(ready(ok, null)).toBe(true);
  });
});
