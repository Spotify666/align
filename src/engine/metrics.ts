// Stage F — front-foot-defence movement indicators.
// Only called for a VALID front-foot defence. Each metric declares the evidence it
// needs; if the capture tier or tracking cannot supply it, the metric is returned
// as "not measured" with the reason — never as zero and never guessed.

import { angleAt, angleFromVertical, clamp, mean, round } from "./math";
import { METRICS, RANGE_SOURCE, type MetricDefinition } from "./registry";
import { bodyCentre, type P, type Scene, type SemanticJoint, sweetSpot } from "./scene";
import type { DeliveryContext, Metric } from "./types";
import type { EventSet } from "./events";
import type { FeatureSet } from "./features";
import { LINE_SOURCE_SIDEWAYS, type Alignment } from "./alignment";

/** The line and its timing: read in the picture's own plane, so valid from any camera position. */
export const ALIGNMENT_IDS = ["line_head", "line_shoulder", "line_knee", "line_held", "sync_spread", "set_late"];

type Requirement = MetricDefinition["requires"][number];

const REQUIREMENT_TEXT: Record<Requirement, string> = {
  body: "the batter was not tracked reliably",
  bat: "the bat was not tracked",
  ball: "the ball was not visible",
  depth: "it needs depth from the 3D Session tier (two calibrated phones)",
  timing: "the frame rate is below 60 fps, so timing precision is unsupported",
  scale: "no pitch scale (mark the stumps or add your height)",
  contact: "contact was not located reliably",
  bounce: "the bounce was not seen",
  baseline: "it needs at least 6 valid deliveries",
  side_view: "it needs a side-on camera (this clip was filmed along the pitch)",
};

export interface MetricContext {
  scene: Scene;
  events: EventSet;
  features: FeatureSet;
  delivery: DeliveryContext;
  tier: "quick" | "session3d" | "lab";
  /** Photo posture screen: treat this frame as the reference moment (never called "contact"). */
  postureFrame?: number;
  /** The line at contact and how it formed (see alignment.ts). */
  alignment?: Alignment | null;
}

function avail(ctx: MetricContext): Record<Requirement, boolean> {
  const { scene, events } = ctx;
  const contact = events.byType.contact;
  return {
    body: true,
    bat: scene.batToe.filter(Boolean).length > scene.n * 0.4,
    ball: scene.ball.filter(Boolean).length >= 4,
    depth: !!scene.depth,
    timing: !!scene.dt && 1 / scene.dt >= 60,
    scale: scene.unit === "m",
    contact: ctx.postureFrame !== undefined || (!!contact && contact.confidence >= 0.5),
    bounce: !!events.byType.bounce,
    baseline: false,
    side_view: scene.plane === "sagittal",
  };
}

/** Joint position averaged over ±1 frame to damp single-frame noise. */
function at(scene: Scene, joint: SemanticJoint, frame: number): P | null {
  const ps = [frame - 1, frame, frame + 1].map((i) => scene.get(i, joint)).filter((p): p is P => !!p);
  if (!ps.length) return null;
  return { f: mean(ps.map((p) => p.f)), u: mean(ps.map((p) => p.u)), c: Math.min(...ps.map((p) => p.c)) };
}

/** 1-sigma position noise in scene units for a landmark of confidence c. */
const posSigma = (scene: Scene, c: number) => scene.stature * 0.012 * (1.6 - clamp(c, 0, 1));

