"use client";
// The visitor log, for the site's owner: who came, from where, on what, what they tried and
// for how long. Row-level security returns nothing to anyone else.

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { VISITS_OFF } from "@/lib/visit";
import type { VisitEvent } from "@/lib/visit-shared";

interface Visit {
  id: string;
  visitor_id: string;
  started_at: string;
  active_ms: number;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  paths: string[];
  events: VisitEvent[];
}
type Totals = { visits: number; visitors: number; median_ms: number | null };
type Stats = { day: Totals; week: Totals; month: Totals };

const PAGE = 60;
/** Visits are kept this long; older ones are removed when the owner opens the page. */
const KEEP_DAYS = 180;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function place(v: Pick<Visit, "city" | "region" | "country">): string {
  const country = v.country ? (regionNames?.of(v.country) ?? v.country) : null;
  return [v.city, v.region && v.region !== v.city ? v.region : null, country].filter(Boolean).join(", ") || "Unknown place";
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function describe(e: VisitEvent): string {
  switch (e.k) {
    case "page":
      return `Opened ${e.d ?? ""}`;
    case "tap":
      return `Tapped “${e.d ?? ""}”`;
    case "analyse":
      return `Analysed ${e.d ?? ""}`;
    case "result":
      return `Result: ${e.d ?? ""}`;
    case "failed":
      return `Couldn't analyse: ${e.d ?? ""}`;
    default:
      return e.d ? `${e.k}: ${e.d}` : e.k;
  }
}

/** One line of what a visit did: "3 pages · 4 taps · 1 analysis". */
export function summary(events: VisitEvent[]): string {
  const n = (k: string) => events.filter((e) => e.k === k).length;
  const parts: string[] = [];
  const pages = n("page");
  const taps = n("tap");
  const tries = n("analyse");
  if (pages) parts.push(`${pages} page${pages === 1 ? "" : "s"}`);
  if (taps) parts.push(`${taps} tap${taps === 1 ? "" : "s"}`);
  if (tries) parts.push(`${tries} analys${tries === 1 ? "is" : "es"}`);
  return parts.join(" · ") || "no actions";
}

function dayOf(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function Visitors() {
  const [state, setState] = useState<"loading" | "signin" | "denied" | "ready" | "error">("loading");
  const [rows, setRows] = useState<Visit[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load(from: number) {
    const sb = supabase();
    const { data, error } = await sb
      .from("visits")
      .select("id, visitor_id, started_at, active_ms, ip, country, region, city, device, os, browser, referrer, paths, events")
      .order("started_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as Visit[];
    setRows((r) => (from === 0 ? got : [...r, ...got]));
    setMore(got.length === PAGE);
  }

  useEffect(() => {
    void (async () => {
      try {
        const sb = supabase();
        const { data: u } = await sb.auth.getUser();
        if (!u.user) return setState("signin");
        const { data: admin } = await sb.rpc("is_site_admin");
        if (admin !== true) return setState("denied");
        // The owner's own browsing isn't logged from here on.
        try {
          localStorage.setItem(VISITS_OFF, "off");
        } catch {
          // Storage blocked.
        }
        await sb.from("visits").delete().lt("started_at", new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
        const [{ data: s }] = await Promise.all([sb.rpc("visit_stats"), load(0)]);
        setStats(s as Stats);
        setState("ready");
      } catch {
        setState("error");
      }
    })();
  }, []);

  if (state === "loading") return <Shell><p className="text-sm text-fg-subtle">Loading…</p></Shell>;
  if (state === "signin")
    return (
      <Shell>
        <p className="text-sm text-fg-muted">Only the site&apos;s owner can see visitors.</p>
        <Link href="/signin?next=/visitors" className="btn btn-primary w-fit">Sign in</Link>
      </Shell>
    );
  if (state === "denied") return <Shell><p className="text-sm text-fg-muted">This account can&apos;t see visitors.</p></Shell>;
  if (state === "error") return <Shell><p className="text-sm text-bad">Couldn&apos;t load visitors. Try again.</p></Shell>;

  // A visit is "returning" when the same browser came before.
  const returning = new Set<string>();
  const seen = new Set<string>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (seen.has(r.visitor_id)) returning.add(r.id);
    seen.add(r.visitor_id);
  }
  const days = rows.map((r) => dayOf(r.started_at));

  return (
    <Shell>
      {stats && (
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
          {(
            [
              ["Today", stats.day],
              ["7 days", stats.week],
              ["30 days", stats.month],
            ] as const
          ).map(([label, t]) => (
            <div key={label} className="bg-bg px-2 py-3">
              <dt className="text-[0.7rem] uppercase tracking-wider text-fg-subtle">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{t.visitors}</dd>
              <dd className="text-[0.7rem] text-fg-subtle tabular-nums">
                {t.visits} visit{t.visits === 1 ? "" : "s"}
                {t.median_ms ? ` · ${duration(t.median_ms)}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-[0.7rem] text-fg-subtle">People (visits · typical time). Bots aren&apos;t counted; your visits from this device aren&apos;t either.</p>

      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">No visitors yet.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((r, i) => {
            const heading = days[i] !== days[i - 1] ? days[i] : null;
            const isOpen = open === r.id;
            const time = new Date(r.started_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            return (
              <li key={r.id}>
                {heading && <p className="pt-4 pb-1 text-[0.7rem] font-medium uppercase tracking-wider text-fg-subtle">{heading}</p>}
                <button className="w-full py-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      <span className="tabular-nums text-fg-subtle">{time}</span> {place(r)}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">{duration(r.active_ms)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    {[r.device, r.os, r.browser].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                    {summary(r.events)}
                    {returning.has(r.id) ? " · returning" : ""}
                    {r.referrer ? ` · from ${r.referrer}` : ""}
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-3 text-xs">
                    <ol className="space-y-1">
                      {r.events.map((e, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="w-10 shrink-0 tabular-nums text-fg-subtle">{clock(e.t)}</span>
                          <span className="min-w-0 break-words text-fg-muted">{describe(e)}</span>
                        </li>
                      ))}
                    </ol>
                    {r.ip && <p className="mt-2 font-mono text-[0.7rem] text-fg-subtle">IP {r.ip}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more && (
        <button className="btn btn-quiet w-full text-sm" onClick={() => void load(rows.length)}>
          Show more
        </button>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold">Visitors</h1>
      {children}
    </div>
  );
}
