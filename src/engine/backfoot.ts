// The back-foot defence (docs/11-back-foot-defence.md). Its base is the back foot: it goes
// back and across first, the front foot follows it in alongside, the weight goes back but the
// head stays forward over the ball, the body stays tall, the front elbow high, and the ball is
// met under the eyes with soft hands. Measured in the picture's own plane, like the
// front-foot line (alignment.ts): side-on along the pitch (+ toward the bowler), from either
// end of the pitch sideways (+ toward the off side), × standing height from the back ankle.

import { arrival, frameSize, landing, offSideSign, type Arrival, type Signal } from "./alignment";
import { BFD_BANDS, BFD_FRONT_FORMULA, BFD_METRICS, BFD_POSITION_FORMULA, BFD_SOURCE } from "./backfoot-defs";
import type { Scene, SemanticJoint } from "./scene";
import type { BackFootPartId, BackFootSummary, CameraView, Handedness, Metric, RangeRef } from "./types";

export type BackFootAxis = "forward" | "sideways";
const PARTS: readonly BackFootPartId[] = ["head", "front_shoulder", "hands", "front_ankle"];

export interface BackFootReading {
  axis: BackFootAxis;
  sideUnclear: boolean;
  reference: number;
  referenceKind: "contact" | "set";
  /** Offsets from the back ankle at the reference (× stature). */
  at: Record<BackFootPartId, number>;
  /** Front elbow height minus front shoulder height (× stature; − = below). */
  elbow: number;
  /** Head above the lower ankle (× stature). */
  headHeight: number;
  /** Head drop from the stance (× stature; + = lower). Video only. */
  headDrop: number;
  /** Back foot's travel back toward the stumps (side-on video). */
  backStep: number;
  /** Front foot's travel back toward the back foot (side-on video). */
  frontBack: number;
  /** Hands' travel in the 250 ms after the reference (× stature). Video only. */
  deadBat: number;
  arrivals: Record<"back_foot" | "front_foot" | "head", Arrival> | null;
  /** Front foot set this long after the back foot (ms; − = before). */
  backFirstMs: number | null;
  /** The last of back foot, front foot and head to set, relative to a seen contact (ms). */
  setLateMs: number | null;
  trace: { from: number; to: number; head: number[]; front_ankle: number[] };
}

const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

/** A part's position in the picture (scene units), averaged over both wrists for the hands. */
function picture(scene: Scene, frame: number, part: BackFootPartId | "back_ankle" | "front_elbow"): [number, number] | null {
  if (part === "hands") {
    const a = scene.inPicture(frame, "front_wrist");
    const b = scene.inPicture(frame, "back_wrist");
    if (a && b) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return a ?? b;
  }
  return scene.inPicture(frame, part as SemanticJoint);
}

/** The batter's size at a frame: its own when the camera moves (a zoom), else the clip's. */
function sizeAt(scene: Scene, frame: number): number {
  const own = scene.cameraMoving ? frameSize(scene, frame) : NaN;
  return Number.isFinite(own) && own > 0 ? own : scene.stature;
}

function offsetsAt(scene: Scene, frame: number, axis: BackFootAxis, sign: number): Record<BackFootPartId, number> {
  const out = { head: NaN, front_shoulder: NaN, hands: NaN, front_ankle: NaN } as Record<BackFootPartId, number>;
  const base = picture(scene, frame, "back_ankle");
  if (!base) return out;
  const S = sizeAt(scene, frame);
  const k = axis === "forward" ? 1 : sign;
  for (const part of PARTS) {
    const p = picture(scene, frame, part);
    if (p) out[part] = (k * (p[0] - base[0])) / S;
  }
  // Contact under the eyes: the hands relative to the head, not the foot.
  out.hands = Number.isFinite(out.hands) && Number.isFinite(out.head) ? out.hands - out.head : NaN;
  return out;
}

const near3 = (scene: Scene, f: number) => [f - 1, f, f + 1].filter((i) => i >= 0 && i < scene.n);

