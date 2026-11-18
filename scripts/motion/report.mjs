// Fits every take in public/motion/takes with its shot file, and prints the quality of the old
// per-frame placement ("before") and of the fit ("after"), on tracked frames and between them:
//   node scripts/motion/report.mjs [--md]
import { readFileSync, readdirSync } from "node:fs";
import { createJiti } from "jiti";
const root = new URL("../../", import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { fitTake, poseAt } = await jiti.import("../../src/lib/motion/fit.ts");
const { measure, playedFit } = await jiti.import("../../src/lib/motion/quality.ts");
const { playedBefore, playedTruth } = await jiti.import("../../src/lib/motion/baseline.ts");
const read = (p) => JSON.parse(readFileSync(`${root}public/motion/${p}`, "utf8"));
const ids = readdirSync(`${root}public/motion/takes`).filter((f) => f !== "index.json").map((f) => f.replace(".json", ""));
const HELD = new Set(["gen-drive", "gen-cut", "gen-pull"]);
const f1 = (x) => (x === null ? "–" : x.toFixed(1));
const rows = [];
for (const id of ids) {
  const take = read(`takes/${id}.json`);
  const shot = read(`shots/${take.shot}.json`);
  const t0 = performance.now();
  const fit = fitTake(take, shot);
  const ms = performance.now() - t0;
  const before = measure(playedBefore(take, fit), fit, take);
  const after = measure(playedFit(fit, poseAt), fit, take);
  const truthPlay = playedTruth(take, fit);
  const source = truthPlay ? measure(truthPlay, fit, take) : null;
  rows.push({ id, held: HELD.has(id), ms, before, after, source, fit });
}
const cols = [
  ["bone spread %", (q) => f1(q.boneSpreadPct)],
  ["grip err cm", (q) => f1(q.gripErrCm)],
  ["wrist bend °", (q) => f1(q.wristBendMaxDeg)],
  ["elbow/knee flips", (q) => `${q.elbowFlips}/${q.kneeFlips}`],
  ["palm flips", (q) => String(q.palmFlips)],
  ["planted drift cm", (q) => f1(q.plantedDriftCm)],
  ["lowest foot cm", (q) => f1(q.lowestFootCm)],
  ["collisions", (q) => String(q.collisions)],
  ["residual mean/max cm", (q) => `${f1(q.residualMeanCm)}/${f1(q.residualMaxCm)}`],
  ["truth mean/max cm", (q) => `${f1(q.truthMeanCm)}/${f1(q.truthMaxCm)}`],
];
console.log(`| take | | ${cols.map((c) => c[0]).join(" | ")} |`);
console.log(`|---|---|${cols.map(() => "---").join("|")}|`);
for (const r of rows) {
  for (const [name, q] of [["source (truth)", r.source], ["before", r.before], ["after", r.after]]) if (q) console.log(`| ${r.id}${r.held ? " (held out)" : ""} | ${name} | ${cols.map((c) => c[1](q)).join(" | ")} |`);
}
console.log("\nReprojection (fit, px mean/max per view), fit time:");
for (const r of rows) console.log(`${r.id}: ${r.fit.reprojection.map((v) => `${v.label} ${f1(v.meanPx)}/${f1(v.maxPx)}`).join(", ") || "one camera (no reprojection)"}; worst bone before: ${r.before.worstBone}; ${r.ms.toFixed(0)} ms; samples ${r.after.samples}; feet front ${[...new Set(r.fit.feet.front)].join(",")} back ${[...new Set(r.fit.feet.back)].join(",")}`);
