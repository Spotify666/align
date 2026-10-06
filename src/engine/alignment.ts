// The front-foot defence is built on one line. From the moment the front foot lands until
// the bat meets the ball, the head, the front shoulder and the front knee stack over the
// front foot, the front shoulder leading the body into the line of the ball; and the foot,
// the knee and the shoulder arrive in that position together. This module measures exactly
// that, along whichever axis the camera sees:
//  - side-on: along the pitch (forward of the front ankle, toward the bowler);
//  - from either end of the pitch: sideways (toward the off side of the front ankle).
// Offsets are taken from the front ankle (the most reliably tracked point of the foot; the
// toe landmark moves with how the foot is turned), in units of the batter's standing height,
// so the same numbers hold for any batter and any length of ball: the stride changes with
// the length, the stack over the front foot does not.
//
// Ranges. Sideways: the 5th–95th percentile of 323 front-foot defences by international
// batters (KU CricShot 3D: monocular 3D pose estimates from broadcast footage, at the deepest
// point of the stride), widened by 1% of height for landmark error; sideways is in the
// picture, so those estimates hold. (The 10th–90th put a fifth of international batters,
// Dravid's own broadcast frames among them, "out of line".) Forward (side-on):
// the same estimates compress distances toward the camera (their strides read about half
// what side-on footage shows), so the forward ranges are coaching geometry (head over the
// front toe, shoulder over the knee, knee over the foot) checked against side-on photos of
// defences. Provisional: not lab measurements.

import type { Scene, SemanticJoint } from "./scene";
import type { CameraView, Handedness, LineSummary } from "./types";

export type LinePart = "head" | "shoulder" | "knee";
export const LINE_PARTS: readonly LinePart[] = ["head", "shoulder", "knee"];
export type LineAxis = "forward" | "sideways";

const JOINT_OF: Record<LinePart, SemanticJoint> = { head: "head", shoulder: "front_shoulder", knee: "front_knee" };

/** Where each part sits relative to the front ankle in professionals' defences (× stature). */
export const LINE_BANDS: Record<LineAxis, Record<LinePart, readonly [number, number]>> = {
  // + = toward the bowler.
  forward: { head: [-0.03, 0.16], shoulder: [-0.03, 0.11], knee: [-0.04, 0.05] },
  // + = toward the off side. The head goes over the line of the ball, which passes just
  // outside the front pad; the shoulder and knee stay over the foot.
  sideways: { head: [0.03, 0.23], shoulder: [-0.07, 0.11], knee: [-0.07, 0.06] },
};

/** Landmark noise allowed on top of a band when deciding whether a frame is in line. */
const IN_LINE_TOL = 0.01;

export const LINE_SOURCE = "Side-on: coaching geometry (head over the front toe, front shoulder over the knee, knee over the foot), checked against side-on photos of defences. Provisional.";
export const LINE_SOURCE_SIDEWAYS = "From either end of the pitch: 5th–95th percentile of 323 front-foot defences by international batters (KU CricShot 3D pose estimates), widened by 1% of height for landmark error. Provisional.";

export type Offsets = Record<LinePart, number>;

export interface Arrival {
  /** Frame from which the part stays in its contact position (null: not seen, or it never moved). */
  frame: number | null;
  /** Relative to contact, ms (negative = before contact). */
  ms: number | null;
  /** First frame it clearly starts moving toward that position. */
  onset: number | null;
  /** Hardly moved through the stroke (nothing to time). */
  still: boolean;
}

export interface Alignment {
  axis: LineAxis;
  /**
   * The frame the line is read at. "contact": the bat meeting the ball was seen (or marked).
   * "set": it wasn't, so the line is read where the front foot, knee and shoulder have all
   * arrived: in a defence the ball is met from that position, and it is found from the
   * body's own movement (the hands, gripping a bat in gloves, are tracked too poorly to time
   * contact by).
   */
  reference: number;
  referenceKind: "contact" | "set";
  /** Off side unclear (batting hand and toes disagree): the head's sideways side can't be graded. */
  sideUnclear: boolean;
  atContact: Offsets;
  /** Video: share of frames from the front foot's landing to contact with every part in line. */
  held: number | null;
  heldFrames: number;
  arrivals: Record<"foot" | "knee" | "shoulder" | "head", Arrival> | null;
  /** Spread of the foot, knee and shoulder arrival times (ms), when at least two moved. */
  spreadMs: number | null;
  /** The last of foot, knee and shoulder to arrive, relative to contact (ms). */
  latestMs: number | null;
  /** Per-frame offsets over the stroke, for the report's line chart. */
  trace: { from: number; to: number; offsets: Offsets[] };
}

