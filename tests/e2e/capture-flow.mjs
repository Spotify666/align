// End-to-end check of the capture flow in Chromium: node tests/e2e/capture-flow.mjs <baseUrl> <clip> <outPrefix>
import { chromium } from "@playwright/test";
const [,, base, media, out, w = "390", h = "844"] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, acceptDownloads: true, isMobile: +w < 700, hasTouch: +w < 700 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 160)); });
const t0 = Date.now();
const step = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
await page.goto(base + "/analyse", { waitUntil: "load" });
await page.getByRole("button", { name: /Front-foot defence/ }).click();
await page.getByRole("button", { name: /Quick Check/ }).click();
await page.getByLabel(/I agree to my movement/).check();
await page.getByRole("button", { name: "Continue to video" }).click();
await page.locator('input[type=file]').first().setInputFiles(media);
step("file set");
await page.getByText("Quality gate").waitFor({ timeout: 120000 });
step("gate shown: " + (await page.locator("h1").innerText()));
await page.screenshot({ path: `${out}_gate.png`, fullPage: true });
const cont = page.getByRole("button", { name: /^Continue/ });
if (await cont.count()) await cont.first().click(); else { console.log("GATE BLOCKED"); await browser.close(); process.exit(0); }
const trim = page.getByRole("button", { name: "Track this window" });
if (await trim.isVisible().catch(() => false)) await trim.click();
const isPhoto = media.endsWith(".jpg");
if (isPhoto) {
  await page.getByRole("button", { name: /Right/ }).click({ timeout: 120000 });
} else {
  await page.getByRole("button", { name: /Bowler on the right/ }).click({ timeout: 180000 });
  step("tracked; marking");
  await page.screenshot({ path: `${out}_mark.png` });
  for (const label of ["Stumps not visible", "Bounce not visible", "Can't see contact", "Ball not visible", "Bat not visible"]) {
    const b = page.getByRole("button", { name: label });
    await b.click({ timeout: 10000 }).catch(() => console.log("skip missing", label));
  }
}
await page.waitForURL(/\/report\//, { timeout: 60000 });
await page.locator("#verdict").waitFor({ timeout: 30000 });
step("report: " + (await page.locator("#verdict").innerText()));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}_report.png` });
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /Download PDF/ }).click()]);
await dl.saveAs(`${out}_report.pdf`);
step("pdf saved " + dl.suggestedFilename());
await page.goto(base + "/sessions");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}_sessions.png` });
await page.goto(base + "/progress");
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}_progress.png` });
await browser.close();
