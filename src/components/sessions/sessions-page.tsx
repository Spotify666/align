"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listAnalyses, updateAnalysis, type StoredAnalysis } from "@/lib/store";
import { currentUser } from "@/lib/cloud";
import { supabase } from "@/lib/supabase/client";
import { SHOT_DISPLAY } from "@/engine/classify";
import type { AnalysisStatus } from "@/engine/types";
import { StatusPill, STATUS_META } from "../report/status";

type CloudRow = { id: string; recorded_at: string; title: string | null; status: AnalysisStatus; observed_label: string | null; technique_index: number | null };

export function SessionsPage() {
  const [items, setItems] = useState<StoredAnalysis[] | null>(null);
  const [cloud, setCloud] = useState<CloudRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AnalysisStatus | "all">("all");

  useEffect(() => {
    listAnalyses().then(setItems).catch(() => setItems([]));
    currentUser()
      .then(async (u) => {
        if (!u) return;
        const { data } = await supabase()
          .from("analyses")
          .select("id, recorded_at, title, status, observed_label, technique_index")
          .eq("owner_id", u.id)
          .order("recorded_at", { ascending: false })
          .limit(100);
        setCloud((data as CloudRow[]) ?? []);
      })
      .catch(() => null);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter(
      (a) =>
        (status === "all" || a.payload.analysis_status === status) &&
        (!needle || `${a.title} ${a.notes} ${a.tags.join(" ")}`.toLowerCase().includes(needle)),
    );
  }, [items, q, status]);
  const cloudOnly = cloud.filter((c) => !(items ?? []).some((a) => a.id === c.id));

  const patch = async (id: string, p: Parameters<typeof updateAnalysis>[1]) => {
    await updateAnalysis(id, p);
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);
  };

  if (items === null) return <p className="mx-auto max-w-7xl px-4 py-12 text-fg-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Sessions</p>
          <h1 className="display text-5xl mt-2">Your shot library.</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/analyse" className="btn btn-primary">Front-foot defence</Link>
          <Link href="/analyse?shot=back" className="btn btn-ghost">Back-foot defence</Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <input className="field flex-1 min-w-52" placeholder="Search titles, notes, tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sessions" />
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value as AnalysisStatus | "all")} aria-label="Filter by outcome">
          <option value="all">All outcomes</option>
          {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).filter((k) => k !== "posture_screen").map((k) => (
            <option key={k} value={k}>{STATUS_META[k].label}</option>
          ))}
        </select>
      </div>

      {items.length === 0 && cloudOnly.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <p className="display text-3xl">Nothing recorded yet</p>
          <p className="text-fg-muted">Your analyses stay on this device. Sample reports show every outcome.</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/analyse" className="btn btn-primary">Record your first shot</Link>
            <Link href="/sample" className="btn btn-ghost">Sample reports</Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => {
            const p = a.payload;
            return (
              <li key={a.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill payload={p} />
                  <Link href={`/report/${a.id}`} className="font-semibold hover:underline">{a.title}</Link>
                  {p.requested_shot === "back_foot_defence" && <span className="chip border-data/40 text-data">Back-foot</span>}
                  <span className="num text-xs text-fg-subtle">{new Date(a.recordedAt).toLocaleString()}</span>
                  {a.cloud && <span className="chip border-ok/40 text-ok">in account</span>}
                  <span className="ml-auto text-sm text-fg-muted">
                    {p.analysis_status === "invalid_for_requested_analysis" && p.observed_shot
                      ? `Played: ${p.observed_shot.label === "unknown" ? p.observed_shot.display : SHOT_DISPLAY[p.observed_shot.label]}`
                      : p.priorities[0]
                        ? `Priority: ${p.priorities[0].title}`
                        : ""}
                  </span>
                </div>
                <details className="mt-2">
                  <summary className="text-sm text-fg-subtle min-h-9">Notes, tags and baseline</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="text-fg-muted">Title</span>
                      <input className="field mt-1" defaultValue={a.title} maxLength={120} onBlur={(e) => patch(a.id, { title: e.target.value })} />
                    </label>
                    <label className="text-sm">
                      <span className="text-fg-muted">Tags (comma separated)</span>
                      <input className="field mt-1" defaultValue={a.tags.join(", ")} onBlur={(e) => patch(a.id, { tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-fg-muted">Notes</span>
                      <textarea className="field mt-1 min-h-20" defaultValue={a.notes} maxLength={4000} onBlur={(e) => patch(a.id, { notes: e.target.value })} />
                    </label>
                    {p.analysis_status === "valid" && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={a.representative} onChange={(e) => patch(a.id, { representative: e.target.checked })} />
                        Representative attempt — use for my baseline
                      </label>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
          {cloudOnly.map((c) => (
            <li key={c.id} className="card p-4 flex flex-wrap items-center gap-3">
              <StatusPill payload={{ analysis_status: c.status, mode: "video" }} />
              <Link href={`/report/${c.id}`} className="font-semibold hover:underline">{c.title ?? "Saved shot"}</Link>
              <span className="num text-xs text-fg-subtle">{new Date(c.recorded_at).toLocaleString()}</span>
              <span className="chip border-data/40 text-data">account only</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