/** Which way the off side lies in the picture along the pitch: +1 image right, −1 image left. */
export function offSideSign(scene: Scene, view: CameraView, hand: Handedness): { sign: 1 | -1; unclear: boolean } {
  // A right-hander faces the off side. From the bowler's end that is the picture's left;
  // from behind the batter, its right. Mirror for a left-hander.
  const right = hand === "right";
  const sign: 1 | -1 = view === "behind" ? (right ? 1 : -1) : right ? -1 : 1;
  // Cross-check: in a stance the toes point to the off side.
  const across = scene.across;
  if (!across) return { sign, unclear: false };
  const toes: number[] = [];
  for (let i = 0; i < scene.n; i++)
    for (const side of ["front", "back"] as const) {
      const d = across(i, `${side}_foot`) - across(i, `${side}_ankle`);
      if (Number.isFinite(d)) toes.push(d);
    }
  toes.sort((a, b) => a - b);
  const med = toes.length ? toes[Math.floor(toes.length / 2)]! : 0;
  const unclear = Math.abs(med) > 0.02 * scene.stature && Math.sign(med) !== sign;
  return { sign, unclear };
}

/**
 * The batter's standing height in the picture at one frame (scene units), from the legs
 * and trunk as the scene does: a zooming camera changes it from frame to frame, and a
 * rolling estimate lags a zoom, so offsets are measured against the frame's own size.
 */
function frameSize(scene: Scene, frame: number): number {
  const sizes: number[] = [];
  for (let i = frame - 1; i <= frame + 1; i++) {
    const d = (a: SemanticJoint, b: SemanticJoint) => {
      const p = scene.inPicture(i, a);
      const q = scene.inPicture(i, b);
      return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : NaN;
    };
    const legs = [d("front_hip", "front_knee") + d("front_knee", "front_ankle"), d("back_hip", "back_knee") + d("back_knee", "back_ankle")].filter(Number.isFinite);
    const trunk = [d("front_hip", "front_shoulder"), d("back_hip", "back_shoulder")].filter(Number.isFinite);
    if (legs.length && trunk.length) sizes.push((Math.max(...legs) + trunk.reduce((a, b) => a + b, 0) / trunk.length) / 0.779);
  }
  return median(sizes);
}

function offsetsAt(scene: Scene, frame: number, axis: LineAxis, sign: number): Offsets {
  const out = { head: NaN, shoulder: NaN, knee: NaN };
  // Side-on the picture's horizontal is the forward axis; from either end it is sideways
  // (never the 3D estimate). Signed so + is toward the bowler, or toward the off side.
  const a = scene.inPicture(frame, "front_ankle");
  if (!a) return out;
  const own = scene.cameraMoving ? frameSize(scene, frame) : NaN;
  const S = Number.isFinite(own) && own > 0 ? own : scene.stature;
  const k = axis === "forward" ? 1 : sign;
  for (const part of LINE_PARTS) {
    const p = scene.inPicture(frame, JOINT_OF[part]);
    if (p) out[part] = (k * (p[0] - a[0])) / S;
  }
  return out;
}

const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

/** Is every seen part inside its band (with landmark tolerance)? Null when fewer than two are seen. */
export function inLine(o: Offsets, axis: LineAxis, skipHead = false): boolean | null {
  const parts = LINE_PARTS.filter((p) => !(skipHead && p === "head") && Number.isFinite(o[p]));
  if (parts.length < 2) return null;
  return parts.every((p) => o[p] >= LINE_BANDS[axis][p][0] - IN_LINE_TOL && o[p] <= LINE_BANDS[axis][p][1] + IN_LINE_TOL);
}

type Signal = (i: number) => number[] | null;

