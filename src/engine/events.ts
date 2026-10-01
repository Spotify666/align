// Stage D — event segmentation from temporal evidence.
// Contact is taken from bat–ball proximity, ball deflection or an explicit mark.
// It is never chosen as "the frame where the hands are lowest".

import { argmax, argmin, derivative, len2, smooth } from "./math";
import { type P, type Scene, sweetSpot } from "./scene";
import type { CaptureObservation, EventType, MotionEvent } from "./types";

export interface EventSet {
  list: MotionEvent[];
  byType: Partial<Record<EventType, MotionEvent>>;
}

const series = (scene: Scene, pick: (i: number) => P | null, key: "f" | "u") =>
  Array.from({ length: scene.n }, (_, i) => pick(i)?.[key] ?? NaN);

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
  if (peakFwd >= 0 && frontF[peakFwd]! - frontStart > 0.08 * S) {
    const moveStart = firstIndex(frontV, (v) => v > moveThr);
    const plant = firstIndex(frontV, (v, i) => i > moveStart && Math.abs(v) < 0.12 * S && frontF[i]! - frontStart > 0.06 * S, moveStart);
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
