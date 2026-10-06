"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { AnalysisPayload, CaptureObservation, Metric } from "@/engine/types";
import type { BaselineComparison } from "@/engine/baseline";
import { templateReport, type Report } from "@/engine/report";
import { SHOT_DISPLAY } from "@/engine/classify";
import { DOMAIN_LABELS, THRESHOLDS } from "@/engine/registry";
import { type CompareReference, EvidenceViewer, type EvidenceViewerHandle } from "./evidence-viewer";
import { MetricCard } from "./metric-card";
import { CaptureChecklist, DomainGrid, Limitations, PriorityPlan, ShotProbabilityPanel, Versions } from "./panels";
import { ConfidenceChip, DemoBadge, STATUS_META, statusKey } from "./status";
import { Download, Record as RecordIcon, Target } from "../icons";
import { downloadReportPdf } from "@/lib/pdf";
import { Lesson } from "../lesson/lesson";
import { LinePanel } from "./line-panel";
import { ComparePanel } from "./compare-panel";
import { plainRange, plainReading, plainValue } from "@/engine/plain";

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
  /** Shown under the verdict (e.g. an offer to add bat and ball marks). */
  notice?: React.ReactNode;
  title?: string;
  /** The on-device analysis id, for comparing with other shots and sharing this one. */
  analysisId?: string;
}

