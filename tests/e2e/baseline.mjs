// Guard against regressions in what the athlete feels: per-step time and the verdict on
// reference clips, compared with the last accepted run (tests/e2e/baselines.json).
// Run before every change that touches capture, scan, tracking or the engine:
//   node tests/e2e/baseline.mjs <baseUrl> <clipDir> [--update]
// Reference clips (MP4, decoded exactly, so runs are repeatable): yt.mp4 (44 s net
// session, bowler's end), sq.mp4 (9 s broadcast, zooms and cuts), test60.mp4 (2.5 s still
// pose, no stroke). Headless Chromium can't decode H.264: use VP9-in-MP4 copies there.
// A step slower than its baseline by more than 15% (and 1.5 s), or a changed verdict or
// chosen shot, fails. --update records the current run as the new baseline (only after a
// deliberate, reviewed change).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [, , base, dir, flag] = process.argv;
const FILE = new URL("./baselines.json", import.meta.url);
const CLIPS = (process.env.BASELINE_CLIPS ?? "yt_vp9.mp4,sq_vp9.mp4,test60_vp9.mp4").split(",");
const STEPS = ["Reading the video", "Finding the shot", "Finding the batter", "Camera position", "Checking the recording", "Tracking the body"];

function run(clip) {
  const out = execFileSync("node", [new URL("./capture-flow.mjs", import.meta.url).pathname, base, `${dir}/${clip}`, `${process.env.E2E_OUT ?? "/tmp"}/baseline_${clip}`], {
    encoding: "utf8",
    // The pose path pinned as on a returning device, so runs are comparable.
    env: { ...process.env, POSE_DELEGATE: process.env.POSE_DELEGATE ?? "CPU" },
    timeout: 600000,
  });
  const lines = out.split("\n").map((l) => /^(\d+(?:\.\d+)?)s\s+(.*)$/.exec(l.trim())).filter(Boolean);
  const steps = {};
  let prev = null;
  let retries = 0;
  let shot = null;
  for (const [, t, text] of lines) {
    const time = Number(t);
    const step = STEPS.find((s) => text.startsWith(s));
    if (text.startsWith("files set")) prev = time;
    if (step) {
      if (step === "Finding the shot") {
        if (steps[step] !== undefined) retries++;
        shot = /Shot at (\d+:\d+)/.exec(text)?.[1] ?? shot;
      }
      if (steps[step] === undefined && prev !== null) steps[step] = Math.round((time - prev) * 10) / 10;
      prev = time;
    }
  }
  const verdict = /report: (.*)/.exec(out)?.[1]?.split(".")[0] ?? "none";
  const total = Number(/(\d+(?:\.\d+)?)s report:/.exec(out)?.[1] ?? NaN);
  return { steps, retries, shot, verdict, total };
}

const now = Object.fromEntries(CLIPS.map((c) => [c, run(c)]));
const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
let failed = false;
for (const c of CLIPS) {
  const a = old?.[c];
  const b = now[c];
  console.log(`\n${c}: ${b.verdict} · shot ${b.shot} · retries ${b.retries} · total ${b.total}s`);
  for (const s of STEPS) {
    const was = a?.steps?.[s];
    const is = b.steps[s];
    const worse = was !== undefined && is !== undefined && is > was * 1.15 && is - was > 1.5;
    if (worse) failed = true;
    console.log(`  ${worse ? "SLOWER" : "ok    "} ${s.padEnd(24)} ${String(is ?? "-").padStart(6)} s   (baseline ${was ?? "-"} s)`);
  }
  if (a && (a.verdict !== b.verdict || a.shot !== b.shot || b.retries > a.retries)) {
    failed = true;
    console.log(`  CHANGED verdict/shot/retries: was "${a.verdict}" at ${a.shot} (${a.retries} retries)`);
  }
}
if (flag === "--update") {
  writeFileSync(FILE, JSON.stringify(now, null, 2) + "\n");
  console.log("\nbaseline updated");
} else if (failed) {
  console.log("\nREGRESSION: a step got slower or a verdict changed. Fix it, or update the baseline deliberately.");
  process.exit(1);
} else console.log("\nno regression");
