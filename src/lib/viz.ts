// Shared geometry for the 2D evidence viewer and the 3D replay.
import { buildScene, bodyCentre, type Scene } from "@/engine/scene";
import { J, JOINTS, type CaptureObservation, type Joint } from "@/engine/types";

export type V3 = [number, number, number];

export const BONES: Array<[Joint, Joint]> = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["left_ankle", "left_heel"],
  ["left_heel", "left_foot"],
  ["left_ankle", "left_foot"],
  ["right_ankle", "right_heel"],
  ["right_heel", "right_foot"],
  ["right_ankle", "right_foot"],
];

export interface WorldFrames {
  scene: Scene;
  /** joints[frame][jointIndex] in metres: x = forward, y = up, z = lateral (off side). */
  joints: (V3 | null)[][];
  conf: number[][];
  depth: "measured" | "estimated" | "none";
  bat: Array<[V3, V3] | null>;
  ball: (V3 | null)[];
  centre: (V3 | null)[];
  scaleNote: string | null;
}

export function worldFrames(obs: CaptureObservation): WorldFrames {
  const scene = buildScene(obs);
  const k = scene.unit === "stature" ? 1.75 : 1; // display scale for unscaled captures
  const depth: WorldFrames["depth"] = obs.body3d ? "measured" : obs.vizDepth ? "estimated" : "none";
  const lateral = (frame: number, j: number) => {
    if (obs.body3d) return obs.body3d[frame]?.[j]?.[2] ?? 0;
    if (obs.vizDepth) return obs.vizDepth[frame]?.[j] ?? 0;
    return 0;
  };
  const joints: (V3 | null)[][] = [];
  const conf: number[][] = [];
  const bat: WorldFrames["bat"] = [];
  const ball: WorldFrames["ball"] = [];
  const centre: WorldFrames["centre"] = [];
  for (let i = 0; i < scene.n; i++) {
    joints.push(
      JOINTS.map((jn, j) => {
        const p = scene.getRaw(i, jn);
        return p ? [p.f * k, p.u * k, lateral(i, j)] : null;
      }),
    );
    conf.push(JOINTS.map((jn) => obs.body[i]?.[J[jn]]?.[2] ?? 0));
    const h = scene.batHandle[i];
    const t = scene.batToe[i];
    const handLat = (lateral(i, J.left_wrist) + lateral(i, J.right_wrist)) / 2;
    bat.push(h && t ? [[h.f * k, h.u * k, handLat], [t.f * k, t.u * k, handLat]] : null);
    const b = scene.ball[i];
    ball.push(b ? [b.f * k, b.u * k, 0] : null);
    const c = bodyCentre(scene, i);
    centre.push(c ? [c.f * k, c.u * k, (lateral(i, J.left_hip) + lateral(i, J.right_hip)) / 2] : null);
  }
  return {
    scene,
    joints,
    conf,
    depth,
    bat,
    ball,
    centre,
    scaleNote: scene.unit === "stature" ? "No pitch scale: shown at an assumed 1.75 m height." : null,
  };
}

export const EVENT_LABEL: Record<string, string> = {
  setup: "Setup",
  trigger: "Trigger",
  bounce: "Bounce",
  front_foot_plant: "Plant",
  back_foot_commit: "Back foot",
  backswing_top: "Top",
  downswing_onset: "Down",
  contact: "Contact",
  follow_through: "Follow",
  recovery: "Recover",
};
