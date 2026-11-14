// Provisional measures stay off: written down in full, read by nothing in the analysis.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { PROVISIONAL_MEASURES } from "@/engine/provisional";
import { METRICS, THRESHOLDS } from "@/engine/registry";
import { BFD_METRICS } from "@/engine/backfoot-defs";
import { FRONTAL_METRICS } from "@/engine/frontal";
import { analyze } from "@/engine/analyze";
import { fixture, FIXTURE_SPECS } from "@/engine/fixtures";

describe("provisional measures", () => {
  it("are off, fully specified, and not measures or thresholds of the engine", () => {
    const ids = [...METRICS, ...BFD_METRICS, ...FRONTAL_METRICS].map((d) => d.id);
    for (const m of PROVISIONAL_MEASURES) {
      expect(m.enabled).toBe(false);
      for (const k of ["rationale", "formula", "uncertainty"] as const) expect(m[k].length).toBeGreaterThan(40);
      expect(m.landmarks.length).toBeGreaterThan(0);
      expect(m.toEnable.length).toBeGreaterThan(0);
      expect(ids).not.toContain(m.id);
      expect(Object.keys(THRESHOLDS).some((t) => t.includes(m.id))).toBe(false);
    }
  });

  it("are never in an analysis", () => {
    for (const s of FIXTURE_SPECS) {
      const p = analyze(fixture(s.key), { analysisId: "v", createdAt: "2026-10-01T00:00:00.000Z" });
      for (const m of PROVISIONAL_MEASURES) expect(JSON.stringify(p)).not.toContain(m.id);
    }
  });

  it("are read by no file of the analysis", () => {
    const files = readdirSync("src/engine").filter((f) => f.endsWith(".ts") && f !== "provisional.ts");
    for (const f of files) expect(readFileSync(`src/engine/${f}`, "utf8"), f).not.toMatch(/from "\.\/provisional"/);
  });
});
