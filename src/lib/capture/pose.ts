"use client";
// On-device pose tracking with MediaPipe Pose Landmarker (self-hosted WASM + model).
// Video never leaves the phone during analysis.

import type { PoseLandmarker as PL } from "@mediapipe/tasks-vision";
import { JOINTS, type ImgPoint } from "@/engine/types";

// MediaPipe's 33-landmark indices for the joints the engine uses.
const MP_INDEX: Record<(typeof JOINTS)[number], number> = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot: 31,
  right_foot: 32,
};

let landmarker: Promise<PL> | null = null;
// MediaPipe VIDEO mode needs strictly increasing timestamps across every call on
// one landmarker instance (quality probe, tracking, live preview alike).
let lastTimestamp = 0;
const nextTimestamp = (requested: number) => (lastTimestamp = Math.max(lastTimestamp + 1, Math.round(requested)));

export function loadPose(): Promise<PL> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
      const make = (delegate: "GPU" | "CPU") =>
        PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/models/pose_landmarker_full.task", delegate },
          runningMode: "VIDEO",
          numPoses: 2,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return await make("GPU");
      } catch {
        return await make("CPU");
      }
    })();
    landmarker.catch(() => (landmarker = null));
  }
  return landmarker;
}

export interface PoseFrame {
  body: ImgPoint[];
  /** Monocular depth estimate (metres) per joint, for the viewer only. */
  depth: number[];
  people: number;
}

/**
 * Detect the batter in one frame. With two people visible, keep the one closest
 * to the previous batter position (identity continuity), else the larger one.
 */
export function detectFrame(pose: PL, source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, timestampMs: number, prevHip: [number, number] | null): PoseFrame & { hip: [number, number] | null } {
  const res = pose.detectForVideo(source, nextTimestamp(timestampMs));
  const people = res.landmarks.filter((l) => avgVis(l) > 0.5).length;
  if (!res.landmarks.length) return { body: JOINTS.map(() => null), depth: JOINTS.map(() => 0), people, hip: prevHip };
  let pick = 0;
  if (res.landmarks.length > 1) {
    const score = (i: number) => {
      const l = res.landmarks[i]!;
      const hip: [number, number] = [(l[23]!.x + l[24]!.x) / 2, (l[23]!.y + l[24]!.y) / 2];
      if (prevHip) return -Math.hypot(hip[0] - prevHip[0], hip[1] - prevHip[1]);
      const ys = l.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    pick = score(0) >= score(1) ? 0 : 1;
  }
  const l = res.landmarks[pick]!;
  const w = res.worldLandmarks[pick];
  const body = JOINTS.map((j) => {
    const p = l[MP_INDEX[j]]!;
    const c = Math.min(p.visibility ?? 1, (p as { presence?: number }).presence ?? 1);
    return [p.x, p.y, c] as const;
  });
  const depth = JOINTS.map((j) => -(w?.[MP_INDEX[j]]?.z ?? 0));
  return { body, depth, people, hip: [(l[23]!.x + l[24]!.x) / 2, (l[23]!.y + l[24]!.y) / 2] };
}

function avgVis(l: Array<{ visibility?: number }>) {
  return l.reduce((s, p) => s + (p.visibility ?? 0), 0) / l.length;
}

/** Seek a video and resolve once the frame is ready to draw. */
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return resolve();
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}
