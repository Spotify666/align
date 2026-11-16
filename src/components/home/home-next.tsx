"use client";
// The app home's "what to do next" (docs/13, section 3): the last result in its own first
// sentence, the one thing to work on, and a count of what has been checked so far. It reads
// the device's saved shots only. The panel keeps one height whether or not there is a shot yet,
// so nothing under it moves when the shots arrive.

import Link from "next/link";
import { useEffect, useState } from "react";
import { plainSummary, readingLevel } from "@/engine/summary";
import { listAnalyses, loadProfile, type StoredAnalysis } from "@/lib/store";

export function HomeNext() {
  const [shots, setShots] = useState<StoredAnalysis[] | null>(null);

  useEffect(() => {
    listAnalyses()
      .then((all) => setShots([...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(() => setShots([]));
  }, []);

  const last = shots?.[0] ?? null;
  const confirmed = shots?.filter((s) => s.payload.analysis_status === "valid").length ?? 0;

  let verdict: string | null = null;
  let fix: string | null = null;
  if (last) {
    const profile = loadProfile();
    const sum = plainSummary(last.payload, {
      level: readingLevel(profile.ageBand, last.session?.level ?? profile.level),
      unchosen: last.session?.intended === null,
    });
    verdict = sum.verdict;
    fix = sum.lines.find((l) => l.kind === "fix")?.text ?? null;
  }

  return (
    <section aria-labelledby="next-h" className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <div className="panel flex min-h-[13.5rem] flex-col justify-between gap-4 p-5 sm:min-h-[11rem] sm:p-6">
        <div>
          <h2 id="next-h" className="text-sm font-medium text-fg-subtle">{last ? "Your last shot" : "Your shots"}</h2>
          {shots === null ? (
            <p className="mt-2 text-fg-muted">Reading your shots…</p>
          ) : last ? (
            <>
              <p className="display mt-2 text-xl sm:text-2xl">{verdict}</p>
              {fix && <p className="mt-2 text-fg-muted">Next: {fix}</p>}
            </>
          ) : (
            <p className="mt-2 max-w-md text-fg-muted">Nothing checked yet. After your first shot, the result and the one thing to work on appear here.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {last ? (
            <>
              <Link href={`/report/${last.id}`} className="btn btn-ghost">Open the report</Link>
              <Link href="/progress" className="inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4">
                {shots!.length === 1 ? "1 shot checked" : `${shots!.length} shots checked`}, {confirmed} confirmed
              </Link>
            </>
          ) : (
            <Link href="/sample" className="inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4">See what a result looks like</Link>
          )}
        </div>
      </div>
    </section>
  );
}
