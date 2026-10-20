// Server-side helpers that run the real engine over the DEMO DATA fixtures.
import type { CompareReference } from "@/components/report/evidence-viewer";
import { analyze } from "@/engine/analyze";
import { baselineSeries, bfdScript, ffdScript, fixture, FIXTURE_SPECS, type FixtureSpec } from "@/engine/fixtures";
import { bfdDemoScript, ffdDemoScript } from "@/engine/fixtures/demo-scripts";
import { generate } from "@/engine/fixtures/generate";
import { figureFrame, figurePose, type FigurePose, type Pt, type Story } from "@/components/lesson/pose";
import { buildBaseline, compareToBaseline } from "@/engine/baseline";
import { quantise } from "@/engine/tracks-codec";

const CREATED = "2026-10-01T09:00:00.000Z";

/** Back-foot defence samples: generated clips analysed as a back-foot defence (DEMO DATA). */
const common = { statureM: 1.75, durationS: 2, fps: 120, handedness: "right" } as const;
export const BACK_FOOT_SAMPLES: FixtureSpec[] = [
  {
    key: "valid_bfd",
    title: "Valid back-foot defence",
    expectation: "valid — front foot left out in front: coached to bring it alongside",
    options: { ...common, id: "fx_valid_bfd", label: "Valid back-foot defence", seed: 11, script: bfdScript({ backStep: 0.2, frontBack: 0.12 }) },
  },
  {
    key: "front_on_bfd",
    title: "Back-foot defence from the bowler's end",
    expectation: "valid — head and hands read sideways; going back can't be seen from this end",
    options: { ...common, id: "fx_front_on_bfd", label: "Back-foot defence, bowler's end", seed: 13, script: bfdScript({ backStep: 0.2, frontBack: 0.27 }), view: "front_on" },
  },
  {
    key: "ffd_as_bfd",
    title: "Front-foot defence submitted as a back-foot defence",
    expectation: "invalid_for_requested_analysis — named as a front-foot defence, no score",
    options: { ...common, id: "fx_ffd_as_bfd", label: "Front-foot defence", seed: 21, script: ffdScript() },
  },
];

export function sampleAnalysis(key: string) {
  const bfd = BACK_FOOT_SAMPLES.find((s) => s.key === key);
  if (bfd) {
    const obs = quantise({ ...generate(bfd.options), target: "back_foot_defence" });
    return { spec: bfd, obs, payload: analyze(obs, { analysisId: `sample_${key}`, createdAt: CREATED }) };
  }
  const spec = FIXTURE_SPECS.find((s) => s.key === key);
  if (!spec) return null;
  const obs = quantise(fixture(key));
  const payload = analyze(obs, { analysisId: `sample_${key}`, createdAt: CREATED });
  return { spec, obs, payload };
}

export type DemoShot = "front" | "back";

/**
 * The textbook defence the explainers demonstrate (src/engine/fixtures/demo-scripts.ts),
 * analysed by the engine like any clip: it meets every check of its shot. Drawn for people,
 * not trackers, so it carries no simulated tracking noise (that reads as trembling).
 */
export function demoClip(shot: DemoShot) {
  const spec = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!;
  const script = shot === "front" ? ffdDemoScript() : bfdDemoScript();
  const raw = generate({ ...spec.options, id: `fx_demo_${shot}`, script, noise: 0, handNoise: 0 });
  const obs = quantise(shot === "back" ? { ...raw, target: "back_foot_defence" } : raw);
  const payload = analyze(obs, { analysisId: `demo_${shot}`, createdAt: CREATED });
  return { obs, payload };
}

/** The forward defence's demonstration clip (the landing page's picture uses its contact). */
export const textbookClip = () => demoClip("front");

/**
 * A defence as its explainer plays it: the batter at 60 frames a second from the stance to
 * just after contact, on one still camera, rounded for the page. The four moments are the
 * stages the engine finds in the clip: set up; the pick-up (forward) or the back foot set
 * (back); the front foot landing (forward) or alongside (back); contact.
 */
