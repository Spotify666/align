// Used by compare-reports.mjs: reads two evaluation reports and writes the gate's verdict.
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { compareReports, type EvalReport } from "@/engine/eval/real";

it("compare reports", () => {
  if (!process.env.BEFORE || !process.env.AFTER) return;
  const before = JSON.parse(readFileSync(process.env.BEFORE, "utf8")) as EvalReport;
  const after = JSON.parse(readFileSync(process.env.AFTER, "utf8")) as EvalReport;
  const c = compareReports(before, after);
  const text = [
    `DECISION: ${c.decision}`,
    `before: ${before.name} (${before.detector}, engine ${before.versions.engine})   after: ${after.name} (${after.detector}, engine ${after.versions.engine})`,
    "",
    ...c.lines.map((l) => `${l.pass === null ? "?   " : l.pass ? "PASS" : "FAIL"}  ${l.criterion}\n      ${l.detail}`),
    "",
    "The fifth criterion, no synthetic ratchet growth, is tests/metamorphic.test.ts.",
    "",
    "by slice",
    ...c.slices,
    "",
    "leave one athlete out (after)",
    ...after.loao.map((l) => `${l.athlete}\t${l.summary.clips} clips\tright ${l.summary.right}\tcontact ${l.summary.events.contact.medianAbsMs ?? "n/a"} ms\tscale fitted on the others ${l.uncertaintyScale?.toFixed(2) ?? "n/a"}\tcoverage at that scale ${l.coverageWithScale === null ? "n/a" : Math.round(l.coverageWithScale * 100) + "%"}`),
  ].join("\n");
  writeFileSync(process.env.COMPARE_OUT ?? "compare.txt", text + "\n");
});
