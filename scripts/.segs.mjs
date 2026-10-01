import { chromium } from "@playwright/test";
const [,, url, out, w = "390", h = "844", segs = "3"] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console", m.type(), m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);
const webgl = await page.evaluate(() => { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); });
console.log("webgl", webgl);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let i = 0; i < +segs; i++) {
  const y = i * +h;
  if (y >= total) break;
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}_${i}.png` });
}
console.log("height", total);
await browser.close();
