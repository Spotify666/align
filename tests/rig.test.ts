import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GRIP, WRIST, angleDeg, armToGrip, cross, distance, dot, gripPoint, onSphere, onTwoSpheres, sub, twoBone, unit, type V3,
} from "@/engine/rig";
import { rng } from "@/engine/math";

// The one rig every figure is solved with (src/engine/rig.ts): held to its own geometry here, and to
// real and generated takes in tests/motion-fit.test.ts.

const R = rng(5);
const rand = (k = 1): V3 => [(R() * 2 - 1) * k, (R() * 2 - 1) * k, (R() * 2 - 1) * k];

describe("the rig", () => {
  it("is read by no part of the analysis", () => {
    const dir = join(__dirname, "../src/engine");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !["rig.ts", "pose-model.ts"].includes(x))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/from "(\.\/rig|@\/engine\/rig|@\/lib\/motion[^"]*)"/);
    }
    // The generator (fixtures) uses the rig for its demonstrations' arms (`grip: "rigid"`); it is demo
    // data, not analysis, and the analysis files above never reach the rig.
  });

  it("two bones keep their lengths for any target, reached or not", () => {
    for (let i = 0; i < 400; i++) {
      const root = rand();
      const a = 0.1 + R() * 0.2;
      const b = 0.1 + R() * 0.2;
      const target = rand(0.8);
      const r = twoBone(root, a, b, target, rand());
      expect(distance(root, r.mid)).toBeCloseTo(a, 9);
      expect(distance(r.mid, r.end)).toBeCloseTo(b, 9);
      if (distance(root, target) <= a + b - 1e-3 && distance(root, target) >= Math.abs(a - b) + 1e-3) expect(distance(r.end, target)).toBeLessThan(1e-9);
      // Never past the target: an unreachable one is reached for along its own line.
      else expect(angleDeg(sub(r.end, root), sub(target, root))).toBeLessThan(1e-4);
    }
  });

  it("an elbow straightening and bending again keeps its side: no flip through straight", () => {
    const root: V3 = [0, 0, 0];
    let prev: V3 | null = null;
    let first: V3 | null = null;
    // The target sweeps out past full reach and back; the pole wobbles round as a tracker's guess does near straight.
    for (let i = 0; i <= 60; i++) {
      const reachK = 0.6 + 0.4 * Math.sin((i / 60) * Math.PI); // up to 1.0: straight
      const target: V3 = [0.36 * reachK, -0.05, 0];
      const pole: V3 = reachK > 0.97 ? [0, Math.cos(i), Math.sin(i)] : [0, 1, 0.2];
      const r = twoBone(root, 0.18, 0.18, target, pole, prev);
      if (!first) first = r.normal;
      expect(dot(r.normal, first), `step ${i}`).toBeGreaterThan(0);
      prev = r.normal;
    }
  });

  it("an arm holds its grip: the hand its own length from the wrist, the wrist within its range, never a fixed angle", () => {
    const bends = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const shoulder: V3 = [0, 0.8, 0];
      const grip: V3 = [0.15 + R() * 0.2, 0.45 + R() * 0.3, R() * 0.2 - 0.1];
      const wristHint: V3 = [grip[0] - 0.05 + R() * 0.03, grip[1] + R() * 0.06, grip[2]];
      const a = armToGrip({ shoulder, upper: 0.186, fore: 0.146, grip, wristHint, elbowHint: [0.05, 0.62, 0.05], hintWeight: R(), preferred: [0, -1, 0.2] });
      expect(distance(shoulder, a.elbow)).toBeCloseTo(0.186, 9);
      expect(distance(a.elbow, a.wrist)).toBeCloseTo(0.146, 9);
      if (Math.hypot(...a.short) < 1e-9) expect(distance(a.wrist, grip)).toBeCloseTo(GRIP.hand, 9);
      expect(a.bendDeg).toBeLessThan(WRIST.maxBendDeg);
      bends.add(Math.round(a.bendDeg));
    }
    // The bend comes from the evidence: many different bends, not one.
    expect(bends.size).toBeGreaterThan(10);
  });

  it("an arm that can't reach says by how much, and keeps every length", () => {
    const a = armToGrip({ shoulder: [0, 0.8, 0], upper: 0.186, fore: 0.146, grip: [0.9, 0.8, 0], wristHint: null, elbowHint: null, hintWeight: 0, preferred: [0, -1, 0] });
    expect(Math.hypot(...a.short)).toBeGreaterThan(0.4);
    expect(distance([0, 0.8, 0], a.elbow)).toBeCloseTo(0.186, 9);
    expect(distance(a.elbow, a.wrist)).toBeCloseTo(0.146, 9);
  });

  it("the top hand's grip is above the bottom hand's on the handle", () => {
    const d: V3 = unit([0.3, -1, 0.1])!;
    const h: V3 = [0.4, 0.6, 0.1];
    expect(dot(sub(gripPoint(h, d, "back"), gripPoint(h, d, "front")), d)).toBeCloseTo(GRIP.top + GRIP.bottom, 9);
  });

  it("hangs a point at two fixed distances, the nearest such to where it was", () => {
    for (let i = 0; i < 200; i++) {
      const heel = rand(0.3);
      const toe = sub(heel, mul(unit(rand())!, -0.1));
      const p = onTwoSpheres(heel, 0.041, toe, 0.092, rand(0.5));
      if (distance(heel, toe) <= 0.041 + 0.092) {
        expect(distance(p, heel)).toBeCloseTo(0.041, 9);
        expect(distance(p, toe)).toBeCloseTo(0.092, 9);
      }
      expect(distance(onSphere(heel, 0.05, rand()), heel)).toBeCloseTo(0.05, 9);
    }
    void cross;
  });
});

const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
