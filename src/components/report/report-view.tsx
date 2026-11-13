"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AnalysisPayload, CaptureObservation, Metric, TargetShot } from "@/engine/types";
import { TARGET_SHOTS } from "@/engine/types";
import type { BaselineComparison } from "@/engine/baseline";
import { templateReport, type Report } from "@/engine/report";
import { SHOT_DISPLAY } from "@/engine/classify";
import { DOMAIN_LABELS, THRESHOLDS } from "@/engine/registry";
import { type CompareReference, EvidenceViewer, type EvidenceViewerHandle } from "./evidence-viewer";
import { ResultPanel } from "./result-panel";
import { buildResult } from "@/engine/result";
import { pointsTo } from "@/engine/identify";
import { timeEnd, timeStart } from "@/lib/capture/timing";
import { MetricCard } from "./metric-card";
import { CaptureChecklist, DomainGrid, Limitations, PriorityPlan, ShotProbabilityPanel, Versions } from "./panels";
import { ConfidenceChip, DemoBadge, STATUS_META, statusKey } from "./status";
import { Camera, Check, Cross, Download, Info, Question, Record as RecordIcon, Target } from "../icons";
import { downloadReportPdf } from "@/lib/pdf";
import { Lesson } from "../lesson/lesson";
import { LinePanel } from "./line-panel";
import { ComparePanel } from "./compare-panel";
import { BackFootPanel } from "./back-foot-panel";
import { plainReading } from "@/engine/plain";
import { fixSentence, friendlyRange, friendlyValue, plainSummary, readingLevel, simpleGood, type ReadingLevel, type SummaryKind } from "@/engine/summary";
import { loadProfile } from "@/lib/store";

interface Props {
  payload: AnalysisPayload;
  obs: CaptureObservation;
  videoUrl?: string | null;
  mediaTimes?: number[] | null;
  keyframes?: Record<number, string>;
  baseline?: BaselineComparison[];
  reference?: CompareReference | null;
  narrative?: Report;
  actions?: React.ReactNode;
  /** Shown in the details, under the full verdict. */
  notice?: React.ReactNode;
  /** Where the batter marks the ball and bat on this clip (offered while it is still open). */
  markHref?: string | null;
  /** Optional: add the same ball from the other angle, or see both together once added. */
  angleLink?: { href: string; label: string } | null;
  title?: string;
  /** The on-device analysis id, for comparing with other shots and sharing this one. */
  analysisId?: string;
  /** Re-run the same tracks as another shot Aline analyses (offered when the shot was named as one). */
  onAnalyseAs?: (target: TargetShot) => Promise<void>;
  /** The batter left the shot to Aline: an unconfirmed result is worded without "is this a …". */
  unchosen?: boolean;
  /** The printed layout of this report (Save as PDF); without it the button makes the simple PDF. */
  printHref?: string;
}

const noSubscribe = () => () => {};

const SHOT_NAME: Record<TargetShot, string> = { front_foot_defence: "front-foot defence", back_foot_defence: "back-foot defence" };
const shotOf = (p: AnalysisPayload): TargetShot => p.requested_shot ?? "front_foot_defence";

