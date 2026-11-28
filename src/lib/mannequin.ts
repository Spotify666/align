// The shot-model figure (/models/edit) and the home page's moving batter: a cricketer in kit,
// built only from the joints a person places. The owner, 2026-11-17: a 3D posing tool was the
// reference for how a body should read ("accurate depiction… accessible for someone registering
// the data points"), then: "add a touch of a cricketing athlete… so it looks polished and crafted
// for this solution". So the figure is a batter, not an artist's manikin: whites, a helmet with
// its peak and grille, batting pads with their ridges and knee roll, gloves with cuffs closed on the
// handle, spiked shoes, a willow bat with a rubber grip.
//
// Every part hangs from the placed points (a limb from the shoulder to the elbow, a pad down the
// shin from the knee to the ankle), so the figure can never tear or stretch: it is the pose, given
// a cricketer's body. Pure: the 3D drawing (components/model/mannequin-view.tsx) reads these parts;
// tests/mannequin.test.ts holds them to the pose. Sizes are an adult's, in body heights: drawing
// only, never measured.

import { chestOf, pelvisOf, type Handle, type Pose, type V3 } from "@/engine/pose-model";
import { BAT, GRIP, gripPoint } from "@/engine/rig";

/** limb: a tapered cylinder between a and b; ball: a sphere at a; ellipsoid and box: between a and b, `r` wide and `depth` deep. */
export type PartKind = "limb" | "ball" | "ellipsoid" | "box";
/** What a part is made of, which decides its colour. */
export type Tone = "kit" | "skin" | "helmet" | "grille" | "pad" | "glove" | "shoe" | "sole" | "willow" | "grip";
export interface Part {
  key: string;
  kind: PartKind;
  tone: Tone;
  /** Where the part starts and ends (a ball: both its centre). */
  a: V3;
  b: V3;
  /** Its half-width at a, and at b (a limb tapers from one to the other). */
  r: number;
  r2: number;
  /** For an ellipsoid or a box: the direction its width lies along. */
  across?: V3;
  /** Its half-depth (an ellipsoid or a box is flatter one way than the other). */
  depth?: number;
  /** The handles that move it: picking one shows the part picked. */
  moves: Handle[];
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3, fallback: V3): V3 => (len(a) > 1e-9 ? mul(a, 1 / len(a)) : fallback);
/** `a` with its part along `axis` taken out, as a unit vector. */
const square = (a: V3, axis: V3, fallback: V3): V3 => unit(sub(a, mul(axis, dot(a, axis))), fallback);

/** Half-widths, in body heights (a 175 cm adult: the thigh 19 cm across at the top, the knee 14). */
export const SIZE = {
  shoulder: 0.034, elbow: 0.027, wrist: 0.021, hip: 0.05, knee: 0.04, ankle: 0.027,
  upperArm: [0.034, 0.027], forearm: [0.027, 0.021], thigh: [0.056, 0.041], shin: [0.04, 0.027],
  neck: 0.03, head: 0.058, hand: 0.026, foot: 0.03, footDepth: 0.022, chestDepth: 0.075, hipDepth: 0.07,
  /** A batting pad: half its width, half its depth, how far its face stands in front of the shin. */
  pad: { half: 0.044, depth: 0.02, ahead: 0.024 },
  helmet: 0.07,
} as const;