export function ReportView({ payload: p, obs, videoUrl, mediaTimes, keyframes, baseline, reference, narrative, actions, notice, title, analysisId }: Props) {
  const viewer = useRef<EvidenceViewerHandle>(null);
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
  const meta = photoPass ? { ...STATUS_META.valid, label: "Photo check" } : STATUS_META[statusKey(p)];
  const contact = p.events.find((e) => e.type === "contact");
  const t0 = obs.t[0] ?? 0;
  const seek = (frame: number, metricId?: string) => viewer.current?.seek(frame, metricId);
  const seekId = (id: string) => {
    const f = /^frame_(\d+)$/.exec(id)?.[1];
    if (f) return seek(Number(f));
    const e = p.events.find((x) => x.id === id);
    if (e) return seek(e.frame);
    const m = /^metric_(.+)$/.exec(id)?.[1];
    if (m) document.getElementById(`metric_${m}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    else document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
          <PdfButton onClick={() => downloadReportPdf(p, { title: title ?? p.label, evidenceImage: viewer.current?.snapshot() ?? null })} />
          {actions}
        </span>
      </div>

      {/* Validity first: what happened, and whether a score is allowed. */}
      <section aria-labelledby="verdict" className={`card overflow-hidden border ${meta.ring}`}>
        <div className={`${meta.bg} px-5 py-5 sm:px-7 sm:py-7`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${meta.ring} ${meta.tone} text-sm`}>
              <meta.Icon size={16} /> {meta.label}
            </span>
            {p.handedness === "left" && <span className="chip border-line-strong text-fg-muted">Left-handed batter</span>}
          </div>
          <h1 id="verdict" className="display mt-4 text-[1.7rem] leading-[1.1] sm:text-4xl lg:text-5xl max-w-4xl">{p.headline}</h1>
          {notice}
          {!isValid && p.mode !== "posture_screen" && (
            <p className="mt-3 text-sm text-fg-muted">No technique score: a score is only given to a confirmed front-foot defence.</p>
          )}
          {p.analysis_status === "invalid_for_requested_analysis" && p.observed_shot && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-lg">
                  Most likely: <strong>{p.observed_shot.label === "unknown" ? p.observed_shot.display : SHOT_DISPLAY[p.observed_shot.label]}</strong>
                  <span className="num text-fg-muted"> — {Math.round(p.observed_shot.probability * 100)}% prototype confidence</span>
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
              <div className="flex flex-wrap gap-2">
                {contact && (
                  <button className="btn btn-ghost" onClick={() => seek(contact.frame)}>
                    <Target size={16} /> Review evidence at {((contact.tMs - t0) / 1000).toFixed(2)} s
                  </button>
                )}
                <button className="btn btn-ghost" disabled title="Not available yet">
                  Analyse as {p.observed_shot.label === "unknown" ? "that shot" : SHOT_DISPLAY[p.observed_shot.label].toLowerCase()}
                </button>
              </div>
              <p className="sm:col-span-2 text-xs text-fg-subtle">
                Other shot types unlock only when they pass the same validation bar as the front-foot defence.
              </p>
            </div>
          )}
        </div>
      </section>

      <Summary p={p} onSeek={seek} />

      <LinePanel payload={p} fps={obs.media.fps} onSeek={(f) => seek(f)} />

      <Lesson payload={p} obs={obs} />

      <EvidenceViewer ref={viewer} obs={obs} payload={p} videoUrl={videoUrl} mediaTimes={mediaTimes} keyframes={keyframes} reference={reference} />

      {p.plan && (
        <section id="plan" aria-labelledby="plan-h" className="space-y-4 scroll-mt-20">
          <SectionHead id="plan-h" eyebrow="Coaching plan" title="One priority, step by step to match speed" />
          <PriorityPlan plan={p.plan} />
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/analyse" className="btn btn-primary">
              <RecordIcon size={16} /> Record next attempt
            </Link>
            <span className="text-sm text-fg-muted">The next report shows the change against this one and your baseline.</span>
          </div>
        </section>
      )}

      <ComparePanel payload={p} fps={obs.media.fps} analysisId={analysisId} />

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 sm:px-5">
          <span>
            <span className="font-semibold">More detail</span>
            <span className="ml-2 text-sm text-fg-subtle">each measure, why it matters, drills</span>
          </span>
          <span className="text-fg-subtle transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-8 border-t border-line px-4 py-6 sm:px-5">

      <DeliveryPanel payload={p} onSeek={seekId} />

      {isValid && (
        <>
          <section aria-labelledby="domains" className="space-y-4">
            <SectionHead id="domains" eyebrow="Seven domains" title="How the defence was executed" />
            <DomainGrid domains={p.domains} />
          </section>

          <section aria-labelledby="indicators" className="space-y-4">
            <SectionHead id="indicators" eyebrow="Movement indicators" title="Measures, ranges and evidence" note="Ranges are provisional coaching ranges (v0.1), not population norms. Not-measured means the capture could not support it — never zero." />
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


      {p.mode === "posture_screen" && p.metrics.some((m) => m.value !== null) && (
        <section aria-labelledby="posture-h" className="space-y-4">
          <SectionHead
            id="posture-h"
            eyebrow={positionGraded(p) ? "Front-foot defence formula" : "Posture screen"}
            title={positionGraded(p) ? `Position check: ${p.position_check!.met} of ${p.position_check!.checked} met` : p.photo_set ? "What the photos show" : "What the photo shows"}
            note={
              positionGraded(p)
                ? p.position_check?.angled
                  ? "Checked from one photo taken at an angle: the knees, the lean and where your weight is. Stride, head and hands need a side-on photo. A video shows the whole shot."
                  : "Checked from one photo, taken to be the moment the ball meets the bat. A video shows the whole shot."
                : p.position_check?.verdict === "not_side_on"
                  ? "Taken from the bowler's end or behind, so the stride and lean can't be judged. Shown, not graded. A side-on photo gets checked."
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
            note="Body positions from the tracked frames. Not graded and no score: the shot wasn't confirmed as a front-foot defence."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {p.observations.map((m) => (
              <MetricCard key={m.id} m={m} onEvidence={seek} />
            ))}
          </div>
        </section>
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

      {/* For coaches and developers: how the result was reached, recording checks, versions. */}
      <details className="group/tech card p-4">
        <summary className="list-none flex min-h-9 cursor-pointer items-center justify-between">
          <span className="font-semibold">Technical details</span>
          <span className="text-fg-subtle transition-transform group-open/tech:rotate-90">›</span>
        </summary>
        <div className="mt-4 space-y-6">
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
        </div>
      </details>
        </div>
      </details>
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
const positionGraded = (p: AnalysisPayload) => !!p.position_check && !["not_side_on", "not_enough", "not_on_front_foot"].includes(p.position_check.verdict);

function Summary({ p, onSeek }: { p: AnalysisPayload; onSeek: (frame: number, metricId?: string) => void }) {
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
            text={strongM ? strongM.relevance : isValid ? "Every check is inside its range." : "None of the checks is inside its range yet."}
          />
          <SummaryCard
            tone={priorityM ? "bad" : "brand"}
            label={priorityM ? "Fix next" : "Next level"}
            title={priorityM ? plainReading(priorityM) : (p.plan?.priority.title ?? "Nothing urgent")}
            text={priorityM ? `${coachText(priority!.observation)} You: ${plainValue(priorityM)}; aim for ${plainRange(priorityM)}.` : p.plan ? `Every check is met. ${p.plan.consequence}` : "Every check is met. Keep the same shape."}
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
                        {m.inRange === false && m.range ? `${graded && m.name !== plainReading(m) ? " · " : ""}aim for ${plainRange(m)}` : ""}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm">{plainValue(m)}</span>
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

function PdfButton({ onClick }: { onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost !min-h-9 !py-1.5 text-sm"
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
