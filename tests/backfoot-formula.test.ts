// The back-foot defence by its definition (backfoot-formula.ts), checked on the body from any
// camera position, and the capture pieces it relies on: the camera's own movement read from the
// background, the picture inside black bars, and the batting hand read from the feet.
// Real movement (the athlete's clips, the KU CricShot 3D poses from every camera position) is
// checked by scripts/eval/formula.probe.ts and ku3d.probe.ts on media kept outside the repo.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { buildScene } from "@/engine/scene";
import { backFootFormula } from "@/engine/backfoot-formula";
import { generate } from "@/engine/fixtures/generate";
import { bfdScript, ffdScript } from "@/engine/fixtures/index";
import { J, JOINTS, type CaptureObservation, type ImgPoint } from "@/engine/types";
import { cameraShifts, profileShift } from "@/lib/capture/camera-motion";
import { findPictureArea } from "@/lib/capture/bars";
import { feetHandedness, gripHandedness } from "@/lib/capture/grip";

const opts = { analysisId: "f", createdAt: "2026-11-08T00:00:00.000Z" };
const clip = (script: ReturnType<typeof bfdScript>, extra: Record<string, unknown> = {}): CaptureObservation =>
  generate({ id: "f", label: "f", seed: 5, statureM: 1.75, durationS: 2, fps: 60, handedness: "right", script, view: "side_on", noise: 0.003, withBat: false, withBall: false, ...extra } as never);
const textbook = () => bfdScript({ backStep: 0.2, frontBack: 0.27 });

describe("the back-foot defence's definition", () => {
  it("a textbook back-foot defence meets all four parts, from the body alone", () => {
    const f = backFootFormula(buildScene(clip(textbook())), null)!;
    expect(f.checks.map((c) => [c.id, c.pass])).toEqual([
      ["no_stride", true],
      ["went_back", true],
      ["stayed_tall", true],
      ["dead_bat", true],
    ]);
    expect(f.match).toBe(true);
  });

  it("a front-foot defence doesn't: it strides and goes down", () => {
    const f = backFootFormula(buildScene(clip(ffdScript())), null)!;
    expect(f.match).toBe(false);
    expect(f.checks.find((c) => c.id === "no_stride")?.pass).toBe(false);
  });

  it("a front-foot defence held, then a recovery that brings the feet back and the batter up, is still not one", () => {
    const o = clip(ffdScript(), { durationS: 2.5 });
    // Recovery: the stroke played backwards after it (front foot drawn back, the batter standing up).
    const n = o.body.length;
    const dt = o.t[1]! - o.t[0]!;
    const body = [...o.body, ...[...o.body].reverse()];
    const world = o.poseWorld ? [...o.poseWorld, ...[...o.poseWorld].reverse()] : undefined;
    const rec: CaptureObservation = {
      ...o,
      media: { ...o.media, frameCount: 2 * n, durationMs: 2 * n * dt },
      t: Array.from({ length: 2 * n }, (_, i) => i * dt),
      body,
      ...(world ? { poseWorld: world } : {}),
      camera: { ...o.camera, shift: body.map(() => [0, 0] as const) },
      bat: { source: "none", handle: body.map(() => null), toe: body.map(() => null) },
      ball: { source: "none", points: body.map(() => null) },
    };
    expect(backFootFormula(buildScene(rec), null)!.match).toBe(false);
  });

  it("a quick shuffle or bat tap in the stance is not taken for the stroke", () => {
    const o = clip(textbook(), { durationS: 2.4 });
    const base = backFootFormula(buildScene(o), null)!;
    // A fast little step and back early in the stance (both feet, 0.1 s out, 0.1 s back, then still).
    const n = o.body.length;
    const from = Math.round(n * 0.08);
    const body = o.body.map((fr, i) => {
      const k = i - from;
      if (k < 0 || k > 12) return fr;
      const dx = 0.02 * Math.sin((Math.PI * k) / 12);
      return fr.map((p, j) => (p && (j === J.left_ankle || j === J.right_ankle || j === J.left_heel || j === J.right_heel || j === J.left_foot || j === J.right_foot) ? ([p[0] + dx, p[1], p[2]] as const) : p));
    });
    const f = backFootFormula(buildScene({ ...o, body }), null)!;
    expect(f.match).toBe(true);
    expect(Math.abs(f.reference - base.reference)).toBeLessThanOrEqual(3);
  });

  it("left and right ankles swapped by the pose model on some frames change nothing", () => {
    const o = clip(textbook());
    const swapped = o.body.map((fr, i) => {
      if (i % 7 !== 3) return fr;
      const out = [...fr];
      [out[J.left_ankle], out[J.right_ankle]] = [fr[J.right_ankle]!, fr[J.left_ankle]!];
      return out;
    });
    expect(backFootFormula(buildScene({ ...o, body: swapped }), null)!.match).toBe(true);
  });

  it("a batting hand read wrongly doesn't turn the footwork around", () => {
    const o = clip(textbook());
    const f = backFootFormula(buildScene({ ...o, athlete: { ...o.athlete, handedness: "left" } }), null)!;
    expect(f.checks.find((c) => c.id === "no_stride")?.pass).toBe(true);
    expect(f.checks.find((c) => c.id === "went_back")?.pass).toBe(true);
  });

  it("analysed as a front-foot defence, a back-foot defence is never passed: it is offered as a back-foot defence", () => {
    const { target: _t, ...o } = { ...clip(textbook()), target: undefined };
    void _t;
    const p = analyze(o as CaptureObservation, opts);
    expect(p.analysis_status).not.toBe("valid");
    // Either the front-foot path's own model names it, or the guard offers it.
    if (p.analysis_status === "invalid_for_requested_analysis") expect(p.observed_shot?.label).toBe("back_foot_defence");
    else expect(p.status_reason).toBe("looks_back_foot");
  });

  it("analysed as a back-foot defence, the report carries each part of the definition", () => {
    const p = analyze({ ...clip(textbook()), target: "back_foot_defence" }, opts);
    expect(p.analysis_status).toBe("valid");
    expect(p.back_foot_checks?.map((c) => c.id)).toEqual(["no_stride", "went_back", "stayed_tall", "dead_bat"]);
    for (const c of p.back_foot_checks ?? []) expect(c.reading.length).toBeGreaterThan(10);
  });

  it("a front-foot defence is still a valid front-foot defence (the guard only acts on the back-foot definition)", () => {
    const p = analyze(clip(ffdScript(), { withBat: true, withBall: true }), opts);
    expect(p.status_reason).not.toBe("looks_back_foot");
  });
});

