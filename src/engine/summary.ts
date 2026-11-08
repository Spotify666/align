// The report's first screen: what happened and what to do next, in at most five short
// sentences anyone who plays can follow (a child included), and where the camera was.
// Everything else (measures, ranges, illustrations, drills) stays behind "Details".
// Wording only: no thresholds live here; every judgement comes from the payload.

import { SHOT_DISPLAY } from "./classify";
import type { AnalysisPayload, CameraView, Metric, TargetShot } from "./types";

export type SummaryKind = "good" | "fix" | "tip" | "info";
export interface SummaryLine {
  kind: SummaryKind;
  text: string;
}
export interface AngleLabel {
  /** On the summary, at the right: "Side angle", "Front angle". */
  short: string;
  /** In the details: where the camera was, in a sentence. */
  long: string;
}
export interface PlainSummary {
  /** The first sentence: the answer. */
  verdict: string;
  tone: "ok" | "warn" | "bad" | "info";
  /** At most four more sentences, so the summary is never more than five. */
  lines: SummaryLine[];
  angle: AngleLabel;
}

const SHOT_NAME: Record<TargetShot, string> = { front_foot_defence: "front-foot defence", back_foot_defence: "back-foot defence" };

const ANGLES: Record<CameraView, AngleLabel> = {
  side_on: { short: "Side angle", long: "Filmed from the side (side-on), level with the batter." },
  front_on: { short: "Front angle", long: "Filmed from the front, from the bowler's end." },
  behind: { short: "Back angle", long: "Filmed from behind the batter." },
  oblique: { short: "Angled view", long: "Filmed at an angle, between side-on and the front." },
  unknown: { short: "Angle unclear", long: "Aline couldn't tell where the camera was." },
};

export function angleLabel(view: CameraView | undefined, kind: "video" | "photo" = "video"): AngleLabel {
  const a = ANGLES[view ?? "unknown"];
  return kind === "photo" ? { short: a.short, long: a.long.replace(/^Filmed/, "Taken") } : a;
}

/** Each measure, said simply: what was good, and what to do when it was low or high. */
type Plain = { good: string; low?: string; high?: string };
const SIMPLE: Record<string, Plain> = {
  line_head: { good: "Your head was right over the ball.", low: "Get your head over your front foot.", high: "Don't let your head go past your front foot." },
  line_shoulder: { good: "Your front shoulder led the way.", low: "Lead with your front shoulder.", high: "Don't lean too far with your front shoulder." },
  line_knee: { good: "Your front knee was over your foot.", low: "Bend your front knee over your foot.", high: "Don't push your front knee past your toes." },
  line_held: { good: "You held your shape until the ball hit the bat.", low: "Hold your shape until the ball hits the bat." },
  sync_spread: { good: "Your foot, knee and shoulder moved together.", high: "Move your foot, knee and shoulder together." },
  set_late: { good: "You were still and ready before the ball came.", high: "Be still and ready before the ball comes." },
  decision_timing: { good: "You moved to the ball at the right time.", low: "Wait a little longer before you move.", high: "Move to the ball a little sooner." },
  stride_length: { good: "You took a good step to the ball.", low: "Take a bigger step forward.", high: "Don't step so far." },
  foot_spread: { good: "You took a good step to the ball.", low: "Take a bigger step forward.", high: "Don't step so far." },
  front_knee_flexion: { good: "Your front knee was bent.", low: "Don't sink so low.", high: "Bend your front knee more." },
  back_knee_extension: { good: "Your back leg was long.", low: "Keep your back leg longer." },
  weight_forward: { good: "Your weight was on your front foot.", low: "Put your weight on your front foot.", high: "Don't fall forward." },
  head_speed_contact: { good: "Your head was still when you hit the ball.", high: "Keep your head still when you hit the ball." },
  trunk_inclination: { good: "You leaned into the shot.", low: "Lean forward a little more.", high: "Don't bend over so much." },
  hands_ahead_of_knee: { good: "Your hands were in front, with the bat pointing down.", low: "Push your hands in front of your front pad.", high: "Don't push your hands out so far." },
  bat_angle_contact: { good: "Your bat pointed down.", low: "Point your bat down more.", high: "Don't tilt your bat so far." },
  contact_ahead_of_knee: { good: "You met the ball next to your front pad.", low: "Meet the ball in front, next to your pad.", high: "Don't reach out for the ball." },
  bat_speed_contact: { good: "Soft hands: the ball dropped near you.", high: "Use soft hands: let the ball come to the bat." },
  bat_pad_gap: { good: "Your bat was close to your pad.", high: "Keep your bat close to your pad." },
  ball_exit_speed: { good: "The ball dropped near you.", high: "Use soft hands so the ball drops near you." },
  balance_over_feet: { good: "You stayed balanced.", high: "Stay balanced over your feet." },
  // The back-foot defence.
  bfd_back_step: { good: "You stepped back toward your stumps.", low: "Step back toward your stumps.", high: "Don't step back onto your stumps." },
  bfd_feet_gap: { good: "Your front foot came back next to your back foot.", high: "Bring your front foot back too." },
  bfd_head: { good: "Your head was over the ball.", low: "Keep your head forward, over the ball.", high: "Don't lean toward the bowler." },
  bfd_tall: { good: "You stood tall.", low: "Keep your feet down, not up on your toes.", high: "Stand tall. Don't sink down." },
  bfd_head_height: { good: "You stood tall.", low: "Stand up tall." },
  bfd_elbow: { good: "Your front elbow was high.", low: "Lift your front elbow up.", high: "Don't lift your elbow so high." },
  bfd_hands_eyes: { good: "You played the ball under your eyes.", low: "Meet the ball a little sooner, under your eyes.", high: "Don't push your hands out in front." },
  bfd_dead_bat: { good: "Soft hands: you stopped the ball.", high: "Don't push at the ball. Just stop it." },
  bfd_back_first: { good: "Your back foot moved first.", low: "Move your back foot first.", high: "Bring your front foot back sooner, right after the back foot." },
  bfd_set_late: { good: "You were still and ready before the ball came.", high: "Be still and ready before the ball comes." },
};

