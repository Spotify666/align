import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { THRESHOLDS, METRICS } from "@/engine/registry";
import type { CaptureObservation } from "@/engine/types";

const opts = { analysisId: "a", createdAt: "2026-10-01T00:00:00.000Z" };
const pullSpec = FIXTURE_SPECS.find((s) => s.key === "pull")!;

describe("release gate: no pull may receive a front-foot-defence technique score", () => {
  const variants: Array<[string, CaptureObservation]> = [];
  for (let seed = 1; seed <= 25; seed++) variants.push([`seed ${seed}`, generate({ ...pullSpec.options, seed, id: `pull_${seed}` })]);
  for (const fps of [30, 60, 240]) variants.push([`${fps} fps`, generate({ ...pullSpec.options, fps, id: `pull_fps_${fps}` })]);
  variants.push(["left-handed", generate({ ...pullSpec.options, handedness: "left", id: "pull_lh" })]);
  variants.push(["no bat", generate({ ...pullSpec.options, withBat: false, id: "pull_nobat" })]);
  variants.push(["no ball", generate({ ...pullSpec.options, withBall: false, id: "pull_noball" })]);
  variants.push(["noisy", generate({ ...pullSpec.options, noise: 0.012, id: "pull_noisy" })]);
  variants.push(["photo", generate({ ...pullSpec.options, photoAtContact: true, id: "pull_photo" })]);

  it.each(variants)("%s", (_, obs) => {
    const p = analyze(obs, opts);
    expect(p.analysis_status).not.toBe("valid");
    expect(p.technique_index).toBeNull();
    expect(p.metrics.filter((m) => m.inRange !== null)).toHaveLength(0);
  });
});

describe("capture gate runs before classification", () => {
  it("fails a tiny, unusable recording without classifying it", () => {
    const obs = { ...fixture("valid_ffd"), media: { ...fixture("valid_ffd").media, width: 280, height: 158 } };
    const p = analyze(obs, opts);
    expect(p.analysis_status).toBe("capture_failed");
    expect(p.shot_probabilities).toBeNull();
    expect(p.recapture.length).toBeGreaterThan(0);
  });
  it("fails when the batter is missing from most frames", () => {
    const base = fixture("valid_ffd");
    const obs: CaptureObservation = { ...base, body: base.body.map((f, i) => (i % 3 === 0 ? f : f.map(() => null))) };
    expect(analyze(obs, opts).analysis_status).toBe("capture_failed");
  });
});

describe("reproducibility", () => {
  it("same input and version reproduce the same numerical report", () => {
    const a = analyze(fixture("valid_ffd"), { analysisId: "one", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = analyze(fixture("valid_ffd"), { analysisId: "two", createdAt: "2026-06-01T00:00:00.000Z" });
    expect(a.result_hash).toBe(b.result_hash);
    expect(a.input_hash).toBe(b.input_hash);
    expect(a.metrics).toEqual(b.metrics);
  });
  it("different input gives a different hash", () => {
    expect(analyze(fixture("valid_ffd"), opts).input_hash).not.toBe(analyze(fixture("low_fps"), opts).input_hash);
  });
});

describe("registry", () => {
  it("documents every threshold", () => {
    for (const [id, t] of Object.entries(THRESHOLDS)) expect(t.rationale.length, id).toBeGreaterThan(10);
  });
  it("never uses the word biomarker or diagnosis in user-facing metric copy", () => {
    for (const m of METRICS) expect(`${m.name} ${m.meaning} ${m.relevance}`).not.toMatch(/biomarker|diagnos|injur/i);
  });
});

describe("classification stability across 40 noise seeds", () => {
  const rate = (key: string, expected: string) => {
    const spec = FIXTURE_SPECS.find((s) => s.key === key)!;
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) if (analyze(generate({ ...spec.options, seed }), opts).analysis_status === expected) hits++;
    return hits / 40;
  };
  it("rejects pulls and drives, accepts defences, at least 95% of the time", () => {
    expect(rate("pull", "invalid_for_requested_analysis")).toBeGreaterThanOrEqual(0.95);
    expect(rate("drive", "invalid_for_requested_analysis")).toBeGreaterThanOrEqual(0.95);
    expect(rate("valid_ffd", "valid")).toBeGreaterThanOrEqual(0.95);
  });
});
