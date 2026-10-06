// Draw the app icons from the logo geometry (src/components/brand/logo-geometry.ts):
// favicon (SVG and ICO), apple-touch-icon, PWA icons (plain and maskable).
//   node scripts/brand-icons.mjs   (needs Chromium: CHROMIUM_PATH, and ImageMagick for the .ico)
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = readFileSync(new URL("../src/components/brand/logo-geometry.ts", import.meta.url), "utf8")
  .replace(/export type P = \[number, number\];/, "")
  .replace(/: P\[\]\[\]/g, "")
  .replace(/export /g, "");
const { MARK, LETTERS, LETTER_STROKE, VIEW } = new Function(`${src}; return { MARK, LETTERS, LETTER_STROKE, VIEW };`)();
const BG = "#1e1e1e";
const FG = "#fbfaf7";
const pts = (ps) => ps.map(([x, y]) => `${x},${y}`).join(" ");

/** A square icon: the mark centred at `scale` of the side, with or without the name. */
function icon({ side = 512, scale = 0.7, name = true, round = true }) {
  const w = side * scale;
  const k = w / VIEW.w;
  const h = VIEW.h * k;
  const tx = (side - w) / 2 - VIEW.x * k;
  const ty = (side - h) / 2 - VIEW.y * k;
  const letters = name
    ? `<g fill="none" stroke="${FG}" stroke-width="${LETTER_STROKE}" stroke-linejoin="bevel">${LETTERS.map((p) => `<polyline points="${pts(p)}"/>`).join("")}</g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}" height="${side}"><rect width="${side}" height="${side}" rx="${round ? side * 0.22 : 0}" fill="${BG}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})"><g fill="${FG}">${MARK.map((p) => `<polygon points="${pts(p)}"/>`).join("")}</g>${letters}</g></svg>`;
}

const pub = new URL("../public/", import.meta.url);
const app = new URL("../src/app/", import.meta.url);
const favicon = icon({ side: 64, scale: 0.8, name: false });
writeFileSync(new URL("icon.svg", pub), favicon);
writeFileSync(new URL("icon.svg", app), favicon);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
const png = async (svg, side, file) => {
  await page.setViewportSize({ width: side, height: side });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${side}" height="${side}"`)}</body>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: side, height: side } });
};
await png(icon({ name: true, round: false, scale: 0.72 }), 180, new URL("apple-touch-icon.png", pub).pathname);
await png(icon({ name: true, scale: 0.72 }), 192, new URL("icon-192.png", pub).pathname);
await png(icon({ name: true, scale: 0.72 }), 512, new URL("icon-512.png", pub).pathname);
// Maskable: full bleed, the mark inside the 80% safe circle.
await png(icon({ name: true, round: false, scale: 0.58 }), 512, new URL("icon-maskable-512.png", pub).pathname);
const tmp = mkdtempSync(join(tmpdir(), "ico-"));
for (const s of [16, 32, 48]) await png(icon({ side: 64, scale: 0.8, name: false }), s, join(tmp, `${s}.png`));
await browser.close();
execFileSync("convert", [16, 32, 48].map((s) => join(tmp, `${s}.png`)).concat(new URL("favicon.ico", app).pathname));
console.log("icons written");
