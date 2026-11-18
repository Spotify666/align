// The takes the shared motion fit is checked on (src/lib/motion, docs/15), written to
// public/motion/takes/*.json by `node scripts/motion/takes.mjs`.
//
// - The owner's real side-on front-foot defence, as traced (public/art/motion-ffd-side.json): one
//   camera, its depth the pose model's estimate, the bat's direction in the picture only.
// - Generated balls (src/engine/fixtures): each seen at once by the generator's two calibrated
//   cameras (side-on and from the bowler's end), the truth they were made from kept beside them.
//   Their events are read off that truth. DEMO DATA: plausible movement authored from coaching
//   descriptions, never shown as a real batter.
//
// Tuned on: the front- and back-foot defences. Held out of every choice in fit.ts: the drive, the
// cut and the pull (docs/15).

import { readFileSync } from "node:fs";
import { FIXTURE_CAMERAS, generate, type GenerateOptions } from "@/engine/fixtures/generate";
import { bfdScript, cutScript, driveScript, ffdScript, pullScript } from "@/engine/fixtures/index";
import { bfdVariant, ffdVariant } from "@/engine/fixtures/population";
import { rng } from "@/engine/math";
import type { SemanticJoint } from "@/engine/scene";
import { JOINTS as ANATOMICAL, type CaptureObservation } from "@/engine/types";
import { triangulate } from "@/lib/motion/camera";
import { TAKE_SCHEMA, type Camera, type P2c, type Take, type View } from "@/lib/motion/types";

const H = 1.75;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Anatomical joint name to role, for a right-hander (front = left). */
function roleOf(j: string): SemanticJoint {
  if (j === "nose") return "head";
  return j.replace(/^left_/, "front_").replace(/^right_/, "back_") as SemanticJoint;
}

const CAMS: Record<"side_on" | "front_on", Camera> = {
  side_on: { id: "side_on", label: "Side-on", P: FIXTURE_CAMERAS.side_on.P, width: 1920, height: 1080, calibration: "calibrated" },
  front_on: { id: "front_on", label: "Bowler's end", P: FIXTURE_CAMERAS.front_on.P, width: 1080, height: 1920, calibration: "calibrated" },
};

function viewOf(obs: CaptureObservation, cam: Camera, frames: number[]): View {
  const px = (p: readonly [number, number, number] | null): P2c => (p ? [r1(p[0] * cam.width), r1(p[1] * cam.height), r4(p[2])] : null);
  const joints: View["joints"] = {};
  ANATOMICAL.forEach((j, k) => (joints[roleOf(j)] = frames.map((f) => px(obs.body[f]![k] ?? null))));
  return { camera: cam, joints, bat: { handle: frames.map((f) => px(obs.bat.handle[f] ?? null)), toe: frames.map((f) => px(obs.bat.toe[f] ?? null)) } };
}

/** Where the generated bat really was: its two noiseless views triangulated (exact for a pinhole). */
function truthBat(side: CaptureObservation, front: CaptureObservation, frames: number[]) {
  const tri = (key: "handle" | "toe", f: number) => {
    const a = side.bat[key][f];
    const b = front.bat[key][f];
    if (!a || !b) return null;
    const p = triangulate([
      { camera: CAMS.side_on, uv: [a[0] * 1920, a[1] * 1080], w: 1 },
      { camera: CAMS.front_on, uv: [b[0] * 1080, b[1] * 1920], w: 1 },
    ]);
    return p ? p.map(r4) : null;
  };
  return { handle: frames.map((f) => tri("handle", f)!), toe: frames.map((f) => tri("toe", f)!) };
}

interface Spec {
  id: string;
  label: string;
  shot: string;
  options: Omit<GenerateOptions, "id" | "label" | "fps" | "durationS" | "statureM" | "handedness" | "view">;
  note: string;
}

export function generatedTake(spec: Spec): Take {
  const base = { id: spec.id, label: spec.label, fps: 60, durationS: 2.2, statureM: H, handedness: "right" as const, withBat: true, withBall: true, include3d: true, marks: { contact: true }, ...spec.options };
  const side = generate({ ...base, view: "side_on" });
  const front = generate({ ...base, seed: base.seed + 1000, view: "front_on" });
  const cleanSide = generate({ ...base, noise: 0, view: "side_on" });
  const cleanFront = generate({ ...base, noise: 0, view: "front_on" });
  const contactFrame = side.marks.contactFrame!;
  const fps = 60;
  const first = Math.max(0, contactFrame - Math.round(1.0 * fps));
  const last = Math.min(side.body.length - 1, contactFrame + Math.round(0.45 * fps));
  const frames = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const truthJoints = {} as Record<SemanticJoint, number[][]>;
  ANATOMICAL.forEach((j, k) => (truthJoints[roleOf(j)] = frames.map((f) => side.body3d![f]![k]!.slice(0, 3).map(r4))));
  const bat = truthBat(cleanSide, cleanFront, frames);
  // Events, read off the truth: the top of the backlift (the toe at its highest before contact),
  // the stepping foot down (the foot that travels further, back on the ground), contact.
  const ci = frames.indexOf(contactFrame);
  let top = 0;
  for (let i = 0; i < ci; i++) if (bat.toe[i]![1]! > bat.toe[top]![1]!) top = i;
  const travel = (s: "front" | "back") => Math.abs(truthJoints[`${s}_ankle`][ci]![0]! - truthJoints[`${s}_ankle`][0]![0]!) + Math.abs(truthJoints[`${s}_ankle`][ci]![2]! - truthJoints[`${s}_ankle`][0]![2]!);
  const stepper = travel("front") >= travel("back") ? "front" : "back";
  const heelY = (i: number) => truthJoints[`${stepper}_heel`][i]![1]!;
  let peak = 0;
  for (let i = 0; i < ci; i++) if (heelY(i) > heelY(peak)) peak = i;
  let down = ci;
  for (let i = peak; i <= ci; i++) {
    if (heelY(i) < heelY(ci) + 0.01) {
      down = i;
      break;
    }
  }
  const t = (i: number) => r4(frames[i]! / fps);
  return {
    schema: TAKE_SCHEMA,
    id: spec.id,
    label: spec.label,
    shot: spec.shot,
    battingSide: "right",
    provenance: { source: "generated", note: spec.note },
    units: "metre",
    statureM: base.statureM,
    // The generator draws no hands: its wrist marks are on the handle.
    wristMark: "grip",
    times: frames.map((f) => r4(f / fps)),
    views: [viewOf(side, CAMS.side_on, frames), viewOf(front, CAMS.front_on, frames)],
    events: { backlift_top: t(top), foot_down: t(down), contact: t(ci) },
    truth: { joints: truthJoints, bat },
  };
}

