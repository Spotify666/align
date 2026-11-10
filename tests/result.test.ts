// The AnalysisResult contract, the category specs and the timebase step.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { ACTION_OUTCOMES, CATEGORIES, CATEGORY_SCHEMA, categoryOf } from "@/engine/category";
import { downsample, timeOffset, variableFrameRate } from "@/engine/eval/transforms";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { backFootPopulation, population } from "@/engine/fixtures/population";
import { THRESHOLDS } from "@/engine/registry";
import { buildResult, RESULT_SCHEMA } from "@/engine/result";
import { assessTimebase, normalizeTimebase } from "@/engine/timebase";
import type { CaptureObservation } from "@/engine/types";

const AT = { analysisId: "a1", createdAt: "2026-01-01T00:00:00.000Z" };
const all: Array<[string, CaptureObservation]> = [
  ...FIXTURE_SPECS.map((f) => [f.key, fixture(f.key)] as [string, CaptureObservation]),
  ...FIXTURE_SPECS.map((f) => [`${f.key}@bfd`, { ...fixture(f.key), target: "back_foot_defence" as const }] as [string, CaptureObservation]),
  ...population(24, 3).map((c) => [c.id, c.obs] as [string, CaptureObservation]),
  ...backFootPopulation(24, 3).map((c) => [`bf_${c.id}`, c.obs] as [string, CaptureObservation]),
];
const results = all.map(([id, obs]) => {
  const payload = analyze(obs, AT);
  return { id, obs, payload, result: buildResult(payload, obs) };
});
const of = (key: string) => results.find((r) => r.id === key)!;

describe("category specs", () => {
  it.each(Object.values(CATEGORIES))("$id is complete and versioned", (spec) => {
    expect(spec.schema).toBe(CATEGORY_SCHEMA);
    expect(spec.version).toMatch(/^[a-z]+-spec-\d+\.\d+\.\d+$/);
    expect(spec.phases.some((p) => p.event === "contact" && p.required)).toBe(true);
    for (const id of spec.acceptance.thresholds) expect(THRESHOLDS[id], id).toBeDefined();
    const phases = new Set(spec.phases.map((p) => p.event));
    for (const [a, b] of spec.order) expect(phases.has(a) && phases.has(b), `${a} → ${b}`).toBe(true);
    for (const rule of Object.values(spec.abstention)) {
      expect(ACTION_OUTCOMES).toContain(rule.outcome);
      // An abstention is never an acceptance, and a capture failure is decided by the capture gate.
      expect(["accepted", "capture_failed"]).not.toContain(rule.outcome);
    }
    expect(spec.metrics.length).toBeGreaterThan(5);
    expect(spec.limitations.length).toBeGreaterThan(0);
  });

  it("every reason the engine gives for not confirming a shot is declared in its category", () => {
    const undeclared = results
      .filter((r) => r.payload.analysis_status === "uncertain_shot")
      .filter((r) => !categoryOf(r.payload.requested_shot).abstention[r.payload.status_reason])
      .map((r) => `${r.id}: ${r.payload.status_reason}`);
    expect(undeclared).toEqual([]);
  });
});

