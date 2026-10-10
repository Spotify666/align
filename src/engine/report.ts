// Natural-language report: a deterministic template generator plus a contract
// validator that every generator (template or LLM) must pass. The validator
// rejects uncited numbers, numbers that don't match the payload, prose that
// contradicts the analysis status, and medical language.

import { z } from "zod";
import { SHOT_DISPLAY } from "./classify";
import { fmt } from "./scoring";
import { plainRange, plainReading, plainValue } from "./plain";
import { DRILL_LIBRARY_VERSION } from "./coaching";
import type { AnalysisPayload } from "./types";

export const ReportSentence = z.object({
  text: z.string().min(1).max(400),
  cites: z.array(z.string()).max(12),
});
export const ReportSection = z.object({
  heading: z.string().min(1).max(80),
  sentences: z.array(ReportSentence).min(1).max(12),
});
export const ReportSchema = z.object({
  audience: z.enum(["player", "coach", "parent", "analyst"]),
  sections: z.array(ReportSection).min(1).max(8),
});
export type ReportBody = z.infer<typeof ReportSchema>;

export interface Report extends ReportBody {
  generator: string;
  payloadHash: string;
  drillLibrary: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

const READER_LIMITS = ["lim_demo", "lim_photo", "lim_photo_set", "lim_no_bat", "lim_no_ball", "lim_body_led", "lim_bfd_ranges"];

export function templateReport(p: AnalysisPayload, audience: ReportBody["audience"] = "player"): Report {
  const sections: ReportBody["sections"] = [];
  const statusCites = (() => {
    if (p.analysis_status === "capture_failed") return p.capture.checks.filter((c) => c.status === "fail").map((c) => c.id);
    if (p.observed_shot) return p.observed_shot.evidence_ids.slice(0, 6);
    if (p.position_check) return ["position_check", ...p.limitations.slice(0, 1).map((l) => l.id)];
    return p.limitations.slice(0, 2).map((l) => l.id);
  })();

  sections.push({ heading: "Result", sentences: [{ text: p.headline, cites: statusCites }] });

  if (p.analysis_status === "invalid_for_requested_analysis" && p.observed_shot) {
    const shot = p.observed_shot;
    sections[0]!.sentences.push({
      text: `Most likely: ${shot.label === "unknown" ? shot.display : SHOT_DISPLAY[shot.label]} — ${pct(shot.probability)} prototype confidence (not yet calibrated). Technique score withheld.`,
      cites: shot.evidence_ids.slice(0, 4),
    });
    const decisive = p.features.filter((f) => shot.evidence_ids.includes(f.id));
    if (decisive.length) {
      sections.push({
        heading: "Why",
        sentences: decisive.map((f) => ({ text: `${f.label}: ${f.reading}.`, cites: [f.id, ...f.evidenceIds.slice(0, 2)] })),
      });
    }
    sections.push({
      heading: "Next",
      sentences: [
        ...(p.requested_shot === "back_foot_defence"
          ? [
              { text: "Back-foot-defence analysis only grades back-foot defences, so no technique measures are shown for this clip.", cites: [] },
              { text: "If this was meant to be a back-foot defence, record another delivery from the same position; if it was a front-foot defence, analyse it as one.", cites: [] },
            ]
          : [
              { text: "Front-foot-defence analysis only grades front-foot defences, so no technique measures are shown for this clip.", cites: [] },
              { text: "If this was meant to be a forward defence, record another delivery from the same position.", cites: [] },
            ]),
      ],
    });
  }

  if (p.analysis_status === "uncertain_shot") {
    sections[0]!.sentences.push({
      text: p.mode === "posture_screen" ? "A photo can't confirm the shot itself, so no score is given." : "Technique score withheld until the shot can be confirmed.",
      cites: [],
    });
    if (p.mode === "posture_screen") {
      const obs = p.metrics.filter((m) => m.value !== null);
      if (obs.length) {
        const grade = (m: (typeof obs)[number]) => (m.inRange === null || !m.range ? "not graded" : m.inRange ? `in range: ${plainRange(m)}` : `aim for ${plainRange(m)}`);
        sections.push({
          heading: p.position_check && p.position_check.verdict !== "not_side_on" ? "Your position (photo)" : "Your posture (photo)",
          sentences: obs.map((m) => ({ text: `${m.inRange === null ? m.name : plainReading(m)}: ${plainValue(m)} (${grade(m)}).`, cites: [`metric_${m.id}`] })),
        });
      }
    }
    sections.push({
      heading: "To get a verdict",
      sentences: p.recapture.slice(0, 4).map((r) => ({ text: r, cites: p.capture.checks.filter((c) => c.correction === r).map((c) => c.id) })),
    });
  }

  if (p.analysis_status === "capture_failed") {
    const failing = p.capture.checks.filter((c) => c.status === "fail");
    sections.push({
      heading: "What to fix",
      sentences: (failing.length ? failing : p.capture.checks.filter((c) => c.status === "warn")).slice(0, 4).map((c) => ({
        text: `${c.label}: ${c.value}. ${c.correction ?? c.requirement}`,
        cites: [c.id],
      })),
    });
  }

  if (p.analysis_status === "valid") {
    const shot = p.observed_shot!;
    sections[0]!.sentences.push({
      text: `Shot confirmed as a ${p.requested_shot === "back_foot_defence" ? "back-foot" : "front-foot"} defence (${pct(shot.probability)} prototype confidence, not yet calibrated); capture confidence ${pct(p.capture_confidence)}.`,
      cites: shot.evidence_ids.slice(0, 4),
    });
    if (p.delivery.available && p.delivery.lengthLabel && p.delivery.lengthLabel !== "uncertain") {
      const bounce = p.delivery.bounceDistanceM;
      sections[0]!.sentences.push({
        text:
          bounce !== null
            ? `Delivery: ${p.delivery.lengthLabel} length, bouncing about ${bounce.toFixed(1)} m from your stumps (±${(p.delivery.bounceUncertaintyM ?? 0).toFixed(1)} m).`
            : `Delivery: ${p.delivery.lengthLabel} length, judged from the ball's height on arrival.`,
        cites: p.delivery.evidenceIds.length ? p.delivery.evidenceIds : ["evt_bounce"],
      });
    }
    // The line: the defence's defining position, and how it was held and timed.
    const lineMs = ["line_head", "line_shoulder", "line_knee"].map((id) => p.metrics.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m && m.value !== null && m.inRange !== null);
    if (lineMs.length) {
      const out = lineMs.filter((m) => m.inRange === false);
      const held = p.metrics.find((m) => m.id === "line_held" && m.value !== null);
      const sync = p.metrics.find((m) => m.id === "sync_spread" && m.value !== null);
      const when = p.line?.referenceKind === "set" ? "at the set position" : "at contact";
      sections.push({
        heading: "The line",
        sentences: [
          out.length
            ? { text: `Out of line ${when}: ${out.map((m) => `${plainReading(m).toLowerCase()} (${plainValue(m)}; aim for ${plainRange(m)})`).join("; ")}.`, cites: out.map((m) => `metric_${m.id}`) }
            : { text: `In line ${when}: ${lineMs.map((m) => plainReading(m).toLowerCase()).join(", ")}.`, cites: lineMs.map((m) => `metric_${m.id}`) },
          ...(held ? [{ text: `Held in line for ${Math.round(held.value! * 100)}% of the time from the front foot's landing to contact.`, cites: [`metric_${held.id}`] }] : []),
          ...(sync ? [{ text: `Front foot, knee and shoulder arrived within ${Math.round(sync.value!)} ms of each other${sync.inRange === false ? ", out of sync" : ", together"}.`, cites: [`metric_${sync.id}`] }] : []),
        ],
      });
    }
    // The back-foot defence: went back, the position at contact, and the timing.
    if (p.requested_shot === "back_foot_defence") {
      const ms = p.metrics.filter((m) => m.value !== null && m.inRange !== null);
      const out = ms.filter((m) => m.inRange === false);
      const when = p.back_foot?.referenceKind === "set" ? "at the set position" : "at contact";
      if (ms.length)
        sections.push({
          heading: "The back-foot position",
          sentences: [
            out.length
              ? { text: `To fix ${when}: ${out.map((m) => `${plainReading(m).toLowerCase()} (${plainValue(m)}; aim for ${plainRange(m)})`).join("; ")}.`, cites: out.map((m) => `metric_${m.id}`) }
              : { text: `In position ${when}: ${ms.map((m) => plainReading(m).toLowerCase()).join(", ")}.`, cites: ms.map((m) => `metric_${m.id}`) },
          ],
        });
    }
    if (p.strengths.length) {
      sections.push({
        heading: "Strengths",
        sentences: p.strengths.map((s) => ({ text: s.observation, cites: s.evidenceIds.slice(0, 3) })),
      });
    }
    if (p.priorities.length) {
      sections.push({
        heading: "Priority",
        sentences: p.priorities.slice(0, 1).map((s) => ({ text: s.observation, cites: s.evidenceIds.slice(0, 3) })),
      });
    }
    if (p.plan) {
      sections.push({
        heading: "Train next",
        sentences: [
          { text: p.plan.consequence, cites: [`metric_${p.plan.priority.metricId}`] },
          { text: `Cue: ${p.plan.cue}`, cites: [`metric_${p.plan.priority.metricId}`] },
          ...p.plan.drills.map((d) => ({ text: `${d.name}: ${d.constraint} ${d.dosage}. Pass: ${d.passCondition}`, cites: [d.id] })),
          { text: p.plan.retest, cites: [`metric_${p.plan.priority.metricId}`] },
        ],
      });
    }
  }

  sections.push({
    heading: "Limits of this result",
    // Only what changes how to read the result; the technical ones stay in Technical details.
    sentences: p.limitations.filter((l) => READER_LIMITS.includes(l.id)).slice(0, 3).map((l) => ({ text: l.text, cites: [l.id] })),
  });

  return { audience, sections: sections.filter((x) => x.sentences.length > 0), generator: "template-0.1.0", payloadHash: p.result_hash, drillLibrary: DRILL_LIBRARY_VERSION };
}

// ---------------- Contract validation ----------------

export interface Violation {
  section: number;
  sentence: number;
  rule: "unknown_citation" | "uncited_number" | "number_mismatch" | "status_contradiction" | "medical_language" | "unmeasured_claim" | "schema";
  detail: string;
}

const MEDICAL = /\b(injur(y|ies|ed)|diagnos\w*|disease|patholog\w*|clinical(ly)?|abnormal|unsafe|treatment|rehab\w*|medical(ly)?)\b/i;
const SCORE_WORDS = /\b(\d{1,3}\s*\/\s*100|technique (score|index) (of|is|=)\s*\d|scored? \d)/i;

/** Every number a sentence may legitimately mention when citing a given id. */
function citationUniverse(p: AnalysisPayload): Map<string, number[]> {
  const u = new Map<string, number[]>();
  const put = (id: string, nums: Array<number | null | undefined>) =>
    u.set(id, [...(u.get(id) ?? []), ...nums.filter((x): x is number => typeof x === "number" && Number.isFinite(x))]);
  for (const m of p.metrics) {
    put(`metric_${m.id}`, [m.value, m.uncertainty, m.range?.lo, m.range?.hi, m.confidence * 100]);
    // Shares of height and of the stride are written as percentages.
    if (m.unit === "× stature" || m.unit === "0–1" || m.unit === "share of frames") put(`metric_${m.id}`, [m.value, m.range?.lo, m.range?.hi].map((x) => (x == null ? null : Math.round(x * 100))));
  }
  for (const f of p.features) put(f.id, [f.value]);
  for (const e of p.events) {
    put(e.id, [e.tMs, e.frame]);
    put(`frame_${e.frame}`, [e.frame]);
  }
  for (const c of p.capture.checks) put(c.id, (c.value + " " + c.requirement + " " + (c.correction ?? "")).match(/\d+(\.\d+)?/g)?.map(Number) ?? []);
  for (const l of p.limitations) put(l.id, l.text.match(/\d+(\.\d+)?/g)?.map(Number) ?? []);
  for (const d of p.drill_candidates) put(d.id, `${d.constraint} ${d.dosage} ${d.passCondition}`.match(/\d+(\.\d+)?/g)?.map(Number) ?? []);
  if (p.plan) for (const d of p.plan.drills) put(d.id, `${d.constraint} ${d.dosage} ${d.passCondition}`.match(/\d+(\.\d+)?/g)?.map(Number) ?? []);
  // The retest line is engine-authored payload text, so its numbers are grounded too.
  if (p.plan) put(`metric_${p.plan.priority.metricId}`, p.plan.retest.match(/\d+(\.\d+)?/g)?.map(Number) ?? []);
  for (const id of p.delivery.evidenceIds) put(id, [p.delivery.bounceDistanceM, p.delivery.bounceUncertaintyM, p.delivery.heightAtBatterM]);
  if (p.observed_shot) for (const id of p.observed_shot.evidence_ids) put(id, [p.observed_shot.probability * 100, p.capture_confidence * 100]);
  for (const f of p.evidence_frames) put(`frame_${f}`, [f]);
  if (p.position_check) put("position_check", [p.position_check.met, p.position_check.checked, p.position_check.frame + 1, p.photo_set?.length ?? 1]);
  return u;
}

interface Num {
  value: number;
  decimals: number;
}

function numbersIn(text: string): Num[] {
  // Ignore numbers that are part of identifiers like "3D".
  return (text.replace(/\b\d+D\b/g, "").match(/-?\d+(\.\d+)?/g) ?? []).map((s) => ({
    value: Number(s),
    decimals: s.includes(".") ? s.split(".")[1]!.length : 0,
  }));
}

/** A stated number matches a payload number if it is that number rounded to the stated precision (or as a percentage). */
function matches(n: Num, allowed: number[]): boolean {
  const half = 0.5 * 10 ** -n.decimals + 1e-9;
  return allowed.some((a) => {
    const x = Math.abs(n.value);
    const y = Math.abs(a);
    return Math.abs(x - y) <= Math.max(half, y * 0.005) || Math.abs(x - y * 100) <= Math.max(half, 0.5);
  });
}

export function validateReport(report: ReportBody, p: AnalysisPayload): Violation[] {
  const v: Violation[] = [];
  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) {
    return [{ section: -1, sentence: -1, rule: "schema", detail: parsed.error.issues.map((i) => i.message).join("; ") }];
  }
  const universe = citationUniverse(p);
  const known = new Set<string>([
    ...universe.keys(),
    ...p.metrics.map((m) => `metric_${m.id}`),
    ...p.features.map((f) => f.id),
    ...p.limitations.map((l) => l.id),
    // Frames referenced anywhere in the engine's own evidence lists.
    ...[...p.metrics.flatMap((m) => m.evidenceIds), ...p.features.flatMap((f) => f.evidenceIds), ...p.delivery.evidenceIds].filter((id) => id.startsWith("frame_")),
  ]);
  const unmeasured = new Set(p.metrics.filter((m) => m.status === "not_measured").map((m) => `metric_${m.id}`));
  const fullText = report.sections.flatMap((s) => s.sentences.map((x) => x.text)).join(" ");

