// End-to-end check of the automatic capture flow in Chromium.
//   node tests/e2e/capture-flow.mjs <baseUrl> <clip-or-photo[,photo…]> <outPrefix> [width] [height]
// Add screen → (automatic: read, shot, batter, camera, check, track, report) → report → PDF.
// MARK=1 then opens "Add ball and bat" from the report and skips every mark.
import { chromium } from "@playwright/test";
const [, , base, media, out, w = "390", h = "844"] = process.argv;
const files = media.split(",");
const isPhoto = files.every((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
const launchArgs = { executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] };
const ctxOpts = { viewport: { width: +w, height: +h }, deviceScaleFactor: 1, acceptDownloads: true, isMobile: +w < 700, hasTouch: +w < 700 };
// USER_DATA=<dir> keeps the device's saved analyses between runs (e.g. to test Compare).
const launched = process.env.USER_DATA ? null : await chromium.launch(launchArgs);
const ctx = launched ? await launched.newContext(ctxOpts) : await chromium.launchPersistentContext(process.env.USER_DATA, { ...launchArgs, ...ctxOpts });
// Close the browser itself (closing only a context leaves it running and the script never exits).
const browser = { close: () => (launched ? launched.close() : ctx.close()) };
// Pin the pose path (as a returning device would have it) for repeatable runs.
if (process.env.POSE_DELEGATE) await ctx.addInitScript((d) => localStorage.setItem("align:pose-delegate", d), process.env.POSE_DELEGATE);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|favicon/.test(m.text())) console.log("CONSOLE", m.text().slice(0, 200)); });
const t0 = Date.now();
const step = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
const shot = (name) => page.screenshot({ path: `${out}_${name}.png`, fullPage: false });

await page.goto(base + "/analyse", { waitUntil: "load" });
await page.getByLabel(/Analyse my movement on this device/).check();
await shot("add");
await page.locator(isPhoto ? "input[type=file][multiple]" : "input[type=file]").first().setInputFiles(files);
step("files set");

// Log each automatic decision as it appears.
const seen = new Set();
let shotTaken = false;
const deadline = Date.now() + 600000;
while (Date.now() < deadline) {
  if (/\/report\//.test(page.url())) break;
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  if (/can't analyse|can’t analyse|Couldn't|can't be|Tracking stopped|Analysis failed|No batter|Can.t read|Unsupported|too short/i.test(h1)) {
    step("STOPPED: " + h1);
    await shot("stopped");
    console.log(await page.locator("main").innerText().catch(() => ""));
    await browser.close();
    process.exit(0);
  }
  // Asked who bats (two people look alike): take the suggestion, as most athletes would.
  if (/Which one is the batter/.test(h1)) {
    step("ASKED: which one is the batter → suggested");
    await page.getByRole("button", { name: /Analyse this person|Follow this person/ }).click();
    await page.waitForTimeout(500);
    continue;
  }
  const items = await page.locator("[aria-label='Analysis progress'] li").allInnerTexts().catch(() => []);
  for (const it of items) {
    const line = it.replace(/\s+/g, " ").trim();
    if (!seen.has(line) && !/^\S+ing\b.*$/.test("")) {
      if (/Change$|·|found|Found|frames|looks|Usable|Shot at|Side|Bowler|Behind|person|people/.test(line)) {
        seen.add(line);
        step("  " + line);
      }
    }
  }
  if (!shotTaken && items.some((x) => /Checking the recording\s*\S/.test(x))) {
    await shot("working");
    shotTaken = true;
  }
  await page.waitForTimeout(500);
}
await page.waitForURL(/\/report\//, { timeout: 60000 });
await page.locator("#verdict").waitFor({ timeout: 30000 });
step("report: " + (await page.locator("#verdict").innerText()));
step(`sections: observations=${await page.getByText("What we could still see").count()} posture=${await page.getByText(/What the photos? shows?/).count()} addBallBat=${await page.getByRole("link", { name: "Add ball and bat" }).count()}`);
await page.waitForTimeout(1500);
await shot("report");
if (process.env.EXPORT_TRACKS) {
  // Save the tracked observation (align-tracks-v1, base64) for offline engine checks.
  const id = page.url().split("/report/")[1];
  const b64 = await page.evaluate((key) => new Promise((resolve, reject) => {
    const req = indexedDB.open("align");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const get = req.result.transaction("tracks").objectStore("tracks").get(key);
      get.onsuccess = () => {
        const u8 = new Uint8Array(get.result);
        let s = "";
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        resolve(btoa(s));
      };
      get.onerror = () => reject(get.error);
    };
  }), id);
  (await import("node:fs")).writeFileSync(process.env.EXPORT_TRACKS, b64);
  step("tracks exported");
}
const stage = page.locator(".stage").first();
if (await stage.count()) {
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await stage.screenshot({ path: `${out}_evidence.png` });
}
if (process.env.VIEWER && (await stage.count())) {
  // Play at ¼ speed and capture the stage: the skeleton must sit on the batter in every shot.
  await page.getByRole("button", { name: "Play" }).first().click();
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(1600);
    await stage.screenshot({ path: `${out}_play${k}.png` });
  }
  await page.waitForTimeout(9000);
  step("after play: " + (await page.locator("text=/frame \\d+\\/\\d+/").first().innerText().catch(() => "?")));
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForTimeout(2500);
  await stage.screenshot({ path: `${out}_3d.png` });
  await page.getByRole("button", { name: "Play" }).first().click();
  // A burst of shots 80 ms apart: the figure should move a little in every one (fluid), not jump.
  for (let k = 0; k < 8; k++) {
    await page.waitForTimeout(80);
    await stage.screenshot({ path: `${out}_3d_burst${k}.png` });
  }
  await page.getByRole("button", { name: "Pause" }).first().click().catch(() => {});
  if (await page.getByRole("tab", { name: "Compare" }).count()) {
    await page.getByRole("tab", { name: "Compare" }).click();
    await page.waitForTimeout(2500);
    await page.locator("[aria-label='Evidence viewer']").screenshot({ path: `${out}_compare.png` });
    step("compare: " + (await page.locator("[aria-label='Evidence viewer']").innerText()).replace(/\s+/g, " ").slice(0, 400));
  } else step("compare: no earlier comparable shot (tab hidden)");
  await page.getByRole("tab", { name: "Tracked" }).click();
}
await page.screenshot({ path: `${out}_report_full.png`, fullPage: true });
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /Download PDF/ }).click()]);
await download.saveAs(`${out}_report.pdf`);
step("pdf saved " + download.suggestedFilename());
if (process.env.MARK && (await page.getByRole("link", { name: "Add ball and bat" }).count())) {
  const url = page.url();
  await page.getByRole("link", { name: "Add ball and bat" }).click();
  await page.getByRole("button", { name: "Stumps not visible" }).waitFor({ timeout: 30000 });
  step("marking opened from report");
  await shot("mark");
  for (const label of ["Stumps not visible", "Bounce not visible", "Can't see contact", "Ball not visible", "Bat not visible"]) {
    await page.getByRole("button", { name: label }).click({ timeout: 10000 }).catch(() => console.log("skip missing", label));
  }
  await page.waitForURL(url, { timeout: 60000 });
  await page.locator("#verdict").waitFor({ timeout: 30000 });
  step("report after marking: " + (await page.locator("#verdict").innerText()));
}
await browser.close();
