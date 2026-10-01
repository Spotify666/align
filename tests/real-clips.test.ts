// Regression on real footage: movement tracks (pose keypoints only, no imagery) from two
// public clips of front-foot defences, filmed from the bowler's end without a visible bat
// or ball track — a broadcast clip that zooms and cuts, and a net session on a phone.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";
import { FRONTAL_UNGRADED } from "@/engine/frontal";
import type { CaptureObservation } from "@/engine/types";

const load = async (name: string): Promise<CaptureObservation> =>
  decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${name}.b64`, "utf8"), "base64")));
const opts = { analysisId: "r", createdAt: "2026-10-01T00:00:00.000Z" };

describe("real front-foot defences, bat and ball not tracked", () => {
  for (const [name, label] of [["sq", "broadcast, zooming camera"], ["yt", "phone at the nets"]] as const) {
    it(`confirms the defence from body and hands (${label})`, async () => {
      const p = analyze(await load(name), opts);
      expect(p.analysis_status).toBe("valid");
      expect(p.evidence_basis).toBe("body");
      expect(p.metrics.filter((m) => m.status !== "not_measured").length).toBeGreaterThan(3);
      // From the bowler's end: sideways measures graded, forward distances never graded.
      expect(p.metrics.some((m) => m.id === "head_line" && m.inRange !== null)).toBe(true);
      for (const m of p.metrics.filter((x) => FRONTAL_UNGRADED.includes(x.id))) expect(m.inRange, m.id).toBeNull();
      expect(p.priorities.every((x) => !FRONTAL_UNGRADED.includes(x.metricId))).toBe(true);
    });
  }
  it("knows the broadcast camera zoomed", async () => {
    const p = analyze(await load("sq"), opts);
    expect(p.limitations.some((l) => l.id === "lim_camera_moving")).toBe(true);
  });
});
