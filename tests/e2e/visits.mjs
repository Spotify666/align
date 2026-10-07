// End-to-end check of the visitor log in Chromium.
//   node tests/e2e/visits.mjs <baseUrl> <serverLog>
// Run the server with VISITS_PRINT=1 (it prints each visit to its log instead of storing it).
// 1. An automated browser (as Playwright is by default) sends nothing.
// 2. A person's phone sends nothing until they touch the page, then the whole visit:
//    pages, taps, the analysis they tried, time spent.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const [, , base, log] = process.argv;
// The visits the server received for a session, oldest first.
const printed = (s) =>
  readFileSync(log, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("[align:visit] {"))
    .map((l) => JSON.parse(l.slice(14)))
    .filter((r) => r.p_session === s);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const beacons = (page) => {
  const sent = [];
  page.on("request", (r) => r.url().endsWith("/api/visit") && sent.push(r));
  return sent;
};
const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

// 1. Automated browser.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const sent = beacons(page);
  await page.goto(base + "/home");
  await page.mouse.move(10, 10);
  await page.mouse.move(200, 300);
  await page.mouse.click(200, 300);
  await page.waitForTimeout(500);
  await hide(page);
  await page.waitForTimeout(500);
  check(sent.length === 0, `automated browser: nothing sent (${sent.length})`);
  await ctx.close();
}

// 2. A person on a phone.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ANDROID, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
  const page = await ctx.newPage();
  const sent = beacons(page);
  await page.goto(base + "/home");
  await page.waitForTimeout(1500);
  check(sent.length === 0, "nothing sent before the person does anything");
  await page.locator("h1, h2").first().tap();
  await page.waitForTimeout(300);
  check(sent.length === 1, `first touch sends the visit (${sent.length})`);
  await page.locator('nav[aria-label=Tabs] a[href="/analyse"]').tap();
  await page.waitForURL(/\/analyse/);
  await page.getByLabel(/Analyse my movement on this device/).check();
  await page.locator("input[type=file]").first().setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await page.waitForTimeout(6000);
  await hide(page);
  await page.waitForTimeout(500);
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("align:visit")).s);
  const rows = printed(session);
  const last = rows[rows.length - 1] ?? {};
  console.log(JSON.stringify(last, null, 1));
  check(rows.length === sent.length, `every beacon reached the server (${rows.length} of ${sent.length})`);
  check(last.p_device === "Phone · SM-S911B" && last.p_os === "Android 14" && last.p_browser === "Samsung Internet 26", "device, OS and browser");
  check(last.p_paths?.join(" ") === "/home /analyse", `pages in order (${last.p_paths})`);
  const kinds = (last.p_events ?? []).map((e) => `${e.k}${e.d ? `:${e.d}` : ""}`);
  check(kinds.some((k) => k.startsWith("tap:")), "taps recorded");
  check(kinds.includes("analyse:unsupported file"), "analysis tried recorded");
  check(kinds.includes("failed:Unsupported file"), "failure recorded");
  check(last.p_active_ms >= 4000 && last.p_active_ms <= 15000, `time spent counted (${last.p_active_ms} ms)`);
  check(new Set(rows.map((r) => `${r.p_session} ${r.p_visitor}`)).size === 1, "one visit, one visitor");
  // A reload in the same tab continues the visit; the owner's opt-out stops it.
  const n = printed(session).length;
  await page.reload();
  await page.locator("h1, h2").first().tap();
  await page.waitForTimeout(500);
  check(printed(session).length > n, "a reload continues the same visit");
  await page.evaluate(() => localStorage.setItem("align:visits", "off"));
  await page.reload();
  await page.waitForTimeout(500);
  const before = sent.length;
  await page.locator("h1, h2").first().tap();
  await page.waitForTimeout(300);
  await hide(page);
  await page.waitForTimeout(300);
  check(sent.length === before, "opted-out browser sends nothing");
  await ctx.close();
}

// 3. The route: bots and other sites get nothing stored; a person's visit gets the host's place.
{
  const id = crypto.randomUUID();
  const body = JSON.stringify({ s: id, v: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", a: 5000, p: ["/home"], e: [{ t: 1, k: "page", d: "/home" }] });
  const post = (headers) => fetch(base + "/api/visit", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
  const r1 = await post({ "user-agent": "curl/8.4.0" });
  const r2 = await post({ "user-agent": ANDROID, origin: "https://evil.example" });
  const r3 = await post({ "user-agent": ANDROID, "x-real-ip": "203.0.113.7", "x-vercel-ip-country": "IN", "x-vercel-ip-country-region": "MH", "x-vercel-ip-city": "Navi%20Mumbai" });
  check([r1.status, r2.status, r3.status].every((s) => s === 204), "route always answers 204");
  await new Promise((r) => setTimeout(r, 300));
  const got = printed(id);
  check(got.length === 1, `only the person's visit stored (${got.length})`);
  check(got[0]?.p_ip === "203.0.113.7" && got[0]?.p_city === "Navi Mumbai" && got[0]?.p_region === "MH" && got[0]?.p_country === "IN", "place and IP from the host");
}

await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
