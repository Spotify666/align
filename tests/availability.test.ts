// The availability matrix (`availability.ts`) against what the analysis really does: it never
// says a set-up can't give a measure the analysis took from that set-up, and a measure it says
// can't be given is never taken. Fixtures asked as both defences, the population, the real tracks.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { askedAs } from "@/engine/identify";
import { FIXTURE_SPECS, fixture } from "@/engine/fixtures";
import { population } from "@/engine/fixtures/population";
import { decodeTracks } from "@/engine/tracks-codec";
import { availability, SETUPS, type CaptureConditions } from "@/engine/availability";
import type { AnalysisPayload, CaptureObservation } from "@/engine/types";

const opts = { analysisId: "a", createdAt: "2026-10-01T00:00:00.000Z" };

const conditionsOf = (obs: CaptureObservation): CaptureConditions => ({
  media: obs.media.kind,
  view: obs.camera.view,
  bat: obs.bat.source !== "none",
  ball: obs.ball.source !== "none",
  fps: obs.media.fps ?? 30,
  scale: !!obs.calibration.metresPerUnit || !!obs.athlete.heightCm,
  depth: !!obs.body3d,
});

let checked = 0;
function agree(label: string, obs: CaptureObservation, p: AnalysisPayload) {
  const table = availability(p.requested_shot ?? "front_foot_defence", conditionsOf(obs));
  for (const m of [...p.metrics, ...(p.observations ?? [])]) {
    const a = table.find((x) => x.id === m.id);
    expect(a, `${label}: ${m.id} is in the table`).toBeTruthy();
    if (m.status !== "not_measured") {
      expect(a!.state, `${label}: ${m.id} was measured (${m.status}), table says ${a!.why}`).not.toBe("not_available");
      checked++;
    }
  }
}

describe("which measures a set-up can give", () => {
  it("agrees with the analysis on fixtures, the population and the real tracks", { timeout: 180000 }, async () => {
    for (const s of FIXTURE_SPECS) {
      const obs = fixture(s.key);
      for (const t of ["front_foot_defence", "back_foot_defence"] as const) agree(`${s.key}/${t}`, obs, analyze(askedAs(obs, t), opts));
    }
    for (const c of population(60, 5)) agree(c.obs.id, c.obs, analyze(c.obs, opts));
    for (const f of readdirSync("tests/assets/real").filter((n) => n.endsWith(".b64"))) {
      const obs = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${f}`, "utf8"), "base64")));
      for (const t of ["front_foot_defence", "back_foot_defence"] as const) agree(`${f}/${t}`, obs, analyze(askedAs(obs, t), opts));
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("gives every measure once per set-up, with a reason whenever it isn't graded", () => {
    for (const shot of ["front_foot_defence", "back_foot_defence"] as const)
      for (const s of SETUPS) {
        const t = availability(shot, s.conditions);
        expect(new Set(t.map((a) => a.id)).size).toBe(t.length);
        for (const a of t) if (a.state !== "graded") expect(a.why, `${shot} ${s.id} ${a.id}`).toBeTruthy();
      }
  });

  it("says what is plainly true of each set-up", () => {
    const at = (shot: "front_foot_defence" | "back_foot_defence", setup: string, id: string) => availability(shot, SETUPS.find((s) => s.id === setup)!.conditions).find((a) => a.id === id)!.state;
    expect(at("front_foot_defence", "side_body", "line_head")).toBe("graded");
    expect(at("front_foot_defence", "side_body", "bat_angle_contact")).toBe("not_available");
    expect(at("front_foot_defence", "side_full", "bat_angle_contact")).toBe("graded");
    expect(at("front_foot_defence", "end_body", "stride_length")).toBe("not_available");
    expect(at("front_foot_defence", "side_photo", "line_held")).toBe("not_available");
    expect(at("back_foot_defence", "end_body", "bfd_back_step")).toBe("not_available");
    expect(at("back_foot_defence", "side_body", "bfd_back_step")).toBe("graded");
  });
});
