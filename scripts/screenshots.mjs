// Captures phone- and desktop-sized screenshots of key pages for review.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir] [pages...]
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots";
const pages = process.argv.slice(4).length ? process.argv.slice(4) : ["/", "/sample/valid_ffd", "/sample/pull"];
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? undefined,
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
for (const [name, viewport, scale] of [
  ["phone", { width: 390, height: 844 }, 2],
  ["desktop", { width: 1440, height: 900 }, 1],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[${name}] pageerror`, e.message));
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const file = `${out}/${name}${p.replaceAll("/", "_") || "_home"}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log("saved", file);
  }
  await ctx.close();
}
await browser.close();
