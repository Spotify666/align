// The back-foot defence by its definition (docs/11-back-foot-defence.md), checked on the body
// from any camera position. A back-foot defence is one movement with four parts, each read
// from what the camera can see:
//
//  1. No stride: the front foot is not thrown out toward the bowler. Side-on: the gap between
//     the feet along the pitch. From either end of the pitch: how far the foremost foot is
//     ahead of the hips in the pose estimate's depth.
//  2. Went back: the feet closed up (the front foot drawn back toward the back foot), or the
//     rear foot travelled back toward the stumps (side-on, still camera), or the hips moved
//     back over the rear foot.
//  3. Stayed tall: the hips never went down into the shot, and the head is up at the set
//     position. A trigger that dips the head on the way back is not the shot.
//  4. A defensive bat: the hands stay in front of the body, below the shoulders, without
//     sweeping across it, and the shoulders stay side-on (a flick, pull or cut swings the
//     hands across and opens the shoulders).
//
// The set position, when the bat and ball aren't seen, is where the body comes to rest after
// the stroke's main movement: a defence holds it, and meets the ball there.
//
// The feet are taken as the foremost and the rearmost along the pitch, not by their left/right
// labels, so a pose model that swaps the ankles, or a batting hand read wrongly, changes
// nothing. Every distance is × the batter's standing height, measured in the picture (or the
// pose estimate's depth for the forward axis from either end), so the same rule holds for any
// camera, resolution and frame rate.

import { frameSize } from "./alignment";
import { th, type ThresholdId } from "./registry";
import type { Scene, SemanticJoint } from "./scene";
import type { CameraView } from "./types";

export type FormulaCheckId = "no_stride" | "went_back" | "stayed_tall" | "dead_bat";

export interface FormulaCheck {
  id: FormulaCheckId;
  /** Passed, failed, or not seen by this camera (null). */
  pass: boolean | null;
  /** The decisive measurement (× height). */
  value: number | null;
  limit: string;
  /** Plain words for the report. */
  reading: string;
}

export interface BackFootFormula {
  /** The frame the position is read at: a seen contact, else the set position. */
  reference: number;
  referenceKind: "contact" | "set";
  /** The stroke: from the end of the stance to just after the reference. */
  stroke: [number, number];
  checks: FormulaCheck[];
  /** Every part seen and passed. */
  match: boolean;
  /** A forward stride with the body down into it: a front-foot shot. */
  frontStride: boolean;
  /** The hands swept across or the shoulders opened: an attacking stroke, not a defence. */
  attacking: boolean;
  signals: Record<string, number>;
}

const med = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};
const fin = (x: number) => Number.isFinite(x);
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);

/** The batter's height at a frame: the frame's own when the camera zooms, else the clip's. */
function size(scene: Scene, i: number) {
  const own = scene.cameraMoving ? frameSize(scene, i) : NaN;
  return fin(own) && own > 0 ? own : scene.stature;
}