describe("analysis result contract", () => {
  it("does not change the stored payload and is reproducible", () => {
    for (const r of results.slice(0, 12)) {
      const before = JSON.stringify(r.payload);
      const again = buildResult(r.payload, r.obs);
      expect(JSON.stringify(r.payload)).toBe(before);
      expect(again.reproducibility.result_hash).toBe(r.result.reproducibility.result_hash);
      expect(r.result.schema).toBe(RESULT_SCHEMA);
      expect(r.result.reproducibility.payload_hash).toBe(r.payload.result_hash);
      expect(r.result.versions.category).toBe(categoryOf(r.payload.requested_shot).version);
    }
  });

  it("maps every status to one open-set outcome", () => {
    expect(of("valid_ffd").result.action.outcome).toBe("accepted");
    expect(of("pull").result.action.outcome).toBe("recognised_unsupported");
    expect(of("pull").result.action.label).toBe("pull");
    expect(of("capture_failed").result.action.outcome).toBe("capture_failed");
    expect(of("photo").result.action.outcome).toBe("insufficient_evidence");
    for (const r of results) {
      expect(ACTION_OUTCOMES).toContain(r.result.action.outcome);
      expect(r.result.action.accepted).toBe(r.payload.analysis_status === "valid");
      // The stated intent is recorded, never used as the answer.
      expect(r.result.intended).toBe(r.payload.requested_shot);
    }
    expect(new Set(results.map((r) => r.result.action.outcome)).size).toBeGreaterThanOrEqual(5);
  });

  it("lists alternatives for an identified video, most likely first", () => {
    const alts = of("pull").result.action.alternatives;
    expect(alts[0]!.label).toBe("pull");
    expect(alts.every((a, i) => i === 0 || a.probability <= alts[i - 1]!.probability)).toBe(true);
    expect(of("pull").result.action.calibrated).toBe(false);
  });

  it("never grades before the action is accepted (photos: the position check only)", () => {
    for (const r of results) {
      if (r.result.action.accepted || r.result.mode === "posture_screen") continue;
      expect(r.result.metrics.filter((m) => m.graded).map((m) => m.id), r.id).toEqual([]);
      expect(r.payload.technique_index, r.id).toBeNull();
      expect(r.result.withheld.some((w) => w.claim.startsWith("Technique score")), r.id).toBe(true);
    }
  });

  it("keeps confidence per layer, with no single overall figure", () => {
    const c = of("valid_ffd").result.confidence;
    expect(Object.keys(c).sort()).toEqual(["action", "capture", "events", "metrics", "subject"]);
    expect(c.events!.lowest).toBeLessThanOrEqual(c.events!.mean);
    expect(of("capture_failed").result.confidence.action).toBeNull();
  });

  it("gives every phase of the category a state, and every found one a confidence and an uncertainty", () => {
    for (const r of results) {
      const spec = categoryOf(r.payload.requested_shot);
      expect(r.result.events.map((e) => e.type)).toEqual(spec.phases.map((p) => p.event));
      for (const e of r.result.events) {
        if (e.state === "missing") {
          expect(e.frame).toBeNull();
          expect(e.limitation, `${r.id} ${e.type}`).toBeTruthy();
          continue;
        }
        expect(e.confidence).toBeGreaterThan(0);
        expect(e.uncertainty!.frames).toBeGreaterThanOrEqual(0.5);
        expect(e.sources.length).toBeGreaterThan(0);
        expect(e.method).toBeTruthy();
        if (r.obs.media.fps) expect(e.uncertainty!.ms).toBeGreaterThan(0);
      }
    }
  });

  it("marks an event estimated without the bat as inferred, and one placed by hand as corrected", () => {
    const top = of("no_bat").result.events.find((e) => e.type === "backswing_top")!;
    expect(top.state).toBe("inferred");
    expect(top.sources).toEqual(["body"]);
    expect(top.limitation).toMatch(/bat/);
    const seen = of("valid_ffd").result.events.find((e) => e.type === "contact")!;
    expect(seen.state).toBe("detected");
    expect(seen.sources).toEqual(["bat", "ball"]);
    const base = fixture("valid_ffd");
    const marked = { ...base, marks: { ...base.marks, contactFrame: seen.frame! } };
    expect(buildResult(analyze(marked, AT), marked).events.find((e) => e.type === "contact")!.state).toBe("corrected");
  });

  it("an inferred event is less certain than the same event detected", () => {
    const seen = of("valid_ffd").result.events.find((e) => e.type === "backswing_top")!;
    const guessed = of("no_bat").result.events.find((e) => e.type === "backswing_top")!;
    expect(guessed.uncertainty!.frames).toBeGreaterThan(seen.uncertainty!.frames);
  });

  it("never lets two phases share a frame without saying why, or pass an impossible order silently", () => {
    for (const r of results) {
      for (const issue of r.result.phaseOrder.issues) expect(issue.text.length, `${r.id} ${issue.a}/${issue.b}`).toBeGreaterThan(20);
      expect(r.result.phaseOrder.valid).toBe(r.result.phaseOrder.issues.every((i) => i.kind !== "out_of_order"));
    }
    const same = of("valid_ffd").result.phaseOrder.issues.find((i) => i.a === "contact" && i.b === "follow_through");
    expect(same?.kind).toBe("coincident");
    expect(same?.explained).toBe(true);
  });

  it("ties each measure to the events and frames it was read from", () => {
    const r = of("valid_ffd").result;
    const head = r.metrics.find((m) => m.id === "line_head")!;
    const contact = r.events.find((e) => e.type === "contact")!;
    expect(head.eventRefs).toEqual(["evt_contact"]);
    expect(head.frames).toEqual([contact.frame]);
    expect(head.eventConfidence).toBe(contact.confidence);
    for (const m of r.metrics) for (const ref of m.eventRefs) expect(of("valid_ffd").payload.events.some((e) => e.id === ref), ref).toBe(true);
    for (const m of r.metrics.filter((x) => x.availability === "withheld")) {
      expect(m.value).toBeNull();
      expect(r.withheld.some((w) => w.claim === m.name)).toBe(true);
    }
  });

  it("works from a stored payload alone (no observation), with uncertainty in frames", () => {
    const r = buildResult(of("valid_ffd").payload);
    expect(r.capture.timebase).toBeNull();
    expect(r.events.find((e) => e.type === "contact")!.uncertainty!.frames).toBeGreaterThan(0);
    expect(r.events.find((e) => e.type === "contact")!.stable).toBeNull();
  });
});

