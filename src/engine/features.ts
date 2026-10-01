// Stage E (part 1) — multimodal shot features across the temporal window.
// Each feature records which modality it came from so that acceptance can demand
// body + bat + ball while rejection may rest on fewer signals.

import { angleFromVertical, argmax, round } from "./math";
import { type Scene, sweetSpot } from "./scene";
import type { DeliveryContext, ShotFeature } from "./types";
import type { EventSet } from "./events";

export type FeatureId =
  | "front_stride"
  | "back_foot"
  | "contact_height"
  | "hands_height"
  | "back_knee_height"
  | "bat_angle"
  | "bat_speed"
  | "follow_through"
  | "follow_height"
  | "rotation"
  | "length_short"
  | "ball_exit"
  | "contact_found";

export interface FeatureSet {
  values: Partial<Record<FeatureId, number>>;
  /** Features derived from speeds at < 60 fps carry wider tolerance. */
  coarseTiming: boolean;
  refFrame: number;
  list: ShotFeature[];
}

const avg = (xs: number[]) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};

/** True when the ball was tracked through most of the stroke window, so "no contact" is an observation, not a gap. */
function ballSeenThroughStroke(scene: Scene, events: EventSet): boolean {
  const start = events.byType.front_foot_plant?.frame ?? events.byType.backswing_top?.frame;
  if (start === undefined || !scene.dt) return false;
  const end = Math.min(scene.n - 1, start + Math.round(0.3 / scene.dt));
  let seen = 0;
  for (let i = start; i <= end; i++) if (scene.ball[i]) seen++;
  return seen / (end - start + 1) >= 0.7;
}

