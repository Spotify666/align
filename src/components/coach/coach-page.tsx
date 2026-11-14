"use client";
// The coach workspace: invite players, group them into squads, review their shared shots (not
// yet reviewed first, then the least clear recordings), give your own view beside Aline's
// result (which you can never change), assign a focus, a drill and a retest date, see the
// history of what you did, and export it. The database decides what a coach may see and do.

import { PageLoading } from "@/components/common/page-loading";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { currentUser } from "@/lib/cloud";
import {
  addAssignment,
  addToSquad,
  createSquad,
  exportCsv,
  listAssessments,
  listAssignments,
  listHistory,
  listQueue,
  listSquads,
  queueOrder,
  removeFromSquad,
  saveAssessment,
  setAssignmentStatus,
  type Agreement,
  type Assessment,
  type Assignment,
  type HistoryRow,
  type QueueItem,
  type Squad,
} from "@/lib/coach";
import { FOCUS_AREAS } from "@/lib/store";
import type { FocusArea } from "@/engine/category";
import { StatusPill } from "../report/status";
import { Users } from "../icons";

type Player = { id: string; name: string };

const AGREE: Array<{ id: Agreement; label: string }> = [
  { id: "agree", label: "I agree" },
  { id: "disagree", label: "I disagree" },
  { id: "unsure", label: "Not sure" },
];
const focusLabel = (f: FocusArea | null) => (f ? FOCUS_AREAS.find((a) => a.id === f)?.label ?? f : "");
const clarity = (c: number) => (c >= 0.75 ? "Clear recording" : c >= 0.5 ? "Fair recording" : "Unclear recording");

