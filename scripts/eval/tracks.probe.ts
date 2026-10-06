// For every <id>.tracks.b64 in PROBE_DIR (comma-separated dirs allowed): the verdict, the graded
// measures, the line and when each part arrived; and <id>.obs.json for overlay.mjs.
import { it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";

const DIRS = (process.env.PROBE_DIR ?? "").split(",").filter(Boolean);
const f3 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "  -  " : x.toFixed(3));

it("probe exported tracks", async () => {
  for (const dir of DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".tracks.b64")).sort()) {
      const id = f.replace(".tracks.b64", "");
      const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`${dir}/${f}`, "utf8"), "base64")));
      const p = analyze(obs, { analysisId: id, createdAt: "2026-01-01T00:00:00.000Z" });
      const l = p.line;
      console.log(
        `\n== ${id} ${obs.media.kind} ${obs.camera.view} ${obs.media.width}x${obs.media.height} n=${obs.body.length} fps=${obs.media.fps ?? "-"} :: ${p.analysis_status}/${p.status_reason} :: ${p.headline}`,
      );
      if (l)
        console.log(
          `   line (${l.axis}, ${l.referenceKind} @${l.referenceFrame}): head ${f3(l.atReference.head)} shoulder ${f3(l.atReference.shoulder)} knee ${f3(l.atReference.knee)} | held ${f3(l.held)} | spread ${l.spreadMs ?? "-"} ms | arrivals ${l.arrivals ? Object.entries(l.arrivals).map(([k, v]) => `${k} ${v.still ? "still" : (v.ms ?? "-")}`).join(", ") : "-"}`,
        );
      for (const m of p.metrics.filter((x) => x.status !== "not_measured")) console.log(`   ${m.id.padEnd(24)} ${String(m.value).padStart(8)} ${m.inRange === null ? "·" : m.inRange ? "✓" : "✗"}`);
      writeFileSync(`${dir}/${id}.obs.json`, JSON.stringify({ media: obs.media, camera: obs.camera, athlete: obs.athlete, t: obs.t, body: obs.body, events: p.events }));
    }
  }
});
