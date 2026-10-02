// Release gate on a population, not on any one clip: front-foot defences across the range
// of technique (beginner to textbook) and the shots most often confused with them, across
// camera positions, frame rates, handedness, landmark noise and missing bat or ball.
import { describe, expect, it } from "vitest";
import { population } from "@/engine/fixtures/population";
import { analyze } from "@/engine/analyze";

const opts = { analysisId: "p", createdAt: "2026-10-01T00:00:00.000Z" };

describe("population release gate", () => {
  it("accepts defences, never another shot, and never calls a defence a different shot", { timeout: 300000 }, () => {
    const tally = new Map<string, { n: number; valid: number; invalid: number }>();
    for (const c of population(420, 11)) {
      const p = analyze(c.obs, opts);
      const key = c.family === "ffd" ? `ffd_${c.view === "side_on" ? "side" : "end"}` : c.family;
      const t = tally.get(key) ?? { n: 0, valid: 0, invalid: 0 };
      t.n++;
      if (p.analysis_status === "valid") t.valid++;
      if (p.analysis_status === "invalid_for_requested_analysis") t.invalid++;
      tally.set(key, t);
    }
    const side = tally.get("ffd_side")!;
    const end = tally.get("ffd_end")!;
    // Side-on is the reference view.
    expect(side.valid / side.n).toBeGreaterThanOrEqual(0.95);
    // Along the pitch, forward travel is only estimated: without bat or ball, an upright
    // defence (head above ~86% of standing height) there is honestly uncertain against a
    // back-foot defence, and a jittery bottom hand blurs a dead bat into a push. Measured
    // 77–83% across seeds with realistic hand jitter; never called a different shot.
    expect(end.valid / end.n).toBeGreaterThanOrEqual(0.75);
    expect(side.invalid + end.invalid).toBe(0);
    // False acceptance is release-blocking.
    for (const f of ["drive", "half_drive", "pull", "cut", "bfd"]) expect(tally.get(f)!.valid, f).toBe(0);
  });
});
