// Lining up the camera before recording: what the "Line up the camera" screen tells the person
// from the live picture (is the whole batter in it, is the batter a usable size, is there one
// person) and from the phone's sensors (is it level, is it turned the right way).
//
// Guidance only. Nothing here decides whether a recording is analysed: that stays with the
// capture gate, on the recording itself. The sizes below are the capture guide's own words
// ("the whole batter, the stumps and where the ball bounces"; "about half the height"), not
// engine thresholds.

import { J, type ImgPoint } from "@/engine/types";

export type LineUpView = "side" | "end";
export type Check = "pass" | "warn" | "unknown";

/** Where the guides sit in the picture (fractions of its width and height). */
export const GUIDES: Record<LineUpView, { box: readonly [number, number, number, number]; ground: number; landscape: boolean; size: readonly [number, number] }> = {
  // Side-on: landscape, the batter small enough to leave the stumps and the bounce in the picture.
  side: { box: [0.3, 0.22, 0.7, 0.86], ground: 0.86, landscape: true, size: [0.25, 0.7] },
  // Down the pitch: upright, the batter about half the height.
  end: { box: [0.28, 0.24, 0.72, 0.8], ground: 0.8, landscape: false, size: [0.35, 0.75] },
};

/** Within this many degrees of level the picture's horizon reads as level. */
export const LEVEL_WITHIN = 3;
/** Beyond this lean (forward or back) the phone is lying down rather than standing. */
const LYING = 55;

export interface Tilt {
  /** Degrees the picture's horizon is off level (0 = level), whichever way the phone is turned. */
  roll: number;
  /** Degrees the phone leans forward or back from upright (0 = upright, 90 = flat). */
  lean: number;
}

/**
 * The phone's tilt from gravity as the motion sensor reports it (device axes: x across the
 * screen, y up the screen, z out of it). Works in portrait and landscape, and on phones that
 * report gravity with either sign. Null when there is no reading or the phone is lying flat.
 */
export function tiltFromGravity(x: number | null | undefined, y: number | null | undefined, z: number | null | undefined): Tilt | null {
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  const inPlane = Math.hypot(x, y);
  if (!(inPlane + Math.abs(z) > 1)) return null; // no gravity in the reading: not a real sensor
  const lean = (Math.atan2(Math.abs(z), inPlane) * 180) / Math.PI;
  if (lean > LYING) return null;
  const angle = (Math.atan2(x, y) * 180) / Math.PI;
  const roll = angle - 90 * Math.round(angle / 90);
  return { roll, lean };
}

export interface Framing {
  /** Head and both feet inside the picture. */
  whole: Check;
  /** The batter's size in the picture. */
  size: Check;
  /** Share of the picture's height the batter fills, when it could be measured. */
  height: number | null;
  /** What to do about the size, when it isn't right. */
  sizeHint: "closer" | "back" | null;
  /** Exactly one person in the picture. */
  one: Check;
  /** The phone turned the way this camera position wants. */
  turned: Check;
}

const seen = (p: ImgPoint | undefined, min = 0.5): p is readonly [number, number, number] => !!p && p[2] >= min;

/** What the live picture shows, for one pose reading (normalised picture coordinates). */
export function framing(body: ImgPoint[], people: number, view: LineUpView, picture: { w: number; h: number }): Framing {
  const g = GUIDES[view];
  const turned: Check = !picture.w || !picture.h ? "unknown" : picture.w >= picture.h === g.landscape ? "pass" : "warn";
  const one: Check = people === 1 ? "pass" : people > 1 ? "warn" : "unknown";
  const head = body[J.nose];
  const feet = [J.left_ankle, J.right_ankle, J.left_heel, J.right_heel, J.left_foot, J.right_foot].map((k) => body[k]).filter((p) => seen(p));
  const count = body.filter((p) => seen(p)).length;
  if (count < 8) return { whole: people === 0 ? "unknown" : "warn", size: "unknown", height: null, sizeHint: null, one, turned };
  const inside = (p: readonly [number, number, number]) => p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.02 && p[1] < 0.98;
  const whole: Check = seen(head) && inside(head) && feet.length >= 2 && feet.every(inside) && count >= 13 ? "pass" : "warn";
  if (!seen(head) || !feet.length) return { whole, size: "unknown", height: null, sizeHint: null, one, turned };
  // Nose to the lowest foot is about 93% of a standing height; a batter in their stance is lower still.
  const height = (Math.max(...feet.map((p) => p[1])) - head[1]) / 0.93;
  const sizeHint = height < g.size[0] ? "closer" : height > g.size[1] ? "back" : null;
  return { whole, size: sizeHint ? "warn" : "pass", height, sizeHint, one, turned };
}

/** Whether everything that could be checked is right (nothing unknown counts against it). */
export function ready(f: Framing | null, tilt: Tilt | null): boolean {
  if (!f) return false;
  const level = tilt ? Math.abs(tilt.roll) <= LEVEL_WITHIN : true;
  return f.whole === "pass" && f.size === "pass" && f.one === "pass" && f.turned === "pass" && level;
}
