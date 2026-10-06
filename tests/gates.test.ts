import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { readdirSync, readFileSync } from "node:fs";
import { THRESHOLDS, METRICS, REGISTRY_HASH } from "@/engine/registry";
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
  // Filmed along the pitch: forward axis from the 3D estimate, several signals unobservable.
  for (let seed = 1; seed <= 15; seed++) variants.push([`front-on seed ${seed}`, generate({ ...pullSpec.options, view: "front_on", seed, id: `pull_fo_${seed}` })]);
  for (let seed = 1; seed <= 5; seed++) variants.push([`behind seed ${seed}`, generate({ ...pullSpec.options, view: "behind", seed, id: `pull_bh_${seed}` })]);
  variants.push(["front-on left-handed", generate({ ...pullSpec.options, view: "front_on", handedness: "left", id: "pull_fo_lh" })]);
  variants.push(["front-on 30 fps", generate({ ...pullSpec.options, view: "front_on", fps: 30, id: "pull_fo_30" })]);
  variants.push(["front-on no ball", generate({ ...pullSpec.options, view: "front_on", withBall: false, id: "pull_fo_noball" })]);
  variants.push(["front-on noisy", generate({ ...pullSpec.options, view: "front_on", noise: 0.012, id: "pull_fo_noisy" })]);
  // The athlete picks the wrong camera position: the forward axis is then wrong.
  const relabel = (o: CaptureObservation, view: CaptureObservation["camera"]["view"]): CaptureObservation => ({ ...o, camera: { ...o.camera, view } });
  for (let seed = 1; seed <= 4; seed++) {
    variants.push([`front-on labelled behind ${seed}`, relabel(generate({ ...pullSpec.options, view: "front_on", seed, id: `pull_fo_bh_${seed}` }), "behind")]);
    variants.push([`front-on labelled side-on ${seed}`, relabel(generate({ ...pullSpec.options, view: "front_on", seed, id: `pull_fo_so_${seed}` }), "side_on")]);
    variants.push([`side-on labelled front-on ${seed}`, relabel(generate({ ...pullSpec.options, seed, id: `pull_so_fo_${seed}` }), "front_on")]);
  }

  it.each(variants)("%s", (_, obs) => {
    const p = analyze(obs, opts);
    expect(p.analysis_status).not.toBe("valid");
    expect(p.technique_index).toBeNull();
    if (obs.media.kind === "photo") {
      // A photo is checked against the position formula; a pull must not pass it.
      expect(["matches", "mostly"]).not.toContain(p.position_check?.verdict);
    } else expect(p.metrics.filter((m) => m.inRange !== null)).toHaveLength(0);
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
  it("has the current registry published by a migration (run scripts/registry-sql.mjs)", () => {
    const dir = "supabase/migrations";
    const sql = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
    expect(sql.includes(`'${REGISTRY_HASH}'`), `no migration publishes registry ${REGISTRY_HASH}`).toBe(true);
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
  it("filmed front-on: rejects pulls and drives, accepts defences, at least 95% of the time", () => {
    expect(rate("front_on_pull", "invalid_for_requested_analysis")).toBeGreaterThanOrEqual(0.95);
    expect(rate("front_on_drive", "invalid_for_requested_analysis")).toBeGreaterThanOrEqual(0.95);
    expect(rate("front_on_ffd", "valid")).toBeGreaterThanOrEqual(0.95);
  });
  it("never accepts a drive filmed front-on, whatever camera position is chosen", () => {
    const spec = FIXTURE_SPECS.find((s) => s.key === "front_on_drive")!;
    for (let seed = 1; seed <= 20; seed++) {
      for (const view of ["front_on", "behind", "side_on"] as const) {
        const o = generate({ ...spec.options, seed });
        expect(analyze({ ...o, camera: { ...o.camera, view } }, opts).analysis_status).not.toBe("valid");
      }
    }
  });
});

// The usual phone clip: neither bat nor ball is seen, so the verdict rests on body and
// hand movement. The same rule holds: no pull or drive may ever be accepted.
describe("release gate without bat or ball: no pull or drive may be accepted", () => {
  const bare = { withBat: false, withBall: false } as const;
  const variants: Array<[string, CaptureObservation]> = [];
  for (const key of ["pull", "drive", "front_on_pull", "front_on_drive", "occluded"]) {
    const spec = FIXTURE_SPECS.find((s) => s.key === key)!;
    for (let seed = 1; seed <= 12; seed++) variants.push([`${key} seed ${seed}`, generate({ ...spec.options, ...bare, seed, id: `${key}_bare_${seed}` })]);
    for (const fps of [30, 60, 240]) variants.push([`${key} ${fps} fps`, generate({ ...spec.options, ...bare, fps, id: `${key}_bare_${fps}` })]);
    variants.push([`${key} left-handed`, generate({ ...spec.options, ...bare, handedness: "left", id: `${key}_bare_lh` })]);
    variants.push([`${key} noisy`, generate({ ...spec.options, ...bare, noise: 0.012, id: `${key}_bare_noisy` })]);
    for (const view of ["front_on", "behind", "side_on"] as const) {
      const o = generate({ ...spec.options, ...bare, id: `${key}_bare_${view}` });
      variants.push([`${key} labelled ${view}`, { ...o, camera: { ...o.camera, view } }]);
    }
  }
  const behind = FIXTURE_SPECS.find((s) => s.key === "pull")!;
  for (let seed = 1; seed <= 5; seed++) variants.push([`pull behind seed ${seed}`, generate({ ...behind.options, ...bare, view: "behind", seed, id: `pull_bh_bare_${seed}` })]);

  it.each(variants)("%s", (_, obs) => {
    const p = analyze(obs, opts);
    expect(p.analysis_status).not.toBe("valid");
    expect(p.technique_index).toBeNull();
    expect(p.metrics.filter((m) => m.inRange !== null)).toHaveLength(0);
  });

  it("confirms defences from body and hands at least 95% of the time, and rejects pulls and drives", { timeout: 60000 }, () => {
    const rate = (key: string, expected: string, extra: Record<string, unknown> = {}) => {
      const spec = FIXTURE_SPECS.find((s) => s.key === key)!;
      let hits = 0;
      for (let seed = 1; seed <= 40; seed++) if (analyze(generate({ ...spec.options, ...bare, ...extra, seed }), opts).analysis_status === expected) hits++;
      return hits / 40;
    };
    for (const extra of [{}, { fps: 30 }]) {
      expect(rate("valid_ffd", "valid", extra)).toBeGreaterThanOrEqual(0.95);
      expect(rate("front_on_ffd", "valid", extra)).toBeGreaterThanOrEqual(0.95);
      expect(rate("pull", "invalid_for_requested_analysis", extra)).toBeGreaterThanOrEqual(0.95);
      expect(rate("drive", "invalid_for_requested_analysis", extra)).toBeGreaterThanOrEqual(0.95);
      expect(rate("front_on_drive", "invalid_for_requested_analysis", extra)).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("says what confirmed the shot and never claims bat or ball measures", () => {
    const spec = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!;
    const p = analyze(generate({ ...spec.options, ...bare }), opts);
    expect(p.analysis_status).toBe("valid");
    expect(p.evidence_basis).toBe("body");
    // Bat and ball unseen: contact is placed where the body has set (foot, knee and shoulder arrived).
    expect(p.events.find((e) => e.type === "contact")?.method).toMatch(/set position|hands/);
    expect(p.limitations.some((l) => l.id === "lim_body_led")).toBe(true);
    expect(p.delivery.available).toBe(false);
    for (const id of ["bat_angle_contact", "bat_speed_contact", "ball_exit_speed", "decision_timing", "contact_ahead_of_knee", "bat_pad_gap"]) {
      const m = p.metrics.find((x) => x.id === id);
      expect(!m || m.status === "not_measured", id).toBe(true);
    }
    expect(p.metrics.filter((m) => m.status !== "not_measured").length).toBeGreaterThan(3);
  });
});
