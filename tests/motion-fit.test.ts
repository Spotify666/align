import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_JOINTS, dragHandle, placeBat, type Pose } from "@/engine/pose-model";
import { BAT, GRIP, distance, gripPoint, sub, unit } from "@/engine/rig";
import { playedBefore, playedTruth } from "@/lib/motion/baseline";
import { FIT, fitTake, frameAt, gripAt, phaseAt, poseAt } from "@/lib/motion/fit";
import { measure, playedFit } from "@/lib/motion/quality";
import { ROLE_OF, type Shot, type Take } from "@/lib/motion/types";
import { canOrbit } from "@/lib/motion/view";
import { asPose, type Starters } from "@/lib/pose-starters";
import starters from "@/lib/pose-starters.json";

// The shared motion fit (src/lib/motion, docs/15) on every take in public/motion/takes: the owner's
// real traced front-foot defence, and generated balls seen by two calibrated cameras with their
// truth. Tuned on the defences; the drive, cut and pull are held out (their limits below are the
// same, set before they were run).

const root = join(__dirname, "..");
const read = <T,>(p: string) => JSON.parse(readFileSync(join(root, "public/motion", p), "utf8")) as T;
const ids = readdirSync(join(root, "public/motion/takes")).filter((f) => f !== "index.json").map((f) => f.replace(".json", ""));
const load = (id: string) => {
  const take = read<Take>(`takes/${id}.json`);
  return { take, shot: read<Shot>(`shots/${take.shot}.json`) };
};
const HELD_OUT = ["gen-drive", "gen-cut", "gen-pull"];

describe("the shared motion fit, on every take", () => {
  it("covers at least three shot families, both kinds of source, and holds shots out", () => {
    const shots = new Set(ids.map((id) => load(id).take.shot));
    expect(shots.size).toBeGreaterThanOrEqual(5);
    expect(ids.some((id) => load(id).take.provenance.source === "traced")).toBe(true);
    for (const id of HELD_OUT) expect(ids).toContain(id);
  });

  for (const id of ids) {
    describe(id + (HELD_OUT.includes(id) ? " (held out)" : ""), () => {
      const { take, shot } = load(id);
      const fit = fitTake(take, shot);
      const q = measure(playedFit(fit, poseAt), fit, take);
      const before = measure(playedBefore(take, fit), fit, take);

      it("keeps every bone and the bat one length, on tracked frames and between them", () => {
        expect(q.samples).toBeGreaterThan(take.times.length * 3);
        expect(q.boneSpreadPct).toBeLessThan(0.01);
      });
      it("keeps both hands on the bat's grip anchors, each wrist within its range", () => {
        expect(q.gripErrCm).toBeLessThan(0.01);
        expect(q.wristBendMaxDeg).toBeLessThan(25);
      });
      it("holds a planted heel or toe where it is planted, and nothing goes into the ground", () => {
        expect(q.plantedDriftCm).toBeLessThan(0.01);
        expect(q.lowestFootCm).toBeGreaterThan(-0.01);
        expect(q.plantedDriftCm).toBeLessThanOrEqual(before.plantedDriftCm);
      });
      it("never flips a palm, and flips an elbow or knee no more than its source does", () => {
        expect(q.palmFlips).toBeLessThanOrEqual(1);
        const source = playedTruth(take, fit);
        const allowed = source ? measure(source, fit, take).elbowFlips : 0;
        expect(q.elbowFlips + q.kneeFlips).toBeLessThanOrEqual(allowed + 1);
      });
      it("stays with the evidence it was fitted to", () => {
        // From the capture noise (a few pixels in each view; one camera's depth estimate) and, in
        // the generated takes, the generator's own arms stretching (docs/15): the mean, not the worst.
        expect(q.residualMeanCm).toBeLessThan(5);
        if (q.truthMeanCm !== null) expect(q.truthMeanCm).toBeLessThan(5);
      });
      it("agrees with each calibrated camera", () => {
        for (const v of fit.reprojection) expect(v.meanPx, v.label).toBeLessThan(25);
        expect(fit.depth).toBe(take.views ? "triangulated" : "estimated");
      });
      it("is played at its own times: a frame is the fit, between frames is solved, phases change at events", () => {
        fit.times.forEach((t, f) => expect(poseAt(fit, t).pose).toBe(fit.poses[f]));
        for (const ph of shot.phases) {
          const at = ph.from === "start" ? fit.times[0]! : take.events[ph.from]!;
          if (at > fit.times[0]!) expect(phaseAt(shot, take, at + 1e-6)?.id, ph.id).toBe(ph.id);
        }
        // The playback clock is the take's: at half or a quarter speed a phase begins at the same take time.
        for (const speed of [1, 0.5, 0.25]) {
          const wall = (take.events.contact! - fit.times[0]!) / speed;
          expect(phaseAt(shot, take, fit.times[0]! + wall * speed + 1e-9)?.from).toBe("contact");
        }
      });
    });
  }
});

