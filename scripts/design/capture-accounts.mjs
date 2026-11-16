// The screen map's pictures that need an account or a second phone. Nothing here talks to the
// real database: every request to it is answered by this script (made-up players "Riya" and
// "Arjun", a made-up reference "Test Player"), and the two phones are two tabs joined by the
// browser's own channel (?transport=local). See capture.mjs for how to run.
//
// "From your coach" and "Record a permission" need one saved shot in the profile (PROFILE_DIR);
// without one they are skipped and say so.

import { BASE, PROFILE, VIEWPORT, blockThirdParty, calm, save } from "./capture.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const DB = "https://uwhgahpsivwkvxmbchmk.supabase.co/**";

function signedIn(id, email) {
  const now = Math.floor(Date.now() / 1000);
  const user = { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = `x.${Buffer.from(JSON.stringify({ sub: id, exp: now + 3600 })).toString("base64url")}.y`;
  const session = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user };
  const cookie = { name: "sb-uwhgahpsivwkvxmbchmk-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, domain: new URL(BASE).hostname, path: "/" };
  return { user, cookie };
}
const answer = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const top = (locator, under = 80) => locator.evaluate((e, y) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -y); }, under);
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log("FAILED", name, String(e.message).split("\n")[0]);
    process.exitCode = 1;
  }
};
/** The newest saved shot in this profile, marked as saved to the account; null when there is none. */
const newestShot = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("align");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("analyses")) return resolve(null);
          const tx = db.transaction("analyses", "readwrite");
          const store = tx.objectStore("analyses");
          const all = store.getAll();
          all.onsuccess = () => {
            const a = all.result.sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
            if (!a) return resolve(null);
            a.cloud = { syncedAt: new Date().toISOString() };
            store.put(a);
            tx.oncomplete = () => resolve(a.id);
          };
        };
      }),
  );

// ---------- The coach ----------
await step("coach", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(VIEWPORT);
  const { user, cookie } = signedIn("c0000000-0000-0000-0000-000000000000", "coach@example.com");
  await ctx.addCookies([cookie]);
  const analyses = [
    { id: "x1", owner_id: "a1", title: "Net session", recorded_at: "2026-11-10T10:00:00Z", status: "valid", observed_label: null, capture_confidence: 0.92, requested_shot: "front_foot_defence" },
    { id: "x2", owner_id: "a2", title: "Match prep", recorded_at: "2026-11-09T10:00:00Z", status: "uncertain_shot", observed_label: null, capture_confidence: 0.41, requested_shot: "front_foot_defence" },
    { id: "x3", owner_id: "a1", title: "Old one", recorded_at: "2026-11-01T10:00:00Z", status: "valid", observed_label: null, capture_confidence: 0.3, requested_shot: "front_foot_defence" },
  ];
  let assessments = [{ id: "as1", analysis_id: "x3", coach_id: user.id, agrees: "agree", focus: "alignment", notes: "ok", reviewed_at: "2026-11-02", updated_at: "2026-11-02" }];
  const squads = [];
  const members = [];
  const assignments = [];
  await ctx.route(DB, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const post = req.method() === "POST";
    if (path.endsWith("/auth/v1/user")) return answer(route, user);
    if (path.endsWith("/coach_links")) return answer(route, [{ player_id: "a1", status: "active" }, { player_id: "a2", status: "active" }]);
    if (path.endsWith("/profiles")) return answer(route, req.method() === "GET" ? [{ id: "a1", display_name: "Riya" }, { id: "a2", display_name: "Arjun" }] : []);
    if (path.endsWith("/squads")) { if (post) { squads.push({ id: "sq1", name: req.postDataJSON().name }); return answer(route, [], 201); } return answer(route, squads); }
    if (path.endsWith("/squad_members")) { if (post) { members.push(req.postDataJSON()); return answer(route, [], 201); } return answer(route, members); }
    if (path.endsWith("/analyses")) return answer(route, analyses);
    if (path.endsWith("/coach_assessments")) {
      if (post) { const b = req.postDataJSON(); assessments = assessments.filter((a) => a.analysis_id !== b.analysis_id).concat([{ id: "n", ...b, updated_at: new Date().toISOString() }]); return answer(route, [], 201); }
      return answer(route, assessments);
    }
    if (path.endsWith("/assignments")) { if (post) { assignments.push({ id: `g${assignments.length}`, coach_id: user.id, status: "open", created_at: "x", updated_at: "x", ...req.postDataJSON() }); return answer(route, [], 201); } return answer(route, assignments); }
    if (path.endsWith("/audit_log")) return answer(route, [{ id: 1, action: "insert", subject_type: "coach_assessments", subject_id: "as1", subject_owner: "a1", detail: {}, created_at: "2026-11-02T10:00:00Z" }]);
    return answer(route, []);
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
  await calm(p);
  await p.waitForTimeout(800);
  await save(p, "coach-1");
  const queue = p.locator('section[aria-label="Review queue"] li.panel');
  await queue.first().locator("button").first().click();
  await p.getByRole("button", { name: "I disagree" }).click();
  await p.getByLabel("Main thing to work on").selectOption("footwork");
  await p.getByLabel("Your notes for the player").fill("Front foot short of the ball.");
  await top(p.getByRole("button", { name: "I agree" }), 140);
  await save(p, "coach-2");
  await p.getByRole("button", { name: "Save and mark reviewed" }).click();
  await p.waitForTimeout(800);
  await p.getByLabel("Squad name").fill("Under 15s");
  await p.getByRole("button", { name: "Add squad" }).click();
  await p.waitForTimeout(800);
  await p.locator('section[aria-label="Squads"] li.panel').first().getByRole("button", { name: "Riya" }).click();
  await p.waitForTimeout(800);
  await top(p.locator('section[aria-label="Squads"]'));
  await save(p, "coach-3");
  await browser.close();
});

