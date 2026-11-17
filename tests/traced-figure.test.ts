import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BAT, MODEL_JOINTS, MOMENTS, dragHandle, ground, placeBat, type Plane, type Pose, type V3 } from "@/engine/pose-model";
import { starterBat, starterPose } from "@/lib/pose-models";
import type { ModelPoint } from "@/engine/pose-model";
import { startersFrom } from "@/lib/pose-starters";
import stored from "@/lib/pose-starters.json";
import {
  FIGURE_FILES, TRACED_FIGURE_SCHEMA, batBones, bend, bind, bodyBones, figureFile, followFrom, plainBat, points3, restPoints, tracedPose, type TracedFigure, type TracedMoment,
} from "@/lib/traced-figure";

// The shot-model figure traced from the owner's own clips (src/lib/traced-figure.ts): what the
// files hold, that new models start from that real batter, and that the drawing follows the joints.

const read = (path: string): TracedFigure => JSON.parse(readFileSync(`public${path}`, "utf8"));
// Each traced file once (the front-foot defence's front view borrows the back-foot one).
const figures = [...new Map(Object.values(FIGURE_FILES).flatMap((planes) => Object.entries(planes).map(([plane, s]) => [s.file, { shot: s.from, plane: plane as Plane, path: s.file }] as const))).values()].map((f) => ({ ...f, fig: read(f.path) }));
/** A 3D point as the drawing's plane sees it. */
const inPlane = (p: V3, plane: Plane): readonly [number, number] => (plane === "side" ? [p[0], p[1]] : [p[2], p[1]]);
const flat = (shapes: number[][]) => shapes.flatMap((s) => Array.from({ length: s.length / 2 }, (_, i) => [s[2 * i]! / 1000, s[2 * i + 1]! / 1000] as const));

describe("the traced figures", () => {
  it("are what the files say: a right-hander, every joint at every moment held, a drawing of plausible size", () => {
    expect(figures.length).toBe(3);
    for (const { shot, plane, fig } of figures) {
      expect(fig.schema).toBe(TRACED_FIGURE_SCHEMA);
      expect(fig.shot).toBe(shot);
      expect(fig.view).toBe(plane);
      expect(fig.batting_side).toBe("right");
      expect(fig.moments.contact).toBeDefined();
      for (const [id, m] of Object.entries(fig.moments) as Array<[string, TracedMoment]>) {
        for (const k of MODEL_JOINTS) expect(m.pose[k]?.every(Number.isFinite), `${shot} ${plane} ${id} ${k}`).toBe(true);
        expect(m.body.length, `${shot} ${plane} ${id}: lines`).toBeGreaterThan(5);
        for (const [x, y] of flat(m.body)) {
          expect(Math.abs(x)).toBeLessThan(1.5);
          expect(y).toBeGreaterThan(-0.15);
          expect(y).toBeLessThan(1.3);
        }
        // The drawing is the batter: the head's line is near the head joint, the feet's near the ground.
        const ys = flat(m.body).map(([, y]) => y);
        expect(Math.min(...ys)).toBeLessThan(0.08);
        expect(Math.max(...ys)).toBeGreaterThan(m.pose.head![1]);
      }
    }
  });
  it("are never offered to a left-hander: a tracing is not mirrored", () => {
    for (const shot of ["front_foot_defence", "back_foot_defence"] as const)
      for (const plane of ["side", "front"] as const) {
        expect(figureFile(shot, plane, "left")).toBeNull();
        expect(figureFile(shot, plane, "right")).not.toBeNull();
      }
    expect(figureFile("front_foot_defence", "side", "right")).toEqual({ file: "/art/model-ffd-side.json", from: "front_foot_defence" });
    // No clip of a front-foot defence from the bowler's end: that view borrows the back-foot one, and says so.
    expect(figureFile("front_foot_defence", "front", "right")).toEqual({ file: "/art/model-bfd-front.json", from: "back_foot_defence" });
  });
});

describe("a new model starts from the traced batter", () => {
  it("its stored poses are the traced ones (else run: node scripts/pose-starters.mjs > src/lib/pose-starters.json)", () => {
    const side = { front_foot_defence: read("/art/model-ffd-side.json"), back_foot_defence: read("/art/model-bfd-side.json") };
    expect(JSON.parse(JSON.stringify(startersFrom(side, { front_foot_defence: read("/art/model-bfd-front.json"), back_foot_defence: read("/art/model-bfd-front.json") })))).toEqual(stored);
  });
  it("stands on the ground, the bat in its traced direction", () => {
    for (const shot of ["front_foot_defence", "back_foot_defence"] as const)
      for (const m of MOMENTS) {
        const p = starterPose(shot, m.id);
        expect(Math.min(p.front_heel[1], p.front_foot[1], p.back_heel[1], p.back_foot[1])).toBeCloseTo(0, 9);
        expect(p.head[1]).toBeGreaterThan(0.6);
        const b = starterBat(shot, m.id);
        expect(Math.hypot(...b)).toBeGreaterThan(0.1);
      }
    // A front-foot defence at contact: a long stride, the head ahead of the back foot; a back-foot defence stands taller.
    const f = starterPose("front_foot_defence", "contact");
    expect(f.front_ankle[0] - f.back_ankle[0]).toBeGreaterThan(0.3);
    expect(starterPose("back_foot_defence", "contact").head[1]).toBeGreaterThan(f.head[1]);
  });
});

