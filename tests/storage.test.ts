import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { decodeTracks, encodeTracks, quantise } from "@/engine/tracks-codec";

const opts = { analysisId: "s", createdAt: "2026-10-01T00:00:00.000Z" };

describe("align-tracks-v1 storage", () => {
  it("is compact: a 2 s, 120 fps delivery stays well under 64 KB", async () => {
    const obs = fixture("valid_ffd");
    const gz = await encodeTracks(obs);
    const json = new TextEncoder().encode(JSON.stringify(obs)).length;
    expect(gz.length).toBeLessThan(64 * 1024);
    expect(gz.length * 8).toBeLessThan(json);
  });

  it("round-trips to an observation that reproduces the same analysis", async () => {
    const q = quantise(fixture("valid_ffd"));
    const back = await decodeTracks(await encodeTracks(q));
    const a = analyze(q, opts);
    const b = analyze(back, opts);
    expect(b.input_hash).toBe(a.input_hash);
    expect(b.result_hash).toBe(a.result_hash);
  });

  it("preserves missing points and 3D tracks", async () => {
    for (const key of ["no_ball", "session3d", "photo"]) {
      const q = quantise(fixture(key));
      const back = await decodeTracks(await encodeTracks(q));
      expect(back.ball.points.filter(Boolean).length).toBe(q.ball.points.filter(Boolean).length);
      expect(!!back.body3d).toBe(!!q.body3d);
      expect(analyze(back, opts).analysis_status).toBe(analyze(fixture(key), opts).analysis_status);
    }
  });
});
