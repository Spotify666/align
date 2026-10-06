import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { baselineSeries, fixture } from "@/engine/fixtures";
import { buildBaseline, compareToBaseline } from "@/engine/baseline";
import type { AnalysisPayload } from "@/engine/types";

const run = (key: string, id = key): AnalysisPayload => analyze(fixture(key), { analysisId: id, createdAt: "2026-10-01T00:00:00.000Z" });
const metric = (p: AnalysisPayload, id: string) => p.metrics.find((m) => m.id === id);
const TIMING = ["decision_timing", "head_speed_contact", "bat_speed_contact", "ball_exit_speed"];
const BAT = ["bat_angle_contact", "bat_speed_contact", "contact_ahead_of_knee", "bat_pad_gap"];

function idsIn(p: AnalysisPayload, frames = 240) {
  return new Set([
    ...Array.from({ length: frames }, (_, i) => `frame_${i}`),
    ...p.metrics.map((m) => `metric_${m.id}`),
    ...p.features.map((f) => f.id),
    ...p.events.map((e) => e.id),
    ...p.events.map((e) => `frame_${e.frame}`),
    ...p.capture.checks.map((c) => c.id),
    ...p.limitations.map((l) => l.id),
  ]);
}

describe("1. valid front-foot defence", () => {
  const p = run("valid_ffd");
  it("is accepted with a full report", () => {
    expect(p.analysis_status).toBe("valid");
    expect(p.observed_shot?.label).toBe("front_foot_defence");
    expect(p.metrics.length).toBeGreaterThan(8);
    expect(p.domains).toHaveLength(7);
    expect(p.technique_index).not.toBeNull();
    expect(Number.isInteger(p.technique_index!.value)).toBe(true);
  });
  it("produces one prioritised, measurable next action with at most two drills", () => {
    expect(p.priorities.length).toBeGreaterThanOrEqual(1);
    expect(p.plan).not.toBeNull();
    expect(p.plan!.drills.length).toBeGreaterThanOrEqual(1);
    expect(p.plan!.drills.length).toBeLessThanOrEqual(2);
    for (const d of p.plan!.drills) expect(d.passCondition.length).toBeGreaterThan(10);
  });
  it("traces every measured metric to evidence and a version", () => {
    for (const m of p.metrics.filter((x) => x.status !== "not_measured")) {
      expect(m.evidenceIds.length, m.id).toBeGreaterThan(0);
      expect(m.uncertainty, m.id).not.toBeNull();
    }
    expect(p.versions.metric_version).toMatch(/^ffd-/);
    expect(p.versions.registry_hash).toHaveLength(16);
  });
  it("labels provisional ranges and never claims population norms", () => {
    for (const m of p.metrics.filter((x) => x.range)) expect(m.range!.kind).toBe("provisional_coaching");
  });
  it("cites only evidence that exists", () => {
    const ids = idsIn(p);
    for (const f of [...p.strengths, ...p.priorities]) for (const id of f.evidenceIds) expect(ids.has(id), id).toBe(true);
    for (const id of p.observed_shot!.evidence_ids) expect(ids.has(id), id).toBe(true);
  });
  it("is flagged as demo data", () => {
    expect(p.demo).toBe(true);
    expect(p.limitations.some((l) => l.id === "lim_demo")).toBe(true);
  });
});

describe("2. pull shot submitted as front-foot defence", () => {
  const p = run("pull");
  it("is rejected with the required wording and no technique score", () => {
    expect(p.analysis_status).toBe("invalid_for_requested_analysis");
    expect(p.headline).toBe("This appears to be a pull shot, not a front-foot defence.");
    expect(p.observed_shot?.label).toBe("pull");
    expect(p.technique_index).toBeNull();
    expect(p.metrics).toHaveLength(0);
    expect(p.strengths).toHaveLength(0);
    expect(p.plan).toBeNull();
  });
  it("shows the evidence behind the decision", () => {
    const ev = p.observed_shot!.evidence_ids;
    expect(ev.length).toBeGreaterThanOrEqual(3);
    // Evidence from each modality seen: ball, bat and body.
    expect(ev.some((id) => ["feat_contact_height", "feat_length_short", "feat_ball_exit"].includes(id))).toBe(true);
    expect(ev.some((id) => ["feat_bat_angle", "feat_bat_speed", "feat_follow_height", "feat_follow_through"].includes(id))).toBe(true);
    expect(ev.some((id) => ["feat_hands_rise", "feat_hands_finish", "feat_head_height", "feat_back_foot", "feat_rotation"].includes(id))).toBe(true);
  });
});

