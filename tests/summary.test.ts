// The report's first screen: at most five plain sentences and where the camera was.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { backFootPopulation, population } from "@/engine/fixtures/population";
import { angleLabel, fixSentence, friendlyRange, friendlyValue, plainSummary, readingLevel, simpleFix, simpleGood } from "@/engine/summary";
import type { AnalysisPayload, Metric } from "@/engine/types";

const opts = { analysisId: "s", createdAt: "2026-11-08T00:00:00.000Z" };

/** Plain enough for a child: short sentences, no units, no symbols, no jargon. */
function expectPlain(text: string) {
  expect(text.split(/\s+/).length).toBeLessThanOrEqual(18);
  expect(text).not.toMatch(/[×°%]|stature|metric|threshold|range|probability|prototype|×H/i);
  expect(text).toMatch(/[.!?”]$/);
}

function expectSummary(p: AnalysisPayload) {
  const s = plainSummary(p);
  expect(s.lines.length).toBeLessThanOrEqual(4); // with the verdict: five sentences at most
  for (const t of [s.verdict, ...s.lines.map((l) => l.text)]) expectPlain(t);
  expect(new Set(s.lines.map((l) => l.text)).size).toBe(s.lines.length);
  expect(s.angle.short.length).toBeGreaterThan(0);
  return s;
}

describe("the plain summary", () => {
  it("every fixture, front-foot and back-foot, gets at most five plain sentences", () => {
    for (const spec of FIXTURE_SPECS) {
      const o = fixture(spec.key);
      expectSummary(analyze(o, opts));
      expectSummary(analyze({ ...o, target: "back_foot_defence" }, opts));
    }
  });

  it("across a varied population, the answer matches the verdict", { timeout: 120000 }, () => {
    for (const c of [...population(35, 4), ...backFootPopulation(35, 4)]) {
      const p = analyze(c.obs, opts);
      const s = expectSummary(p);
      if (p.analysis_status === "valid") {
        expect(s.tone).toBe("ok");
        expect(s.verdict).toMatch(/^This is a (front|back)-foot defence\.$/);
        expect(s.lines.some((l) => l.kind === "good")).toBe(true);
      } else {
        expect(s.tone).not.toBe("ok");
        expect(s.verdict).not.toMatch(/^This is a /);
      }
    }
  });

  it("names the camera position, on its own label", () => {
    expect(angleLabel("side_on").short).toBe("Side angle");
    expect(angleLabel("front_on").short).toBe("Front angle");
    expect(angleLabel("behind").short).toBe("Back angle");
    expect(angleLabel(undefined).short).toBe("Angle unclear");
    expect(angleLabel("side_on", "photo").long).toMatch(/^Taken/);
    const p = analyze(fixture("valid_ffd"), opts);
    expect(plainSummary(p).angle.short).toBe("Side angle");
  });

  it("a back-foot defence analysed as a front-foot defence points to the right check", () => {
    const p = { ...analyze(fixture("valid_ffd"), opts), analysis_status: "uncertain_shot" as const, status_reason: "looks_back_foot" };
    const s = plainSummary(p, { otherShot: "back_foot_defence" });
    expect(s.verdict).toBe("This looks like a back-foot defence.");
    expect(s.lines.at(-1)?.text).toMatch(/Check as back-foot defence/);
    // Without the button (a shared report), it doesn't point to one.
    expect(plainSummary(p).lines.some((l) => /Tap/.test(l.text))).toBe(false);
  });

  it("is worded for the batter's age: no numbers under 13, the number and target for adults", () => {
    expect(readingLevel("u13")).toBe("simple");
    expect(readingLevel("16_18")).toBe("plain");
    expect(readingLevel(null)).toBe("plain");
    expect(readingLevel("masters")).toBe("detailed");
    for (const spec of FIXTURE_SPECS) {
      const p = analyze(fixture(spec.key), opts);
      const kid = plainSummary(p, { level: "simple" });
      for (const t of [kid.verdict, ...kid.lines.map((l) => l.text)]) expect(t).not.toMatch(/\d+(\.\d+)? ?(s|ms|%)\b/);
      const adult = plainSummary(p, { level: "detailed" });
      const fix = adult.lines.find((l) => l.kind === "fix");
      if (fix) expect(fix.text).toMatch(/aim for/);
    }
  });

  it("names the part that came late, in words, and shows time in seconds, never milliseconds", () => {
    const p = analyze(fixture("valid_ffd"), opts);
    const sync = { ...p.metrics.find((m) => m.id === "sync_spread")!, value: 234, inRange: false, range: { lo: 0, hi: 150 } as Metric["range"] };
    const late = { ...p, line: { ...p.line!, arrivals: { foot: { frame: 1, ms: -234, still: false }, knee: { frame: 2, ms: -150, still: false }, shoulder: { frame: 8, ms: 0, still: false }, head: { frame: 8, ms: 0, still: false } } } };
    expect(fixSentence(late, sync, "simple")).toBe("Your front shoulder came late: lean it over the ball as your foot lands.");
    expect(fixSentence(late, sync, "detailed")).toBe("Your front shoulder came late: lean it over the ball as your foot lands (you: 0.23 s; aim for under 0.15 s).");
    expect(friendlyValue(sync)).toBe("0.23 s");
    expect(friendlyRange(sync)).toBe("under 0.15 s");
  });

  it("says what to do for a measure out of its range, in its direction", () => {
    const m: Pick<Metric, "id" | "axis" | "value" | "range" | "inRange"> = { id: "line_head", value: -0.1, range: { lo: -0.03, hi: 0.03 } as Metric["range"], inRange: false };
    expect(simpleFix(m)).toBe("Get your head over your front foot.");
    expect(simpleFix({ ...m, value: 0.1 })).toBe("Don't let your head go past your front foot.");
    expect(simpleFix({ ...m, value: 0, inRange: true })).toBeNull();
    expect(simpleFix({ ...m, axis: "sideways" })).toBe("Don't let your head fall to the side.");
    expect(simpleGood({ id: "bfd_tall" })).toBe("You stood tall.");
    // The front foot following late is about timing, not where it ended up.
    expect(simpleFix({ id: "bfd_back_first", value: 0.3, range: { lo: 0, hi: 0.1 } as Metric["range"], inRange: false })).toMatch(/sooner/);
  });
});