/** The line read from either end of the pitch: the same parts, sideways. */
const SIDEWAYS: Record<string, Plain> = {
  line_head: { good: "Your head was in line with the ball.", low: "Don't let your head fall to the side.", high: "Don't reach across with your head." },
  line_shoulder: { good: "Your front shoulder pointed down the pitch.", low: "Don't open your front shoulder.", high: "Don't dive across with your front shoulder." },
  line_knee: { good: "Your front knee was over your foot.", low: "Don't let your front knee fall in.", high: "Don't push your front knee out." },
  bfd_head: { good: "Your head was in line with the ball.", low: "Don't let your head fall to the side.", high: "Don't reach across with your head." },
  bfd_hands_eyes: { good: "You played the ball under your eyes.", low: "Don't play across your body.", high: "Don't reach away from your body." },
};

const plainOf = (m: Pick<Metric, "id" | "axis">) => (m.axis === "sideways" && SIDEWAYS[m.id]) || SIMPLE[m.id];

/** What went well with this measure, simply (null when it has no simple wording). */
export function simpleGood(m: Pick<Metric, "id" | "axis">): string | null {
  return plainOf(m)?.good ?? null;
}

/** What to do about this measure, simply (null when it was in range or has no simple wording). */
export function simpleFix(m: Pick<Metric, "id" | "axis" | "value" | "range" | "inRange">): string | null {
  const w = plainOf(m);
  if (!w || m.value === null || !m.range || m.inRange !== false) return null;
  if (m.value < m.range.lo) return w.low ?? null;
  if (m.value > m.range.hi) return w.high ?? null;
  return null;
}

/** Why no answer was given, simply. */
const REASON: Record<string, string> = {
  no_stroke: "Aline didn't see a shot being played.",
  no_lowering: "Your head and hips didn't go forward and down, as they do in a defence.",
  camera_zoom: "The camera zoomed in during the shot.",
  contact_hidden: "Aline couldn't see the moment the bat met the ball.",
  body_hidden: "Parts of your body were hidden during the shot.",
  body_inconclusive: "Aline couldn't find the bat and ball, and your body alone could fit more than one shot.",
  ball_missing: "Aline couldn't see the ball.",
  bat_missing: "Aline couldn't see the bat.",
  insufficient_evidence: "Aline couldn't see enough of the shot.",
  out_of_distribution: "This doesn't look like a shot Aline knows.",
  ambiguous: "This could be more than one shot.",
  // The back-foot defence's definition, part by part.
  not_back: "Aline didn't see you step back toward your stumps.",
  stride: "Your feet ended a big step apart. In a back-foot defence they finish close together.",
  not_tall: "You went down low. In a back-foot defence you stand tall.",
  not_dead_bat: "Your hands didn't stop at the ball, as they do in a defence.",
  part_unseen: "Part of the shot couldn't be seen from this angle.",
};

