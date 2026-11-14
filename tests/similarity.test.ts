// Movement similarity (`aline.similarity/1`): no score at all when two shots can't be compared
// (different shot, signature version, camera position, or too few measures in common), a
// score per part of the body with how much of it both shots carry, and the batter's own usual
// as a reference. Every built-in reference says where it comes from.
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { population } from "@/engine/fixtures/population";
import { matchSignatures, signatureOf, SIGNATURE_IDS, type ShotSignature } from "@/engine/signature";
import { similarity, SIMILARITY_DOMAINS, usualSignature } from "@/engine/similarity";
import { builtInReferences, likeness, PROVENANCE } from "@/lib/compare";

const refs = builtInReferences();
const side = refs.find((r) => r.id === "textbook_side_on")!.signature;
const end = refs.find((r) => r.id === "textbook_front_on")!.signature;

function noScore(s: ReturnType<typeof similarity>) {
  expect(s.comparable).toBe(false);
  expect(s.overall).toBeNull();
  for (const d of Object.values(s.domains)) expect(d.score).toBeNull();
  expect(s.reasons.length).toBeGreaterThan(0);
}

describe("movement similarity", () => {
  it("puts every signature measure in exactly one part of the body", () => {
    const all = SIMILARITY_DOMAINS.flatMap((d) => d.ids as readonly string[]);
    expect([...all].sort()).toEqual([...SIGNATURE_IDS].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it("reads the same shot as alike in every part it measures, and keeps the overall match unchanged", () => {
    const s = similarity(side, side);
    expect(s.comparable).toBe(true);
    expect(s.overall).toBe(100);
    expect(s.overall).toBe(matchSignatures(side, side).score);
    for (const d of Object.values(s.domains)) {
      if (d.measures) expect(d.score).toBe(100);
      else expect(d.score).toBeNull();
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("gives no score across camera positions, shots, versions, or with too few measures, and says why", () => {
    noScore(similarity(side, end));
    expect(similarity(side, end).reasons.join(" ")).toMatch(/Film/);
    noScore(similarity(side, { ...side, shot: "back_foot_defence" } as unknown as ShotSignature));
    noScore(similarity(side, { ...side, version: "sig-0" }));
    noScore(similarity(side, { ...side, values: { line_head: 0.05 } }));
    const pro = refs.find((r) => r.kind === "pro")!.signature;
    noScore(similarity(side, pro));
  });

  it("never scores shots filmed different ways, across the population", () => {
    const sigs = population(80, 3)
      .map((c) => signatureOf(analyze(c.obs, { analysisId: c.obs.id, createdAt: "2026-10-01T00:00:00.000Z" }), c.obs.media.fps))
      .filter((s): s is ShotSignature => !!s);
    expect(sigs.length).toBeGreaterThan(5);
    let pairs = 0;
    for (const a of sigs)
      for (const b of sigs) {
        const s = similarity(a, b);
        if (a.axis !== b.axis) {
          noScore(s);
          pairs++;
        }
        if (s.comparable) expect(s.overall).toBe(matchSignatures(a, b).score);
      }
    expect(pairs).toBeGreaterThan(0);
  });

  it("makes your usual from three or more earlier shots filmed the same way, as their medians", () => {
    const vary = (k: number): ShotSignature => ({ ...side, values: { ...side.values, line_head: (side.values.line_head ?? 0) + k * 0.01 } });
    expect(usualSignature([vary(0), vary(1)], side.axis)).toBeNull();
    const u = usualSignature([vary(0), vary(1), vary(5)], side.axis)!;
    expect(u.values.line_head).toBeCloseTo((side.values.line_head ?? 0) + 0.01, 6);
    expect(similarity(u, side).comparable).toBe(true);
    // Shots filmed another way don't count toward it.
    expect(usualSignature([vary(0), vary(1), { ...vary(2), axis: "sideways" }], side.axis)).toBeNull();
  });

  it("says where every built-in reference comes from", () => {
    for (const r of refs) expect(Object.values(PROVENANCE)).toContain(r.provenance);
    expect(refs.find((r) => r.kind === "pro")!.provenance.rights).toBe("research_unconfirmed");
    expect(refs.filter((r) => r.kind === "model").every((r) => r.provenance.rights === "generated")).toBe(true);
  });

  it("puts a likeness into words without numbers", () => {
    expect(likeness(100)).toBe("close");
    expect(likeness(70)).toBe("some way off");
    expect(likeness(10)).toBe("far off");
  });
});
