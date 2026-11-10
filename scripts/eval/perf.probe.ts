// What the result contract costs, stage by stage, on synthetic clips and exported real tracks.
// Nothing here runs a model: pose, bat and ball tracking happen once at capture and are stored
// in the observation; the contract re-reads those stored tracks.
//   PERF_OUT=<file> [PROBE_DIR=<exported tracks>] npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/perf.probe.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { analyze } from "@/engine/analyze";
import { downsample } from "@/engine/eval/transforms";
import { evalCases } from "@/engine/eval/suite";
import { segmentEvents } from "@/engine/events";
import { fixture } from "@/engine/fixtures";
import { buildResult } from "@/engine/result";
import { buildScene } from "@/engine/scene";
import { decodeTracks } from "@/engine/tracks-codec";
import type { CaptureObservation } from "@/engine/types";

const AT = { analysisId: "p", createdAt: "p" };
/** Median of `runs` timings (ms) after a warm-up. */
function time(fn: () => void, runs = 15): number {
  fn();
  const xs = Array.from({ length: runs }, () => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  }).sort((a, b) => a - b);
  return xs[Math.floor(runs / 2)]!;
}

it("result contract cost", async () => {
  const cases: Array<[string, CaptureObservation]> = [
    ["fixture valid_ffd", fixture("valid_ffd")],
    ["fixture front_on_ffd", fixture("front_on_ffd")],
    ...evalCases().filter((c) => /front_foot_defence_as_ffd_(30|240)_right_side_on_full/.test(c.id)).map((c) => [c.id, c.obs] as [string, CaptureObservation]),
  ];
  for (const dir of ["tests/assets/real", ...(process.env.PROBE_DIR ?? "").split(",").filter(Boolean)]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".b64"))) cases.push([`real ${f}`, await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`${dir}/${f}`, "utf8"), "base64")))]);
  }
  const rows = ["case\tframes\tfps\tanalyze ms\tresult ms\tof which: scene\tevents (full rate)\ttwo half-rate copies + their scenes + events\tresult ÷ analyze"];
  const notes: string[] = [];
  for (const [id, obs] of cases) {
    const payload = analyze(obs, AT);
    const scene = buildScene(obs);
    const tAnalyze = time(() => analyze(obs, AT));
    const tResult = time(() => buildResult(payload, obs));
    const tScene = time(() => buildScene(obs));
    const tEvents = time(() => segmentEvents(obs, scene));
    const tHalves = time(() => {
      for (const off of [0, 1]) {
        const h = downsample(obs, 2, off);
        segmentEvents(h, buildScene(h));
      }
    });
    rows.push([id, obs.body.length, obs.media.fps, tAnalyze.toFixed(1), tResult.toFixed(1), tScene.toFixed(1), tEvents.toFixed(1), tHalves.toFixed(1), (tResult / tAnalyze).toFixed(2)].join("\t"));
    const r = buildResult(payload, obs);
    notes.push(`${id}: ${payload.analysis_status}/${payload.status_reason} · ` + r.events.map((e) => (e.frame === null ? `${e.label} missing` : `${e.label} ${e.state} ±${e.uncertainty!.ms} ms${e.stable === false ? ` (moved ${Math.round((e.uncertainty!.parts.stability ?? 0) * (1000 / (obs.media.fps ?? 30)))} ms)` : ""}`)).join(", "));
  }
  const text = [...rows, "", "markers and their stated uncertainty", ...notes].join("\n") + "\n";
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, text);
  else console.log(text);
});
