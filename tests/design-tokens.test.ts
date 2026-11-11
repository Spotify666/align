// The second design's colours (docs/13) must be readable: every pair of text and ground the
// product uses meets WCAG 2.1 AA (4.5:1), in the dark theme and in daylight. Read from the
// stylesheet itself, so a token can't be changed without this noticing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function block(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no ${selector}`);
  const body = css.slice(at, css.indexOf("\n}", at));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const dark = block(':root[data-ui="2"]');
const light = { ...dark, ...block(':root[data-ui="2"][data-theme="light"]') };

function hex(tokens: Record<string, string>, name: string): string {
  let v = tokens[name];
  for (let i = 0; v?.startsWith("var(") && i < 4; i++) v = tokens[v.slice(6, -1)];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a solid colour: ${v}`);
  return v;
}
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

// [text, ground]
const PAIRS: Array<[string, string]> = [
  ["fg", "bg"], ["fg", "surface"], ["fg", "raised"],
  ["fg-muted", "bg"], ["fg-muted", "surface"], ["fg-muted", "raised"],
  ["fg-subtle", "bg"], ["fg-subtle", "surface"], ["fg-subtle", "raised"],
  ["brand", "bg"], ["brand", "surface"], ["brand-fg", "brand"], ["brand-fg", "brand-hover"],
  ["ok", "bg"], ["bad", "bg"], ["warn", "bg"], ["ok", "surface"], ["bad", "surface"], ["warn", "surface"],
  ["band-fg", "band"], ["band-muted", "band"],
];

describe.each([["dark", dark], ["daylight", light]] as const)("design tokens, %s", (_name, tokens) => {
  it.each(PAIRS)("%s on %s is at least 4.5:1", (text, ground) => {
    expect(contrast(hex(tokens, text), hex(tokens, ground))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("design tokens", () => {
  it("orange is the action colour, with a dark label on it in the dark theme (white on it would fail)", () => {
    expect(hex(dark, "brand").toLowerCase()).toBe("#ff6a00");
    expect(contrast("#ffffff", hex(dark, "brand"))).toBeLessThan(4.5);
    expect(contrast(hex(dark, "brand-fg"), hex(dark, "brand"))).toBeGreaterThan(7);
  });
});
