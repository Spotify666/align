// The shot-model mannequin (/models/edit): a jointed figure in the manner of an artist's wooden
// manikin, built only from the joints a person places. The owner, 2026-11-17, pointing to a 3D
// posing tool: "refer to this site for the accurate depiction… blend this depiction with the
// current model so it becomes accessible and easy for someone registering the data points".
//
// Every part hangs between two placed points (a limb from the shoulder to the elbow, the shin from
// the knee to the ankle), so the figure can never tear or stretch: it is the pose, given a body.
// Ball joints sit at the shoulders, elbows, wrists, hips, knees and ankles. Pure: the 3D drawing
// (components/model/mannequin-view.tsx) reads these parts; tests/mannequin.test.ts holds them to
// the pose. Sizes are an adult's proportions in body heights: drawing only, never measured.

import { chestOf, handsOf, pelvisOf, type Handle, type Pose, type V3 } from "@/engine/pose-model";

export type PartKind = "limb" | "ball" | "head" | "trunk" | "foot" | "hand" | "blade";
export interface Part {
  key: string;
  kind: PartKind;
  /** Where the part starts and ends (a ball: both its centre). */
  a: V3;
  b: V3;
  /** Its half-width at a, and at b (a limb tapers from one to the other). */
  r: number;
  r2: number;
  /** For a trunk, hand, foot or blade: the direction its width lies along. */
  across?: V3;
  /** Its half-depth (a trunk, foot, hand or blade is flatter one way than the other). */
  depth?: number;
  /** The handles that move it: picking one shows the part picked. */
  moves: Handle[];
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3, fallback: V3): V3 => (len(a) > 1e-9 ? mul(a, 1 / len(a)) : fallback);

/** Half-widths, in body heights (a 175 cm adult: the thigh 19 cm across at the top, the knee 14). */
export const SIZE = {
  shoulder: 0.036, elbow: 0.029, wrist: 0.022, hip: 0.05, knee: 0.04, ankle: 0.028,
  upperArm: [0.034, 0.027], forearm: [0.027, 0.021], thigh: [0.056, 0.041], shin: [0.04, 0.027],
  neck: 0.03, head: 0.062, hand: 0.026, foot: 0.03, footDepth: 0.022, chestDepth: 0.075, hipDepth: 0.07,
} as const;