  report.sections.forEach((sec, si) =>
    sec.sentences.forEach((s, xi) => {
      const at = { section: si, sentence: xi };
      for (const c of s.cites) if (!known.has(c)) v.push({ ...at, rule: "unknown_citation", detail: c });
      if (MEDICAL.test(s.text)) v.push({ ...at, rule: "medical_language", detail: s.text.match(MEDICAL)![0] });
      const nums = numbersIn(s.text);
      if (nums.length) {
        if (!s.cites.length) v.push({ ...at, rule: "uncited_number", detail: s.text });
        else {
          const allowed = s.cites.flatMap((c) => universe.get(c) ?? []);
          for (const n of nums) if (!matches(n, allowed)) v.push({ ...at, rule: "number_mismatch", detail: `${n.value} in "${s.text}"` });
        }
        for (const c of s.cites) if (unmeasured.has(c)) v.push({ ...at, rule: "unmeasured_claim", detail: c });
      }
    }),
  );

  if (p.analysis_status !== "valid") {
    if (SCORE_WORDS.test(fullText)) v.push({ section: -1, sentence: -1, rule: "status_contradiction", detail: "score stated for a non-valid analysis" });
    if (/\bvalid (front|back)-foot defence\b/i.test(fullText)) v.push({ section: -1, sentence: -1, rule: "status_contradiction", detail: "claims a valid defence" });
    if (!/withheld|can't confirm|cannot confirm|not a (front|back)-foot defence|can't be analysed/i.test(fullText))
      v.push({ section: -1, sentence: -1, rule: "status_contradiction", detail: "non-valid result must say the score is withheld" });
  } else if (/not a (front|back)-foot defence|score withheld|can't confirm/i.test(fullText)) {
    v.push({ section: -1, sentence: -1, rule: "status_contradiction", detail: "valid analysis described as invalid" });
  }
  return v;
}
