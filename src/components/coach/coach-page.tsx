"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { currentUser } from "@/lib/cloud";
import { StatusPill } from "../report/status";
import type { AnalysisStatus } from "@/engine/types";
import { Users } from "../icons";

type Player = { player_id: string; status: string; created_at: string; name: string | null };
type Item = { id: string; owner_id: string; title: string | null; recorded_at: string; status: AnalysisStatus; observed_label: string | null; reviewed: boolean };

export function CoachPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [codes, setCodes] = useState<Array<{ code: string; expires_at: string }>>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [queue, setQueue] = useState<Item[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async (u: User) => {
    const sb = supabase();
    const [{ data: inv }, { data: links }] = await Promise.all([
      sb.from("coach_invites").select("code, expires_at").order("created_at", { ascending: false }),
      sb.from("coach_links").select("player_id, status, created_at").eq("coach_id", u.id),
    ]);
    setCodes(inv ?? []);
    const ids = (links ?? []).filter((l) => l.status === "active").map((l) => l.player_id);
    const { data: profs } = ids.length ? await sb.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    setPlayers((links ?? []).map((l) => ({ ...l, name: profs?.find((p) => p.id === l.player_id)?.display_name ?? null })));
    if (ids.length) {
      const { data: rows } = await sb.from("analyses").select("id, owner_id, title, recorded_at, status, observed_label").in("owner_id", ids).order("recorded_at", { ascending: false }).limit(50);
      const { data: mine } = await sb.from("annotations").select("analysis_id").eq("author_id", u.id);
      const done = new Set((mine ?? []).map((m) => m.analysis_id));
      setQueue(((rows ?? []) as Omit<Item, "reviewed">[]).map((r) => ({ ...r, reviewed: done.has(r.id) })));
    } else setQueue([]);
  };

  useEffect(() => {
    currentUser().then((u) => {
      setUser(u);
      if (u) load(u);
    });
  }, []);

  if (user === undefined) return <p className="mx-auto max-w-7xl px-4 py-12 text-fg-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-8">
      <header>
        <p className="eyebrow">Coach workspace</p>
        <h1 className="display text-5xl mt-2">Consistent evidence across a squad.</h1>
        <p className="mt-3 text-fg-muted max-w-2xl">Players stay in control: they link you with your invite code and choose what to save. Your notes and shot calls sit beside the model result and never overwrite it.</p>
      </header>

      {!user ? (
        <div className="card p-6 space-y-3">
          <p className="font-semibold flex items-center gap-2"><Users /> Sign in to coach</p>
          <ol className="list-decimal pl-5 text-sm text-fg-muted space-y-1">
            <li>Sign in and create an invite code here.</li>
            <li>Your player enters the code in their Profile — that is their consent to share.</li>
            <li>Their saved front-foot defences appear in your review queue.</li>
          </ol>
          <div className="flex gap-3 flex-wrap">
            <Link href="/signin?next=/coach" className="btn btn-primary">Sign in</Link>
            <Link href="/sample/valid_ffd" className="btn btn-ghost">See what a player report looks like</Link>
          </div>
        </div>
      ) : (
        <>
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">Invite a player</h2>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await supabase().from("profiles").upsert({ id: user.id, role: "coach" });
                const { data, error } = await supabase().from("coach_invites").insert({ coach_id: user.id }).select("code, expires_at").single();
                if (error) return setMsg(error.message);
                setCodes((c) => [data!, ...c]);
                setMsg(null);
              }}
            >
              Create invite code
            </button>
            {msg && <p className="text-sm text-bad">{msg}</p>}
            <ul className="space-y-1">
              {codes.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="num text-lg tracking-wider">{c.code}</span>
                  <span className="text-fg-subtle">expires {new Date(c.expires_at).toLocaleDateString()}</span>
                  <button className="chip border-line min-h-9" onClick={() => navigator.clipboard?.writeText(c.code)}>Copy</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="display text-3xl">Roster</h2>
            {players.length === 0 ? (
              <p className="text-fg-muted">No players linked yet.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {players.map((p) => (
                  <li key={p.player_id} className="card p-4 flex items-center justify-between">
                    <span>{p.name ?? `Player ${p.player_id.slice(0, 6)}`}</span>
                    <span className={`chip ${p.status === "active" ? "border-ok/40 text-ok" : "border-line-strong text-fg-subtle"}`}>{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="display text-3xl">Review queue</h2>
            {queue.length === 0 ? (
              <p className="text-fg-muted">Saved shots from linked players appear here.</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((q) => (
                  <li key={q.id} className="card p-4 flex flex-wrap items-center gap-3">
                    <StatusPill payload={{ analysis_status: q.status, mode: "video" }} />
                    <Link href={`/report/${q.id}`} className="font-semibold hover:underline">{q.title ?? "Shot"}</Link>
                    <span className="num text-xs text-fg-subtle">{new Date(q.recorded_at).toLocaleString()}</span>
                    <span className="ml-auto">{q.reviewed ? <span className="chip border-ok/40 text-ok">reviewed</span> : <span className="chip border-brand/50 text-brand">to review</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
