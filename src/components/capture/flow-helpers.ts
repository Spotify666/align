// The capture flow's helpers: the plan of which frames to track, how results are ranked and
// worded, and the small jobs done on the video element (finding the picture inside black bars,
// checking who the batter is, measuring the playback rate, taking stills). Nothing here holds
// state; the flow itself is `capture-flow.tsx`.

import { TARGET_NAME } from "@/engine/analyze";
import { J, type AnalysisPayload, type CaptureObservation, type TargetShot } from "@/engine/types";
import type { VideoTrackInfo } from "@/lib/capture/mp4";
import { batterLikeness, detectStill, loadStillPose, roiAround, seek, type Box, type Roi } from "@/lib/capture/pose";
import { boxAt, type BatterCandidate, type ScanResult } from "@/lib/capture/scan";
import { findPictureArea } from "@/lib/capture/bars";
import type { Marks, TrackingResult } from "@/lib/capture/build-observation";

export interface Meta {
  width: number;
  height: number;
  containerFps: number | null;
  fpsSource: CaptureObservation["media"]["fpsSource"];
  durationSec: number;
}
export interface Attempt {
  obs: CaptureObservation;
  payload: AnalysisPayload;
  tr: TrackingResult;
  marks: Marks;
  times: number[];
}

/** Clearest result first: a confirmed defence, then a confirmed different shot, then the most like the shot asked for. */
export function rank(p: AnalysisPayload): number {
  const base = { valid: 3, invalid_for_requested_analysis: 2, uncertain_shot: 1, capture_failed: 0 }[p.analysis_status] ?? 0;
  return base + (p.shot_probabilities?.[p.requested_shot ?? "front_foot_defence"] ?? 0) * 0.5;
}

export const SHOT_TITLE: Record<TargetShot, string> = { front_foot_defence: "Front-foot defence", back_foot_defence: "Back-foot defence" };

export interface Win {
  start: number;
  end: number;
  peak: number;
}

const MAX_FRAMES = 300;
export const WINDOW_SEC = 3.4;

/**
 * The frames tracked for a shot window, and the ones (every 0.08 s up to the stroke) on
 * which the batter is linked back from the stroke through the person detector.
 */
export function trackPlan(w: Win, m: Meta, slow: number) {
  const cFps = m.containerFps ?? 30;
  const rFps = cFps * slow;
  const windowLen = Math.min(m.durationSec - w.start, w.end - w.start);
  const containerFrames = Math.max(2, Math.floor(windowLen * cFps));
  const stride = Math.max(1, Math.ceil(containerFrames / MAX_FRAMES));
  const count = Math.floor(containerFrames / stride);
  const times = Array.from({ length: count }, (_, i) => w.start + (i * stride + 0.5) / cFps);
  // The stroke: the frame the batter was identified on.
  const key = times.reduce((best, t, i) => (Math.abs(t - w.peak) < Math.abs(times[best]! - w.peak) ? i : best), 0);
  const every = Math.max(1, Math.round((0.08 * rFps) / stride));
  const idx = times.slice(0, key + 1).map((_, i) => i).filter((i) => i % every === 0 || i === key);
  return { cFps, rFps, windowLen, stride, count, times, key, every, idx, pre: idx.map((i) => times[i]!) };
}
export const GATE_SAMPLES = 12;
export const MAX_AUTO_TRIES = 3;
export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|3g2|avi|wmv|flv|mts|m2ts|ts)$/i;
// How a result reads in the visit log.
const RESULT_WORDS: Record<AnalysisPayload["analysis_status"], string> = {
  valid: "graded",
  invalid_for_requested_analysis: "not a front-foot defence",
  uncertain_shot: "shot unclear",
  capture_failed: "capture not usable",
};
export const resultWords = (p: AnalysisPayload) => {
  const shot = p.requested_shot ?? "front_foot_defence";
  const words = p.analysis_status === "invalid_for_requested_analysis" ? `not a ${TARGET_NAME[shot]}` : RESULT_WORDS[p.analysis_status];
  return shot === "front_foot_defence" ? words : `${SHOT_TITLE[shot].toLowerCase()}: ${words}`;
};
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The picture area inside black bars, from four small frames spread over the clip. */
export async function pictureAreaOf(v: HTMLVideoElement): Promise<Roi | null> {
  const a = v.videoWidth / Math.max(1, v.videoHeight);
  const w = 160;
  const h = Math.max(16, Math.round(w / a));
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const frames: Float32Array[] = [];
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    await seek(v, v.duration * f);
    ctx.drawImage(v, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let k = 0; k < g.length; k++) g[k] = (0.299 * px[k * 4]! + 0.587 * px[k * 4 + 1]! + 0.114 * px[k * 4 + 2]!) / 255;
    frames.push(g);
  }
  return findPictureArea(frames, w, h);
}


