// A burst limit per caller on one server instance: a fixed one-minute window per key, at most
// `max` calls in it. Bounded memory: past `keys` callers the oldest window is dropped first.
// It is a first line, not the only one (the database limits visits per IP on its own).

export interface Limiter {
  /** True when this call is over the limit. */
  over(key: string, now?: number): boolean;
}

export function burstLimiter(max: number, windowMs = 60_000, keys = 5000): Limiter {
  const seen = new Map<string, { n: number; since: number }>();
  return {
    over(key, now = Date.now()) {
      const r = seen.get(key);
      if (!r || now - r.since > windowMs) {
        seen.delete(key);
        if (seen.size >= keys) seen.delete(seen.keys().next().value!);
        seen.set(key, { n: 1, since: now });
        return false;
      }
      return ++r.n > max;
    },
  };
}

/** The caller's address as the host reports it, or null. */
export function callerIp(h: Headers): string | null {
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null;
}

/** False when the request names another site as its origin (or an unreadable one). */
export function sameOrigin(h: Headers): boolean {
  const origin = h.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === h.get("host");
  } catch {
    return false;
  }
}