describe("timebase", () => {
  const base = fixture("valid_ffd");

  it("leaves an evenly spaced recording untouched (the same object)", () => {
    expect(assessTimebase(base).kind).toBe("uniform");
    expect(normalizeTimebase(base).obs).toBe(base);
    expect(normalizeTimebase(timeOffset(base, 4000)).resampled).toBe(false);
    expect(assessTimebase(fixture("photo")).kind).toBe("photo");
  });

  it("detects a variable frame rate and dropped frames, and says so", () => {
    const vfr = variableFrameRate(base);
    const tb = assessTimebase(vfr);
    expect(tb.kind).toBe("irregular");
    expect(tb.issues.join(" ")).toMatch(/uneven|missing/);
    const r = buildResult(analyze(vfr, AT), vfr);
    expect(r.withheld.some((w) => w.claim === "Exact timing")).toBe(true);
  });

  it("detects a declared frame rate that disagrees with the timestamps", () => {
    const wrong = { ...base, media: { ...base.media, fps: 30 } };
    expect(assessTimebase(wrong).issues.join(" ")).toMatch(/doesn't match/);
  });

  it("puts an uneven recording on an even grid at its own median step, inventing nothing in a gap", () => {
    const { obs, resampled } = normalizeTimebase(variableFrameRate(base));
    expect(resampled).toBe(true);
    expect(assessTimebase(obs).kind).toBe("uniform");
    const span = (o: CaptureObservation) => o.t[o.t.length - 1]! - o.t[0]!;
    expect(Math.abs(span(obs) - span(base))).toBeLessThan(2 * (obs.t[1]! - obs.t[0]!));
    // A long gap: the grid points inside it stay unseen.
    const dropped = { ...downsample(base, 1), t: base.t.map((t, i) => (i >= 100 ? t + 200 : t)) };
    const filled = normalizeTimebase(dropped).obs;
    const hole = filled.t.findIndex((t) => t > base.t[99]! + 20 && t < base.t[99]! + 180);
    expect(hole).toBeGreaterThan(0);
    expect(filled.body[hole]!.every((p) => p === null)).toBe(true);
  });
});