describe("the drawing follows the joints", () => {
  const near = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));

  it("is the traced drawing, unchanged, at the traced pose: every file, every moment", () => {
    for (const { fig, plane, path } of figures)
      for (const [id, m] of Object.entries(fig.moments) as Array<[string, TracedMoment]>) {
        const out = bend(bind(m.body, bodyBones(restPoints(m, plane))), bodyBones(points3(tracedPose(m))), plane).flat();
        const before = flat(m.body);
        expect(out.length, `${path} ${id}`).toBe(before.length);
        out.forEach((p, i) => expect(near(inPlane(p, plane), before[i]!), `${path} ${id}`).toBeLessThan(1e-4));
      }
  });

  const { fig, plane } = figures.find((f) => f.shot === "front_foot_defence" && f.plane === "side")!;
  const m = fig.moments.contact!;
  const bound = bind(m.body, bodyBones(restPoints(m, plane)));
  const pose = tracedPose(m);
  const before = flat(m.body);

  it("moves with a limb that is moved, and leaves the far side of the body where it was", () => {
    const moved = dragHandle(pose, "front_ankle", [pose.front_ankle[0] + 0.12, pose.front_ankle[1] + 0.08, pose.front_ankle[2]]);
    const out = bend(bound, bodyBones(points3(moved)), plane).flat();
    const atAnkle = (pt: readonly number[], p: Pose) => near(pt, inPlane(p.front_ankle, plane)) < 0.04;
    let followed = 0;
    let still = 0;
    before.forEach((pt, i) => {
      if (atAnkle(pt, pose)) followed += atAnkle(inPlane(out[i]!, plane), moved) ? 1 : 0;
      if (near(pt, inPlane(pose.head, plane)) < 0.05) still += near(inPlane(out[i]!, plane), pt) < 1e-6 ? 1 : 0;
    });
    expect(followed).toBeGreaterThan(5);
    expect(still).toBeGreaterThan(5);
  });
  it("keeps to the joints in depth too, so it follows them from a turned view", () => {
    // The front ankle moved toward the off side: the lines round it go with it, out of the drawing's plane.
    const moved = dragHandle(pose, "front_ankle", [pose.front_ankle[0], pose.front_ankle[1], pose.front_ankle[2] + 0.15]);
    const out = bend(bound, bodyBones(points3(moved)), plane).flat();
    let n = 0;
    before.forEach((pt, i) => {
      if (near(pt, inPlane(pose.front_ankle, plane)) < 0.03) {
        n++;
        expect(near(out[i]!, moved.front_ankle)).toBeLessThan(0.06);
      }
    });
    expect(n).toBeGreaterThan(5);
  });
  it("puts the bat where the model's bat is, traced or drawn", () => {
    const held = placeBat(ground(pose), [0.3, -1, 0]);
    const toe = held.bat_toe!;
    const traced = bend(bind([m.bat!.outline], batBones(restPoints(m, plane))), batBones(points3(held)), plane).flat();
    expect(Math.min(...traced.map((p) => near(inPlane(p, plane), inPlane(toe, plane))))).toBeLessThan(0.05);
    const drawn = bend(plainBat(BAT.handsToToe, BAT.aboveHands, BAT.blade, BAT.width), batBones(points3(held)), plane).flat();
    expect(Math.min(...drawn.map((p) => near(p, toe)))).toBeLessThan(0.03);
    // Its width is a bat's, about 11 cm on a 175 cm batter.
    const xs = drawn.map((p) => near(p, held.bat_handle!));
    expect(Math.max(...xs)).toBeGreaterThan(BAT.handsToToe * 0.95);
  });
});

describe("a tracing from another take", () => {
  // The side-on and bowler's-end clips are two balls: a tracing is shown as traced, standing where
  // the starting pose stands, and moves only as far as a joint is moved from that start.
  const front = read("/art/model-bfd-front.json").moments.contact!;
  const traced = ground(tracedPose(front));
  const start = starterPose("back_foot_defence", "contact");
  const keys: ModelPoint[] = ["head", "front_wrist", "back_knee", "front_foot"];
  it("is the tracing, in its own plane, until a joint moves", () => {
    const at = followFrom(traced, start, start, "front");
    const hips = (q: Pose) => (q.front_hip[2] + q.back_hip[2]) / 2;
    for (const k of keys) {
      expect(at(k)![1]).toBeCloseTo(traced[k as keyof Pose]![1], 9);
      expect(at(k)![2]).toBeCloseTo(traced[k as keyof Pose]![2] + hips(start) - hips(traced), 9);
      // The axis the camera looked along is the pose's own.
      expect(at(k)![0]).toBeCloseTo(start[k as keyof Pose]![0], 9);
    }
  });
  it("follows a moved joint by as much as it moved", () => {
    const moved = dragHandle(start, "front_wrist", [start.front_wrist[0], start.front_wrist[1] + 0.05, start.front_wrist[2] - 0.04]);
    const before = followFrom(traced, start, start, "front")("front_wrist")!;
    const after = followFrom(traced, start, moved, "front")("front_wrist")!;
    expect(after[1] - before[1]).toBeCloseTo(moved.front_wrist[1] - start.front_wrist[1], 9);
    expect(after[2] - before[2]).toBeCloseTo(moved.front_wrist[2] - start.front_wrist[2], 9);
  });
  it("is the pose itself when the tracing is the start (the side-on tracing of the same take)", () => {
    const p = starterPose("front_foot_defence", "contact");
    const at = followFrom(p, p, p, "side");
    for (const k of keys) expect(at(k)).toEqual(p[k as keyof Pose]);
  });
});
