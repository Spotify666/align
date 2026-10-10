// The back-foot defence (docs/11-back-foot-defence.md): the release gate on a population,
// its measures and coaching on a textbook shot and on faults, and photos against its
// position formula. The front-foot defence's own tests are untouched.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { bfdScript, ffdScript, pullScript } from "@/engine/fixtures/index";
import { backFootPopulation } from "@/engine/fixtures/population";
import { BFD_METRICS } from "@/engine/backfoot-defs";
import type { CaptureObservation } from "@/engine/types";

const opts = { analysisId: "bfd", createdAt: "2026-10-10T00:00:00.000Z" };
/** The textbook back-foot defence with the hands where the bat meets the ball. */
const textbook = () => bfdScript({ backStep: 0.2, frontBack: 0.27 });
const clip = (script: ReturnType<typeof bfdScript>, extra: Record<string, unknown> = {}): CaptureObservation => ({
  ...generate({ id: "bfd", label: "bfd", seed: 3, statureM: 1.75, durationS: 2, fps: 120, handedness: "right", script, view: "side_on", noise: 0.003, ...extra } as never),
  target: "back_foot_defence",
});

describe("back-foot defence release gate (population)", () => {
  it("accepts back-foot defences, never another shot, and never calls a back-foot defence a different shot", { timeout: 300000 }, () => {
    const tally = new Map<string, { n: number; valid: number; invalid: number }>();
    for (const c of backFootPopulation(420, 11)) {
      const p = analyze(c.obs, opts);
      expect(p.requested_shot).toBe("back_foot_defence");
      const key = c.family === "bfd" ? `bfd_${c.view === "side_on" ? "side" : "end"}_${c.evidence}` : c.family;
      const t = tally.get(key) ?? { n: 0, valid: 0, invalid: 0 };
      t.n++;
      if (p.analysis_status === "valid") t.valid++;
      if (p.analysis_status === "invalid_for_requested_analysis") t.invalid++;
      tally.set(key, t);
    }
    const rate = (k: string) => tally.get(k)!.valid / tally.get(k)!.n;
    // With bat and ball, from any camera position, every generated back-foot defence is accepted.
    expect(rate("bfd_side_full")).toBeGreaterThanOrEqual(0.95);
    expect(rate("bfd_end_full")).toBeGreaterThanOrEqual(0.9);
    // From the body alone the hands place contact: a low backlift (hands rising into the ball)
    // can hide it, so some are honestly uncertain. Measured 57–81% side-on, 59–69% along the
    // pitch across seeds.
    expect(rate("bfd_side_body")).toBeGreaterThanOrEqual(0.5);
    expect(rate("bfd_end_body")).toBeGreaterThanOrEqual(0.5);
    for (const k of ["bfd_side_full", "bfd_end_full", "bfd_side_body", "bfd_end_body"]) expect(tally.get(k)!.invalid, k).toBe(0);
    // False acceptance is release-blocking.
    for (const f of ["ffd", "drive", "half_drive", "pull", "cut"]) expect(tally.get(f)!.valid, f).toBe(0);
  });
});

