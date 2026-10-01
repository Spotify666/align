import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { templateReport, validateReport, type ReportBody } from "@/engine/report";
import { generateReport, type ReportProvider } from "@/engine/llm/contract";
import { evaluate } from "@/engine/llm/eval";

const opts = { analysisId: "r", createdAt: "2026-10-01T00:00:00.000Z" };

describe("template reports satisfy the contract for every fixture", () => {
  it.each(FIXTURE_SPECS.map((s) => s.key))("%s", (key) => {
    const p = analyze(fixture(key), opts);
    const r = templateReport(p);
    expect(validateReport(r, p)).toEqual([]);
  });
});

describe("contract catches prose that contradicts the analysis", () => {
  const pull = analyze(fixture("pull"), opts);
  const valid = analyze(fixture("valid_ffd"), opts);
  const body = (text: string, cites: string[] = []): ReportBody => ({ audience: "player", sections: [{ heading: "Result", sentences: [{ text, cites }] }] });

  it("rejects a misleading score on a pull shot", () => {
    const v = validateReport(body("Great front-foot defence, 82/100.", ["feat_bat_angle"]), pull);
    expect(v.some((x) => x.rule === "status_contradiction")).toBe(true);
  });
  it("rejects an uncited measurement", () => {
    const v = validateReport(body("Valid front-foot defence. Your stride was 0.41 of your height."), valid);
    expect(v.some((x) => x.rule === "uncited_number")).toBe(true);
  });
  it("rejects a number that does not match the payload", () => {
    const v = validateReport(body("Valid front-foot defence. Your front knee was at 171°.", ["metric_front_knee_flexion"]), valid);
    expect(v.some((x) => x.rule === "number_mismatch")).toBe(true);
  });
  it("rejects invented citations", () => {
    const v = validateReport(body("Valid front-foot defence.", ["metric_made_up"]), valid);
    expect(v.some((x) => x.rule === "unknown_citation")).toBe(true);
  });
  it("rejects medical language", () => {
    const v = validateReport(body("Valid front-foot defence; this posture raises injury risk."), valid);
    expect(v.some((x) => x.rule === "medical_language")).toBe(true);
  });
  it("rejects calling a valid analysis invalid", () => {
    const v = validateReport(body("This is not a front-foot defence."), valid);
    expect(v.some((x) => x.rule === "status_contradiction")).toBe(true);
  });
});

describe("LLM boundary", () => {
  const p = analyze(fixture("pull"), opts);
  const provider = (out: unknown): ReportProvider => ({ id: "mock", model: "mock-1", generate: async () => out });

  it("accepts a faithful model report", async () => {
    const good = templateReport(p);
    const res = await generateReport(p, provider({ audience: good.audience, sections: good.sections }));
    expect(res.fellBackToTemplate).toBe(false);
    expect(res.report.generator).toBe("llm:mock:mock-1");
  });
  it("falls back to the template when the model invents a score", async () => {
    const bad = { audience: "player", sections: [{ heading: "Result", sentences: [{ text: "Front-foot defence scored 82/100.", cites: [] }] }] };
    const res = await generateReport(p, provider(bad));
    expect(res.fellBackToTemplate).toBe(true);
    expect(res.rejected).toHaveLength(2);
    expect(res.violations).toEqual([]);
    expect(res.report.generator).toBe("template-0.1.0");
  });
  it("falls back when the model returns malformed JSON", async () => {
    const res = await generateReport(p, provider({ nonsense: true }));
    expect(res.fellBackToTemplate).toBe(true);
  });
});

describe("eval harness", () => {
  it("scores providers on faithfulness, schema, and latency", async () => {
    const cases = FIXTURE_SPECS.map((s) => ({ id: s.key, payload: analyze(fixture(s.key), opts) }));
    const tpl = await evaluate("template", cases, async (payload) => ({ body: templateReport(payload), latencyMs: 0, costUsd: 0 }));
    expect(tpl.faithful).toBe(cases.length);
    const liar = await evaluate("liar", cases, async () => ({
      body: { audience: "player", sections: [{ heading: "R", sentences: [{ text: "Score 82/100 — injury risk low.", cites: [] }] }] },
      latencyMs: 5,
    }));
    expect(liar.faithful).toBe(0);
    expect(liar.medicalLanguage).toBe(cases.length);
    expect(liar.estCostUsd).toBeNull();
  });
});