// ---------- The player's view of the coach, and the admin's form ----------
await step("player and admin", async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, VIEWPORT);
  await blockThirdParty(ctx);
  const p = ctx.pages()[0] ?? (await ctx.newPage());
  await p.goto(`${BASE}/sessions`, { waitUntil: "networkidle" });
  await calm(p);
  const id = await newestShot(p);
  if (!id) {
    console.log("SKIPPED feedback, manage: no saved shot in this profile");
    process.exitCode = 1;
    return ctx.close();
  }
  const player = signedIn("a0000000-0000-0000-0000-000000000001", "player@example.com");
  const admin = signedIn("11111111-1111-1111-1111-111111111111", "admin@example.com");
  let who = player;
  const rows = [];
  await ctx.route(DB, async (route) => {
    const req = route.request();
    const url = req.url();
    const path = new URL(url).pathname;
    if (path.endsWith("/auth/v1/user")) return answer(route, who.user);
    if (path.endsWith("/coach_assessments")) return answer(route, [{ id: "as1", analysis_id: id, coach_id: "c0", agrees: "disagree", focus: "footwork", notes: "Front foot short of the ball.", reviewed_at: "x", updated_at: "x" }]);
    if (path.endsWith("/assignments")) return answer(route, [{ id: "g1", coach_id: "c0", player_id: who.user.id, analysis_id: id, focus: "footwork", drill: "Cone stride drill", retest_by: "2026-11-21", note: null, status: "open", created_at: "x", updated_at: "x" }]);
    if (url.includes("/rpc/is_site_admin")) return answer(route, who === admin);
    if (path.endsWith("/reference_shots")) return answer(route, rows);
    return answer(route, []);
  });

  await ctx.addCookies([player.cookie]);
  await p.goto(`${BASE}/report/${id}`, { waitUntil: "networkidle" });
  await calm(p);
  await p.waitForTimeout(1500);
  await top(p.locator('section[aria-labelledby="coach-fb-h"]'), 260);
  await save(p, "feedback");

  who = admin;
  await ctx.clearCookies();
  await ctx.addCookies([admin.cookie]);
  await p.goto(`${BASE}/library/manage`, { waitUntil: "networkidle" });
  await calm(p);
  await p.waitForTimeout(800);
  await p.getByLabel("Player's name").fill("Test Player");
  await p.getByLabel("The shot").selectOption({ index: 1 });
  await p.getByLabel("Where the recording came from").fill("Filmed for Aline by the player");
  await p.getByLabel("Until").fill("2027-12-31");
  await p.getByRole("radio", { name: "Signed", exact: true }).check();
  await p.getByLabel("The signed agreement").fill("Agreement 1, 2026-11-20");
  await top(p.locator("form"), 70);
  await save(p, "manage");
  await ctx.clearCookies();
  await ctx.close();
});

// ---------- Two phones (two tabs) ----------
await step("two phones", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(VIEWPORT);
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  await A.goto(`${BASE}/check/pair?transport=local`, { waitUntil: "networkidle" });
  await calm(A);
  await A.getByRole("radio", { name: "Side-on" }).click();
  await A.getByRole("button", { name: "Start a pairing" }).click();
  const code = (await A.locator("p.num.display").innerText()).trim();
  await B.goto(`${BASE}/check/pair?transport=local`, { waitUntil: "networkidle" });
  await calm(B);
  await B.getByRole("radio", { name: "From the bowler's end" }).click();
  await B.getByLabel("Code from the first phone").fill(code);
  await B.getByRole("button", { name: "Join" }).click();
  await A.getByText("A phone joined").waitFor({ timeout: 10000 });
  await A.getByRole("button", { name: "Same number: pair" }).click();
  await B.getByText("Paired with the other phone.").waitFor({ timeout: 10000 });
  await A.waitForTimeout(3000);
  await A.getByRole("button", { name: "Start countdown" }).click();
  await A.waitForTimeout(6500);
  await A.bringToFront();
  await A.evaluate(() => window.scrollTo(0, 0));
  await save(A, "pair-2");
  await browser.close();
});
