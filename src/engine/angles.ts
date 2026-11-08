// Two angles of the same ball (an optional, extra step after a report): one clip filmed from the
// side, one from the front or behind. Each clip is analysed on its own, exactly as always; this
// only combines the two results into one refined answer:
//  - the shot: confirmed when an angle confirms it and the other doesn't contradict it; when one
//    angle confirms it and the other names a different shot, the two disagree and no answer is
//    given;
//  - each measure from the camera that sees it (going back and the feet's gap from the side, the
//    sideways line from the front); where both see the same measure, both must agree, or it is
//    not graded.
// Wording only: no thresholds live here.

import { SHOT_DISPLAY } from "./classify";
import { fixSentence, plainSummary, simpleGood, type AngleLabel, type PlainSummary, type ReadingLevel, type SummaryLine } from "./summary";
import type { AnalysisPayload, Metric, TargetShot } from "./types";

export type AngleFamily = "side" | "end";

/** Side-on (or angled) clips see along the pitch; front-on and behind see across it. */
export function angleFamily(p: Pick<AnalysisPayload, "camera_view" | "mode">): AngleFamily | null {
  if (p.mode === "posture_screen") return null;
  if (p.camera_view === "side_on" || p.camera_view === "oblique") return "side";
  if (p.camera_view === "front_on" || p.camera_view === "behind") return "end";
  return null;
}

export interface AngleMeasure {
  key: string;
  /** The reading shown (the side's when both angles read it). */
  metric: Metric;
  side: Metric | null;
  end: Metric | null;
  from: "side" | "end" | "both";
  /** null: the two angles disagree, so it isn't graded. */
  inRange: boolean | null;
  disagree: boolean;
}

export type CombinedStatus = "valid" | "invalid_for_requested_analysis" | "uncertain_shot" | "capture_failed" | "disagree" | "same_angle" | "different_shots_asked";

export interface CombinedAngles {
  status: CombinedStatus;
  shot: TargetShot;
  side: AnalysisPayload | null;
  end: AnalysisPayload | null;
  measures: AngleMeasure[];
  summary: PlainSummary;
}

const SHOT_NAME: Record<TargetShot, string> = { front_foot_defence: "front-foot defence", back_foot_defence: "back-foot defence" };
const shotOf = (p: AnalysisPayload): TargetShot => p.requested_shot ?? "front_foot_defence";
const seen = (m: Metric) => m.status !== "not_measured" && m.value !== null;
const keyOf = (m: Metric) => `${m.id}|${m.axis ?? ""}`;
const cap = (lines: SummaryLine[]) => {
  const out: SummaryLine[] = [];
  for (const l of lines) if (l.text && !out.some((o) => o.text === l.text)) out.push(l);
  return out.slice(0, 4);
};

export function bothAnglesLabel(end: AnalysisPayload | null): AngleLabel {
  const behind = end?.camera_view === "behind";
  return {
    short: behind ? "Side + back angle" : "Side + front angle",
    long: `Two clips of the same ball: one filmed from the side, one from ${behind ? "behind the batter" : "the front"}. Each check is read from the angle that sees it best.`,
  };
}

/** Each measure from the camera that sees it; where both read it, both must agree. */
export function combineMeasures(side: AnalysisPayload, end: AnalysisPayload): AngleMeasure[] {
  const take = (p: AnalysisPayload) => (p.analysis_status === "valid" ? p.metrics.filter(seen) : []);
  const s = new Map(take(side).map((m) => [keyOf(m), m]));
  const e = new Map(take(end).map((m) => [keyOf(m), m]));
  const keys = [...s.keys(), ...[...e.keys()].filter((k) => !s.has(k))];
  return keys.map((key) => {
    const sm = s.get(key) ?? null;
    const em = e.get(key) ?? null;
    if (sm && em) {
      const disagree = sm.inRange !== em.inRange;
      return { key, metric: sm, side: sm, end: em, from: "both", inRange: disagree ? null : sm.inRange, disagree };
    }
    const m = (sm ?? em)!;
    return { key, metric: m, side: sm, end: em, from: sm ? "side" : "end", inRange: m.inRange, disagree: false };
  });
}

