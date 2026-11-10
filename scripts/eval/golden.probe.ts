// Golden snapshot of the engine over every synthetic fixture and population case: one line per
// case (status, reason, legacy result hash). Run before and after a refactor that must not change
// results:  GOLDEN_OUT=<file> npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/golden.probe.ts
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { analyze } from "@/engine/analyze";
import { FIXTURE_SPECS, baselineSeries, fixture } from "@/engine/fixtures";
import { backFootPopulation, population } from "@/engine/fixtures/population";
import type { CaptureObservation } from "@/engine/types";

it("golden", () => {
  const cases: Array<[string, CaptureObservation]> = [
    ...FIXTURE_SPECS.map((f) => [f.key, fixture(f.key)] as [string, CaptureObservation]),
    ...FIXTURE_SPECS.map((f) => [`${f.key}@bfd`, { ...fixture(f.key), target: "back_foot_defence" as const }] as [string, CaptureObservation]),
    ...baselineSeries().map((o) => [o.id, o] as [string, CaptureObservation]),
    ...population(60, 7).map((c) => [c.id, c.obs] as [string, CaptureObservation]),
    ...backFootPopulation(60, 7).map((c) => [`bf_${c.id}`, c.obs] as [string, CaptureObservation]),
  ];
  const lines = cases.map(([id, obs]) => {
    const p = analyze(obs, { analysisId: "golden", createdAt: "2026-01-01T00:00:00.000Z" });
    return `${id}\t${p.analysis_status}\t${p.status_reason}\t${p.result_hash}`;
  });
  const out = process.env.GOLDEN_OUT;
  if (out) writeFileSync(out, lines.join("\n") + "\n");
  else console.log(lines.join("\n"));
});
