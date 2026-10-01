import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { decodeRaw, encodeRaw, quantise } from "@/engine/tracks-codec";
import type { CaptureObservation } from "@/engine/types";

const opts = { analysisId: "a", createdAt: "2026-10-01T00:00:00.000Z" };

describe("front-on capture", () => {
  const p = analyze(quantise(fixture("front_on_ffd")), opts);
  it("is analysed along the pitch and says which measures it cannot see", () => {
    expect(p.camera_view).toBe("front_on");
    expect(p.limitations.map((l) => l.id)).toContain("lim_view");
    for (const id of ["contact_ahead_of_knee", "bat_speed_contact", "ball_exit_speed"]) {
      const m = p.metrics.find((x) => x.id === id);
      if (m) expect(m.status).toBe("not_measured");
    }
    expect(p.delivery.bounceDistanceM).toBeNull();
  });
  it("labels forward body measures as estimates", () => {
    const stride = p.metrics.find((m) => m.id === "stride_length");
    expect(stride?.status).toBe("estimated");
    expect(stride?.limitation).toMatch(/3D pose estimate/);
  });
  it("round-trips the 3D estimate through the track codec", () => {
    const obs = fixture("front_on_ffd");
    const back = decodeRaw(encodeRaw(obs));
    expect(back.poseWorld).toHaveLength(obs.poseWorld!.length);
    const a = obs.poseWorld![50]![0]!;
    const b = back.poseWorld![50]![0]!;
    for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(0.001);
  });
  it("still decodes side-on tracks that carry no 3D estimate", () => {
    const back = decodeRaw(encodeRaw(fixture("valid_ffd")));
    expect(back.poseWorld).toBeUndefined();
  });
});

describe("uncertain shot", () => {
  const p = analyze(fixture("no_ball"), opts);
  it("shows ungraded body observations, never ranges or a score", () => {
    expect(p.analysis_status).toBe("uncertain_shot");
    expect(p.metrics).toHaveLength(0);
    expect(p.technique_index).toBeNull();
    expect(p.observations?.length).toBeGreaterThan(0);
    for (const m of p.observations!) {
      expect(m.range).toBeNull();
      expect(m.inRange).toBeNull();
      expect(m.limitation).toMatch(/Not graded/);
      expect(["bat_angle_contact", "bat_speed_contact", "ball_exit_speed", "decision_timing"]).not.toContain(m.id);
    }
  });
  it("a different shot gets no observations at all", () => {
    const pull = analyze(fixture("pull"), opts);
    expect(pull.analysis_status).toBe("invalid_for_requested_analysis");
    expect(pull.observations).toBeUndefined();
  });
});

/** Three stills cut from a video fixture: stance, front-foot plant and contact. */
function photoSet(): CaptureObservation {
  const v = fixture("valid_ffd");
  const frames = [0, 100, 106];
  return {
    ...v,
    id: "photos",
    media: { ...v.media, kind: "photo", fps: null, fpsSource: "unknown", durationMs: 0, frameCount: frames.length },
    t: frames.map(() => 0),
    body: frames.map((i) => v.body[i]!),
    vizDepth: undefined,
    bat: { source: "none", handle: frames.map(() => null), toe: frames.map(() => null) },
    ball: { source: "none", points: frames.map(() => null) },
    marks: { bounceFrame: null, contactFrame: null },
    photoPhases: ["stance", "stride", "contact"],
  };
}

describe("photo sets", () => {
  const p = analyze(photoSet(), opts);
  it("measures each photo on its own as a posture screen", () => {
    expect(p.mode).toBe("posture_screen");
    expect(p.analysis_status).toBe("uncertain_shot");
    expect(p.status_reason).toBe("photo_only");
    expect(p.photo_set).toHaveLength(3);
    expect(p.photo_set!.map((x) => x.phase)).toEqual(["stance", "stride", "contact"]);
    expect(p.headline).toMatch(/3 photos/);
  });
  it("headline measures come from the photo tagged contact", () => {
    const knee = p.metrics.find((m) => m.id === "front_knee_flexion");
    const fromSet = p.photo_set![2]!.observations.find((m) => m.id === "front_knee_flexion");
    expect(knee?.value).toBe(fromSet?.value);
  });
  it("makes no shot, timing, ball or weight-transfer claims", () => {
    expect(p.observed_shot).toBeNull();
    expect(p.events).toHaveLength(0);
    for (const ph of p.photo_set!) {
      for (const m of ph.observations) {
        expect(m.inRange).toBeNull();
        expect(["weight_forward", "stride_length", "bat_speed_contact", "decision_timing"]).not.toContain(m.id);
      }
    }
  });
  it("a stance photo and a contact photo give different knee angles", () => {
    const k = (i: number) => p.photo_set![i]!.observations.find((m) => m.id === "front_knee_flexion")?.value ?? null;
    expect(k(0)).not.toBeNull();
    expect(k(2)).not.toBeNull();
    expect(Math.abs(k(0)! - k(2)!)).toBeGreaterThan(5);
  });
});

describe("camera position guess", () => {
  const frames = (o: CaptureObservation, idx: number[]) =>
    idx.map((i) => ({ body: o.body[i]!, world: o.poseWorld![i]!, depth: [], people: 1, hip: null }));
  it("recognises the bowler's end and behind the batter from the stance", async () => {
    const { guessView } = await import("@/lib/capture/view-guess");
    const { generate } = await import("@/engine/fixtures/generate");
    const { FIXTURE_SPECS } = await import("@/engine/fixtures");
    const spec = FIXTURE_SPECS.find((s) => s.key === "front_on_ffd")!.options;
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(guessView(frames(generate({ ...spec, seed }), [20, 100]), "right")?.view).toBe("front_on");
      expect(guessView(frames(generate({ ...spec, seed, view: "behind" }), [20, 100]), "right")?.view).toBe("behind");
      expect(guessView(frames(generate({ ...spec, seed, handedness: "left" }), [20, 100]), "left")?.view).toBe("front_on");
    }
  });
});
