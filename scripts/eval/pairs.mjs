// Every labelled two-angle pair of the athlete's own clips through the real two-video flow
// (headless Chromium, tests/e2e/two-videos.mjs), on both pose paths, against the truth: one ball
// must combine, two balls must be refused. Media is never committed: point it at a local folder.
//   PAIRS=scripts/eval/athlete-pairs.example.json node scripts/eval/pairs.mjs <baseUrl> <mediaDir> <outDir>
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [, , base, dir, out] = process.argv;
const root = fileURLToPath(new URL("../..", import.meta.url));
const set = JSON.parse(readFileSync(process.env.PAIRS ?? new URL("./athlete-pairs.example.json", import.meta.url), "utf8"));
mkdirSync(out, { recursive: true });
const paths = (process.env.POSE ?? "CPU,GPU").split(",");
const run = (p, pose) =>
  new Promise((resolve) => {
    const files = [p.a, p.b].map((k) => `${dir}/${set.clips[k].file}`).join(",");
    execFile("node", [`${root}tests/e2e/two-videos.mjs`, base, files, `${out}/${p.a}+${p.b}_${pose}`], { env: { ...process.env, POSE_DELEGATE: pose, SHOT: p.shot === "back" ? "back" : "" }, timeout: 900000, maxBuffer: 1 << 24 }, (err, stdout) => {
      const line = stdout.split("\n").find((l) => / (combined|refused|single report):/.test(l)) ?? (err ? `error: ${err.message.slice(0, 120)}` : "no result");
      const got = /combined:/.test(line) ? "same" : /refused:/.test(line) ? "different" : "?";
      resolve({ got, line: line.replace(/^\S+ /, "").slice(0, 150) });
    });
  });
let fails = 0;
for (const p of set.pairs)
  for (const pose of paths) {
    const r = await run(p, pose);
    const ok = r.got === p.truth;
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${p.a} + ${p.b}  [${pose}]  truth ${p.truth}, got ${r.got}  |  ${r.line}`);
  }
console.log(`${fails} of ${set.pairs.length * paths.length} wrong`);