/**
 * When a part reaches its set position. Each part travels from where it was before the
 * stroke to where the stroke takes it (the front foot to its landing, the hips down as the
 * front knee bends, the shoulder and head forward and down over the ball) and stops there.
 * Its set position is the furthest it gets from where it started, between 300 ms before and
 * 400 ms after contact; it has arrived from the first frame it is within 15% of that travel
 * (at least `floor`) of it and stays there. Found from the part's own movement, so an
 * error in the contact estimate doesn't move it.
 */
function arrival(raw: Signal, start: number, contact: number, n: number, floor: number, dt: number): Arrival {
  const none: Arrival = { frame: null, ms: null, onset: null, still: false };
  // Averaged over ±30 ms: at high frame rates a frame's landmark noise is as large as a
  // frame's movement.
  const r = Math.max(1, Math.round(0.03 / dt));
  const memo = new Map<number, number[] | null>();
  const sig: Signal = (i) => {
    if (memo.has(i)) return memo.get(i)!;
    const vs: number[][] = [];
    for (let k = i - r; k <= i + r; k++) if (k >= 0 && k < n) { const v = raw(k); if (v) vs.push(v); }
    const out = vs.length && raw(i) ? vs[0]!.map((_, c) => vs.reduce((a, v) => a + v[c]!, 0) / vs.length) : null;
    memo.set(i, out);
    return out;
  };
  const at = (frames: number[]) => {
    const vs = frames.filter((i) => i >= 0 && i < n).map(sig).filter((v): v is number[] => !!v);
    return vs.length ? vs[0]!.map((_, k) => median(vs.map((v) => v[k]!))) : null;
  };
  const s0 = at([start, start + 1, start + 2]);
  if (!s0) return none;
  const lo = Math.max(start, contact - Math.round(0.3 / dt));
  const hi = Math.min(n - 1, contact + Math.round(0.4 / dt));
  const from = (r: number[]) => (i: number) => {
    const v = sig(i);
    return v ? Math.hypot(...v.map((x, k) => x - r[k]!)) : NaN;
  };
  const d0 = from(s0);
  let seen = 0;
  for (let i = start; i <= hi; i++) if (sig(i)) seen++;
  if (seen < 0.6 * (hi - start + 1)) return none;
  // The set position: furthest from the start (a 3-frame median, so one bad frame can't be it).
  let e = -1;
  let travel = 0;
  for (let i = lo; i <= hi; i++) {
    const d = median([i - 1, i, i + 1].map(d0));
    if (Number.isFinite(d) && d > travel) {
      travel = d;
      e = i;
    }
  }
  if (e < 0) return none;
  if (travel < 2 * floor) return { ...none, still: true };
  const set = at([e - 1, e, e + 1])!;
  const dSet = from(set);
  const tol = Math.max(0.15 * travel, floor);
  let frame = e;
  for (let i = e; i >= start; i--) {
    const d = dSet(i);
    if (Number.isFinite(d) && d > tol) break;
    frame = i;
  }
  // Onset: the last frame it was still within 15% of the travel from where it started.
  let onset: number | null = null;
  for (let i = start; i < frame; i++) {
    const d = d0(i);
    if (Number.isFinite(d) && d <= Math.max(0.15 * travel, floor)) onset = i;
  }
  return { frame, ms: Math.round((frame - contact) * dt * 1000), onset, still: false };
}

/**
 * When the front foot lands: it comes to rest and stays there. Its speed in the picture
 * (±30 ms average) last exceeds a third of a stature per second before 300 ms past contact
 * (a planted front foot doesn't move again in a defence). From either end of the pitch a
 * stride toward the camera hardly moves the foot across the picture, so where it ends up
 * says less than when it stops.
 */
