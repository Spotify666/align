// End-to-end check of the capture flow in Chromium.
//   node tests/e2e/capture-flow.mjs <baseUrl> <clip-or-photo[,photo…]> <outPrefix> [width] [height]
// Videos go through scan → shot → batter → camera position → quality check → tracking →
// marking (all skipped) → report → PDF. Photos go through review → report → PDF.
import { chromium } from "@playwright/test";
const [, , base, media, out, w = "390", h = "844"] = process.argv;
const files = media.split(",");
const isPhoto = files.every((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, acceptDownloads: true, isMobile: +w < 700, hasTouch: +w < 700 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|favicon/.test(m.text())) console.log("CONSOLE", m.text().slice(0, 200)); });
const t0 = Date.now();
const step = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
const shot = (name) => page.screenshot({ path: `${out}_${name}.png`, fullPage: false });
const visible = (loc, ms = 1500) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

await page.goto(base + "/analyse", { waitUntil: "load" });
await page.getByRole("button", { name: /Front-foot defence/ }).click();
await page.getByRole("button", { name: /Quick Check/ }).click();
await page.getByLabel(/I agree to my movement/).check();
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.locator(isPhoto ? 'input[type=file][multiple]' : 'input[type=file]').first().setInputFiles(files);
step("files set");

if (isPhoto) {
  const analyse = page.getByRole("button", { name: /^Analyse / });
  if (!(await visible(analyse, 180000))) {
    step("ERROR: " + (await page.locator("h1").innerText()));
    await shot("error");
    process.exit(1);
  }
  step("photos reviewed: " + (await page.locator("h1").innerText()));
  await shot("photos");
  await analyse.click();
} else {
  const use = page.getByRole("button", { name: "Use this shot" });
  if (!(await visible(use, 400000))) {
    step("ERROR: " + (await page.locator("h1").innerText()) + " — " + (await page.locator("main p").first().innerText().catch(() => "")));
    await shot("error");
    process.exit(1);
  }
  step("moment: " + (await page.locator("h1").innerText()));
  await page.waitForTimeout(800);
  await shot("moment");
  await use.click();
  const trackPerson = page.getByRole("button", { name: "Track this person" });
  const check = page.getByRole("button", { name: "Check the recording" });
  await Promise.race([trackPerson.waitFor({ timeout: 120000 }), check.waitFor({ timeout: 120000 })]);
  if (await trackPerson.isVisible()) {
    step("batter picker: " + (await page.locator("h1").innerText()));
    await shot("batter");
    // PICK_PERSON=n chooses the n-th person (1-based) instead of the suggestion.
    if (process.env.PICK_PERSON) await page.getByRole("list", { name: "People in view" }).getByRole("button").nth(Number(process.env.PICK_PERSON) - 1).click();
    await trackPerson.click();
  }
  await check.waitFor({ timeout: 120000 });
  const guess = await page.getByRole('radiogroup', { name: 'Camera position' }).locator('[aria-checked=true]').innerText();
  step("camera position suggested: " + guess.replace(/\s+/g, " ").slice(0, 60));
  await shot("view");
  await check.click();
  const trackBtn = page.getByRole("button", { name: "Track the batter" });
  await page.getByText("Quality check").waitFor({ timeout: 180000 });
  step("gate: " + (await page.locator("h1").innerText()));
  await shot("gate");
  if (!(await trackBtn.isVisible())) {
    console.log("GATE BLOCKED");
    console.log(await page.locator("[aria-label='Capture checks']").innerText());
    await browser.close();
    process.exit(0);
  }
  await trackBtn.click();
  await page.getByRole("button", { name: "Stumps not visible" }).waitFor({ timeout: 600000 });
  step("tracked; marking");
  await shot("mark");
  for (const label of ["Stumps not visible", "Bounce not visible", "Can't see contact", "Ball not visible", "Bat not visible"]) {
    await page.getByRole("button", { name: label }).click({ timeout: 10000 }).catch(() => console.log("skip missing", label));
  }
}
await page.waitForURL(/\/report\//, { timeout: 120000 });
await page.locator("#verdict").waitFor({ timeout: 30000 });
step("report: " + (await page.locator("#verdict").innerText()));
step(`sections: observations=${await page.getByText("What we could still see").count()} posture=${await page.getByText(/What the photos? shows?/).count()} photosTable=${await page.locator("table").count()}`);
await page.waitForTimeout(1500);
await shot("report");
await page.screenshot({ path: `${out}_report_full.png`, fullPage: true });
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /Download PDF/ }).click()]);
await download.saveAs(`${out}_report.pdf`);
step("pdf saved " + download.suggestedFilename());
await browser.close();
