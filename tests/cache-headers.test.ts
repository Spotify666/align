import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// The matcher Next itself uses for `headers()` sources (shipped without types).
// @ts-expect-error no declaration file
import { pathToRegexp as compile } from "next/dist/compiled/path-to-regexp";
const pathToRegexp = compile as (source: string) => RegExp;
import config from "../next.config";

// A year-long immutable cache belongs on files that never change under one name (the pose
// models, vendored scripts), never on a page: a page kept that long outlives every release.
describe("long cache headers", () => {
  it("cover the model files and none of the /models pages", async () => {
    const rules = (await config.headers!()).filter((r) => r.headers.some((h) => /immutable/.test(h.value)));
    const matches = (path: string) => rules.some((r) => pathToRegexp(r.source).test(path));
    // public/models is downloaded at build time (not in git): take the names from the script that fetches them.
    const files = [...readFileSync("scripts/vendor-mediapipe.mjs", "utf8").matchAll(/\/([\w.-]+\.(?:task|tflite))"/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(matches(`/models/${f}`), f).toBe(true);
    for (const page of ["/models", "/models/edit", "/models/motion", "/", "/home", "/report/x"]) expect(matches(page), page).toBe(false);
  });
});