/** The figure's parts for a pose, the bat's too when it holds one. */
export function mannequinParts(p: Pose): Part[] {
  const parts: Part[] = [];
  const up: V3 = [0, 1, 0];
  const held = !!(p.bat_handle && p.bat_toe);
  for (const s of ["front", "back"] as const) {
    const j = (part: string) => p[`${s}_${part}` as keyof Pose] as V3;
    const h = (part: string) => `${s}_${part}` as Handle;
    const [sh, el, wr, hip, kn, an, heel, toe] = [j("shoulder"), j("elbow"), j("wrist"), j("hip"), j("knee"), j("ankle"), j("heel"), j("foot")];
    // Whites: long sleeves and trousers, the joints rounded in the same cloth (no manikin balls).
    parts.push(
      { key: `${s}-upper-arm`, kind: "limb", tone: "kit", a: sh, b: el, r: SIZE.upperArm[0], r2: SIZE.upperArm[1], moves: [h("shoulder"), h("elbow")] },
      { key: `${s}-forearm`, kind: "limb", tone: "kit", a: el, b: wr, r: SIZE.forearm[0], r2: SIZE.forearm[1], moves: [h("wrist")] },
      { key: `${s}-thigh`, kind: "limb", tone: "kit", a: hip, b: kn, r: SIZE.thigh[0], r2: SIZE.thigh[1], moves: [h("hip"), h("knee")] },
      { key: `${s}-shin`, kind: "limb", tone: "kit", a: kn, b: an, r: SIZE.shin[0], r2: SIZE.shin[1], moves: [h("ankle")] },
    );
    for (const [part, r] of [["shoulder", SIZE.shoulder], ["elbow", SIZE.elbow], ["wrist", SIZE.wrist], ["hip", SIZE.hip], ["knee", SIZE.knee], ["ankle", SIZE.ankle]] as const)
      parts.push({ key: `${s}-${part}-joint`, kind: "ball", tone: "kit", a: j(part), b: j(part), r, r2: r, moves: [h(part)] });

    // The batting pad: down the front of the shin from just above the knee to the ankle, three
    // raised bolsters down its face and the knee roll on top.
    const shin = unit(sub(an, kn), [0, -1, 0]);
    const toes = square(sub(toe, heel), shin, [1, 0, 0]);
    const width = unit(cross(shin, toes), [0, 0, 1]);
    const padTop = add(sub(kn, mul(shin, 0.07)), mul(toes, SIZE.pad.ahead));
    const padEnd = add(add(an, mul(shin, -0.02)), mul(toes, SIZE.pad.ahead));
    parts.push({ key: `${s}-pad`, kind: "box", tone: "pad", a: padTop, b: padEnd, r: SIZE.pad.half, r2: SIZE.pad.half, depth: SIZE.pad.depth, across: width, moves: [h("knee"), h("ankle")] });
    for (const [n, off] of [[0, -0.024], [1, 0], [2, 0.024]] as const) {
      const face = mul(toes, SIZE.pad.depth);
      const across = mul(width, off);
      parts.push({ key: `${s}-pad-ridge-${n}`, kind: "limb", tone: "pad", a: add(add(lerp(padTop, padEnd, 0.18), face), across), b: add(add(lerp(padTop, padEnd, 0.95), face), across), r: 0.009, r2: 0.008, moves: [h("knee"), h("ankle")] });
    }
    parts.push({ key: `${s}-knee-roll`, kind: "ellipsoid", tone: "pad", a: add(padTop, mul(shin, -0.005)), b: add(padTop, mul(shin, 0.06)), r: SIZE.pad.half * 1.02, r2: SIZE.pad.half, depth: SIZE.pad.depth * 1.6, across: width, moves: [h("knee")] });

    // The shoe: a white upper from the heel to the toe, a dark spiked sole under it.
    const footWidth = unit(cross(unit(sub(toe, heel), [1, 0, 0]), up), [0, 0, 1]);
    parts.push(
      { key: `${s}-foot`, kind: "ellipsoid", tone: "shoe", a: add(heel, mul(up, SIZE.footDepth)), b: add(toe, mul(up, SIZE.footDepth * 0.75)), r: SIZE.foot, r2: SIZE.foot * 0.85, depth: SIZE.footDepth, across: footWidth, moves: [h("heel"), h("foot"), h("ankle")] },
      { key: `${s}-sole`, kind: "box", tone: "sole", a: add(heel, mul(up, 0.004)), b: add(toe, mul(up, 0.004)), r: SIZE.foot * 0.9, r2: SIZE.foot * 0.9, depth: 0.005, across: footWidth, moves: [h("heel"), h("foot")] },
    );

    // The glove's cuff over the wrist; without a bat, an open gloved hand beyond it.
    const along = unit(sub(wr, el), [0, -1, 0]);
    parts.push({ key: `${s}-cuff`, kind: "limb", tone: "glove", a: sub(wr, mul(along, 0.04)), b: wr, r: SIZE.wrist * 1.45, r2: SIZE.wrist * 1.4, moves: [h("wrist")] });
    if (!held) parts.push({ key: `${s}-hand`, kind: "ellipsoid", tone: "glove", a: wr, b: add(wr, mul(along, 0.09)), r: SIZE.hand, r2: SIZE.hand, depth: SIZE.hand * 0.6, across: unit(cross(along, up), [0, 0, 1]), moves: [h("wrist")] });
  }

  // The trunk in a shirt: the chest between the shoulders, the waist, the hips between the hip joints.
  const chest = chestOf(p);
  const pelvis = pelvisOf(p);
  const shoulders = unit(sub(p.front_shoulder, p.back_shoulder), [1, 0, 0]);
  const hips = unit(sub(p.front_hip, p.back_hip), [1, 0, 0]);
  const halfShoulders = len(sub(p.front_shoulder, p.back_shoulder)) / 2;
  const halfHips = len(sub(p.front_hip, p.back_hip)) / 2;
  parts.push(
    { key: "chest", kind: "ellipsoid", tone: "kit", a: lerp(chest, pelvis, -0.04), b: lerp(chest, pelvis, 0.58), r: halfShoulders * 0.92, r2: halfShoulders * 0.92, depth: SIZE.chestDepth, across: shoulders, moves: ["chest", "front_shoulder", "back_shoulder"] },
    { key: "waist", kind: "ellipsoid", tone: "kit", a: lerp(chest, pelvis, 0.45), b: lerp(chest, pelvis, 0.9), r: Math.max(halfHips, halfShoulders * 0.62), r2: Math.max(halfHips, halfShoulders * 0.62), depth: SIZE.hipDepth * 0.9, across: unit(add(shoulders, hips), shoulders), moves: ["chest"] },
    { key: "hips", kind: "ellipsoid", tone: "kit", a: lerp(chest, pelvis, 0.78), b: lerp(chest, pelvis, 1.18), r: halfHips + 0.035, r2: halfHips + 0.035, depth: SIZE.hipDepth, across: hips, moves: ["pelvis", "front_hip", "back_hip"] },
  );

  // The head, a little behind the nose (the tracked point is the nose), in a helmet facing the
  // bowler: the dome, the peak over the eyes, the grille's bars across the face.
  const toNose = sub(p.head, chest);
  const facing = unit([toNose[0], 0, toNose[2]], [1, 0, 0]);
  const head = add(sub(p.head, mul(facing, 0.05)), [0, 0.012, 0]);
  const neckUp = unit(sub(head, chest), up);
  const face = square(facing, neckUp, [1, 0, 0]);
  const side = unit(cross(neckUp, face), [0, 0, 1]);
  const at = (f: number, u: number, sd = 0): V3 => add(add(add(head, mul(face, f)), mul(neckUp, u)), mul(side, sd));
  const H = SIZE.helmet;
  parts.push(
    { key: "neck", kind: "limb", tone: "skin", a: add(chest, mul(neckUp, 0.02)), b: add(head, mul(neckUp, -0.04)), r: SIZE.neck, r2: SIZE.neck * 0.9, moves: ["head"] },
    { key: "head", kind: "ellipsoid", tone: "skin", a: at(0.008, -0.045), b: at(0.008, 0.045), r: SIZE.head * 0.92, r2: SIZE.head, across: side, depth: SIZE.head, moves: ["head"] },
    { key: "helmet", kind: "ellipsoid", tone: "helmet", a: at(-0.008, -0.03), b: at(-0.008, 0.078), r: H, r2: H, across: side, depth: H * 1.04, moves: ["head"] },
    { key: "helmet-peak", kind: "box", tone: "helmet", a: at(0.045, 0.022), b: at(0.105, 0.012), r: H * 0.72, r2: H * 0.72, depth: 0.005, across: side, moves: ["head"] },
  );
  for (const [n, u] of [[0, -0.008], [1, -0.03], [2, -0.052]] as const)
    parts.push({ key: `grille-${n}`, kind: "limb", tone: "grille", a: at(0.078 - n * 0.006, u, -0.05), b: at(0.078 - n * 0.006, u, 0.05), r: 0.0045, r2: 0.0045, moves: ["head"] });
  parts.push({ key: "grille-stem", kind: "limb", tone: "grille", a: at(0.084, 0.0), b: at(0.068, -0.058), r: 0.0045, r2: 0.0045, moves: ["head"] });

  // The bat, when held: a rubber grip from above the top hand to the blade, the willow blade to the toe.
  if (held) {
    const dir = unit(sub(p.bat_toe!, p.bat_handle!), [0, -1, 0]);
    // Where the hands hold the handle (each wrist sits a hand's length back from it: placeBat).
    const hands = p.bat_handle!;
    const top = sub(hands, mul(dir, BAT.aboveHands + GRIP.top));
    const blade = sub(p.bat_toe!, mul(dir, BAT.blade));
    // The face looks toward the bowler, square to the bat.
    const batFace = square([1, 0, 0], dir, [0, 0, 1]);
    const width = unit(cross(dir, batFace), [0, 0, 1]);
    parts.push(
      { key: "bat-handle", kind: "limb", tone: "grip", a: top, b: blade, r: HANDLE_R, r2: HANDLE_R, moves: ["bat_toe"] },
      { key: "bat-blade", kind: "box", tone: "willow", a: blade, b: p.bat_toe!, r: 0.031, r2: 0.031, depth: 0.017, across: width, moves: ["bat_toe"] },
    );
    // Both gloved hands close round the handle, touching: the top hand (the front wrist's) just
    // above the bottom hand, as a batter holds it, each on the rig's own grip anchor (the anchor the
    // solver put the wrist a hand's length from: one source, so the glove and the arm agree).
    for (const s of ["front", "back"] as const) {
      const wrist = p[`${s}_wrist`];
      const grip = gripPoint(hands, dir, s);
      const moves = [`${s}_wrist` as Handle];
      // Each glove faces by its role, from the bat's face (the owner's reference, approved
      // 2026-11-28): the top hand's back toward the bowler, the bottom hand's palm toward the bowler,
      // so their backs face opposite ways round the handle and the Vs of thumb and forefinger line up
      // down its back. Worked out from the bat, not the batting side: a left-hander's own hold.
      const back = s === "front" ? batFace : mul(batFace, -1);
      const knuckles = add(grip, mul(back, HANDLE_R + FINGER.r * 0.6));
      parts.push(
        // The back of the glove: a padded mitt from the wrist to the knuckle row, as broad along the
        // handle as the fingers it carries.
        { key: `${s}-palm`, kind: "ellipsoid", tone: "glove", a: wrist, b: knuckles, r: FINGER.span * 0.5, r2: FINGER.span * 0.5, depth: FINGER.r * 2.6, across: dir, moves },
        // The closed hand round the handle, under the fingers.
        { key: `${s}-fist`, kind: "ellipsoid", tone: "glove", a: add(grip, mul(dir, -FINGER.span / 2)), b: add(grip, mul(dir, FINGER.span / 2)), r: HANDLE_R + 0.006, r2: HANDLE_R + 0.006, depth: HANDLE_R + 0.006, across: back, moves },
      );
      parts.push(...fingersRound(s, grip, dir, back, sub(grip, wrist), moves));
      // The top forearm's guard, on its outside (toward the bowler): it shows the forearm's turn.
      if (s === "front") {
        const el = p.front_elbow;
        const fa = sub(wrist, el);
        const outside = square(back, unit(fa, [0, -1, 0]), back);
        parts.push({ key: "front-guard", kind: "ellipsoid", tone: "pad", a: add(add(el, mul(fa, 0.3)), mul(outside, SIZE.forearm[0] * 0.75)), b: add(add(el, mul(fa, 0.92)), mul(outside, SIZE.forearm[1] * 0.75)), r: SIZE.forearm[0] * 1.15, r2: SIZE.forearm[0] * 1.15, depth: SIZE.forearm[0] * 0.55, across: unit(cross(unit(fa, [0, -1, 0]), outside), [0, 0, 1]), moves: ["front_wrist", "front_elbow"] });
      }
    }
  }
  return parts;
}

