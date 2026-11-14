import { describe, expect, it } from "vitest";
import { matchSignatures, SIGNATURE_IDS } from "@/engine/signature";
import { builtInReferences, DOMAINS, domainsOf, likeness, notComparable } from "@/lib/compare";

describe("comparison by part of the body", () => {
  it("puts every measure of a signature in exactly one part", () => {
    const all = DOMAINS.flatMap((d) => d.ids as readonly string[]);
    expect([...all].sort()).toEqual([...SIGNATURE_IDS].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  const refs = builtInReferences();
  const side = refs.find((r) => r.id === "textbook_side_on")!;
  const end = refs.find((r) => r.id === "textbook_front_on")!;

  it("reads the same shot as alike in every part it measures, and says which parts it couldn't", () => {
    const m = matchSignatures(side.signature, side.signature);
    expect(m.score).toBe(100);
    for (const d of domainsOf(m)) {
      if (d.measures) expect(d.score).toBe(100);
      else expect(d.score).toBeNull();
    }
    expect(notComparable(side.signature, side.signature, m)).toBeNull();
  });

  it("never compares across camera positions, and says what would make it comparable", () => {
    const m = matchSignatures(side.signature, end.signature);
    if (m.score === null) expect(notComparable(side.signature, end.signature, m)).toMatch(/Film/);
    const pro = refs.find((r) => r.kind === "pro")!;
    const mp = matchSignatures(side.signature, pro.signature);
    expect(mp.score).toBeNull();
    expect(notComparable(side.signature, pro.signature, mp)).toMatch(/bowler's end/);
  });

  it("puts a likeness into words without numbers", () => {
    expect(likeness(100)).toBe("close");
    expect(likeness(70)).toBe("some way off");
    expect(likeness(10)).toBe("far off");
  });
});
