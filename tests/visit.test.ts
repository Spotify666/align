import { describe, expect, it } from "vitest";
import { cleanBeacon, isBot, placeName, readAgent } from "@/lib/visit-shared";

const UA = {
  pixel: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  instagram:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 349.0.0.39.106 Android",
  telegram:
    "Mozilla/5.0 (Linux; Android 12; RMX3085 Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Telegram-Android/11.2.2 (Realme RMX3085; Android 12; SDK 31; AVERAGE)",
  cubot: "Mozilla/5.0 (Linux; Android 12; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.65",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
};

const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "WhatsApp/2.23.20.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "TelegramBot (like TwitterBot)",
  "curl/8.4.0",
  "python-requests/2.31.0",
  "Go-http-client/1.1",
  "node-fetch/1.0",
  "",
  null,
];

describe("visitor log: bots", () => {
  it("drops crawlers, link previews, scripts and automated browsers", () => {
    for (const ua of BOTS) expect(isBot(ua), String(ua)).toBe(true);
  });
  it("keeps people, including in-app browsers and a CUBOT phone", () => {
    for (const [name, ua] of Object.entries(UA)) expect(isBot(ua), name).toBe(false);
  });
});

describe("visitor log: device, OS and browser", () => {
  it("reads phones", () => {
    expect(readAgent(UA.samsung)).toEqual({ device: "Phone · SM-S911B", os: "Android 14", browser: "Samsung Internet 26" });
    expect(readAgent(UA.iphone)).toEqual({ device: "Phone · iPhone", os: "iOS 17.5", browser: "Safari 17" });
    expect(readAgent(UA.instagram)).toEqual({ device: "Phone · Pixel 7", os: "Android 13", browser: "Instagram" });
  });
  it("uses the browser's own hints when a reduced agent hides the model and version", () => {
    expect(readAgent(UA.pixel)).toEqual({ device: "Phone", os: "Android 10", browser: "Chrome 129" });
    expect(readAgent(UA.pixel, { model: "Pixel 8", platformVersion: "15.0.0" })).toEqual({ device: "Phone · Pixel 8", os: "Android 15", browser: "Chrome 129" });
    expect(readAgent(UA.windows, { platformVersion: "15.0.0" }).os).toBe("Windows 11");
    expect(readAgent(UA.windows, { platformVersion: "10.0.0" }).os).toBe("Windows 10");
  });
  it("reads tablets and computers", () => {
    expect(readAgent(UA.ipad)).toEqual({ device: "Tablet · iPad", os: "iPadOS 16.6", browser: "Safari 16" });
    expect(readAgent(UA.edge).browser).toBe("Edge 129");
    expect(readAgent(UA.mac)).toEqual({ device: "Desktop · Mac", os: "macOS", browser: "Safari 17" });
    expect(readAgent(UA.firefox)).toEqual({ device: "Desktop", os: "Linux", browser: "Firefox 131" });
  });
});

describe("visitor log: what a page may send", () => {
  const ok = { s: "5f0c2a8e-1b2c-4d5e-8f90-123456789abc", v: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", a: 1234.6, p: ["/analyse?x=1", "//evil", "/report/abc#top"], e: [{ t: 10, k: "page", d: "/analyse" }, { t: 20, k: "BAD KIND" }, { t: -5, k: "tap", d: "Choose a video" }] };
  it("keeps a good beacon, trimmed", () => {
    const b = cleanBeacon({ ...ok, r: "L.Instagram.com", sc: "412x915", pv: "14.0.0", m: "Pixel 8", l: "en-IN" })!;
    expect(b.a).toBe(1235);
    expect(b.p).toEqual(["/analyse", "/report/abc"]);
    expect(b.e).toEqual([{ t: 10, k: "page", d: "/analyse" }, { t: 0, k: "tap", d: "Choose a video" }]);
    expect(b.r).toBe("l.instagram.com");
    expect(b.sc).toBe("412x915");
  });
  it("rejects anything else", () => {
    expect(cleanBeacon(null)).toBeNull();
    expect(cleanBeacon({ ...ok, s: "x" })).toBeNull();
    expect(cleanBeacon({ ...ok, v: "<script>" })).toBeNull();
    expect(cleanBeacon({ ...ok, a: 1e12 })!.a).toBe(30 * 60 * 1000);
    expect(cleanBeacon({ ...ok, sc: "big", r: "http://x/", pv: "abc" })).toEqual(cleanBeacon(ok));
  });
  it("reads the host's place headers", () => {
    expect(placeName("S%C3%A3o%20Paulo")).toBe("São Paulo");
    expect(placeName("Mumbai")).toBe("Mumbai");
    expect(placeName("%E0%A4")).toBe("%E0%A4");
    expect(placeName(null)).toBeUndefined();
  });
});
