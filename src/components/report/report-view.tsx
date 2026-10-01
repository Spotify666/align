"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { AnalysisPayload, CaptureObservation } from "@/engine/types";
import type { BaselineComparison } from "@/engine/baseline";
import { templateReport, type Report } from "@/engine/report";
import { SHOT_DISPLAY } from "@/engine/classify";
import { DOMAIN_LABELS, THRESHOLDS } from "@/engine/registry";
import { EvidenceViewer, type EvidenceViewerHandle } from "./evidence-viewer";
import { MetricCard } from "./metric-card";
import { CaptureChecklist, DomainGrid, Limitations, PriorityPlan, ShotProbabilityPanel, Versions } from "./panels";
import { ConfidenceChip, DemoBadge, STATUS_META, statusKey } from "./status";
import { Download, Record as RecordIcon, Target } from "../icons";
import { downloadReportPdf } from "@/lib/pdf";

interface Props {
  payload: AnalysisPayload;
  obs: CaptureObservation;
  videoUrl?: string | null;
  mediaTimes?: number[] | null;
  keyframes?: Record<number, string>;
  baseline?: BaselineComparison[];
  reference?: { obs: CaptureObservation; offset: number; label: string } | null;
  narrative?: Report;
  actions?: React.ReactNode;
  title?: string;
}

