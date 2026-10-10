"use client";
// Object URLs for videos picked in this browser session. Raw video is never stored;
// after a reload the report falls back to the saved still frames.
import type { TrackingResult } from "@/lib/capture/build-observation";
import type { TargetShot } from "@/engine/types";

export const sessionMedia = new Map<string, { url: string; mediaTimes: number[] | null }>();
export const isSessionUrl = (url: string) => [...sessionMedia.values()].some((m) => m.url === url);

/** What's needed to add bat and ball marks to a report later in the same session. */
export interface SessionCapture {
  tracking: TrackingResult;
  view: "side_on" | "front_on" | "behind";
  bowlerSide: "left" | "right";
  title: string;
  createdAt: string;
  recordedAt: string;
  target?: TargetShot;
}
export const sessionCapture = new Map<string, SessionCapture>();
