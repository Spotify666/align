"use client";
// What a player's coaches said about one of their shots, and what they assigned: shown with the
// player's report, labelled as the coach's own view. Aline's result above it is unchanged. The
// player can mark an assignment done; nothing else here is theirs to change.

import { useEffect, useState } from "react";
import { currentUser } from "@/lib/cloud";
import { listAssessments, listAssignments, setAssignmentStatus, type Assessment, type Assignment } from "@/lib/coach";
import { FOCUS_AREAS } from "@/lib/store";

const AGREE_WORDS = { agree: "agrees with Aline's result", disagree: "disagrees with Aline's result", unsure: "isn't sure about Aline's result" } as const;
const focusLabel = (f: string | null) => (f ? FOCUS_AREAS.find((a) => a.id === f)?.label ?? f : null);

export function CoachFeedback({ analysisId }: { analysisId: string }) {
  const [me, setMe] = useState<string | null>(null);
  const [views, setViews] = useState<Assessment[]>([]);
  const [tasks, setTasks] = useState<Assignment[]>([]);

  const load = () =>
    Promise.all([listAssessments([analysisId]), listAssignments(analysisId)])
      .then(([a, b]) => {
        setViews(a);
        setTasks(b);
      })
      .catch(() => {});

  useEffect(() => {
    currentUser()
      .then((u) => {
        setMe(u?.id ?? null);
        if (u) load();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  // Only the player's own view of their coaches' words; a coach sees theirs in the workspace.
  const forMe = views.filter((v) => v.coach_id !== me);
  const myTasks = tasks.filter((t) => t.player_id === me && t.status !== "cancelled");
  if (!me || (!forMe.length && !myTasks.length)) return null;

  return (
    <section aria-labelledby="coach-fb-h" className="panel space-y-4 p-5">
      <header>
        <h2 id="coach-fb-h" className="text-xl font-semibold">From your coach</h2>
        <p className="text-sm text-fg-muted">Your coach&apos;s own view. Aline&apos;s result above stays as it is.</p>
      </header>
      {forMe.map((v) => (
        <div key={v.id} className="space-y-1 text-sm">
          {v.agrees && <p className="text-fg-muted">Your coach {AGREE_WORDS[v.agrees]}.</p>}
          {v.focus && <p><span className="text-fg-subtle">Work on: </span>{focusLabel(v.focus)}</p>}
          {v.notes && <p className="whitespace-pre-line">{v.notes}</p>}
        </div>
      ))}
      {myTasks.length > 0 && (
        <ul className="space-y-2">
          {myTasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{[focusLabel(t.focus), t.drill].filter(Boolean).join(" · ") || "Assignment"}</span>
                {t.retest_by && <span className="block text-fg-muted">Check again by {new Date(t.retest_by).toLocaleDateString()}</span>}
              </span>
              <button
                className={`btn ${t.status === "done" ? "btn-ghost" : "btn-primary"} !min-h-11`}
                aria-pressed={t.status === "done"}
                onClick={async () => {
                  await setAssignmentStatus(t.id, t.status === "done" ? "open" : "done").catch(() => {});
                  load();
                }}
              >
                {t.status === "done" ? "Done" : "Mark done"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