function landing(raw: Signal, start: number, contact: number, n: number, dt: number): Arrival {
  const none: Arrival = { frame: null, ms: null, onset: null, still: false };
  const r = Math.max(1, Math.round(0.03 / dt));
  const avg = (i: number) => {
    const vs: number[][] = [];
    for (let k = i - r; k <= i + r; k++) if (k >= 0 && k < n) { const v = raw(k); if (v) vs.push(v); }
    return vs.length ? vs[0]!.map((_, c) => vs.reduce((a, v) => a + v[c]!, 0) / vs.length) : null;
  };
  const end = Math.min(n - 2, contact + Math.round(0.3 / dt));
  const speed: number[] = [];
  for (let i = start; i <= end; i++) {
    const a = avg(i - 1);
    const b = avg(i + 1);
    speed.push(a && b ? Math.hypot(...a.map((x, c) => b[c]! - x)) / (2 * dt) : NaN);
  }
  const seen = speed.filter(Number.isFinite);
  if (seen.length < 0.6 * speed.length) return none;
  const thr = 0.33;
  if (Math.max(...seen) < 2 * thr) return { ...none, still: true };
  let last = -1;
  speed.forEach((v, k) => {
    if (Number.isFinite(v) && v > thr) last = start + k;
  });
  const frame = Math.min(end, last + 1);
  let onset: number | null = null;
  for (let k = 0; k < speed.length && start + k < frame; k++) if (Number.isFinite(speed[k]!) && speed[k]! > thr) { onset = start + k; break; }
  return { frame, ms: Math.round((frame - contact) * dt * 1000), onset, still: false };
}

/**
 * The line at one frame (a photo, or a video's contact frame) plus, for video, how it was
 * held and how the parts arrived. `contact` is the frame the bat meets the ball (a photo: 0).
 */
export function measureAlignment(scene: Scene, contact: number, view: CameraView, hand: Handedness, opts: { contactKnown?: boolean } = {}): Alignment | null {
  const axis: LineAxis = scene.plane === "frontal" ? "sideways" : "forward";
  if (axis === "sideways" && !scene.across) return null;
  const { sign, unclear } = axis === "sideways" ? offSideSign(scene, view, hand) : { sign: 1, unclear: false };
  const S = scene.stature;
  // Around contact: ±1 frame. A zooming camera: the frames within 120 ms where the picture's
  // scale is steady (a zoom mid-frame reads the body against two different sizes).
  const steady = (i: number) => {
    const [a, b, c] = [frameSize(scene, i - 1), frameSize(scene, i), frameSize(scene, i + 1)];
    return [a, b, c].every((x) => Number.isFinite(x) && x > 0) && Math.abs(Math.log(b / a)) < 0.06 && Math.abs(Math.log(c / b)) < 0.06;
  };
  const near = (k: number) => Array.from({ length: 2 * k + 1 }, (_, o) => contact - k + o).filter((i) => i >= 0 && i < scene.n);
  const window = !scene.dt ? [contact] : scene.cameraMoving ? near(Math.max(1, Math.round(0.12 / scene.dt))).filter(steady) : near(1);
  const reads = window.map((i) => offsetsAt(scene, i, axis, sign));
  const atContact = { head: median(reads.map((o) => o.head)), shoulder: median(reads.map((o) => o.shoulder)), knee: median(reads.map((o) => o.knee)) };
  if (LINE_PARTS.filter((p) => Number.isFinite(atContact[p])).length < 2) return null;

  const empty: Alignment = { axis, reference: contact, referenceKind: "contact", sideUnclear: unclear, atContact, held: null, heldFrames: 0, arrivals: null, spreadMs: null, latestMs: null, trace: { from: contact, to: contact, offsets: [atContact] } };
  const dt = scene.dt;
  // A zoom or pan moves every part in the picture at once: no movement timing then.
  if (!dt || scene.n < 5 || scene.cameraMoving) return empty;

  const start = Math.max(0, contact - Math.round(0.9 / dt));
  const end = Math.min(scene.n - 1, contact + Math.max(1, Math.round(0.4 / dt)));
  const pic = (j: SemanticJoint): Signal => (i) => {
    const p = scene.inPicture(i, j);
    return p ? [p[0] / S, p[1] / S] : null;
  };
  // The knee in sync means the knee taking the weight: seen from any camera position as the
  // hips lowering. (Its angle alone passes through its final value mid-stride, foot in the air.)
  const knee: Signal = (i) => {
    const a = scene.inPicture(i, "front_hip");
    const b = scene.inPicture(i, "back_hip");
    return a && b ? [(a[1] + b[1]) / 2 / S] : null;
  };
  const arrivals = {
    foot: landing(pic("front_ankle"), start, contact, scene.n, dt),
    knee: arrival(knee, start, contact, scene.n, 0.015, dt),
    shoulder: arrival(pic("front_shoulder"), start, contact, scene.n, 0.02, dt),
    head: arrival(pic("head"), start, contact, scene.n, 0.02, dt),
  };
  const setFrames = [arrivals.foot, arrivals.knee, arrivals.shoulder].map((a) => a.frame).filter((x): x is number => x !== null);
  const setPoint = setFrames.length >= 2 ? Math.max(...setFrames) : null;
  const known = opts.contactKnown ?? true;
  const ref = !known && setPoint !== null ? setPoint : contact;
  const lineAt = (f: number) => {
    const rs = [f - 1, f, f + 1].filter((i) => i >= 0 && i < scene.n).map((i) => offsetsAt(scene, i, axis, sign));
    return { head: median(rs.map((o) => o.head)), shoulder: median(rs.map((o) => o.shoulder)), knee: median(rs.map((o) => o.knee)) };
  };
  const line = ref === contact ? atContact : lineAt(ref);
  // Arrival times relative to the frame the line is read at.
  for (const a of Object.values(arrivals)) if (a.frame !== null) a.ms = Math.round((a.frame - ref) * dt * 1000);
  const timed = [arrivals.foot, arrivals.knee, arrivals.shoulder].map((a) => a.ms).filter((x): x is number => x !== null);
  const spreadMs = timed.length >= 2 ? Math.max(...timed) - Math.min(...timed) : null;
  // Set before contact can only be judged against a contact that was seen.
  const latestMs = known && timed.length >= 2 ? Math.max(...timed) : null;

  // Held: from the front foot's landing (or 150 ms before the reference when the landing
  // isn't seen) to the reference frame, every frame in line. A foot still travelling at a
  // seen contact never set the line before the ball arrived: held for none of it.
  const late = known && (arrivals.foot.ms ?? 0) > 0;
  // At least the last 100 ms, so a foot settling as the ball arrives is still judged.
  const from = Math.min(arrivals.foot.frame ?? ref - Math.round(0.15 / dt), ref - Math.max(2, Math.round(0.1 / dt)));
  let ok = 0;
  let counted = 0;
  for (let i = Math.max(0, from); i <= ref && !late; i++) {
    const v = inLine(offsetsAt(scene, i, axis, sign), axis, unclear);
    if (v === null) continue;
    counted++;
    if (v) ok++;
  }
  const traceFrom = start;
  const traceTo = end;
  const offsets = Array.from({ length: traceTo - traceFrom + 1 }, (_, k) => offsetsAt(scene, traceFrom + k, axis, sign));
  return {
    ...empty,
    reference: ref,
    referenceKind: ref === contact ? "contact" : "set",
    atContact: line,
    held: late ? 0 : counted >= 2 ? ok / counted : null,
    heldFrames: counted,
    arrivals,
    spreadMs,
    latestMs,
    trace: { from: traceFrom, to: traceTo, offsets },
  };
}

