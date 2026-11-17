import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { bfdScript, ffdScript, pullScript } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import {
  BONES, FEATURES, HANDLES, MODEL_JOINTS, MOMENTS, POSE_MODEL_SCHEMA, STRICTNESS,
  checkAgainstModel, chestOf, clipInPlane, distance, dragHandle, handlePoint, measuresOf, modelFromText, modelLines, modelToText,
  pelvisOf, poseInPlane, segments, withSegments, type Pose, type PoseModel, type V3,
} from "@/engine/pose-model";
import { buildScene, semanticToJoint } from "@/engine/scene";
import { decodeTracks } from "@/engine/tracks-codec";
import { J, type CaptureObservation, type Handedness, type TargetShot } from "@/engine/types";
import { asPose, computeStarters } from "@/lib/pose-starters";
import stored from "@/lib/pose-starters.json";

// A person's own model of a shot (src/engine/pose-model.ts): the geometry of placing joints,
// reading the model and a clip the same way, applying it only where it is fair to, and its text.

const H = 1.75;
const starters = stored as unknown as Record<TargetShot, Record<string, Record<string, [number, number, number]>>>;
const pose = (shot: TargetShot, moment = "contact") => asPose(starters[shot][moment]!);
const model = (o: Partial<PoseModel> = {}): PoseModel => ({
  schema: POSE_MODEL_SCHEMA, id: "m1", name: "Test", shot: "front_foot_defence", battingSide: "right", angles: "both", heightCm: 175,
  moments: { contact: pose("front_foot_defence"), backlift: pose("front_foot_defence", "backlift"), foot_down: pose("front_foot_defence", "foot_down") },
  tolerance: { angleDeg: 12, offset: 0.06 }, note: "", createdAt: "x", updatedAt: "x", ...o,
});
const clip = (o: { shot?: TargetShot; view?: "side_on" | "front_on" | "behind"; handedness?: Handedness; script?: ReturnType<typeof ffdScript>; noise?: number } = {}) => {
  const shot = o.shot ?? "front_foot_defence";
  const made = generate({
    id: "c", label: "c", seed: 5, fps: 120, durationS: 2, statureM: H, handedness: o.handedness ?? "right", view: o.view,
    script: o.script ?? (shot === "front_foot_defence" ? ffdScript() : bfdScript()), include3d: true, noise: o.noise ?? 0,
  });
  const obs: CaptureObservation = shot === "back_foot_defence" ? { ...made, target: shot } : made;
  return { obs, payload: analyze(obs, { analysisId: "c", createdAt: "2026-11-16T00:00:00.000Z" }) };
};
const lengths = (p: Pose) => [
  ...BONES.map(([a, b]) => distance(p[a], p[b])),
  distance(pelvisOf(p), chestOf(p)),
  distance(chestOf(p), p.head),
];

describe("starting poses", () => {
  it("match the generator and the engine (else run: node scripts/pose-starters.mjs > src/lib/pose-starters.json)", () => {
    expect(JSON.parse(JSON.stringify(computeStarters()))).toEqual(stored);
  });
  it("stand on the ground with every joint placed", () => {
    for (const shot of ["front_foot_defence", "back_foot_defence"] as const) {
      for (const m of MOMENTS) {
        const p = pose(shot, m.id);
        for (const k of MODEL_JOINTS) expect(p[k].every(Number.isFinite), `${shot} ${m.id} ${k}`).toBe(true);
        expect(Math.min(p.front_heel[1], p.front_foot[1], p.back_heel[1], p.back_foot[1])).toBeLessThan(0.08);
        expect(p.head[1]).toBeGreaterThan(0.7);
      }
    }
  });
});

