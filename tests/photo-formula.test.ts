// The front-foot defence position formula on single photos, and the batter-size check.
// Synthetic photos of every shot family at contact: a defence position passes, back-foot
// and cross-bat shots don't. A drive at contact can pass: one photo can't see the swing,
// which is why a photo never confirms the shot itself.
import { describe, expect, it } from "vitest";
import { analyze, POSITION_FORMULA } from "@/engine/analyze";
import { batterPixels } from "@/engine/quality";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { bfdScript, cutScript, ffdScript, pullScript } from "@/engine/fixtures/index";
import type { CaptureObservation } from "@/engine/types";

const opts = { analysisId: "pf", createdAt: "2026-10-02T00:00:00.000Z" };
const base = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!.options;
const photo = (script: ReturnType<typeof ffdScript>, extra: Record<string, unknown> = {}) =>
  generate({ ...base, script, photoAtContact: true, withBall: false, withBat: false, id: "pf", ...extra } as never);

describe("front-foot defence position formula (photos)", () => {
  it("a textbook defence position meets every check", () => {
    const p = analyze(photo(ffdScript()), opts);
    expect(p.metrics.map((m) => m.id)).toEqual(POSITION_FORMULA);
    expect(p.position_check).toMatchObject({ verdict: "matches", met: 7, checked: 7 });
    expect(p.headline).toMatch(/all 7 checks met/);
    // Graded, but never a shot verdict or a score.
    expect(p.analysis_status).toBe("uncertain_shot");
    expect(p.observed_shot).toBeNull();
    expect(p.technique_index).toBeNull();
  });

  it.each([
    ["pull", pullScript()],
    ["cut", cutScript()],
    ["back-foot defence", bfdScript()],
  ] as const)("a %s at contact doesn't pass", (_, script) => {
    const p = analyze(photo(script), opts);
    expect(["doesnt_match", "not_on_front_foot", "partly"]).toContain(p.position_check?.verdict);
    expect(p.position_check!.met).toBeLessThanOrEqual(4);
  });

  it("a weak point is named and coached", () => {
    const p = analyze(photo(ffdScript({ headFwd: -0.14 })), opts);
    expect(p.metrics.find((m) => m.id === "head_knee_offset")?.inRange).toBe(false);
    expect(p.priorities.map((x) => x.metricId)).toContain("head_knee_offset");
    expect(p.plan?.drills.length).toBeGreaterThan(0);
  });

  it("from along the pitch, posture is shown but not graded", () => {
    const p = analyze(photo(ffdScript(), { view: "front_on" }), opts);
    expect(p.position_check?.verdict).toBe("not_side_on");
    expect(p.metrics.every((m) => m.inRange === null)).toBe(true);
    expect(p.priorities).toHaveLength(0);
  });

  it("every graded check says where its range comes from", () => {
    const p = analyze(photo(ffdScript()), opts);
    for (const m of p.metrics) expect(m.range?.source, m.id).not.toMatch(/coach-authored, not yet validated/);
  });
});

describe("batter size, not frame size", () => {
  const sized = (o: CaptureObservation, w: number, h: number): CaptureObservation => ({ ...o, media: { ...o.media, width: w, height: h } });
  const o = photo(ffdScript());
  it("is measured from posture-independent segment lengths", () => {
    const px = batterPixels(sized(o, 1280, 720))!;
    expect(px).toBeGreaterThan(200);
    // Half the pixels, half the batter.
    expect(batterPixels(sized(o, 640, 360))! / px).toBeCloseTo(0.5, 2);
  });
  it("a small photo filled by the batter passes; a tiny batter fails", () => {
    const check = (w: number, h: number) => analyze(sized(o, w, h), opts).capture.checks.find((c) => c.id === "chk_resolution")!.status;
    const scale = 180 / batterPixels(sized(o, 1000, 1000))!; // batter about 180 px tall
    expect(check(1000 * scale, 1000 * scale)).toBe("warn");
    expect(check(1000 * scale * 0.4, 1000 * scale * 0.4)).toBe("fail");
    expect(check(1920, 1080)).toBe("pass");
  });
});

describe("photos not taken square side-on", () => {
  it("a photo at an angle is shown, not graded, and says why", () => {
    const p = analyze({ ...photo(ffdScript()), camera: { view: "oblique", bowlerSide: "right" } } as CaptureObservation, opts);
    expect(p.position_check?.verdict).toBe("not_side_on");
    expect(p.headline).toMatch(/at an angle/);
    expect(p.metrics.every((m) => m.inRange === null)).toBe(true);
    expect(p.priorities).toHaveLength(0);
  });
});
