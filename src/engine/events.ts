// Stage D — event segmentation from temporal evidence.
// Contact is taken from bat–ball proximity, ball deflection or an explicit mark. When
// neither bat nor ball is seen it is estimated from the hands (where they reach
// furthest forward after the stride), at lower confidence and labelled as such.

import { argmax, argmin, derivative, len2, smooth } from "./math";
import { type P, type Scene, sweetSpot } from "./scene";
import type { CaptureObservation, EventType, MotionEvent } from "./types";

export interface EventSet {
  list: MotionEvent[];
  byType: Partial<Record<EventType, MotionEvent>>;
}

const series = (scene: Scene, pick: (i: number) => P | null, key: "f" | "u") =>
  Array.from({ length: scene.n }, (_, i) => pick(i)?.[key] ?? NaN);

/** Mid-point of the two wrists (or whichever is seen), per frame. */
/** Frame-to-frame jitter of a track: median absolute second difference (NaN if too few points). */
function jitter(xs: number[]): number {
  const d: number[] = [];
  for (let i = 1; i < xs.length - 1; i++) {
    const a = xs[i - 1]!;
    const b = xs[i]!;
    const c = xs[i + 1]!;
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) d.push(Math.abs(b - (a + c) / 2));
  }
  if (d.length < 5) return NaN;
  d.sort((x, y) => x - y);
  return d[Math.floor(d.length / 2)]!;
}

/**
 * Where the hands are, from both wrists. Both hold one handle, so they move together, but
 * the camera sees one less well (usually the bottom hand, behind the bat), and its track
 * jitters more: each wrist is weighted by the inverse variance of its own jitter. When
 * only one is seen, the usual gap between the two is added back, so the hands don't jump.
 */
export function handsSeries(scene: Scene, key: "f" | "u"): number[] {
  const a = Array.from({ length: scene.n }, (_, i) => scene.get(i, "front_wrist")?.[key] ?? NaN);
  const b = Array.from({ length: scene.n }, (_, i) => scene.get(i, "back_wrist")?.[key] ?? NaN);
  const floor = 0.002 * scene.stature; // landmark noise can't be trusted to be smaller than this
  const ja = Math.max(jitter(a), floor);
  const jb = Math.max(jitter(b), floor);
  const wa = Number.isFinite(ja) ? 1 / ja ** 2 : 0;
  const wb = Number.isFinite(jb) ? 1 / jb ** 2 : 0;
  const both = a.map((x, i) => x - b[i]!).filter(Number.isFinite).sort((x, y) => x - y);
  const gap = both.length ? both[Math.floor(both.length / 2)]! : 0; // a − b, typically
  const sa = wa + wb > 0 ? wb / (wa + wb) : 0.5;
  return a.map((x, i) => {
    const y = b[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) return wa + wb > 0 ? (wa * x + wb * y) / (wa + wb) : (x + y) / 2;
    if (Number.isFinite(x)) return x - sa * gap;
    if (Number.isFinite(y)) return y + (1 - sa) * gap;
    return NaN;
  });
}

/**
 * Where the hands reach furthest forward after `anchor` (front-foot plant, contact or
 * top of the backlift), with the smoothed hand speed series. Null without an anchor.
 */
export function handsForward(scene: Scene, anchor: number, r = 1) {
  if (anchor < 0 || !scene.dt) return null;
  const dt = scene.dt;
  const hf = smooth(handsSeries(scene, "f"), r);
  const hu = smooth(handsSeries(scene, "u"), r);
  // Over a fixed ±20 ms, so speed means the same at 30 and 240 fps (frame-to-frame
  // differences at high frame rates are mostly landmark jitter).
  const h = Math.max(1, Math.round(0.02 / dt));
  const speed = hf.map((_, i) => {
    const a = i - h;
    const b = i + h;
    return Number.isFinite(hf[a]!) && Number.isFinite(hf[b]!) ? Math.hypot(hf[b]! - hf[a]!, hu[b]! - hu[a]!) / (2 * h * dt) : NaN;
  });
  const from = Math.max(0, anchor - Math.round(0.2 / dt));
  const at = argmax(hf, from, Math.min(scene.n - 1, anchor + Math.round(0.45 / dt)));
  return at >= 0 ? { at, from, hf, hu, speed } : null;
}

