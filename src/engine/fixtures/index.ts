// The required fixtures (MASTER_BUILD_PROMPT §Required fixtures). All DEMO DATA.

import type { CaptureObservation } from "../types";
import { generate, type GenerateOptions, type ShotScript } from "./generate";

type V3 = [number, number, number];
const H = 1.75;

// ---------- Shot scripts (right-handed, metres, seconds) ----------

const setupHands: V3 = [0.98, 0.92, 0.26];
const setupBat: V3 = [-0.22, -0.97, 0];

export function ffdScript(v: Partial<{ stride: number; headFwd: number; lean: number; contactAhead: number; hipDrop: number }> = {}): ShotScript {
  const stride = v.stride ?? 0.66;
  const plantF = 1.15 + stride;
  const contactF = plantF + 0.02 + (v.contactAhead ?? 0);
  return {
    frontAnkle: [
      [0, [1.15, 0.08, 0]],
      [0.5, [1.15, 0.08, 0]],
      [0.64, [1.15 + stride * 0.55, 0.16, -0.02]],
      [0.78, [plantF, 0.08, -0.03]],
      [2, [plantF, 0.08, -0.03]],
    ],
    backAnkle: [
      [0, [0.75, 0.08, 0]],
      [0.46, [0.72, 0.08, 0.01]],
      [2, [0.72, 0.08, 0.01]],
    ],
    hipC: [
      [0, [0.95, 0.88, 0.02]],
      [0.5, [0.95, 0.88, 0.02]],
      [0.78, [1.2 + stride * 0.25, 0.84 - (v.hipDrop ?? 0.06), 0.04]],
      [0.86, [1.24 + stride * 0.28, 0.82 - (v.hipDrop ?? 0.06), 0.05]],
      [2, [1.24 + stride * 0.28, 0.83 - (v.hipDrop ?? 0.06), 0.05]],
    ],
    lean: [
      [0, 8],
      [0.5, 8],
      [0.84, v.lean ?? 24],
      [2, (v.lean ?? 24) - 2],
    ],
    sideLean: [
      [0, 12],
      [2, 10],
    ],
    shoulderYaw: [
      [0, 0],
      [0.9, 12],
      [2, 10],
    ],
    hipYaw: [
      [0, 0],
      [0.9, 8],
      [2, 8],
    ],
    headFwd: [
      [0, 0],
      [0.5, 0],
      [0.84, v.headFwd ?? 0.18],
      [2, (v.headFwd ?? 0.18) - 0.02],
    ],
    hands: [
      [0, setupHands],
      [0.5, setupHands],
      [0.7, [1.05, 1.18, 0.2]],
      [0.92, [contactF + 0.12, 0.92, 0.1]],
      [1.05, [contactF + 0.16, 0.92, 0.1]],
      [2, [contactF + 0.16, 0.93, 0.1]],
    ],
    batDir: [
      [0, setupBat],
      [0.5, setupBat],
      [0.7, [-0.5, 0.84, 0.2]],
      [0.92, [-0.18, -0.98, 0]],
      [1.05, [-0.15, -0.99, 0]],
      [2, [-0.15, -0.99, 0]],
    ],
    ball: { releaseT: 0.3, speed: 30, bounceF: 4.6, contactF, contactU: 0.36, lateral: 0.05, exit: [2.2, -1.2, 0.2], visible: true },
  };
}

function driveScript(): ShotScript {
  const base = ffdScript({ stride: 0.68 });
  const contactF = 1.15 + 0.68 + 0.08;
  return {
    ...base,
    hands: [
      [0, setupHands],
      [0.5, setupHands],
      [0.68, [1.0, 1.32, 0.22]],
      [0.84, [1.5, 1.05, 0.16]],
      [0.92, [contactF + 0.15, 0.85, 0.08]],
      [1.0, [contactF + 0.75, 1.25, 0.0]],
      [1.12, [contactF + 0.55, 1.75, -0.1]],
      [2, [contactF + 0.45, 1.7, -0.1]],
    ],
    batDir: [
      [0, setupBat],
      [0.5, setupBat],
      [0.68, [-0.55, 0.8, 0.2]],
      [0.84, [-0.75, -0.6, 0.1]],
      [0.92, [-0.32, -0.95, 0]],
      [1.0, [0.65, -0.55, -0.1]],
      [1.12, [0.2, 0.95, -0.2]],
      [2, [-0.2, 0.97, -0.2]],
    ],
    shoulderYaw: [
      [0, 0],
      [0.92, 18],
      [1.15, 30],
      [2, 28],
    ],
    ball: { releaseT: 0.3, speed: 30, bounceF: 3.3, contactF, contactU: 0.27, lateral: 0.05, exit: [24, 0.8, 1.5], visible: true },
  };
}

