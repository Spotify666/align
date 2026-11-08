// End-to-end check of choosing two videos at once (one ball from the side and the front):
// Aline sorts them by the camera angle it detects, checks they are the same ball from their
// sound, and shows them together; anything else is refused with the reason.
//   node tests/e2e/two-videos.mjs <baseUrl> <video,video[,video]> <outPrefix>
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
await page.locator("input[type=file][multiple]").first().setInputFiles(files);
let seen = "";
const deadline = Date.now() + 900000;
while (Date.now() < deadline) {
  if (/\/angles\?|\/report\//.test(page.url())) break;
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  const eyebrow = await page.locator(".eyebrow").first().innerText().catch(() => "");
  if (eyebrow !== seen && /Video \d of 2/.test(eyebrow)) step((seen = eyebrow));
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
