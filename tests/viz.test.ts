import { describe, expect, it } from "vitest";
import { sampleAnalysis } from "@/lib/demo";
import { smoothWorld, worldFrames, type V3 } from "@/lib/viz";
import { J } from "@/engine/types";

/** RMS of the second difference: frame-to-frame jitter. */
function jitter(xs: (V3 | null)[]) {
  let s = 0;
  let n = 0;
  for (let i = 1; i < xs.length - 1; i++) {
    const a = xs[i - 1];
    const b = xs[i];
    const c = xs[i + 1];
    if (!a || !b || !c) continue;
    for (let k = 0; k < 3; k++) s += (a[k]! - 2 * b[k]! + c[k]!) ** 2;
    n++;
  }
  return Math.sqrt(s / Math.max(1, n));
}

describe("3D replay smoothing (display only)", () => {
  const { obs, payload } = sampleAnalysis("valid_ffd")!;
  const raw = worldFrames(obs);
  const sm = smoothWorld(raw, obs.media.fps);

  it("removes most frame-to-frame jitter from body, bat and ball", () => {
    for (const j of [J.nose, J.left_wrist, J.left_ankle, J.right_knee]) {
      const r = jitter(raw.joints.map((f) => f[j] ?? null));
      const s = jitter(sm.joints.map((f) => f[j] ?? null));
      expect(s).toBeLessThan(r / 4);
    }
    expect(jitter(sm.bat.map((b) => b?.[1] ?? null))).toBeLessThan(jitter(raw.bat.map((b) => b?.[1] ?? null)) / 3);
    expect(jitter(sm.ball)).toBeLessThan(jitter(raw.ball) / 2);
  });

  it("keeps gaps as gaps and does not lag", () => {
    raw.ball.forEach((p, i) => expect(!!sm.ball[i]).toBe(!!p));
    const contact = payload.events.find((e) => e.type === "contact")!.frame;
    const a = raw.joints[contact]![J.left_ankle]!;
    const b = sm.joints[contact]![J.left_ankle]!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.03);
  });

  it("keeps the bounce sharp: the smoothed ball still reaches the pitch", () => {
    const bounce = payload.events.find((e) => e.type === "bounce")!.frame;
    const near = sm.ball.slice(bounce - 2, bounce + 3).filter((p): p is V3 => !!p);
    expect(Math.min(...near.map((p) => p[1]))).toBeLessThan(0.12);
  });
});
