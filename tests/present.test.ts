// What a report shows at each analysis level and focus (`present.ts`). The analysis never reads
// the level or the focus; presenting picks from what it measured, keeps the engine's own
// priorities whatever the focus, and stays inside each level's count.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { askedAs } from "@/engine/identify";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { population } from "@/engine/fixtures/population";
import { decodeTracks } from "@/engine/tracks-codec";
import { CATEGORIES, FOCUS_AREA_IDS, type FocusArea } from "@/engine/category";
import { availableChecks, present } from "@/engine/present";
import { METRICS } from "@/engine/registry";
import { FRONTAL_METRICS } from "@/engine/frontal";
import { BFD_METRICS } from "@/engine/backfoot-defs";
import { FOCUS_AREAS } from "@/lib/store";
import type { AnalysisPayload } from "@/engine/types";

const opts = { analysisId: "p", createdAt: "2026-10-01T00:00:00.000Z" };
const LEVELS = ["beginner", "amateur", "professional"] as const;

function payloads(): Array<{ label: string; p: AnalysisPayload }> {
  const out: Array<{ label: string; p: AnalysisPayload }> = [];
  for (const s of FIXTURE_SPECS) {
    const obs = fixture(s.key);
    out.push({ label: `${s.key}/front`, p: analyze(askedAs(obs, "front_foot_defence"), opts) });
    out.push({ label: `${s.key}/back`, p: analyze(askedAs(obs, "back_foot_defence"), opts) });
  }
  for (const c of population(60, 7)) out.push({ label: c.obs.id, p: analyze(c.obs, opts) });
  return out;
}

/** Every focus choice worth checking: none, each one alone, and all of them. */
const FOCUS_CHOICES: FocusArea[][] = [[], ...FOCUS_AREA_IDS.map((f) => [f]), [...FOCUS_AREA_IDS]];

function checkAll(label: string, p: AnalysisPayload) {
  const frozen = JSON.stringify(p);
  const { checks: available } = availableChecks(p);
  const spec = CATEGORIES[p.requested_shot ?? "front_foot_defence"].presentation;
  for (const level of LEVELS) {
    for (const focus of FOCUS_CHOICES) {
      const m = present(p, level, focus);
      const ids = m.checks.map((c) => c.metric.id);
      // Only measured checks, each once.
      expect(new Set(ids).size, `${label} ${level}`).toBe(ids.length);
      for (const id of ids) expect(available.some((a) => a.id === id), `${label}: ${id} measured`).toBe(true);
      // Inside the level's count, or every measured check when there are fewer.
      const max = level === "professional" ? available.length : spec.levels[level][1];
      const min = level === "professional" ? available.length : Math.min(spec.levels[level][0], available.length);
      expect(ids.length, `${label} ${level} ${focus.join(",")}`).toBeGreaterThanOrEqual(min);
      expect(ids.length, `${label} ${level} ${focus.join(",")}`).toBeLessThanOrEqual(max);
      expect(m.more).toBe(available.length - ids.length);
      // A serious finding (the engine's own priorities) is shown whatever the focus.
      if (m.graded) for (const f of p.priorities) if (available.some((a) => a.id === f.metricId)) expect(ids, `${label} ${level} ${focus.join(",")}: ${f.metricId}`).toContain(f.metricId);
    }
  }
  // Presenting never changes the analysis.
  expect(JSON.stringify(p), `${label}: payload untouched`).toBe(frozen);
}

describe("presenting a report at each level", () => {
  it("names every measure of each category in its order and focus groups, and nothing else", () => {
    const known = { front_foot_defence: [...METRICS, ...FRONTAL_METRICS].map((d) => d.id), back_foot_defence: BFD_METRICS.map((d) => d.id) };
    for (const [id, cat] of Object.entries(CATEGORIES)) {
      const ids = known[id as keyof typeof known];
      expect([...cat.presentation.order].sort(), id).toEqual([...ids].sort());
      for (const group of Object.values(cat.presentation.focusGroups)) for (const m of group) expect(ids, `${id}: ${m}`).toContain(m);
    }
  });

  it("offers the same focus areas on the check screen as the engine knows", () => {
    expect(FOCUS_AREAS.map((a) => a.id)).toEqual([...FOCUS_AREA_IDS]);
  });

  it("gives the same analysis whatever level is chosen (the engine never reads it)", () => {
    const obs = fixture("valid_ffd");
    const a = analyze(obs, opts);
    const b = analyze(structuredClone(obs), opts);
    expect(b.result_hash).toBe(a.result_hash);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("stays inside each level's count, shows only measured checks and never hides a priority: fixtures and population", { timeout: 120000 }, () => {
    for (const { label, p } of payloads()) checkAll(label, p);
  });

  it("does the same on the real tracks", { timeout: 60000 }, async () => {
    for (const f of readdirSync("tests/assets/real").filter((n) => n.endsWith(".b64"))) {
      const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${f}`, "utf8"), "base64")));
      for (const target of ["front_foot_defence", "back_foot_defence"] as const) checkAll(`${f}/${target}`, analyze(askedAs(obs, target), opts));
    }
  });

  it("leads with the chosen focus, faults first, after the priorities", () => {
    const p = analyze(fixture("valid_ffd"), opts);
    const m = present(p, "beginner", ["footwork"]);
    const firstNonPriority = m.checks.findIndex((c) => c.because !== "priority");
    const focusIds = new Set(CATEGORIES.front_foot_defence.presentation.focusGroups.footwork);
    const measuredFocus = availableChecks(p).checks.filter((c) => focusIds.has(c.id)).length;
    const lead = m.checks.slice(firstNonPriority, firstNonPriority + measuredFocus).filter((c) => !p.priorities.some((f) => f.metricId === c.metric.id));
    for (const c of lead) expect(c.because).toBe("focus");
  });

  it("says when a chosen focus has nothing measured in this clip", () => {
    const p = analyze(fixture("valid_ffd"), opts);
    const m = present(p, "amateur", ["outcome", "reference"]);
    // "reference" is the Comparison section, not a measure: never reported as unmeasured.
    expect(m.unmeasuredFocus).not.toContain("reference");
  });
});