// The analysis level the batter chooses decides the wording; age only stands in when none is chosen.
import { readingLevel as wordingFor } from "@/engine/summary";
import { ANALYSIS_LEVELS, BODY_MEASUREMENTS, DEFAULT_PROFILE, FOCUS_AREAS } from "@/lib/store";

describe("analysis level", () => {
  it("decides the wording when chosen, whatever the age", () => {
    expect(wordingFor("adult", "beginner")).toBe("simple");
    expect(wordingFor("u13", "professional")).toBe("detailed");
    expect(wordingFor(null, "amateur")).toBe("plain");
  });

  it("falls back to the age band when no level is chosen, exactly as before", () => {
    expect(wordingFor("u13")).toBe("simple");
    expect(wordingFor("adult", null)).toBe("detailed");
    expect(wordingFor(null)).toBe("plain");
    expect(wordingFor("13_15", undefined)).toBe("plain");
  });

  it("offers three levels and eight focus areas, none chosen by default", () => {
    expect(ANALYSIS_LEVELS.map((l) => l.id)).toEqual(["beginner", "amateur", "professional"]);
    expect(FOCUS_AREAS.length).toBe(8);
    expect(new Set(FOCUS_AREAS.map((a) => a.id)).size).toBe(8);
    expect(DEFAULT_PROFILE.level).toBeNull();
    expect(DEFAULT_PROFILE.focusAreas).toEqual([]);
    // Body measurements are optional: nothing is provided until the batter gives it.
    expect(Object.values(DEFAULT_PROFILE.body).every((v) => v === null)).toBe(true);
    expect(BODY_MEASUREMENTS.map((m) => m.id).sort()).toEqual(Object.keys(DEFAULT_PROFILE.body).sort());
  });
});
