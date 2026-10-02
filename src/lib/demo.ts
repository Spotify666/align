// Server-side helpers that run the real engine over the DEMO DATA fixtures.
import type { CompareReference } from "@/components/report/evidence-viewer";
import { analyze } from "@/engine/analyze";
import { baselineSeries, ffdScript, fixture, FIXTURE_SPECS } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import { buildBaseline, compareToBaseline } from "@/engine/baseline";
import { quantise } from "@/engine/tracks-codec";

const CREATED = "2026-10-01T09:00:00.000Z";

export function sampleAnalysis(key: string) {
  const spec = FIXTURE_SPECS.find((s) => s.key === key);
  if (!spec) return null;
  const obs = quantise(fixture(key));
  const payload = analyze(obs, { analysisId: `sample_${key}`, createdAt: CREATED });
  return { spec, obs, payload };
}

/** The textbook defence (the generator's default technique), for teaching illustrations. */
export function textbookClip() {
  const spec = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!;
  const obs = quantise(generate({ ...spec.options, id: "fx_textbook", script: ffdScript() }));
  const payload = analyze(obs, { analysisId: "textbook", createdAt: CREATED });
  return { obs, payload };
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

export const SAMPLE_ORDER = ["valid_ffd", "pull", "occluded", "capture_failed", "front_on_ffd", "front_on_pull", "drive", "photo", "no_ball", "no_bat", "left_handed", "low_fps", "front_on_drive", "session3d"];