/** The handle's half-width, body heights. */
const HANDLE_R = 0.0135;

/**
 * A gloved hand's fingers and thumb, closed round the handle (the owner, 2026-11-28: "fingers on
 * wrist give a different feel of the hold"). Four fingers side by side along the handle, the little
 * finger toward the top for both hands, each in three segments curling from the knuckles behind the
 * handle round its far side (the bottom hand's only part way: it holds loosely, in its fingers);
 * the thumb comes round the other way and rests on them. The top and
 * bottom hands are mirror images, so both wrap the same way round the handle, as a batter's do.
 * Drawn on the grip anchor the arm reaches, so they move with the bat. Body heights.
 */
// Batting gloves are padded: each finger a roll about 3 cm across, the four side by side filling the
// hand's grip on the handle so the two gloves touch (GRIP.top + GRIP.bottom apart), as in a batter's
// hold (the owner's reference, 2026-11-28: big gloves together on the handle, wrists straight).
const FINGER = { r: 0.0092, span: GRIP.top + GRIP.bottom, arcs: [235, 255, 250, 225], looseArcs: [150, 175, 185, 170] } as const;
function fingersRound(side: "front" | "back", grip: V3, dir: V3, back: V3, fromWrist: V3, moves: Handle[]): Part[] {
  // Round the handle from the knuckles (`back`): the fingers curl round the side away from the wrist
  // (`wrap`) to the palm's side; the thumb comes round the wrist's side the other way.
  const wrap = square(square(fromWrist, dir, unit(cross(dir, back), [0, 0, 1])), back, unit(cross(dir, back), [0, 0, 1]));
  const R = HANDLE_R + FINGER.r;
  const at = (c: V3, deg: number, r = R): V3 => {
    const a = (deg * Math.PI) / 180;
    return add(c, add(mul(back, r * Math.cos(a)), mul(wrap, r * Math.sin(a))));
  };
  const parts: Part[] = [];
  // The top hand closes round the handle; the bottom hand holds it loosely in its fingers.
  (side === "front" ? FINGER.arcs : FINGER.looseArcs).forEach((arc, i) => {
    // Little finger (i = 0) toward the top of the handle, the forefinger toward the blade.
    const c = add(grip, mul(dir, -FINGER.span / 2 + (FINGER.span * (i + 0.5)) / FINGER.arcs.length));
    const r = FINGER.r * (i === 0 ? 0.85 : 1);
    const joints = [-25, -25 + arc / 3, -25 + (2 * arc) / 3, -25 + arc].map((d) => at(c, d));
    joints.forEach((q, k) => parts.push({ key: `${side}-finger-${i}-${k}`, kind: "ball", tone: "glove", a: q, b: q, r, r2: r, moves }));
    for (let k = 0; k < 3; k++) parts.push({ key: `${side}-finger-${i}-seg-${k}`, kind: "limb", tone: "glove", a: joints[k]!, b: joints[k + 1]!, r, r2: r * 0.92, moves });
  });
  // The thumb: from the heel of the hand, round the other way, its tip on the middle fingers.
  const base = add(grip, mul(dir, -FINGER.span * 0.15));
  const tip = add(grip, mul(dir, FINGER.span * 0.12));
  const thumb = [at(base, -40, R + 0.004), at(lerp(base, tip, 0.5), -95, R + 0.002), at(tip, -150, R)];
  thumb.forEach((q, k) => parts.push({ key: `${side}-thumb-${k}`, kind: "ball", tone: "glove", a: q, b: q, r: FINGER.r * 1.15, r2: FINGER.r * 1.15, moves }));
  for (let k = 0; k < 2; k++) parts.push({ key: `${side}-thumb-seg-${k}`, kind: "limb", tone: "glove", a: thumb[k]!, b: thumb[k + 1]!, r: FINGER.r * 1.1, r2: FINGER.r, moves });
  return parts;
}

/** The parts a handle moves, to show which is picked. */
export const partsMovedBy = (parts: Part[], h: Handle | null): Set<string> => new Set(h ? parts.filter((p) => p.moves.includes(h)).map((p) => p.key) : []);