describe("placing joints", () => {
  const targets: V3[] = [[0.3, 0.2, 0.1], [-0.4, 0.9, -0.2], [0.05, 0.5, 0.3], [2, 2, 2], [0, -1, 0]];
  it("no bone ever changes length, whichever joint is dragged, wherever", () => {
    for (const shot of ["front_foot_defence", "back_foot_defence"] as const) {
      let p = pose(shot);
      const before = lengths(p);
      for (let round = 0; round < 3; round++) {
        for (const h of HANDLES) {
          for (const t of targets) {
            p = dragHandle(p, h, [handlePoint(p, h)[0] + t[0] * 0.3, handlePoint(p, h)[1] + t[1] * 0.3, handlePoint(p, h)[2] + t[2] * 0.3]);
            const now = lengths(p);
            now.forEach((l, i) => expect(l, `${shot} ${h} bone ${i}`).toBeCloseTo(before[i]!, 6));
            for (const k of MODEL_JOINTS) expect(p[k].every(Number.isFinite), `${h} ${k}`).toBe(true);
          }
        }
      }
    }
  });
  it("a hand or an ankle goes where it is put when it can reach, and the feet stay planted when the hips move", () => {
    const p = pose("front_foot_defence");
    const t: V3 = [p.front_wrist[0] + 0.05, p.front_wrist[1] - 0.04, p.front_wrist[2] + 0.03];
    const q = dragHandle(p, "front_wrist", t);
    expect(distance(q.front_wrist, t)).toBeLessThan(1e-6);
    expect(distance(q.front_shoulder, p.front_shoulder)).toBe(0);
    const r = dragHandle(p, "pelvis", [pelvisOf(p)[0] + 0.03, pelvisOf(p)[1] - 0.05, pelvisOf(p)[2]]);
    expect(distance(r.front_ankle, p.front_ankle)).toBeLessThan(1e-6);
    expect(distance(r.back_ankle, p.back_ankle)).toBeLessThan(1e-6);
    expect(distance(r.head, p.head)).toBeGreaterThan(0.05);
  });
  it("takes a batter's own limb lengths without changing the pose's directions", () => {
    const p = pose("front_foot_defence");
    const q = withSegments(p, { upperArm: 0.2, forearm: 0.16, thigh: 0.26 });
    const s = segments(q);
    expect(s.upperArm).toBeCloseTo(0.2, 6);
    expect(s.forearm).toBeCloseTo(0.16, 6);
    expect(s.thigh).toBeCloseTo(0.26, 6);
    expect(s.trunk).toBeCloseTo(segments(p).trunk, 6);
    // The measures that are angles do not change with length.
    const a = measuresOf(p, "side").find((m) => m.id === "front_knee_bend")!.value!;
    const b = measuresOf(q, "side").find((m) => m.id === "front_knee_bend")!.value!;
    expect(b).toBeCloseTo(a, 6);
  });
});

describe("the clip is read the way the model is", () => {
  // The generator knows where every joint truly was (body3d). Reading the tracked picture must
  // give the measures that the true pose gives, from every camera position and for both hands.
  for (const view of ["side_on", "front_on", "behind"] as const) {
    for (const handedness of ["right", "left"] as const) {
      it(`${view}, ${handedness}-handed`, () => {
        const { obs, payload } = clip({ view, handedness });
        const frame = payload.events.find((e) => e.type === "contact")!.frame;
        const front = handedness === "right" ? "left" : "right";
        const truth = {} as Pose;
        for (const k of MODEL_JOINTS) {
          const w = obs.body3d![frame]![J[semanticToJoint(k, front)]]!;
          truth[k] = [w[0] / H, w[1] / H, w[2] / H];
        }
        const plane = view === "side_on" ? "side" : "front";
        const mine = clipInPlane(buildScene(obs), obs, frame);
        let n = 0;
        for (const f of FEATURES.filter((x) => x.plane === plane)) {
          const want = f.compute(poseInPlane(truth, plane));
          const got = f.compute(mine);
          if (want === null || got === null) continue;
          n++;
          // A phone's lens is not a flat projection: allow a few degrees and a few hundredths of a height.
          expect(Math.abs(got - want), `${f.id}: ${got} vs ${want}`).toBeLessThan(f.unit === "deg" ? 7 : 0.05);
        }
        expect(n).toBeGreaterThanOrEqual(6);
      });
    }
  }
});