/** The problem a recording check found, simply. */
const CAPTURE_PROBLEM: Record<string, string> = {
  chk_body_visible: "Your whole body wasn't in the picture.",
  chk_lighting: "The light was too dark or too bright.",
  chk_contrast: "You were hard to see against the background.",
  chk_blur: "The video was too blurry.",
  chk_stability: "The camera moved too much.",
  chk_single_batter: "There was more than one person in the picture.",
  chk_resolution: "The picture is too small.",
  chk_duration: "The video doesn't show the whole shot.",
  chk_frame_rate: "The video is too jumpy.",
  chk_media_type: "A photo can't show the whole shot.",
};

/** What to do about it next time, simply. */
const CAPTURE_TIP: Record<string, string> = {
  chk_body_visible: "Keep your whole body, head to feet, in the picture.",
  chk_lighting: "Film in good light, with the sun behind the camera.",
  chk_contrast: "Stand in front of a plain background.",
  chk_blur: "Use more light, or slow motion, so the video is sharp.",
  chk_stability: "Keep the phone still: rest it on a bag or a stand.",
  chk_single_batter: "Keep other people out of the picture.",
  chk_resolution: "Film closer, so you fill more of the picture.",
  chk_duration: "Film from before the ball is bowled until after the shot.",
  chk_frame_rate: "Use slow motion if your phone has it.",
  chk_camera_view: "Film from the side, level with your hips.",
  chk_media_type: "Send a video to check the whole shot.",
};

const DEFAULT_TIPS = ["Film from the side, with your whole body in the picture.", "Film from before the ball is bowled until after the shot."];

function captureTips(p: AnalysisPayload, problemsOnly = false): { problem: string | null; tips: string[] } {
  const order = (s: string) => (s === "fail" ? 0 : s === "warn" ? 1 : 2);
  const bad = p.capture.checks.filter((c) => c.status === "fail" || c.status === "warn").sort((a, b) => order(a.status) - order(b.status));
  const problem = bad.map((c) => CAPTURE_PROBLEM[c.id]).find(Boolean) ?? null;
  const tips = [...new Set(bad.map((c) => CAPTURE_TIP[c.id]).filter((t): t is string => !!t))];
  if (!problemsOnly) for (const t of DEFAULT_TIPS) if (tips.length < 2 && !tips.includes(t)) tips.push(t);
  return { problem, tips };
}

const metricOf = (p: AnalysisPayload, id: string) => p.metrics.find((m) => m.id === id) ?? p.observations?.find((m) => m.id === id);
const lower = (s: string) => s[0]!.toLowerCase() + s.slice(1);
const cap = (lines: SummaryLine[]) => {
  const seen = new Set<string>();
  return lines.filter((l) => l.text && !seen.has(l.text) && seen.add(l.text)).slice(0, 4);
};

/**
 * The summary of an analysis: the answer first, then at most four short lines (what went well,
 * the one thing to fix, what to remember or do next). Every sentence is plain words, no numbers
 * beyond counting, no units.
 */
