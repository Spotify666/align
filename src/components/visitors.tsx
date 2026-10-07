"use client";
// The visitors page, open to anyone, so totals only: people, visits and time, and over the
// last 30 days where they came from, what they used and what they did. No IPs, cities or
// single visits (see visits_overview in Supabase).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { VISITS_OFF } from "@/lib/visit";

type Totals = { visits: number; visitors: number; median_ms: number | null };
type Item = { k: string; n: number };
type Lists = Partial<Record<"countries" | "devices" | "systems" | "browsers" | "sources" | "pages" | "results" | "failures" | "taps", Item[]>>;
type Overview = { day: Totals; week: Totals; month: Totals; analyses: number; lists: Lists };

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

const country = (code: string) => {
  if (code === "?") return "Unknown";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const SECTIONS: Array<[keyof Lists, string, (k: string) => string]> = [
  ["countries", "Countries (people)", country],
  ["devices", "Devices (people)", (k) => k],
  ["systems", "Systems (people)", (k) => k],
  ["browsers", "Browsers (people)", (k) => k],
  ["sources", "Came from (visits)", (k) => (k === "direct" ? "Direct or app" : k)],
  ["pages", "Pages (visits)", (k) => k],
  ["results", "Analysis results", (k) => k],
  ["failures", "Couldn't analyse", (k) => k],
  ["taps", "Most tapped", (k) => k],
];

export function Visitors() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [counted, setCounted] = useState(true);

  useEffect(() => {
    try {
      setCounted(localStorage.getItem(VISITS_OFF) !== "off");
    } catch {
      // Storage blocked.
    }
    void supabase()
      .rpc("visits_overview")
      .then(({ data: d, error }) => (error || !d ? setFailed(true) : setData(d as Overview)));
  }, []);

  const toggleCounted = () => {
    const next = !counted;
    try {
      if (next) localStorage.removeItem(VISITS_OFF);
      else localStorage.setItem(VISITS_OFF, "off");
    } catch {
      // Storage blocked.
    }
    setCounted(next);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold">Visitors</h1>
      {failed && <p className="text-sm text-bad">Couldn&apos;t load visitors. Try again.</p>}
      {!data && !failed && <p className="text-sm text-fg-subtle">Loading…</p>}
      {data && (
        <>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
            {(
              [
                ["Today", data.day],
                ["7 days", data.week],
                ["30 days", data.month],
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
          <p className="text-[0.7rem] text-fg-subtle">People, then visits and typical time spent. Bots aren&apos;t counted.</p>

          <p className="text-sm">
            <span className="tabular-nums font-semibold">{data.analyses}</span> analys{data.analyses === 1 ? "is" : "es"} tried in the last 30 days
          </p>

          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {SECTIONS.map(([key, title, label]) => {
              const items = data.lists[key];
              if (!items?.length) return null;
              return (
                <section key={key}>
                  <h2 className="mb-1 text-[0.7rem] font-medium uppercase tracking-wider text-fg-subtle">{title}</h2>
                  <ul className="divide-y divide-line border-y border-line text-sm">
                    {items.map((it) => (
                      <li key={it.k} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate text-fg-muted">{label(it.k)}</span>
                        <span className="shrink-0 tabular-nums">{it.n}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[0.7rem] text-fg-subtle">
        Totals only: no IP addresses, towns or single visits are shown here.{" "}
        <button className="underline underline-offset-2 hover:text-fg" onClick={toggleCounted}>
          {counted ? "Don't count my visits on this device" : "Count my visits on this device again"}
        </button>
      </p>
    </div>
  );
}
