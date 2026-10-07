// The visitor log's shared rules: what a browser sends, how the server checks it, and how a
// user agent reads as device, OS and browser. Used by the page (src/lib/visit.ts) and the
// route (/api/visit).

export type VisitEvent = { t: number; k: string; d?: string };

/** What the page sends: the whole visit so far (a beacon can be lost, so each one is complete). */
export interface VisitBeacon {
  s: string; // this tab's visit
  v: string; // this browser (anonymous)
  a: number; // time spent, ms (visible and in use)
  p: string[]; // pages, in order
  e: VisitEvent[]; // what they did
  r?: string; // referring site (host only)
  l?: string; // language
  sc?: string; // screen size
  m?: string; // device model (client hint)
  pv?: string; // OS version (client hint)
}

export const LIMITS = { paths: 40, events: 120, body: 16_000 };

/**
 * Crawlers, link previews, monitors, scripts and automated browsers. Real in-app browsers
 * (Instagram, Facebook, LinkedIn, Pinterest) are people and are kept.
 */
const BOT =
  /bot\b|bot\/|robot|crawl|spider|slurp|scrape|archiver|headless|phantom|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|preview|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegrambot|discordbot|skypeuri|embedly|quora link|vkshare|w3c_validator|curl|wget|python|httpclient|http-client|okhttp|go-http|java\/|axios|node-fetch|undici|libwww|perl|ruby|php\/|postman|insomnia|vercel|semrush|ahrefs|mj12|dotbot|petalbot|yandexbot|yandeximages|bingpreview|duckduckbot|duckassistbot|applebot|googlebot|google-|googleother|adsbot|mediapartners|gptbot|chatgpt|oai-search|claude|anthropic|perplexity|bytespider|ccbot|amazonbot|dataprovider|cloudflare|zgrab|masscan|nmap|nikto|censys|expanse/i;

