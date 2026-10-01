// Stage — delivery context. Estimates bounce position, height at the batter and a
// soft length class. Returns `available: false` instead of guessing when the ball
// was not seen.

import { clamp } from "./math";
import { th } from "./registry";
import type { Scene } from "./scene";
import type { DeliveryContext } from "./types";
import type { EventSet } from "./events";

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

export function estimateDelivery(scene: Scene, events: EventSet): DeliveryContext {
  const seen = scene.ball.filter(Boolean).length;
  const empty: DeliveryContext = {
    available: false,
    bounceDistanceM: null,
    bounceUncertaintyM: null,
    heightAtBatterM: null,
    heightAtBatterRel: null,
    length: null,
    lengthLabel: null,
    confidence: 0,
    evidenceIds: [],
  };
  if (seen < th("tracking.ball_min_points")) {
    return { ...empty, reason: "Ball not visible in enough frames — line and length are not claimed." };
  }

  const evidenceIds: string[] = [];
  const bounce = events.byType.bounce;
  let bounceDistanceM: number | null = null;
  let bounceUncertaintyM: number | null = null;
  if (bounce) {
    const p = scene.ball[bounce.frame];
    if (p && scene.unit === "m") {
      bounceDistanceM = p.f;
      // Uncertainty grows when scale comes from athlete height or stumps are estimated.
      bounceUncertaintyM =
        (scene.scaleSource === "calibration" ? 0.25 : 0.6) + (scene.stumpsEstimated ? 0.4 : 0) + 0.02 * Math.abs(p.f);
      evidenceIds.push(bounce.id, `frame_${bounce.frame}`);
    }
  }

  // Height when the ball arrives at the batter: at contact if known, otherwise the
  // tracked point nearest the front knee's forward position.
  let heightRel: number | null = null;
  const contact = events.byType.contact;
  const contactBall = contact && contact.confidence >= 0.5 ? scene.ball[contact.frame] : null;
  if (contactBall) {
    heightRel = contactBall.u / scene.stature;
    evidenceIds.push(contact!.id);
  } else {
    let bestI = -1;
    let bestD = Infinity;
    for (let i = 0; i < scene.n; i++) {
      const b = scene.ball[i];
      const k = scene.get(i, "front_knee");
      if (!b || !k) continue;
      const d = Math.abs(b.f - k.f);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestI >= 0 && bestD < 0.4 * scene.stature) {
      heightRel = scene.ball[bestI]!.u / scene.stature;
      evidenceIds.push(`frame_${bestI}`);
    }
  }

  // Soft length membership from bounce distance and arrival height.
  const s = th("delivery.boundary_softness_m");
  const fg = th("delivery.full_good_boundary_m");
  const gs = th("delivery.good_short_boundary_m");
  let full = 1 / 3;
  let good = 1 / 3;
  let short = 1 / 3;
  let confidence = 0.35;
  if (bounceDistanceM !== null) {
    const pShortD = logistic((bounceDistanceM - gs) / s);
    const pFullD = logistic((fg - bounceDistanceM) / s);
    full = pFullD;
    short = pShortD;
    good = Math.max(0, 1 - pFullD - pShortD);
    confidence = clamp(0.85 - (bounceUncertaintyM ?? 0) * 0.3, 0.3, 0.9);
  }
  if (heightRel !== null) {
    const pShortH = logistic((heightRel - th("delivery.short_height_rel")) / 0.06);
    if (bounceDistanceM === null) {
      // Height alone: separates short from not-short, cannot split full vs good.
      short = pShortH;
      full = (1 - pShortH) / 2;
      good = (1 - pShortH) / 2;
      confidence = 0.55;
    } else {
      short = 0.6 * short + 0.4 * pShortH;
      const rest = 1 - short;
      const fg2 = full + good || 1;
      full = (rest * full) / fg2;
      good = (rest * good) / fg2;
      confidence = Math.min(0.92, confidence + 0.05);
    }
  }
  const total = full + good + short;
  full /= total;
  good /= total;
  short /= total;
  const top = Math.max(full, good, short);
  const lengthLabel = top < 0.55 ? "uncertain" : top === full ? "full" : top === good ? "good" : "short";

  return {
    available: true,
    bounceDistanceM,
    bounceUncertaintyM,
    heightAtBatterM: heightRel !== null && scene.unit === "m" ? heightRel * scene.stature : null,
    heightAtBatterRel: heightRel,
    length: { full, good, short },
    lengthLabel,
    confidence,
    evidenceIds,
    reason: bounce ? undefined : "Bounce not seen — length inferred from arrival height only.",
  };
}
