// Captures the pictures of the screen map (/design) from the running app:
//   npm run build && npx next start -p 3100
//   node scripts/design/capture.mjs            # the pages anyone can open
//   node scripts/design/capture-accounts.mjs   # coach, player, admin and two phones (network faked)
//   node scripts/design/pdf.mjs                # the PDF, from /design/print
// Writes public/design/screens/<id>.jpg (ids: src/lib/screen-map.ts) at 540 px wide.
//
// PROFILE_DIR: a browser profile to use. Sessions and Progress show what that profile has
// saved; with a fresh profile they show their empty states. Playwright comes from the global
// install (PLAYWRIGHT_PATH overrides). Third-party pictures (the coaching video's thumbnail)
// are blocked, so no one else's media ends up in a capture.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
export const BASE = process.env.BASE ?? "http://localhost:3100";
export const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/design/screens");
export const VIEWPORT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 540 / 390 };
export const PROFILE = process.env.PROFILE_DIR ?? join(process.env.TMPDIR ?? "/tmp", "aline-design-profile");
mkdirSync(OUT, { recursive: true });

export const save = async (page, id) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${id}.jpg`), type: "jpeg", quality: 72 });
  console.log("ok", id);
};
/** The app scrolls smoothly; a capture must be where it was sent, at once. */
export const calm = (page) => page.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
export const blockThirdParty = (ctx) => ctx.route(/ytimg\.com|youtube\.com|youtube-nocookie\.com/, (r) => r.abort());

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ctx = await chromium.launchPersistentContext(PROFILE, { ...VIEWPORT, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], permissions: ["camera"] });
  await blockThirdParty(ctx);
  const p = ctx.pages()[0] ?? (await ctx.newPage());
  const go = async (path, wait = 900) => {
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await calm(p);
    await p.waitForTimeout(wait);
  };
  /** Brings the first element with this text to the top of the screen, under the header. */
  const toText = async (text, under = 70) => {
    await p.getByText(text, { exact: false }).first().evaluate((e) => e.scrollIntoView({ block: "start" }));
    await p.evaluate((y) => window.scrollBy(0, -y), under);
  };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      console.log("FAILED", name, String(e.message).split("\n")[0]);
      process.exitCode = 1;
    }
  };

  await step("landing", async () => {
    await go("/", 1500);
    await save(p, "landing-1");
    await toText("A short answer, then the evidence.", 40);
    await save(p, "landing-2");
    await toText("Three levels, one engine.", 40);
    await save(p, "landing-3");
    await toText("What is true today.", 40);
    await save(p, "landing-4");
  });
  await step("menu", async () => {
    await go("/home");
    await p.locator("header button[aria-expanded]").first().click();
    await save(p, "menu");
  });
  await step("home", async () => {
    await go("/home", 1500);
    await save(p, "home");
  });
  await step("check", async () => {
    await go("/check", 1200);
    await save(p, "check-1");
    const focus = p.getByText("Focus areas", { exact: false }).first();
    await focus.click();
    await focus.evaluate((e) => e.scrollIntoView({ block: "start" }));
    await p.evaluate(() => window.scrollBy(0, -80));
    await save(p, "check-2");
    await go("/check", 1200);
    await toText("Upload a video", 110);
    await save(p, "check-3");
    const film = p.locator("summary", { hasText: "How to film" }).first();
    await film.click();
    await film.evaluate((e) => e.scrollIntoView({ block: "start" }));
    await p.evaluate(() => window.scrollBy(0, -70));
    await save(p, "check-film");
  });
  await step("lineup", async () => {
    await go("/check", 1200);
    await p.getByText("Line up the camera first").first().click();
    await p.waitForTimeout(4000);
    await save(p, "lineup");
  });
  await step("dual", async () => {
    await go("/check", 1200);
    await p.getByText("Dual-angle capture").first().click();
    await p.waitForTimeout(800);
    await save(p, "dual-1");
    await p.evaluate(() => window.scrollBy(0, 700));
    await save(p, "dual-2");
  });
  await step("pair", async () => {
    await go("/check/pair");
    await save(p, "pair-1");
  });
  await step("report", async () => {
    await go("/sample/valid_ffd", 1500);
    await save(p, "report-1");
    for (const [tab, id] of [["Evidence", "report-evidence"], ["Training", "report-training"], ["Comparison", "report-comparison"], ["Progress", "report-progress"], ["Technical details", "report-technical"]]) {
      await go("/sample/valid_ffd", 1200);
      await p.getByRole("button", { name: tab, exact: true }).first().click();
      await p.waitForTimeout(1500);
      await save(p, id);
    }
  });
  for (const key of ["ffd_as_bfd", "pull", "occluded", "photo", "capture_failed"]) {
    await step(key, async () => {
      await go(`/sample/${key}`, 1500);
      await save(p, `sample-${key}`);
    });
  }
  await step("samples", async () => {
    await go("/sample");
    await save(p, "samples");
  });
  await step("print", async () => {
    await go("/sample/valid_ffd/print", 2000);
    await save(p, "print-1");
  });
  await step("sessions", async () => {
    await go("/sessions", 2500);
    await save(p, "sessions");
  });
  await step("progress", async () => {
    await go("/progress", 2500);
    await save(p, "progress-1");
    await p.evaluate(() => window.scrollBy(0, 700));
    await save(p, "progress-2");
  });
  await step("profile", async () => {
    await go("/profile", 1500);
    await save(p, "profile-1");
    await toText("Analysis level", 90);
    await save(p, "profile-2");
    await toText("Account and sharing", 90);
    await save(p, "profile-3");
  });
  await step("library", async () => {
    await go("/library", 9500);
    await save(p, "library");
  });
  for (const [path, id] of [["/guide", "guide-1"], ["/science", "science-1"], ["/privacy", "privacy"], ["/signin", "signin"], ["/angles", "angles"]]) {
    await step(id, async () => {
      await go(path, 1500);
      await save(p, id);
    });
  }
  await step("coach signed out", async () => {
    await go("/coach", 2500);
    await save(p, "coach-out");
  });
  await ctx.close();
}
