// Contact sheets of the shared motion fit, before (each frame as tracked, the bat put in the hands)
// and after (fitted), side-on and from the bowler's end, at each event, with close-ups of the hands
// and feet. Shot from the motion inspector (/models/motion) in a phone-width browser, against a
// running build:
//   npx next start -p 3100 &
//   node scripts/motion/sheets.mjs http://localhost:3100 docs/motion
// Then each take's frames are put into one picture per take (needs Python with Pillow).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3100", out = "docs/motion"] = process.argv.slice(2);
const root = new URL("../../", import.meta.url).pathname;
mkdirSync(`${root}${out}`, { recursive: true });
const frames = mkdtempSync(join(tmpdir(), "aline-sheets-"));
const TAKES = ["real-ffd-side", "gen-ffd", "gen-bfd", "gen-pull"];
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 1800 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const id of TAKES) {
  const take = JSON.parse(readFileSync(`${root}public/motion/takes/${id}.json`, "utf8"));
  const one = !take.views;
  const views = one ? ["source"] : ["side", "end"];
  const times = [["backlift", take.events.backlift_top], ["foot down", take.events.foot_down], ["contact", take.events.contact], ["after", Math.min(take.times.at(-1), take.events.contact + 0.25)]];
  const cells = [];
  for (const played of ["before", "after"]) {
    for (const view of views) {
      for (const [label, t] of times) cells.push({ played, view, zoom: "whole", label, t });
      cells.push({ played, view, zoom: "hands", label: "hands at contact", t: take.events.contact });
      cells.push({ played, view, zoom: "feet", label: "feet at contact", t: take.events.contact });
    }
  }
  const files = [];
  for (const [n, c] of cells.entries()) {
    await page.goto(`${base}/models/motion?take=${id}&played=${c.played}&view=${c.view}&zoom=${c.zoom}&t=${c.t}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const fig = page.locator('div[style*="aspect-ratio"]').first();
    const file = `${frames}/${id}-${n}.png`;
    await fig.screenshot({ path: file });
    files.push(`${file}|${c.played === "before" ? "As tracked" : "Fitted"} · ${c.view === "end" ? "bowler's end" : c.view === "source" ? "filmed camera" : "side-on"} · ${c.label}`);
  }
  execFileSync("python3", ["-I", `${root}scripts/motion/sheet.py`, `${root}${out}/${id}.jpg`, String(times.length + 2), ...files], { stdio: "inherit" });
}
await browser.close();
console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