function firstIndex(xs: number[], pred: (x: number, i: number) => boolean, from = 0, to = xs.length - 1) {
  for (let i = Math.max(0, from); i <= Math.min(xs.length - 1, to); i++) if (pred(xs[i]!, i)) return i;
  return -1;
}

/** Shortest distance from point p to segment ab in the forward/up plane. */
function pointSegment(p: P, a: P, b: P) {
  const abf = b.f - a.f;
  const abu = b.u - a.u;
  const l2 = abf * abf + abu * abu;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.f - a.f) * abf + (p.u - a.u) * abu) / l2));
  return Math.hypot(p.f - (a.f + t * abf), p.u - (a.u + t * abu));
}

export function segmentEvents(obs: CaptureObservation, scene: Scene): EventSet {
  const list: MotionEvent[] = [];
  const add = (type: EventType, frame: number, confidence: number, method: string) => {
    if (frame < 0 || frame >= scene.n) return;
    list.push({ id: `evt_${type}`, type, frame, tMs: Math.round(scene.t[frame] ?? 0), confidence, method });
  };

  if (!scene.dt || scene.n < 3) {
    return { list, byType: {} };
  }
  const dt = scene.dt;
  const S = scene.stature;
  const r = Math.max(1, Math.round(0.015 / dt)); // ~15 ms smoothing radius

  const frontF = smooth(series(scene, (i) => scene.get(i, "front_ankle"), "f"), r);
  const backF = smooth(series(scene, (i) => scene.get(i, "back_ankle"), "f"), r);
  const frontV = derivative(frontF, dt);
  const backV = derivative(backF, dt);
  const moveThr = 0.35 * S; // stature per second

  add("setup", 0, 0.9, "first analysed frame");

  // Trigger: first decisive foot movement.
  const trigger = firstIndex(frontV, (v, i) => Math.abs(v) > moveThr || Math.abs(backV[i]!) > moveThr);
  if (trigger >= 0) add("trigger", trigger, 0.75, "first foot speed above threshold");

  // Front-foot plant: after forward travel, foot speed settles.
  const front0 = frontF.slice(0, Math.max(2, Math.round(scene.n * 0.15))).filter(Number.isFinite);
  const frontStart = front0.length ? front0.reduce((a, b) => a + b, 0) / front0.length : NaN;
  const peakFwd = argmax(frontF);
  let plant = -1;
  if (peakFwd >= 0 && frontF[peakFwd]! - frontStart > 0.08 * S) {
    const moveStart = firstIndex(frontV, (v) => v > moveThr);
    plant = firstIndex(frontV, (v, i) => i > moveStart && Math.abs(v) < 0.12 * S && frontF[i]! - frontStart > 0.06 * S, moveStart);
    if (plant >= 0) add("front_foot_plant", plant, 0.8, "front ankle speed settles after forward stride");
  }

  // Back-foot commitment: back foot moves toward the stumps.
  const back0 = backF.slice(0, Math.max(2, Math.round(scene.n * 0.15))).filter(Number.isFinite);
  const backStart = back0.length ? back0.reduce((a, b) => a + b, 0) / back0.length : NaN;
  const minBack = argmin(backF);
  if (minBack >= 0 && backStart - backF[minBack]! > 0.06 * S) {
    const commit = firstIndex(backV, (v) => v < -moveThr);
    if (commit >= 0) add("back_foot_commit", commit, 0.75, "back ankle moves toward stumps");
  }

  // Bounce: ball reverses vertical direction near the ground, or a mark.
  const ballU = scene.ball.map((p) => p?.u ?? NaN);
  const ballV = derivative(ballU, dt);
  let bounce = -1;
  for (let i = 1; i < scene.n - 1; i++) {
    const vPrev = ballV[i - 1];
    const vNext = ballV[i + 1];
    if (
      Number.isFinite(ballU[i]!) &&
      ballU[i]! < 0.25 &&
      vPrev !== undefined &&
      vNext !== undefined &&
      vPrev < 0 &&
      vNext > 0
    ) {
      bounce = i;
      break;
    }
  }
  if (bounce >= 0) add("bounce", bounce, 0.8, "ball vertical velocity reverses near ground");
  else if (obs.marks.bounceFrame !== null) add("bounce", obs.marks.bounceFrame, 0.7, "marked by user");

  // Contact: bat–ball proximity > ball deflection > user mark > bat low-point proxy.
  let contact = -1;
  let contactMethod = "";
  let contactConf = 0;
  const hasBat = scene.batHandle.some(Boolean) && scene.batToe.some(Boolean);
  const hasBall = scene.ball.filter(Boolean).length >= 4;
  if (hasBat && hasBall) {
    let best = Infinity;
    for (let i = 0; i < scene.n; i++) {
      const b = scene.ball[i];
      const h = scene.batHandle[i];
      const t = scene.batToe[i];
      if (!b || !h || !t) continue;
      const d = pointSegment(b, h, t);
      if (d < best) {
        best = d;
        contact = i;
      }
    }
    if (best < 0.08 * S) {
      contactMethod = "bat–ball proximity";
      contactConf = 0.85;
    } else {
      contact = -1;
    }
  }
  if (contact < 0 && hasBall) {
    // Ball deflection: largest change in direction between incoming and outgoing velocity.
    let bestTurn = 0;
    for (let i = 2; i < scene.n - 2; i++) {
      const a = scene.ball[i - 2];
      const b = scene.ball[i];
      const c = scene.ball[i + 2];
      if (!a || !b || !c || i === bounce) continue;
      if (Math.abs(i - bounce) <= 2) continue;
      const v1 = [b.f - a.f, b.u - a.u] as const;
      const v2 = [c.f - b.f, c.u - b.u] as const;
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (len2(v1) * len2(v2) || 1);
      const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (turn > bestTurn && b.u > 0.05) {
        bestTurn = turn;
        contact = i;
      }
    }
    if (bestTurn > Math.PI / 4) {
      contactMethod = "ball deflection";
      contactConf = 0.65;
    } else contact = -1;
  }
  if (contact < 0 && obs.marks.contactFrame !== null) {
    contact = obs.marks.contactFrame;
    contactMethod = "marked by user";
    contactConf = 0.7;
  }

  // Neither bat nor ball: every stroke has a downswing, a fall of the hands from the top
  // of the backlift (within 0.6 s), and the ball is met at its end: where the hands check
  // (speed below 40% of the downswing peak: a defence) or the bottom of their arc (a
  // stroke that swings through), whichever comes first. When the head clearly drops (a
  // front-foot stroke takes it down over the front knee) the stroke's downswing is the one
  // ending as the head arrives low; trigger movements and re-grips are falls of the hands
  // too. Searched away from the clip's edges, where batters bend to pick up the ball or
  // walk off.
  const hasToeEarly = scene.batToe.filter(Boolean).length > scene.n * 0.4;
  if (contact < 0 && !hasToeEarly && !hasBall) {
    const lo = Math.round(scene.n * 0.2);
    const hi = Math.round(scene.n * 0.9);
    const headU = smooth(series(scene, (i) => scene.get(i, "head"), "u"), 2 * r);
    const lowest = argmin(headU, lo, hi);
    const tall = headU.filter(Number.isFinite).sort((a, b) => a - b);
    const standing = tall.length ? tall[Math.floor(tall.length * 0.9)]! : NaN;
    const headDrop = lowest >= 0 ? standing - headU[lowest]! : 0;
    const arrive = headDrop >= 0.05 * S ? firstIndex(headU, (v) => v <= headU[lowest]! + 0.25 * headDrop, lo, hi) : -1;
    const [jFrom, jTo] = arrive >= 0 ? [Math.max(lo, arrive - Math.round(0.3 / dt)), Math.min(hi, arrive + Math.round(0.3 / dt))] : [lo, hi];
    const hands = handsForward(scene, lo, r);
    let top = -1;
    let bottom = -1;
    if (hands) {
      const w = Math.round(0.6 / dt);
      let best = 0.05 * S; // smaller falls are stance shuffles, not a downswing
      for (let j = jFrom; j <= jTo; j++) {
        if (!Number.isFinite(hands.hu[j]!)) continue;
        for (let i = Math.max(0, j - w); i < j; i++)
          if (Number.isFinite(hands.hu[i]!) && hands.hu[i]! - hands.hu[j]! > best) {
            best = hands.hu[i]! - hands.hu[j]!;
            top = i;
            bottom = j;
          }
      }
    }
    if (hands && top >= 0) {
      const peak = argmax(hands.speed, top, bottom);
      const drop = peak >= 0 ? firstIndex(hands.speed, (v) => v < 0.4 * hands.speed[peak]!, peak, bottom) : -1;
      contact = drop >= 0 ? Math.min(drop, bottom) : bottom;
      contactMethod = "estimated from the hands' downswing (bat and ball not seen)";
      contactConf = 0.5;
    } else if (arrive >= 0 || lowest >= 0) {
      contact = arrive >= 0 ? arrive : lowest;
      contactMethod = "estimated from the lowest head position (bat and ball not seen)";
      contactConf = 0.4;
    }
  }

  // Bat-driven events.
  const toeU = smooth(
    scene.batToe.map((p) => p?.u ?? NaN),
    r,
  );
  const hasToe = toeU.filter(Number.isFinite).length > scene.n * 0.4;
  const handsU = smooth(series(scene, (i) => scene.get(i, "front_wrist"), "u"), r);
  const lift = hasToe ? toeU : handsU;
  const searchEnd = contact >= 0 ? contact : scene.n - 1;
  const top = argmax(lift, trigger >= 0 ? trigger : 0, searchEnd);
  if (top >= 0) add("backswing_top", top, hasToe ? 0.75 : 0.45, hasToe ? "highest bat toe before contact" : "highest hands (bat not tracked)");

  if (contact < 0 && hasToe && top >= 0) {
    // Proxy window only: never treated as measured contact.
    const low = argmin(toeU, top, Math.min(scene.n - 1, top + Math.round(0.5 / dt)));
    if (low >= 0) {
      contact = low;
      contactMethod = "bat low-point proxy (no ball)";
      contactConf = 0.3;
    }
  }
  if (contact >= 0) add("contact", contact, contactConf, contactMethod);

  if (top >= 0) {
    const liftV = derivative(lift, dt);
    const onset = firstIndex(liftV, (v) => v < -0.6 * S, top, contact >= 0 ? contact : scene.n - 1);
    if (onset >= 0) add("downswing_onset", onset, hasToe ? 0.7 : 0.4, "bat starts descending");
  }

  if (contact >= 0) {
    const ss = Array.from({ length: scene.n }, (_, i) => sweetSpot(scene, i));
    const ssSpeed = ss.map((p, i) => {
      const q = ss[i + 1];
      return p && q ? Math.hypot(q.f - p.f, q.u - p.u) / dt : NaN;
    });
    const window = Math.round(0.4 / dt);
    const ft = hasToe ? argmax(toeU, contact, Math.min(scene.n - 1, contact + window)) : argmax(handsU, contact, Math.min(scene.n - 1, contact + window));
    if (ft >= 0) add("follow_through", ft, hasToe ? 0.65 : 0.4, "peak bat/hand height after contact");
    const settle = firstIndex(ssSpeed, (v) => v < 0.3 * S, Math.max(ft, contact) + 1);
    add("recovery", settle >= 0 ? settle : scene.n - 1, 0.5, settle >= 0 ? "bat speed settles" : "end of clip");
  }

  list.sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type));
  const byType: EventSet["byType"] = {};
  for (const e of list) byType[e.type] = e;
  return { list, byType };
}