export function demoStory(shot: DemoShot): Story {
  const { obs, payload } = demoClip(shot);
  const fps = obs.media.fps ?? 120;
  const at = (t: string, d: number) => payload.events.find((e) => e.type === t)?.frame ?? d;
  const contact = at("contact", Math.round((shot === "front" ? 0.99 : 0.94) * fps));
  const arrivals = payload.back_foot?.arrivals;
  const start = Math.round(0.3 * fps);
  const marks =
    shot === "front"
      ? [start, at("backswing_top", Math.round(0.66 * fps)), at("front_foot_plant", Math.round(0.8 * fps)), contact]
      : [start, arrivals?.back_foot.frame ?? Math.round(0.66 * fps), arrivals?.front_foot.frame ?? Math.round(0.8 * fps), contact];
  const step = Math.max(1, Math.round(fps / 60));
  const end = Math.min(obs.body.length - 1, contact + Math.round(0.4 * fps));
  const frames: number[] = [];
  for (let i = start; i <= end; i += step) frames.push(i);
  const { stumpsX, groundY } = obs.calibration;
  const stumps = stumpsX !== null && groundY !== null ? ([stumpsX, groundY, 1] as const) : null;
  // One still camera for the whole clip, set on the stance: the batter moves, the picture doesn't.
  const aspect = obs.media.width / obs.media.height;
  const camera = figureFrame(obs.body[frames[0]!]!, aspect, obs.athlete.handedness)!;
  const raw = frames.map((i) => figurePose(obs.body[i]!, aspect, obs.athlete.handedness, [obs.bat.handle[i], obs.bat.toe[i]], { ball: obs.ball.points[i], stumps }, camera)!);
  const dx0 = raw[0]!.ba[0];
  const r = (q: Pt): Pt => [Math.round((q[0] - dx0) * 10) / 10, Math.round(q[1] * 10) / 10];
  const poses = raw.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r(v as Pt)])) as unknown as FigurePose);
  const index = (f: number) => frames.reduce((best, x, i) => (Math.abs(x - f) < Math.abs(frames[best]! - f) ? i : best), 0);
  return { poses, fps: fps / step, moments: marks.map(index) as Story["moments"] };
}

/** The forward defence's explainer (the landing and home pages). */
export const textbookStory = () => demoStory("front");

let cachedBaseline: ReturnType<typeof buildBaseline> | null = null;
let cachedSeries: ReturnType<typeof baselineSeries> | null = null;
export function demoBaseline() {
  if (!cachedBaseline) {
    cachedSeries = baselineSeries(8).map(quantise);
    const payloads = cachedSeries.map((o, i) => analyze(o, { analysisId: `baseline_${i + 1}`, createdAt: `2026-09-${String(10 + i * 2).padStart(2, "0")}T18:00:00.000Z` }));
    cachedBaseline = buildBaseline(payloads, { version: 1, createdAt: "2026-09-28T00:00:00.000Z" });
  }
  return { baseline: cachedBaseline, series: cachedSeries! };
}

export function sampleWithBaseline(key: string) {
  const s = sampleAnalysis(key);
  if (!s) return null;
  // The demo baseline and comparison clips are front-foot defences.
  if (s.payload.requested_shot !== "front_foot_defence") return { ...s, comparisons: [], reference: null };
  const { baseline, series } = demoBaseline();
  const comparisons = compareToBaseline(s.payload, baseline);
  const refObs = series[0]!;
  const refPayload = analyze(refObs, { analysisId: "ref", createdAt: CREATED });
  const c1 = s.payload.events.find((e) => e.type === "contact")?.frame;
  const c2 = refPayload.events.find((e) => e.type === "contact")?.frame;
  // Only a comparable shot: same camera position and handedness, both with a contact.
  const comparable = c1 !== undefined && c2 !== undefined && s.payload.camera_view === refPayload.camera_view && s.payload.handedness === refPayload.handedness;
  const reference: CompareReference | null = comparable
    ? { obs: refObs, payload: refPayload, label: "Demo: an earlier delivery", recordedAt: "2026-09-10T18:00:00.000Z", contactSelf: c1, contactRef: c2 }
    : null;
  return { ...s, comparisons, reference };
}

export const SAMPLE_ORDER = ["valid_ffd", "pull", "occluded", "capture_failed", "front_on_ffd", "front_on_pull", "drive", "photo", "no_ball", "no_bat", "left_handed", "low_fps", "front_on_drive", "session3d", "valid_bfd", "front_on_bfd", "ffd_as_bfd"];