describe("3. front-foot drive", () => {
  const p = run("drive");
  it("is rejected as a different shot even though the body shape resembles a defence", () => {
    expect(p.analysis_status).toBe("invalid_for_requested_analysis");
    expect(p.observed_shot?.label).toBe("front_foot_drive");
    expect(p.technique_index).toBeNull();
    expect(p.features.find((f) => f.id === "feat_front_stride")!.value).toBeGreaterThan(0.3);
  });
});

describe("4. ambiguous occluded shot", () => {
  const p = run("occluded");
  it("abstains without forcing a class and asks for a recapture", () => {
    expect(p.analysis_status).toBe("uncertain_shot");
    expect(p.observed_shot).toBeNull();
    expect(p.technique_index).toBeNull();
    expect(p.metrics).toHaveLength(0);
    expect(p.recapture.length).toBeGreaterThan(0);
    expect(p.capture.checks.find((c) => c.id === "chk_single_batter")!.status).toBe("warn");
  });
});

describe("5. photo-only upload", () => {
  const p = run("photo");
  it("is a posture screen with the limitation stated", () => {
    expect(p.mode).toBe("posture_screen");
    expect(p.analysis_status).toBe("uncertain_shot");
    expect(p.status_reason).toBe("photo_only");
    expect(p.limitations.some((l) => l.id === "lim_photo")).toBe(true);
  });
  it("makes no timing, ball, bat-speed or shot-identity claims, and gives no score", () => {
    expect(p.observed_shot).toBeNull();
    expect(p.shot_probabilities).toBeNull();
    expect(p.events).toHaveLength(0);
    expect(p.delivery.available).toBe(false);
    expect(p.technique_index).toBeNull();
    // Stride needs the stance to measure travel from: video only. The photo has foot-to-foot spread.
    for (const id of [...TIMING, ...BAT, "stride_length"]) expect(metric(p, id)).toBeUndefined();
  });
  it("checks the position against the front-foot defence formula", () => {
    // The fixture is a sound defence with the head a little behind the front foot.
    expect(p.position_check?.verdict).toBe("mostly");
    expect(p.position_check?.checked).toBe(9);
    for (const m of p.metrics) expect(m.range, m.id).not.toBeNull();
    expect(p.metrics.filter((m) => m.inRange === false).map((m) => m.id)).toEqual(["line_head"]);
    expect(p.priorities[0]?.metricId).toBe("line_head");
  });
});

describe("6. no visible ball", () => {
  const p = run("no_ball");
  it("confirms from body and bat, and makes no delivery-context or ball claim", () => {
    expect(p.analysis_status).toBe("valid");
    expect(p.evidence_basis).toBe("body");
    expect(p.limitations.some((l) => l.id === "lim_no_ball")).toBe(true);
    expect(p.limitations.some((l) => l.id === "lim_body_led")).toBe(true);
    expect(p.delivery.available).toBe(false);
    expect(p.delivery.lengthLabel).toBeNull();
    expect(p.delivery.bounceDistanceM).toBeNull();
    expect(p.events.find((e) => e.type === "bounce")).toBeUndefined();
    expect(p.features.find((f) => f.id === "feat_length_short")).toBeUndefined();
    for (const id of ["decision_timing", "ball_exit_speed"]) {
      const m = p.metrics.find((x) => x.id === id);
      expect(!m || m.status === "not_measured", id).toBe(true);
    }
  });
});

describe("7. no visible bat", () => {
  const p = run("no_bat");
  it("confirms from body and hands with no bat-path or bat-angle claim", () => {
    expect(p.analysis_status).toBe("valid");
    expect(p.evidence_basis).toBe("body");
    for (const f of ["feat_bat_angle", "feat_bat_speed", "feat_follow_through", "feat_follow_height"]) {
      expect(p.features.find((x) => x.id === f), f).toBeUndefined();
    }
    for (const id of ["bat_angle_contact", "bat_speed_contact", "bat_pad_gap"]) {
      const m = p.metrics.find((x) => x.id === id);
      expect(!m || m.status === "not_measured", id).toBe(true);
    }
    expect(p.limitations.some((l) => l.id === "lim_no_bat")).toBe(true);
  });
});