/** The best shot not tried yet: verified first, then by score. -1 when none is left. */
export function bestWindow(res: ScanResult, tried: number[]): number {
  let best = -1;
  res.windows.forEach((w, i) => {
    if (tried.includes(i)) return;
    const b = res.windows[best];
    if (!b || Number(!!w.verified) > Number(!!b.verified) || (!!w.verified === !!b.verified && w.score > b.score)) best = i;
  });
  return best;
}

export function shotNote(res: ScanResult, i: number): string {
  const w = res.windows[i];
  if (!w) return "Using the whole clip";
  const n = res.windows.length;
  return n > 1 ? `Shot at ${fmtTime(w.peak)} — best of ${n} found` : `Shot at ${fmtTime(w.peak)}`;
}

/** Crop around the batter at media time `t`: where the scan saw them then, else their extent. */
export function cropFor(c: BatterCandidate | undefined, t: number, m: Meta): Roi {
  if (!c) return { x: 0, y: 0, w: 1, h: 1 };
  const b: Box | Roi = boxAt(c, t) ?? c.extent;
  return roiAround(b, m.width / m.height, 0.32);
}

/**
 * Rank the people who could be the batter. Pose must find a real, whole person (stumps,
 * nets or a hand at the frame edge drop out). Then the one who looks like batting wins:
 * both hands together on a handle, not crouched like the keeper, a bat seen at the hands,
 * in view through the shot.
 */
export async function verifyCandidates(v: HTMLVideoElement, cs: BatterCandidate[], win: Win, at: number, aspect: number): Promise<BatterCandidate[]> {
  if (!cs.length) return cs;
  const stillPose = await loadStillPose();
  const KEY = [J.nose, J.left_shoulder, J.right_shoulder, J.left_hip, J.right_hip, J.left_knee, J.right_knee, J.left_ankle, J.right_ankle];
  const top = cs.slice(0, 6);
  const quality = top.map(() => 0);
  const likeness = top.map(() => 0);
  for (const t of [at, win.start + (win.end - win.start) * 0.12, win.start + (win.end - win.start) * 0.5]) {
    await seek(v, t);
    top.forEach((c, i) => {
      const b = boxAt(c, t);
      if (!b) return;
      const p = detectStill(stillPose, v, roiAround(b, aspect, 0.3));
      const vis = KEY.reduce((s, k) => s + (p.body[k]?.[2] ?? 0), 0) / KEY.length;
      const hip = p.hip;
      const inside = !!hip && hip[0] >= b.x - b.w * 0.15 && hip[0] <= b.x + b.w * 1.15 && hip[1] >= b.y && hip[1] <= b.y + b.h;
      quality[i] = Math.max(quality[i]!, inside ? vis : vis * 0.3);
      if (inside && vis >= 0.5) likeness[i] = Math.max(likeness[i]!, batterLikeness(p.body, aspect));
    });
  }
  const score = (i: number) => {
    const c = top[i]!;
    return quality[i]! * Math.sqrt(c.box.h) * (0.5 + c.persistence) * (0.25 + likeness[i]!) * (1 + 1.5 * c.bat);
  };
  const ranked = top
    .map((c, i) => ({ c, i }))
    .filter((x) => quality[x.i]! >= 0.55)
    .sort((a, b) => score(b.i) - score(a.i))
    .map((x) => x.c);
  return ranked.length ? ranked : cs;
}