const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/** The line for the payload: rounded, so the result hash is stable and the payload small. */
export function lineSummary(a: Alignment): LineSummary {
  const b = LINE_BANDS[a.axis];
  return {
    axis: a.axis,
    referenceFrame: a.reference,
    referenceKind: a.referenceKind,
    atReference: { head: r3(a.atContact.head), shoulder: r3(a.atContact.shoulder), knee: r3(a.atContact.knee) },
    bands: { head: [b.head[0], b.head[1]], shoulder: [b.shoulder[0], b.shoulder[1]], knee: [b.knee[0], b.knee[1]] },
    sideUnclear: a.sideUnclear,
    held: a.held === null ? null : r3(a.held),
    arrivals: a.arrivals
      ? (Object.fromEntries(Object.entries(a.arrivals).map(([k, v]) => [k, { frame: v.frame, ms: v.ms, still: v.still }])) as LineSummary["arrivals"])
      : null,
    spreadMs: a.spreadMs,
    latestMs: a.latestMs,
    trace: {
      from: a.trace.from,
      to: a.trace.to,
      head: a.trace.offsets.map((o) => r3(o.head)),
      shoulder: a.trace.offsets.map((o) => r3(o.shoulder)),
      knee: a.trace.offsets.map((o) => r3(o.knee)),
    },
  };
}