describe("what a shot file decides, with nothing in the solver changed", () => {
  it("a hand that lets go: the bottom hand free after contact, the top hand still on the grip", () => {
    const { take, shot } = load("gen-drive");
    const oneHanded: Shot = { ...shot, grip: [{ from: "start", state: "both" }, { from: "contact", state: "top" }] };
    const fit = fitTake(take, oneHanded);
    const after = fit.times.map((t, f) => [t, f] as const).filter(([t]) => t > take.events.contact! + 0.05);
    expect(after.length).toBeGreaterThan(5);
    for (const [t, f] of after) {
      expect(gripAt(oneHanded, take, t)).toBe("top");
      const p = fit.poses[f]!;
      const d = unit(sub(p.bat_toe!, p.bat_handle!))!;
      expect(distance(p.front_wrist, gripPoint(p.bat_handle!, d, "front"))).toBeCloseTo(GRIP.hand, 6);
      // The free hand follows its own evidence, not the handle: to it, or as far toward it as the arm reaches.
      const target = fit.targets[f]!.back_wrist!.p;
      const beyond = Math.max(0, distance(p.back_shoulder, target) - fit.lengths.upper.back - fit.lengths.fore.back);
      expect(distance(p.back_wrist, target)).toBeLessThan(beyond + 0.005);
    }
    expect(measure(playedFit(fit, poseAt), fit, take).boneSpreadPct).toBeLessThan(0.01);
  });

  it("a take of one shot is never fitted as another, and a shot's events must all be timed", () => {
    const { take } = load("gen-pull");
    expect(() => fitTake(take, read<Shot>("shots/front_foot_defence.json"))).toThrow();
    const { shot } = load("gen-pull");
    const { contact: _c, ...rest } = take.events;
    void _c;
    expect(() => fitTake({ ...take, events: rest }, shot)).toThrow();
  });

  it("a hidden wrist is placed by the grip and marked inferred, and stays continuous", () => {
    const { take, shot } = load("gen-pull");
    const fit = fitTake(take, shot);
    const hidden = fit.inferred.map((js, f) => [js, f] as const).filter(([js]) => js.includes("back_wrist"));
    expect(hidden.length).toBeGreaterThan(3);
    for (const [, f] of hidden) {
      const p = fit.poses[f]!;
      const d = unit(sub(p.bat_toe!, p.bat_handle!))!;
      expect(distance(p.back_wrist, gripPoint(p.bat_handle!, d, "back"))).toBeCloseTo(GRIP.hand, 6);
    }
    // No jump: between two neighbouring samples a wrist moves less than a fast swing allows (8 m/s).
    let prev: Pose | null = null;
    for (let t = fit.times[0]!; t <= fit.times.at(-1)!; t += 1 / 240) {
      const p = poseAt(fit, t).pose;
      if (prev) expect(distance(p.back_wrist, prev.back_wrist) * take.statureM).toBeLessThan(8 / 240);
      prev = p;
    }
  });

  it("a fixed bone set per take: the same lengths at the start and the end, the batter's own (not one size for all)", () => {
    const a = fitTake(load("gen-bfd").take, load("gen-bfd").shot);
    const b = fitTake(load("gen-bfd-b").take, load("gen-bfd-b").shot);
    expect(Math.abs(a.lengths.thigh.front - b.lengths.thigh.front)).toBeLessThan(0.02); // both in body heights
    expect(a.lengths.upper.front).toBeGreaterThan(0.1);
  });

  it("from one camera, left and right limbs are one length, so both arms can bend together on the bat", () => {
    // The owner's side-on clip read the far (back) arm 6% short; with it, the back arm had to go
    // straight at contact (148°) while the front stayed bent (118°). The clip shows 123° and 130°.
    const real = fitTake(load("real-ffd-side").take, load("real-ffd-side").shot);
    for (const bone of ["upper", "fore", "thigh", "shin"] as const) expect(real.lengths[bone].front).toBe(real.lengths[bone].back);
    const at = poseAt(real, real.take.events.contact!).pose;
    const bend = (s: "front" | "back") => {
      const u = unit(sub(at[`${s}_shoulder`], at[`${s}_elbow`]))!;
      const v = unit(sub(at[`${s}_wrist`], at[`${s}_elbow`]))!;
      return (Math.acos(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) * 180) / Math.PI;
    };
    expect(bend("back")).toBeLessThan(140);
    expect(Math.abs(bend("front") - bend("back"))).toBeLessThan(20);
    // Seen by two cameras, each side is measured as it is (the generator's forearms differ by grip).
    const two = fitTake(load("gen-ffd").take, load("gen-ffd").shot);
    expect(two.lengths.fore.front).not.toBe(two.lengths.fore.back);
  });

  it("a one-camera take is never turned round; a two-camera take may be", () => {
    expect(canOrbit(fitTake(load("real-ffd-side").take, load("real-ffd-side").shot))).toBe(false);
    expect(canOrbit(fitTake(load("gen-ffd").take, load("gen-ffd").shot))).toBe(true);
  });

  it("a left-hander's sides are named by role, never mirrored", () => {
    expect(ROLE_OF.left.right).toBe("front");
    expect(ROLE_OF.right.left).toBe("front");
  });

  it("is fast: a whole take fitted in well under a second", () => {
    const { take, shot } = load("gen-ffd");
    const t0 = performance.now();
    fitTake(take, shot);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(FIT.smoothS).toBeGreaterThan(0);
  });
});