describe("applying a model", () => {
  it("the textbook clip matches the textbook model", () => {
    const { obs, payload } = clip();
    expect(payload.analysis_status).toBe("valid");
    const c = checkAgainstModel(model(), obs, payload);
    expect(c.applied).toBe(true);
    expect(c.plane).toBe("side");
    expect(c.moments.map((m) => m.id)).toContain("contact");
    expect(c.compared).toBeGreaterThanOrEqual(10);
    expect(c.matched / c.compared).toBeGreaterThan(0.9);
  });
  it("a changed model reads as a difference, in words, with no minus sign", () => {
    const { obs, payload } = clip();
    const p = pose("front_foot_defence");
    const straighter = dragHandle(p, "pelvis", [pelvisOf(p)[0] - 0.12, pelvisOf(p)[1] + 0.06, pelvisOf(p)[2]]);
    const m = model({ moments: { contact: straighter } });
    const c = checkAgainstModel(m, obs, payload);
    expect(c.applied).toBe(true);
    expect(c.matched).toBeLessThan(c.compared);
    const lines = modelLines(c, m, true);
    expect(lines[0]!.text).toMatch(/of \d+ checks match your model/);
    expect(lines.some((l) => l.kind === "fix")).toBe(true);
    for (const l of [...lines, ...modelLines(c, m, false)]) expect(l.text).not.toMatch(/-\d|−/);
    for (const l of modelLines(c, m, false).filter((x) => x.kind === "fix")) expect(l.text).not.toMatch(/\d/);
  });
  it("is never applied to another shot, an unconfirmed clip, the other batting side, or a camera position it wasn't placed from", () => {
    const pull = clip({ script: pullScript() });
    expect(pull.payload.analysis_status).not.toBe("valid");
    expect(checkAgainstModel(model(), pull.obs, pull.payload).applied).toBe(false);

    const bfd = clip({ shot: "back_foot_defence" });
    const other = checkAgainstModel(model(), bfd.obs, bfd.payload);
    expect(other.applied).toBe(false);
    expect(other.reason).toBe("other_shot");

    const left = clip({ handedness: "left" });
    const side = checkAgainstModel(model(), left.obs, left.payload);
    expect(side.applied).toBe(false);
    expect(side.reason).toBe("other_side");
    expect(checkAgainstModel(model({ battingSide: "left" }), left.obs, left.payload).applied).toBe(true);

    const front = clip({ view: "front_on" });
    if (front.payload.analysis_status === "valid") {
      const cam = checkAgainstModel(model({ angles: "side" }), front.obs, front.payload);
      expect(cam.applied).toBe(false);
      expect(cam.reason).toBe("camera");
      expect(checkAgainstModel(model({ angles: "both" }), front.obs, front.payload).plane).toBe("front");
    }
    for (const c of [other, side]) expect(c.says).toBeTruthy();
  });
  it("changes nothing in Aline's own result", () => {
    const { obs, payload } = clip();
    const before = JSON.stringify(payload);
    const tracks = JSON.stringify(obs.body);
    checkAgainstModel(model(), obs, payload);
    expect(JSON.stringify(payload)).toBe(before);
    expect(JSON.stringify(obs.body)).toBe(tracks);
  });
  it("on real tracks: applied only to a confirmed shot, and always says why when it isn't", async () => {
    for (const f of readdirSync("tests/assets/real").filter((x) => x.endsWith(".b64"))) {
      const base = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`tests/assets/real/${f}`, "utf8"), "base64")));
      for (const shot of ["front_foot_defence", "back_foot_defence"] as const) {
        const { target: _t, ...rest } = base;
        void _t;
        const obs: CaptureObservation = shot === "back_foot_defence" ? { ...rest, target: shot } : rest;
        const payload = analyze(obs, { analysisId: "real", createdAt: "2026-11-16T00:00:00.000Z" });
        const before = JSON.stringify(payload);
        const m = model({ shot, battingSide: obs.athlete.handedness, moments: { contact: pose(shot), backlift: pose(shot, "backlift"), foot_down: pose(shot, "foot_down") } });
        const c = checkAgainstModel(m, obs, payload);
        if (payload.analysis_status !== "valid") expect(c.applied, `${f} as ${shot}`).toBe(false);
        if (c.applied) {
          expect(c.compared).toBeGreaterThan(0);
          for (const mo of c.moments) for (const r of mo.rows) expect(r.yours === null || Number.isFinite(r.yours), `${f} ${r.id}`).toBe(true);
        } else expect(c.says, `${f} as ${shot}`).toBeTruthy();
        for (const l of modelLines(c, m, true)) expect(l.text).not.toMatch(/-\d|−|NaN|undefined/);
        expect(JSON.stringify(payload)).toBe(before);
      }
    }
  });
  it("is read by no part of the analysis", () => {
    const dir = join(__dirname, "../src/engine");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && x !== "pose-model.ts")) {
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/pose-model/);
    }
  });
});