describe("8. left-handed batter", () => {
  const right = run("valid_ffd");
  const left = run("left_handed");
  it("is accepted and mirrored semantically", () => {
    expect(left.analysis_status).toBe("valid");
    expect(left.handedness).toBe("left");
  });
  it("produces the same measures as the right-handed defence", () => {
    for (const m of right.metrics) {
      const l = metric(left, m.id)!;
      expect(l.status, m.id).toBe(m.status);
      if (m.value !== null) expect(l.value!, m.id).toBeCloseTo(m.value, 1);
    }
  });
});

describe("9. low frame rate", () => {
  const p = run("low_fps");
  it("warns that timing precision is unsupported and withholds timing measures", () => {
    expect(p.capture.checks.find((c) => c.id === "chk_frame_rate")!.status).toBe("warn");
    expect(p.limitations.some((l) => l.id === "lim_fps")).toBe(true);
    for (const id of TIMING) {
      const m = metric(p, id);
      if (m) {
        expect(m.status, id).toBe("not_measured");
        expect(m.reason, id).toMatch(/frame rate|bounce/);
      }
    }
  });
  it("still reports non-timing measures when the shot is confirmed", () => {
    expect(p.analysis_status).toBe("valid");
    expect(metric(p, "stride_length")!.status).not.toBe("not_measured");
  });
});

describe("10. baseline comparison", () => {
  const series = baselineSeries(8).map((o, i) => analyze(o, { analysisId: `b${i}`, createdAt: "2026-09-01T00:00:00.000Z" }));
  const baseline = buildBaseline(series, { version: 1, createdAt: "2026-09-30T00:00:00.000Z" });
  const current = run("valid_ffd");
  const cmp = compareToBaseline(current, baseline);
  it("builds a confidence-weighted distribution from 6+ valid deliveries", () => {
    expect(series.every((p) => p.analysis_status === "valid")).toBe(true);
    expect(baseline.established).toBe(true);
    expect(baseline.n).toBe(8);
    expect(baseline.metrics.line_head!.sd).toBeGreaterThan(0);
    expect(baseline.repeatability).not.toBeNull();
  });
  it("compares against the athlete's distribution and reports uncertainty", () => {
    const head = cmp.find((c) => c.metricId === "line_head")!;
    expect(head.reading).toBe("below your usual range");
    expect(head.uncertainty).toBeGreaterThan(0);
    expect(cmp.every((c) => Number.isFinite(c.z))).toBe(true);
  });
  it("refuses to compare when fewer than six valid deliveries exist", () => {
    const small = buildBaseline(series.slice(0, 4), { version: 1, createdAt: "2026-09-30T00:00:00.000Z" });
    expect(small.established).toBe(false);
    expect(compareToBaseline(current, small)).toHaveLength(0);
  });
  it("keeps personal baseline separate from coaching ranges", () => {
    expect(metric(current, "line_head")!.range!.kind).toBe("provisional_coaching");
    expect(JSON.stringify(baseline)).not.toContain("provisional_coaching");
  });
});

describe("3D Session preview", () => {
  const p = run("session3d");
  it("unlocks depth-dependent measures only when depth exists", () => {
    expect(p.analysis_status).toBe("valid");
    expect(metric(p, "pelvis_thorax_separation")!.status).not.toBe("not_measured");
    expect(metric(run("valid_ffd"), "pelvis_thorax_separation")!.status).toBe("not_measured");
  });
});

describe("unusable capture", () => {
  const p = run("capture_failed");
  it("fails at the capture gate with corrections and no classification", () => {
    expect(p.analysis_status).toBe("capture_failed");
    expect(p.shot_probabilities).toBeNull();
    expect(p.technique_index).toBeNull();
    expect(p.capture.checks.filter((c) => c.status === "fail").length).toBeGreaterThan(0);
    expect(p.recapture.join(" ")).toMatch(/camera|tripod|1080p|frame/i);
  });
});
