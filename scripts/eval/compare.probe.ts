// Did a change move any result? For every case exported in both BEFORE and AFTER (dirs of
// <id>.tracks.b64 from scripts/eval/run.mjs): the tracked frames compared value by value, then
// the verdict and every graded measure.
//   BEFORE=<dir> AFTER=<dir> npx vitest run --config scripts/eval/vitest.config.ts compare
import { it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { decodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";

const BEFORE = process.env.BEFORE ?? "";
const AFTER = process.env.AFTER ?? "";

const load = async (dir: string, id: string) => decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`${dir}/${id}.tracks.b64`, "utf8"), "base64")));

it("compare exported tracks before and after", async () => {
  if (!existsSync(BEFORE) || !existsSync(AFTER)) return;
  const ids = readdirSync(BEFORE)
    .filter((f) => f.endsWith(".tracks.b64"))
    .map((f) => f.replace(".tracks.b64", ""))
    .sort();
  let same = 0;
  for (const id of ids) {
    if (!existsSync(`${AFTER}/${id}.tracks.b64`)) {
      console.log(`${id}: missing after`);
      continue;
    }
    const [a, b] = await Promise.all([load(BEFORE, id), load(AFTER, id)]);
    const frames = JSON.stringify([a.t, a.body, a.camera, a.media.fps, a.athlete.handedness]) === JSON.stringify([b.t, b.body, b.camera, b.media.fps, b.athlete.handedness]);
    let maxDiff = 0;
    if (!frames && a.body.length === b.body.length)
      a.body.forEach((fr, i) => fr.forEach((p, j) => {
        const q = b.body[i]?.[j];
        if (p && q) maxDiff = Math.max(maxDiff, Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
      }));
    const pa = analyze(a, { analysisId: id, createdAt: "2026-01-01T00:00:00.000Z" });
    const pb = analyze(b, { analysisId: id, createdAt: "2026-01-01T00:00:00.000Z" });
    const ma = Object.fromEntries(pa.metrics.map((m) => [m.id, m.value]));
    const mb = Object.fromEntries(pb.metrics.map((m) => [m.id, m.value]));
    const moved = Object.keys({ ...ma, ...mb }).filter((k) => ma[k] !== mb[k]);
    const verdict = pa.analysis_status === pb.analysis_status && pa.headline === pb.headline;
    if (frames && verdict && !moved.length) same++;
    console.log(
      `${id.padEnd(7)} frames ${frames ? "identical" : `differ (n ${a.body.length}→${b.body.length}, max ${maxDiff.toFixed(4)})`} · verdict ${verdict ? "same" : `${pa.analysis_status} → ${pb.analysis_status}`} · measures ${moved.length ? `moved: ${moved.map((k) => `${k} ${ma[k]}→${mb[k]}`).join(", ")}` : "same"}`,
    );
  }
  console.log(`\n${same} of ${ids.length} identical`);
});