/** True for anything that isn't a person's browser. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20 || ua.length > 600) return true;
  if (!/^Mozilla\/5\.0 /.test(ua)) return true;
  // "CUBOT" is a phone maker, not a bot.
  return BOT.test(ua.replace(/cubot/gi, ""));
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");

/** A beacon checked and trimmed, or null if it isn't one. */
export function cleanBeacon(raw: unknown): VisitBeacon | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id = /^[A-Za-z0-9-]{8,64}$/;
  if (typeof b.s !== "string" || !id.test(b.s) || typeof b.v !== "string" || !id.test(b.v)) return null;
  const a = typeof b.a === "number" && Number.isFinite(b.a) ? Math.max(0, Math.min(Math.round(b.a), 30 * 60 * 1000)) : 0;
  const p = (Array.isArray(b.p) ? b.p : [])
    .filter((x): x is string => typeof x === "string" && x.startsWith("/") && !x.startsWith("//"))
    .slice(0, LIMITS.paths)
    .map((x) => clip(x.split(/[?#]/)[0], 120));
  const e = (Array.isArray(b.e) ? b.e : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, LIMITS.events)
    .map((x) => {
      const t = typeof x.t === "number" && Number.isFinite(x.t) ? Math.max(0, Math.round(x.t)) : 0;
      const k = clip(x.k, 16);
      const d = clip(x.d, 80);
      return d ? { t, k, d } : { t, k };
    })
    .filter((x) => /^[a-z]{2,16}$/.test(x.k));
  const out: VisitBeacon = { s: b.s, v: b.v, a, p, e };
  const r = clip(b.r, 120);
  if (r && /^[a-z0-9.-]+$/i.test(r)) out.r = r.toLowerCase();
  const l = clip(b.l, 20);
  if (l) out.l = l;
  const sc = clip(b.sc, 20);
  if (/^\d{2,5}x\d{2,5}$/.test(sc)) out.sc = sc;
  const m = clip(b.m, 60);
  if (m) out.m = m;
  const pv = clip(b.pv, 20);
  if (/^[\d.]+$/.test(pv)) out.pv = pv;
  return out;
}

export interface Agent {
  device: string; // "Phone · Pixel 7", "Tablet · iPad", "Desktop · Mac"
  os: string; // "Android 14", "iOS 17.5", "Windows 11", "macOS"
  browser: string; // "Chrome 129", "Samsung Internet 26", "Instagram"
}

/** Device, OS and browser from a user agent, refined by the browser's own hints when sent. */
export function readAgent(ua: string, hints: { model?: string; platformVersion?: string } = {}): Agent {
  let os = "Other";
  let kind = /Mobi|iPhone|iPod/.test(ua) ? "Phone" : /iPad|Tablet|Android/.test(ua) ? "Tablet" : "Desktop";
  let model = "";
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  const ios = ua.match(/(?:iPhone|CPU) OS (\d+)[._](\d+)/);
  if (android) {
    os = `Android ${android[1]}`;
    // "Android 13; SM-S911B Build/…" or "Android 13; Pixel 7)"; reduced agents say only "K".
    const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/);
    if (m && m[1] && m[1] !== "K" && !/^[a-z]{2}(-[a-z]{2})?$/i.test(m[1])) model = m[1].trim();
  } else if (/iPhone|iPod/.test(ua)) {
    os = ios ? `iOS ${ios[1]}.${ios[2]}` : "iOS";
    model = "iPhone";
  } else if (/iPad/.test(ua)) {
    os = ios ? `iPadOS ${ios[1]}.${ios[2]}` : "iPadOS";
    model = "iPad";
    kind = "Tablet";
  } else if (/CrOS/.test(ua)) {
    os = "ChromeOS";
    model = "Chromebook";
  } else if (/Windows NT 10/.test(ua)) {
    // Windows 11 still says NT 10.0; its hint says 13 or higher.
    const v = hints.platformVersion ? parseInt(hints.platformVersion, 10) : NaN;
    os = Number.isFinite(v) ? (v >= 13 ? "Windows 11" : "Windows 10") : "Windows";
    model = "PC";
  } else if (/Windows/.test(ua)) {
    os = "Windows";
    model = "PC";
  } else if (/Mac OS X/.test(ua)) {
    os = hints.platformVersion ? `macOS ${hints.platformVersion.split(".").slice(0, 2).join(".")}` : "macOS";
    model = "Mac";
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }
  if (android && hints.platformVersion) os = `Android ${hints.platformVersion.split(".")[0]}`;
  if (hints.model) model = hints.model;

  const browsers: Array<[RegExp, string]> = [
    [/Instagram/, "Instagram"],
    [/FBAN|FBAV|FB_IAB/, "Facebook"],
    [/LinkedInApp/, "LinkedIn"],
    [/Snapchat/, "Snapchat"],
    [/\bLine\//, "LINE"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/EdgA?\/(\d+)|EdgiOS\/(\d+)/, "Edge"],
    [/OPR\/(\d+)|OPT\/(\d+)|Opera/, "Opera"],
    [/YaBrowser\/(\d+)/, "Yandex"],
    [/UCBrowser\/(\d+)/, "UC Browser"],
    [/MiuiBrowser\/(\d+)/, "Mi Browser"],
    [/Firefox\/(\d+)|FxiOS\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/; wv\)/, "Android app"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari/, "Safari"],
  ];
  let browser = "Other";
  for (const [re, name] of browsers) {
    const m = ua.match(re);
    if (m) {
      const v = m.slice(1).find(Boolean);
      browser = v ? `${name} ${v}` : name;
      break;
    }
  }
  return { device: model ? `${kind} · ${model}` : kind, os, browser };
}

/** A place name from a header the host sends URL-encoded ("S%C3%A3o%20Paulo"). */
export function placeName(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  try {
    return decodeURIComponent(v).slice(0, 80) || undefined;
  } catch {
    return v.slice(0, 80);
  }
}
