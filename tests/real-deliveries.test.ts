// Regression on real footage: pose tracks (no imagery) of a public 44-second net-session
// clip of one batter playing about fifteen forward defences, filmed from the bowler's end
// on a phone a few metres away, with the bottom hand often hidden behind the bat. Each
// delivery is analysed on its own, as the app does. A sanity check, not a target: nothing
// is tuned to this clip, and the assertions are about safety, not about how many pass.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";
import { J, type CaptureObservation } from "@/engine/types";
import { strokeSegment } from "@/lib/capture/segments";

const opts = { analysisId: "d", createdAt: "2026-10-02T00:00:00.000Z" };

/** Windows like the app's: where the head drops well below its level in the previous 2 s. */
function deliveries(obs: CaptureObservation, windowSec = 3.4) {
  const fps = obs.media.fps!;
  const n = obs.body.length;
  const nose = obs.body.map((b) => (b[J.nose] && b[J.nose]![2] > 0.5 ? b[J.nose]![1] : NaN));
  const hs = obs.body
    .map((b) => {
      const ys = b.filter((p) => p && p[2] > 0.5).map((p) => p![1]);
      return ys.length > 8 ? Math.max(...ys) - Math.min(...ys) : NaN;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const H = hs[Math.floor(hs.length * 0.8)]!;
  const drop = nose.map((y, i) => {
    let top = Infinity;
    for (let k = Math.max(0, i - 2 * fps); k <= i; k++) if (Number.isFinite(nose[k]!)) top = Math.min(top, nose[k]!);
    return Number.isFinite(y) ? (y - top) / H : NaN;
  });
  const peaks = drop.map((d, i) => i).filter((i) => drop[i]! >= 0.2 && !(drop[i - 1]! > drop[i]!) && !(drop[i + 1]! > drop[i]!));
  peaks.sort((a, b) => drop[b]! - drop[a]!);
  const chosen: number[] = [];
  for (const p of peaks) if (chosen.every((c) => Math.abs(c - p) >= 2 * fps)) chosen.push(p);
  const W = Math.round(windowSec * fps);
  return chosen.sort((a, b) => a - b).map((p) => {
    const s = Math.max(0, Math.min(n - W, p - Math.round(0.6 * W)));
    const [a, b] = strokeSegment(obs.body.slice(s, s + W), obs.media.width / obs.media.height, p - s, fps);
    const lo = s + a;
    const hi = s + b;
    const t0 = obs.t[lo]!;
    const sub: CaptureObservation = {
      ...obs,
      id: `${obs.id}_${p}`,
      media: { ...obs.media, frameCount: hi - lo, durationMs: ((hi - lo) / fps) * 1000 },
      quality: { ...obs.quality, frames: obs.quality.frames.filter((q) => q.frame >= lo && q.frame < hi).map((q) => ({ ...q, frame: q.frame - lo })) },
      t: obs.t.slice(lo, hi).map((t) => t - t0),
      body: obs.body.slice(lo, hi),
      ...(obs.vizDepth ? { vizDepth: obs.vizDepth.slice(lo, hi) } : {}),
      ...(obs.poseWorld ? { poseWorld: obs.poseWorld.slice(lo, hi) } : {}),
      bat: { ...obs.bat, handle: obs.bat.handle.slice(lo, hi), toe: obs.bat.toe.slice(lo, hi) },
      ball: { ...obs.ball, points: obs.ball.points.slice(lo, hi) },
    };
    return { at: p / fps, obs: sub };
  });
}

describe("real net session: every delivery on its own", () => {
  it("never calls a real defence a different shot, and grades only what the view can see", async () => {
    const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync("tests/assets/real/yt_full.b64", "utf8"), "base64")));
    const ds = deliveries(obs);
    expect(ds.length).toBeGreaterThanOrEqual(10);
    let valid = 0;
    for (const d of ds) {
      const p = analyze(d.obs, opts);
      expect(p.analysis_status, `delivery at ${d.at.toFixed(1)} s`).not.toBe("invalid_for_requested_analysis");
      if (p.analysis_status === "valid") {
        valid++;
        expect(p.evidence_basis).toBe("body");
      }
    }
    // Recorded for the docs, not asserted beyond "some": 8 of 14 confirmed at engine 0.4.1;
    // the rest are honestly uncertain (defence vs push, or the batter hidden at contact).
    expect(valid).toBeGreaterThan(0);
  });
});
