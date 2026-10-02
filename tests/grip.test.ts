// Batting hand from the grip, on wrist, shoulder and hip positions measured from real
// photos (MediaPipe output) and their mirror images (a left-hander's view of the same pose).
import { describe, expect, it } from "vitest";
import { gripHandedness } from "@/lib/capture/grip";
import { J, type ImgPoint } from "@/engine/types";

function body(p: Record<"lw" | "rw" | "ls" | "rs" | "lh" | "rh", [number, number]>): ImgPoint[] {
  const b: ImgPoint[] = Array.from({ length: 17 }, () => null);
  b[J.left_wrist] = [...p.lw, 0.9];
  b[J.right_wrist] = [...p.rw, 0.9];
  b[J.left_shoulder] = [...p.ls, 1];
  b[J.right_shoulder] = [...p.rs, 1];
  b[J.left_hip] = [...p.lh, 1];
  b[J.right_hip] = [...p.rh, 1];
  return b;
}
// A mirror image swaps the person's left and right as well as flipping x.
const mirror = (b: ImgPoint[]): ImgPoint[] => {
  const m = b.map((p) => (p ? ([1 - p[0], p[1], p[2]] as ImgPoint) : null));
  const swap = (a: number, c: number) => ([m[a], m[c]] = [m[c]!, m[a]!]);
  swap(J.left_wrist, J.right_wrist);
  swap(J.left_shoulder, J.right_shoulder);
  swap(J.left_hip, J.right_hip);
  return m;
};

// Side-on forward defence (360×312 photo) and a crouched one seen from in front (1200×1099).
const SIDE_ON = body({ lw: [0.79, 0.35], rw: [0.74, 0.42], ls: [0.64, 0.27], rs: [0.57, 0.35], lh: [0.52, 0.46], rh: [0.46, 0.48] });
const CROUCHED = body({ lw: [0.72, 0.22], rw: [0.71, 0.37], ls: [0.65, 0.16], rs: [0.49, 0.27], lh: [0.66, 0.45], rh: [0.56, 0.46] });

describe("batting hand from the grip", () => {
  it("right-handers: left hand on top", () => {
    expect(gripHandedness([SIDE_ON], 360 / 312)?.handedness).toBe("right");
    expect(gripHandedness([CROUCHED], 1200 / 1099)?.handedness).toBe("right");
  });
  it("left-handers: right hand on top (the same poses mirrored)", () => {
    expect(gripHandedness([mirror(SIDE_ON)], 360 / 312)?.handedness).toBe("left");
    expect(gripHandedness([mirror(CROUCHED)], 1200 / 1099)?.handedness).toBe("left");
  });
  it("no call when the hands are apart, raised, level, or the frames disagree", () => {
    const apart = body({ lw: [0.2, 0.5], rw: [0.8, 0.6], ls: [0.45, 0.3], rs: [0.55, 0.3], lh: [0.46, 0.6], rh: [0.54, 0.6] });
    const raised = body({ lw: [0.5, 0.1], rw: [0.52, 0.18], ls: [0.45, 0.3], rs: [0.55, 0.3], lh: [0.46, 0.6], rh: [0.54, 0.6] });
    const level = body({ lw: [0.5, 0.45], rw: [0.53, 0.46], ls: [0.45, 0.3], rs: [0.55, 0.3], lh: [0.46, 0.6], rh: [0.54, 0.6] });
    for (const b of [apart, raised, level]) expect(gripHandedness([b], 1)).toBeNull();
    expect(gripHandedness([SIDE_ON, mirror(SIDE_ON)], 360 / 312)).toBeNull();
  });
});
