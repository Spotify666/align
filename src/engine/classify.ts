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
// Bands are set from populations of each shot (src/engine/fixtures/population.ts), with a
// margin: they describe what the shot IS (identity), wide enough for poor technique.
// How well a defence was played is graded separately against the coaching ranges.
// Hand and head features are body evidence, read whether or not the bat is tracked.
export const PROTOTYPES: Record<Exclude<ShotClass, "unknown">, Prototype> = {
  front_foot_defence: {
    front_stride: [0.15, 0.6, 0.05, 1],
    back_foot: [-0.07, 0.1, 0.03, 0.8],
    contact_height: [0, 0.32, 0.05, 1.2],
    hands_height: [0.4, 0.72, 0.05, 0.6],
    back_knee_height: [0.12, 0.36, 0.04, 0.5],
    bat_angle: [0, 30, 8, 1.3],
    bat_speed: [0, 3.6, 0.8, 1.2],
    follow_through: [0, 1.5, 0.3, 0.4],
    follow_height: [0.05, 0.38, 0.05, 1.2],
    rotation: [0, 0.36, 0.08, 0.8],
    length_short: [0, 0.3, 0.15, 1],
    ball_exit: [0, 2.8, 0.8, 1],
    contact_found: [0.8, 1, 0.2, 0.6],
    // A dead bat: hands stop at the ball, barely travel after contact and finish low.
    hand_speed: [0, 1.5, 0.35, 1.2],
    hands_follow: [0, 0.21, 0.04, 1.2],
    hands_finish: [0.3, 0.76, 0.04, 0.8],
    hands_across: [0, 0.2, 0.05, 1],
    head_height: [0.55, 0.92, 0.025, 1],
    // Dead bat: the hands rise at most a little after the bottom of the downswing, as the
    // face is presented (real defences: up to ~0.11 × height); a push lifts through.
    hands_rise: [-0.08, 0.12, 0.025, 1.4],
  },
  // Every front-foot stroke where the bat goes through the ball, from a push to a full drive.
  front_foot_drive: {
    front_stride: [0.2, 0.62, 0.06, 1],
    back_foot: [-0.07, 0.12, 0.04, 0.8],
    contact_height: [0, 0.4, 0.06, 1.2],
    hands_height: [0.3, 0.8, 0.06, 0.4],
    back_knee_height: [0.1, 0.42, 0.05, 0.5],
    bat_angle: [0, 60, 8, 0.8],
    bat_speed: [3, 20, 0.8, 1.3],
    follow_through: [0.3, 4, 0.25, 0.8],
    follow_height: [0.42, 1.6, 0.05, 1.2],
    rotation: [0, 0.65, 0.1, 0.6],
    length_short: [0, 0.32, 0.15, 1],
    ball_exit: [3.2, 30, 1, 1],
    contact_found: [0.8, 1, 0.2, 0.6],
    hand_speed: [0, 14, 0.6, 0.3],
    hands_follow: [0.22, 3, 0.05, 0.6],
    hands_finish: [0.66, 1.6, 0.04, 0.8],
    hands_across: [0, 0.3, 0.06, 0.6],
    head_height: [0.6, 0.92, 0.03, 1],
    hands_rise: [0.14, 1.2, 0.025, 1.2],
  },
  back_foot_defence: {
    front_stride: [-0.1, 0.16, 0.05, 1],
    back_foot: [-0.3, -0.06, 0.04, 1],
    contact_height: [0.3, 0.7, 0.06, 1.2],
    hands_height: [0.45, 0.92, 0.06, 0.6],
    back_knee_height: [0.2, 0.45, 0.05, 0.5],
    bat_angle: [0, 30, 8, 1.3],
    bat_speed: [0, 3.6, 0.8, 1.2],
    follow_through: [0, 1.8, 0.3, 0.4],
    follow_height: [0.3, 0.7, 0.06, 1],
    rotation: [0, 0.35, 0.1, 0.8],
    length_short: [0, 1, 0.15, 0.3],
    ball_exit: [0, 2.8, 0.8, 1],
    contact_found: [0.8, 1, 0.2, 0.6],
    hand_speed: [0, 1.5, 0.35, 1.2],
    hands_follow: [0, 0.2, 0.04, 1.2],
    hands_finish: [0.55, 0.95, 0.04, 1],
    hands_across: [0, 0.2, 0.05, 1],
    head_height: [0.9, 1.05, 0.025, 1],
    hands_rise: [-0.08, 0.4, 0.04, 0.3],
  },
  pull: {
    front_stride: [-0.1, 0.22, 0.05, 0.8],
    back_foot: [-0.35, 0, 0.05, 0.8],
    contact_height: [0.6, 0.85, 0.06, 1.3],
    hands_height: [0.45, 0.8, 0.06, 0.6],
    back_knee_height: [0.2, 0.42, 0.05, 0.5],
    bat_angle: [55, 90, 10, 1.4],
    bat_speed: [1.5, 20, 1, 1],
    follow_through: [0.5, 4, 0.25, 1],
    follow_height: [1.0, 1.5, 0.1, 1],
    rotation: [0.2, 1, 0.1, 0.6],
    length_short: [0.55, 1, 0.15, 1.2],
    // Side-on, square-of-wicket exits are mostly out of plane: 2D exit speed is uninformative.
    ball_exit: [0, 30, 2, 0.2],
    contact_found: [0.8, 1, 0.2, 0.6],
    hand_speed: [0, 14, 0.6, 0.3],
    hands_follow: [0.4, 3, 0.07, 1],
    hands_finish: [0.78, 1.6, 0.05, 1],
    hands_across: [0.35, 2, 0.08, 1],
    head_height: [0.9, 1.06, 0.03, 1],
    hands_rise: [0.15, 0.6, 0.05, 1],
  },
  hook: {
    front_stride: [-0.1, 0.22, 0.05, 0.8],
    back_foot: [-0.35, 0, 0.05, 0.8],
    contact_height: [0.8, 1.25, 0.06, 1.3],
    hands_height: [0.76, 1.15, 0.06, 0.8],
    back_knee_height: [0.18, 0.45, 0.05, 0.5],
    bat_angle: [50, 90, 10, 1.4],
    bat_speed: [1.5, 20, 1, 1],
    follow_through: [0.5, 4, 0.25, 1],
    follow_height: [1.0, 1.6, 0.1, 1],
    rotation: [0.2, 1, 0.1, 0.6],
    length_short: [0.65, 1, 0.15, 1.2],
    ball_exit: [0, 30, 2, 0.2],
    contact_found: [0.8, 1, 0.2, 0.6],
    hand_speed: [0, 14, 0.6, 0.3],
    hands_follow: [0.4, 3, 0.07, 1],
    hands_finish: [0.85, 1.6, 0.05, 1],
    hands_across: [0.35, 2, 0.08, 1],
    head_height: [0.9, 1.08, 0.03, 1],
    hands_rise: [0.15, 0.7, 0.05, 1],
  },
  cut: {
    front_stride: [-0.1, 0.2, 0.05, 0.8],
    back_foot: [-0.3, 0, 0.05, 0.8],
    contact_height: [0.4, 0.68, 0.05, 1.2],
    hands_height: [0.45, 0.92, 0.06, 0.6],
    back_knee_height: [0.2, 0.4, 0.05, 0.5],
    bat_angle: [45, 90, 10, 1.3],
    bat_speed: [3, 20, 1, 1],
    follow_through: [0.6, 4, 0.25, 1],
    follow_height: [0.8, 1.4, 0.1, 1],
    rotation: [0, 1, 0.1, 0.2],
    length_short: [0.05, 0.62, 0.12, 1],
    ball_exit: [0, 30, 2, 0.2],
    contact_found: [0.8, 1, 0.2, 0.6],
    hand_speed: [0, 14, 0.6, 0.3],
    hands_follow: [0.4, 3, 0.07, 1.2],
    hands_finish: [0.74, 1.1, 0.04, 1],
    hands_across: [0.4, 2, 0.08, 1],
    head_height: [0.88, 1.02, 0.03, 1],
    hands_rise: [0, 0.5, 0.05, 0.3],
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
    hand_speed: [1.5, 14, 0.6, 0.6],
    hands_follow: [0.2, 3, 0.08, 0.6],
    hands_finish: [0.1, 0.6, 0.08, 0.8],
    hands_across: [0.3, 2, 0.08, 0.8],
    head_height: [0.25, 0.62, 0.05, 1],
    hands_rise: [0, 0.6, 0.05, 0.3],
  },
  leave: {
    front_stride: [-0.12, 0.5, 0.06, 0.4],
    back_foot: [-0.35, 0.12, 0.05, 0.4],
    hands_height: [0.75, 1.3, 0.06, 1.2],
    bat_speed: [0, 2, 0.6, 1],
    follow_through: [0, 0.3, 0.15, 0.8],
    contact_found: [0, 0.2, 0.2, 1.6],
    hand_speed: [0, 1.2, 0.35, 0.8],
    hands_follow: [0, 0.3, 0.1, 0.8],
    hands_finish: [0.75, 1.4, 0.08, 1.2],
    hands_across: [0, 0.3, 0.08, 0.6],
    head_height: [0.85, 1.05, 0.05, 0.6],
    hands_rise: [-0.05, 0.5, 0.05, 0.3],
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

const TIMING_FEATURES: FeatureId[] = ["follow_through", "hand_speed"];

/** Hand and head signals: not part of the full-evidence coverage (which predates them), always part of body coverage. */
export const HAND_FEATURES: FeatureId[] = ["hand_speed", "hands_follow", "hands_finish", "hands_across", "head_height", "hands_rise"];
/**
 * Filmed along the pitch, front-foot travel comes from the monocular 3D estimate, which
 * understates depth. That bias can only make a defence look less like a front-foot shot
 * (toward "uncertain", never toward a false acceptance), so it counts, with a wider
 * tolerance.
 */
const FRONTAL_ESTIMATED: FeatureId[] = ["front_stride"];
/**
 * Trunk rotation filmed along the pitch rests on the estimated depth of the shoulders,
 * whose error on real footage has no known direction (it reads far beyond anything a
 * sound body produces), so it never decides which shot was played there. Still reported.
 */
const FRONTAL_UNRELIABLE: FeatureId[] = ["rotation"];
const BAT_FEATURES: FeatureId[] = ["bat_angle", "bat_speed", "follow_through", "follow_height"];
const BALL_FEATURES: FeatureId[] = ["length_short", "ball_exit", "contact_found", "contact_height"];
/** Unobservable by geometry when filmed along the pitch (left out, never estimated). */
const FRONTAL_UNSEEN: FeatureId[] = ["back_foot", "bat_speed", "ball_exit", "hand_speed", "hands_follow"];

export interface Classification {
  probabilities: Record<ShotClass, number>;
  logLikelihood: Record<ShotClass, number>;
  top: ShotClass;
  margin: number;
  /** Fraction of front-foot-defence discriminative weight that was observed. */
  ffdCoverage: number;
  /**
   * Without the ball (and possibly the bat): the fraction of the body, hand and bat
   * weight that this camera position can show that was actually observed.
   */
  bodyCoverage: number;
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

function bandLogLik(x: number, band: Band, coarse: boolean, widen = 1): number {
  const [lo, hi, sigma, w] = band;
  const s = (coarse ? sigma * 2 : sigma) * widen;
  const d = x < lo ? lo - x : x > hi ? x - hi : 0;
  return -w * Math.min(0.5 * (d / s) ** 2, 4);
}

export function classify(fs: FeatureSet, opts: { frontal?: boolean; batSeen?: boolean; cameraMoving?: boolean } = {}): Classification {
  const ll = {} as Record<ShotClass, number>;
  const ffdPenalties: Array<{ feature: FeatureId; penalty: number }> = [];

  for (const cls of Object.keys(PROTOTYPES) as Array<Exclude<ShotClass, "unknown">>) {
    let sum = 0;
    for (const [fid, band] of Object.entries(PROTOTYPES[cls]) as Array<[FeatureId, Band]>) {
      const x = fs.values[fid];
      if (x === undefined || (opts.frontal && FRONTAL_UNRELIABLE.includes(fid))) continue;
      const coarse = fs.coarseTiming && TIMING_FEATURES.includes(fid);
      const l = bandLogLik(x, band, coarse, opts.frontal && FRONTAL_ESTIMATED.includes(fid) ? 1.6 : 1);
      sum += l;
      if (cls === "front_foot_defence" && l < -0.5) ffdPenalties.push({ feature: fid, penalty: -l });
    }
    ll[cls] = sum;
  }
  // A leave is defined by not playing at the ball: without bat–ball evidence it isn't a
  // candidate (its body cues alone, hands held high, are shared with other strokes).
  if (fs.values.contact_found === undefined) ll.leave = -Infinity;
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
  let bodyTotal = 0;
  let bodySeen = 0;
  const batSeen = opts.batSeen ?? BAT_FEATURES.some((f) => fs.values[f] !== undefined);
  for (const [fid, band] of Object.entries(ffd) as Array<[FeatureId, Band]>) {
    // Coverage counts only what this camera position can measure: geometry is not a
    // tracking failure, so one coverage bar holds for every view.
    if (opts.frontal && (FRONTAL_UNSEEN.includes(fid) || FRONTAL_UNRELIABLE.includes(fid))) continue;
    if (!HAND_FEATURES.includes(fid)) {
      total += band[3];
      if (fs.values[fid] !== undefined) seen += band[3];
    }
    const expected =
      !BALL_FEATURES.includes(fid) &&
      !(!opts.frontal && fid === "hands_across") &&
      !(opts.cameraMoving && fid === "back_foot") &&
      (batSeen || !BAT_FEATURES.includes(fid));
    if (expected) {
      bodyTotal += band[3];
      if (fs.values[fid] !== undefined) bodySeen += band[3];
    }
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
    bodyCoverage: bodyTotal ? bodySeen / bodyTotal : 0,
    decisive: pickDecisive(ffdPenalties, fs),
    family,
  };
}
