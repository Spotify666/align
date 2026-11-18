// The one body-and-bat rig every figure in Aline is solved with: the shot-model editor
// (placeBat, dragHandle), the fitted motion of a real or generated take
// (src/lib/motion), and the drawing of the gloves on the handle (src/lib/mannequin.ts). Asked for
// on 2026-11-18: "one motion system for any cricket batting shot… the same human skeleton,
// equipment model, camera model and physical constraints as every other shot".
//
// What this file is, and is not:
// - Pure geometry: two bones reaching for a target with a stable bend direction, an arm closing on
//   a grip of the bat, the bat as one rigid body with its grip anchors. Units: body heights. Axes:
//   forward (toward the bowler), up, across (toward the off side), as everywhere in the engine.
// - It is NOT part of the analysis: `analyze` never reads it (tests/rig.test.ts), and nothing in it
//   is an engine threshold. Its sizes and limits are a drawing's and a rig's (an adult's hand, a
//   full-size bat, a wrist's range), not measures.
// - It never decides how a shot is played. Where the footage says where an elbow or a wrist is, the
//   rig follows it; it only fills in what one camera can't see, and says what it filled in.

export type V3 = readonly [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const mid = (a: V3, b: V3): V3 => mul(add(a, b), 0.5);
export const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
export const unit = (a: V3): V3 | null => {
  const l = len(a);
  return l > 1e-9 ? mul(a, 1 / l) : null;
};
export const distance = (a: V3, b: V3) => len(sub(a, b));
/** `a` with its part along unit `axis` taken out. */
export const perpTo = (a: V3, axis: V3): V3 => sub(a, mul(axis, dot(a, axis)));
/** The angle between two directions, degrees. */
export const angleDeg = (a: V3, b: V3) => {
  const ua = unit(a);
  const ub = unit(b);
  if (!ua || !ub) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot(ua, ub)))) * 180) / Math.PI;
};
/** Some direction square to `a`. */
const anyPerp = (a: V3): V3 => unit(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))!;

/** Turns `v` about unit `axis` by `rad` (Rodrigues). */
export function rotate(v: V3, axis: V3, rad: number): V3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}
/** Spherical interpolation between two directions (unit result). */
export function slerpDir(a: V3, b: V3, t: number): V3 {
  const ua = unit(a) ?? [0, -1, 0];
  const ub = unit(b) ?? ua;
  const c = Math.min(1, Math.max(-1, dot(ua, ub)));
  const th = Math.acos(c);
  if (th < 1e-6) return ua;
  const axis = unit(cross(ua, ub)) ?? anyPerp(ua);
  return rotate(ua, axis, th * t);
}

// ---------- The bat and the grip ----------

/**
 * A full-size bat (86 cm) on a 175 cm batter, in body heights: from the handle point (where the two
 * gloves meet) to the toe, the handle above it, the blade's length, width and depth. A rig's sizes.
 */
export const BAT = { handsToToe: 0.43, aboveHands: 0.06, blade: 0.32, width: 0.062, depth: 0.034 } as const;

/**
 * Where each hand holds the handle, and the hand itself (body heights): the top hand's grip
 * `top` above the handle point and the bottom hand's `bottom` below it (the two gloves touching),
 * each wrist `hand` back from its grip. The solver places the wrists against these anchors and the
 * gloves are drawn on the same anchors (`gripPoint`): one source, so they can't disagree.
 */
export const GRIP = { top: 0.03, bottom: 0.035, hand: 0.05 } as const;

/**
 * How far a hand on the handle bends from its forearm's line, degrees, in any direction (flexion,
 * extension and deviation together). A wrist can go further, but a batter's hands on a handle carry
 * on the line of the forearms, cocked only a little (the owner, 2026-11-17: "right wrist facing
 * upwards, left side wrist downwards, the core human motion logic is missing"), and a tracker's
 * wrist and a two-point bat put the hand anywhere round the grip: this keeps the evidence's hand
 * inside a grip's range. The forearm's own twist (pronation and supination) is separate: it turns
 * the palm, not the hand's line (`palmNormal`, `forearmTwistDeg`).
 */
