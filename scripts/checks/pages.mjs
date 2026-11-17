// The page checks every change to a screen must pass (see .claude/skills/quality-bar):
//   npm run build && npm run check:pages
// Opens every page in Chromium at phone width, in the dark and the daylight theme, with every
// closed section opened, and fails (exit 1) on any of:
//   - an accessibility violation (axe-core)
//   - sideways page scroll
//   - a control under 44 px (links inside running text are exempt, as WCAG 2.5.8 allows)
//   - a page error or console error
//   - more or fewer than one h1
//   - an internal link that doesn't answer
//   - a paragraph of 30 words or more showing when the page opens (keep it short; <Hold> the rest)
// The database is never called: pages that draw from it get one sample answer, the same on
// every machine (see `database` below).
// With TIMING=1 it also prints load numbers at 4× CPU slowdown (largest paint, blocking time,
// layout shift, bytes); those are reported, not gated, because they vary between machines.
//
// It starts `next start` itself on PORT (3111) unless BASE points at a running server.
// PAGES=/a,/b limits the pages. A page added to src/app must be added to pages-list.mjs
// (tests/standards.test.ts fails otherwise).

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = await import("playwright").catch(() => import(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright/index.mjs"));
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

import { PAGES } from "./pages-list.mjs";
const pages = process.env.PAGES ? process.env.PAGES.split(",") : PAGES;
const port = process.env.PORT ?? "3111";
const base = process.env.BASE ?? `http://localhost:${port}`;
const timing = !!process.env.TIMING;
const SECTIONS = ["Evidence", "Training", "Comparison", "Progress", "Technical details"];

let server = null;
if (!process.env.BASE) {
  server = spawn("npx", ["next", "start", "-p", port], { stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    if (await fetch(base).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
const stop = () => {
  if (server) try { process.kill(-server.pid); } catch {}
};

// The check never calls the live database: it would see different things on different machines
// (a sandbox can't reach it, CI can) and would write test visits into the visitor log. Pages
// that draw from it get the same sample answer everywhere, so their tables are really checked.
const TOTALS = { visits: 12, visitors: 7, median_ms: 95000 };
const LIST = (k) => [{ k, n: 5 }, { k: "Other", n: 2 }];
const OVERVIEW = {
  day: TOTALS, week: TOTALS, month: TOTALS, analyses: 9,
  lists: { countries: LIST("India"), devices: LIST("Phone"), systems: LIST("Android"), browsers: LIST("Chrome"), sources: LIST("Direct"), pages: LIST("/check"), results: LIST("valid"), failures: LIST("too short"), taps: LIST("Check your shot") },
};
const database = (route) => {
  const url = route.request().url();
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (url.includes("/rpc/visits_overview")) return json(OVERVIEW);
  if (url.includes("/auth/")) return json({ message: "not signed in" }, 401);
  return json([]);
};

const problems = [];
const links = new Set();
const rows = [];
const browser = await chromium.launch();
try {
  for (const theme of ["dark", "light"]) {
    for (const path of pages) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await ctx.route(/supabase\.co/, database);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(`page error: ${e.message.slice(0, 140)}`));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_CERT/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 140)}`));
      let load = null;
      if (timing && theme === "dark") {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await cdp.send("Network.enable");
        load = { bytes: 0 };
        cdp.on("Network.loadingFinished", (e) => (load.bytes += e.encodedDataLength));
        await page.addInitScript(() => {
          window.__lcp = 0; window.__cls = 0; window.__tbt = 0;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
        });
      }
      const response = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
      await page.waitForTimeout(1200);
      if (!response || response.status() >= 400) problems.push(`${path}: answered ${response?.status() ?? "nothing"}`);
      if (theme === "light") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      if (load) {
        const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), tbt: Math.round(window.__tbt), cls: +window.__cls.toFixed(3) }));
        rows.push(`${path} | ${m.lcp} ms | ${m.tbt} ms | ${m.cls} | ${Math.round(load.bytes / 1024)} KB`);
      }
      // What a person meets on arrival, then everything behind a closed section.
      const read = () =>
        page.evaluate(() => {
          const small = [...document.querySelectorAll("a,button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],summary")].filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("svg")) return false;
            if (el.type === "checkbox" || el.type === "radio" || el.type === "file") return false;
            const text = el.closest("p,li,dd,td,label");
            if (el.tagName === "A" && cs.display === "inline" && text && (text.textContent || "").trim().length > (el.textContent || "").trim().length + 15) return false;
            return r.height < 44;
          });
          return {
            wide: document.documentElement.scrollWidth > innerWidth + 1,
            h1: document.querySelectorAll("h1").length,
            small: small.map((el) => `${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)} (${Math.round(el.getBoundingClientRect().height)} px)`),
            links: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href").split("#")[0].split("?")[0]),
          };
        });
      const open = async () => {
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
        await page.waitForTimeout(150);
      };
      const check = async (where) => {
        const m = await read();
        m.links.forEach((l) => links.add(l));
        if (m.wide) problems.push(`${theme} ${path}${where}: the page scrolls sideways`);
        if (m.h1 !== 1) problems.push(`${theme} ${path}${where}: ${m.h1} h1 headings (one expected)`);
        for (const s of new Set(m.small)) problems.push(`${theme} ${path}${where}: control under 44 px: ${s}`);
        await page.addScriptTag({ content: axe });
        const found = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes[0].target.join(" ")}`));
        for (const v of found) problems.push(`${theme} ${path}${where}: ${v}`);
      };
      // Short on the page (the owner, 2026-11-17): no paragraph of 30 words or more shows on
      // arrival. The full text belongs behind a long press (components/common/hold.tsx).
      const long = await page.evaluate(() =>
        [...document.querySelectorAll("main p, main li, main dd, main figcaption, main td")]
          .filter((e) => e.offsetParent !== null && !e.closest("details:not([open]), dialog, .hold") && !e.querySelector("p, li, dd, td"))
          .map((e) => (e.innerText || "").trim())
          .filter((t) => t.split(/\s+/).length >= 30)
          .map((t) => `${t.split(/\s+/).length} words: "${t.slice(0, 60)}…"`),
      );
      // A print layout is paper: nothing to press there, so the full text stays.
      if (!path.endsWith("/print")) for (const l of long) problems.push(`${theme} ${path}: a long paragraph on arrival (${l}); put the full text behind a <Hold>`);
      await open();
      await check("");
      // A report's five sections are buttons, each opened in turn.
      if (/^\/sample\/[^/]+$/.test(path)) {
        for (const name of SECTIONS) {
          const tab = page.getByRole("button", { name, exact: true });
          if (!(await tab.count())) continue;
          await tab.first().click();
          await page.waitForTimeout(500);
          await open();
          await check(` → ${name}`);
        }
      }
      for (const e of new Set(errors)) problems.push(`${theme} ${path}: ${e}`);
      await ctx.close();
    }
  }
  const ctx = await browser.newContext();
  for (const l of [...links].filter((l) => l && !l.startsWith("/api") && !l.startsWith("/auth"))) {
    const r = await ctx.request.get(base + l, { maxRedirects: 5 }).catch(() => null);
    if (!r || r.status() >= 400) problems.push(`link ${l}: answered ${r?.status() ?? "nothing"}`);
  }
} finally {
  await browser.close();
  stop();
}

if (rows.length) console.log(["page | largest paint | blocking | layout shift | bytes", ...rows].join("\n"));
console.log(`${pages.length} pages, 2 themes, ${links.size} internal links.`);
if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"}:\n- ${[...new Set(problems)].join("\n- ")}`);
  process.exit(1);
}
console.log("No problems.");
