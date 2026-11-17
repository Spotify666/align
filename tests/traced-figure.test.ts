import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODEL_JOINTS, MOMENTS, dragHandle, ground, placeBat, poseInPlane, type ModelPoint, type Plane, type Pose } from "@/engine/pose-model";
import { starterBat, starterPose } from "@/lib/pose-models";
import { startersFrom } from "@/lib/pose-starters";
import stored from "@/lib/pose-starters.json";
import {
  FIGURE_FILES, TRACED_FIGURE_SCHEMA, batBones, bend, bind, bodyBones, figureFile, restPoints, tracedPose, type TracedFigure, type TracedMoment,
} from "@/lib/traced-figure";

// The shot-model figure traced from the owner's own clips (src/lib/traced-figure.ts): what the
// files hold, that new models start from that real batter, and that the drawing follows the joints.

const read = (path: string): TracedFigure => JSON.parse(readFileSync(`public${path}`, "utf8"));
const figures = Object.entries(FIGURE_FILES).flatMap(([shot, planes]) => Object.entries(planes).map(([plane, path]) => ({ shot, plane: plane as Plane, path: path!, fig: read(path!) })));
const flat = (shapes: number[][]) => shapes.flatMap((s) => Array.from({ length: s.length / 2 }, (_, i) => [s[2 * i]! / 1000, s[2 * i + 1]! / 1000] as const));

describe("the traced figures", () => {
  it("are what the files say: a right-hander, every joint at every moment held, a drawing of plausible size", () => {
    expect(figures.length).toBe(2);
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
    expect(figureFile("front_foot_defence", "side", "left")).toBeNull();
    expect(figureFile("front_foot_defence", "side", "right")).toBe("/art/model-ffd-side.json");
    expect(figureFile("front_foot_defence", "front", "right")).toBeNull();
  });
});

describe("a new model starts from the traced batter", () => {
  it("its stored poses are the traced ones (else run: node scripts/pose-starters.mjs > src/lib/pose-starters.json)", () => {
    const side = { front_foot_defence: read("/art/model-ffd-side.json"), back_foot_defence: read("/art/model-bfd-side.json") };
    expect(JSON.parse(JSON.stringify(startersFrom(side)))).toEqual(stored);
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
  const { fig, plane } = figures.find((f) => f.shot === "front_foot_defence")!;
  const m = fig.moments.contact!;
  const rest = bodyBones(restPoints(m, plane));
  const bound = bind(m.body, rest);
  const near = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  it("is the traced drawing, unchanged, at the traced pose", () => {
    const out = bend(bound, rest);
    const before = flat(m.body);
    const after = out.flat();
    expect(after.length).toBe(before.length);
    after.forEach((p, i) => expect(near(p, before[i]!)).toBeLessThan(1e-4));
  });
  it("moves with a limb that is moved, and leaves the far side of the body where it was", () => {
    const pose = tracedPose(m);
    const moved = dragHandle(pose, "front_ankle", [pose.front_ankle[0] + 0.12, pose.front_ankle[1] + 0.08, pose.front_ankle[2]]);
    const g = poseInPlane(moved, plane);
    const out = bend(bound, bodyBones((p: ModelPoint) => g(p))).flat();
    const before = flat(m.body);
    const atAnkle = (pt: readonly [number, number], p: Pose) => near(pt, [p.front_ankle[0], p.front_ankle[1]]) < 0.04;
    const head = (pt: readonly [number, number]) => near(pt, [pose.head[0], pose.head[1]]) < 0.05;
    let followed = 0;
    let still = 0;
    before.forEach((pt, i) => {
      if (atAnkle(pt, pose)) followed += atAnkle(out[i]!, moved) ? 1 : 0;
      if (head(pt)) still += near(out[i]!, pt) < 1e-6 ? 1 : 0;
    });
    expect(followed).toBeGreaterThan(5);
    expect(still).toBeGreaterThan(5);
  });
  it("puts the bat where the model's bat is", () => {
    const pose = placeBat(ground(tracedPose(m)), [0.3, -1, 0]);
    const outline = bind([m.bat!.outline], batBones(restPoints(m, plane)));
    const g = poseInPlane(pose, plane);
    const now = bend(outline, batBones(g)).flat();
    const toe = g("bat_toe")!;
    const nearest = Math.min(...now.map((p) => near(p, toe)));
    expect(nearest).toBeLessThan(0.05);
  });
});