describe("back-foot defence measures", () => {
  it("a textbook back-foot defence meets every check and is coached toward match pace", () => {
    const p = analyze(clip(textbook()), opts);
    expect(p.analysis_status).toBe("valid");
    expect(p.observed_shot?.label).toBe("back_foot_defence");
    expect(p.headline).toBe("Valid back-foot defence. Every check is in range.");
    expect(p.metrics.map((m) => m.id)).toEqual(BFD_METRICS.filter((d) => d.only !== "photo").map((d) => d.id));
    for (const m of p.metrics) {
      expect(m.status, m.id).toBe("measured");
      expect(m.inRange, `${m.id} ${m.value}`).toBe(true);
      expect(m.range?.source).toMatch(/Provisional/);
    }
    expect(p.back_foot?.axis).toBe("forward");
    expect(p.back_foot?.backStep).toBeGreaterThan(0.05);
    // Every check met: the plan is the next level (the same shape at match pace).
    expect(p.plan?.drills.every((d) => (d.level ?? 3) >= 3)).toBe(true);
    expect(p.technique_index).not.toBeNull();
  });

  it.each([
    ["the front foot left out in front", { backStep: 0.2, frontBack: 0.02 }, "bfd_feet_gap"],
    ["the head falling back", { backStep: 0.2, frontBack: 0.27, headFwd: -0.4 }, "bfd_head"],
    ["pushing through the ball", { backStep: 0.2, frontBack: 0.27, follow: 0.25 }, "bfd_dead_bat"],
  ] as const)("names %s and coaches it with a four-step ladder", (_, v, id) => {
    const p = analyze(clip(bfdScript(v)), opts);
    expect(p.analysis_status).toBe("valid");
    expect(p.metrics.find((m) => m.id === id)?.inRange).toBe(false);
    expect(p.priorities.map((x) => x.metricId)).toContain(id);
    const plan = p.priorities[0]!.metricId === id ? p.plan : null;
    if (plan) {
      expect(plan.ladder?.map((d) => d.level)).toEqual([1, 2, 3, 4]);
      for (const d of plan.ladder ?? []) expect(d.passCondition.length).toBeGreaterThan(20);
    }
  });

  it("from along the pitch, going back can't be seen: not measured, the sideways line graded", () => {
    const p = analyze(clip(textbook(), { view: "front_on" }), opts);
    expect(p.analysis_status).toBe("valid");
    const step = p.metrics.find((m) => m.id === "bfd_back_step")!;
    expect(step.status).toBe("not_measured");
    expect(step.reason).toMatch(/toward the camera/);
    expect(p.metrics.find((m) => m.id === "bfd_head")?.axis).toBe("sideways");
    // The textbook shot meets every check that can be read from this end.
    for (const m of p.metrics.filter((x) => x.inRange !== null)) expect(m.inRange, `${m.id} ${m.value}`).toBe(true);
  });

  it("a front-foot defence analysed as a back-foot defence is named for what it is", () => {
    const p = analyze(clip(ffdScript()), opts);
    expect(p.analysis_status).toBe("invalid_for_requested_analysis");
    expect(p.observed_shot?.label).toBe("front_foot_defence");
    expect(p.headline).toMatch(/front-foot defence, not a back-foot defence\. Analyse it as a front-foot defence instead\./);
    expect(p.metrics).toEqual([]);
  });

  it("a pull analysed as a back-foot defence is never accepted", () => {
    expect(analyze(clip(pullScript()), opts).analysis_status).not.toBe("valid");
  });

  it("the front-foot defence is still the default analysis", () => {
    const { target: _t, ...ffd } = clip(textbook());
    void _t;
    const p = analyze(ffd as CaptureObservation, opts);
    expect(p.requested_shot).toBe("front_foot_defence");
    expect(p.analysis_status).not.toBe("valid");
  });
});

describe("back-foot defence position formula (photos)", () => {
  const base = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!.options;
  const photo = (script: ReturnType<typeof bfdScript>, extra: Record<string, unknown> = {}): CaptureObservation => ({
    ...generate({ ...base, script, photoAtContact: true, withBall: false, withBat: false, id: "bp", ...extra } as never),
    target: "back_foot_defence",
  });

  it("a textbook back-foot defence position meets every check", () => {
    const p = analyze(photo(textbook()), opts);
    expect(p.metrics.map((m) => m.id)).toEqual(["bfd_feet_gap", "bfd_head", "bfd_head_height", "bfd_elbow", "bfd_hands_eyes"]);
    expect(p.position_check).toMatchObject({ verdict: "matches", met: 5, checked: 5 });
    expect(p.headline).toMatch(/Back-foot defence position: all 5 checks met/);
    expect(p.analysis_status).toBe("uncertain_shot");
    expect(p.observed_shot).toBeNull();
  });

  it("a front-foot defence photo isn't a back-foot position", () => {
    const p = analyze(photo(ffdScript()), opts);
    expect(["not_on_back_foot", "doesnt_match", "partly"]).toContain(p.position_check?.verdict);
  });

  it("from along the pitch, the head, height, elbow and hands are checked", () => {
    const p = analyze(photo(textbook(), { view: "front_on" }), opts);
    expect(p.metrics.map((m) => m.id)).toEqual(["bfd_head", "bfd_head_height", "bfd_elbow", "bfd_hands_eyes"]);
    expect(["matches", "mostly"]).toContain(p.position_check?.verdict);
  });
});

describe("back-foot defence written report", () => {
  it("passes the report contract for valid, other-shot and photo results", async () => {
    const { templateReport, validateReport } = await import("@/engine/report");
    const cases = [
      analyze(clip(textbook()), opts),
      analyze(clip(bfdScript({ backStep: 0.2, frontBack: 0.02 })), opts),
      analyze(clip(ffdScript()), opts),
    ];
    for (const p of cases) {
      const r = templateReport(p);
      expect(validateReport(r, p), p.headline).toEqual([]);
      const text = r.sections.flatMap((s) => s.sentences.map((x) => x.text)).join(" ");
      expect(text).not.toMatch(/front-foot-defence analysis/i);
    }
  });
});
