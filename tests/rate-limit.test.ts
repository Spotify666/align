import { describe, expect, it } from "vitest";
import { burstLimiter, callerIp, sameOrigin } from "@/lib/rate-limit";

describe("burstLimiter", () => {
  it("allows max calls a window, then refuses, then allows again after the window", () => {
    const l = burstLimiter(3, 1000);
    expect([0, 1, 2].map((t) => l.over("a", t))).toEqual([false, false, false]);
    expect(l.over("a", 10)).toBe(true);
    expect(l.over("b", 10)).toBe(false);
    expect(l.over("a", 1200)).toBe(false);
  });
  it("keeps memory bounded, dropping the oldest caller first", () => {
    const l = burstLimiter(1, 60_000, 2);
    l.over("a", 0);
    l.over("b", 0);
    l.over("c", 0);
    // "a" was dropped, so it starts a new window; "c" is still counted.
    expect(l.over("a", 1)).toBe(false);
    expect(l.over("c", 1)).toBe(true);
  });
});

describe("request helpers", () => {
  it("reads the caller's address", () => {
    expect(callerIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(callerIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(callerIp(new Headers())).toBeNull();
  });
  it("accepts no origin or the same host; refuses another or an unreadable one", () => {
    expect(sameOrigin(new Headers({ host: "a.app" }))).toBe(true);
    expect(sameOrigin(new Headers({ host: "a.app", origin: "https://a.app" }))).toBe(true);
    expect(sameOrigin(new Headers({ host: "a.app", origin: "https://b.app" }))).toBe(false);
    expect(sameOrigin(new Headers({ host: "a.app", origin: "not a url" }))).toBe(false);
  });
});
