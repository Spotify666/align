// Stage E (part 2) — open-set shot recognition.
// A transparent prototype model: each shot family has typical feature bands taken
// from coaching descriptions. Scores are softened likelihoods, NOT empirically
// calibrated probabilities; the UI says so. An explicit `unknown` class absorbs
// clips that fit no prototype, so the system never forces a label.

import { th } from "./registry";
import type { FeatureId, FeatureSet } from "./features";
import { SHOT_CLASSES, type ShotClass } from "./types";

type Band = readonly [lo: number, hi: number, sigma: number, weight: number];
type Prototype = Partial<Record<FeatureId, Band>>;

// Speeds are in stature/s (6 m/s ≈ 3.4 for a 1.75 m batter).
export const PROTOTYPES: Record<Exclude<ShotClass, "unknown">, Prototype> = {
  front_foot_defence: {
    front_stride: [0.22, 0.52, 0.06, 1],
    back_foot: [-0.05, 0.1, 0.04, 0.8],
    contact_height: [0.06, 0.44, 0.06, 1.2],
    hands_height: [0.33, 0.64, 0.06, 0.6],
    back_knee_height: [0.13, 0.42, 0.05, 0.5],
    bat_angle: [0, 30, 8, 1.3],
    bat_speed: [0, 3.6, 0.8, 1.2],
    follow_through: [0, 0.5, 0.15, 1.1],
    follow_height: [0.05, 0.62, 0.1, 0.8],
    rotation: [0, 0.38, 0.1, 0.8],
    length_short: [0, 0.32, 0.15, 1],
    ball_exit: [0, 4.6, 1.2, 1],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  front_foot_drive: {
    front_stride: [0.22, 0.56, 0.06, 1],
    back_foot: [-0.05, 0.12, 0.04, 0.8],
    contact_height: [0.04, 0.44, 0.06, 1.2],
    hands_height: [0.33, 0.68, 0.06, 0.6],
    back_knee_height: [0.1, 0.42, 0.05, 0.5],
    bat_angle: [0, 42, 8, 1.3],
    bat_speed: [5.5, 20, 1.2, 1.3],
    follow_through: [0.85, 4, 0.25, 1.3],
    follow_height: [0.8, 1.6, 0.12, 0.8],
    rotation: [0.05, 0.5, 0.1, 0.8],
    length_short: [0, 0.32, 0.15, 1],
    ball_exit: [8, 30, 2, 1.2],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  back_foot_defence: {
    front_stride: [-0.06, 0.12, 0.05, 1],
    back_foot: [-0.35, -0.06, 0.04, 1],
    contact_height: [0.36, 0.78, 0.06, 1.2],
    hands_height: [0.5, 0.82, 0.06, 0.6],
    back_knee_height: [0.18, 0.45, 0.05, 0.5],
    bat_angle: [0, 30, 8, 1.3],
    bat_speed: [0, 3.6, 0.8, 1.2],
    follow_through: [0, 0.5, 0.15, 1.1],
    follow_height: [0.3, 0.85, 0.1, 0.8],
    rotation: [0, 0.38, 0.1, 0.8],
    length_short: [0.5, 1, 0.15, 1],
    ball_exit: [0, 4.6, 1.2, 1],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  pull: {
    front_stride: [-0.1, 0.2, 0.06, 0.8],
    back_foot: [-0.35, 0.02, 0.05, 0.8],
    contact_height: [0.52, 0.78, 0.06, 1.3],
    hands_height: [0.5, 0.74, 0.06, 0.6],
    back_knee_height: [0.18, 0.45, 0.05, 0.5],
    bat_angle: [55, 90, 10, 1.4],
    bat_speed: [5, 20, 1.2, 1.2],
    follow_through: [0.7, 4, 0.25, 1],
    follow_height: [0.88, 1.5, 0.1, 1],
    rotation: [0.42, 1, 0.1, 1],
    length_short: [0.55, 1, 0.15, 1.2],
    // Side-on view: square-of-wicket exits are mostly out of plane, so 2D exit speed is uninformative.
    ball_exit: [0, 30, 2, 0.2],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  hook: {
    front_stride: [-0.1, 0.2, 0.06, 0.8],
    back_foot: [-0.35, 0.02, 0.05, 0.8],
    contact_height: [0.8, 1.25, 0.06, 1.3],
    hands_height: [0.76, 1.15, 0.06, 0.8],
    back_knee_height: [0.18, 0.45, 0.05, 0.5],
    bat_angle: [50, 90, 10, 1.4],
    bat_speed: [5, 20, 1.2, 1.2],
    follow_through: [0.7, 4, 0.25, 1],
    follow_height: [0.95, 1.6, 0.1, 1],
    rotation: [0.42, 1, 0.1, 1],
    length_short: [0.65, 1, 0.15, 1.2],
    ball_exit: [0, 30, 2, 0.2],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  cut: {
    front_stride: [-0.08, 0.22, 0.06, 0.8],
    back_foot: [-0.3, 0.02, 0.05, 0.8],
    contact_height: [0.4, 0.76, 0.06, 1.2],
    hands_height: [0.45, 0.8, 0.06, 0.6],
    back_knee_height: [0.18, 0.45, 0.05, 0.5],
    bat_angle: [45, 90, 10, 1.3],
    bat_speed: [5, 20, 1.2, 1.2],
    follow_through: [0.6, 4, 0.25, 1],
    follow_height: [0.05, 0.62, 0.1, 1],
    rotation: [0.15, 0.7, 0.1, 0.8],
    length_short: [0.4, 1, 0.15, 1],
    ball_exit: [0, 30, 2, 0.2],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  sweep: {
    front_stride: [0.2, 0.6, 0.06, 0.8],
    back_foot: [-0.12, 0.12, 0.05, 0.5],
    contact_height: [0, 0.3, 0.06, 1.2],
    hands_height: [0.12, 0.42, 0.06, 0.8],
    back_knee_height: [0, 0.12, 0.04, 1.4],
    bat_angle: [55, 90, 10, 1.3],
    bat_speed: [3.5, 20, 1.2, 1],
    follow_through: [0.5, 4, 0.25, 0.8],
    follow_height: [0.2, 1.3, 0.12, 0.5],
    rotation: [0.3, 1, 0.1, 0.8],
    length_short: [0, 0.4, 0.15, 1],
    ball_exit: [4, 30, 2, 0.8],
    contact_found: [0.8, 1, 0.2, 0.6],
  },
  leave: {
    front_stride: [-0.12, 0.5, 0.06, 0.4],
    back_foot: [-0.35, 0.12, 0.05, 0.4],
    hands_height: [0.75, 1.3, 0.06, 1.2],
    bat_speed: [0, 2, 0.6, 1],
    follow_through: [0, 0.3, 0.15, 0.8],
    contact_found: [0, 0.2, 0.2, 1.6],
  },
};

const FAMILIES: Array<{ label: string; members: ShotClass[] }> = [
  { label: "a front-foot vertical-bat shot (defence or drive)", members: ["front_foot_defence", "front_foot_drive"] },
  { label: "a horizontal-bat shot (pull, hook or cut)", members: ["pull", "hook", "cut"] },
  { label: "a back-foot shot", members: ["back_foot_defence", "pull", "hook", "cut"] },
];

export const SHOT_DISPLAY: Record<ShotClass, string> = {
  front_foot_defence: "Front-foot defence",
  front_foot_drive: "Front-foot drive",
  back_foot_defence: "Back-foot defence",
  pull: "Pull shot",
  hook: "Hook shot",
  cut: "Cut shot",
  sweep: "Sweep",
  leave: "Leave",
  unknown: "Unclassified movement",
};

const TIMING_FEATURES: FeatureId[] = ["follow_through"];

export interface Classification {
  probabilities: Record<ShotClass, number>;
  logLikelihood: Record<ShotClass, number>;
  top: ShotClass;
  margin: number;
  /** Fraction of front-foot-defence discriminative weight that was observed. */
  ffdCoverage: number;
  /** Feature ids that most separate the top class from front-foot defence. */
  decisive: Array<{ feature: FeatureId; penalty: number }>;
  family: string | null;
}

/** Top evidence against front-foot defence, covering ball, bat and body where available. */
function pickDecisive(pen: Array<{ feature: FeatureId; penalty: number }>, fs: FeatureSet) {
  const sorted = [...pen].sort((a, b) => b.penalty - a.penalty);
  const modality = (f: FeatureId) => fs.list.find((x) => x.id === `feat_${f}`)?.modality.split("+")[0] ?? "body";
  const out: typeof sorted = [];
  for (const m of ["ball", "bat", "body"]) {
    const hit = sorted.find((p) => modality(p.feature) === m && !out.includes(p));
    if (hit) out.push(hit);
  }
  for (const p of sorted) if (out.length < 5 && !out.includes(p)) out.push(p);
  return out.sort((a, b) => b.penalty - a.penalty);
}

function bandLogLik(x: number, band: Band, coarse: boolean): number {
  const [lo, hi, sigma, w] = band;
  const s = coarse ? sigma * 2 : sigma;
  const d = x < lo ? lo - x : x > hi ? x - hi : 0;
  return -w * Math.min(0.5 * (d / s) ** 2, 4);
}

export function classify(fs: FeatureSet): Classification {
  const ll = {} as Record<ShotClass, number>;
  const ffdPenalties: Array<{ feature: FeatureId; penalty: number }> = [];

  for (const cls of Object.keys(PROTOTYPES) as Array<Exclude<ShotClass, "unknown">>) {
    let sum = 0;
    for (const [fid, band] of Object.entries(PROTOTYPES[cls]) as Array<[FeatureId, Band]>) {
      const x = fs.values[fid];
      if (x === undefined) continue;
      const coarse = fs.coarseTiming && TIMING_FEATURES.includes(fid);
      const l = bandLogLik(x, band, coarse);
      sum += l;
      if (cls === "front_foot_defence" && l < -0.5) ffdPenalties.push({ feature: fid, penalty: -l });
    }
    ll[cls] = sum;
  }
  ll.unknown = th("classifier.unknown_log_likelihood");

  const T = th("classifier.temperature");
  const maxLL = Math.max(...Object.values(ll));
  const expd = SHOT_CLASSES.map((c) => Math.exp((ll[c] - maxLL) / T));
  const Z = expd.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(SHOT_CLASSES.map((c, i) => [c, expd[i]! / Z])) as Record<ShotClass, number>;

  const ranked = [...SHOT_CLASSES].sort((a, b) => probabilities[b] - probabilities[a]);
  const top = ranked[0]!;
  const margin = probabilities[top] - probabilities[ranked[1]!];

  const ffd = PROTOTYPES.front_foot_defence;
  let total = 0;
  let seen = 0;
  for (const [fid, band] of Object.entries(ffd) as Array<[FeatureId, Band]>) {
    total += band[3];
    if (fs.values[fid] !== undefined) seen += band[3];
  }

  let family: string | null = null;
  if (probabilities[top] < th("ffd.named_label.min_probability")) {
    for (const f of FAMILIES) {
      const p = f.members.reduce((s, m) => s + probabilities[m], 0);
      if (p >= 0.8 && !f.members.includes("front_foot_defence")) {
        family = f.label;
        break;
      }
    }
  }

  return {
    probabilities,
    logLikelihood: ll,
    top,
    margin,
    ffdCoverage: total ? seen / total : 0,
    decisive: pickDecisive(ffdPenalties, fs),
    family,
  };
}
