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
      const centre: V3 = [(head.a[0] + head.b[0]) / 2, (head.a[1] + head.b[1]) / 2, (head.a[2] + head.b[2]) / 2];
      expect(near(centre, p.head)).toBeLessThan(0.08);
      for (const f of parts.filter((x) => x.key.endsWith("-foot"))) expect(Math.min(f.a[1], f.b[1]) - (f.depth ?? 0)).toBeLessThan(0.05);
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
  it("grips the bat as a batter does: both fists on the handle, the top hand just above the bottom one", () => {
    for (const shot of ["front_foot_defence", "back_foot_defence"] as const)
      for (const m of MOMENTS) {
        const p = placeBat(starterPose(shot, m.id), starterBat(shot, m.id));
        const parts = mannequinParts(p);
        const dir = ((d: V3) => { const l = Math.hypot(...d); return d.map((x) => x / l) as unknown as V3; })([p.bat_toe![0] - p.bat_handle![0], p.bat_toe![1] - p.bat_handle![1], p.bat_toe![2] - p.bat_handle![2]]);
        const offAxis = (q: V3) => {
          const r: V3 = [q[0] - p.bat_handle![0], q[1] - p.bat_handle![1], q[2] - p.bat_handle![2]];
          const t = r[0] * dir[0] + r[1] * dir[1] + r[2] * dir[2];
          return { t, d: Math.hypot(r[0] - dir[0] * t, r[1] - dir[1] * t, r[2] - dir[2] * t) };
        };
        const mid = (k: string) => { const f = parts.find((x) => x.key === k)!; return [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, (f.a[2] + f.b[2]) / 2] as V3; };
        const top = offAxis(mid("front-fist"));
        const bottom = offAxis(mid("back-fist"));
        expect(top.d, `${shot} ${m.id}`).toBeLessThan(0.01);
        expect(bottom.d).toBeLessThan(0.01);
        expect(top.t).toBeLessThan(bottom.t);
        expect(bottom.t - top.t).toBeLessThan(0.08);
        // No open hands when holding a bat.
        expect(parts.some((x) => x.key.endsWith("-hand"))).toBe(false);
        // In kit: a helmet with its grille, pads on both shins, gloves, shoes with soles.
        for (const k of ["helmet", "helmet-peak", "grille-0", "front-pad", "back-pad", "front-knee-roll", "front-fist", "back-cuff", "front-sole"]) expect(parts.some((x) => x.key === k), k).toBe(true);
      }
  });
});