export function plainSummary(p: AnalysisPayload, opts: { mediaKind?: "video" | "photo"; otherShot?: TargetShot | null } = {}): PlainSummary {
  const shot: TargetShot = p.requested_shot ?? "front_foot_defence";
  const name = SHOT_NAME[shot];
  const kind = opts.mediaKind ?? (p.mode === "posture_screen" ? "photo" : "video");
  const angle = angleLabel(p.camera_view, kind);
  const media = kind === "photo" ? (p.photo_set ? "photos" : "photo") : "video";

  // A photo: how the position measures up.
  if (p.mode === "posture_screen") {
    const c = p.position_check;
    const graded = c && !["not_side_on", "not_enough", "not_on_front_foot", "not_on_back_foot"].includes(c.verdict);
    const verdicts: Record<NonNullable<typeof c>["verdict"], [string, PlainSummary["tone"]]> = {
      matches: ["Your position looks right.", "ok"],
      mostly: ["Your position is nearly right.", "ok"],
      partly: ["Your position is partly right.", "warn"],
      doesnt_match: ["Your position needs work.", "warn"],
      not_on_front_foot: ["This doesn't look like a front-foot position.", "warn"],
      not_on_back_foot: ["This doesn't look like a back-foot position.", "warn"],
      not_enough: [`Aline couldn't see enough of you in the ${media}.`, "warn"],
      not_side_on: [`Aline can't check this ${media} from this angle.`, "info"],
    };
    const [verdict, tone] = c ? verdicts[c.verdict] : [`Aline couldn't check this ${media}.`, "warn" as const];
    const ms = p.metrics.filter((m) => m.value !== null && m.status !== "not_measured");
    const goods = graded ? ms.filter((m) => m.inRange === true).map(simpleGood).filter((t): t is string => !!t) : [];
    const fixes = graded ? ms.map(simpleFix).filter((t): t is string => !!t) : [];
    const lines: SummaryLine[] = [];
    if (graded && c.checked > 0) lines.push({ kind: "info", text: `${c.met} of ${c.checked} checks are right.` });
    if (goods[0]) lines.push({ kind: "good", text: goods[0] });
    if (fixes[0]) lines.push({ kind: "fix", text: fixes[0] });
    if (c?.verdict === "not_side_on" || c?.angled) lines.push({ kind: "tip", text: "Take the photo from the side to check more." });
    lines.push({ kind: "tip", text: "Send a video to check the whole shot." });
    return { verdict, tone, lines: cap(lines), angle };
  }

  if (p.analysis_status === "capture_failed") {
    const { problem, tips } = captureTips(p);
    const lines: SummaryLine[] = [
      { kind: "info", text: problem ?? `Aline couldn't find you clearly in the ${media}.` },
      ...tips.slice(0, 2).map((t) => ({ kind: "tip" as const, text: t })),
    ];
    return { verdict: `Aline couldn't read this ${media}.`, tone: "bad", lines: cap(lines), angle };
  }

  // A front-foot analysis that saw the back-foot defence's whole definition.
  if (p.status_reason === "looks_back_foot") {
    return {
      verdict: "This looks like a back-foot defence.",
      tone: "info",
      lines: cap([
        { kind: "info", text: "You stepped back, stood tall and didn't step forward." },
        { kind: "info", text: "Aline checked it as a front-foot defence, so there is no score." },
        opts.otherShot === "back_foot_defence"
          ? { kind: "tip", text: "Tap “Check as back-foot defence” to get your feedback." }
          : { kind: "tip", text: "Choose “Back-foot defence” when you check it again." },
      ]),
      angle,
    };
  }

  if (p.analysis_status === "invalid_for_requested_analysis") {
    const seen = p.observed_shot;
    const lines: SummaryLine[] = [];
    if (seen && seen.label !== "unknown") lines.push({ kind: "info", text: `It looks more like a ${lower(SHOT_DISPLAY[seen.label])}.` });
    if (REASON[p.status_reason]) lines.push({ kind: "info", text: REASON[p.status_reason]! });
    if (opts.otherShot) lines.push({ kind: "tip", text: `Tap “Check as ${SHOT_NAME[opts.otherShot]}” to get feedback on it.` });
    lines.push({ kind: "tip", text: `To check a ${name}, record one and try again.` });
    return { verdict: `This is not a ${name}.`, tone: "bad", lines: cap(lines), angle };
  }

  if (p.analysis_status === "uncertain_shot") {
    const { problem, tips } = captureTips(p);
    const lines: SummaryLine[] = [];
    lines.push({ kind: "info", text: REASON[p.status_reason] ?? problem ?? "Aline couldn't see enough of the shot." });
    if (problem && REASON[p.status_reason]) lines.push({ kind: "info", text: problem });
    for (const t of tips.slice(0, 2)) lines.push({ kind: "tip", text: t });
    return { verdict: `Aline can't tell if this is a ${name}.`, tone: "warn", lines: cap(lines), angle };
  }

  // Valid: the shot is confirmed. What went well, the one fix, what to remember.
  const goods: string[] = [];
  for (const s of p.strengths) {
    const m = metricOf(p, s.metricId);
    const t = m ? simpleGood(m) : null;
    if (t && !goods.includes(t)) goods.push(t);
  }
  const fixes: string[] = [];
  for (const f of p.priorities) {
    const m = metricOf(p, f.metricId);
    const t = m ? simpleFix(m) : null;
    if (t && !fixes.includes(t)) fixes.push(t);
  }
  // With nothing listed as a strength, the measures inside their range speak for it.
  if (!goods.length) for (const m of p.metrics) if (m.inRange === true && m.value !== null) { const t = simpleGood(m); if (t && !goods.includes(t)) goods.push(t); }
  const lines: SummaryLine[] = goods.slice(0, 2).map((t) => ({ kind: "good" as const, text: t }));
  if (fixes[0]) lines.push({ kind: "fix", text: fixes[0] });
  else lines.push({ kind: "good", text: "Nothing big to fix. Keep it up." });
  const cue = p.plan?.cue?.trim();
  if (cue) lines.push({ kind: "tip", text: `Remember: “${cue.replace(/\.$/, "")}.”` });
  return { verdict: `This is a ${name}.`, tone: "ok", lines: cap(lines), angle };
}
