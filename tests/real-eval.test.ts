// The real-media evaluation machinery: the manifest schema, scoring against labels, slices,
// leave-one-athlete-out and the before/after gate. The "clips" here are generated movement with
// labels taken from the engine's own events: this tests the arithmetic and the rules, and says
// nothing about accuracy. Real clips are evaluated with scripts/eval/real.probe.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { clipSchema, LABEL_EVENTS, manifestSchema, sourceMs, type DatasetClip } from "@/engine/eval/dataset";
import { compareReports, evaluate, type Detector } from "@/engine/eval/real";
import { evalCases } from "@/engine/eval/suite";
import { segmentEvents } from "@/engine/events";
import { sha256 } from "@/engine/math";
import { buildResult } from "@/engine/result";

const AT = { analysisId: "t", createdAt: "t" };
const cases = evalCases().filter((c) => /_120_right_side_on_full|_60_right_side_on_full|_120_left_side_on_full|_240_right/.test(c.id));

function standIn(i: number, athletes: number): { clip: DatasetClip; obs: (typeof cases)[number]["obs"] } {
  const c = cases[i % cases.length]!;
  const obs = { ...c.obs, media: { ...c.obs.media, sourceStartMs: 2000 } };
  const p = analyze(obs, AT);
  const r = buildResult(p, obs);
  const hash = sha256(`${c.id}#${i}`);
  const clip: DatasetClip = {
    id: `clip_${hash.slice(0, 12)}`,
    sha256: hash,
    bytes: 1000,
    ext: ".mp4",
    athlete: `ath_0${(i % athletes) + 1}`,
    device: i % 2 ? "android_mid" : "iphone_15",
    view: "side_on",
    fps: c.fps,
    timeScale: 1,
    width: 1080,
    height: 1920,
    lighting: i % 3 ? "outdoor_day" : "indoor",
    handedness: obs.athlete.handedness,
    category: c.expected === "accepted" ? (obs.target ?? "front_foot_defence") : "pull",
    intended: obs.target ?? "front_foot_defence",
    capture: { quality: "good", issues: [] },
    expected: [r.action.outcome],
    events: Object.fromEntries(LABEL_EVENTS.flatMap((t) => { const e = p.events.find((x) => x.type === t); return e ? [[t, { ms: sourceMs(obs, e.frame), visible: true }]] : []; })),
    labels: { by: "lab_test", revision: 1, at: "2026-11-10" },
  };
  return { clip, obs };
}
const items = (n: number, athletes = 3) => Array.from({ length: n }, (_, i) => standIn(i, athletes));
/** A detector whose Contact is late by `ms`. */
const late = (ms: number): Detector => (o, sc) => {
  const set = segmentEvents(o, sc);
  const c = set.byType.contact;
  if (!c) return set;
  const frame = Math.min(sc.n - 1, c.frame + Math.round((ms / 1000) * (sc.fps ?? 60)));
  const next = { ...c, frame, tMs: Math.round(sc.t[frame]!) };
  return { list: set.list.map((x) => (x.type === "contact" ? next : x)), byType: { ...set.byType, contact: next } };
};

describe("dataset manifest", () => {
  it("the committed manifest is valid, and holds no file names or people's names", () => {
    const m = manifestSchema.parse(JSON.parse(readFileSync(process.env.DATASET ?? "scripts/eval/dataset/manifest.json", "utf8")));
    for (const c of m.clips) expect(Object.keys(c)).not.toContain("file");
  });

  it("refuses names, mismatched hashes, impossible labels and impossible expectations", () => {
    const { clip } = standIn(0, 3);
    expect(clipSchema.safeParse(clip).success).toBe(true);
    const bad = (patch: Partial<DatasetClip>) => clipSchema.safeParse({ ...clip, ...patch }).success;
    expect(bad({ athlete: "Rahul" })).toBe(false);
    expect(bad({ id: "clip_000000000000" })).toBe(false);
    expect(bad({ category: "pull", expected: ["accepted"] })).toBe(false);
    expect(bad({ capture: { quality: "unusable", issues: ["blur"] } })).toBe(false);
    expect(bad({ events: { contact: { ms: 500, visible: true }, follow_through: { ms: 400, visible: true } } })).toBe(false);
    expect(bad({ events: { bounce: { ms: 500, visible: false } } })).toBe(false);
    expect(bad({ events: { bounce: { ms: null, visible: false } } })).toBe(true);
  });
});