/** The owner's traced side-on front-foot defence, as it was traced (scripts/trace/rig.py, MOTION_OUT). */
export function tracedTake(file: string): Take {
  const m = JSON.parse(readFileSync(file, "utf8")) as {
    fps: number;
    clip: string;
    moments: Record<string, number>;
    frames: Array<{ frame: number; pose: Record<string, number[]>; bat: number[] }>;
  };
  const roles = Object.keys(m.frames[0]!.pose) as SemanticJoint[];
  const joints: NonNullable<Take["points"]>["joints"] = {};
  // The trace kept no per-joint confidence: every joint is taken as seen (0.8), and said so (docs/15).
  for (const j of roles) joints[j] = m.frames.map((f) => [f.pose[j]![0]!, f.pose[j]![1]!, f.pose[j]![2]!, 0.8] as const);
  const time = (frame: number) => r4(frame / m.fps);
  return {
    schema: TAKE_SCHEMA,
    id: "real-ffd-side",
    label: "The owner's front-foot defence (side-on, traced)",
    shot: "front_foot_defence",
    battingSide: "right",
    provenance: { source: "traced", clip: m.clip, note: "The owner's own clip (2026-11-17), one side-on camera; traced and smoothed by scripts/trace/rig.py. Depth is the pose model's estimate; the bat was found in the picture only." },
    units: "body_height",
    statureM: H,
    times: m.frames.map((f) => time(f.frame)),
    points: { joints, depth: "estimated" },
    batDir: { dir: m.frames.map((f) => [f.bat[0]!, f.bat[1]!, f.bat[2]!, 0.8] as const), depth: "unobserved" },
    events: { backlift_top: time(m.moments.backlift!), foot_down: time(m.moments.foot_down!), contact: time(m.moments.contact!) },
  };
}

const R = rng(7);
const pivot = { ...ffdScript({ stride: 0.72 }), backHeelLift: [[0, 0], [0.75, 0], [1.0, 0.06], [2, 0.09]] as Array<[number, number]> };
export const GENERATED: Spec[] = [
  { id: "gen-ffd", label: "Front-foot defence (generated)", shot: "front_foot_defence", options: { seed: 11, script: ffdScript() }, note: "Generated textbook front-foot defence, two calibrated cameras. Tuning set." },
  { id: "gen-ffd-pivot", label: "Front-foot defence, back heel lifting (generated)", shot: "front_foot_defence", options: { seed: 19, script: pivot }, note: "Generated: a longer stride, the back foot pivoting on its toes. Tuning set." },
  { id: "gen-bfd", label: "Back-foot defence (generated)", shot: "back_foot_defence", options: { seed: 31, script: bfdScript() }, note: "Generated textbook back-foot defence. Tuning set." },
  { id: "gen-bfd-b", label: "Back-foot defence, another batter (generated)", shot: "back_foot_defence", options: { seed: 37, statureM: 1.62, script: bfdVariant(R) } as Spec["options"], note: "Generated: a population variant, another build. Tuning set." },
  { id: "gen-ffd-c", label: "Front-foot defence, another batter (generated)", shot: "front_foot_defence", options: { seed: 41, script: ffdVariant(R) }, note: "Generated: a population variant. Tuning set." },
  { id: "gen-drive", label: "Front-foot drive (generated)", shot: "drive", options: { seed: 51, script: driveScript() }, note: "Generated. Held out: never used to choose anything in the fit." },
  { id: "gen-cut", label: "Square cut (generated)", shot: "cut", options: { seed: 61, script: cutScript() }, note: "Generated. Held out." },
  {
    id: "gen-pull",
    label: "Pull, bottom wrist hidden at contact (generated)",
    shot: "pull",
    options: { seed: 71, script: pullScript(), occlusion: { fromT: 0.86, toT: 1.0, joints: ["right_wrist", "right_elbow"] } },
    note: "Generated. Held out. The bottom wrist and elbow hidden from both cameras around contact.",
  },
];