/** Evaluate the back-foot defence definition on a tracked video. `seenContact`: bat–ball contact when it was seen or marked. */
export function backFootFormula(
  scene: Scene,
  seenContact: number | null,
  opts: {
    /** The ball's speed off the bat (× height/s), when the ball was tracked after contact. */ ballExit?: number;
    /** Where the camera was: from behind the batter, going back is toward the camera. */ view?: CameraView;
  } = {},
): BackFootFormula | null {
  const dt = scene.dt;
  if (!dt || scene.n < 8) return null;
  const n = scene.n;
  const frontal = scene.plane === "frontal";
  const pic = (i: number, j: SemanticJoint): [number, number] | null => {
    const p = scene.inPicture(i, j);
    if (!p) return null;
    const s = size(scene, i);
    return [p[0] / s, p[1] / s];
  };
  // Along the pitch (+ toward the bowler): the picture side-on, the pose estimate's depth from either end.
  const along = (i: number, j: SemanticJoint) => {
    if (!frontal) return pic(i, j)?.[0] ?? NaN;
    const p = scene.get(i, j);
    return p ? p.f / scene.stature : NaN;
  };
  const feet = (i: number) => {
    const a = along(i, "front_ankle");
    const b = along(i, "back_ankle");
    return fin(a) && fin(b) ? { fore: Math.max(a, b), rear: Math.min(a, b) } : null;
  };
  const hipsAlong = (i: number) => (along(i, "front_hip") + along(i, "back_hip")) / 2;
  const hipsUp = (i: number) => ((pic(i, "front_hip")?.[1] ?? NaN) + (pic(i, "back_hip")?.[1] ?? NaN)) / 2;
  const headUp = (i: number) => pic(i, "head")?.[1] ?? NaN;
  const hands = (i: number): [number, number] | null => {
    const a = pic(i, "front_wrist");
    const b = pic(i, "back_wrist");
    return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : (a ?? b);
  };
  const shouldersUp = (i: number) => ((pic(i, "front_shoulder")?.[1] ?? NaN) + (pic(i, "back_shoulder")?.[1] ?? NaN)) / 2;
  const hipsAcross = (i: number) => ((pic(i, "front_hip")?.[0] ?? NaN) + (pic(i, "back_hip")?.[0] ?? NaN)) / 2;

  const rawGap = range(0, n - 1).map((k) => {
    const f = feet(k);
    return f ? f.fore - f.rear : NaN;
  });
  const gw = Math.max(1, Math.round(0.1 / dt));
  const depthGap = rawGap.map((_, k) => med(rawGap.slice(Math.max(0, k - gw), k + gw + 1)));
  // Footwork speed (× height/s) from the feet as a pair (matched frame to frame, so a pose model
  // swapping the ankles reads as no movement). Over ±40 ms, so it means the same at any frame
  // rate.
  const h = Math.max(1, Math.round(0.04 / dt));
  const P = (i: number, j: SemanticJoint) => pic(i, j);
  const speed = (i: number) => {
    const a = i - h;
    const b = i + h;
    if (a < 0 || b >= n) return NaN;
    const d = (p: [number, number] | null, q: [number, number] | null) => (p && q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : NaN);
    const fa = [P(a, "front_ankle"), P(a, "back_ankle")];
    const fb = [P(b, "front_ankle"), P(b, "back_ankle")];
    const straight = (d(fa[0]!, fb[0]!) + d(fa[1]!, fb[1]!)) / 2;
    const crossed = (d(fa[0]!, fb[1]!) + d(fa[1]!, fb[0]!)) / 2;
    const foot = Math.min(...[straight, crossed].filter(fin));
    // From either end of the pitch the feet move mostly in depth: their gap along the pitch
    // (the pose estimate's, its jitter taken out by a 0.2 s median) changing counts too.
    const depth = frontal ? Math.abs(depthGap[b]! - depthGap[a]!) : NaN;
    // The feet only: the batter is set when the feet stop, though the head may still bow over
    // the ball and the hands, the bat and the body relax after it.
    const parts = [foot, depth].filter(fin);
    return parts.length ? Math.max(...parts) / (2 * h * dt) : NaN;
  };
  const v = range(0, n - 1).map(speed);
  // The whole body (feet, hips' centre, head): a held position is still in all of them.
  const bodyV = range(0, n - 1).map((i) => {
    const a = i - h;
    const b = i + h;
    if (a < 0 || b >= n) return NaN;
    const mid = (k: number): [number, number] | null => {
      const x = pic(k, "front_hip");
      const y = pic(k, "back_hip");
      return x && y ? [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2] : null;
    };
    const d = (p: [number, number] | null, q: [number, number] | null) => (p && q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : NaN);
    const parts = [v[i]! * 2 * h * dt, d(mid(a), mid(b)), d(pic(a, "head"), pic(b, "head"))].filter(fin);
    return parts.length ? Math.max(...parts) / (2 * h * dt) : NaN;
  });
  const sm = (i: number) => med([v[i - 1]!, v[i]!, v[i + 1]!]);

  // The stroke's main movement (the fastest the body moves, outside the clip's first and last
  // tenth of a second and in its first three quarters: the app centres its window on the
  // stroke, and a batter walking off after it can move faster) and where the body comes to rest
  // after it: the set position.
  const move = th("bfd.formula.moving_speed");
  const edge = Math.max(h + 1, Math.round(0.1 / dt));
  let peak = -1;
  for (let i = edge; i < Math.min(n - h, Math.round(n * 0.75)); i++) if (fin(sm(i)) && (peak < 0 || sm(i) > sm(peak))) peak = i;
  const still = peak >= 0 ? Math.max(move, th("bfd.formula.rest_share") * sm(peak)) : move;
  const hold = Math.max(2, Math.round(0.1 / dt));
  const restAt = (i: number) => {
    const w = range(i, Math.min(n - 1 - h, i + hold)).map(sm).filter(fin);
    return w.length > 0 && w.every((x) => x < still);
  };
  let set = n - 1 - h;
  if (peak >= 0)
    for (let i = peak; i < n - h; i++)
      if (restAt(i)) {
        set = i;
        break;
      }
  // The stance the shot was played from: the last rest before the main movement (a batter
  // settles, shuffles or taps the bat before the ball comes; the shot starts from there), else
  // the clip's first frames. A stance is upright: within a few hundredths of the tallest the
  // batter stands in the clip (85th percentile of the head's height), so a held stride or a
  // dipping trigger is never taken for one.
  const headUpAt = (i: number) => pic(i, "head")?.[1] ?? NaN;
  const heights = range(0, n - 1).map(headUpAt).filter(fin).sort((a, b) => a - b);
  const tallest = heights.length ? heights[Math.min(heights.length - 1, Math.floor(heights.length * 0.85))]! : NaN;
  const upright = (i: number) => med(range(i, Math.min(n - 1, i + hold)).map(headUpAt)) >= tallest - th("bfd.formula.max_stance_dip");
  let stanceEnd = Math.max(2, Math.round(0.15 / dt));
  if (peak >= 0)
    for (let i = peak - hold; i >= edge; i--)
      if (restAt(i) && upright(i)) {
        stanceEnd = i + hold;
        break;
      }
  const stance = range(Math.max(0, stanceEnd - Math.max(2, Math.round(0.15 / dt))), stanceEnd);
  const reference = seenContact ?? set;
  const kind: BackFootFormula["referenceKind"] = seenContact !== null ? "contact" : "set";
  const atRef = [reference - 1, reference, reference + 1].filter((i) => i >= 0 && i < n);
  const strokeEnd = Math.min(n - 1, reference + Math.round(0.2 / dt));
  const stroke = range(stanceEnd + 1, strokeEnd);
  const at = (fn: (i: number) => number, frames: number[]) => med(frames.map(fn));
  const maxOver = (fn: (i: number) => number, frames: number[]) => Math.max(-Infinity, ...frames.map(fn).filter(fin));

  // 1. No stride.
  const gap = (i: number) => {
    const f = feet(i);
    return f ? f.fore - f.rear : NaN;
  };
  const lead = (i: number) => {
    const f = feet(i);
    return f ? f.fore - hipsAlong(i) : NaN;
  };
  const gap0 = at(gap, stance);
  const gapRef = at(gap, atRef);
  // Medians over three frames, so one frame's landmark slip can't read as a stride.
  const smooth3 = (fn: (i: number) => number) => (i: number) => med([fn(i - 1), fn(i), fn(i + 1)]);
  const gapMax = maxOver(smooth3(gap), stroke);
  const lead0 = at(lead, stance);
  const leadRef = at(lead, atRef);
  const leadMax = maxOver(smooth3(lead), stroke);
  // 2. Went back.
  const rear = (i: number) => feet(i)?.rear ?? NaN;
  // The rear foot's own travel toward the stumps, side-on, with the camera's movement taken out
  // (a pan reads as the feet travelling): only when the camera's movement was measured.
  const steadyRear = (i: number) => {
    const S = scene.steady;
    if (!S) return NaN;
    const a = S(i, "front_ankle");
    const b = S(i, "back_ankle");
    return a && b ? Math.min(a[0], b[0]) / size(scene, i) : NaN;
  };
  const backStep = !frontal ? at(steadyRear, stance) - at(steadyRear, atRef) : NaN;
  const closed = gap0 - gapRef;
  // From either end of the pitch, feet that step back away from the camera rise in the picture
  // (the camera looks down on the pitch); a stride toward it lowers the front foot. Read in the
  // picture itself, with the camera's own movement taken out when it was measured: the pose
  // estimate's depth can miss it.
  const feetUp = (i: number) => {
    const g = (j: SemanticJoint) => (scene.steady ? scene.steady(i, j) : scene.cameraMoving ? null : scene.inPicture(i, j));
    const a = g("front_ankle");
    const b = g("back_ankle");
    return a && b ? (a[1] + b[1]) / 2 / size(scene, i) : NaN;
  };
  const feetAway = frontal && (opts.view === "front_on" || opts.view === "behind") ? (opts.view === "behind" ? -1 : 1) * (at(feetUp, atRef) - at(feetUp, stance)) : NaN;
  const hipsOverRear = (i: number) => hipsAlong(i) - rear(i);
  const hipsBack = at(hipsOverRear, stance) - at(hipsOverRear, atRef);
  // 3. Stayed tall (+ = lower than in the stance).
  const hips0 = at(hipsUp, stance);
  const hipDropMax = hips0 - Math.min(Infinity, ...stroke.map(smooth3(hipsUp)).filter(fin));
  const hipDrop = hips0 - at(hipsUp, atRef);
  const headDrop = at(headUp, stance) - at(headUp, atRef);
  // 4. A defensive bat: the hands against the shoulders from the reference on; how far they
  // sweep across the body (from either end: the picture's horizontal against the hips;
  // side-on: the pose estimate's depth, which is across the body there); and how far the
  // shoulder line turns (the pose estimate, any camera: angles don't depend on where it stood).
  const after = range(reference, Math.min(n - 1, reference + Math.round(0.4 / dt)));
  const around = [...range(stanceEnd + 1, reference), ...after.slice(1)];
  const handsHigh = maxOver((i) => (hands(i)?.[1] ?? NaN) - shouldersUp(i), after);
  const E = scene.estimate;
  const est = (i: number, j: SemanticJoint) => (E ? E(i, j) : null);
  const estMid = (i: number, a: SemanticJoint, b: SemanticJoint): [number, number, number] | null => {
    const p = est(i, a);
    const q = est(i, b);
    return p && q ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2] : null;
  };
  // The estimate's own height (legs and trunk, as the scene sizes the batter), to put depth in × height.
  const estSize = med(
    stance.map((i) => {
      const L = (a: SemanticJoint, b: SemanticJoint) => {
        const p = est(i, a);
        const q = est(i, b);
        return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : NaN;
      };
      const leg = Math.max(L("front_hip", "front_knee") + L("front_knee", "front_ankle"), L("back_hip", "back_knee") + L("back_knee", "back_ankle"));
      return (leg + (L("front_hip", "front_shoulder") + L("back_hip", "back_shoulder")) / 2) / 0.779;
    }),
  );
  const sweep = frontal
    ? (i: number) => (hands(i)?.[0] ?? NaN) - hipsAcross(i)
    : (i: number) => {
        const w = estMid(i, "front_wrist", "back_wrist");
        const hp = estMid(i, "front_hip", "back_hip");
        return w && hp && estSize > 0 ? (w[2] - hp[2]) / estSize : NaN;
      };
  const sweep0 = at(sweep, stance);
  const handsSweep = maxOver((i) => Math.abs(smooth3(sweep)(i) - sweep0), around);
  // The shoulder line's direction in the horizontal plane. A pose model can swap the left and
  // right shoulders for a frame or two, which reads as a half turn in one frame; no batter turns
  // that fast, so a jump of more than a quarter turn between frames is taken as that swap.
  // Frames where the shoulder line looks much shorter than in the stance (one shoulder hidden
  // behind the other, or misplaced) give no direction.
  const shoulderXZ = (i: number) => {
    const a = est(i, "front_shoulder");
    const b = est(i, "back_shoulder");
    return a && b ? ([a[0] - b[0], a[2] - b[2]] as const) : null;
  };
  const len0 = med(stance.map((i) => {
    const v = shoulderXZ(i);
    return v ? Math.hypot(v[0], v[1]) : NaN;
  }));
  const yawRaw = range(0, n - 1).map((i) => {
    const v = shoulderXZ(i);
    return v && Math.hypot(v[0], v[1]) >= th("bfd.formula.min_shoulder_line") * len0 ? Math.atan2(v[1], v[0]) : NaN;
  });
  const yaw: number[] = [];
  let prev = NaN;
  for (const y of yawRaw) {
    if (!fin(y)) {
      yaw.push(NaN);
      continue;
    }
    let u = y;
    if (fin(prev)) {
      while (u - prev > Math.PI / 2) u -= Math.PI;
      while (prev - u > Math.PI / 2) u += Math.PI;
    }
    yaw.push(u);
    prev = u;
  }
  const yaw0 = at((i) => yaw[i]!, stance);
  const turnDeg = maxOver((i) => (Math.abs(med([yaw[i - 1]!, yaw[i]!, yaw[i + 1]!]) - yaw0) * 180) / Math.PI, around);

  // Soft hands: the hands stop at the ball and stay. Around the reference (0.1 s before to 0.2 s
  // after, as the feet set a moment before the bat meets the ball) the stillest the hands get
  // for 0.3 s: a punch, drive or flick carries them on through the ball and never stops there.
  // Needs real time between frames.
  const travel = (k: number) => {
    const h0 = hands(k);
    return h0
      ? maxOver((i) => {
          const p = hands(i);
          return p ? Math.hypot(p[0] - h0[0], p[1] - h0[1]) : NaN;
        }, range(k + 1, Math.min(n - 1, k + Math.round(0.3 / dt))))
      : NaN;
  };
  const followAll = range(Math.max(0, reference - Math.round(0.1 / dt)), Math.min(n - 1, reference + Math.round(0.2 / dt))).map(travel).filter((x) => fin(x) && x > -Infinity);
  const follow = followAll.length ? Math.min(...followAll) : NaN;

  const signals: Record<string, number> = { gap0, gapRef, gapMax, lead0, leadRef, leadMax, backStep, closed, hipsBack, hipDropMax, hipDrop, headDrop, handsHigh, handsSweep, turn: turnDeg, follow, feetAway, set, peak, stanceEnd };

  // 1. No stride: the feet close together when set, and never held apart in a stride with the
  // body down into it (a front-foot stroke held, then a recovery that brings the feet back and
  // the batter up: the recovery is not going back).
  const maxGap = frontal ? th("bfd.formula.max_gap_end") : th("bfd.formula.max_gap");
  // Against the tallest the batter stood in the clip: a held stride may come before the
  // movement read as the stroke.
  // Held: the whole body still for 0.2 s (a trigger that dips the head on the way back is brief
  // and the head keeps moving).
  const heldFor = Math.max(3, Math.round(0.2 / dt));
  const heldAt = (i: number) => {
    const w = range(i, Math.min(n - 1 - h, i + heldFor)).map((k) => med([bodyV[k - 1]!, bodyV[k]!, bodyV[k + 1]!])).filter(fin);
    return w.length >= heldFor * 0.8 && w.every((x) => x < still);
  };
  const heldStride = range(edge, n - 1 - h).some((i) => gap(i) > maxGap && tallest - headUp(i) > th("bfd.formula.max_head_drop") && heldAt(i));
  // Side-on with the camera's movement known, the front foot's own travel toward the bowler
  // tells a stride from a front foot simply left out in front (a fault of a back-foot defence,
  // graded by its measures, not a different shot).
  const steadyFore = (i: number) => {
    const S = scene.steady;
    if (!S) return NaN;
    const a = S(i, "front_ankle");
    const b = S(i, "back_ankle");
    return a && b ? Math.max(a[0], b[0]) / size(scene, i) : NaN;
  };
  const foreForward = !frontal ? at(steadyFore, atRef) - at(steadyFore, stance) : NaN;
  const stayedBack = fin(foreForward) && foreForward <= th("bfd.formula.max_front_forward");
  const noStride: FormulaCheck = {
    id: "no_stride",
    pass: fin(gapRef) ? (gapRef <= maxGap || stayedBack) && !heldStride : null,
    value: fin(gapRef) ? gapRef : null,
    limit: `feet at most ${maxGap} × height apart along the pitch when set, and never held a stride apart with the body down`,
    reading: !fin(gapRef)
      ? "The feet couldn't be measured along the pitch."
      : heldStride
        ? "The batter held a stride forward with the body down: a front-foot stroke."
        : gapRef <= maxGap
          ? "The front foot ended beside the back foot."
          : stayedBack
            ? "The front foot stayed where it was (left out in front)."
            : "The feet ended a stride apart along the pitch.",
  };
  // 2. Went back: the front foot came back toward the back foot, the hips moved back over it,
  // or (side-on, the camera's movement known) the back foot itself travelled toward the stumps.
  const back =
    (fin(closed) && closed >= th("bfd.formula.min_gap_closed")) ||
    (fin(hipsBack) && hipsBack >= th("bfd.formula.min_hips_back")) ||
    (fin(backStep) && backStep >= th("bfd.min_back_step")) ||
    (fin(feetAway) && feetAway >= th("bfd.formula.min_feet_away"));
  const backSeen = fin(closed) || fin(hipsBack) || fin(backStep) || fin(feetAway);
  const wentBack: FormulaCheck = {
    id: "went_back",
    pass: backSeen ? back : null,
    value: backSeen ? Math.max(...[closed, hipsBack, backStep, feetAway].filter(fin)) : null,
    limit: `feet at least ${th("bfd.formula.min_gap_closed")} × height closer than in the stance, the hips ${th("bfd.formula.min_hips_back")} further back over the back foot, or the back foot ${th("bfd.min_back_step")} back`,
    reading: !backSeen ? "Going back couldn't be seen." : back ? "The feet came together and the weight went back." : "No movement back toward the stumps was seen.",
  };
  // 3. Stayed tall when set.
  const tallSeen = fin(hipDrop) && fin(headDrop);
  const tall = tallSeen && hipDrop <= th("bfd.formula.max_hip_drop") && headDrop <= th("bfd.formula.max_head_drop");
  const stayedTall: FormulaCheck = {
    id: "stayed_tall",
    pass: tallSeen ? tall : null,
    value: tallSeen ? Math.max(hipDrop, headDrop) : null,
    limit: `hips at most ${th("bfd.formula.max_hip_drop")} and head at most ${th("bfd.formula.max_head_drop")} × height lower than in the stance`,
    reading: !tallSeen ? "The hips and head weren't seen in the stance and when set." : tall ? "Hips and head stayed up." : "Went down into the shot: hips or head well below the stance.",
  };
  // 4. A defensive bat.
  // With the ball tracked after contact, the ball itself says it: a defence drops it dead off the
  // bat. Then hands that push on through are a fault of the defence, not another stroke.
  const ballExit = opts.ballExit;
  const deadBall = ballExit !== undefined && fin(ballExit) ? ballExit <= th("bfd.formula.max_ball_exit") : null;
  const batSeen = fin(handsHigh) && fin(handsSweep) && fin(turnDeg) && fin(follow);
  const over = (x: number, id: ThresholdId) => x > th(id);
  const swung =
    deadBall !== null
      ? !deadBall || over(turnDeg, "bfd.formula.max_shoulder_turn")
      : batSeen &&
        (over(handsHigh, "bfd.formula.max_hands_above_shoulders") ||
          over(handsSweep, "bfd.formula.max_hands_sweep") ||
          over(turnDeg, "bfd.formula.max_shoulder_turn") ||
          over(follow, "bfd.formula.max_follow"));
  const deadBat: FormulaCheck = {
    id: "dead_bat",
    pass: deadBall !== null && fin(turnDeg) ? !swung : batSeen ? !swung : null,
    value: batSeen ? follow : null,
    limit: `hands stop within ${th("bfd.formula.max_follow")} × height, stay below the shoulders and in front (sweep ≤ ${th("bfd.formula.max_hands_sweep")}); shoulders turn ≤ ${th("bfd.formula.max_shoulder_turn")}°`,
    reading: !batSeen
      ? "The hands and shoulders weren't seen through the stroke."
      : !swung
        ? "The hands stopped at the ball, in front of the body, shoulders side-on."
        : over(follow, "bfd.formula.max_follow")
          ? "The hands carried on through the ball: an attacking stroke."
          : over(turnDeg, "bfd.formula.max_shoulder_turn")
            ? "The shoulders turned open: a flick, pull or cut, not a defence."
            : "The hands swept across the body or rose above the shoulders: an attacking stroke.",
  };
  const checks = [noStride, wentBack, stayedTall, deadBat];
  signals.heldStride = heldStride ? 1 : 0;
  return {
    reference,
    referenceKind: kind,
    stroke: [stanceEnd + 1, strokeEnd],
    checks,
    match: checks.every((k) => k.pass === true),
    // Named as a front-foot shot only when every part of the movement says so: a stride, no
    // going back, and the body down into it.
    frontStride: noStride.pass === false && wentBack.pass === false && stayedTall.pass === false,
    attacking:
      deadBat.pass === false &&
      (turnDeg > 2 * th("bfd.formula.max_shoulder_turn") || follow > 2 * th("bfd.formula.max_follow") || handsSweep > 2 * th("bfd.formula.max_hands_sweep")),
    signals,
  };
}
