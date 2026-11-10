// Regression gate against per-clip overfitting. The same synthetic movement is analysed as
// several different recordings of it (mirrored, resized, re-timed, at another frame rate, with
// evidence missing). Two tiers:
//   Must hold (hard failures): the exact relations, the accept / don't-accept decision under
//   every relation, no false acceptance, and nothing invented when evidence is missing.
//   Ratchet: relations known not to hold yet are listed in tests/baselines/metamorphic.json.
//   A change may remove entries from that list, never add to it. Regenerate after an
//   improvement with  UPDATE_BASELINE=1 npx vitest run tests/metamorphic.test.ts  and read the diff.
// Synthetic movement: this shows consistency, not accuracy on real athletes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { categoryOf } from "@/engine/category";
import { differences, signature, type Difference, type Signature } from "@/engine/eval/relations";
import { evalCases, RELATIONS, type EvalCase } from "@/engine/eval/suite";
import { withoutEvidence } from "@/engine/eval/transforms";

const BASELINE = fileURLToPath(new URL("./baselines/metamorphic.json", import.meta.url));
const EXACT = ["mirror", "resize_half", "resize_double", "time_offset"];

interface Row {
  c: EvalCase;
  base: Signature;
  byRelation: Map<string, { sig: Signature; diffs: Difference[] }>;
}

let rows: Row[] = [];

beforeAll(() => {
  rows = evalCases().map((c) => {
    const base = signature(c.obs);
    const byRelation = new Map<string, { sig: Signature; diffs: Difference[] }>();
    for (const r of RELATIONS) {
      if (r.applies && !r.applies(c)) continue;
      const sig = signature(r.transform(c.obs));
      byRelation.set(r.id, { sig, diffs: differences(base, sig, r.relation(c)) });
    }
    return { c, base, byRelation };
  });
}, 300000);

describe("metamorphic relations (synthetic movement)", () => {
  it("covers both categories, hard negatives, both hands, two camera positions, 30–240 fps, with and without bat and ball", () => {
    const slices = new Set(rows.flatMap((r) => r.c.slices));
    for (const s of ["family:front_foot_defence", "family:back_foot_defence", "family:drive", "family:pull", "family:cut", "hand:left", "hand:right", "view:side_on", "view:front_on", "fps:30", "fps:60", "fps:120", "fps:240", "evidence:full", "evidence:body"]) expect(slices.has(s), s).toBe(true);
  });

  it.each(EXACT)("%s changes nothing at all", (id) => {
    const broken = rows.filter((r) => r.byRelation.get(id)!.diffs.length).map((r) => `${r.c.id}: ${JSON.stringify(r.byRelation.get(id)!.diffs.slice(0, 3))}`);
    expect(broken).toEqual([]);
  });

  it("never flips between graded and not graded under any relation", () => {
    const flips: string[] = [];
    for (const r of rows) for (const [id, t] of r.byRelation) if ((r.base.outcome === "accepted") !== (t.sig.outcome === "accepted")) flips.push(`${r.c.id} · ${id}: ${r.base.outcome} → ${t.sig.outcome}`);
    expect(flips).toEqual([]);
  });

  it("never accepts another shot as the requested category (hard negatives), in any copy", () => {
    const wrong: string[] = [];
    for (const r of rows) {
      if (r.c.expected !== "not_accepted") continue;
      if (r.base.outcome === "accepted") wrong.push(r.c.id);
      for (const [id, t] of r.byRelation) if (t.sig.outcome === "accepted") wrong.push(`${r.c.id} · ${id}`);
    }
    expect(wrong).toEqual([]);
  });

  it("withholds what depends on the bat or the ball when they are missing, and never accepts on less evidence what it refused on more", () => {
    const problems: string[] = [];
    for (const r of rows) {
      const defs = categoryOf(r.c.obs.target).metrics;
      for (const drop of [{ bat: true }, { ball: true }, { bat: true, ball: true }]) {
        const p = analyze(withoutEvidence(r.c.obs, drop), { analysisId: "t", createdAt: "t" });
        if (r.base.outcome !== "accepted" && p.analysis_status === "valid") problems.push(`${r.c.id}: accepted without ${Object.keys(drop).join("+")}`);
        for (const m of p.metrics) {
          const needs = defs.find((d) => d.id === m.id)?.requires ?? [];
          if (((drop.bat && needs.includes("bat")) || (drop.ball && needs.includes("ball"))) && m.value !== null) problems.push(`${r.c.id}: ${m.id} reported without ${Object.keys(drop).join("+")}`);
        }
      }
    }
    expect(problems).toEqual([]);
  }, 120000);

  it("ratchet: nothing breaks that held before (tests/baselines/metamorphic.json)", () => {
    const missed = rows.filter((r) => r.c.expected === "accepted" && r.base.outcome !== "accepted").map((r) => `${r.c.id} → ${r.base.outcome}/${r.base.reason}`).sort();
    const broken = rows
      .flatMap((r) => [...r.byRelation].filter(([id, t]) => !EXACT.includes(id) && t.diffs.length).map(([id, t]) => `${r.c.id} · ${id} · ${[...new Set(t.diffs.map((d) => d.kind))].sort().join("+")}`))
      .sort();
    const holds = Object.fromEntries(RELATIONS.map((rel) => [rel.id, `${rows.filter((r) => r.byRelation.get(rel.id)?.diffs.length === 0).length}/${rows.filter((r) => r.byRelation.has(rel.id)).length}`]));
    const current = {
      note: "Synthetic movement only. 'broken' and 'not_accepted_but_should_be' may shrink, never grow.",
      cases: rows.length,
      holds,
      not_accepted_but_should_be: missed,
      broken,
    };
    if (process.env.UPDATE_BASELINE || !existsSync(BASELINE)) writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as typeof current;
    expect(broken.filter((b) => !baseline.broken.includes(b)), "relations that held before and are broken now").toEqual([]);
    expect(missed.filter((m) => !baseline.not_accepted_but_should_be.includes(m)), "supported shots accepted before and not now").toEqual([]);
  });
});
