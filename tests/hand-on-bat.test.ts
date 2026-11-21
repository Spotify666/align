import { describe, expect, it } from "vitest";
import { HAND_REACH, SURE_MIN, handOnBat } from "@/lib/viz";

// The evidence viewer's hand: drawn from a wrist to the bat's handle only when both were tracked and
// the wrist is close enough to be holding it; dotted when either is unsure (an occluded grip).
describe("the hand drawn on a tracked bat", () => {
  const handle = [100, 100, 0.9] as const;
  const toe = [100, 300, 0.9] as const; // a bat 200 long, pointing down
  it("joins a wrist beside the handle to its nearest point on the handle", () => {
    const h = handOnBat([115, 120, 0.9], handle, toe)!;
    expect(h.grip).toEqual([100, 120]);
    expect(h.sure).toBe(true);
  });
  it("is never drawn on the blade or from a wrist that isn't holding the bat", () => {
    expect(handOnBat([100 + HAND_REACH * 200 + 5, 120, 0.9], handle, toe)).toBeNull();
    // Beside the blade, far below the handle: held nowhere near it.
    expect(handOnBat([110, 260, 0.9], handle, toe)).toBeNull();
  });
  it("says it is unsure when the wrist or the bat was, and draws nothing unseen", () => {
    expect(handOnBat([110, 110, SURE_MIN - 0.05], handle, toe)!.sure).toBe(false);
    expect(handOnBat([110, 110, 0.9], [100, 100, SURE_MIN - 0.05], toe)!.sure).toBe(false);
    expect(handOnBat([110, 110, 0.1], handle, toe)).toBeNull();
    expect(handOnBat([110, 110, 0.9], null, toe)).toBeNull();
  });
});
