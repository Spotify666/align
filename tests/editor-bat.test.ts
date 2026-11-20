import { describe, expect, it } from "vitest";
import { MOMENTS, dragHandle, heldNaturally, placeBat, type Handle, type Pose, type V3 } from "@/engine/pose-model";
import { GRIP, add, angleDeg, cross, distance, dot, gripPoint, mul, sub, unit } from "@/engine/rig";
import { starterBat, starterPose } from "@/lib/pose-models";

// The shot-model editor's bat (2026-11-20): its toe dragged right round in each view, and each hand
// dragged out past the arm's reach, a step at a time as a finger drags. Held to: every bone one
// length, both hands on their grips, the forearms never crossed (the top hand's wrist above the
// bottom one's), no elbow flipping over, the wrist within its range, and the blade never through a
// leg (an edit that would do either is refused: the last pose the batter can hold stays).

const SHOTS = ["front_foot_defence", "back_foot_defence"] as const;
const PLANES: Record<string, (r: number) => V3> = {
  side: (r) => [Math.sin(r), -Math.cos(r), 0],
  front: (r) => [0, -Math.cos(r), Math.sin(r)],
  "3D": (r) => unit([Math.sin(r) * 0.7, -Math.cos(r), Math.sin(r) * 0.7 * Math.cos(r * 2)])!,
};

function check(p: Pose, lengths: number[], prev: Record<string, V3 | null>): { flips: number } {
  const L = (["front", "back"] as const).flatMap((s) => [distance(p[`${s}_shoulder`], p[`${s}_elbow`]), distance(p[`${s}_elbow`], p[`${s}_wrist`])]);
  L.forEach((l, i) => expect(l).toBeCloseTo(lengths[i]!, 9));
  const dir = unit(sub(p.bat_toe!, p.bat_handle!))!;
  let flips = 0;
  for (const s of ["front", "back"] as const) {
    const g = gripPoint(p.bat_handle!, dir, s);
    expect(distance(p[`${s}_wrist`], g)).toBeCloseTo(GRIP.hand, 6);
    expect(angleDeg(sub(p[`${s}_wrist`], p[`${s}_elbow`]), sub(g, p[`${s}_wrist`]))).toBeLessThan(25.01);
    const bend = angleDeg(sub(p[`${s}_elbow`], p[`${s}_shoulder`]), sub(p[`${s}_wrist`], p[`${s}_elbow`]));
    const n = bend > 15 && bend < 165 ? unit(cross(sub(p[`${s}_wrist`], p[`${s}_shoulder`]), sub(p[`${s}_elbow`], p[`${s}_shoulder`]))) : null;
    if (n && prev[s] && dot(n, prev[s]!) < 0) flips++;
    prev[s] = n;
  }
  expect(heldNaturally(p)).toBe(true);
  return { flips };
}
const lengthsOf = (p: Pose) => (["front", "back"] as const).flatMap((s) => [distance(p[`${s}_shoulder`], p[`${s}_elbow`]), distance(p[`${s}_elbow`], p[`${s}_wrist`])]);

describe("the editor's bat", () => {
  for (const shot of SHOTS)
    for (const m of MOMENTS)
      for (const [plane, at] of Object.entries(PLANES))
        it(`${shot}, ${m.id}: the toe dragged right round from ${plane} keeps the hands on the bat as a batter's are`, () => {
          let p = placeBat(starterPose(shot, m.id), starterBat(shot, m.id));
          expect(heldNaturally(p)).toBe(true);
          const lengths = lengthsOf(p);
          const prev: Record<string, V3 | null> = { front: null, back: null };
          let flips = 0;
          for (let a = 0; a <= 360; a += 3) {
            p = dragHandle(p, "bat_toe", add(p.bat_handle!, mul(at((a * Math.PI) / 180), 0.43)));
            flips += check(p, lengths, prev).flips;
          }
          expect(flips).toBe(0);
        });

  for (const shot of SHOTS)
    for (const hand of ["front_wrist", "back_wrist"] as const)
      it(`${shot}: the ${hand === "front_wrist" ? "top" : "bottom"} hand dragged out past the arm's reach stops at its reach, every way`, () => {
        for (const way of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as V3[]) {
          let p = placeBat(starterPose(shot, "contact"), starterBat(shot, "contact"));
          const lengths = lengthsOf(p);
          const prev: Record<string, V3 | null> = { front: null, back: null };
          const start = p[hand];
          let flips = 0;
          for (let k = 1; k <= 40; k++) {
            p = dragHandle(p, hand as Handle, add(start, mul(way, 0.02 * k)));
            flips += check(p, lengths, prev).flips;
          }
          expect(flips).toBe(0);
          // 80 cm asked for; the arm reaches less, and the hand stays where the arm can hold it.
          expect(distance(start, p[hand])).toBeLessThan(0.8);
        }
      });

  it("a pose already outside a batter's hold (an old saved model) can still be moved back", () => {
    let p = placeBat(starterPose("front_foot_defence", "contact"), [0, -1, 0]);
    // Put the blade through the front shin, as no edit now can.
    const shin = mul(add(p.front_knee, p.front_ankle), 0.5);
    p = { ...p, bat_toe: add(shin, [0, -0.05, 0]), bat_handle: add(shin, [0, 0.38, 0]) };
    expect(heldNaturally(p)).toBe(false);
    const moved = dragHandle(p, "bat_toe", add(p.bat_handle!, [0.3, -0.3, 0.1]));
    expect(moved).not.toBe(p);
  });
});
