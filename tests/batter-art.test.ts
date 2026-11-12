// The landing page's batter is a drawing made of key poses. These checks keep it a believable
// body doing a front-foot defence: bones stay a human length, planted feet stay planted, both
// hands stay on the handle, the bat ends beside the front pad under the head, and every path
// is drawable.
import { describe, expect, it } from "vitest";
import { PHASES, T_CONTACT, T_END, ballAt, batterArt, poseAt, type P } from "@/lib/batter-art";

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const times = Array.from({ length: 131 }, (_, i) => (i / 130) * T_END);

describe("the landing batter", () => {
  it("keeps every bone within a human length through the whole movement", () => {
    for (const t of times) {
      const p = poseAt(t);
      // Seen from the side a limb can look shorter (it points toward the camera), never longer.
      expect(dist(p.fHip, p.fKnee), `front thigh at ${t}`).toBeLessThanOrEqual(0.27);
      expect(dist(p.bHip, p.bKnee), `back thigh at ${t}`).toBeLessThanOrEqual(0.27);
      expect(dist(p.fKnee, p.fAnk), `front shin at ${t}`).toBeLessThanOrEqual(0.255);
      expect(dist(p.bKnee, p.bAnk), `back shin at ${t}`).toBeLessThanOrEqual(0.255);
      expect(dist(p.fSh, p.fElb), `top-hand upper arm at ${t}`).toBeLessThanOrEqual(0.19);
      expect(dist(p.bSh, p.bElb), `bottom-hand upper arm at ${t}`).toBeLessThanOrEqual(0.19);
      expect(dist(p.fElb, p.grip), `top-hand forearm at ${t}`).toBeLessThanOrEqual(0.21);
      // Nothing goes through the ground.
      for (const k of ["bAnk", "bToe", "fAnk", "fToe"] as const) expect(p[k][1], `${k} at ${t}`).toBeGreaterThanOrEqual(0);
      const a = (p.bat * Math.PI) / 180;
      expect(p.grip[1] + Math.sin(a) * 0.445, `bat toe at ${t}`).toBeGreaterThanOrEqual(-0.005);
    }
  });

  it("keeps the back foot where it is and plants the front foot once", () => {
    const start = poseAt(0);
    for (const t of times) expect(dist(poseAt(t).bToe, start.bToe), `back toe at ${t}`).toBeLessThan(0.03);
    // Until the backlift is up the front foot hasn't left; from the plant it doesn't slide.
    for (const t of times.filter((x) => x <= 0.4)) expect(dist(poseAt(t).fAnk, start.fAnk)).toBeLessThan(0.005);
    const planted = poseAt(0.8).fAnk;
    for (const t of times.filter((x) => x >= 0.8)) expect(dist(poseAt(t).fAnk, planted)).toBeLessThan(0.001);
    expect(planted[0] - start.fAnk[0]).toBeGreaterThan(0.25);
  });

  it("brings the bat down from behind, never across the line", () => {
    // The bat's angle only ever falls back (stance to backlift), then only ever comes through.
    let last = poseAt(0).bat;
    for (const t of times.filter((x) => x <= 0.4)) {
      const b = poseAt(t).bat;
      expect(b).toBeLessThanOrEqual(last + 1e-6);
      last = b;
    }
    for (const t of times.filter((x) => x >= 0.62)) {
      const b = poseAt(t).bat;
      expect(b).toBeGreaterThanOrEqual(last - 1e-6);
      last = b;
    }
    // When the bat passes level it is at the hips, not swung at the shoulders.
    const level = times.map(poseAt).filter((p, i) => times[i]! > 0.62 && Math.abs(p.bat - 180) < 12);
    expect(level.length).toBeGreaterThan(0);
    for (const p of level) expect(p.grip[1]).toBeLessThan(p.fSh[1] - 0.1);
  });

  it("ends in the defence it describes", () => {
    const p = poseAt(T_CONTACT);
    // Head over the front foot, front knee over it, front shoulder between them.
    expect(p.head[0]).toBeGreaterThanOrEqual(p.fAnk[0]);
    expect(p.head[0]).toBeLessThanOrEqual(p.fToe[0]);
    expect(p.fKnee[0]).toBeGreaterThanOrEqual(p.fAnk[0]);
    expect(p.fKnee[0]).toBeLessThanOrEqual(p.fToe[0]);
    expect(Math.abs(p.fSh[0] - p.fKnee[0])).toBeLessThan(0.05);
    // Front elbow high (near shoulder height) and ahead of the hands' shoulder; hands ahead of the blade.
    expect(p.fElb[1]).toBeGreaterThan(p.fSh[1] - 0.05);
    expect(p.fElb[0]).toBeGreaterThan(p.fSh[0]);
    const a = (p.bat * Math.PI) / 180;
    const toe: P = [p.grip[0] + Math.cos(a) * 0.445, p.grip[1] + Math.sin(a) * 0.445];
    expect(toe[0]).toBeLessThan(p.grip[0]);
    expect(toe[1]).toBeLessThan(0.06);
    // The ball arrives on the blade at that moment and then drops: a dead bat.
    const ball = ballAt(T_CONTACT)!;
    expect(dist(ball, [toe[0] + 0.045, toe[1] + 0.09])).toBeLessThan(0.05);
    expect(ballAt(T_END)![1]).toBeLessThan(0.03);
    expect(ballAt(T_END)![0] - ball[0]).toBeLessThan(0.15);
    expect(ballAt(0.2)).toBeNull();
  });

  it("stops on four moments, in order, the last at contact", () => {
    expect(PHASES.map((p) => p.id)).toEqual(["stance", "backlift", "stride", "contact"]);
    for (let i = 1; i < PHASES.length; i++) expect(PHASES[i]!.at).toBeGreaterThan(PHASES[i - 1]!.at);
    expect(PHASES[PHASES.length - 1]!.at).toBe(T_CONTACT);
    // Hands are named by their role, never by side (standing rule 7).
    for (const p of PHASES) expect(p.cue).not.toMatch(/\b(left|right)\b/i);
  });

  it("draws paths a browser can draw, inside the picture", () => {
    for (const t of [0, 0.2, 0.4, 0.62, 0.72, 0.8, T_CONTACT]) {
      const art = batterArt(poseAt(t), 600, 560);
      const all = art.layers.flatMap((l) => [...l.fill, ...l.lines]).join("");
      expect(all).not.toMatch(/NaN|Infinity|undefined/);
      const nums = [...all.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      for (const [x, y] of nums) {
        expect(x, `x at ${t}`).toBeGreaterThan(-8);
        expect(x, `x at ${t}`).toBeLessThan(608);
        expect(y, `y at ${t}`).toBeGreaterThan(-8);
        expect(y, `y at ${t}`).toBeLessThan(568);
      }
      expect(art.line).toHaveLength(4);
    }
  });
});
