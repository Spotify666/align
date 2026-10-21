// Server-side helpers that run the real engine over the DEMO DATA fixtures.
import type { CompareReference } from "@/components/report/evidence-viewer";
import { analyze } from "@/engine/analyze";
import { baselineSeries, bfdScript, ffdScript, fixture, FIXTURE_SPECS, type FixtureSpec } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
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