function vertical(scene: Scene, frame: number): { elbow: number; headHeight: number } {
  const els: number[] = [];
  const hhs: number[] = [];
  for (const i of near3(scene, frame)) {
    const S = sizeAt(scene, i);
    const e = scene.inPicture(i, "front_elbow");
    const s = scene.inPicture(i, "front_shoulder");
    if (e && s) els.push((e[1] - s[1]) / S);
    const h = scene.inPicture(i, "head");
    const ankles = [scene.inPicture(i, "front_ankle"), scene.inPicture(i, "back_ankle")].filter((p): p is [number, number] => !!p);
    if (h && ankles.length) hhs.push((h[1] - Math.min(...ankles.map((p) => p[1]))) / S);
  }
  return { elbow: median(els), headHeight: median(hhs) };
}

/**
 * The back-foot defence at one frame (a photo, or a video's contact) and, for video, how it
 * formed. Null when the back ankle and the head aren't seen there.
 */
export function measureBackFoot(scene: Scene, contact: number, view: CameraView, hand: Handedness, opts: { contactKnown?: boolean } = {}): BackFootReading | null {
  const axis: BackFootAxis = scene.plane === "frontal" ? "sideways" : "forward";
  if (axis === "sideways" && !scene.across) return null;
  const { sign, unclear } = axis === "sideways" ? offSideSign(scene, view, hand) : { sign: 1 as const, unclear: false };
  const read = (f: number) => {
    const rs = near3(scene, f).map((i) => offsetsAt(scene, i, axis, sign));
    return Object.fromEntries(PARTS.map((p) => [p, median(rs.map((o) => o[p]))])) as Record<BackFootPartId, number>;
  };
  const atContact = read(contact);
  if (!Number.isFinite(atContact.head)) return null;
  const v0 = vertical(scene, contact);
  const empty: BackFootReading = {
    axis,
    sideUnclear: unclear,
    reference: contact,
    referenceKind: "contact",
    at: atContact,
    elbow: v0.elbow,
    headHeight: v0.headHeight,
    headDrop: NaN,
    backStep: NaN,
    frontBack: NaN,
    deadBat: NaN,
    arrivals: null,
    backFirstMs: null,
    setLateMs: null,
    trace: { from: contact, to: contact, head: [atContact.head], front_ankle: [atContact.front_ankle] },
  };
  const dt = scene.dt;
  if (!dt || scene.n < 5) return empty;

  const S = scene.stature;
  const start = Math.max(0, contact - Math.round(0.9 / dt));
  const end = Math.min(scene.n - 1, contact + Math.max(1, Math.round(0.4 / dt)));
  const pic = (j: SemanticJoint): Signal => (i) => {
    const p = scene.inPicture(i, j);
    return p ? [p[0] / S, p[1] / S] : null;
  };
  // A zoom or pan moves every part in the picture at once: no movement or timing then.
  const arrivals = scene.cameraMoving
    ? null
    : {
        back_foot: landing(pic("back_ankle"), start, contact, scene.n, dt),
        front_foot: landing(pic("front_ankle"), start, contact, scene.n, dt),
        head: arrival(pic("head"), start, contact, scene.n, 0.02, dt),
      };
  const setFrames = arrivals ? [arrivals.back_foot, arrivals.front_foot, arrivals.head].map((a) => a.frame).filter((x): x is number => x !== null) : [];
  const known = opts.contactKnown ?? true;
  const setPoint = setFrames.length >= 2 ? Math.max(...setFrames) : null;
  const ref = !known && setPoint !== null ? setPoint : contact;
  const at = ref === contact ? atContact : read(ref);
  const v = ref === contact ? v0 : vertical(scene, ref);
  if (arrivals) for (const a of Object.values(arrivals)) if (a.frame !== null) a.ms = Math.round((a.frame - ref) * dt * 1000);

  // Standing tall: the head's height at the reference against the tallest it stood before
  // the stroke (85th percentile, so one bad frame can't set it).
  const headU = (i: number) => (scene.inPicture(i, "head")?.[1] ?? NaN) / sizeAt(scene, i);
  const before = Array.from({ length: Math.max(1, ref - start + 1) }, (_, k) => headU(start + k)).filter(Number.isFinite).sort((a, b) => a - b);
  const tall = before.length ? before[Math.min(before.length - 1, Math.floor(before.length * 0.85))]! : NaN;
  const headDrop = tall - median(near3(scene, ref).map(headU));

  // Going back (side-on, fixed camera): where each foot was in the stance against where it is
  // at the reference. + = toward the stumps (away from the bowler).
  let backStep = NaN;
  let frontBack = NaN;
  if (axis === "forward" && !scene.cameraMoving) {
    const x = (j: SemanticJoint, frames: number[]) => median(frames.map((i) => scene.inPicture(i, j)?.[0] ?? NaN));
    const first = [start, start + 1, start + 2].filter((i) => i < scene.n);
    backStep = (x("back_ankle", first) - x("back_ankle", near3(scene, ref))) / S;
    frontBack = (x("front_ankle", first) - x("front_ankle", near3(scene, ref))) / S;
  }

  // Soft hands: how far the hands move in the quarter second after the reference.
  const h0 = picture(scene, ref, "hands");
  let travel = NaN;
  if (h0) {
    let far = 0;
    let seen = 0;
    for (let i = ref + 1; i <= Math.min(scene.n - 1, ref + Math.round(0.25 / dt)); i++) {
      const h = picture(scene, i, "hands");
      if (!h) continue;
      seen++;
      far = Math.max(far, Math.hypot(h[0] - h0[0], h[1] - h0[1]) / sizeAt(scene, i));
    }
    if (seen >= 2) travel = far;
  }

  const bf = arrivals?.back_foot;
  const ff = arrivals?.front_foot;
  const backFirstMs = bf?.frame != null && ff?.frame != null && !ff.still && !bf.still ? Math.round((ff.frame - bf.frame) * dt * 1000) : null;
  const timed = arrivals ? [arrivals.back_foot, arrivals.front_foot, arrivals.head].map((a) => a.ms).filter((x): x is number => x !== null) : [];
  const setLateMs = known && timed.length >= 2 ? Math.max(...timed) : null;
  const trace = Array.from({ length: end - start + 1 }, (_, k) => offsetsAt(scene, start + k, axis, sign));
  return {
    ...empty,
    reference: ref,
    referenceKind: ref === contact ? "contact" : "set",
    at,
    elbow: v.elbow,
    headHeight: v.headHeight,
    headDrop,
    backStep,
    frontBack,
    deadBat: travel,
    arrivals,
    backFirstMs,
    setLateMs,
    trace: { from: start, to: end, head: trace.map((o) => o.head), front_ankle: trace.map((o) => o.front_ankle) },
  };
}

