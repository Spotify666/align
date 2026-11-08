// The same ball from two angles (an optional extra after a report): each check from the camera
// that sees it, cross-checked where both see it, and no answer when the angles disagree.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { generate } from "@/engine/fixtures/generate";
import { bfdScript, ffdScript } from "@/engine/fixtures/index";
import { angleFamily, combineAngles } from "@/engine/angles";
import type { AnalysisPayload, CaptureObservation } from "@/engine/types";

const opts = { analysisId: "a", createdAt: "2026-11-08T00:00:00.000Z" };
const clip = (script: ReturnType<typeof bfdScript>, view: "side_on" | "front_on" | "behind", target?: "back_foot_defence"): CaptureObservation => ({
  ...generate({ id: "a", label: "a", seed: 3, statureM: 1.75, durationS: 2, fps: 120, handedness: "right", script, view, noise: 0.003 } as never),
  ...(target ? { target } : {}),
});
const textbook = () => bfdScript({ backStep: 0.2, frontBack: 0.27 });
const bfd = (view: "side_on" | "front_on" | "behind") => analyze(clip(textbook(), view, "back_foot_defence"), opts);

describe("two angles of the same ball", () => {
  it("each angle on its own is unchanged, and knows which family it is", () => {
    expect(angleFamily(bfd("side_on"))).toBe("side");
    expect(angleFamily(bfd("front_on"))).toBe("end");
    expect(angleFamily(bfd("behind"))).toBe("end");
  });

  it("confirmed from both: each check from the angle that sees it, at most five sentences", () => {
    const side = bfd("side_on");
    const front = bfd("front_on");
    expect(side.analysis_status).toBe("valid");
    expect(front.analysis_status).toBe("valid");
    const c = combineAngles(front, side); // either order
    expect(c.status).toBe("valid");
    expect(c.summary.verdict).toBe("This is a back-foot defence.");
    expect(c.summary.angle.short).toBe("Side + front angle");
    expect(c.summary.lines.length).toBeLessThanOrEqual(4);
    // Going back is read from the side only; the sideways line from the front only.
    expect(c.measures.find((m) => m.metric.id === "bfd_back_step")?.from).toBe("side");
    expect(c.measures.find((m) => m.metric.id === "bfd_head" && m.metric.axis === "sideways")?.from).toBe("end");
    // Checks both angles read are read from both.
    expect(c.measures.some((m) => m.from === "both")).toBe(true);
  });

  it("a check the two angles disagree on is not marked", () => {
    const side = bfd("side_on");
    const front = bfd("front_on");
    const shared = front.metrics.find((m) => side.metrics.some((s) => s.id === m.id && (s.axis ?? "") === (m.axis ?? "") && s.inRange !== null && s.value !== null) && m.inRange !== null)!;
    const flipped: AnalysisPayload = { ...front, metrics: front.metrics.map((m) => (m === shared ? { ...m, inRange: !m.inRange } : m)) };
    const c = combineAngles(side, flipped);
    const m = c.measures.find((x) => x.metric.id === shared.id && (x.metric.axis ?? "") === (shared.axis ?? ""))!;
    expect(m.disagree).toBe(true);
    expect(m.inRange).toBeNull();
  });

  it("one angle confirms the shot and the other names a different one: no answer", () => {
    const side = bfd("side_on");
    const other = analyze(clip(ffdScript(), "front_on", "back_foot_defence"), opts);
    expect(other.analysis_status).toBe("invalid_for_requested_analysis");
    const c = combineAngles(side, other);
    expect(c.status).toBe("disagree");
    expect(c.measures).toEqual([]);
  });

  it("two clips from the same side can't be combined", () => {
    const c = combineAngles(bfd("side_on"), bfd("side_on"));
    expect(c.status).toBe("same_angle");
    expect(c.measures).toEqual([]);
  });

  it("two clips checked as different shots aren't combined", () => {
    const ffd = analyze(clip(ffdScript(), "front_on"), opts);
    expect(combineAngles(bfd("side_on"), ffd).status).toBe("different_shots_asked");
  });
});