describe("as text", () => {
  const fill = (shot: TargetShot, moment: string) => pose(shot, moment);
  it("goes out and comes back the same", () => {
    const m = model({ name: "Coach's forward defence", note: "Head over the ball.", tolerance: { angleDeg: 9, offset: 0.05 } });
    const text = modelToText(m);
    const back = modelFromText(text, fill);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.model.name).toBe(m.name);
    expect(back.model.tolerance).toEqual(m.tolerance);
    expect(Object.keys(back.model.moments).sort()).toEqual(["backlift", "contact", "foot_down"]);
    for (const k of MODEL_JOINTS) back.model.moments.contact[k].forEach((v, i) => expect(v).toBeCloseTo(m.moments.contact[k][i]!, 4));
    // Says its units and gives lengths in centimetres when the height is known.
    const o = JSON.parse(text);
    expect(o.units).toMatch(/body heights/);
    expect(o.segments.thigh.cm).toBeGreaterThan(30);
    expect(o.moments.contact.measures.front_knee_bend.unit).toBe("degrees");
  });
  it("a single-angle model writes the axis it didn't place as null, and reads back", () => {
    const text = modelToText(model({ angles: "side" }));
    const o = JSON.parse(text);
    expect(o.moments.contact.joints.head.across).toBeNull();
    expect(o.moments.contact.joints.head.forward).not.toBeNull();
    expect(Object.keys(o.moments.contact.measures).every((id) => FEATURES.find((f) => f.id === id)!.plane === "side")).toBe(true);
    const back = modelFromText(text, fill);
    expect(back.ok && back.model.angles).toBe("side");
  });
  it("says what is wrong with text it can't read", () => {
    expect(modelFromText("not json", fill)).toMatchObject({ ok: false });
    expect(modelFromText("{}", fill)).toMatchObject({ ok: false });
    const o = JSON.parse(modelToText(model()));
    delete o.moments.contact.joints.front_knee;
    const r = modelFromText(JSON.stringify(o), fill);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/front_knee/);
    const bad = JSON.parse(modelToText(model()));
    bad.moments.contact.joints.head.up = "tall";
    expect(modelFromText(JSON.stringify(bad), fill).ok).toBe(false);
  });
  it("has a tolerance for every strictness, and none of them is an engine threshold", () => {
    for (const s of STRICTNESS) expect(s.angleDeg > 0 && s.offset > 0).toBe(true);
    expect(readFileSync(join(__dirname, "../src/engine/registry.ts"), "utf8")).not.toMatch(/pose-model|model_check/);
  });
});

describe("deleting a model asks for the passcode", () => {
  it("accepts only 1000", async () => {
    const { passcodeOk, DELETE_PASSCODE } = await import("@/lib/pose-models");
    expect(DELETE_PASSCODE).toBe("1000");
    expect(passcodeOk("1000")).toBe(true);
    expect(passcodeOk(" 1000 ")).toBe(true);
    for (const wrong of ["", "100", "10000", "0000", "abcd"]) expect(passcodeOk(wrong)).toBe(false);
  });
});