export function computeMetrics(ctx: MetricContext): Metric[] {
  const { scene, events, features } = ctx;
  const ok = avail(ctx);
  const S = scene.stature;
  const contact = events.byType.contact;
  const cf = ctx.postureFrame ?? contact?.frame ?? features.refFrame;
  // Contact not seen: measures are taken at the set position the ball was met from.
  const atSet = ctx.postureFrame === undefined && ctx.alignment?.referenceKind === "set";
  const twoD = !scene.depth;
  const evidence = (...ids: (string | undefined)[]) => ids.filter((x): x is string => !!x);

  const out: Metric[] = [];
  const media = ctx.postureFrame !== undefined ? "photo" : "video";
  for (const def of METRICS) {
    if (def.only && def.only !== media) continue;
    const missing = def.requires.filter((r) => !ok[r]);
    const base: Metric = {
      id: def.id,
      name: def.name,
      domain: def.domain,
      status: "not_measured",
      value: null,
      uncertainty: null,
      unit: def.unit,
      decimals: def.decimals,
      confidence: 0,
      phase: atSet && def.phase === "Contact" ? "Set position" : def.phase,
      meaning: def.meaning,
      relevance: def.relevance,
      range: def.range ? { ...def.range, ...RANGE_SOURCE, ...(def.basis ? { source: def.basis } : {}) } : null,
      inRange: null,
      evidenceIds: [],
    };
    if (missing.length) {
      out.push({ ...base, reason: `Not measured: ${REQUIREMENT_TEXT[missing[0]!]}.` });
      continue;
    }
    const al = ctx.alignment ?? null;
    const sideways = al?.axis === "sideways";
    const range = sideways && def.rangeSideways ? def.rangeSideways : def.range;
    if (range !== def.range) base.range = range ? { ...range, ...RANGE_SOURCE, source: LINE_SOURCE_SIDEWAYS } : null;

    let value = NaN;
    let unc = NaN;
    let conf = 0.8;
    let estimated = false;
    let limitation: string | undefined;
    let ev: string[] = [];

    switch (def.id) {
      case "decision_timing": {
        const bounce = events.byType.bounce!;
        const dt = scene.dt!;
        const f0 = mean(Array.from({ length: Math.max(2, Math.round(scene.n * 0.15)) }, (_, i) => scene.get(i, "front_ankle")?.f ?? NaN));
        let onset = -1;
        for (let i = 1; i < scene.n - 1; i++) {
          const p = scene.get(i, "front_ankle");
          if (p && p.f - f0 > 0.03 * S) {
            onset = i;
            break;
          }
        }
        if (onset >= 0) {
          value = (onset - bounce.frame) * dt * 1000;
          unc = 2 * dt * 1000;
          conf = Math.min(0.85, bounce.confidence);
          ev = evidence(bounce.id, `frame_${onset}`);
        }
        break;
      }
      case "stride_length": {
        value = features.values.front_stride ?? NaN;
        const plant = events.byType.front_foot_plant;
        const c = plant ? (scene.get(plant.frame, "front_ankle")?.c ?? 0.6) : 0.6;
        unc = (Math.SQRT2 * posSigma(scene, c)) / S;
        conf = c;
        ev = evidence(plant?.id, plant ? `frame_${plant.frame}` : undefined);
        break;
      }
      case "front_knee_flexion": {
        const h = at(scene, "front_hip", cf);
        const k = at(scene, "front_knee", cf);
        const a = at(scene, "front_ankle", cf);
        if (h && k && a) {
          value = angleAt([h.f, h.u], [k.f, k.u], [a.f, a.u]);
          const seg = Math.min(Math.hypot(h.f - k.f, h.u - k.u), Math.hypot(a.f - k.f, a.u - k.u));
          unc = ((Math.sqrt(3) * posSigma(scene, k.c)) / seg) * (180 / Math.PI) + (twoD ? 4 : 1);
          conf = Math.min(h.c, k.c, a.c);
          estimated = twoD;
          if (twoD) limitation = "2D projection: a knee that points away from the camera reads straighter than it is.";
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "foot_spread": {
        const fa = at(scene, "front_ankle", cf);
        const ba = at(scene, "back_ankle", cf);
        if (fa && ba) {
          value = (fa.f - ba.f) / S;
          unc = (Math.SQRT2 * posSigma(scene, Math.min(fa.c, ba.c))) / S;
          conf = Math.min(fa.c, ba.c);
          ev = evidence(`frame_${cf}`);
        }
        break;
      }
      case "back_knee_extension": {
        const h = at(scene, "back_hip", cf);
        const k = at(scene, "back_knee", cf);
        const a = at(scene, "back_ankle", cf);
        if (h && k && a) {
          value = angleAt([h.f, h.u], [k.f, k.u], [a.f, a.u]);
          const seg = Math.min(Math.hypot(h.f - k.f, h.u - k.u), Math.hypot(a.f - k.f, a.u - k.u));
          unc = ((Math.sqrt(3) * posSigma(scene, k.c)) / seg) * (180 / Math.PI) + (twoD ? 4 : 1);
          conf = Math.min(h.c, k.c, a.c);
          estimated = twoD;
          if (twoD) limitation = "2D projection: a knee that points away from the camera reads straighter than it is.";
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "hands_ahead_of_knee": {
        const k = at(scene, "front_knee", cf);
        const ws = [at(scene, "front_wrist", cf), at(scene, "back_wrist", cf)].filter((p): p is P => !!p);
        if (k && ws.length) {
          // Both hands grip the handle together; one seen is enough.
          value = (mean(ws.map((w) => w.f)) - k.f) / S;
          const c = Math.min(k.c, ...ws.map((w) => w.c));
          unc = (Math.SQRT2 * posSigma(scene, c)) / S;
          conf = c * (ws.length === 2 ? 1 : 0.85);
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "weight_forward": {
        const c = bodyCentre(scene, cf);
        const fa = at(scene, "front_ankle", cf);
        const ba = at(scene, "back_ankle", cf);
        if (c && fa && ba && Math.abs(fa.f - ba.f) > 0.05 * S) {
          value = clamp((c.f - ba.f) / (fa.f - ba.f), -0.2, 1.2);
          unc = (2 * posSigma(scene, c.c)) / Math.abs(fa.f - ba.f);
          conf = Math.min(c.c, fa.c, ba.c) * 0.9;
          estimated = true;
          limitation = "Centre of mass is estimated from hips and shoulders, not measured.";
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "line_head":
      case "line_shoulder":
      case "line_knee": {
        const part = def.id.slice(5) as "head" | "shoulder" | "knee";
        if (!al) break;
        if (part === "head" && al.sideUnclear) {
          limitation = "Which side is the off side isn't clear (your batting hand and your toes disagree), so the head's side is shown, not graded.";
        }
        value = al.atContact[part];
        const joint = part === "head" ? "head" : part === "shoulder" ? "front_shoulder" : "front_knee";
        const p = at(scene, joint, cf);
        const c = p?.c ?? 0.6;
        unc = (Math.SQRT2 * posSigma(scene, c)) / S;
        conf = c;
        ev = evidence(contact?.id, `frame_${cf}`);
        break;
      }
      case "line_held": {
        if (!al || al.held === null) break;
        value = al.held;
        // One frame either way of the landing moves the share by about one frame's worth.
        unc = 1 / Math.max(al.heldFrames, 1);
        conf = 0.75;
        ev = evidence(events.byType.front_foot_plant?.id, contact?.id);
        if (al.referenceKind === "contact" && (al.arrivals?.foot.ms ?? 0) > 0) limitation = "Your front foot was still landing at contact, so the line was never set before the ball arrived.";
        if (al.referenceKind === "set") limitation = "Bat and ball not seen: held from the front foot's landing to the set position the ball was met from.";
        break;
      }
      case "sync_spread": {
        if (!al || al.spreadMs === null) break;
        value = al.spreadMs;
        unc = 2 * (scene.dt ?? 0) * 1000;
        conf = 0.7;
        ev = evidence(contact?.id);
        break;
      }
      case "set_late": {
        if (!al || al.latestMs === null) break;
        value = Math.max(0, al.latestMs);
        // One frame for the arrival, plus the contact estimate (two frames when it is read from the hands).
        unc = ((contact && contact.confidence >= 0.65 ? 1 : 3) * (scene.dt ?? 0)) * 1000;
        conf = Math.min(0.7, contact?.confidence ?? 0.5);
        ev = evidence(contact?.id);
        break;
      }
      case "head_speed_contact": {
        // Net head displacement across the window: robust to per-frame landmark jitter,
        // which would dominate a frame-to-frame speed at 120+ fps.
        const dt = scene.dt!;
        const half = Math.round(0.1 / dt);
        const a = at(scene, "head", cf - half);
        const b = at(scene, "head", cf + half);
        if (a && b) {
          value = Math.hypot(b.f - a.f, b.u - a.u) / (2 * half * dt) / S;
          unc = (posSigma(scene, Math.min(a.c, b.c)) * Math.SQRT2) / (2 * half * dt) / S;
          conf = Math.min(a.c, b.c);
          ev = evidence(contact?.id, `frame_${cf - half}`, `frame_${cf + half}`);
        }
        break;
      }
      case "trunk_inclination": {
        const fh = at(scene, "front_hip", cf);
        const bh = at(scene, "back_hip", cf);
        const fs = at(scene, "front_shoulder", cf);
        const bs = at(scene, "back_shoulder", cf);
        if (fh && bh && fs && bs) {
          const hip: [number, number] = [(fh.f + bh.f) / 2, (fh.u + bh.u) / 2];
          const sh: [number, number] = [(fs.f + bs.f) / 2, (fs.u + bs.u) / 2];
          value = angleFromVertical(hip, sh) * Math.sign(sh[0] - hip[0] || 1);
          const seg = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]);
          unc = ((posSigma(scene, Math.min(fh.c, fs.c)) * Math.SQRT2) / seg) * (180 / Math.PI) + (twoD ? 3 : 1);
          conf = Math.min(fh.c, bh.c, fs.c, bs.c);
          estimated = twoD;
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "pelvis_thorax_separation": {
        const yaw = (a: SemanticJoint, b: SemanticJoint, i: number) => {
          const p = scene.depth!(i, a);
          const q = scene.depth!(i, b);
          return p && q ? Math.atan2(p[2] - q[2], p[0] - q[0]) : NaN;
        };
        const top = events.byType.backswing_top?.frame ?? 0;
        let maxSep = 0;
        for (let i = top; i <= Math.min(scene.n - 1, cf); i++) {
          const s = yaw("front_shoulder", "back_shoulder", i);
          const h = yaw("front_hip", "back_hip", i);
          if (Number.isFinite(s) && Number.isFinite(h)) maxSep = Math.max(maxSep, Math.abs(s - h));
        }
        value = (maxSep * 180) / Math.PI;
        unc = 5;
        conf = 0.7;
        estimated = ctx.tier !== "lab";
        limitation = "Derived from triangulated landmarks; not yet validated against a lab reference.";
        ev = evidence(events.byType.backswing_top?.id, contact?.id);
        break;
      }
      case "bat_angle_contact": {
        value = features.values.bat_angle ?? NaN;
        unc = twoD ? 6 : 3;
        conf = Math.min(scene.batHandle[cf]?.c ?? 0.6, scene.batToe[cf]?.c ?? 0.6);
        estimated = twoD;
        if (scene.plane === "frontal") limitation = "Filmed along the pitch: this is the bat's sideways tilt; its forward tilt is not visible.";
        else if (twoD) limitation = "2D projection: a bat angled toward or away from the camera looks more vertical than it is.";
        ev = evidence(contact?.id, `frame_${cf}`);
        break;
      }
      case "contact_ahead_of_knee": {
        const k = at(scene, "front_knee", cf);
        const b = scene.ball[cf] ?? sweetSpot(scene, cf);
        if (k && b) {
          value = (b.f - k.f) / S;
          unc = (Math.SQRT2 * posSigma(scene, Math.min(k.c, b.c))) / S;
          conf = Math.min(k.c, b.c);
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "bat_speed_contact": {
        const dt = scene.dt!;
        const a = sweetSpot(scene, cf - 1);
        const b = sweetSpot(scene, cf + 1);
        if (a && b) {
          value = Math.hypot(b.f - a.f, b.u - a.u) / (2 * dt);
          unc = (Math.SQRT2 * posSigma(scene, Math.min(a.c, b.c))) / (2 * dt);
          conf = Math.min(a.c, b.c);
          estimated = scene.scaleSource !== "calibration";
          ev = evidence(contact?.id, `frame_${cf}`);
        }
        break;
      }
      case "ball_exit_speed": {
        const dt = scene.dt!;
        const pts: Array<{ p: P; i: number }> = [];
        for (let i = cf + 1; i <= Math.min(scene.n - 1, cf + Math.round(0.08 / dt) + 1); i++) {
          const p = scene.ball[i];
          if (p) pts.push({ p, i });
        }
        if (pts.length >= 2) {
          const a = pts[0]!;
          const b = pts[pts.length - 1]!;
          value = Math.hypot(b.p.f - a.p.f, b.p.u - a.p.u) / ((b.i - a.i) * dt);
          unc = (Math.SQRT2 * posSigma(scene, 0.7)) / ((b.i - a.i) * dt);
          conf = 0.65;
          estimated = true;
          limitation = "Side-on view cannot see ball movement toward or away from the camera.";
          ev = evidence(contact?.id, `frame_${a.i}`, `frame_${b.i}`);
        }
        break;
      }
      default:
        break;
    }

    if (!Number.isFinite(value)) {
      out.push({ ...base, reason: "Not measured: the required landmarks were not visible at the needed frames." });
      continue;
    }
    if (sideways && def.id === "line_head" && al?.sideUnclear) {
      const v = round(value, def.decimals + 1);
      out.push({ ...base, status: "estimated", value: v, uncertainty: null, confidence: round(clamp(conf, 0, 1), 2), range: null, inRange: null, evidenceIds: ev, limitation });
      continue;
    }
    if (scene.plane === "frontal" && def.requires.includes("body") && !ALIGNMENT_IDS.includes(def.id)) {
      estimated = true;
      limitation = [limitation, "Filmed along the pitch: forward distances come from a 3D pose estimate."].filter(Boolean).join(" ");
    }
    if (estimated && scene.scaleSource === "athlete_height" && /m\/s|cm/.test(def.unit)) {
      limitation = [limitation, "Scale estimated from your height."].filter(Boolean).join(" ");
    }
    const v = round(value, def.decimals + 1);
    out.push({
      ...base,
      ...(ALIGNMENT_IDS.slice(0, 3).includes(def.id) && al ? { axis: al.axis } : {}),
      status: estimated ? "estimated" : "measured",
      value: v,
      uncertainty: Number.isFinite(unc) ? round(Math.max(unc, 10 ** -def.decimals), def.decimals + 1) : null,
      confidence: round(clamp(conf, 0, 1), 2),
      inRange: range ? v >= range.lo && v <= range.hi : null,
      evidenceIds: ev,
      limitation,
    });
  }
  return out;
}
