// End-to-end check of two videos of one ball (from the side and the front), chosen through
// "Two angles of one ball": a side slot and a front slot, each taking exactly one video (no
// picker on the page takes several videos, so a third can't be chosen). Aline sorts them by the
// camera angle it detects, checks they are the same ball from their sound, and shows them
// together; anything else is refused with the reason.
//   node tests/e2e/two-videos.mjs <baseUrl> <video,video> <outPrefix>
// SHOT=back analyses them as back-foot defences.
import { chromium } from "@playwright/test";
const [, , base, list, out] = process.argv;
const files = list.split(",");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const t0 = Date.now();
const step = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);

await page.goto(`${base}/analyse${process.env.SHOT === "back" ? "?shot=back" : ""}`, { waitUntil: "load" });
await page.getByLabel(/Analyse my movement on this device/).check();
{
  step(`limit shown: ${(await page.getByRole("button", { name: /Two angles of one ball/ }).innerText()).replace(/\s+/g, " ")}`);
  await page.getByRole("button", { name: /Two angles of one ball/ }).click();
  const many = await page.locator("input[type=file][multiple]").evaluateAll((els) => els.map((e) => e.accept));
  step(`inputs taking several files: ${many.join(" | ") || "none"}`);
  if (many.some((a) => /video/.test(a))) throw new Error("a video input takes several files");
  await page.getByLabel("Choose the side video").setInputFiles(files[0]);
  step(`after one: ${await page.locator("[aria-live=polite]").innerText()}`);
  await page.getByLabel("Choose the front video").setInputFiles(files[1]);
  await page.waitForTimeout(800);
  step(`after two: ${await page.locator("[aria-live=polite]").innerText()}`);
  await page.locator("#two-h").locator("xpath=ancestor::section").screenshot({ path: `${out}_slots.png` });
  await page.getByRole("button", { name: "Check both videos" }).click();
}
let seen = "";
let stripShots = 0;
const deadline = Date.now() + 900000;
while (Date.now() < deadline) {
  if (/\/angles\?|\/report\//.test(page.url())) break;
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  const eyebrow = await page.locator(".eyebrow").first().innerText().catch(() => "");
  if (eyebrow !== seen && /Video \d of 2/i.test(eyebrow)) {
    step((seen = eyebrow));
    const strip = page.getByRole("list", { name: "Your two videos" });
    step(`  strip: ${(await strip.innerText().catch(() => "none")).replace(/\s+/g, " ")}`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}_strip${++stripShots}.png` });
  }
  if (/Which one is the batter/.test(h1)) await page.getByRole("button", { name: /Analyse this person|Follow this person/ }).click().catch(() => {});
  if (/Not the|same ball|Too many|not detected|can't analyse|can’t analyse|Analysis failed/i.test(h1)) {
    step(`refused: ${h1} | ${(await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 260)}`);
    await page.screenshot({ path: `${out}_refused.png` });
    await browser.close();
    process.exit(0);
  }
  await page.waitForTimeout(500);
}
await page.locator("#verdict").waitFor({ timeout: 60000 });
step(`${/\/angles\?/.test(page.url()) ? "combined" : "single report"}: ${await page.locator("#verdict").innerText()} | ${(await page.getByRole("list", { name: "Summary" }).innerText().catch(() => "")).replace(/\s+/g, " ")}`);
await page.screenshot({ path: `${out}_result.png` });
await browser.close();