describe("the camera's own movement, from the background", () => {
  const W = 160;
  const H = 90;
  // A textured background, panned by `dx` samples, with a "batter" (a moving dark band) on it.
  const frame = (dx: number, batterX: number) => {
    const g = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x - dx;
        // Separate horizontal and vertical patterns (diagonal stripes moving sideways look the same as moving up).
        g[y * W + x] = 0.5 + 0.2 * Math.sin(u * 0.37) + 0.1 * Math.sin(u * 0.13) + 0.1 * Math.sin(y * 0.3);
      }
    for (let y = 20; y < 85; y++) for (let x = batterX; x < batterX + 12; x++) if (x >= 0 && x < W) g[y * W + x] = 0.1;
    return g;
  };
  it("reads a pan, whatever the batter does", () => {
    const frames = [0, 1, 2, 3, 4, 5].map((k) => ({ gray: frame(k * 1.5, 70 - k * 4), box: { x: (70 - k * 4) / W, y: 0.2, w: 12 / W, h: 0.7 } }));
    const s = cameraShifts(frames, W, H);
    expect(s[5]![0] * W).toBeCloseTo(7.5, 0);
    expect(Math.abs(s[5]![1] * H)).toBeLessThan(0.6);
  });
  it("a still camera reads still while the batter moves", () => {
    const frames = [0, 1, 2, 3].map((k) => ({ gray: frame(0, 60 + k * 6), box: { x: (60 + k * 6) / W, y: 0.2, w: 12 / W, h: 0.7 } }));
    for (const v of cameraShifts(frames, W, H)) expect(Math.abs(v![0] * W)).toBeLessThan(0.3);
  });
  it("a flat background says nothing rather than guess", () => {
    expect(profileShift(new Float32Array(50).fill(0.4), new Float32Array(50).fill(0.4), 5)).toBeNull();
  });
});

describe("the picture inside black bars", () => {
  const W = 160;
  const H = 90;
  const frames = (area: { x0: number; x1: number; y0: number; y1: number }) =>
    [0.3, 0.6].map((v) => {
      const g = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1) g[y * W + x] = v + 0.1 * Math.sin(x + y);
      return g;
    });
  it("an upright video saved into a wide frame: the picture is the middle third", () => {
    const a = findPictureArea(frames({ x0: 55, x1: 105, y0: 0, y1: H - 1 }), W, H)!;
    expect(a.x).toBeCloseTo(55 / W, 3);
    expect(a.w).toBeCloseTo(51 / W, 3);
    expect(a.y).toBe(0);
    expect(a.h).toBe(1);
  });
  it("a picture that fills the frame has no bars", () => {
    expect(findPictureArea(frames({ x0: 0, x1: W - 1, y0: 0, y1: H - 1 }), W, H)).toBeNull();
  });
  it("a thin dark edge is not a bar", () => {
    expect(findPictureArea(frames({ x0: 4, x1: W - 5, y0: 0, y1: H - 1 }), W, H)).toBeNull();
  });
});

describe("the batting hand from the feet (side-on)", () => {
  const setup = (o: CaptureObservation) => o.body.slice(0, Math.round(o.body.length * 0.2));
  it("reads a right-hander and a left-hander from where the front foot stands", () => {
    const r = clip(textbook());
    const l = clip(textbook(), { handedness: "left" });
    const a = r.media.width / r.media.height;
    expect(feetHandedness(setup(r), a, r.camera.bowlerSide)?.handedness).toBe("right");
    expect(feetHandedness(setup(l), a, l.camera.bowlerSide)?.handedness).toBe("left");
  });
  it("a stance with the bat raised behind (bottom hand above the top hand) doesn't fool it", () => {
    const r = clip(textbook());
    const a = r.media.width / r.media.height;
    // Raise the bottom (right) hand above the top hand, as a raised-bat stance does.
    const raised = setup(r).map((fr) => {
      const out: ImgPoint[] = [...fr];
      const lw = fr[J.left_wrist]!;
      out[J.right_wrist] = [lw[0], lw[1] - 0.04, lw[2]];
      return out;
    });
    expect(gripHandedness(raised, a, 3)?.handedness).toBe("left"); // the grip alone is fooled
    expect(feetHandedness(raised, a, r.camera.bowlerSide)?.handedness).toBe("right");
    expect(JOINTS.length).toBeGreaterThan(12);
  });
});
