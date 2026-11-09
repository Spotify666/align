"use client";
// The visitors page. Open to anyone, it shows totals only: people, visits and time, and over
// the last 30 days where they came from, what they used and what they did (visits_overview).
// With the owner's private link (?k=…, remembered on that device) it also shows every visit
// in full: time, place, IP, device, time spent and each step (visits_full).

import { useEffect, useState } from "react";
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

// Plain names for what the log records.
const PAGE_NAMES: Record<string, string> = {
  "/": "Opening page",
  "/home": "Home",
  "/analyse": "Analyse",
  "/report/…": "A report",
  "/angles": "Two-angle report",
  "/sessions": "Sessions",
  "/progress": "Progress",
  "/profile": "Profile",
  "/guide": "How it works",
  "/science": "Science",
  "/privacy": "Privacy",
  "/visitors": "Visitors",
  "/sample": "Sample reports",
  "/coach": "Coach",
  "/signin": "Sign in",
};
export const pageName = (k: string) => {
  const path = k.split("?")[0]!;
  return PAGE_NAMES[path.startsWith("/report/") ? "/report/…" : path] ?? k;
};

/** A button's own words, without the smaller line under them (the log keeps both). */
export function tapName(k: string): string {
  if (/^I am under 18/i.test(k)) return "Under 18: parent agreed";
  if (/^Analyse my movement/i.test(k)) return "Agreed to analyse on this device";
  const m = /^(.+?[a-z0-9.)])\s+(?=[A-Z])/.exec(k);
  return m ? m[1]! : k;
}

/** A recorded result ("graded", "back-foot defence: shot unclear") as its shot and a plain outcome. */
export function readResult(k: string): { shot: string; outcome: string } {
  const m = /^(.*?): (.*)$/.exec(k);
  const shot = m ? m[1]! : "front-foot defence";
  const raw = m ? m[2]! : k;
  const outcome =
    raw === "graded" ? "scored" : raw === "shot unclear" ? "couldn't tell the shot" : raw === "capture not usable" ? "video not usable" : raw.startsWith("not a ") ? "another shot" : raw;
  return { shot: shot[0]!.toUpperCase() + shot.slice(1), outcome };
}

