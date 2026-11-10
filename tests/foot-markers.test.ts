// The steady foot markers (engine 0.9.0) re-time Trigger and the back foot's first movement
// only. Everything a batter is told about their shot must be exactly what the old markers gave:
// verdict, reason, headline, every measure, every classifier feature, the plan.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { evalCases } from "@/engine/eval/suite";
import { downsample } from "@/engine/eval/transforms";
import { detectEvents, segmentEvents } from "@/engine/events";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import { backFootPopulation, population } from "@/engine/fixtures/population";
import { THRESHOLDS } from "@/engine/registry";
import { buildScene } from "@/engine/scene";
import { decodeTracks } from "@/engine/tracks-codec";
import type { AnalysisPayload, CaptureObservation } from "@/engine/types";

const AT = { analysisId: "f", createdAt: "f" };
const RETIMED = ["trigger", "back_foot_commit"];
const told = (p: AnalysisPayload) =>
  JSON.stringify({
    status: p.analysis_status,
    reason: p.status_reason,
    headline: p.headline,
    shot: p.observed_shot?.label ?? null,
    probs: p.shot_probabilities,
    index: p.technique_index,
    metrics: p.metrics.map((m) => [m.id, m.status, m.value, m.inRange]),
    observations: (p.observations ?? []).map((m) => [m.id, m.value]),
    features: p.features.map((f) => [f.id, f.value]),
    line: p.line ?? null,
    back_foot: p.back_foot ?? null,
    checks: p.back_foot_checks ?? null,
    plan: p.plan?.priority.metricId ?? null,
    priorities: p.priorities.map((x) => x.metricId),
    events: p.events.filter((e) => !RETIMED.includes(e.type)).map((e) => [e.type, e.frame, e.confidence]),
    which: p.events.map((e) => e.type).sort(),
  });

describe("steady foot markers", () => {
  it("change nothing a batter is told: only when Trigger and Back foot are marked", async () => {
    const cases: Array<[string, CaptureObservation]> = [
      ...FIXTURE_SPECS.map((f) => [f.key, fixture(f.key)] as [string, CaptureObservation]),
      ...FIXTURE_SPECS.map((f) => [`${f.key}@bfd`, { ...fixture(f.key), target: "back_foot_defence" as const }] as [string, CaptureObservation]),
      ...population(40, 5).map((c) => [c.id, c.obs] as [string, CaptureObservation]),
      ...backFootPopulation(40, 5).map((c) => [`bf_${c.id}`, c.obs] as [string, CaptureObservation]),
      ...evalCases().map((c) => [c.id, c.obs] as [string, CaptureObservation]),
    ];
    for (const name of ["sq", "yt", "yt_full"]) {
      const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${name}.b64`, "utf8"), "base64")));
      cases.push([`real ${name}`, obs], [`real ${name}@bfd`, { ...obs, target: "back_foot_defence" }]);
    }
    const differ = cases.filter(([, obs]) => told(analyze(obs, AT)) !== told(analyze(obs, { ...AT, eventDetector: segmentEvents }))).map(([id]) => id);
    expect(differ).toEqual([]);
  }, 300000);

  it("land nearer the true first movement than the single-frame rule, and move less at half the frame rate", () => {
    const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
    const err = { old: [] as number[], steady: [] as number[] };
    const moves = { old: [] as number[], steady: [] as number[] };
    for (const c of evalCases()) {
      // Truth: the same movement with no tracker noise at 240 fps (both rules agree on clean data).
      const clean = generate({ ...c.options, fps: 240, noise: 0, handNoise: 0 });
      const truth = segmentEvents(clean, buildScene(clean)).byType;
      const scene = buildScene(c.obs);
      const here = { old: segmentEvents(c.obs, scene).byType, steady: detectEvents(c.obs, scene).byType };
      const h = downsample(c.obs, 2);
      const hs = buildScene(h);
      const half = c.fps >= 60 ? { old: segmentEvents(h, hs).byType, steady: detectEvents(h, hs).byType } : null;
      for (const m of ["trigger", "back_foot_commit"] as const)
        for (const rule of ["old", "steady"] as const) {
          if (truth[m] && here[rule][m]) err[rule].push(Math.abs(here[rule][m]!.tMs - truth[m]!.tMs));
          if (half?.[rule][m] && here[rule][m]) moves[rule].push(Math.abs(half[rule][m]!.tMs - here[rule][m]!.tMs));
        }
    }
    expect(q(err.steady, 0.9)).toBeLessThan(q(err.old, 0.9) / 2);
    expect(q(err.steady, 0.5)).toBeLessThanOrEqual(q(err.old, 0.5));
    expect(q(moves.steady, 0.9)).toBeLessThan(q(moves.old, 0.9));
    // Stated plainly for the record; generated movement, not real athletes.
    expect(q(err.steady, 0.9)).toBeLessThan(100);
  }, 300000);

  it("every limit the event rules read is registered with its reason", () => {
    for (const id of ["events.foot.move_speed", "events.foot.still_speed", "events.foot.min_stride", "events.foot.settled_forward", "events.foot.min_back", "events.foot.sustain_s", "events.contact.max_bat_ball_gap", "events.contact.min_drop", "events.bat.downswing_speed", "events.bat.settled_speed"] as const) expect(THRESHOLDS[id].rationale.length, id).toBeGreaterThan(40);
    // No limit scaled by the batter's height is left inline in the event rules.
    expect(readFileSync("src/engine/events.ts", "utf8").match(/\d\.\d+ \* S\b/g)).toBeNull();
  });
});
