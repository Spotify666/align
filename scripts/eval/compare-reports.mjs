#!/usr/bin/env node
// Before / after: may the build that made <after.json> replace the one that made <before.json>?
//   node scripts/eval/compare-reports.mjs eval-media/reports/before.json eval-media/reports/after.json
// Exit code 0 = accept, 1 = reject, 2 = not enough data. The rule itself lives in
// src/engine/eval/real.ts (compareReports) and is unit-tested; this prints it.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const [before, after] = process.argv.slice(2);
if (!before || !after) { console.error("usage: compare-reports.mjs <before.json> <after.json>"); process.exit(2); }
const root = fileURLToPath(new URL("../..", import.meta.url));
try {
  execFileSync("npx", ["vitest", "run", "--config", "scripts/eval/vitest.config.ts", "scripts/eval/compare.reports.probe.ts"], { cwd: root, env: { ...process.env, BEFORE: before, AFTER: after, COMPARE_OUT: `${after}.compare.txt` }, stdio: "ignore" });
} catch {}
const { readFileSync, existsSync } = await import("node:fs");
if (!existsSync(`${after}.compare.txt`)) { console.error("The comparison did not run. Check both files are evaluation reports."); process.exit(2); }
const text = readFileSync(`${after}.compare.txt`, "utf8");
console.log(text);
process.exit(text.startsWith("DECISION: accept") ? 0 : text.startsWith("DECISION: reject") ? 1 : 2);
