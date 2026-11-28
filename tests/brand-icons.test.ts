import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import manifest from "@/app/manifest";

// The app's icons are drawn in today's design: the warm-white mark on the black field, as in the
// header (docs/13). They were left in the first design's sage and black once (the owner,
// 2026-11-28: "Why is there still old logo in favicon"). Redraw with `node scripts/brand-icons.mjs`.
const FIELD = "#050505";
const MARK = "#F4F1E8";

/** The colour of a PNG's pixel at (x, y): 8-bit RGB or RGBA, no interlace (as the script writes them). */
function pixel(file: string, x: number, y: number): string {
  const b = readFileSync(file);
  const w = b.readUInt32BE(16);
  const bpp = b[25] === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let i = 8; i < b.length; ) {
    const n = b.readUInt32BE(i);
    if (b.toString("latin1", i + 4, i + 8) === "IDAT") chunks.push(b.subarray(i + 8, i + 8 + n));
    i += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = w * bpp + 1;
  // Undo the row filters up to row y.
  const rows: Buffer[] = [];
  for (let r = 0; r <= y; r++) {
    const f = raw[r * stride]!;
    const line = Buffer.from(raw.subarray(r * stride + 1, (r + 1) * stride));
    const up = rows[r - 1];
    for (let i = 0; i < line.length; i++) {
      const a = i >= bpp ? line[i - bpp]! : 0;
      const u = up ? up[i]! : 0;
      const c = up && i >= bpp ? up[i - bpp]! : 0;
      const p = a + u - c;
      const pr = Math.abs(p - a) <= Math.abs(p - u) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - u) <= Math.abs(p - c) ? u : c;
      line[i] = (line[i]! + [0, a, u, (a + u) >> 1, pr][f]!) & 255;
    }
    rows.push(line);
  }
  const q = rows[y]!.subarray(x * bpp, x * bpp + 3);
  return `#${[...q].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

describe("the app's icons", () => {
  it("the favicon is the warm-white mark on the black field, nothing of the first design", () => {
    for (const f of ["src/app/icon.svg", "public/icon.svg"]) {
      const svg = readFileSync(f, "utf8");
      expect(svg).toContain(`fill="${FIELD}"`);
      expect(svg).toContain(`fill="${MARK}"`);
      expect(svg.toLowerCase()).not.toContain("#e3eadf");
    }
  });
  it("the phone's icons are drawn on the black field", () => {
    // A corner (the field) of each square icon; the rounded ones are read just inside the curve.
    expect(pixel("public/apple-touch-icon.png", 2, 2)).toBe(FIELD.toUpperCase());
    expect(pixel("public/icon-maskable-512.png", 4, 4)).toBe(FIELD.toUpperCase());
    expect(pixel("public/icon-512.png", 256, 30)).toBe(FIELD.toUpperCase());
  });
  it("the installed app opens on the same black", () => {
    expect(manifest().background_color).toBe(FIELD);
    expect(manifest().theme_color).toBe(FIELD);
  });
});
