// Makes the design document on /design: prints /design/print (A4 landscape slides) to
// public/design/aline-design.pdf. Run after capture.mjs, against the running app:
//   node scripts/design/pdf.mjs
// Run it again whenever src/lib/screen-map.ts, the print page or a picture changes.

import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const BASE = process.env.BASE ?? "http://localhost:3100";
const out = join(dirname(fileURLToPath(import.meta.url)), "../../public/design/aline-design.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
const missing = [];
page.on("response", (r) => r.status() >= 400 && missing.push(`${r.status()} ${r.url()}`));
await page.goto(`${BASE}/design/print`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// Every picture must have loaded: a slide with a hole in it is not a document.
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
if (missing.length || broken.length) {
  console.error("Not written. Missing:", [...missing, ...broken]);
  process.exit(1);
}
const slides = await page.locator(".design-doc .slide").count();
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log(`${out}: ${slides} slides, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
