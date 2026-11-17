import { describe, expect, it } from "vitest";
import { HANDLES, MOMENTS, dragHandle, handlePoint, placeBat, type Pose, type V3 } from "@/engine/pose-model";
import { mannequinParts, partsMovedBy } from "@/lib/mannequin";
import { starterBat, starterPose } from "@/lib/pose-models";

// The shot-model mannequin (src/lib/mannequin.ts): every part hangs between the points a person
// placed, so it follows the pose exactly and never stretches; nothing is drawn that wasn't placed.

const near = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const poses: Array<[string, Pose]> = (["front_foot_defence", "back_foot_defence"] as const).flatMap((shot) => MOMENTS.map((m) => [`${shot} ${m.id}`, starterPose(shot, m.id)] as [string, Pose]));

describe("the mannequin", () => {
  it("hangs every limb between the joints placed, and puts a ball at each joint", () => {
    for (const [name, p] of poses) {
      const parts = mannequinParts(p);
      for (const s of ["front", "back"] as const) {
        const limb = (key: string) => parts.find((x) => x.key === `${s}-${key}`)!;
        expect(near(limb("upper-arm").a, p[`${s}_shoulder`]), name).toBe(0);
        expect(near(limb("upper-arm").b, p[`${s}_elbow`]), name).toBe(0);
        expect(near(limb("forearm").b, p[`${s}_wrist`]), name).toBe(0);
        expect(near(limb("thigh").a, p[`${s}_hip`]), name).toBe(0);
        expect(near(limb("shin").b, p[`${s}_ankle`]), name).toBe(0);
        for (const j of ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]) expect(near(limb(`${j}-joint`).a, p[`${s}_${j}` as keyof Pose] as V3)).toBe(0);
      }
      // The head sits behind the nose (the tracked point), the feet on the ground.
      const head = parts.find((x) => x.key === "head")!;
      expect(near(head.a, p.head)).toBeLessThan(0.08);
      for (const f of parts.filter((x) => x.kind === "foot")) expect(Math.min(f.a[1], f.b[1]) - (f.depth ?? 0)).toBeLessThan(0.05);
    }
  });
  it("follows a joint that is moved, however far, without a part leaving its joints", () => {
    let p = placeBat(starterPose("front_foot_defence", "contact"), starterBat("front_foot_defence", "contact"));
    for (const h of [...HANDLES, "bat_toe" as const]) {
      const at = handlePoint(p, h);
      p = dragHandle(p, h, [at[0] + 0.4, at[1] + 0.3, at[2] - 0.2]);
      const parts = mannequinParts(p);
      const thigh = parts.find((x) => x.key === "front-thigh")!;
      expect(near(thigh.a, p.front_hip)).toBe(0);
      expect(near(thigh.b, p.front_knee)).toBe(0);
      for (const part of parts) for (const v of [...part.a, ...part.b]) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it("holds a bat only when the model has one, and shows what a picked handle moves", () => {
    const p = starterPose("back_foot_defence", "contact");
    expect(mannequinParts(p).some((x) => x.key.startsWith("bat"))).toBe(false);
    const held = mannequinParts(placeBat(p, starterBat("back_foot_defence", "contact")));
    expect(held.some((x) => x.key === "bat-blade")).toBe(true);
    expect([...partsMovedBy(held, "bat_toe")].sort()).toEqual(["bat-blade", "bat-handle"]);
    expect(partsMovedBy(held, "front_knee").has("front-thigh")).toBe(true);
    expect(partsMovedBy(held, null).size).toBe(0);
  });
});