/** The two clips' results as one answer, in at most five plain sentences. */
export function combineAngles(a: AnalysisPayload, b: AnalysisPayload, level: ReadingLevel = "plain"): CombinedAngles {
  const shot = shotOf(a);
  const name = SHOT_NAME[shot];
  const fa = angleFamily(a);
  const fb = angleFamily(b);
  const none = (status: CombinedStatus, verdict: string, lines: SummaryLine[], tone: PlainSummary["tone"] = "warn"): CombinedAngles => ({
    status,
    shot,
    side: fa === "side" ? a : fb === "side" ? b : null,
    end: fa === "end" ? a : fb === "end" ? b : null,
    measures: [],
    summary: { verdict, tone, lines: cap(lines), angle: bothAnglesLabel(null) },
  });

  if (shotOf(b) !== shot) {
    return none("different_shots_asked", "These two clips were checked as different shots.", [
      { kind: "tip", text: `Check both as a ${name}, then add the other angle again.` },
    ]);
  }
  if (!fa || !fb || fa === fb) {
    const where = fa === "side" && fb === "side" ? "both from the side" : fa === "end" && fb === "end" ? "both from the front or behind" : "not clear";
    return none("same_angle", "These two clips can't be combined.", [
      { kind: "info", text: `The camera angles are ${where}.` },
      { kind: "tip", text: "Use one clip filmed from the side and one from the front, of the same ball." },
    ]);
  }

  const side = fa === "side" ? a : b;
  const end = fa === "side" ? b : a;
  const angle = bothAnglesLabel(end);
  const one = (p: AnalysisPayload) => plainSummary(p, { level });
  const said = (p: AnalysisPayload) => {
    const v = one(p).verdict.replace(/\.$/, "");
    return v[0]!.toLowerCase() + v.slice(1);
  };
  const st = [side.analysis_status, end.analysis_status];
  const valid = st.filter((x) => x === "valid").length;
  const named = st.filter((x) => x === "invalid_for_requested_analysis").length;

  // One angle confirms the shot and the other names a different one: no answer.
  if (valid && named) {
    return {
      status: "disagree",
      shot,
      side,
      end,
      measures: [],
      summary: {
        verdict: "The two angles disagree.",
        tone: "warn",
        lines: cap([
          { kind: "info", text: `From the side: ${said(side)}.` },
          { kind: "info", text: `From the front: ${said(end)}.` },
          { kind: "tip", text: "Check that both clips show the same ball." },
        ]),
        angle,
      },
    };
  }

  if (!valid) {
    const status: CombinedStatus = named === 2 ? "invalid_for_requested_analysis" : st.every((x) => x === "capture_failed") ? "capture_failed" : "uncertain_shot";
    const first = (p: AnalysisPayload) => one(p).lines.find((l) => l.kind === "info")?.text;
    const lines: SummaryLine[] = [];
    if (status === "invalid_for_requested_analysis") {
      const seenShot = side.observed_shot?.label && side.observed_shot.label !== "unknown" ? SHOT_DISPLAY[side.observed_shot.label].toLowerCase() : null;
      if (seenShot) lines.push({ kind: "info", text: `Both angles show more of a ${seenShot}.` });
      lines.push({ kind: "tip", text: `To check a ${name}, record one and try again.` });
      return { status, shot, side, end, measures: [], summary: { verdict: `This is not a ${name}.`, tone: "bad", lines: cap(lines), angle } };
    }
    if ([side, end].some((p) => p.status_reason === "looks_back_foot")) {
      return {
        status,
        shot,
        side,
        end,
        measures: [],
        summary: {
          verdict: "This looks like a back-foot defence.",
          tone: "info",
          lines: cap([
            { kind: "info", text: "You stepped back, stood tall and didn't step forward." },
            { kind: "tip", text: "Check each clip as a back-foot defence, then add the other angle again." },
          ]),
          angle,
        },
      };
    }
    const fs = first(side);
    const fe = first(end);
    if (fs) lines.push({ kind: "info", text: `From the side: ${fs[0]!.toLowerCase()}${fs.slice(1)}` });
    if (fe) lines.push({ kind: "info", text: `From the front: ${fe[0]!.toLowerCase()}${fe.slice(1)}` });
    lines.push({ kind: "tip", text: "Film from the side, with your whole body in the picture." });
    return { status, shot, side, end, measures: [], summary: { verdict: `Aline can't tell if this is a ${name}.`, tone: "warn", lines: cap(lines), angle } };
  }

  // Confirmed: each check from the angle that sees it.
  const measures = combineMeasures(side, end);
  const lines: SummaryLine[] = [];
  if (valid === 1) lines.push({ kind: "info", text: `Only the ${side.analysis_status === "valid" ? "side" : "front"} angle could confirm it.` });

  const goods: string[] = [];
  for (const m of [...measures].sort((x, y) => Number(y.from === "both") - Number(x.from === "both"))) {
    if (m.inRange !== true) continue;
    const t = simpleGood(m.metric);
    if (t && !goods.includes(t)) goods.push(t);
  }
  for (const t of goods.slice(0, valid === 1 ? 1 : 2)) lines.push({ kind: "good", text: t });

  // The one fix: the most important out-of-range check, by each angle's own priorities.
  const rank = (m: AngleMeasure) => {
    const r = [side, end].map((p) => p.priorities.findIndex((f) => f.metricId === m.metric.id)).filter((i) => i >= 0);
    return r.length ? Math.min(...r) : 99;
  };
  const fix = measures.filter((m) => m.inRange === false).sort((x, y) => rank(x) - rank(y))[0];
  const fixFrom = fix ? (fix.from === "end" ? end : side) : null;
  const fixText = fix && fixFrom ? fixSentence(fixFrom, fix.metric, level) : null;
  lines.push(fixText ? { kind: "fix", text: fixText } : { kind: "good", text: "Nothing big to fix. Keep it up." });

  const split = measures.find((m) => m.disagree);
  if (split) lines.push({ kind: "info", text: `The two angles disagree on ${split.metric.name.toLowerCase()}, so it isn't marked.` });
  const plan = [side, end].find((p) => p.plan && fix && p.plan.priority.metricId === fix.metric.id)?.plan ?? side.plan ?? end.plan;
  const cue = plan?.cue?.trim();
  if (cue) lines.push({ kind: "tip", text: `Remember: “${cue.replace(/\.$/, "")}.”` });

  return { status: "valid", shot, side, end, measures, summary: { verdict: `This is a ${name}.`, tone: "ok", lines: cap(lines), angle } };
}
