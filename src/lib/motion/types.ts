// The data a batting shot's motion is made from, for any shot (2026-11-18: "a new shot should
// supply source motion, an optional phase map and its contact or grip events… with zero edits to
// the shared solver"). Two files:
//
// - a TAKE (`aline.motion-take/1`): one recording of one ball. Real frame times, the joints as seen
//   (each with its confidence) from one camera with a depth estimate, or from two or more calibrated
//   cameras, the bat if it was tracked, where it came from and who may use it, and the times of its
//   events (contact, a grip change…). Generated takes also carry the truth they were made from.
// - a SHOT (`aline.motion-shot/1`): what is the same for every take of that shot: its events in
//   order, its phases between them with their names and cues, how the hands hold the bat from one
//   event to the next, and which events are impacts (where smoothing must not blur across).
//
// Coordinate systems, said once:
// - World (the batter's): forward toward the bowler, up against gravity (gravity is minus up),
//   across toward the batter's off side; the ground is up = 0; origin on the ground at the stumps
//   or the hips (any fixed point). A right- and a left-hander both have their off side "across", so
//   a left-hander is never a mirrored right-hander in the pictures; their anatomical left and right
//   are mapped to roles (front, back) by their batting side (`ROLE_OF`).
// - Units: body heights (1 = the batter's standing height); a take in metres gives its stature.
// - A camera: a calibrated pinhole (3 × 4 matrix, world metres to image pixels) when known.
// - Body segments: each bone from its parent joint to its child (hips → knee → ankle; shoulder →
//   elbow → wrist → the hand's grip); the bat: along (handle to toe), its face, across the blade.
//
// Read by no part of the analysis.

import type { SemanticJoint } from "@/engine/scene";
import type { GripState } from "@/engine/rig";

export const TAKE_SCHEMA = "aline.motion-take/1" as const;
export const SHOT_SCHEMA = "aline.motion-shot/1" as const;

/** A point with its confidence (0 to 1); null where it wasn't seen. */
export type P3c = readonly [number, number, number, number] | null;
export type P2c = readonly [number, number, number] | null;

export interface Camera {
  id: string;
  label: string;
  /** 3 × 4, row by row: world (in the take's units) to image pixels. */
  P: readonly number[];
  width: number;
  height: number;
  /** "calibrated": known (a fixture, a checkerboard); "estimated": guessed. */
  calibration: "calibrated" | "estimated";
}

export interface View {
  camera: Camera;
  /** Per joint, per frame, image pixels and confidence. */
  joints: Partial<Record<SemanticJoint, P2c[]>>;
  bat?: { handle: P2c[]; toe: P2c[] };
}

export interface Take {
  schema: typeof TAKE_SCHEMA;
  id: string;
  label: string;
  /** The shot's id (its `Shot` file). */
  shot: string;
  battingSide: "right" | "left";
  provenance: {
    source: "traced" | "generated";
    /** What the take is of, and who may use it. */
    note: string;
    clip?: string;
  };
  /** "body_height", or "metre" with the batter's stature. */
  units: "body_height" | "metre";
  statureM: number;
  /** Real frame times, seconds. */
  times: number[];
  /**
   * What the tracked "wrist" marks. "joint" (a pose tracker's wrist: the default) or "grip" (where
   * the hand holds the handle, as the engine's generator places it: it draws no hands). A "grip" mark
   * is moved a hand's length back along the forearm on the way in, and so is its truth.
   */
  wristMark?: "joint" | "grip";
  /** Joints by role in 3D, when the take has them (one camera with a depth estimate, or motion capture). */
  points?: { joints: Partial<Record<SemanticJoint, P3c[]>>; depth: "measured" | "estimated" };
  /** Two or more calibrated views of the same ball: the fit triangulates them. */
  views?: View[];
  /** The bat's direction (handle to toe) per frame, when only that was tracked; `depth` says whether its across part was seen. */
  batDir?: { dir: P3c[]; depth: "measured" | "unobserved" };
  /** Event id to seconds. */
  events: Record<string, number>;
  /** Generated takes: where everything really was (same units and roles). */
  truth?: { joints: Record<SemanticJoint, number[][]>; bat?: { handle: number[][]; toe: number[][] } };
}

export interface ShotPhase {
  id: string;
  label: string;
  /** A short coaching cue: what the body does in this phase. */
  cue: string;
  from: string;
  to: string;
}

export interface Shot {
  schema: typeof SHOT_SCHEMA;
  shot: string;
  label: string;
  /** Events in the order they happen (ids). "start" and "end" are the take's own ends. */
  events: Array<{ id: string; label: string }>;
  phases: ShotPhase[];
  /** How the hands hold the bat from each event on (the first entry from "start"). */
  grip: Array<{ from: string; state: GripState }>;
  /** Events that are impacts: bat on ball, a foot landing hard. Smoothing never reaches across one. */
  impacts: string[];
  /** Intended contacts the collision check allows between these events (e.g. "bat_pad"). */
  contacts?: Array<{ kind: "bat_pad"; from: string; to: string }>;
}

/** Anatomical side to role, by batting side: a right-hander's front is their left. */
export const ROLE_OF = {
  right: { left: "front", right: "back" },
  left: { left: "back", right: "front" },
} as const;