/** The mannequin's parts for a pose, the bat's too when it holds one. */
export function mannequinParts(p: Pose): Part[] {
  const parts: Part[] = [];
  const up: V3 = [0, 1, 0];
  for (const s of ["front", "back"] as const) {
    const j = (part: string) => p[`${s}_${part}` as keyof Pose] as V3;
    const h = (part: string) => `${s}_${part}` as Handle;
    const [sh, el, wr, hip, kn, an, heel, toe] = [j("shoulder"), j("elbow"), j("wrist"), j("hip"), j("knee"), j("ankle"), j("heel"), j("foot")];
    parts.push(
      { key: `${s}-upper-arm`, kind: "limb", a: sh, b: el, r: SIZE.upperArm[0], r2: SIZE.upperArm[1], moves: [h("shoulder"), h("elbow")] },
      { key: `${s}-forearm`, kind: "limb", a: el, b: wr, r: SIZE.forearm[0], r2: SIZE.forearm[1], moves: [h("wrist")] },
      { key: `${s}-thigh`, kind: "limb", a: hip, b: kn, r: SIZE.thigh[0], r2: SIZE.thigh[1], moves: [h("hip"), h("knee")] },
      { key: `${s}-shin`, kind: "limb", a: kn, b: an, r: SIZE.shin[0], r2: SIZE.shin[1], moves: [h("ankle")] },
    );
    for (const [part, r] of [["shoulder", SIZE.shoulder], ["elbow", SIZE.elbow], ["wrist", SIZE.wrist], ["hip", SIZE.hip], ["knee", SIZE.knee], ["ankle", SIZE.ankle]] as const)
      parts.push({ key: `${s}-${part}-joint`, kind: "ball", a: j(part), b: j(part), r, r2: r, moves: [h(part)] });
    // The hand: with a bat, a fist closed round the handle (below); without one, a flat open hand
    // beyond the wrist, along the forearm.
    const along = unit(sub(wr, el), [0, -1, 0]);
    if (!(p.bat_handle && p.bat_toe)) parts.push({ key: `${s}-hand`, kind: "hand", a: wr, b: add(wr, mul(along, 0.09)), r: SIZE.hand, r2: SIZE.hand, depth: SIZE.hand * 0.55, across: unit([along[1] * up[2] - along[2] * up[1], along[2] * up[0] - along[0] * up[2], along[0] * up[1] - along[1] * up[0]], [0, 0, 1]), moves: [h("wrist")] });
    // The foot: from the heel to the toe, flat on its sole, the ankle above it.
    const footAcross = unit(sub(lerp(heel, toe, 0.5), an), up);
    parts.push({ key: `${s}-foot`, kind: "foot", a: add(heel, mul(up, SIZE.footDepth)), b: add(toe, mul(up, SIZE.footDepth * 0.7)), r: SIZE.foot, r2: SIZE.foot * 0.85, depth: SIZE.footDepth, across: footAcross, moves: [h("heel"), h("foot"), h("ankle")] });
  }

  // The trunk: the chest between the shoulders, the waist, the hips between the hip joints.
  const chest = chestOf(p);
  const pelvis = pelvisOf(p);
  const shoulders = unit(sub(p.front_shoulder, p.back_shoulder), [1, 0, 0]);
  const hips = unit(sub(p.front_hip, p.back_hip), [1, 0, 0]);
  const halfShoulders = len(sub(p.front_shoulder, p.back_shoulder)) / 2;
  const halfHips = len(sub(p.front_hip, p.back_hip)) / 2;
  parts.push(
    { key: "chest", kind: "trunk", a: lerp(chest, pelvis, -0.04), b: lerp(chest, pelvis, 0.58), r: halfShoulders * 0.92, r2: halfShoulders * 0.92, depth: SIZE.chestDepth, across: shoulders, moves: ["chest", "front_shoulder", "back_shoulder"] },
    { key: "waist", kind: "trunk", a: lerp(chest, pelvis, 0.45), b: lerp(chest, pelvis, 0.9), r: Math.max(halfHips, halfShoulders * 0.62), r2: Math.max(halfHips, halfShoulders * 0.62), depth: SIZE.hipDepth * 0.9, across: unit(add(shoulders, hips), shoulders), moves: ["chest"] },
    { key: "hips", kind: "trunk", a: lerp(chest, pelvis, 0.78), b: lerp(chest, pelvis, 1.18), r: halfHips + 0.035, r2: halfHips + 0.035, depth: SIZE.hipDepth, across: hips, moves: ["pelvis", "front_hip", "back_hip"] },
  );

  // The head: an egg a little behind the nose (the tracked point is the nose), on a neck.
  const toNose = sub(p.head, chest);
  const facing = unit([toNose[0], 0, toNose[2]], [1, 0, 0]);
  const head = add(sub(p.head, mul(facing, 0.05)), [0, 0.012, 0]);
  const neckUp = unit(sub(head, chest), up);
  parts.push(
    { key: "neck", kind: "limb", a: add(chest, mul(neckUp, 0.02)), b: add(head, mul(neckUp, -0.04)), r: SIZE.neck, r2: SIZE.neck * 0.9, moves: ["head"] },
    { key: "head", kind: "head", a: head, b: add(head, neckUp), r: SIZE.head, r2: SIZE.head * 1.22, across: facing, depth: SIZE.head * 1.05, moves: ["head"] },
  );

  // The bat, when held: the handle from above the top hand to the blade, then the blade to the toe.
  if (p.bat_handle && p.bat_toe) {
    const dir = unit(sub(p.bat_toe, p.bat_handle), [0, -1, 0]);
    const hands = handsOf(p);
    const top = sub(hands, mul(dir, 0.075));
    const blade = sub(p.bat_toe, mul(dir, 0.32));
    // Both hands close round the handle, touching: the top hand (the front wrist's) just above the
    // bottom hand, as a batter holds it. Each fist sits on the handle, joined to its wrist by the palm.
    for (const [side, along] of [["front", -0.03], ["back", 0.03]] as const) {
      const wrist = p[`${side}_wrist`];
      const grip = add(hands, mul(dir, along));
      const palm = sub(grip, wrist);
      // The fist's back faces away from the handle, toward its own wrist.
      const out = unit(sub(palm, mul(dir, palm[0] * dir[0] + palm[1] * dir[1] + palm[2] * dir[2])), [0, 0, 1]);
      parts.push(
        { key: `${side}-palm`, kind: "limb", a: wrist, b: sub(grip, mul(out, 0.012)), r: SIZE.wrist, r2: SIZE.hand * 0.9, moves: [`${side}_wrist` as Handle] },
        { key: `${side}-fist`, kind: "hand", a: sub(add(grip, mul(dir, -0.028)), mul(out, 0.006)), b: sub(add(grip, mul(dir, 0.028)), mul(out, 0.006)), r: SIZE.hand * 1.15, r2: SIZE.hand * 1.15, depth: SIZE.hand * 1.1, across: out, moves: [`${side}_wrist` as Handle] },
      );
    }
    // The face looks toward the bowler, square to the bat.
    const fwd: V3 = [1, 0, 0];
    const face = unit(sub(fwd, mul(dir, fwd[0] * dir[0] + fwd[1] * dir[1] + fwd[2] * dir[2])), [0, 0, 1]);
    const width: V3 = unit([dir[1] * face[2] - dir[2] * face[1], dir[2] * face[0] - dir[0] * face[2], dir[0] * face[1] - dir[1] * face[0]], [0, 0, 1]);
    parts.push(
      { key: "bat-handle", kind: "limb", a: top, b: blade, r: 0.013, r2: 0.013, moves: ["bat_toe"] },
      { key: "bat-blade", kind: "blade", a: blade, b: p.bat_toe, r: 0.031, r2: 0.031, depth: 0.017, across: width, moves: ["bat_toe"] },
    );
  }
  return parts;
}

/** The parts a handle moves, to show which is picked. */
export const partsMovedBy = (parts: Part[], h: Handle | null): Set<string> => new Set(h ? parts.filter((p) => p.moves.includes(h)).map((p) => p.key) : []);