function pullScript(): ShotScript {
  return {
    frontAnkle: [
      [0, [1.15, 0.08, 0]],
      [0.5, [1.15, 0.08, 0]],
      [0.66, [1.1, 0.12, -0.15]],
      [0.76, [1.08, 0.08, -0.3]],
      [2, [1.08, 0.08, -0.3]],
    ],
    backAnkle: [
      [0, [0.75, 0.08, 0]],
      [0.46, [0.73, 0.08, 0.02]],
      [0.58, [0.58, 0.12, 0.15]],
      [0.68, [0.5, 0.08, 0.25]],
      [2, [0.5, 0.08, 0.25]],
    ],
    hipC: [
      [0, [0.95, 0.88, 0.02]],
      [0.5, [0.95, 0.88, 0.02]],
      [0.72, [0.78, 0.92, 0.0]],
      [2, [0.8, 0.92, -0.05]],
    ],
    lean: [
      [0, 8],
      [0.5, 8],
      [0.8, 4],
      [2, 2],
    ],
    sideLean: [
      [0, 12],
      [0.8, 6],
      [2, 4],
    ],
    shoulderYaw: [
      [0, 0],
      [0.55, 0],
      [0.82, 50],
      [0.95, 78],
      [2, 80],
    ],
    hipYaw: [
      [0, 0],
      [0.82, 35],
      [0.95, 55],
      [2, 55],
    ],
    headFwd: [
      [0, 0],
      [2, -0.02],
    ],
    hands: [
      [0, setupHands],
      [0.5, setupHands],
      [0.7, [0.9, 1.42, 0.3]],
      [0.8, [0.98, 1.2, 0.35]],
      [0.88, [0.8, 1.15, 0.3]],
      [1.0, [0.7, 1.35, -0.2]],
      [1.12, [0.62, 1.55, -0.35]],
      [2, [0.6, 1.5, -0.35]],
    ],
    batDir: [
      [0, setupBat],
      [0.5, setupBat],
      [0.7, [-0.4, 0.88, 0.25]],
      [0.8, [0.1, 0.35, 0.93]],
      [0.88, [0.36, 0.12, -0.93]],
      [1.0, [0.2, 0.55, -0.8]],
      [1.12, [-0.3, 0.9, -0.3]],
      [2, [-0.35, 0.9, -0.25]],
    ],
    ball: { releaseT: 0.3, speed: 32, bounceF: 10.2, contactF: 1.12, contactU: 1.27, lateral: -0.1, exit: [-2.5, 1.2, -20], visible: true },
  };
}

function halfDriveScript(): ShotScript {
  const base = ffdScript({ stride: 0.62 });
  const contactF = 1.15 + 0.62 + 0.04;
  return {
    ...base,
    hands: [
      [0, setupHands],
      [0.5, setupHands],
      [0.7, [1.04, 1.24, 0.2]],
      [0.92, [contactF + 0.14, 0.9, 0.1]],
      [1.02, [contactF + 0.42, 1.06, 0.06]],
      [1.15, [contactF + 0.48, 1.18, 0.04]],
      [2, [contactF + 0.46, 1.18, 0.04]],
    ],
    batDir: [
      [0, setupBat],
      [0.5, setupBat],
      [0.7, [-0.5, 0.84, 0.2]],
      [0.92, [-0.22, -0.97, 0]],
      [1.02, [0.25, -0.95, 0]],
      [1.15, [0.55, -0.6, 0]],
      [2, [0.55, -0.6, 0]],
    ],
    ball: { releaseT: 0.3, speed: 30, bounceF: 4.2, contactF, contactU: 0.33, lateral: 0.05, exit: [7, 0.2, 0.5], visible: true },
  };
}

// ---------- Fixture definitions ----------

/** The athlete's "current attempt": head arrives slightly behind the front knee. */
const ATTEMPT = { headFwd: -0.02 };

export interface FixtureSpec {
  key: string;
  title: string;
  expectation: string;
  options: GenerateOptions;
  /** Post-process the generated observation (e.g. degrade the capture). */
  mutate?: (obs: CaptureObservation) => CaptureObservation;
}

const common = { statureM: H, durationS: 2, fps: 120 } as const;