export function ReportView({ payload: p, obs, videoUrl, mediaTimes, keyframes, baseline, reference, narrative, actions, title }: Props) {
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
  const meta = STATUS_META[statusKey(p)];
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
      <div className="flex flex-wrap items-center gap-3 text-sm text-subtle">
        <Link href="/sessions" className="hover:text-text">Sessions</Link>
        <span aria-hidden>/</span>
        <span className="text-muted">{title ?? p.label ?? "Analysis"}</span>
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
            {p.shot_probabilities && <ConfidenceChip label="Shot" value={p.observed_shot?.probability ?? p.shot_probabilities.front_foot_defence} note="uncalibrated" />}
            <ConfidenceChip label="Capture" value={p.capture_confidence} />
            <span className="chip border-line-strong text-muted">Requested: front-foot defence</span>
          </div>
          <h1 id="verdict" className="display mt-4 text-[2.1rem] sm:text-5xl max-w-4xl">{p.headline}</h1>
          {!isValid ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-carbon/60 px-3 py-2 text-base">
              <strong>Technique score withheld.</strong>
              <span className="text-muted">A score is only given to a confirmed front-foot defence.</span>
            </p>
          ) : (
            p.technique_index && (
              <p className="mt-4 text-sm text-muted">
                Secondary technique index{" "}
                <span className="num text-text text-base">{p.technique_index.value}</span>
                <span className="num"> (range {p.technique_index.band[0]}–{p.technique_index.band[1]})</span> · inputs and weights published in{" "}
                <Link href="/science#index" className="underline decoration-dotted hover:text-text">Science</Link>. Read the domains first.
              </p>
            )
          )}
          {p.analysis_status === "invalid_for_requested_analysis" && p.observed_shot && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-lg">
                  Most likely: <strong>{p.observed_shot.label === "unknown" ? p.observed_shot.display : SHOT_DISPLAY[p.observed_shot.label]}</strong>
                  <span className="num text-muted"> — {Math.round(p.observed_shot.probability * 100)}% prototype confidence</span>
                </p>
                <p className="mt-1 text-muted">
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
              <p className="sm:col-span-2 text-xs text-subtle">
                Other shot types unlock only when they pass the same validation bar as the front-foot defence.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <EvidenceViewer ref={viewer} obs={obs} payload={p} videoUrl={videoUrl} mediaTimes={mediaTimes} keyframes={keyframes} reference={reference} />

        <aside className="flex flex-col gap-4">
          {isValid && (
            <>
              {p.strengths[0] && (
                <div className="card p-4">
                  <p className="eyebrow !text-lime">Top strength</p>
                  <p className="mt-2 font-semibold">{p.strengths[0].title}</p>
                  <p className="mt-1 text-sm text-muted">{p.strengths[0].observation}</p>
                </div>
              )}
              <div className="card p-4">
                <p className="eyebrow">Top priority</p>
                {p.priorities[0] ? (
                  <>
                    <p className="mt-2 font-semibold">{p.priorities[0].title}</p>
                    <p className="mt-1 text-sm text-muted">{p.priorities[0].observation}</p>
                    <a href="#plan" className="mt-3 inline-flex chip border-gold/50 text-gold min-h-9">See the drill plan</a>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">All measured indicators sit inside the current coaching range. Keep recording to build your baseline.</p>
                )}
              </div>
            </>
          )}
          {(p.analysis_status === "uncertain_shot" || p.analysis_status === "capture_failed") && (
            <div className="card p-4">
              <p className="eyebrow">What to change next time</p>
              <ol className="mt-2 space-y-2 text-sm list-decimal pl-5">
                {p.recapture.slice(0, 5).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              <Link href="/analyse" className="btn btn-primary mt-4 w-full">
                <RecordIcon size={16} /> Record again
              </Link>
            </div>
          )}

          <details className="card p-4 group" open={!isValid}>
            <summary className="list-none flex items-center justify-between min-h-9">
              <span className="font-semibold">Why this result</span>
              <span className="text-subtle group-open:rotate-90 transition-transform">›</span>
            </summary>
            <ol className="mt-3 space-y-1.5 text-sm text-muted">
              <li>1. Capture usable? <strong className="text-text">{p.capture.status === "fail" ? "No" : p.capture.status === "warn" ? "Yes, with warnings" : "Yes"}</strong></li>
              <li>
                2. Tracked: body <strong className="text-text">{p.tracking.body.ok ? "yes" : "no"}</strong>, bat{" "}
                <strong className="text-text">{p.tracking.bat.ok ? p.tracking.bat.source.replace("_", " ") : "no"}</strong>, ball{" "}
                <strong className="text-text">{p.tracking.ball.ok ? p.tracking.ball.source.replace("_", " ") : "no"}</strong>
              </li>
              <li>3. Delivery: <strong className="text-text">{p.delivery.available ? (p.delivery.lengthLabel ?? "—") : "not claimed"}</strong></li>
              <li>4–5. Shot family and compatibility: <strong className="text-text">{meta.label}</strong></li>
              <li>6. Technique measured: <strong className="text-text">{isValid ? "yes" : "no — withheld"}</strong></li>
            </ol>
            {p.features.length > 0 && (
              <ul className="mt-4 divide-y divide-line">
                {p.features.map((f) => (
                  <li key={f.id} id={f.id} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {f.label} <span className="text-subtle">· {f.reading}</span>
                    </span>
                    <span className="num text-xs text-muted shrink-0">{f.value?.toFixed(2)} <span className="text-subtle">{f.modality}</span></span>
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
        </aside>
      </div>

      <DeliveryPanel payload={p} onSeek={seekId} />

      {isValid && (
        <>
          <section aria-labelledby="domains" className="space-y-4">
            <SectionHead id="domains" eyebrow="Six domains" title="How the defence was executed" />
            <DomainGrid domains={p.domains} />
          </section>

          <section aria-labelledby="indicators" className="space-y-4">
            <SectionHead id="indicators" eyebrow="Movement indicators" title="Measures, ranges and evidence" note="Ranges are provisional coaching ranges (v0.1), not population norms. Not-measured means the capture could not support it — never zero." />
            {(["footwork", "head_trunk", "bat_contact", "setup", "sequence", "outcome"] as const).map((d) => {
              const ms = p.metrics.filter((m) => m.domain === d);
              if (!ms.length) return null;
              return (
                <div key={d} className="space-y-3">
                  <h3 className="text-sm text-subtle">{DOMAIN_LABELS[d]}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {ms.map((m) => (
                      <MetricCard key={m.id} m={m} baseline={base(m.id)} onEvidence={seek} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {p.plan && (
            <section id="plan" aria-labelledby="plan-h" className="space-y-4 scroll-mt-20">
              <SectionHead id="plan-h" eyebrow="Coaching plan" title="One priority. Up to two drills." />
              <PriorityPlan plan={p.plan} />
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/analyse" className="btn btn-primary">
                  <RecordIcon size={16} /> Record next attempt
                </Link>
                <span className="text-sm text-muted">The next report shows the change against this one and your baseline.</span>
              </div>
            </section>
          )}
        </>
      )}

      {!isValid && (
        <section aria-labelledby="capture-h" className="space-y-3">
          <SectionHead id="capture-h" eyebrow="Capture quality" title="Checks on this recording" />
          <div className="card px-4">
            <CaptureChecklist checks={p.capture.checks} />
          </div>
          {p.mode === "posture_screen" && p.metrics.some((m) => m.value !== null) && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm text-subtle">Posture observations from the photo (estimates, not graded)</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {p.metrics.map((m) => (
                  <MetricCard key={m.id} m={m} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="narrative-h" className="space-y-3">
        <SectionHead id="narrative-h" eyebrow="Written report" title="In plain words" note={`Generated by ${report.generator}. Every number links to its evidence.`} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-subtle">Rewrite for:</span>
          {(["player", "coach", "parent"] as const).map((a) => (
            <button key={a} className="chip border-line-strong text-muted min-h-9 capitalize" disabled={aiState === "loading"} onClick={() => askAi(a)}>{a}</button>
          ))}
          {aiState === "loading" && <span className="text-subtle">Writing… (checked against the evidence before it is shown)</span>}
          {aiState === "unavailable" && <span className="text-subtle">AI writing isn&apos;t switched on for this site — showing the standard report.</span>}
          {aiState === "fallback" && <span className="text-amber">The AI draft didn&apos;t match the evidence, so the standard report is shown.</span>}
        </div>
        <div className="card p-5 sm:p-6 space-y-5">
          {report.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="text-sm uppercase tracking-wider text-subtle">{s.heading}</h3>
              <ul className="mt-2 space-y-2">
                {s.sentences.map((x, i) => (
                  <li key={i} className="leading-relaxed">
                    {x.text}{" "}
                    {x.cites.slice(0, 4).map((c) => (
                      <button key={c} onClick={() => seekId(c)} className="num align-super text-[0.62rem] text-gold/90 hover:text-gold mx-0.5" title={`Evidence ${c}`}>
                        [{c.replace(/^(metric|feat|evt|chk|lim)_/, "")}]
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Limitations payload={p} />
        <div className="card p-4">
          <p className="font-semibold mb-3">Reproducibility</p>
          <Versions payload={p} />
          <p className="mt-3 text-xs text-subtle">The same tracks and engine version always produce this exact report (result hash).</p>
        </div>
      </div>
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
      <h2 id={id} className="display text-3xl sm:text-4xl">{title}</h2>
      {note && <p className="text-sm text-subtle max-w-3xl">{note}</p>}
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
        <p className="text-muted">{d.reason}</p>
      ) : (
        <>
          <div className="relative h-16 rounded-lg bg-graphite border border-line overflow-hidden" role="img"
            aria-label={`Pitch from the batter's stumps. ${d.bounceDistanceM !== null ? `Bounce about ${d.bounceDistanceM.toFixed(1)} metres from the stumps.` : "Bounce not seen."}`}>
            <div className="absolute inset-y-0 bg-lime/10" style={{ left: 0, width: x(fg) }} />
            <div className="absolute inset-y-0 bg-gold/10" style={{ left: x(fg), width: `calc(${x(gs)} - ${x(fg)})` }} />
            <div className="absolute inset-y-0 bg-coral/10" style={{ left: x(gs), right: 0 }} />
            <div className="absolute inset-y-0 w-0.5 bg-paper/70" style={{ left: 0 }} title="stumps" />
            <div className="absolute inset-y-0 w-px bg-paper/40" style={{ left: x(1.22) }} title="popping crease" />
            {d.bounceDistanceM !== null && (
              <button onClick={() => onSeek("evt_bounce")} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: x(d.bounceDistanceM) }} aria-label="Go to the bounce">
                <span className="block h-3 rounded-full bg-cyan/30 border border-cyan" style={{ width: `${Math.max(12, ((d.bounceUncertaintyM ?? 0) * 2 / max) * 100 * 6)}px` }} />
              </button>
            )}
            <div className="absolute bottom-1 left-1 right-1 flex justify-between text-[0.62rem] text-subtle num">
              <span>stumps</span><span>full</span><span>good</span><span>short</span><span>{max} m</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-subtle">Bounce</dt><dd className="num">{d.bounceDistanceM !== null ? `${d.bounceDistanceM.toFixed(1)} m ± ${(d.bounceUncertaintyM ?? 0).toFixed(1)}` : "not seen"}</dd></div>
            <div><dt className="text-subtle">At batter</dt><dd className="num">{d.heightAtBatterM !== null ? `${d.heightAtBatterM.toFixed(2)} m` : d.heightAtBatterRel !== null ? `${d.heightAtBatterRel.toFixed(2)} × height` : "—"}</dd></div>
            {d.length && (["full", "good", "short"] as const).map((k) => (
              <div key={k} className="hidden sm:block"><dt className="text-subtle capitalize">{k}</dt><dd className="num">{Math.round(d.length![k] * 100)}%</dd></div>
            )).slice(0, 2)}
          </dl>
          <p className="text-xs text-subtle">Length bands are provisional pace bands (full &lt; {fg} m, short &gt; {gs} m); spin needs separate bands. {d.reason ?? ""}</p>
        </>
      )}
    </section>
  );
}
