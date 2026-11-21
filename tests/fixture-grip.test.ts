import { describe, expect, it } from "vitest";
import { FIXTURE_SPECS, ffdScript } from "@/engine/fixtures";
import { gripReport } from "@/engine/fixtures/grip-report";
import type { GenerateOptions } from "@/engine/fixtures/generate";

// The root cause of the sample's wandering hands (2026-11-20): the generator put both wrist marks on
// the bat line wherever the script put the hands, then fitted each elbow afterwards, so an arm
// folded shut at the top of the backlift (the rear elbow 164°, its marker hanging under the grip)
// or stretched past its length after contact (a forearm 33-51% too long). The demonstrations now
// hold one rigid bat (generate.ts `grip: "rigid"`, the rig's arm solve). Held here on the
// generator's own truth, frame by frame, for every demonstration of the front-foot defence.

const demos = FIXTURE_SPECS.filter((s) => s.options.script.grip === "rigid" && !s.options.photoAtContact);

describe("the demonstrations' hands on the bat", () => {
  it("covers the sample and its siblings, both batting sides", () => {
    expect(demos.map((d) => d.key)).toContain("valid_ffd");
    expect(demos.some((d) => d.options.handedness === "left")).toBe(true);
  });

  for (const spec of demos) {
    describe(spec.key, () => {
      const r = gripReport(spec.options);
      it("holds the bat with both hands, a hand's length behind each grip, on every frame", () => {
        expect(r.worst.leadShortCm).toBeLessThan(0.01);
        expect(r.worst.rearShortCm).toBeLessThan(0.01);
      });
      it("keeps every arm bone one length", () => expect(r.worst.boneSpreadCm).toBeLessThan(0.01));
      it("keeps the top hand above the bottom one, and no elbow flips", () => {
        expect(r.worst.swaps).toBe(0);
        expect(r.worst.elbowFlips).toBe(0);
      });
      it("bends the rear elbow at the top of the backlift without folding it shut", () => {
        // 164° before; an elbow folded past about 135° hangs under the grip.
        expect(r.worst.rearBendMax).toBeLessThan(135);
      });
      it("keeps the blade clear of the front pad", () => expect(r.worst.padClearMinCm).toBeGreaterThan(1));
      it("meets the ball with the blade at contact, and the ball changes direction there", () => {
        const at = r.frames.reduce((a, b) => (Math.abs(b.t - r.contactT) < Math.abs(a.t - r.contactT) ? b : a));
        expect(at.ballCm).not.toBeNull();
        expect(at.ballCm!).toBeLessThan(4); // a ball's radius
        const i = r.frames.indexOf(at);
        const before = r.frames[i - 2]!.ball!;
        const after = r.frames[i + 3]!.ball!;
        const b = at.ball!;
        const v1 = [b[0] - before[0], b[2] - before[2]] as const;
        const v2 = [after[0] - b[0], after[2] - b[2]] as const;
        expect(v1[0] * v2[0] + v1[1] * v2[1]).toBeLessThan(0); // it was coming at the batter; it goes back
      });
    });
  }

  it("leaves the validation population's movement as it was (the benchmark the thresholds were judged against)", () => {
    const plain = ffdScript({});
    expect(plain.grip).toBeUndefined();
    const before: GenerateOptions = { id: "x", label: "x", seed: 3, fps: 60, durationS: 2, statureM: 1.75, handedness: "right", script: plain };
    // Its wrists still sit on the handle, as before: the arm bones change length to meet them.
    expect(gripReport(before).worst.boneSpreadCm).toBeGreaterThan(1);
  });
});
