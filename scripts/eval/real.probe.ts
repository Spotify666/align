// The engine against the labelled real clips: per clip, per slice and leave one athlete out.
//   NAME=before REPORT_OUT=eval-media/reports/before.json npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/real.probe.ts
// Reads scripts/eval/dataset/manifest.json (DATASET) and the tracks exported by run.mjs
// (TRACKS, default eval-media/tracks). DETECTOR names a candidate from src/engine/eval/detectors.ts.
// Compare two reports with scripts/eval/compare-reports.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { it } from "vitest";
import { manifestSchema } from "@/engine/eval/dataset";
import { DETECTORS } from "@/engine/eval/detectors";
import { evaluate } from "@/engine/eval/real";
import { decodeTracks } from "@/engine/tracks-codec";
import type { CaptureObservation } from "@/engine/types";

it("real-media evaluation", async () => {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(process.env.DATASET ?? "scripts/eval/dataset/manifest.json", "utf8")));
  const dir = process.env.TRACKS ?? "eval-media/tracks";
  const detectorName = process.env.DETECTOR ?? "current";
  if (!(detectorName in DETECTORS)) throw new Error(`Unknown detector "${detectorName}". Known: ${Object.keys(DETECTORS).join(", ")}`);
  const items: Array<{ clip: (typeof manifest.clips)[number]; obs: CaptureObservation }> = [];
  const skipped: string[] = [];
  for (const clip of manifest.clips) {
    const file = `${dir}/${clip.id}.tracks.b64`;
    if (!existsSync(file)) {
      skipped.push(clip.id);
      continue;
    }
    items.push({ clip, obs: await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(file, "utf8"), "base64"))) });
  }
  const report = evaluate(items, { name: process.env.NAME ?? detectorName, datasetVersion: manifest.version, detector: DETECTORS[detectorName as keyof typeof DETECTORS], detectorName, skipped });
  const out = process.env.REPORT_OUT ?? `eval-media/reports/${report.name}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1));
  const o = report.overall;
  const ev = (k: keyof typeof o.events) => `${k} ${o.events[k].medianAbsMs ?? "n/a"} ms (n ${o.events[k].n}, inside its band ${o.events[k].coverage === null ? "n/a" : Math.round(o.events[k].coverage! * 100) + "%"})`;
  console.log(
    [
      `Dataset ${manifest.version}: ${items.length} clips with tracks, ${report.dataset.athletes} athletes${skipped.length ? `, ${skipped.length} without exported tracks` : ""}.`,
      items.length ? `Right ${o.right}/${o.clips}; false accepts ${o.falseAccepts}; false abstentions ${o.falseAbstains}; ${ev("contact")}; ${ev("front_foot_plant")}; ${ev("trigger")}.` : "No clips to evaluate yet: see scripts/eval/dataset/README.md.",
      `Report: ${out}`,
    ].join("\n"),
  );
});