export function CoachPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [codes, setCodes] = useState<Array<{ code: string; expires_at: string }>>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [squadFilter, setSquadFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async (u: User) => {
    try {
      const sb = supabase();
      const [{ data: inv }, { data: links }] = await Promise.all([
        sb.from("coach_invites").select("code, expires_at").order("created_at", { ascending: false }),
        sb.from("coach_links").select("player_id, status").eq("coach_id", u.id),
      ]);
      setCodes(inv ?? []);
      const ids = (links ?? []).filter((l) => l.status === "active").map((l) => l.player_id as string);
      const { data: profs } = ids.length ? await sb.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
      setPlayers(ids.map((id, i) => ({ id, name: profs?.find((p) => p.id === id)?.display_name ?? `Player ${i + 1}` })));
      const [sq, q, as, ag, hi] = await Promise.all([listSquads(), listQueue(ids), listAssessments(), listAssignments(), listHistory()]);
      setSquads(sq);
      setQueue(q);
      setAssessments(as.filter((a) => a.coach_id === u.id));
      setAssignments(ag.filter((a) => a.coach_id === u.id));
      setHistory(hi);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't load the workspace.");
    }
  };

  useEffect(() => {
    currentUser().then((u) => {
      setUser(u);
      if (u) load(u);
    });
  }, []);

  const reviewed = useMemo(() => new Set(assessments.filter((a) => a.reviewed_at).map((a) => a.analysis_id)), [assessments]);
  const nameOf = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const shown = useMemo(() => {
    const members = squadFilter === "all" ? null : new Set(squads.find((s) => s.id === squadFilter)?.members ?? []);
    return queueOrder(queue.filter((q) => !members || members.has(q.owner_id)), reviewed);
  }, [queue, reviewed, squadFilter, squads]);

  if (user === undefined) return <PageLoading what="Checking who is signed in…" />;

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
      <header>
        <h1 className="display text-4xl sm:text-5xl">Coach workspace</h1>
        <p className="mt-3 max-w-2xl text-fg-muted">
          Players link you with your invite code and choose what to share. Your view sits beside Aline&apos;s result and never changes it.
        </p>
      </header>

      {!user ? (
        <div className="panel space-y-3 p-6">
          <p className="flex items-center gap-2 font-semibold"><Users /> Sign in to coach</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>Sign in and create an invite code here.</li>
            <li>Your player enters the code in their Profile: that is their consent to share.</li>
            <li>Their saved shots appear in your review queue.</li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <Link href="/signin?next=/coach" className="btn btn-primary">Sign in</Link>
            <Link href="/sample/valid_ffd" className="btn btn-ghost">See a player&apos;s report</Link>
          </div>
        </div>
      ) : (
        <>
          {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}

          <Section title="Review queue" note="Not yet reviewed first, then the least clear recordings: they most need your eye.">
            {squads.length > 0 && (
              <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
                {[{ id: "all", name: "Everyone" }, ...squads].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={squadFilter === s.id}
                    onClick={() => setSquadFilter(s.id)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-medium ${squadFilter === s.id ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {shown.length === 0 ? (
              <p className="text-fg-muted">{players.length ? "No shared shots yet. A player's shots appear here once they save them to their account." : "Link a player first (below)."}</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((q) => (
                  <QueueRow
                    key={q.id}
                    q={q}
                    player={nameOf.get(q.owner_id) ?? "Player"}
                    reviewed={reviewed.has(q.id)}
                    open={open === q.id}
                    onToggle={() => setOpen(open === q.id ? null : q.id)}
                    assessment={assessments.find((a) => a.analysis_id === q.id) ?? null}
                    coachId={user.id}
                    onSaved={() => load(user)}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Assignments" note="What you asked each player to work on. They see it beside their report and mark it done.">
            {assignments.length === 0 ? (
              <p className="text-fg-muted">None yet. Assign from a shot in the queue.</p>
            ) : (
              <ul className="space-y-2">
                {[...assignments].sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open")).map((a) => (
                  <li key={a.id} className="panel flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
                    <span className="font-medium">{nameOf.get(a.player_id) ?? "Player"}</span>
                    <span className="text-fg-muted">{[focusLabel(a.focus), a.drill].filter(Boolean).join(" · ")}</span>
                    {a.retest_by && <span className="text-fg-subtle">retest by {new Date(a.retest_by).toLocaleDateString()}</span>}
                    <span className="ml-auto">{a.status === "done" ? "Done" : a.status === "cancelled" ? "Cancelled" : "Open"}</span>
                    {a.status === "open" && (
                      <button className="btn btn-ghost !min-h-11" onClick={async () => { await setAssignmentStatus(a.id, "cancelled"); load(user); }}>Cancel</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <SquadsSection squads={squads} players={players} onChange={() => load(user)} />

          <Section title="Invite a player" note="Each code works once and lasts 14 days.">
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
            <ul className="space-y-1">
              {codes.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="num text-lg tracking-wider">{c.code}</span>
                  <span className="text-fg-subtle">expires {new Date(c.expires_at).toLocaleDateString()}</span>
                  <button className="btn btn-ghost !min-h-11" onClick={() => navigator.clipboard?.writeText(c.code)}>Copy</button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="History" note="Everything you did, as the player sees it too.">
            {history.length === 0 ? (
              <p className="text-fg-muted">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-x-3 py-2">
                    <span className="num text-fg-subtle">{new Date(h.created_at).toLocaleString()}</span>
                    <span>{historyWords(h)}</span>
                    {h.subject_owner && nameOf.get(h.subject_owner) && <span className="text-fg-muted">· {nameOf.get(h.subject_owner)}</span>}
                  </li>
                ))}
              </ul>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                const csv = exportCsv({ players: nameOf, analyses: new Map(queue.map((q) => [q.id, q])), assessments, assignments });
                const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `aline-coach-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export my assessments and assignments
            </button>
          </Section>
        </>
      )}
    </div>
  );
}

function historyWords(h: HistoryRow): string {
  const verb = h.action === "insert" ? "added" : h.action === "delete" ? "removed" : h.action === "update" ? "changed" : h.action.replace(/_/g, " ");
  const what: Record<string, string> = { squads: "a squad", squad_members: "a player in a squad", coach_assessments: "your view of a shot", assignments: "an assignment", coach_link: "a player link" };
  const status = typeof h.detail?.status === "string" && h.subject_type === "assignments" && h.action === "update" ? ` (now ${h.detail.status})` : "";
  return `${what[h.subject_type] ?? h.subject_type} ${verb}${status}`.replace(/^./, (c) => c.toUpperCase());
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {note && <p className="text-sm text-fg-muted">{note}</p>}
      {children}
    </section>
  );
}

function QueueRow({ q, player, reviewed, open, onToggle, assessment, coachId, onSaved }: { q: QueueItem; player: string; reviewed: boolean; open: boolean; onToggle: () => void; assessment: Assessment | null; coachId: string; onSaved: () => void }) {
  return (
    <li className="panel">
      <button className="flex min-h-11 w-full flex-wrap items-center gap-3 p-4 text-left" aria-expanded={open} onClick={onToggle}>
        <StatusPill payload={{ analysis_status: q.status, mode: "video" }} />
        <span className="font-semibold">{player}</span>
        <span className="text-sm text-fg-muted">{q.title ?? "Shot"} · {new Date(q.recorded_at).toLocaleDateString()}</span>
        <span className="text-xs text-fg-subtle">{clarity(q.capture_confidence)}</span>
        <span className={`ml-auto text-sm ${reviewed ? "text-ok" : "text-brand"}`}>{reviewed ? "Reviewed" : "To review"}</span>
      </button>
      {open && <AssessPanel q={q} assessment={assessment} coachId={coachId} onSaved={onSaved} />}
    </li>
  );
}

function AssessPanel({ q, assessment, coachId, onSaved }: { q: QueueItem; assessment: Assessment | null; coachId: string; onSaved: () => void }) {
  const [agrees, setAgrees] = useState<Agreement | null>(assessment?.agrees ?? null);
  const [focus, setFocus] = useState<FocusArea | "">(assessment?.focus ?? "");
  const [notes, setNotes] = useState(assessment?.notes ?? "");
  const [drill, setDrill] = useState("");
  const [retest, setRetest] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (what: () => Promise<void>, said: string) => {
    setBusy(true);
    setErr(null);
    try {
      await what();
      setDone(said);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 border-t border-line p-4">
      <p className="text-sm">
        <Link href={`/report/${q.id}`} className="font-medium underline underline-offset-4">Open the report</Link>
        <span className="text-fg-muted"> · Aline&apos;s result stays as it is, whatever you write here.</span>
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Your view of Aline&apos;s result</legend>
        <div className="flex flex-wrap gap-1.5">
          {AGREE.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={agrees === a.id}
              onClick={() => setAgrees(agrees === a.id ? null : a.id)}
              className={`min-h-11 rounded-full border px-4 text-sm ${agrees === a.id ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        <span className="font-medium">Main thing to work on</span>
        <select className="field mt-1 w-full" value={focus} onChange={(e) => setFocus(e.target.value as FocusArea | "")}>
          <option value="">Choose</option>
          {FOCUS_AREAS.filter((a) => a.id !== "reference").map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Your notes for the player</span>
        <textarea className="field mt-1 min-h-24 w-full" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() => run(() => saveAssessment({ analysis_id: q.id, coach_id: coachId, agrees, focus: focus || null, notes, reviewed: true }), "Saved and marked reviewed. The player sees it with their report.")}
      >
        Save and mark reviewed
      </button>

      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="text-sm font-medium">Assign to the player</legend>
        <label className="block text-sm">
          <span className="text-fg-muted">Drill</span>
          <input className="field mt-1 w-full" maxLength={120} value={drill} onChange={(e) => setDrill(e.target.value)} placeholder="For example: mirror drill, 3 sets of 10" />
        </label>
        <label className="block text-sm">
          <span className="text-fg-muted">Check again by</span>
          <input type="date" className="field mt-1 w-full" value={retest} onChange={(e) => setRetest(e.target.value)} />
        </label>
        <button
          className="btn btn-ghost"
          disabled={busy || (!drill.trim() && !focus)}
          onClick={() =>
            run(async () => {
              await addAssignment({ player_id: q.owner_id, analysis_id: q.id, focus: focus || null, drill, retest_by: retest || null, note: "" });
              setDrill("");
              setRetest("");
            }, "Assigned. The player sees it beside this report.")
          }
        >
          Assign
        </button>
      </fieldset>
      {done && <p role="status" className="text-sm text-ok">{done}</p>}
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
    </div>
  );
}

function SquadsSection({ squads, players, onChange }: { squads: Squad[]; players: Player[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const act = async (f: () => Promise<void>) => {
    setErr(null);
    try {
      await f();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    }
  };
  return (
    <Section title="Squads" note="Group your players to review them together. Only players linked to you can be added.">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          act(async () => {
            await createSquad(name);
            setName("");
          });
        }}
      >
        <label className="sr-only" htmlFor="squad-name">Squad name</label>
        <input id="squad-name" className="field min-w-0 flex-1" maxLength={60} placeholder="For example: Under 15s" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim()}>Add squad</button>
      </form>
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      <ul className="space-y-2">
        {squads.map((s) => (
          <li key={s.id} className="panel space-y-2 p-4">
            <p className="font-medium">{s.name} <span className="font-normal text-fg-subtle">· {s.members.length} {s.members.length === 1 ? "player" : "players"}</span></p>
            <ul className="flex flex-wrap gap-2">
              {players.map((p) => {
                const inIt = s.members.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={inIt}
                      onClick={() => act(() => (inIt ? removeFromSquad(s.id, p.id) : addToSquad(s.id, p.id)))}
                      className={`min-h-11 rounded-full border px-4 text-sm ${inIt ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted"}`}
                    >
                      {p.name}
                    </button>
                  </li>
                );
              })}
              {players.length === 0 && <li className="text-sm text-fg-muted">No linked players yet.</li>}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}