const sum = (items: Item[]) => items.reduce((s, it) => s + it.n, 0);
/** Items with the same plain name added together, most first. */
function merged(items: Item[] | undefined, name: (k: string) => string): Item[] {
  const by = new Map<string, number>();
  for (const it of items ?? []) by.set(name(it.k), (by.get(name(it.k)) ?? 0) + it.n);
  return [...by].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function describe(e: { k: string; d?: string }): string {
  const d = e.d ?? "";
  switch (e.k) {
    case "page":
      return `Opened ${pageName(d)}`;
    case "tap":
      return `Tapped “${tapName(d)}”`;
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
      <div>
        <h1 className="text-2xl font-semibold">Visitors</h1>
        <p className="mt-1 text-sm text-fg-muted">Who used Aline. One person is one phone or computer. Bots aren&apos;t counted.</p>
      </div>
      {failed && <p className="text-sm text-bad">Couldn&apos;t load visitors. Try again.</p>}
      {!data && !failed && <p className="text-sm text-fg-subtle">Loading…</p>}
      {data && (
        <>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-fg-subtle">
                <th className="w-[34%] py-2 text-left font-normal" />
                {["Today", "7 days", "30 days"].map((h) => (
                  <th key={h} className="py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ["People", (t: Totals) => String(t.visitors)],
                  ["Visits", (t: Totals) => String(t.visits)],
                  ["Typical visit", (t: Totals) => (t.median_ms ? duration(t.median_ms) : "–")],
                ] as const
              ).map(([label, value]) => (
                <tr key={label} className="border-b border-line">
                  <th scope="row" className="py-2 text-left font-normal text-fg-muted">{label}</th>
                  {[data.day, data.week, data.month].map((t, i) => (
                    <td key={i} className={`py-2 text-right ${label === "People" ? "text-lg font-semibold" : ""}`}>{value(t)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {rows && rows.length > 0 && <VisitList rows={rows} open={open} setOpen={setOpen} />}
          {rows && more && key && (
            <button className="btn btn-quiet w-full text-sm" onClick={() => void loadRows(key, rows.length)}>
              Show more visits
            </button>
          )}

          <p className="text-xs text-fg-subtle">Everything below: the last 30 days.</p>

          <Section title="Analyses">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{data.analyses}</span> started
            </p>
            <Results items={data.lists.results} />
            {!!data.lists.failures?.length && (
              <>
                <h3 className="mt-3 text-sm font-medium">Stopped without a result</h3>
                <Rows items={merged(data.lists.failures, (k) => k)} />
              </>
            )}
          </Section>

          <Section title="Where people came from">
            <Rows items={merged(data.lists.countries, country)} unit={["person", "people"]} />
            <Inline label="Devices" items={merged(data.lists.devices, (k) => (k === "Desktop" ? "Computer" : k))} />
            <Inline label="Systems" items={merged(data.lists.systems, (k) => k)} />
            <Inline label="Browsers" items={merged(data.lists.browsers, (k) => k)} />
            <Inline label="Arrived" items={merged(data.lists.sources, (k) => (k === "direct" ? "typed the address or opened the app" : `from ${k}`))} unit={["visit", "visits"]} />
          </Section>

          <Section title="Pages opened">
            <Rows items={merged(data.lists.pages, pageName)} unit={["visit", "visits"]} />
          </Section>

          <Section title="Buttons tapped most">
            <Rows items={merged(data.lists.taps, tapName).slice(0, 8)} unit={["tap", "taps"]} />
          </Section>
        </>
      )}
      <p className="text-[0.7rem] text-fg-subtle">
        {rows ? "Single visits: only on this device's private link. " : "Totals only: no IP addresses, towns or single visits are shown here. "}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A list of names and numbers. */
function Rows({ items, unit }: { items: Item[]; unit?: [string, string] }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-line border-y border-line text-sm">
      {items.map((it) => (
        <li key={it.k} className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="min-w-0 truncate">{it.k}</span>
          <span className="shrink-0 tabular-nums text-fg-muted">
            {it.n}
            {unit ? ` ${it.n === 1 ? unit[0] : unit[1]}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A short list on one line: "Devices: Phone 5 · Computer 1". */
function Inline({ label, items, unit }: { label: string; items: Item[]; unit?: [string, string] }) {
  if (!items.length) return null;
  return (
    <p className="text-sm">
      <span className="text-fg-muted">{label}: </span>
      {items.map((it, i) => (
        <span key={it.k}>
          {i > 0 ? " · " : ""}
          {it.k} <span className="tabular-nums">{it.n}</span>
        </span>
      ))}
      {unit ? <span className="text-fg-muted"> {sum(items) === 1 ? unit[0] : unit[1]}</span> : null}
    </p>
  );
}

/** Results by shot: "Back-foot defence: scored 18 · couldn't tell the shot 6". */
function Results({ items }: { items: Item[] | undefined }) {
  const byShot = new Map<string, Item[]>();
  for (const it of items ?? []) {
    const { shot, outcome } = readResult(it.k);
    const list = byShot.get(shot) ?? [];
    const same = list.find((x) => x.k === outcome);
    if (same) same.n += it.n;
    else list.push({ k: outcome, n: it.n });
    byShot.set(shot, list);
  }
  if (!byShot.size) return null;
  return (
    <ul className="divide-y divide-line border-y border-line text-sm">
      {[...byShot].map(([shot, list]) => (
        <li key={shot} className="py-1.5">
          <span className="font-medium">{shot}</span> <span className="tabular-nums text-fg-muted">({sum(list)})</span>
          <span className="block text-fg-muted">
            {list
              .sort((a, b) => b.n - a.n)
              .map((x) => `${x.k} ${x.n}`)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Every visit, newest first, one card each; tap one for its steps. */
function VisitList({ rows, open, setOpen }: { rows: Visit[]; open: string | null; setOpen: (id: string | null) => void }) {
  // A visit is "returning" when the same browser came before.
  const seen = new Set<string>();
  const returning = new Set<string>();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (seen.has(rows[i]!.visitor)) returning.add(rows[i]!.id);
    seen.add(rows[i]!.visitor);
  }
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">
        Every visit <span className="font-normal text-fg-muted">({rows.length}{rows.length % PAGE === 0 ? "+" : ""}, newest first)</span>
      </h2>
      <ul className="divide-y divide-line border-y border-line">
        {rows.map((r) => {
          const at = new Date(r.started_at);
          const isOpen = open === r.id;
          const actions = r.events.filter((e) => e.k !== "page").length;
          const device = [r.device === "Desktop" ? "Computer" : r.device, r.os, r.browser].filter(Boolean).join(" · ");
          return (
            <li key={r.id}>
              <button type="button" className="w-full py-2.5 text-left text-sm hover:bg-tint" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium tabular-nums">
                    {at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, {at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg-muted">{duration(r.active_ms)}</span>
                </span>
                <span className="block text-fg-muted">{place(r)}</span>
                <span className="block text-fg-muted">{device || "Unknown device"}</span>
                <span className="block text-fg-muted">
                  {r.paths.length} page{r.paths.length === 1 ? "" : "s"} · {actions} action{actions === 1 ? "" : "s"}
                  {returning.has(r.id) ? " · came before" : ""} {isOpen ? "▴" : "▾"}
                </span>
              </button>
              {isOpen && (
                <div className="pb-3 text-xs">
                  <ol className="space-y-0.5">
                    {r.events.map((e, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-10 shrink-0 tabular-nums text-fg-subtle">{clock(e.t)}</span>
                        <span className="text-fg-muted">{describe(e)}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-fg-subtle">
                    {[r.referrer ? `From ${r.referrer}` : "Typed the address or opened the app", r.screen && `Screen ${r.screen}`, r.lang && `Language ${r.lang}`, r.ip && `IP ${r.ip}`, `Visitor ${r.visitor}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