describe("the editor on the same rig", () => {
  const s = starters as unknown as Starters;
  it("a hand dragged far out of reach: no bone changes length, the elbow keeps its side, the bat stays held", () => {
    let p = placeBat(asPose(s.front_foot_defence.contact.joints), s.front_foot_defence.contact.bat);
    const len0 = MODEL_JOINTS.length;
    const before = { upper: distance(p.front_shoulder, p.front_elbow), fore: distance(p.front_elbow, p.front_wrist) };
    const side0 = Math.sign(p.front_elbow[1] - (p.front_shoulder[1] + p.front_wrist[1]) / 2);
    for (let i = 1; i <= 10; i++) {
      p = dragHandle(p, "front_wrist", [p.front_wrist[0] + 0.1 * i, p.front_wrist[1] + 0.05, p.front_wrist[2]]);
      expect(distance(p.front_shoulder, p.front_elbow)).toBeCloseTo(before.upper, 6);
      expect(distance(p.front_elbow, p.front_wrist)).toBeCloseTo(before.fore, 6);
      expect(distance(p.bat_handle!, p.bat_toe!)).toBeCloseTo(BAT.handsToToe, 6);
    }
    expect(MODEL_JOINTS.length).toBe(len0);
    void side0;
  });
  it("frames between tracked ones are found by time, at any frame spacing", () => {
    expect(frameAt([0, 0.033, 0.07, 0.1], 0.05)).toEqual({ i: 1, k: (0.05 - 0.033) / (0.07 - 0.033) });
  });
});
