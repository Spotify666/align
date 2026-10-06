// Run every case of a real-media matrix through the app (headless Chromium, the real capture
// pipeline) and collect the verdicts. Media is never committed: point it at a local folder.
//   CASES=cases.json node scripts/eval/run.mjs <baseUrl> <mediaDir> <outDir> [id,id]
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [, , base, dir, out, only] = process.argv;
if (!base || !dir || !out) {
  console.error("usage: CASES=cases.json node scripts/eval/run.mjs <baseUrl> <mediaDir> <outDir> [id,id]");
  process.exit(2);
}
const root = fileURLToPath(new URL("../..", import.meta.url));
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(process.env.CASES ?? new URL("./cases.example.json", import.meta.url), "utf8")).filter(
  (c) => !only || only.split(",").includes(c.id),
);
const run = (c) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    execFile(
      "node",
      [`${root}tests/e2e/capture-flow.mjs`, base, `${dir}/${c.file}`, `${out}/${c.id}`],
      {
        env: { ...process.env, POSE_DELEGATE: process.env.POSE_DELEGATE ?? "CPU", EXPORT_TRACKS: `${out}/${c.id}.tracks.b64` },
        timeout: 900000,
        maxBuffer: 1 << 24,
        cwd: root,
      },
      (err, stdout, stderr) => {
        writeFileSync(`${out}/${c.id}.log`, stdout + (stderr ? "\nSTDERR " + stderr : "") + (err ? "\nERR " + err.message : ""));
        const stopped = /STOPPED: (.*)/.exec(stdout)?.[1];
        const verdict = /report: (.*)/.exec(stdout)?.[1] ?? (stopped ? "STOPPED " + stopped : "NO RESULT");
        resolve({ ...c, verdict: verdict.replace(/\s+/g, " ").slice(0, 220), secs: Math.round((Date.now() - t0) / 1000) });
      },
    );
  });
const results = [];
for (const c of cases) {
  const r = await run(c);
  results.push(r);
  console.log(`${r.id} [${r.truth}] ${r.secs}s :: ${r.verdict}`);
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
}
