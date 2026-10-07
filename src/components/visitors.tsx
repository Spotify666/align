"use client";
// The visitors page. Open to anyone, it shows totals only: people, visits and time, and over
// the last 30 days where they came from, what they used and what they did (visits_overview).
// With the owner's private link (?k=…, remembered on that device) it also shows every visit
// in full: time, place, IP, device, time spent and each step (visits_full).

import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { VISITS_OFF } from "@/lib/visit";

type Totals = { visits: number; visitors: number; median_ms: number | null };
type Item = { k: string; n: number };
type Lists = Partial<Record<"countries" | "devices" | "systems" | "browsers" | "sources" | "pages" | "results" | "failures" | "taps", Item[]>>;
type Overview = { day: Totals; week: Totals; month: Totals; analyses: number; lists: Lists };
type Visit = {
  id: string;
  visitor: string;
  started_at: string;
  active_ms: number;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  screen: string | null;
  lang: string | null;
  referrer: string | null;
  paths: string[];
  events: Array<{ t: number; k: string; d?: string }>;
};

/** The private link's key, remembered on this device. */
const KEY = "align:visits-key";
const PAGE = 100;

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

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function describe(e: { k: string; d?: string }): string {
  const d = e.d ?? "";
  switch (e.k) {
    case "page":
      return `Opened ${d}`;
    case "tap":
      return `Tapped “${d}”`;
    case "analyse":
      return `Analysed ${d}`;
    case "result":
      return `Result: ${d}`;
    case "failed":
      return `Couldn't analyse: ${d}`;
    default:
      return d ? `${e.k}: ${d}` : e.k;
  }
}

export function Visitors() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [counted, setCounted] = useState(true);
  const [key, setKey] = useState<string | null>(null);
  const [rows, setRows] = useState<Visit[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function loadRows(k: string, from: number) {
    const { data: d, error } = await supabase().rpc("visits_full", { p_key: k, p_offset: from, p_limit: PAGE });
    if (error) return;
    const got = (d ?? []) as Visit[];
    setRows((r) => (from === 0 ? got : [...(r ?? []), ...got]));
    setMore(got.length === PAGE);
  }

  useEffect(() => {
    void (async () => {
      let k: string | null = null;
      let off = false;
      try {
        off = localStorage.getItem(VISITS_OFF) === "off";
        k = new URLSearchParams(location.search).get("k") || localStorage.getItem(KEY);
        if (k) localStorage.setItem(KEY, k);
      } catch {
        // Storage blocked.
      }
      setCounted(!off);
      if (k) {
        setKey(k);
        void loadRows(k, 0);
      }
      const { data: d, error } = await supabase().rpc("visits_overview");
      if (error || !d) setFailed(true);
      else setData(d as Overview);
    })();
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

          {rows && rows.length > 0 && <FullTable rows={rows} open={open} setOpen={setOpen} />}
          {rows && more && key && (
            <button className="btn btn-quiet w-full text-sm" onClick={() => void loadRows(key, rows.length)}>
              Show more visits
            </button>
          )}

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
        {rows ? "Full table: only on this device's private link. " : "Totals only: no IP addresses, towns or single visits are shown here. "}
        <button className="underline underline-offset-2 hover:text-fg" onClick={toggleCounted}>
          {counted ? "Don't count my visits on this device" : "Count my visits on this device again"}
        </button>
      </p>
    </div>
  );
}

function place(v: Visit): string {
  return [v.city, v.region && v.region !== v.city ? v.region : null, v.country ? country(v.country) : null].filter(Boolean).join(", ") || "Unknown";
}

/** Every visit, newest first; tap a row for its steps. */
function FullTable({ rows, open, setOpen }: { rows: Visit[]; open: string | null; setOpen: (id: string | null) => void }) {
  // A visit is "returning" when the same browser came before.
  const seen = new Set<string>();
  const returning = new Set<string>();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (seen.has(rows[i]!.visitor)) returning.add(rows[i]!.id);
    seen.add(rows[i]!.visitor);
  }
  const cols = ["Time", "Place", "IP", "Device", "System", "Browser", "Spent", "Pages", "Actions", "From", "Visitor"];
  return (
    <section>
      <h2 className="mb-1 text-[0.7rem] font-medium uppercase tracking-wider text-fg-subtle">Every visit ({rows.length}{rows.length % PAGE === 0 ? "+" : ""})</h2>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-max min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-fg-subtle">
              {cols.map((c) => (
                <th key={c} className="px-2.5 py-2 font-normal whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const at = new Date(r.started_at);
              const isOpen = open === r.id;
              const actions = r.events.filter((e) => e.k !== "page").length;
              return (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer border-b border-line align-top last:border-0 hover:bg-tint" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">
                      {at.toLocaleDateString(undefined, { day: "numeric", month: "short" })} {at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{place(r)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap font-mono">{r.ip ?? "–"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{r.device ?? "–"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{r.os ?? "–"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{r.browser ?? "–"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">{duration(r.active_ms)}</td>
                    <td className="px-2.5 py-2 tabular-nums">{r.paths.length}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">{actions} {isOpen ? "▴" : "▾"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{r.referrer ?? "direct"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap font-mono">
                      {r.visitor}
                      {returning.has(r.id) ? " ↺" : ""}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line">
                      <td colSpan={cols.length} className="px-2.5 pb-3">
                        <p className="py-1 text-fg-subtle">
                          {[r.screen && `Screen ${r.screen}`, r.lang && `Language ${r.lang}`].filter(Boolean).join(" · ")}
                        </p>
                        <ol className="space-y-0.5">
                          {r.events.map((e, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="w-10 shrink-0 tabular-nums text-fg-subtle">{clock(e.t)}</span>
                              <span className="text-fg-muted">{describe(e)}</span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[0.7rem] text-fg-subtle">Scroll sideways for every column; tap a visit for its steps. ↺ returning browser.</p>
    </section>
  );
}
