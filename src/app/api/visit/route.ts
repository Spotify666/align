import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { cleanBeacon, isBot, LIMITS, placeName, readAgent } from "@/lib/visit-shared";

export const runtime = "nodejs";

// A short burst limit per IP on this instance (the database also limits new visits per IP).
const recent = new Map<string, { n: number; since: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const r = recent.get(ip);
  if (!r || now - r.since > 60_000) {
    if (recent.size > 5000) recent.clear();
    recent.set(ip, { n: 1, since: now });
    return false;
  }
  return ++r.n > 30;
}

const done = () => new NextResponse(null, { status: 204 });

// The visitor log (see src/lib/visit.ts). Drops bots, adds the place and IP the host
// reports, and stores the visit. Always answers 204, so a bot learns nothing.
export async function POST(req: NextRequest) {
  const h = req.headers;
  const ua = h.get("user-agent");
  if (isBot(ua)) return done();
  // Only the site's own pages send visits.
  const origin = h.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== h.get("host")) return done();
    } catch {
      return done();
    }
  }
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin") return done();
  // Only the live site is logged (not previews or a laptop), unless asked to print instead.
  const print = process.env.VISITS_PRINT === "1";
  if (process.env.VERCEL_ENV !== "production" && !print) return done();

  const raw = await req.text();
  if (raw.length > LIMITS.body) return done();
  let beacon;
  try {
    beacon = cleanBeacon(JSON.parse(raw));
  } catch {
    return done();
  }
  if (!beacon) return done();

  const ip = (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null;
  if (ip && tooMany(ip)) return done();
  const agent = readAgent(ua!, { model: beacon.m, platformVersion: beacon.pv });
  const row = {
    p_session: beacon.s,
    p_visitor: beacon.v,
    p_active_ms: beacon.a,
    p_ip: ip,
    p_country: h.get("x-vercel-ip-country") ?? null,
    p_region: placeName(h.get("x-vercel-ip-country-region")) ?? null,
    p_city: placeName(h.get("x-vercel-ip-city")) ?? null,
    p_device: agent.device,
    p_os: agent.os,
    p_browser: agent.browser,
    p_screen: beacon.sc ?? null,
    p_lang: beacon.l ?? null,
    p_referrer: beacon.r ?? null,
    p_paths: beacon.p,
    p_events: beacon.e,
  };
  if (print) {
    console.info(`[align:visit] ${JSON.stringify(row)}`);
    return done();
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_visit`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[align:visit] ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.error(`[align:visit] ${e instanceof Error ? e.message : String(e)}`);
  }
  return done();
}
