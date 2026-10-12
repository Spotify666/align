// The textbook references are computed at build time (src/lib/textbook-refs.json) so the
// phone never runs the engine for them. They must be exactly what the engine reads today.
import { describe, expect, it } from "vitest";
import { computeTextbookSignatures } from "@/lib/textbook-refs";
import stored from "@/lib/textbook-refs.json";

describe("textbook references", () => {
  it("match the engine (else run: node scripts/textbook-refs.mjs > src/lib/textbook-refs.json)", () => {
    expect(JSON.parse(JSON.stringify(computeTextbookSignatures()))).toEqual(stored);
  });
});
