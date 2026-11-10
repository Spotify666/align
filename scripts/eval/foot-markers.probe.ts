// Old against new foot markers (Trigger, Back foot). Plant was tried the same way and not adopted:
// no better here, and less stable on the real tracks read at 15 fps. Truth: the same generated movement
// with no tracker noise at 240 fps, read by the old rule (on clean data both rules mean the same
// moment). Then each rule on the noisy clip at its own frame rate: error against that truth, and
// how far the marker moves when the clip is read at half its frame rate. The three real tracks in
// tests/assets/real have no truth: stability only.
//   FOOT_OUT=<file> npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/foot-markers.probe.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { evalCases } from "@/engine/eval/suite";
import { downsample } from "@/engine/eval/transforms";
import { segmentEvents, steadyFootMarkers } from "@/engine/events";
import { generate } from "@/engine/fixtures/generate";
import { buildScene } from "@/engine/scene";
import { decodeTracks } from "@/engine/tracks-codec";
import type { CaptureObservation, EventType } from "@/engine/types";

const MARKERS: EventType[] = ["trigger", "back_foot_commit"];
const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : NaN);
const both = (obs: CaptureObservation) => {
  const scene = buildScene(obs);
  const old = segmentEvents(obs, scene);
  return { old: old.byType, steady: steadyFootMarkers(scene, old).byType, t: obs.t };
};

export function footMarkerReport(real: Array<[string, CaptureObservation]>) {
  const err: Record<string, number[]> = {};
  const stab: Record<string, number[]> = {};
  const add = (m: Record<string, number[]>, k: string, v: number) => (m[k] ??= []).push(v);
  for (const c of evalCases()) {
    const truth = both(generate({ ...c.options, fps: 240, noise: 0, handNoise: 0 }));
    const here = both(c.obs);
    const half = c.fps >= 60 ? both(downsample(c.obs, 2)) : null;
    for (const m of MARKERS) {
      const t = truth.old[m];
      for (const rule of ["old", "steady"] as const) {
        const e = here[rule][m];
        if (t && e) {
          add(err, `${m} · ${rule} · all`, Math.abs(e.tMs - t.tMs));
          add(err, `${m} · ${rule} · ${c.fps} fps`, Math.abs(e.tMs - t.tMs));
        }
        const h = half?.[rule][m];
        if (e && h) add(stab, `${m} · ${rule}`, Math.abs(h.tMs - e.tMs));
      }
    }
  }
  const lines = ["marker · rule · slice\tn\tmedian error ms\t90th percentile ms"];
  for (const k of Object.keys(err).sort()) lines.push(`${k}\t${err[k]!.length}\t${q(err[k]!, 0.5)}\t${q(err[k]!, 0.9)}`);
  lines.push("", "moves by, read at half the frame rate (generated, 60 fps and up)\tn\tmedian ms\t90th percentile ms");
  for (const k of Object.keys(stab).sort()) lines.push(`${k}\t${stab[k]!.length}\t${q(stab[k]!, 0.5)}\t${q(stab[k]!, 0.9)}`);
  lines.push("", "real tracks (no truth): marker time, and how far it moves at half the frame rate");
  for (const [id, obs] of real) {
    const here = both(obs);
    const half = both(downsample(obs, 2));
    lines.push(`${id} (${obs.body.length} frames, ${obs.media.fps} fps)\t` + MARKERS.flatMap((m) => (["old", "steady"] as const).map((rule) => { const e = here[rule][m]; const h = half[rule][m]; return e ? `${m} ${rule} ${e.tMs} ms (moves ${h ? Math.abs(h.tMs - e.tMs) : "lost"})` : `${m} ${rule} none`; })).join("; "));
  }
  return { text: lines.join("\n") + "\n", err, stab };
}

it("foot markers: old against steady", async () => {
  const real: Array<[string, CaptureObservation]> = [];
  for (const f of readdirSync("tests/assets/real").filter((x) => x.endsWith(".b64"))) real.push([f, await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${f}`, "utf8"), "base64")))]);
  const { text } = footMarkerReport(real);
  if (process.env.FOOT_OUT) writeFileSync(process.env.FOOT_OUT, text);
  else console.log(text);
});