export const FIXTURE_SPECS: FixtureSpec[] = [
  {
    key: "valid_ffd",
    title: "Valid front-foot defence",
    expectation: "valid — full report with domains, strengths, priority and drills",
    options: { ...common, id: "fx_valid_ffd", label: "Valid front-foot defence", seed: 11, handedness: "right", script: ffdScript(ATTEMPT) },
  },
  {
    key: "pull",
    title: "Pull shot submitted as front-foot defence",
    expectation: "invalid_for_requested_analysis — pull shot, no technique score",
    options: { ...common, id: "fx_pull", label: "Pull shot", seed: 22, handedness: "right", script: pullScript() },
  },
  {
    key: "drive",
    title: "Front-foot drive with a defence-like body shape",
    expectation: "invalid_for_requested_analysis — drive, no technique score",
    options: { ...common, id: "fx_drive", label: "Front-foot drive", seed: 33, handedness: "right", script: driveScript() },
  },
  {
    key: "occluded",
    title: "Ambiguous, occluded shot",
    expectation: "uncertain_shot — no forced class, recapture guidance",
    options: {
      ...common,
      id: "fx_occluded",
      label: "Occluded ambiguous shot",
      seed: 44,
      handedness: "right",
      script: halfDriveScript(),
      maxPeople: 2,
      occlusion: { fromT: 0.82, toT: 1.02, joints: ["left_knee", "left_ankle", "left_heel", "left_foot", "right_knee", "right_ankle"], dropBat: true, dropBall: true },
    },
  },
  {
    key: "photo",
    title: "Photo-only upload",
    expectation: "uncertain_shot (photo_only) — posture screen, no timing/ball/bat claims",
    options: { ...common, id: "fx_photo", label: "Photo of a forward defence", seed: 55, handedness: "right", script: ffdScript(ATTEMPT), photoAtContact: true, withBall: false, withBat: false },
  },
  {
    key: "no_ball",
    title: "Ball not visible",
    expectation: "valid, confirmed from body, hands and bat — ball measures and delivery context not reported",
    options: { ...common, id: "fx_no_ball", label: "Defence, ball out of frame", seed: 66, handedness: "right", script: ffdScript(ATTEMPT), withBall: false },
  },
  {
    key: "no_bat",
    title: "Bat not visible",
    expectation: "valid, confirmed from body and hand movement — no bat-path or bat-angle claim",
    options: { ...common, id: "fx_no_bat", label: "Defence, bat not tracked", seed: 77, handedness: "right", script: ffdScript(ATTEMPT), withBat: false },
  },
  {
    key: "left_handed",
    title: "Left-handed batter",
    expectation: "valid — same measures as the right-handed defence, mirrored semantically",
    options: { ...common, id: "fx_left_handed", label: "Left-handed defence", seed: 11, handedness: "left", script: ffdScript(ATTEMPT) },
  },
  {
    key: "low_fps",
    title: "Low frame rate (30 fps)",
    expectation: "valid with timing measures withheld and a frame-rate limitation",
    options: { ...common, fps: 30, id: "fx_low_fps", label: "Defence at 30 fps", seed: 99, handedness: "right", script: ffdScript(ATTEMPT), marks: { bounce: true } },
  },
  {
    key: "capture_failed",
    title: "Unusable capture (low resolution, shaky, batter cut off)",
    expectation: "capture_failed — corrections listed, nothing classified",
    options: { ...common, fps: 30, id: "fx_capture_failed", label: "Shaky low-resolution clip", seed: 88, handedness: "right", script: ffdScript(ATTEMPT) },
    mutate: (obs) => ({
      ...obs,
      media: { ...obs.media, width: 426, height: 240 },
      quality: { ...obs.quality, frames: obs.quality.frames.map((f) => ({ ...f, sharpness: 0.006, backgroundMotion: 0.11, brightness: 0.14 })) },
      body: obs.body.map((fr, i) => (i % 5 < 3 ? fr.map(() => null) : fr)),
    }),
  },
  {
    key: "front_on_ffd",
    title: "Front-on defence (filmed from behind the bowler)",
    expectation: "valid or uncertain — forward measures are 3D estimates; never a different-shot verdict",
    options: { ...common, id: "fx_front_on_ffd", label: "Front-on defence", seed: 13, handedness: "right", script: ffdScript(ATTEMPT), view: "front_on" },
  },
  {
    key: "front_on_pull",
    title: "Front-on pull shot",
    expectation: "invalid_for_requested_analysis or uncertain — never scored",
    options: { ...common, id: "fx_front_on_pull", label: "Front-on pull shot", seed: 23, handedness: "right", script: pullScript(), view: "front_on" },
  },
  {
    key: "front_on_drive",
    title: "Front-on drive",
    expectation: "invalid_for_requested_analysis or uncertain — never scored",
    options: { ...common, id: "fx_front_on_drive", label: "Front-on drive", seed: 34, handedness: "right", script: driveScript(), view: "front_on" },
  },
  {
    key: "session3d",
    title: "3D Session preview (two calibrated phones)",
    expectation: "valid — depth-dependent measures available (preview, not validated)",
    options: { ...common, id: "fx_session3d", label: "3D Session defence", seed: 12, handedness: "right", script: ffdScript(ATTEMPT), tier: "session3d", include3d: true },
  },
];

/** Six-to-ten varied valid deliveries for the personal-baseline fixture. */
export function baselineSeries(count = 8): CaptureObservation[] {
  return Array.from({ length: count }, (_, k) => {
    const wobble = (a: number, b: number) => a + ((((k * 7919) % 13) / 12) * 2 - 1) * b;
    return generate({
      ...common,
      id: `fx_baseline_${k + 1}`,
      label: `Baseline delivery ${k + 1}`,
      seed: 100 + k,
      handedness: "right",
      script: ffdScript({ stride: wobble(0.66, 0.04), headFwd: wobble(0.13, 0.04), lean: wobble(24, 3) }),
    });
  });
}

const cache = new Map<string, CaptureObservation>();
export function fixture(key: string): CaptureObservation {
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = FIXTURE_SPECS.find((f) => f.key === key);
  if (!spec) throw new Error(`Unknown fixture ${key}`);
  const raw = generate(spec.options);
  const obs = spec.mutate ? spec.mutate(raw) : raw;
  cache.set(key, obs);
  return obs;
}
