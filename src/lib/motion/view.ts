// Where a played motion is seen from, for every screen that plays one (the home page's batter, the
// motion inspector): the camera the take was filmed from, side-on, from the bowler's end, or turned
// anywhere round the batter. A turn away from the filmed camera is offered only when the take saw
// depth (two or more calibrated cameras, or measured depth): with one camera its depth is an
// estimate, and turning round it would show more than was seen (`canOrbit`).

import type { Camera } from "@/components/model/mannequin-view";
import type { V3 } from "@/engine/rig";
import type { Fitted } from "./fit";
import { SHOT_SCHEMA, TAKE_SCHEMA, type Shot, type Take } from "./types";

export const VIEWS = [
  { id: "source", label: "Filmed camera" },
  { id: "side", label: "Side-on" },
  { id: "end", label: "Bowler's end" },
  { id: "orbit", label: "Turn round" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];

/** Whether a fit may be turned round: only when its depth was seen, not estimated. */
export const canOrbit = (fit: Pick<Fitted, "depth">) => fit.depth !== "estimated";

/** The yaw (degrees) of each fixed view; the filmed camera of a one-camera take is side-on here. */
export const VIEW_YAW: Record<Exclude<ViewId, "orbit">, number> = { source: 0, side: 0, end: 90 };

/**
 * A camera turned `yaw` degrees round the batter from side-on (0: from the off side; 90: from the
 * bowler's end) and `pitch` degrees above. `flip` -1 for a left-hander, seen from their own off side.
 */
export function cameraFor(o: { W: number; H: number; scale: number; groundY: number; yaw: number; pitch: number; centre: readonly [number, number]; flip?: number }): Camera {
  const t = (o.yaw * Math.PI) / 180;
  const p = (o.pitch * Math.PI) / 180;
  return {
    W: o.W, H: o.H, scale: o.scale, groundY: o.groundY, flip: o.flip ?? 1, centre: o.centre,
    right: [Math.cos(t), 0, -Math.sin(t)],
    up: [-Math.sin(p) * Math.sin(t), Math.cos(p), -Math.sin(p) * Math.cos(t)],
    toward: [Math.cos(p) * Math.sin(t), Math.sin(p), Math.cos(p) * Math.cos(t)],
  };
}
/** A point of the pose on the picture (viewBox units), as the 3D drawing places it. */
export function toScreen(c: Camera, p: V3): readonly [number, number] {
  const q: V3 = [p[0] - c.centre[0], p[1], p[2] - c.centre[1]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [c.W / 2 + dot(q, c.right) * c.scale * c.flip, c.groundY - dot(q, c.up) * c.scale];
}

/** Fetches a take and its shot file (public/motion), checking they are what they say. */
export async function loadTake(id: string): Promise<{ take: Take; shot: Shot }> {
  const take = (await (await fetch(`/motion/takes/${encodeURIComponent(id)}.json`)).json()) as Take;
  if (take.schema !== TAKE_SCHEMA) throw new Error("not a take");
  const shot = (await (await fetch(`/motion/shots/${encodeURIComponent(take.shot)}.json`)).json()) as Shot;
  if (shot.schema !== SHOT_SCHEMA) throw new Error("not a shot");
  return { take, shot };
}