export const WRIST = { maxBendDeg: 25 } as const;

export type GripSide = "front" | "back";
/** Which hands hold the bat: both, one, or none (released). Annotated per shot, never guessed. */
export type GripState = "both" | "top" | "bottom" | "none";
export const holds = (state: GripState, side: GripSide) => state === "both" || (side === "front" ? state === "top" : state === "bottom");

/** Where a hand's grip is on the handle (the top hand is the front wrist's). */
export function gripPoint(handle: V3, dir: V3, side: GripSide): V3 {
  return add(handle, mul(dir, side === "front" ? -GRIP.top : GRIP.bottom));
}

/** The bat's frame: along (handle to toe), the face's normal (toward the bowler unless observed), and across the blade. */
export function batFrame(dir: V3, faceHint: V3 | null = null): { along: V3; face: V3; across: V3 } {
  const along = unit(dir) ?? ([0, -1, 0] as V3);
  const face = unit(perpTo(faceHint ?? [1, 0, 0], along)) ?? unit(perpTo([0, 0, 1], along)) ?? anyPerp(along);
  return { along, face, across: unit(cross(along, face)) ?? anyPerp(along) };
}

// ---------- Two bones ----------

export interface Reach {
  mid: V3;
  end: V3;
  /** Whether the end got to the target (false: as far toward it as the bones go). */
  reached: boolean;
  /** The bend plane's normal (unit): root→end × root→mid. Kept steady from frame to frame. */
  normal: V3;
}

/**
 * Two bones of lengths `a` and `b` from `root` reaching for `target`: the end goes to the target or
 * as far toward it as the bones go, never past. The middle joint (elbow, knee) bends toward `pole`.
 * Near full extension the pole says little, so the bend keeps the side it was on (`prevNormal`):
 * an elbow or a knee never flips through the straight position.
 */
export function twoBone(root: V3, a: number, b: number, target: V3, pole: V3, prevNormal: V3 | null = null): Reach {
  const span = sub(target, root);
  const dir = unit(span) ?? ([0, -1, 0] as V3);
  const want = len(span);
  const d = Math.min(Math.max(want, Math.abs(a - b) + 1e-6), a + b - 1e-6);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - x * x, 0));
  let perp = unit(perpTo(pole, dir));
  if (prevNormal) {
    // The pole's direction implied by the previous bend plane, in this frame.
    const fromPrev = unit(cross(prevNormal, dir));
    const straightness = 1 - h / Math.max(a, 1e-9); // 0 bent square, 1 straight
    if (fromPrev && (!perp || (dot(perp, fromPrev) < 0 && straightness > 0.85))) perp = fromPrev;
  }
  if (!perp) perp = anyPerp(dir);
  const m = add(add(root, mul(dir, x)), mul(perp, h));
  const e = add(root, mul(dir, d));
  const normal = unit(cross(sub(e, root), sub(m, root))) ?? prevNormal ?? anyPerp(dir);
  return { mid: m, end: e, reached: Math.abs(want - d) < 1e-4, normal };
}

// ---------- An arm closing on a grip ----------

export interface ArmToGrip {
  elbow: V3;
  wrist: V3;
  /** How far the grip is beyond the arm's reach (zero vector when it reaches). */
  short: V3;
  normal: V3;
  /** The wrist's bend from the forearm's line, degrees, after its limit. */
  bendDeg: number;
}

/**
 * One arm holding the bat at `grip`: the hand runs `GRIP.hand` from the wrist to the grip, the arm
 * reaches from the shoulder to the wrist. Where the wrist goes on the circle round the grip comes
 * from `wristHint` (the tracked wrist, or the wrist where it is now: never a fixed angle), held to
 * the wrist's range against the forearm. The elbow bends toward `elbowHint` blended with the body's
 * own preference (`preferred`), by `hintWeight` (the hint's confidence).
 */
