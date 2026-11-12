// Checking a shot without choosing it first. The rule under test: it shows the front-foot
// analysis, or the back-foot one when the front-foot result itself points there. It never
// changes a result that was accepted when asked, and it never accepts a shot that neither
// explicit analysis accepts.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { analyzeUnchosen, askedAs, pointsTo } from "@/engine/identify";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { population } from "@/engine/fixtures/population";
import { evalCases } from "@/engine/eval/suite";
import { decodeTracks } from "@/engine/tracks-codec";
import type { CaptureObservation } from "@/engine/types";

const opts = { analysisId: "u", createdAt: "2026-10-01T00:00:00.000Z" };

/** What the three ways of asking give for one recording. */
function three(obs: CaptureObservation) {
  const front = analyze(askedAs(obs, "front_foot_defence"), opts);
  const back = analyze(askedAs(obs, "back_foot_defence"), opts);
  const un = analyzeUnchosen(obs, opts);
  return { front, back, un };
}

function check(obs: CaptureObservation, label: string) {
  const { front, back, un } = three(obs);
  // It is always one of the two analyses Aline already runs, unchanged.
  const same = un.payload.result_hash === front.result_hash || un.payload.result_hash === back.result_hash;
  expect(same, `${label}: one of the two explicit results`).toBe(true);
  // A front-foot result that was accepted when asked is the one shown.
  if (front.analysis_status === "valid") expect(un.payload.result_hash, `${label}: accepted front-foot result kept`).toBe(front.result_hash);
  // It hands off only where the front-foot result points, and shows what that analysis says.
  expect(un.handedOff, `${label}: hand-off`).toBe(un.payload.result_hash === back.result_hash && front.result_hash !== back.result_hash);
  if (un.handedOff) expect(pointsTo(front), `${label}: pointed to`).toBe("back_foot_defence");
  // The observation it returns carries the shot its result is for.
  expect(un.obs.target ?? "front_foot_defence").toBe(un.payload.requested_shot ?? "front_foot_defence");
  return { front, back, un };
}

describe("a shot checked without choosing it", () => {
  it("is the front-foot analysis, byte for byte, on every front-foot fixture that is accepted", () => {
    for (const spec of FIXTURE_SPECS) {
      const { front, un } = check(fixture(spec.key), spec.key);
      if (front.analysis_status === "valid") expect(un.handedOff).toBe(false);
    }
  });

  it("never accepts a shot that neither analysis accepts, across the evaluation set", { timeout: 300000 }, () => {
    let handed = 0;
    let backAccepted = 0;
    let backReached = 0;
    const seen = new Set<string>();
    for (const c of evalCases()) {
      // The set asks each movement as both shots; here each movement is taken once.
      const key = c.id.replace(/front_foot_defence|back_foot_defence/g, (m, off) => (off === c.id.indexOf(m) ? m : "as"));
      const { front, back, un } = check(c.obs, c.id);
      if (un.handedOff) handed++;
      const family = c.slices.find((s) => s.startsWith("family:")) ?? c.id;
      if (!/front_foot_defence|back_foot_defence/.test(family)) expect(un.payload.analysis_status, `${c.id}: another shot`).not.toBe("valid");
      if (!seen.has(key) && back.analysis_status === "valid" && front.analysis_status !== "valid") {
        backAccepted++;
        if (un.payload.analysis_status === "valid") backReached++;
      }
      seen.add(key);
    }
    // Back-foot defences the back-foot analysis accepts are reached without being chosen.
    expect(backAccepted).toBeGreaterThan(0);
    expect(backReached, `back-foot defences reached: ${backReached} of ${backAccepted}; hand-offs ${handed}`).toBe(backAccepted);
  });

  it("never accepts another shot across a population of technique, views and noise", { timeout: 300000 }, () => {
    const tally = { bfd: 0, bfdValid: 0, bfdAsked: 0 };
    for (const c of population(210, 11)) {
      const { back, un } = check(c.obs, c.obs.id);
      if (c.family !== "ffd" && c.family !== "bfd") expect(un.payload.analysis_status, `${c.obs.id} (${c.family})`).not.toBe("valid");
      // A front-foot defence is never turned into a back-foot one.
      if (c.family === "ffd") expect(un.payload.requested_shot ?? "front_foot_defence", c.obs.id).toBe("front_foot_defence");
      if (c.family === "bfd") {
        tally.bfd++;
        if (back.analysis_status === "valid") tally.bfdAsked++;
        if (un.payload.analysis_status === "valid") tally.bfdValid++;
      }
    }
    // Never more back-foot defences accepted than when the batter asks for one.
    expect(tally.bfdValid).toBeLessThanOrEqual(tally.bfdAsked);
  });

  it("leaves the real front-foot defences as they are", async () => {
    for (const f of readdirSync("tests/assets/real").filter((x) => x.endsWith(".b64"))) {
      const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${f}`, "utf8"), "base64")));
      const { front, un } = check(obs, f);
      expect(un.payload.result_hash, f).toBe(front.result_hash);
    }
  });
});