export function ReportView({ payload: p, obs, videoUrl, mediaTimes, keyframes, baseline, reference, narrative, actions, notice, markHref, angleLink, title, analysisId, onAnalyseAs, unchosen, printHref }: Props) {
  const viewer = useRef<EvidenceViewerHandle>(null);
  const [switching, setSwitching] = useState(false);
  // The report opens on the summary; each section beyond it is drawn only when the batter opens it.
  const [section, setSection] = useState<ReportSection | null>(null);
  // An opened section is brought to the top of the screen (it starts below the summary).
  useEffect(() => {
    if (!section) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("report-section")?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  }, [section]);
  // Worded for the batter's age (profile); pages rendered ahead of time start from "plain".
  const level = useSyncExternalStore(noSubscribe, () => readingLevel(loadProfile().ageBand, loadProfile().level), () => "plain" as ReadingLevel);
  const shot = shotOf(p);
  const shotName = SHOT_NAME[shot];
  const observedLabel = p.observed_shot?.label;
  const otherTarget = observedLabel && observedLabel !== shot && (TARGET_SHOTS as readonly string[]).includes(observedLabel) ? (observedLabel as TargetShot) : null;
  // The other defence the same tracks can be checked as, when this result itself points to it.
  const switchTo: TargetShot | null = pointsTo(p);
  const sum = useMemo(() => plainSummary(p, { mediaKind: obs.media.kind, otherShot: onAnalyseAs ? switchTo : null, level, unchosen }), [p, obs.media.kind, onAnalyseAs, switchTo, level, unchosen]);
  const recordHref = shot === "back_foot_defence" ? "/check?shot=back" : "/check?shot=front";
  const [aiReport, setAiReport] = useState<Report | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "unavailable" | "fallback">("idle");
  const report = useMemo(() => aiReport ?? narrative ?? templateReport(p), [aiReport, narrative, p]);
  const askAi = async (audience: "player" | "coach" | "parent") => {
    setAiState("loading");
    try {
      const r = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: p, audience }) });
      const j = (await r.json()) as { configured: boolean; report: Report; fellBackToTemplate: boolean };
      setAiReport(j.report);
      setAiState(!j.configured ? "unavailable" : j.fellBackToTemplate ? "fallback" : "idle");
    } catch {
      setAiState("unavailable");
    }
  };
  // A photo whose position passes the check reads as a pass.
  const photoPass = p.position_check && ["matches", "mostly"].includes(p.position_check.verdict);
  const meta = photoPass
    ? { ...STATUS_META.valid, label: "Photo check" }
    : statusKey(p) === "valid" && shot !== "front_foot_defence"
      ? { ...STATUS_META.valid, label: `Shot identified: ${shotName}` }
      : STATUS_META[statusKey(p)];
  const contact = p.events.find((e) => e.type === "contact");
  // The typed result every evidence view reads: outcome, events with uncertainty, what was withheld.
  // Timed like every other step ("[align:time] result contract …") so its cost shows on a phone.
  const result = useMemo(() => {
    timeStart("result contract");
    const r = buildResult(p, obs);
    timeEnd("result contract");
    return r;
  }, [p, obs]);
  const t0 = obs.t[0] ?? 0;
  const seek = (frame: number, metricId?: string) => {
    if (viewer.current) return viewer.current.seek(frame, metricId);
    // The viewer lives in Evidence: open it, then go.
    setSection("evidence");
    requestAnimationFrame(() => requestAnimationFrame(() => viewer.current?.seek(frame, metricId)));
  };
  const seekId = (id: string) => {
    const f = /^frame_(\d+)$/.exec(id)?.[1];
    if (f) return seek(Number(f));
    const e = p.events.find((x) => x.id === id);
    if (e) return seek(e.frame);
    const m = /^metric_(.+)$/.exec(id)?.[1];
    const target = m ? `metric_${m}` : id;
    const go = () => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (document.getElementById(target)) return go();
    // Every measure sits in Technical details, drawn when opened: open it, then go.
    setSection("technical");
    requestAnimationFrame(() => requestAnimationFrame(go));
  };
  const base = (id: string) => baseline?.find((b) => b.metricId === id);
  const isValid = p.analysis_status === "valid";

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-fg-subtle">
        <Link href="/sessions" className="hover:text-fg">Sessions</Link>
        <span aria-hidden>/</span>
        <span className="text-fg-muted">{title ?? p.label ?? "Analysis"}</span>
        <DemoBadge show={p.demo} />
        <span className="ml-auto flex flex-wrap gap-2">
          {printHref ? (
            <Link href={printHref} prefetch={false} className="btn btn-ghost !min-h-11 !py-1.5 text-sm">
              <Download size={16} /> PDF
            </Link>
          ) : (
            <PdfButton onClick={() => downloadReportPdf(p, { title: title ?? p.label, evidenceImage: viewer.current?.snapshot() ?? null })} />
          )}
          {actions}
        </span>
      </div>

      {/* The answer first, in at most five plain sentences; everything else behind "Details". */}
      <section aria-labelledby="verdict" className={`card overflow-hidden border ${meta.ring}`}>
        <div className="px-5 py-5 sm:px-7 sm:py-7">
          <div className="flex items-start justify-between gap-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className={`chip ${meta.ring} ${meta.tone} text-sm`}>
                <meta.Icon size={16} /> {meta.short}
              </span>
              {p.handedness === "left" && <span className="chip border-line-strong text-fg-muted">Left-handed</span>}
            </span>
            <AngleChip label={sum.angle.short} />
          </div>
          <h1 id="verdict" className="display mt-4 text-[1.9rem] leading-[1.08] sm:text-5xl max-w-3xl">{sum.verdict}</h1>
          {sum.lines.length > 0 && (
            <ul className="mt-5 space-y-3 max-w-2xl" aria-label="Summary">
              {sum.lines.map((l) => (
                <li key={l.text} className="flex items-start gap-3 text-[1.05rem] leading-snug">
                  <LineIcon kind={l.kind} />
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {switchTo && onAnalyseAs && (
              <button
                className="btn btn-primary"
                disabled={switching}
                onClick={async () => {
                  setSwitching(true);
                  try {
                    await onAnalyseAs(switchTo);
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                {switching ? "Checking…" : `Check as ${SHOT_NAME[switchTo]}`}
              </button>
            )}
            {markHref && (
              <Link href={markHref} className={`btn ${switchTo && onAnalyseAs ? "btn-ghost" : "btn-primary"}`}>Add ball and bat</Link>
            )}
            {!(switchTo && onAnalyseAs) && !markHref && (
              <Link href={recordHref} className="btn btn-primary"><RecordIcon size={16} /> Record again</Link>
            )}
          </div>
        </div>
      </section>

      {angleLink && (
        <p className="-mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link href={angleLink.href} className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
            <Camera size={16} aria-hidden /> {angleLink.label}
          </Link>
          <span className="text-fg-subtle">Optional: a second camera gives a more exact result.</span>
        </p>
      )}

      <SectionTabs value={section} onChange={setSection} />

      {section && (
      <div id="report-section" className="scroll-mt-20 space-y-8">
      {/* Evidence: what was seen, on which frames, and how each part of the line read. */}
      {section === "evidence" && (
        <>
        <section aria-labelledby="why-h" className="card p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-fg-subtle">{meta.label}</p>
            <p className="max-w-[16rem] text-right text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold"><Camera size={15} aria-hidden /> {sum.angle.short}</span>
              <span className="block text-fg-muted">{sum.angle.long}</span>
            </p>
          </div>
          <h2 id="why-h" className="display mt-3 text-2xl sm:text-3xl max-w-4xl">{p.headline}</h2>
            {notice}
            {!isValid && p.mode !== "posture_screen" && (
              <p className="mt-3 text-sm text-fg-muted">No technique score: a score is only given to a confirmed {shotName}.</p>
            )}
            {p.back_foot_checks && <DefinitionChecks checks={p.back_foot_checks} />}
            {p.analysis_status === "invalid_for_requested_analysis" && p.observed_shot && (
              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className="text-lg">
                    Most likely: <strong>{p.observed_shot.label === "unknown" ? p.observed_shot.display : SHOT_DISPLAY[p.observed_shot.label]}</strong>
                    </p>
                  <p className="mt-1 text-fg-muted">
                    Evidence:{" "}
                    {p.features
                      .filter((f) => p.observed_shot!.evidence_ids.includes(f.id))
                      .map((f) => f.reading)
                      .join("; ")}
                    .
                  </p>
                </div>
                {contact && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-ghost" onClick={() => seek(contact.frame)}>
                      <Target size={16} /> Review evidence at {((contact.tMs - t0) / 1000).toFixed(2)} s
                    </button>
                  </div>
                )}
                <p className="sm:col-span-2 text-xs text-fg-subtle">
                  {otherTarget
                    ? `Aline analyses the front-foot and the back-foot defence. The same tracks can be re-checked as a ${SHOT_NAME[otherTarget]}, against that shot's own bar.`
                    : "Other shot types unlock only when they pass the same validation bar as the front-foot and back-foot defences."}
                </p>
              </div>
            )}
        </section>

        <KeyChecks p={p} onSeek={seek} level={level} />

        <LinePanel payload={p} fps={obs.media.fps} onSeek={(f) => seek(f)} />

        <BackFootPanel payload={p} fps={obs.media.fps} onSeek={(f) => seek(f)} />

        <EvidenceViewer ref={viewer} obs={obs} payload={p} videoUrl={videoUrl} mediaTimes={mediaTimes} keyframes={keyframes} reference={reference} result={result} />

        <DeliveryPanel payload={p} onSeek={seekId} />

        {p.mode === "posture_screen" && p.metrics.some((m) => m.value !== null) && (
          <section aria-labelledby="posture-h" className="space-y-4">
            <SectionHead
              id="posture-h"
              eyebrow={positionGraded(p) ? `${shotName[0]!.toUpperCase()}${shotName.slice(1)} formula` : "Posture screen"}
              title={positionGraded(p) ? `Position check: ${p.position_check!.met} of ${p.position_check!.checked} met` : p.photo_set ? "What the photos show" : "What the photo shows"}
              note={
                positionGraded(p)
                  ? p.position_check?.angled
                    ? "Checked from one photo taken at an angle: the knees, the lean and where your weight is. Stride, head and hands need a side-on photo. A video shows the whole shot."
                    : "Checked from one photo, taken to be the moment the ball meets the bat. A video shows the whole shot."
                  : p.position_check?.verdict === "not_side_on"
                    ? shot === "back_foot_defence"
                      ? "Taken at an angle, so the feet and head can't be placed reliably. Shown, not graded. A side-on photo, or one from the bowler's end, gets checked."
                      : "Taken from the bowler's end or behind, so the stride and lean can't be judged. Shown, not graded. A side-on photo gets checked."
                    : "Estimates from still images. Not graded: too little of the batter is visible to check the position."
              }
            />
            {p.photo_set && (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <caption className="sr-only">Posture observations for each photo</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-subtle">
                      <th className="px-4 py-2.5 font-medium">Photo</th>
                      {p.photo_set[0]!.observations.map((m) => (
                        <th key={m.id} className="px-3 py-2.5 font-medium">{m.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {p.photo_set.map((ph) => (
                      <tr key={ph.frame}>
                        <td className="px-4 py-2.5">
                          <button className="font-medium text-brand hover:underline" onClick={() => seek(ph.frame)}>
                            Photo {ph.frame + 1}
                          </button>
                          {ph.phase && <span className="ml-1.5 text-fg-subtle capitalize">· {ph.phase}</span>}
                        </td>
                        {ph.observations.map((m) => (
                          <td key={m.id} className={`num px-3 py-2.5 ${m.inRange === false ? "text-bad" : ""}`}>
                            {m.value !== null ? `${m.value.toFixed(m.decimals)} ${m.unit.replace("× stature", "×H")}` : <span className="text-fg-subtle">—</span>}
                            {m.inRange === true && <span className="ml-1 text-ok" aria-label="within range">✓</span>}
                            {m.inRange === false && <span className="ml-1" aria-label="outside range">!</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h3 className="text-sm text-fg-subtle">
              {p.photo_set ? `Key photo (${p.photo_set.find((x) => x.phase === "contact") ? "tagged contact" : "most complete"})` : positionGraded(p) ? "Checks" : "Observations"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {p.metrics.map((m) => (
                <MetricCard key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}

        {p.observations && p.observations.length > 0 && (
          <section aria-labelledby="obs-h" className="space-y-4">
            <SectionHead
              id="obs-h"
              eyebrow="Observations"
              title="What we could still see"
              note={`Body positions from the tracked frames. Not graded and no score: the shot wasn't confirmed as a ${shotName}.`}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {p.observations.map((m) => (
                <MetricCard key={m.id} m={m} onEvidence={seek} />
              ))}
            </div>
          </section>
        )}
        </>
      )}

      {/* Training: the one priority, its drills, and the report in words. */}
      {section === "training" && (
        <>
        <Lesson payload={p} obs={obs} />

        {p.plan && (
          <section id="plan" aria-labelledby="plan-h" className="space-y-4 scroll-mt-20">
            <SectionHead id="plan-h" eyebrow="Coaching plan" title="One priority, step by step to match speed" />
            <PriorityPlan plan={p.plan} />
            <div className="flex flex-wrap items-center gap-3">
              <Link href={shot === "back_foot_defence" ? "/check?shot=back" : "/check?shot=front"} className="btn btn-primary">
                <RecordIcon size={16} /> Record next attempt
              </Link>
              <span className="text-sm text-fg-muted">The next report shows the change against this one and your baseline.</span>
            </div>
          </section>
        )}
        {!p.plan && (
          <p className="text-fg-muted">
            {isValid ? "Nothing is out of its range in this one, so there is no single thing to train. Record another to keep it that way." : "A training plan is given once the shot is confirmed. The tips in the summary say what to change in the recording."}
          </p>
        )}

        <section aria-labelledby="narrative-h" className="space-y-3">
          <SectionHead id="narrative-h" eyebrow="Written report" title="In plain words" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fg-subtle">Rewrite for:</span>
            {(["player", "coach", "parent"] as const).map((a) => (
              <button key={a} className="chip border-line-strong text-fg-muted min-h-9 capitalize" disabled={aiState === "loading"} onClick={() => askAi(a)}>{a}</button>
            ))}
            {aiState === "loading" && <span className="text-fg-subtle">Writing… (checked against the evidence before it is shown)</span>}
            {aiState === "unavailable" && <span className="text-fg-subtle">AI writing isn&apos;t switched on for this site — showing the standard report.</span>}
            {aiState === "fallback" && <span className="text-warn">The AI draft didn&apos;t match the evidence, so the standard report is shown.</span>}
          </div>
          <div className="card p-5 sm:p-6 space-y-5">
            {report.sections.map((s) => (
              <div key={s.heading}>
                <h3 className="text-sm uppercase tracking-wider text-fg-subtle">{s.heading}</h3>
                <ul className="mt-2 space-y-2">
                  {s.sentences.map((x, i) => (
                    <li key={i} className="leading-relaxed">
                      {x.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
        </>
      )}

      {/* Comparison: this shot beside other profiles. */}
      {section === "comparison" && (
        <>
        <ComparePanel payload={p} fps={obs.media.fps} analysisId={analysisId} />
          {reference && <p className="text-sm text-fg-muted">Your previous attempt from the same camera angle can be laid over this one in Evidence.</p>}
          {!isValid && p.mode !== "posture_screen" && <p className="text-fg-muted">A shot is compared with others once it is confirmed. This one wasn&apos;t.</p>}
        </>
      )}

      {/* Progress: this shot against the batter's own earlier ones. */}
      {section === "progress" && <ProgressSection baseline={baseline} metrics={p.metrics} numbers={level !== "simple"} valid={isValid} />}

      {/* Technical details: how sure each part is, every measure, how the result was reached, versions. */}
      {section === "technical" && (
        <>
        <ResultPanel result={result} payload={p} obs={obs} />

        {isValid && (
          <>
            <section aria-labelledby="domains" className="space-y-4">
              <SectionHead id="domains" eyebrow="Seven domains" title="How the defence was executed" />
              <DomainGrid domains={p.domains} />
            </section>

            <section aria-labelledby="indicators" className="space-y-4">
              <SectionHead id="indicators" eyebrow="Movement indicators" title="Measures, ranges and evidence" note="Ranges are provisional coaching ranges, not population norms. Not-measured means the capture could not support it — never zero." />
              {(["alignment", "footwork", "head_trunk", "bat_contact", "setup", "sequence", "outcome"] as const).map((d) => {
                const ms = p.metrics.filter((m) => m.domain === d);
                if (!ms.length) return null;
                return (
                  <div key={d} className="space-y-3">
                    <h3 className="text-sm text-fg-subtle">{DOMAIN_LABELS[d]}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {ms.map((m) => (
                        <MetricCard key={m.id} m={m} baseline={base(m.id)} onEvidence={seek} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>


          </>
        )}
        {p.observed_shot && p.observed_shot.label !== "unknown" && (
          <p className="text-sm text-fg-muted">
            Shot named by the classifier: <strong className="text-fg">{SHOT_DISPLAY[p.observed_shot.label]}</strong>
            <span className="num"> · {Math.round(p.observed_shot.probability * 100)}% (a prototype score, not calibrated)</span>
          </p>
        )}
          <details className="card p-4 group">
              <summary className="list-none flex items-center justify-between min-h-9">
                <span className="font-semibold">Why this result</span>
                <span className="text-fg-subtle group-open:rotate-90 transition-transform">›</span>
              </summary>
              <ol className="mt-3 space-y-1.5 text-sm text-fg-muted">
                <li>1. Capture usable? <strong className="text-fg">{p.capture.status === "fail" ? "No" : p.capture.status === "warn" ? "Yes, with warnings" : "Yes"}</strong></li>
                <li>
                  2. Tracked: body <strong className="text-fg">{p.tracking.body.ok ? "yes" : "no"}</strong>, bat{" "}
                  <strong className="text-fg">{p.tracking.bat.ok ? p.tracking.bat.source.replace("_", " ") : "no"}</strong>, ball{" "}
                  <strong className="text-fg">{p.tracking.ball.ok ? p.tracking.ball.source.replace("_", " ") : "no"}</strong>
                </li>
                <li>3. Delivery: <strong className="text-fg">{p.delivery.available ? (p.delivery.lengthLabel ?? "—") : "not claimed"}</strong></li>
                <li>4–5. Shot family and compatibility: <strong className="text-fg">{meta.label}</strong></li>
                <li>6. Technique measured: <strong className="text-fg">{isValid ? "yes" : "no — withheld"}</strong></li>
              </ol>
              {p.features.length > 0 && (
                <ul className="mt-4 divide-y divide-line">
                  {p.features.map((f) => (
                    <li key={f.id} id={f.id} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                      <span>
                        {f.label} <span className="text-fg-subtle">· {f.reading}</span>
                      </span>
                      <span className="num text-xs text-fg-muted shrink-0">{f.value?.toFixed(2)} <span className="text-fg-subtle">{f.modality}</span></span>
                    </li>
                  ))}
                </ul>
              )}
              {p.shot_probabilities && p.classifier && (
                <div className="mt-4">
                  <ShotProbabilityPanel probs={p.shot_probabilities} coverage={p.classifier.evidenceCoverage} />
                </div>
              )}
            </details>
      {!isValid && (
        <section aria-labelledby="capture-h" className="space-y-3">
          <SectionHead id="capture-h" eyebrow="Capture quality" title="Checks on this recording" />
          <div className="card px-4">
            <CaptureChecklist checks={p.capture.checks} />
          </div>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Limitations payload={p} />
        <div className="card p-4">
          <p className="font-semibold mb-3">Reproducibility</p>
          <Versions payload={p} />
          <p className="mt-3 text-xs text-fg-subtle">The same tracks and engine version always produce this exact report (result hash).</p>
        </div>
      </div>
        </>
      )}
      </div>
      )}
    </div>
  );
}

const unitText = (u: string) => u.replace("× stature/s", "× height/s").replace("× stature", "× height");
const evidenceFrame = (m: Metric) => {
  const f = m.evidenceIds.map((id) => /^frame_(\d+)$/.exec(id)?.[1]).find(Boolean);
  return f !== undefined ? Number(f) : null;
};

/** The few things the batter needs, first: what went well, the one fix, the drill, the key numbers. */
/** A photo read side-on with enough of the batter visible: its checks are graded against the formula. */
const positionGraded = (p: AnalysisPayload) => !!p.position_check && !["not_side_on", "not_enough", "not_on_front_foot", "not_on_back_foot"].includes(p.position_check.verdict);

function KeyChecks({ p, onSeek, level }: { p: AnalysisPayload; onSeek: (frame: number, metricId?: string) => void; level: ReadingLevel }) {
  // Under 13: words only; older: friendly numbers (seconds, share of height) beside them.
  const numbers = level !== "simple";
  const isValid = p.analysis_status === "valid";
  const graded = isValid || positionGraded(p);
  const shown = (isValid || p.mode === "posture_screen" ? p.metrics : (p.observations ?? [])).filter((m) => m.status !== "not_measured" && m.value !== null);
  // With a verdict, only the checks that were graded: an ungraded estimate beside them reads like a score.
  const measured = shown.some((m) => m.inRange !== null) ? shown.filter((m) => m.inRange !== null) : shown;
  // Out-of-range first, then the rest, at most six.
  // Needs work first, then within range, then shown-but-not-graded; at most six.
  const order = (m: Metric) => (m.inRange === false ? 0 : m.inRange === true ? 1 : 2);
  const key = [...measured].sort((a, b) => order(a) - order(b)).slice(0, positionGraded(p) ? 7 : 6);
  const unread = p.position_check?.angled ? p.metrics.filter((m) => m.status === "not_measured") : [];
  const strength = p.strengths[0];
  const priority = p.priorities[0];
  const strongM = strength ? p.metrics.find((m) => m.id === strength.metricId) : undefined;
  const priorityM = priority ? p.metrics.find((m) => m.id === priority.metricId) : undefined;
  const drill = p.plan?.drills[0];
  return (
    <section aria-label="Summary" className="space-y-4">
      {graded && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            tone="ok"
            label="Doing well"
            title={strongM ? plainReading(strongM) : isValid ? "A sound defensive shape" : "Keep working on the shape"}
            text={strongM ? (numbers ? strongM.relevance : (simpleGood(strongM) ?? strongM.relevance)) : isValid ? "Every check is inside its range." : "None of the checks is inside its range yet."}
          />
          <SummaryCard
            tone={priorityM ? "bad" : "brand"}
            label={priorityM ? "Fix next" : "Next level"}
            title={priorityM ? plainReading(priorityM) : (p.plan?.priority.title ?? "Nothing urgent")}
            text={
              priorityM
                ? `${fixSentence(p, priorityM, "plain") ?? coachText(priority!.observation)}${numbers ? ` You: ${friendlyValue(priorityM)}; aim for ${friendlyRange(priorityM)}.` : ""}`
                : p.plan
                  ? `Every check is met. ${p.plan.consequence}`
                  : "Every check is met. Keep the same shape."
            }
          />
          <SummaryCard tone="brand" label="Drill" title={drill?.name ?? "Keep practising the same shape"} text={drill ? `${drill.dosage}. Cue: “${p.plan?.cue ?? drill.cue}”` : "Record again to compare."} />
        </div>
      )}
      {(p.analysis_status === "uncertain_shot" || p.analysis_status === "capture_failed") && p.mode !== "posture_screen" && p.recapture.length > 0 && (
        <div className="card p-4">
          <p className="eyebrow">To get a verdict next time</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {p.recapture.slice(0, 2).map((r) => (
              <li key={r} className="flex gap-2"><span aria-hidden className="text-brand">•</span>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {key.length > 0 && (
        <div className="card overflow-hidden">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">
            {graded ? "Your checks" : p.mode === "posture_screen" ? "What the photo shows" : "What we could still see"}
            {!graded && <span className="ml-2 font-normal text-fg-subtle">not graded</span>}
          </p>
          <ul className="divide-y divide-line">
            {key.map((m) => {
              const f = evidenceFrame(m);
              return (
                <li key={m.id}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-tint disabled:hover:bg-transparent"
                    disabled={f === null}
                    onClick={() => f !== null && onSeek(f, m.id)}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${m.inRange === true ? "bg-ok/15 text-ok" : m.inRange === false ? "bg-bad/15 text-bad" : "bg-line text-fg-subtle"}`} aria-hidden>
                      {m.inRange === true ? "✓" : m.inRange === false ? "!" : "·"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{graded ? plainReading(m) : m.name}</span>
                      <span className="block text-xs text-fg-subtle">
                        {graded && m.name !== plainReading(m) ? m.name : ""}
                        {numbers && m.inRange === false && m.range ? `${graded && m.name !== plainReading(m) ? " · " : ""}aim for ${friendlyRange(m)}` : ""}
                      </span>
                    </span>
                    {numbers && <span className="num shrink-0 text-sm">{friendlyValue(m)}</span>}
                    <span className="sr-only">{m.inRange === true ? "within range" : m.inRange === false ? "outside range" : "not graded"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {unread.length > 0 && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-fg-subtle">
              Not checked from this angle: {unread.map((m) => m.name.toLowerCase()).join(", ")}. A side-on photo checks them too.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** The coaching sentence of a finding, without the engine's "Measured … vs range …" tail. */
const coachText = (t: string) => t.replace(/\s*Measured .*$/, "");

function SummaryCard({ tone, label, title, text }: { tone: "ok" | "bad" | "brand"; label: string; title: string; text: string }) {
  const color = tone === "ok" ? "!text-ok" : tone === "bad" ? "!text-bad" : "!text-brand";
  return (
    <div className="card p-4">
      <p className={`eyebrow ${color}`}>{label}</p>
      <p className="mt-1.5 font-semibold leading-snug">{title}</p>
      <p className="mt-1 text-sm text-fg-muted">{text.replaceAll("× stature", "× your height")}</p>
    </div>
  );
}

/** Where the camera was, on the right of the summary. */
export function AngleChip({ label }: { label: string }) {
  return (
    <span className="chip shrink-0 border-fg text-sm text-fg" title="Where the camera was">
      <Camera size={15} aria-hidden /> {label}
    </span>
  );
}

export function LineIcon({ kind }: { kind: SummaryKind }) {
  const label = { good: "Good", fix: "Fix", tip: "Tip", info: "Note" }[kind];
  const box = "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
  return (
    <span className={`${box} ${kind === "good" ? "bg-ok/15 text-ok" : kind === "fix" ? "bg-bad/15 text-bad" : "bg-tint text-fg"}`}>
      {kind === "good" ? <Check size={15} aria-hidden /> : kind === "fix" ? <span aria-hidden className="text-sm font-bold">!</span> : kind === "tip" ? <Target size={15} aria-hidden /> : <Info size={15} aria-hidden />}
      <span className="sr-only">{label}:</span>
    </span>
  );
}

export type ReportSection = "evidence" | "training" | "comparison" | "progress" | "technical";
const SECTIONS: Array<{ id: ReportSection; name: string }> = [
  { id: "evidence", name: "Evidence" },
  { id: "training", name: "Training" },
  { id: "comparison", name: "Comparison" },
  { id: "progress", name: "Progress" },
  { id: "technical", name: "Technical details" },
];

/**
 * The report's sections after the summary. None is open to begin with (the answer comes first);
 * opening one shows it, and tapping it again closes it.
 */
function SectionTabs({ value, onChange }: { value: ReportSection | null; onChange: (s: ReportSection | null) => void }) {
  return (
    <nav aria-label="More about this shot" className="flex flex-wrap gap-1.5">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-expanded={value === s.id}
          aria-controls="report-section"
          onClick={() => onChange(value === s.id ? null : s.id)}
          className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${value === s.id ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
        >
          {s.name}
        </button>
      ))}
    </nav>
  );
}

/** This shot against the batter's own earlier confirmed ones: each measure, and whether it is in their usual range. */
function ProgressSection({ baseline, metrics, numbers, valid }: { baseline?: BaselineComparison[]; metrics: Metric[]; numbers: boolean; valid: boolean }) {
  const rows = (baseline ?? []).map((b) => ({ b, m: metrics.find((x) => x.id === b.metricId) }));
  const changed = rows.filter((r) => r.b.reading !== "within your usual range");
  return (
    <section aria-labelledby="progress-h" className="space-y-4">
      <SectionHead id="progress-h" eyebrow="Progress" title="Against your own usual" note="Compared with your earlier confirmed checks of the same shot, kept on this device." />
      {rows.length === 0 ? (
        <p className="text-fg-muted">
          {valid ? "Nothing to compare with yet. This shows once you have a few confirmed checks of the same shot." : "Only confirmed shots are compared, and this one wasn't confirmed."}
        </p>
      ) : (
        <>
          <p className="text-fg">
            {changed.length === 0 ? "Everything is within your usual range." : `${changed.length} of ${rows.length} measures moved outside your usual range.`}
          </p>
          <ul className="panel divide-y divide-line px-5">
            {[...changed, ...rows.filter((r) => !changed.includes(r))].map(({ b, m }) => (
              <li key={b.metricId} className="flex items-baseline justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{b.name}</span>
                  <span className={`block text-sm ${b.reading === "within your usual range" ? "text-fg-muted" : "text-fg"}`}>{b.reading[0]!.toUpperCase() + b.reading.slice(1)}</span>
                </span>
                {numbers && m && <span className="num shrink-0 text-sm text-fg-muted">{friendlyValue(m)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href="/progress" className="btn btn-ghost">Open progress over time</Link>
    </section>
  );
}

/** The switch that shows everything else: measures, illustrations, drills. Off by default. */
export function DetailsSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-controls="report-details"
      onClick={() => onChange(!on)}
      className="ml-auto inline-flex min-h-11 items-center gap-3 rounded-full pl-3 pr-1 text-[0.95rem] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
    >
      Details
      <span aria-hidden className={`relative inline-block h-7 w-12 rounded-full border-2 border-fg transition-colors ${on ? "bg-fg" : "bg-transparent"}`}>
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform ${on ? "translate-x-5 bg-bg" : "translate-x-0 bg-fg"}`} />
      </span>
    </button>
  );
}

function PdfButton({ onClick }: { onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost !min-h-11 !py-1.5 text-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={16} /> {busy ? "Preparing PDF…" : "Download PDF"}
    </button>
  );
}

function SectionHead({ id, eyebrow, title, note }: { id: string; eyebrow: string; title: string; note?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="display text-[1.75rem] sm:text-4xl">{title}</h2>
      {note && <p className="text-sm text-fg-subtle max-w-3xl">{note}</p>}
    </header>
  );
}

function DeliveryPanel({ payload: p, onSeek }: { payload: AnalysisPayload; onSeek: (id: string) => void }) {
  const d = p.delivery;
  if (p.mode === "posture_screen" || p.analysis_status === "capture_failed") return null;
  const max = 12;
  const x = (m: number) => `${Math.min(100, Math.max(0, (m / max) * 100))}%`;
  const fg = THRESHOLDS["delivery.full_good_boundary_m"].value;
  const gs = THRESHOLDS["delivery.good_short_boundary_m"].value;
  return (
    <section aria-labelledby="delivery-h" className="card p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Delivery context</p>
          <h2 id="delivery-h" className="display text-2xl mt-1">
            {d.available ? (d.lengthLabel === "uncertain" ? "Length unclear" : `${d.lengthLabel?.[0]?.toUpperCase()}${d.lengthLabel?.slice(1)} length`) : "Not claimed"}
          </h2>
        </div>
        {d.available && <ConfidenceChip label="Context" value={d.confidence} />}
      </div>
      {!d.available ? (
        <p className="text-fg-muted">{d.reason}</p>
      ) : (
        <>
          <div className="relative h-16 rounded-lg bg-sunken border border-line overflow-hidden" role="img"
            aria-label={`Pitch from the batter's stumps. ${d.bounceDistanceM !== null ? `Bounce about ${d.bounceDistanceM.toFixed(1)} metres from the stumps.` : "Bounce not seen."}`}>
            <div className="absolute inset-y-0 bg-ok/10" style={{ left: 0, width: x(fg) }} />
            <div className="absolute inset-y-0 bg-brand/10" style={{ left: x(fg), width: `calc(${x(gs)} - ${x(fg)})` }} />
            <div className="absolute inset-y-0 bg-bad/10" style={{ left: x(gs), right: 0 }} />
            <div className="absolute inset-y-0 w-0.5 bg-fg/50" style={{ left: 0 }} title="stumps" />
            <div className="absolute inset-y-0 w-px bg-fg/30" style={{ left: x(1.22) }} title="popping crease" />
            {d.bounceDistanceM !== null && (
              <button onClick={() => onSeek("evt_bounce")} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: x(d.bounceDistanceM) }} aria-label="Go to the bounce">
                <span className="block h-3 rounded-full bg-data/30 border border-data" style={{ width: `${Math.max(12, ((d.bounceUncertaintyM ?? 0) * 2 / max) * 100 * 6)}px` }} />
              </button>
            )}
            <div className="absolute bottom-1 left-1 right-1 flex justify-between text-[0.62rem] text-fg-subtle num">
              <span>stumps</span><span>full</span><span>good</span><span>short</span><span>{max} m</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-fg-subtle">Bounce</dt><dd className="num">{d.bounceDistanceM !== null ? `${d.bounceDistanceM.toFixed(1)} m ± ${(d.bounceUncertaintyM ?? 0).toFixed(1)}` : "not seen"}</dd></div>
            <div><dt className="text-fg-subtle">At batter</dt><dd className="num">{d.heightAtBatterM !== null ? `${d.heightAtBatterM.toFixed(2)} m` : d.heightAtBatterRel !== null ? `${d.heightAtBatterRel.toFixed(2)} × height` : "—"}</dd></div>
            {d.length && (["full", "good", "short"] as const).map((k) => (
              <div key={k} className="hidden sm:block"><dt className="text-fg-subtle capitalize">{k}</dt><dd className="num">{Math.round(d.length![k] * 100)}%</dd></div>
            )).slice(0, 2)}
          </dl>
          <p className="text-xs text-fg-subtle">Length bands are provisional pace bands (full &lt; {fg} m, short &gt; {gs} m); spin needs separate bands. {d.reason ?? ""}</p>
        </>
      )}
    </section>
  );
}

/** The back-foot defence's definition, checked on the batter: each part met, not met, or not seen. */
function DefinitionChecks({ checks }: { checks: NonNullable<AnalysisPayload["back_foot_checks"]> }) {
  const title: Record<(typeof checks)[number]["id"], string> = {
    no_stride: "No stride forward",
    went_back: "Went back",
    stayed_tall: "Stayed tall",
    dead_bat: "Defensive bat",
  };
  return (
    <div className="mt-5">
      <p className="text-sm text-fg-muted">The back-foot defence, part by part, as Aline saw it:</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {checks.map((c) => {
          const Icon = c.pass === true ? Check : c.pass === false ? Cross : Question;
          return (
            <li key={c.id} className="flex items-start gap-3 py-2.5">
              <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">{title[c.id]}</span>
                <span className="sr-only">{c.pass === true ? ": met" : c.pass === false ? ": not met" : ": not seen"}</span>
                <span className="block text-sm text-fg-muted">{c.reading}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