/** Resolve when the first frame is decodable; reject on a decode error or a stall. */
export function loaded(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      v.removeEventListener("loadeddata", ok);
      v.removeEventListener("error", bad);
    };
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error("decode"));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, 20000);
    v.addEventListener("loadeddata", ok);
    v.addEventListener("error", bad);
    v.load();
  });
}

/** A specific, fixable explanation for a clip this browser can't decode. */
export function decodeMessage(f: File, track: VideoTrackInfo | null): { title: string; body: string } {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const codec = track?.codec ?? "";
  if (/^(hvc1|hev1|dvh1|dvhe)$/.test(codec))
    return {
      title: "This browser can't play HEVC video",
      body:
        "The clip is HEVC (H.265), the default on many iPhones and newer Android phones.\n\n" +
        "Any of these fixes it:\n• Open Aline in Safari (iPhone, iPad, Mac) or recent Chrome / Edge.\n" +
        "• iPhone: Settings → Camera → Formats → Most Compatible, then record again.\n" +
        "• Send the clip to yourself on WhatsApp or save it from Google Photos — that converts it to H.264.",
    };
  if (codec === "av01") return { title: "This device can't play AV1 video", body: "Re-export the clip as MP4 (H.264), or open Aline in a recent Chrome or Edge." };
  if (["avi", "wmv", "flv", "mts", "m2ts", "ts"].includes(ext))
    return { title: `.${ext.toUpperCase()} files can't be played in a browser`, body: "Convert the clip to MP4 (H.264) — most phones and free converters can — then add it again." };
  if (ext === "mkv") return { title: "This MKV file can't be played here", body: "Re-save it as MP4 (H.264) and add it again. MP4 and MOV work on every phone and computer." };
  return {
    title: "This video can't be opened on this device",
    body: `The format${codec ? ` (${codec})` : f.type ? ` (${f.type})` : ""} isn't supported by this browser, or the file is incomplete.\n\nMP4 (H.264) and MOV work everywhere. Try the original clip from your camera roll, or send it to yourself on WhatsApp to convert it.`,
  };
}

export function snapshot(v: HTMLVideoElement): string {
  const c = document.createElement("canvas");
  const s = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
  c.width = Math.round(v.videoWidth * s);
  c.height = Math.round(v.videoHeight * s);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

export async function estimatePlaybackFps(v: HTMLVideoElement): Promise<number | null> {
  type RVFC = (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  const rvfc = (v as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(v);
  if (!rvfc) return null;
  const samples: number[] = [];
  return new Promise((resolve) => {
    let last: { t: number; n: number } | null = null;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      v.pause();
      v.currentTime = 0;
      samples.sort((a, b) => a - b);
      resolve(samples.length > 5 ? Math.round(1 / samples[Math.floor(samples.length / 2)]!) : null);
    };
    const cb = (_: number, m: { mediaTime: number; presentedFrames: number }) => {
      if (finished) return;
      if (last && m.presentedFrames - last.n === 1 && m.mediaTime > last.t) samples.push(m.mediaTime - last.t);
      last = { t: m.mediaTime, n: m.presentedFrames };
      if (samples.length >= 20) return done();
      rvfc(cb);
    };
    rvfc(cb);
    v.playbackRate = 0.25;
    v.play().catch(() => done());
    setTimeout(done, 4000);
  });
}

export async function grabKeyframes(video: HTMLVideoElement, mediaTimes: number[], frames: number[]): Promise<Record<number, Blob>> {
  const out: Record<number, Blob> = {};
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = Math.round((480 * video.videoHeight) / Math.max(1, video.videoWidth));
  const ctx = canvas.getContext("2d")!;
  for (const f of frames.slice(0, 8)) {
    const t = mediaTimes[f];
    if (t === undefined) continue;
    await seek(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.72));
    if (blob) out[f] = blob;
  }
  return out;
}
