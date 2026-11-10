"use client";

import { PageLoading } from "@/components/common/page-loading";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { combineAngles, type AngleMeasure, type CombinedAngles } from "@/engine/angles";
import { friendlyValue, readingLevel, type ReadingLevel } from "@/engine/summary";
import { plainReading } from "@/engine/plain";
import { getAnalysis, loadProfile, type StoredAnalysis } from "@/lib/store";
import { Camera, Check, Question, Record as RecordIcon } from "../icons";
import { STATUS_META } from "./status";
import { AngleChip, DetailsSwitch, LineIcon } from "./report-view";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; a: StoredAnalysis; b: StoredAnalysis };
const noSubscribe = () => () => {};

/** The status chip of a combined result. */
function metaOf(c: CombinedAngles) {
  if (c.status === "valid") return STATUS_META.valid;
  if (c.status === "invalid_for_requested_analysis") return STATUS_META.invalid_for_requested_analysis;
  if (c.status === "capture_failed") return STATUS_META.capture_failed;
  if (c.status === "uncertain_shot") return STATUS_META.uncertain_shot;
  return { ...STATUS_META.uncertain_shot, short: "Not combined" };
}

/**
 * The same ball from two angles, as one refined result: the answer and at most four plain lines,
 * labelled "Side + front angle"; each check, and which angle read it, behind "Details". Each
 * clip's own report is unchanged and one tap away.
 */
export function AnglesReport() {
  const q = useSearchParams();
  const ida = q.get("a");
  const idb = q.get("b");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [details, setDetails] = useState(false);
  const level = useSyncExternalStore(noSubscribe, () => readingLevel(loadProfile().ageBand), () => "plain" as ReadingLevel);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, b] = ida && idb ? await Promise.all([getAnalysis(ida), getAnalysis(idb)]) : [null, null];
      if (alive) setState(a && b ? { kind: "ready", a, b } : { kind: "missing" });
    })().catch(() => alive && setState({ kind: "missing" }));
    return () => {
      alive = false;
    };
  }, [ida, idb]);

  const c = useMemo(() => (state.kind === "ready" ? combineAngles(state.a.payload, state.b.payload, level) : null), [state, level]);

  if (state.kind === "loading") return <PageLoading what="Opening both angles of the ball…" />;
  if (state.kind === "missing" || !c)
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-16">
        <h1 className="display text-4xl">Both clips aren&apos;t on this device</h1>
        <p className="text-fg-muted">Both angles have to be on this phone to be shown together. Open them from Sessions.</p>
        <Link href="/sessions" className="btn btn-primary">Open sessions</Link>
      </div>
    );

  const meta = metaOf(c);
  const idOf = (p: CombinedAngles["side"]) => (p ? (p.analysis_id === state.a.payload.analysis_id ? state.a.id : state.b.id) : null);
  const sideId = idOf(c.side);
  const endId = idOf(c.end);
  const endWord = c.end?.camera_view === "behind" ? "back" : "front";
  const recordHref = c.shot === "back_foot_defence" ? "/analyse?shot=back" : "/analyse";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-3 text-sm text-fg-subtle">
        <Link href="/sessions" className="hover:text-fg">Sessions</Link>
        <span aria-hidden>/</span>
        <span className="text-fg-muted">Both angles</span>
      </div>

      <section aria-labelledby="verdict" className={`card overflow-hidden border ${meta.ring}`}>
        <div className="px-5 py-5 sm:px-7 sm:py-7">
          <div className="flex items-start justify-between gap-3">
            <span className={`chip ${meta.ring} ${meta.tone} text-sm`}>
              <meta.Icon size={16} /> {meta.short}
            </span>
            <AngleChip label={c.summary.angle.short} />
          </div>
          <h1 id="verdict" className="display mt-4 max-w-3xl text-[1.9rem] leading-[1.08] sm:text-5xl">{c.summary.verdict}</h1>
          {c.summary.lines.length > 0 && (
            <ul className="mt-5 max-w-2xl space-y-3" aria-label="Summary">
              {c.summary.lines.map((l) => (
                <li key={l.text} className="flex items-start gap-3 text-[1.05rem] leading-snug">
                  <LineIcon kind={l.kind} />
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Link href={recordHref} className="btn btn-primary"><RecordIcon size={16} /> Record again</Link>
            <DetailsSwitch on={details} onChange={setDetails} />
          </div>
        </div>
      </section>

      {details && (
        <div id="report-details" className="space-y-6">
          <section aria-labelledby="angles-h" className="card p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <h2 id="angles-h" className="text-lg font-semibold">Each check, and the angle that read it</h2>
              <p className="text-sm sm:max-w-[18rem] sm:text-right">
                <span className="inline-flex items-center gap-1.5 font-semibold"><Camera size={15} aria-hidden /> {c.summary.angle.short}</span>
                <span className="block text-fg-muted">{c.summary.angle.long}</span>
              </p>
            </div>
            {c.measures.length > 0 ? (
              <ul className="mt-4 divide-y divide-line border-y border-line" aria-label={`Each check from the side and from the ${endWord}`}>
                {c.measures.map((m) => (
                  <MeasureItem key={m.key} m={m} numbers={level !== "simple"} endWord={endWord} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-fg-muted">No checks are combined: the shot wasn&apos;t confirmed from both angles together. Each clip&apos;s own report still shows what it could see.</p>
            )}
          </section>
          <div className="flex flex-wrap gap-3">
            {sideId && <Link href={`/report/${sideId}`} className="btn btn-ghost">Open the side report</Link>}
            {endId && <Link href={`/report/${endId}`} className="btn btn-ghost">Open the {endWord} report</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function MeasureItem({ m, numbers, endWord }: { m: AngleMeasure; numbers: boolean; endWord: string }) {
  const Icon = m.inRange === true ? Check : m.inRange === null ? Question : null;
  const read = (label: string, x: AngleMeasure["side"]) => (x ? `${label}: ${numbers ? friendlyValue(x) : x.inRange === true ? "good" : x.inRange === false ? "to fix" : "seen"}` : null);
  const where = [read("Side", m.side), read(endWord[0]!.toUpperCase() + endWord.slice(1), m.end)].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${m.inRange === true ? "bg-ok/15 text-ok" : m.inRange === false ? "bg-bad/15 text-bad" : "bg-tint text-fg"}`}>
        {Icon ? <Icon size={14} aria-hidden /> : <span aria-hidden className="text-sm font-bold">!</span>}
        <span className="sr-only">{m.inRange === true ? "Good:" : m.inRange === false ? "To fix:" : "Not marked:"}</span>
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{m.inRange === null ? m.metric.name : plainReading(m.metric)}</span>
        <span className="block text-sm text-fg-muted">{where}</span>
        {m.disagree && <span className="block text-sm text-fg-subtle">The two angles disagree, so it isn&apos;t marked.</span>}
        {m.from === "both" && !m.disagree && <span className="block text-sm text-fg-subtle">Both angles agree.</span>}
      </span>
    </li>
  );
}
