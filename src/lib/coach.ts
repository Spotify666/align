// The coach workspace's data: squads, the review queue, a coach's own assessment of a shot,
// assignments, the history of what was done, and an export. The database decides who may read
// or write what (migration 20261114000200); a coach never edits Aline's result.

import { supabase } from "./supabase/client";
import type { FocusArea } from "@/engine/category";

export type Agreement = "agree" | "disagree" | "unsure";

export interface QueueItem {
  id: string;
  owner_id: string;
  title: string | null;
  recorded_at: string;
  status: "valid" | "invalid_for_requested_analysis" | "uncertain_shot" | "capture_failed";
  observed_label: string | null;
  capture_confidence: number;
  requested_shot: string;
}

export interface Assessment {
  id: string;
  analysis_id: string;
  coach_id: string;
  agrees: Agreement | null;
  focus: FocusArea | null;
  notes: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface Assignment {
  id: string;
  coach_id: string;
  player_id: string;
  analysis_id: string | null;
  focus: FocusArea | null;
  drill: string | null;
  retest_by: string | null;
  note: string | null;
  status: "open" | "done" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface Squad {
  id: string;
  name: string;
  members: string[];
}

export interface HistoryRow {
  id: number;
  action: string;
  subject_type: string;
  subject_id: string | null;
  subject_owner: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/**
 * The review queue's order: shots not yet reviewed first, then the least clear recordings
 * (they most need a coach's eye), then the newest.
 */
export function queueOrder(items: QueueItem[], reviewed: ReadonlySet<string>): QueueItem[] {
  return [...items].sort(
    (a, b) =>
      Number(reviewed.has(a.id)) - Number(reviewed.has(b.id)) ||
      a.capture_confidence - b.capture_confidence ||
      b.recorded_at.localeCompare(a.recorded_at),
  );
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote every cell; a leading = + - @ is neutralised so a spreadsheet never runs it as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const RESULT_WORDS: Record<QueueItem["status"], string> = {
  valid: "Confirmed",
  invalid_for_requested_analysis: "Another shot",
  uncertain_shot: "Not confirmed",
  capture_failed: "Couldn't read the recording",
};
const resultWords = (s: QueueItem["status"] | undefined) => (s ? RESULT_WORDS[s] ?? s : "");

/** The coach's assessments and assignments as one CSV, for their own records. */
export function exportCsv(rows: {
  players: Map<string, string>;
  analyses: Map<string, QueueItem>;
  assessments: Assessment[];
  assignments: Assignment[];
}): string {
  const head = ["type", "player", "shot", "recorded", "aline_result", "coach_agrees", "focus", "notes_or_drill", "retest_by", "status", "updated"];
  const lines = [head.map(cell).join(",")];
  for (const a of rows.assessments) {
    const an = rows.analyses.get(a.analysis_id);
    lines.push(
      ["assessment", an ? rows.players.get(an.owner_id) ?? "" : "", an?.title ?? "", an?.recorded_at ?? "", resultWords(an?.status), a.agrees ?? "", a.focus ?? "", a.notes ?? "", "", a.reviewed_at ? "reviewed" : "", a.updated_at]
        .map(cell)
        .join(","),
    );
  }
  for (const s of rows.assignments) {
    const an = s.analysis_id ? rows.analyses.get(s.analysis_id) : undefined;
    lines.push(
      ["assignment", rows.players.get(s.player_id) ?? "", an?.title ?? "", an?.recorded_at ?? "", resultWords(an?.status), "", s.focus ?? "", [s.drill, s.note].filter(Boolean).join(" · "), s.retest_by ?? "", s.status, s.updated_at]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// ---------- Reads and writes (row-level security decides what each returns) ----------

const db = () => supabase();
const ok = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export async function listSquads(): Promise<Squad[]> {
  const squads = ok(await db().from("squads").select("id, name").order("created_at")) as Array<{ id: string; name: string }>;
  if (!squads.length) return [];
  const members = ok(await db().from("squad_members").select("squad_id, player_id").in("squad_id", squads.map((s) => s.id))) as Array<{ squad_id: string; player_id: string }>;
  return squads.map((s) => ({ ...s, members: members.filter((m) => m.squad_id === s.id).map((m) => m.player_id) }));
}

export async function createSquad(name: string) {
  ok(await db().from("squads").insert({ name: name.trim() }));
}

export async function addToSquad(squadId: string, playerId: string) {
  ok(await db().from("squad_members").insert({ squad_id: squadId, player_id: playerId }));
}

export async function removeFromSquad(squadId: string, playerId: string) {
  ok(await db().from("squad_members").delete().eq("squad_id", squadId).eq("player_id", playerId));
}

export async function listQueue(playerIds: string[]): Promise<QueueItem[]> {
  if (!playerIds.length) return [];
  return ok(
    await db()
      .from("analyses")
      .select("id, owner_id, title, recorded_at, status, observed_label, capture_confidence, requested_shot")
      .in("owner_id", playerIds)
      .order("recorded_at", { ascending: false })
      .limit(100),
  ) as QueueItem[];
}

/** Assessments: a coach gets their own; a player gets their coaches' on the shots asked for. */
export async function listAssessments(analysisIds?: string[]): Promise<Assessment[]> {
  let q = db().from("coach_assessments").select("id, analysis_id, coach_id, agrees, focus, notes, reviewed_at, updated_at");
  if (analysisIds) q = q.in("analysis_id", analysisIds.length ? analysisIds : ["00000000-0000-0000-0000-000000000000"]);
  return ok(await q.order("updated_at", { ascending: false })) as Assessment[];
}

export async function saveAssessment(a: { analysis_id: string; coach_id: string; agrees: Agreement | null; focus: FocusArea | null; notes: string; reviewed: boolean }) {
  ok(
    await db()
      .from("coach_assessments")
      .upsert(
        { analysis_id: a.analysis_id, coach_id: a.coach_id, agrees: a.agrees, focus: a.focus, notes: a.notes.trim() || null, reviewed_at: a.reviewed ? new Date().toISOString() : null },
        { onConflict: "analysis_id,coach_id" },
      ),
  );
}

/** Assignments: a coach gets the ones they set; a player gets theirs. */
export async function listAssignments(analysisId?: string): Promise<Assignment[]> {
  let q = db().from("assignments").select("id, coach_id, player_id, analysis_id, focus, drill, retest_by, note, status, created_at, updated_at");
  if (analysisId) q = q.eq("analysis_id", analysisId);
  return ok(await q.order("created_at", { ascending: false })) as Assignment[];
}

export async function addAssignment(a: { player_id: string; analysis_id: string | null; focus: FocusArea | null; drill: string; retest_by: string | null; note: string }) {
  ok(await db().from("assignments").insert({ ...a, drill: a.drill.trim() || null, note: a.note.trim() || null }));
}

export async function setAssignmentStatus(id: string, status: Assignment["status"]) {
  ok(await db().from("assignments").update({ status }).eq("id", id));
}

export async function listHistory(limit = 40): Promise<HistoryRow[]> {
  return ok(
    await db()
      .from("audit_log")
      .select("id, action, subject_type, subject_id, subject_owner, detail, created_at")
      .in("subject_type", ["squads", "squad_members", "coach_assessments", "assignments", "coach_link"])
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as HistoryRow[];
}
