// Two phones, one ball: the pairing protocol (`src/lib/pair.ts`). Codes, the clock between the
// phones, long messages in pieces, and that a result carries only what is declared.
import { describe, expect, it } from "vitest";
import { CODE_LENGTH, cleanCode, pairCheck, clockOffset, fromBase64, newCode, readResult, Reassembler, RESULT_KEYS, resultMessage, toBase64, toPieces } from "@/lib/pair";

describe("pairing two phones", () => {
  it("makes codes that can't be misheard and reads them back however they're typed", () => {
    for (let i = 0; i < 200; i++) {
      const c = newCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(c).not.toMatch(/[01OIL]/);
      expect(cleanCode(c.toLowerCase().replace(/(...)/, "$1-"))).toBe(c);
    }
    expect(cleanCode("ABC")).toBeNull();
    expect(cleanCode("ABCDE0")).toBeNull();
  });

  it("shows the same check number on both phones, and a different one for a stranger", () => {
    expect(pairCheck("host-1", "guest-7")).toBe(pairCheck("guest-7", "host-1"));
    expect(pairCheck("host-1", "guest-7")).toMatch(/^\d\d$/);
    const others = ["guest-8", "guest-9", "x", "y", "z"].map((g) => pairCheck("host-1", g));
    expect(others.some((c) => c !== pairCheck("host-1", "guest-7"))).toBe(true);
  });

  it("finds the other phone's clock from the quickest round trip", () => {
    // The other phone is 2,500 ms ahead; trips take 40–300 ms each way, the same both ways in the quickest.
    const ahead = 2500;
    const samples = [
      { sentAt: 1000, remoteAt: 1000 + 150 + ahead, backAt: 1600 },
      { sentAt: 2000, remoteAt: 2000 + 40 + ahead, backAt: 2080 },
      { sentAt: 3000, remoteAt: 3000 + 100 + ahead, backAt: 3300 },
    ];
    const c = clockOffset(samples)!;
    expect(c.offsetMs).toBeCloseTo(ahead, 6);
    expect(c.uncertaintyMs).toBe(40);
    expect(clockOffset([])).toBeNull();
  });

  it("cuts a long message into pieces and puts it back together in any order", () => {
    const text = "x".repeat(130_000) + "end";
    const pieces = toPieces("a", "m1", text, 48_000);
    expect(pieces).toHaveLength(3);
    const r = new Reassembler();
    expect(r.add(pieces[2]!)).toBeNull();
    expect(r.add(pieces[0]!)).toBeNull();
    expect(r.add(pieces[0]!)).toBeNull(); // a repeat changes nothing
    expect(r.add(pieces[1]!)).toBe(text);
  });

  it("sends a result with only its declared parts: never a video, a picture or a file", () => {
    const tracks = new Uint8Array([1, 2, 3, 250, 0, 9]);
    const msg = resultMessage({ id: "a1", title: "Net session", recordedAt: "2026-11-14T10:00:00Z", payload: { schema: "align.analysis/1" } }, tracks);
    expect(Object.keys(msg).sort()).toEqual([...RESULT_KEYS].sort());
    expect(fromBase64(msg.tracks)).toEqual(tracks);
    const back = readResult(JSON.stringify(msg))!;
    expect(back.id).toBe("a1");
    // Anything undeclared makes the whole message unreadable, so it is never saved.
    expect(readResult(JSON.stringify({ ...msg, video: "data:video/mp4;base64,AAAA" }))).toBeNull();
    expect(readResult(JSON.stringify({ ...msg, keyframes: {} }))).toBeNull();
    expect(readResult("not json")).toBeNull();
    expect(toBase64(new Uint8Array(0))).toBe("");
  });
});

import { analyze } from "@/engine/analyze";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { generate } from "@/engine/fixtures/generate";
import { pairOutcome } from "@/lib/pair-decide";
import type { CaptureObservation } from "@/engine/types";

describe("the first phone's decision", () => {
  const opts = { analysisId: "p", createdAt: "2026-10-01T00:00:00.000Z" };
  const shot = (key: string, view: "side_on" | "front_on", seed?: number) => {
    const spec = FIXTURE_SPECS.find((s) => s.key === key)!.options;
    const obs = generate({ ...spec, view, ...(seed !== undefined ? { seed } : {}), id: `${key}_${view}_${seed ?? "s"}` } as never) as CaptureObservation;
    return { obs, payload: analyze(obs, opts) };
  };

  it("puts one ball filmed from two places together", () => {
    const r = pairOutcome(shot("valid_ffd", "side_on"), shot("valid_ffd", "front_on"));
    expect(r.together, JSON.stringify(r)).toBe(true);
  });

  it("never puts two clips from the same place together", () => {
    const r = pairOutcome(shot("valid_ffd", "side_on"), shot("valid_ffd", "side_on", 99));
    expect(r.together).toBe(false);
    if (!r.together) expect(r.why).toMatch(/same place/);
  });

  it("never silently pairs two different balls", () => {
    const r = pairOutcome(shot("valid_ffd", "side_on"), shot("drive", "front_on"));
    expect(r.together).toBe(false);
  });
});
