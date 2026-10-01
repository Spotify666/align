"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { currentUser } from "@/lib/cloud";
import { SHOT_CLASSES } from "@/engine/types";
import { SHOT_DISPLAY } from "@/engine/classify";
import type { AnalysisPayload } from "@/engine/types";

type Row = { id: string; author_id: string; kind: string; frame: number | null; body: Record<string, string>; created_at: string };
const KINDS = [
  { id: "note", label: "Note" },
  { id: "shot_override", label: "Coach shot call" },
  { id: "dismiss_finding", label: "Dismiss a finding" },
  { id: "drill_assignment", label: "Assign a drill" },
] as const;

/**
 * Coach and athlete annotations. Stored in their own table and shown beside the
 * model result — they never overwrite it.
 */
export function Annotations({ analysisId, payload }: { analysisId: string; payload: AnalysisPayload }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("note");
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase().from("annotations").select("id, author_id, kind, frame, body, created_at").eq("analysis_id", analysisId).order("created_at");
    if (!error) setRows((data as Row[]) ?? []);
  };
  useEffect(() => {
    currentUser().then((u) => {
      setMe(u?.id ?? null);
      if (u) load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  if (!me || rows === null) return null;
  const options =
    kind === "shot_override"
      ? SHOT_CLASSES.map((c) => ({ v: c, l: SHOT_DISPLAY[c] }))
      : kind === "dismiss_finding"
        ? [...payload.priorities, ...payload.strengths].map((f) => ({ v: f.metricId, l: f.title }))
        : kind === "drill_assignment"
          ? payload.drill_candidates.map((d) => ({ v: d.id, l: d.name }))
          : [];

  return (
    <section className="card p-5 space-y-3" aria-labelledby="notes-h">
      <h2 id="notes-h" className="font-semibold">Coach and athlete notes</h2>
      <p className="text-xs text-fg-subtle">Notes and shot calls sit beside the model result and never change it.</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="text-sm border-l-2 border-brand/50 pl-3">
            <span className="text-fg-subtle num text-xs">{new Date(r.created_at).toLocaleString()} · {r.author_id === me ? "you" : "coach"} · {KINDS.find((k) => k.id === r.kind)?.label}</span>
            <p>{r.body.choiceLabel ? <strong>{r.body.choiceLabel}. </strong> : null}{r.body.text}</p>
          </li>
        ))}
        {!rows.length && <li className="text-sm text-fg-muted">No notes yet.</li>}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[10rem_1fr]"
        onSubmit={async (e) => {
          e.preventDefault();
          const label = options.find((o) => o.v === choice)?.l;
          const { error } = await supabase().from("annotations").insert({ analysis_id: analysisId, author_id: me, kind, body: { text, choice, choiceLabel: label ?? "" } });
          if (error) return setErr(error.message);
          setText("");
          setChoice("");
          setErr(null);
          load();
        }}
      >
        <select className="field" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setChoice(""); }} aria-label="Note type">
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
        {options.length > 0 && (
          <select className="field" value={choice} onChange={(e) => setChoice(e.target.value)} required aria-label="Choose">
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        )}
        <textarea className="field sm:col-span-2 min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you see?" maxLength={2000} required aria-label="Note" />
        <button className="btn btn-primary sm:col-span-2 sm:justify-self-start">Add</button>
        {err && <p className="text-sm text-bad sm:col-span-2" role="alert">{err}</p>}
      </form>
    </section>
  );
}