describe("real-media evaluation", () => {
  const set = items(12);
  const current = evaluate(set, { name: "current", datasetVersion: "0.1.0" });

  it("scores events in media time against the labels, per clip, per slice and per held-out athlete", () => {
    expect(current.overall.clips).toBe(12);
    expect(current.overall.right).toBe(12);
    expect(current.overall.events.contact.medianAbsMs).toBe(0);
    expect(current.overall.events.contact.coverage).toBe(1);
    expect(Object.keys(current.bySlice)).toEqual(expect.arrayContaining(["athlete:ath_01", "device:android_mid", "view:side_on", "fps:120", "lighting:indoor", "hand:left", "capture:good"]));
    expect(current.loao.map((l) => l.athlete)).toEqual(["ath_01", "ath_02", "ath_03"]);
    expect(current.loao.reduce((s, l) => s + l.summary.clips, 0)).toBe(12);
    expect(current.overall.medianMs).toBeGreaterThan(0);
  });

  it("measures a late Contact as an error, and whether the stated uncertainty covered it", () => {
    const r = evaluate(set, { name: "late", datasetVersion: "0.1.0", detector: late(120), detectorName: "late" });
    expect(r.overall.events.contact.medianAbsMs).toBeGreaterThanOrEqual(100);
    expect(r.overall.events.contact.coverage).toBeLessThan(1);
  });

  it("counts a moment a person can't see but the engine claims to have seen", () => {
    const hidden = set.map(({ clip, obs }) => ({ obs, clip: { ...clip, events: { ...clip.events, bounce: { ms: null, visible: false } } } }));
    const r = evaluate(hidden, { name: "h", datasetVersion: "0.1.0" });
    expect(r.overall.events.bounce.claimedUnseen).toBeGreaterThan(0);
  });

  it("gate: rejects a detector that is worse, and one that is merely no better", () => {
    const worse = evaluate(set, { name: "late", datasetVersion: "0.1.0", detector: late(120), detectorName: "late" });
    const c = compareReports(current, worse);
    expect(c.decision).toBe("reject");
    expect(c.lines.find((l) => l.criterion.startsWith("Event timing"))!.pass).toBe(false);
    expect(compareReports(current, current).decision).toBe("reject");
  });

  it("gate: accepts only when timing improves with no verdict regression", () => {
    const before = evaluate(set, { name: "late", datasetVersion: "0.1.0", detector: late(40), detectorName: "late" });
    const c = compareReports(before, current);
    expect(c.lines.find((l) => l.criterion.startsWith("Event timing"))!.pass).toBe(true);
    expect(c.lines.find((l) => l.criterion.startsWith("No supported"))!.pass).toBe(true);
    expect(c.slices.length).toBeGreaterThan(5);
    expect(c.lines.filter((l) => l.pass !== true).map((l) => `${l.criterion}: ${l.detail}`)).toEqual([]);
    expect(c.decision).toBe("accept");
  });

  it("gate: refuses to decide on too few athletes or on two different datasets", () => {
    const two = items(12, 2);
    const a = evaluate(two, { name: "a", datasetVersion: "0.1.0" });
    expect(compareReports(a, a).decision).not.toBe("accept");
    expect(compareReports(a, a).lines[0]!.pass).toBe(false);
    const other = evaluate(set, { name: "b", datasetVersion: "0.2.0" });
    expect(compareReports(current, other).lines[0]!.pass).toBe(false);
  });
});
