import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_ORDER, sampleAnalysis } from "@/lib/demo";
import { forDisplay, undash } from "@/lib/display-text";

// No em dash reaches the screen (the owner, 2026-11-17): the app's own copy has none, and the
// analysis's own sentences lose theirs on the way to the screen.

describe("em dashes", () => {
  it("are written nowhere in the app's own copy (code comments aside)", () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.tsx?$/.test(n) && files.push(join(d, n))));
    ["src/app", "src/components", "src/lib"].forEach(walk);
    const found = files.flatMap((f) =>
      readFileSync(f, "utf8").split("\n").map((line, i) => ({ f, i: i + 1, line })).filter(({ line }) => line.includes("—") && !/^\s*(\/\/|\*|\/\*)/.test(line) && !line.includes("display-text") && !line.includes('"—"') && !/replace\(\/\[/.test(line)),
    );
    expect(found.map(({ f, i }) => `${f}:${i}`)).toEqual([]);
  });
  it("are taken out of a stored result on its way to the screen, nothing else changing", () => {
    expect(undash("Not assessed — capture failed.")).toBe("Not assessed, capture failed.");
    expect(undash("—")).toBe("–");
    expect(undash("6–8 m")).toBe("6–8 m");
    for (const key of SAMPLE_ORDER) {
      const p = sampleAnalysis(key)!.payload;
      const shown = forDisplay(p);
      expect(JSON.stringify(shown)).not.toContain("—");
      expect(shown.analysis_status).toBe(p.analysis_status);
      expect(shown.result_hash).toBe(p.result_hash);
      expect(shown.metrics.map((m) => m.value)).toEqual(p.metrics.map((m) => m.value));
    }
  });
});
