// End-to-end check of the optional second angle in Chromium: analyse one clip, tap "Add the …
// angle of this ball" on its report, analyse the other clip, and land on the combined view.
//   node tests/e2e/two-angles.mjs <baseUrl> <first-clip> <second-clip> <outPrefix>
// SHOT=back analyses both as back-foot defences; COLOR=dark uses the dark theme.
import { chromium } from "@playwright/test";
const [, , base, first, second, out] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: process.env.COLOR === "dark" ? "dark" : "light" });
if (process.env.POSE_DELEGATE) await ctx.addInitScript((d) => localStorage.setItem("align:pose-delegate", d), process.env.POSE_DELEGATE);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const t0 = Date.now();
const step = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
const shot = (name) => page.screenshot({ path: `${out}_${name}.png` });

/** Choose a clip on the Add screen and wait until the analysis leaves it (report or combined view). */
async function analyse(file, until) {
  const consent = page.getByLabel(/Analyse my movement on this device/);
  if (!(await consent.isChecked())) await consent.check();
  await page.locator("input[type=file]").first().setInputFiles(file);
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline && !until.test(page.url())) {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    if (/Which one is the batter/.test(h1)) await page.getByRole("button", { name: /Analyse this person|Follow this person/ }).click().catch(() => {});
    if (/can't analyse|can’t analyse|Analysis failed|No batter|Can.t read/i.test(h1)) throw new Error(`stopped: ${h1}`);
    await page.waitForTimeout(500);
  }
  await page.waitForURL(until, { timeout: 60000 });
}

await page.goto(`${base}/analyse${process.env.SHOT === "back" ? "?shot=back" : ""}`, { waitUntil: "load" });
await analyse(first, /\/report\//);
await page.locator("#verdict").waitFor();
const firstUrl = page.url();
step(`first report: ${await page.locator("#verdict").innerText()}`);
const add = page.getByRole("link", { name: /Add the (front|side) angle of this ball/ });
step(`offer: ${await add.innerText()}`);
await shot("first");
await add.click();
await page.waitForURL(/angle=/);
await page.getByText(/Other angle for/).waitFor();
step(`note: ${(await page.getByText(/Other angle for/).innerText()).replace(/\s+/g, " ")}`);
await shot("add");
await analyse(second, /\/angles\?/);
await page.locator("#verdict").waitFor();
step(`combined: ${await page.locator("#verdict").innerText()} | ${(await page.getByRole("list", { name: "Summary" }).innerText().catch(() => "")).replace(/\s+/g, " ")}`);
await shot("combined");
await page.getByRole("switch", { name: "Details" }).click();
await page.waitForTimeout(500);
step(`checks: ${(await page.getByRole("list", { name: /Each check/ }).innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 700)}`);
await page.locator("#report-details").screenshot({ path: `${out}_combined_details.png` });
// The first report now offers both angles together.
await page.goto(firstUrl, { waitUntil: "load" });
await page.locator("#verdict").waitFor();
step(`first report now offers: ${await page.getByRole("link", { name: /See both angles together/ }).count()}`);
await browser.close();