export function extractFeatures(scene: Scene, events: EventSet, delivery: DeliveryContext): FeatureSet {
  const S = scene.stature;
  const n = scene.n;
  const values: FeatureSet["values"] = {};
  const list: ShotFeature[] = [];
  const add = (id: FeatureId, value: number, f: Omit<ShotFeature, "id" | "value">) => {
    if (!Number.isFinite(value)) return;
    values[id] = value;
    list.push({ id: `feat_${id}`, value: round(value, 3), ...f });
  };

  const contact = events.byType.contact;
  const plant = events.byType.front_foot_plant;
  const refFrame = Math.min(n - 1, contact?.frame ?? plant?.frame ?? Math.round(n * 0.6));
  const dt = scene.dt;
  const coarseTiming = !dt || 1 / dt < 60;
  const early = Math.max(2, Math.round(n * 0.15));

  // --- Body ---
  const frontF = Array.from({ length: n }, (_, i) => scene.get(i, "front_ankle")?.f ?? NaN);
  const backF = Array.from({ length: n }, (_, i) => scene.get(i, "back_ankle")?.f ?? NaN);
  const frontStart = avg(frontF.slice(0, early));
  const backStart = avg(backF.slice(0, early));
  const end = contact ? Math.min(n - 1, contact.frame + 2) : n - 1;
  const frontMax = Math.max(...frontF.slice(0, end + 1).filter(Number.isFinite));
  const backMin = Math.min(...backF.slice(0, end + 1).filter(Number.isFinite));
  const stride = (frontMax - frontStart) / S;
  add("front_stride", stride, {
    label: "Front-foot movement",
    unit: "× stature",
    reading: stride > 0.2 ? "front foot strides toward the bowler" : "little forward stride",
    evidenceIds: plant ? [plant.id, `frame_${plant.frame}`] : [],
    modality: "body",
  });
  // Frontal views anchor forward positions on the back ankle, so its own travel is unobservable.
  const backMove = scene.plane === "frontal" ? NaN : (backMin - backStart) / S;
  add("back_foot", backMove, {
    label: "Back-foot movement",
    unit: "× stature",
    reading: backMove < -0.06 ? "back foot moves back toward the stumps" : "back foot stays put",
    evidenceIds: events.byType.back_foot_commit ? [events.byType.back_foot_commit.id] : [],
    modality: "body",
  });

  const wrist = scene.get(refFrame, "front_wrist");
  const wrist2 = scene.get(refFrame, "back_wrist");
  if (wrist && wrist2) {
    const h = (wrist.u + wrist2.u) / 2 / S;
    add("hands_height", h, {
      label: "Hands height",
      unit: "× stature",
      reading: h > 0.75 ? "hands high" : h > 0.6 ? "hands around chest height" : h < 0.32 ? "hands very low" : "hands around waist height",
      evidenceIds: [`frame_${refFrame}`],
      modality: "body",
    });
  }
  const bk = scene.get(refFrame, "back_knee");
  if (bk) {
    add("back_knee_height", bk.u / S, {
      label: "Back-knee height",
      unit: "× stature",
      reading: bk.u / S < 0.12 ? "back knee down (kneeling)" : "back knee off the ground",
      evidenceIds: [`frame_${refFrame}`],
      modality: "body",
    });
  }

  // Trunk rotation: 3D yaw when depth exists, the 3D pose estimate when filmed along the
  // pitch, else the side-on projected shoulder-width proxy.
  if (!scene.depth && scene.estYaw) {
    const yaw = (i: number) => scene.estYaw!(i, "front_shoulder", "back_shoulder");
    const y0 = avg(Array.from({ length: early }, (_, i) => yaw(i)));
    let maxRot = 0;
    for (let i = 0; i <= Math.min(n - 1, refFrame + Math.round(n * 0.15)); i++) {
      const y = yaw(i);
      if (Number.isFinite(y)) maxRot = Math.max(maxRot, Math.abs(y - y0));
    }
    if (Number.isFinite(y0)) {
      const rot = Math.min(1, maxRot / (Math.PI / 2));
      add("rotation", rot, {
        label: "Trunk rotation (3D estimate)",
        unit: "fraction of 90°",
        reading: rot > 0.4 ? "large trunk rotation" : "limited trunk rotation",
        evidenceIds: [`frame_${refFrame}`],
        modality: "body",
      });
    }
  } else if (scene.depth) {
    const yaw = (i: number) => {
      const a = scene.depth!(i, "front_shoulder");
      const b = scene.depth!(i, "back_shoulder");
      return a && b ? Math.atan2(a[2] - b[2], a[0] - b[0]) : NaN;
    };
    const y0 = avg(Array.from({ length: early }, (_, i) => yaw(i)));
    let maxRot = 0;
    for (let i = 0; i <= Math.min(n - 1, refFrame + Math.round(n * 0.15)); i++) {
      const y = yaw(i);
      if (Number.isFinite(y)) maxRot = Math.max(maxRot, Math.abs(y - y0));
    }
    const rot = Math.min(1, maxRot / (Math.PI / 2));
    add("rotation", rot, {
      label: "Trunk rotation",
      unit: "fraction of 90°",
      reading: rot > 0.4 ? "large trunk rotation" : "limited trunk rotation",
      evidenceIds: [`frame_${refFrame}`],
      modality: "body",
    });
  } else {
    const width = (i: number) => {
      const a = scene.get(i, "front_shoulder");
      const b = scene.get(i, "back_shoulder");
      return a && b ? Math.abs(a.f - b.f) : NaN;
    };
    const w0 = avg(Array.from({ length: early }, (_, i) => width(i)));
    let wMin = Infinity;
    for (let i = early; i <= Math.min(n - 1, refFrame + Math.round(n * 0.15)); i++) {
      const w = width(i);
      if (Number.isFinite(w)) wMin = Math.min(wMin, w);
    }
    if (Number.isFinite(w0) && w0 > 0.05 * S && Number.isFinite(wMin)) {
      const rot = Math.max(0, Math.min(1, 1 - wMin / w0));
      add("rotation", rot, {
        label: "Trunk rotation (2D proxy)",
        unit: "fraction",
        reading: rot > 0.4 ? "large trunk rotation" : "limited trunk rotation",
        evidenceIds: [`frame_${refFrame}`],
        modality: "body",
      });
    }
  }

  // --- Bat ---
  const h = scene.batHandle[refFrame];
  const t = scene.batToe[refFrame];
  if (h && t) {
    const ang = angleFromVertical([h.f, h.u], [t.f, t.u]);
    add("bat_angle", ang, {
      label: "Bat angle at contact",
      unit: "° from vertical",
      reading: ang > 50 ? "horizontal bat" : ang > 30 ? "angled bat" : "vertical bat",
      evidenceIds: contact ? [contact.id, `frame_${refFrame}`] : [`frame_${refFrame}`],
      modality: "bat",
    });
  }
  if (dt) {
    const speedAt = (i: number) => {
      const a = sweetSpot(scene, i - 1);
      const b = sweetSpot(scene, i + 1);
      return a && b ? Math.hypot(b.f - a.f, b.u - a.u) / (2 * dt) : NaN;
    };
    const k = Math.max(1, Math.round(0.017 / dt));
    const sp = Math.max(...[-k, 0, k].map((o) => speedAt(refFrame + o)).filter(Number.isFinite));
    // Below 60 fps a ±1-frame difference spans most of the downswing, so speed is withheld.
    // Filmed along the pitch, the bat's forward travel is out of plane: speed would read low.
    if (Number.isFinite(sp) && !coarseTiming && scene.plane === "sagittal") {
      add("bat_speed", sp / S, {
        label: "Bat speed near contact",
        unit: "× stature/s",
        reading: sp / S > 5 ? "fast bat through contact" : sp / S < 3 ? "slow, controlled bat" : "moderate bat speed",
        evidenceIds: [`frame_${refFrame}`],
        modality: "bat",
      });
    }
    // Follow-through: sweet-spot path length and peak height in 400 ms after contact.
    const win = Math.round(0.4 / dt);
    let path = 0;
    let have = 0;
    for (let i = refFrame; i < Math.min(n - 1, refFrame + win); i++) {
      const a = sweetSpot(scene, i);
      const b = sweetSpot(scene, i + 1);
      if (a && b) {
        path += Math.hypot(b.f - a.f, b.u - a.u);
        have++;
      }
    }
    if (have > win * 0.5) {
      add("follow_through", path / S, {
        label: "Bat travel after contact",
        unit: "× stature",
        reading: path / S > 0.7 ? "long follow-through" : "short, checked follow-through",
        evidenceIds: events.byType.follow_through ? [events.byType.follow_through.id] : [],
        modality: "bat",
      });
      const heights = Array.from({ length: win }, (_, o) => sweetSpot(scene, refFrame + o)?.u ?? NaN);
      const top = argmax(heights);
      if (top >= 0) {
        const fh = heights[top]! / S;
        add("follow_height", fh, {
          label: "Follow-through height",
          unit: "× stature",
          reading: fh > 0.85 ? "bat finishes high" : "bat finishes low",
          evidenceIds: [`frame_${refFrame + top}`],
          modality: "bat",
        });
      }
    }
  }

  // --- Ball ---
  if (delivery.available && delivery.length) {
    add("length_short", delivery.length.short, {
      label: "Short-ball probability",
      unit: "probability",
      reading: delivery.length.short > 0.6 ? "short-pitched delivery" : delivery.length.short < 0.3 ? "full or good-length delivery" : "length unclear",
      evidenceIds: delivery.evidenceIds,
      modality: "ball",
    });
  }
  const contactReliable = contact && contact.confidence >= 0.5;
  let contactHeight = NaN;
  let contactModality: ShotFeature["modality"] = "ball";
  if (contactReliable) {
    const b = scene.ball[contact.frame];
    const ss = sweetSpot(scene, contact.frame);
    if (b) contactHeight = b.u / S;
    else if (ss) {
      contactHeight = ss.u / S;
      contactModality = "bat";
    }
  } else if (delivery.heightAtBatterRel !== null) {
    contactHeight = delivery.heightAtBatterRel;
  }
  add("contact_height", contactHeight, {
    label: "Contact height",
    unit: "× stature",
    reading:
      contactHeight > 0.8 ? "contact above shoulder height" : contactHeight > 0.55 ? "contact near chest height" : contactHeight < 0.3 ? "contact below the knee" : "contact around thigh height",
    evidenceIds: contactReliable ? [contact.id] : delivery.evidenceIds,
    modality: contactModality,
  });

  const ballCount = scene.ball.filter(Boolean).length;
  if (ballCount >= 4 && dt) {
    // Filmed along the pitch the ball leaves mostly toward or away from the camera, so
    // its image speed would understate a drive: not observed rather than biased.
    if (contactReliable && !coarseTiming && scene.plane === "sagittal") {
      const pts: { f: number; u: number; i: number }[] = [];
      for (let i = contact.frame + 1; i <= Math.min(n - 1, contact.frame + Math.round(0.08 / dt) + 1); i++) {
        const b = scene.ball[i];
        if (b) pts.push({ ...b, i });
      }
      if (pts.length >= 2) {
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        const v = Math.hypot(b.f - a.f, b.u - a.u) / ((b.i - a.i) * dt);
        add("ball_exit", v / S, {
          label: "Ball speed off the bat",
          unit: "× stature/s",
          reading: v / S > 5 ? "ball leaves the bat fast" : "ball deadened off the bat",
          evidenceIds: [contact.id],
          modality: "ball",
        });
      }
    }
    if (contactReliable) {
      add("contact_found", 1, {
        label: "Bat–ball contact",
        unit: "flag",
        reading: "bat meets ball",
        evidenceIds: [contact.id],
        modality: "bat+ball",
      });
    } else if (scene.batHandle.some(Boolean) && ballSeenThroughStroke(scene, events)) {
      add("contact_found", 0, {
        label: "Bat–ball contact",
        unit: "flag",
        reading: "ball passes without contact",
        evidenceIds: [],
        modality: "bat+ball",
      });
    }
  }

  return { values, coarseTiming, refFrame, list };
}