export function armToGrip(o: {
  shoulder: V3;
  upper: number;
  fore: number;
  grip: V3;
  wristHint: V3 | null;
  elbowHint: V3 | null;
  hintWeight: number;
  preferred: V3;
  prevNormal?: V3 | null;
}): ArmToGrip {
  const { shoulder, upper, fore, grip } = o;
  const elbowPole = (): V3 => {
    const pref = unit(o.preferred) ?? ([0, -1, 0] as V3);
    const hint = o.elbowHint ? unit(sub(o.elbowHint, shoulder)) : null;
    const w = hint ? Math.max(0, Math.min(1, o.hintWeight)) : 0;
    return add(mul(hint ?? pref, w), mul(pref, 1 - w));
  };
  // The hand's direction (wrist to grip): from the hint, else pointing away from the shoulder.
  let handDir = unit(sub(grip, o.wristHint ?? shoulder)) ?? unit(sub(grip, shoulder)) ?? ([0, -1, 0] as V3);
  let wrist = sub(grip, mul(handDir, GRIP.hand));
  // Out of reach: the wrist slides round the grip toward the shoulder first.
  if (distance(shoulder, wrist) > upper + fore - 1e-6) {
    handDir = unit(sub(grip, shoulder)) ?? handDir;
    wrist = sub(grip, mul(handDir, GRIP.hand));
  }
  let r = twoBone(shoulder, upper, fore, wrist, elbowPole(), o.prevNormal ?? null);
  let bend = angleDeg(sub(r.end, r.mid), handDir);
  // The wrist's limit: turn the hand toward the forearm's line by what is past it, then solve again.
  for (let i = 0; i < 12 && bend > WRIST.maxBendDeg - 0.01; i++) {
    const forearm = unit(sub(r.end, r.mid))!;
    const axis = unit(cross(handDir, forearm));
    if (!axis) break;
    handDir = rotate(handDir, axis, ((bend - WRIST.maxBendDeg + 0.5) * Math.PI) / 180);
    wrist = sub(grip, mul(handDir, GRIP.hand));
    r = twoBone(shoulder, upper, fore, wrist, elbowPole(), r.normal);
    bend = angleDeg(sub(r.end, r.mid), handDir);
  }
  const reachedWrist = r.end;
  const gripReached = add(reachedWrist, mul(handDir, GRIP.hand));
  return { elbow: r.mid, wrist: reachedWrist, short: sub(gripReached, grip), normal: r.normal, bendDeg: bend };
}

/**
 * The palm's normal for a hand on the handle (unit): the hand's line crossed with the handle,
 * pointing out of the palm. The top and bottom hands face each other's way round the handle, as a
 * batter's do (the top hand's palm toward the batter, the bottom hand's toward the bowler). The
 * forearm's twist is the turn of this normal about the forearm's axis (`forearmTwistDeg`).
 */
export function palmNormal(wrist: V3, grip: V3, dir: V3, side: GripSide): V3 {
  const hand = unit(sub(grip, wrist)) ?? ([1, 0, 0] as V3);
  const n = unit(cross(dir, hand)) ?? anyPerp(hand);
  return side === "front" ? n : mul(n, -1);
}
/** The forearm's twist, degrees: the palm's normal measured about the forearm from its bend plane's normal. */
export function forearmTwistDeg(elbow: V3, wrist: V3, bendNormal: V3, palm: V3): number {
  const axis = unit(sub(wrist, elbow));
  if (!axis) return 0;
  const a = unit(perpTo(bendNormal, axis));
  const b = unit(perpTo(palm, axis));
  if (!a || !b) return 0;
  const s = dot(cross(a, b), axis);
  return (Math.atan2(s, dot(a, b)) * 180) / Math.PI;
}
