// Engine-only regression check: for every <id>.tracks.b64 in PROBE_DIR (comma-separated), the
// analysis as one canonical line per case (verdict, measures, line, plan, photo check), without
// the version and hash fields that change with every release. Run on two builds and diff:
//   PROBE_DIR=<dirs> OUT=<file> npx vitest run --config scripts/eval/vitest.config.ts verdicts
// TARGET=back_foot_defence analyses every case as a back-foot defence instead.
import { it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";

const DIRS = (process.env.PROBE_DIR ?? "").split(",").filter(Boolean);

it("verdicts of exported tracks", async () => {
  const lines: string[] = [];
  for (const dir of DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".tracks.b64")).sort()) {
      const id = `${dir.split("/").pop()}/${f.replace(".tracks.b64", "")}`;
      const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`${dir}/${f}`, "utf8"), "base64")));
      const input = process.env.TARGET ? { ...obs, target: process.env.TARGET } : obs;
      const p = analyze(input as typeof obs, { analysisId: id, createdAt: "2026-01-01T00:00:00.000Z" });
      const metrics = p.metrics.map((m) => [m.id, m.status, m.value, m.inRange, m.range ? [m.range.lo, m.range.hi] : null]);
      const obsv = (p.observations ?? []).map((m) => [m.id, m.value]);
      lines.push(
        JSON.stringify({ id, status: p.analysis_status, reason: p.status_reason, headline: p.headline, shot: p.observed_shot?.label ?? null, metrics, observations: obsv, line: p.line ?? null, back_foot: p.back_foot ?? null, plan: p.plan?.priority.metricId ?? null, check: p.position_check ?? null, events: p.events.map((e) => [e.type, e.frame]) }),
      );
    }
  }
  writeFileSync(process.env.OUT ?? "verdicts.jsonl", lines.join("\n") + "\n");
  console.log(`${lines.length} cases`);
});