const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

export function backFootSummary(r: BackFootReading): BackFootSummary {
  return {
    axis: r.axis,
    referenceFrame: r.reference,
    referenceKind: r.referenceKind,
    atReference: Object.fromEntries(PARTS.map((p) => [p, r3(r.at[p])])) as BackFootSummary["atReference"],
    backStep: r3(r.backStep),
    headDrop: r3(r.headDrop),
    arrivals: r.arrivals
      ? (Object.fromEntries(Object.entries(r.arrivals).map(([k, v]) => [k, { frame: v.frame, ms: v.ms, still: v.still }])) as BackFootSummary["arrivals"])
      : null,
    trace: { from: r.trace.from, to: r.trace.to, head: r.trace.head.map(r3), front_ankle: r.trace.front_ankle.map(r3) },
  };
}

const SOURCE: RangeRef = { lo: 0, hi: 0, kind: "provisional_coaching", cohort: "Club-to-international batters, back-foot defence", source: BFD_SOURCE };

export interface BackFootMetricOptions {
  /** One photo, taken to be contact (the reference is "this photo"). */
  photo?: boolean;
  /** The frames the reading came from, for evidence links. */
  evidenceFrame?: number;
}

/**
 * The back-foot defence's measures from a reading. A value that can't be read here is "not
 * measured" with the reason, never zero; along the pitch the forward distances run toward
 * the camera, so the sideways reading of the same thing is graded instead.
 */
