"use client";
// Reading many frames from a phone video quickly. Seeking re-decodes from the previous
// keyframe every time, and phone and web clips put keyframes seconds apart, so a seek per
// frame decodes the same stretch over and over. Playing through once decodes each frame
// once: the video is paused on each wanted frame while it is processed, then resumed.

import { seek } from "./pose";

type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;

export interface PlayFramesOptions {
  /** Duration of one frame (s): a target is the frame whose display interval holds it. */
  frameDur: number;
  /** Playback rate between targets (frames in between are skipped when faster than 1). */
  rate?: number;
  /** Accept any frame within this many seconds of a target (sparse probes), instead of the exact frame. */
  tolerance?: number;
  /** Stop early (abandoned run). */
  stop?: () => boolean;
  /** Called on every displayed frame, wanted or not (cheap work such as motion). */
  onAnyFrame?: (mediaTime: number) => void;
}

export const canPlayFrames = (video: HTMLVideoElement) => "requestVideoFrameCallback" in video;

/**
 * Visit `targets` (ascending media times) in order by playing the video once. `onFrame`
 * runs with the video showing the target frame; returning false stops early. Resolves to
 * the indices of targets that playback skipped (fill them by seeking), or null when this
 * browser can't report displayed frames.
 */
export async function playFrames(
  video: HTMLVideoElement,
  targets: number[],
  onFrame: (index: number, mediaTime: number) => boolean | void,
  opts: PlayFramesOptions,
): Promise<number[] | null> {
  const rvfc = (video as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(video);
  if (!rvfc || !targets.length) return rvfc ? [] : null;
  const { frameDur, rate = 1, tolerance, stop, onAnyFrame } = opts;
  const eps = frameDur * 0.1;
  const missed: number[] = [];
  let k = 0;

  // Start just before the first target, so playback presents it.
  await seek(video, Math.max(0, targets[0]! - Math.max(frameDur * 1.5, tolerance ?? 0)));
  video.muted = true;

  await new Promise<void>((resolve) => {
    let finished = false;
    let last = performance.now();
    const watchdog = window.setInterval(() => {
      // Playback refused or stalled (power saving, background tab): the rest is seeked.
      if (performance.now() - last > 3000) end();
    }, 400);
    const end = () => {
      if (finished) return;
      finished = true;
      window.clearInterval(watchdog);
      video.removeEventListener("ended", end);
      video.pause();
      while (k < targets.length) missed.push(k++);
      resolve();
    };
    const resume = () => {
      rvfc(cb);
      video.play().catch(() => end());
    };
    const cb = (_: number, meta: { mediaTime: number }) => {
      if (finished) return;
      last = performance.now();
      if (stop?.()) return end();
      const mt = meta.mediaTime;
      onAnyFrame?.(mt);
      const hit = (t: number) => (tolerance !== undefined ? Math.abs(mt - t) <= tolerance : mt <= t + eps && mt > t - frameDur + eps);
      const passed = (t: number) => (tolerance !== undefined ? mt > t + tolerance : mt > t + eps);
      while (k < targets.length && passed(targets[k]!) && !hit(targets[k]!)) missed.push(k++);
      if (k >= targets.length) return end();
      if (!hit(targets[k]!)) return void rvfc(cb);
      video.pause();
      let go = onFrame(k, mt) !== false;
      k++;
      // Several sparse targets can share one displayed frame.
      while (go && tolerance !== undefined && k < targets.length && hit(targets[k]!)) {
        go = onFrame(k, mt) !== false;
        k++;
      }
      if (!go || k >= targets.length) return end();
      last = performance.now();
      resume();
    };
    video.addEventListener("ended", end);
    video.playbackRate = rate;
    resume();
  });
  video.playbackRate = 1;
  return missed;
}
