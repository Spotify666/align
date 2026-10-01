// Visual QA: screenshots of key pages across devices and themes, with a check for
// overlapping text boxes and horizontal overflow. Usage:
//   CHROMIUM_PATH=... node scripts/qa-screens.mjs http://localhost:3000 out/
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const [, , base = "http://localhost:3000", out = "qa"] = process.argv;
await mkdir(out, { recursive: true });
const PAGES = ["/", "/guide", "/analyse", "/sample/valid_ffd", "/sample/pull", "/sample/occluded", "/sample/front_on_ffd", "/sample/no_ball", "/sessions", "/progress", "/profile", "/coach", "/science", "/privacy", "/design-system"];
const DEVICES = [
  ["phone", { width: 390, height: 844 }, true],
  ["phone-landscape", { width: 844, height: 390 }, true],
  ["tablet", { width: 820, height: 1180 }, true],
  ["desktop", { width: 1440, height: 900 }, false],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const issues = [];
for (const theme of ["light", "dark"]) {
  for (const [name, viewport, mobile] of DEVICES) {
    if (theme === "dark" && name !== "phone" && name !== "desktop") continue;
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme: theme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => issues.push(`[${name}/${theme}] pageerror ${e.message}`));
    for (const p of PAGES) {
      await page.goto(base + p, { waitUntil: "load" });
      await page.waitForTimeout(700);
      const found = await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`horizontal overflow ${document.documentElement.scrollWidth}px`);
        const els = [...document.querySelectorAll("h1,h2,h3,p,li,a,button,span,label,dt,dd")].filter((e) => {
          const r = e.getBoundingClientRect();
          const st = getComputedStyle(e);
          const inClosed = e.closest("details:not([open])") && !e.closest("summary");
          return !inClosed && r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.opacity !== "0" && e.children.length === 0 && e.textContent.trim().length > 1;
        });
        const boxes = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
            const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (ix > 6 && iy > 6) {
              if (a.e.closest("nav[aria-label=Tabs]") || b.e.closest("nav[aria-label=Tabs]") || a.e.closest("header") || b.e.closest("header")) continue;
              out.push(`overlap "${a.e.textContent.trim().slice(0, 30)}" × "${b.e.textContent.trim().slice(0, 30)}"`);
              if (out.length > 6) return out;
            }
          }
        return out;
      });
      for (const f of found) issues.push(`[${name}/${theme}] ${p}: ${f}`);
      if (["/", "/analyse", "/sample/valid_ffd", "/guide"].includes(p) && (name === "phone" || name === "desktop" || name === "phone-landscape")) {
        await page.screenshot({ path: `${out}/${name}-${theme}${p.replaceAll("/", "_") || "_home"}.png`, fullPage: false });
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log(issues.length ? issues.join("\n") : "No overlaps or overflow found.");