export function backFootMetrics(r: BackFootReading, scene: Scene, opts: BackFootMetricOptions = {}): Metric[] {
  const sideways = r.axis === "sideways";
  const ref = opts.evidenceFrame ?? r.reference;
  const atSet = !opts.photo && r.referenceKind === "set";
  const dt = scene.dt ?? 1 / 30;
  const out: Metric[] = [];
  const ids = opts.photo ? (sideways ? BFD_FRONT_FORMULA : BFD_POSITION_FORMULA) : BFD_METRICS.filter((d) => d.only !== "photo").map((d) => d.id);
  for (const id of ids) {
    const def = BFD_METRICS.find((d) => d.id === id)!;
    const notMeasured = (reason: string): Metric => ({
      id,
      name: def.name,
      domain: def.domain,
      status: "not_measured",
      value: null,
      uncertainty: null,
      unit: def.unit,
      decimals: def.decimals,
      confidence: 0,
      phase: opts.photo ? "Photo" : def.phase,
      meaning: def.meaning,
      relevance: def.relevance,
      range: null,
      inRange: null,
      evidenceIds: [],
      reason,
    });
    let value = NaN;
    let unc = 0.02;
    let band = def.range;
    let axis: Metric["axis"];
    let limitation: string | undefined;
    switch (id) {
      case "bfd_back_step":
        if (sideways) {
          out.push(notMeasured("Filmed along the pitch: going back runs toward the camera, so it can't be measured. Film side-on to measure it."));
          continue;
        }
        if (scene.cameraMoving) {
          out.push(notMeasured("The camera zoomed or panned during the shot, so the feet's own movement can't be separated from it."));
          continue;
        }
        value = r.backStep;
        break;
      case "bfd_feet_gap":
        if (sideways) {
          out.push(notMeasured("Filmed along the pitch: the gap between the feet runs toward the camera. Film side-on to measure it."));
          continue;
        }
        value = r.at.front_ankle;
        break;
      case "bfd_head":
        value = r.at.head;
        axis = r.axis;
        if (sideways) band = def.rangeSideways ?? band;
        if (sideways && r.sideUnclear) {
          out.push(notMeasured("Which side is the off side isn't clear (batting hand and toes disagree), so the head's side can't be graded."));
          continue;
        }
        break;
      case "bfd_tall":
        value = r.headDrop;
        break;
      case "bfd_head_height":
        value = r.headHeight;
        break;
      case "bfd_elbow":
        value = r.elbow;
        unc = 0.025;
        break;
      case "bfd_hands_eyes":
        value = r.at.hands;
        axis = r.axis;
        if (sideways) band = def.rangeSideways ?? band;
        limitation = "The hands are tracked through gloves on the bat handle: ±3% of height.";
        unc = 0.03;
        break;
      case "bfd_dead_bat":
        value = r.deadBat;
        unc = 0.03;
        if (atSet) limitation = "Contact wasn't seen: measured from the set position the ball was met from.";
        break;
      case "bfd_back_first":
        if (r.backFirstMs === null) {
          out.push(notMeasured(r.arrivals ? "One of the feet hardly moved, so there's no order to time." : "The camera zoomed or panned, or the clip is too short, to time the feet."));
          continue;
        }
        value = r.backFirstMs;
        unc = Math.round(dt * 1000);
        break;
      case "bfd_set_late":
        if (r.setLateMs === null) {
          out.push(notMeasured(atSet ? "Contact wasn't seen (no bat and ball in view), so being set before it can't be judged." : "The movement couldn't be timed in this clip."));
          continue;
        }
        value = r.setLateMs;
        unc = Math.round(dt * 1000);
        break;
    }
    if (!Number.isFinite(value) || !band) {
      out.push(notMeasured("Not measured: the batter's back foot, head or arms weren't seen clearly enough here."));
      continue;
    }
    const v = Math.round(value * 10 ** def.decimals) / 10 ** def.decimals;
    const inRange = v >= band.lo && v <= band.hi;
    out.push({
      id,
      name: def.name,
      domain: def.domain,
      status: sideways || opts.photo ? "estimated" : "measured",
      value: v,
      uncertainty: unc,
      unit: def.unit,
      decimals: def.decimals,
      confidence: sideways ? 0.6 : 0.75,
      phase: opts.photo ? "Photo" : atSet && def.phase === "Contact" ? "Set position" : def.phase,
      meaning: def.meaning,
      relevance: def.relevance,
      range: { ...SOURCE, lo: band.lo, hi: band.hi },
      inRange,
      evidenceIds: [`frame_${ref}`],
      ...(axis ? { axis } : {}),
      ...(limitation ? { limitation } : {}),
    });
  }
  return out;
}

/** Bands for the report's view (× stature from the back ankle). */
export function backFootBands(axis: BackFootAxis) {
  return {
    head: axis === "forward" ? BFD_BANDS.head.forward : BFD_BANDS.head.sideways,
    hands: axis === "forward" ? BFD_BANDS.handsEyes.forward : BFD_BANDS.handsEyes.sideways,
    feetGap: BFD_BANDS.feetGap,
  };
}
