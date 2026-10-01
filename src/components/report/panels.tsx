"use client";

import { SHOT_DISPLAY } from "@/engine/classify";
import { DOMAIN_LABELS, THRESHOLDS } from "@/engine/registry";
import type { AnalysisPayload, DomainResult, PlanItem, QualityCheck, ShotClass } from "@/engine/types";
import { Check, Cross, Info, Question } from "../icons";

export function ShotProbabilityPanel({ probs, coverage }: { probs: Record<ShotClass, number>; coverage: number }) {
  const rows = (Object.entries(probs) as Array<[ShotClass, number]>).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div>
      <ul className="space-y-1.5" aria-label="Shot family scores">
        {rows.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-2 text-sm">
            <span className={k === "front_foot_defence" ? "text-text" : "text-muted"}>{SHOT_DISPLAY[k]}</span>
            <span className="h-2 rounded-full bg-graphite overflow-hidden" aria-hidden>
              <span className={`block h-full rounded-full ${k === "unknown" ? "bg-steel" : k === "front_foot_defence" ? "bg-gold" : "bg-cyan"}`} style={{ width: `${Math.max(1, v * 100)}%` }} />
            </span>
            <span className="num text-right">{Math.round(v * 100)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-subtle">
        Prototype scores from a transparent band model — <strong className="text-muted">not yet calibrated</strong> on labelled clips. Evidence coverage{" "}
        <span className="num">{Math.round(coverage * 100)}%</span>. Acceptance needs ≥{" "}
        <span className="num">{Math.round(THRESHOLDS["ffd.accept.min_probability"].value * 100)}%</span> with body, bat and ball all tracked.
      </p>
    </div>
  );
}

export function CaptureChecklist({ checks, compact = false }: { checks: QualityCheck[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-line" aria-label="Capture checks">
      {checks.map((c) => {
        const Icon = c.status === "pass" ? Check : c.status === "fail" ? Cross : c.status === "warn" ? Question : Info;
        const tone = c.status === "pass" ? "text-lime" : c.status === "fail" ? "text-coral" : c.status === "warn" ? "text-amber" : "text-subtle";
        return (
          <li key={c.id} id={c.id} className="py-2.5 flex gap-3">
            <span className={`mt-0.5 ${tone}`} aria-hidden>
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">
                  {c.label} <span className="sr-only">{c.status}</span>
                </span>
                <span className="num text-xs text-muted">{c.value}</span>
              </div>
              {!compact && c.correction && <p className="text-sm text-muted mt-0.5">{c.correction}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const DOMAIN_TONE: Record<DomainResult["status"], string> = {
  within_range: "text-lime border-lime/40",
  review: "text-coral border-coral/40",
  not_measured: "text-subtle border-line-strong",
};
const DOMAIN_TEXT: Record<DomainResult["status"], string> = {
  within_range: "Within range",
  review: "Review",
  not_measured: "Not measured",
};

export function DomainGrid({ domains }: { domains: DomainResult[] }) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {domains.map((d, i) => (
        <li key={d.domain} className="bg-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="num text-xs text-subtle">0{i + 1}</span>
            <span className={`chip ${DOMAIN_TONE[d.status]}`}>{DOMAIN_TEXT[d.status]}</span>
          </div>
          <h4 className="mt-2 font-semibold">{DOMAIN_LABELS[d.domain]}</h4>
          <p className="mt-1 text-sm text-muted">{d.summary}</p>
        </li>
      ))}
    </ul>
  );
}

export function PriorityPlan({ plan }: { plan: PlanItem }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="card p-5">
        <p className="eyebrow">Primary practice focus</p>
        <h3 className="display text-3xl mt-2">{plan.priority.title}</h3>
        <p className="mt-3 text-muted">{plan.priority.observation}</p>
        <p className="mt-3 text-sm text-muted">
          <span className="text-text font-medium">Likely effect: </span>
          {plan.consequence}
        </p>
        <p className="mt-4 rounded-lg border border-gold/40 bg-gold/5 p-3 text-lg">
          <span className="eyebrow block mb-1">Cue</span>“{plan.cue}”
        </p>
        <p className="mt-4 text-sm text-subtle">Retest: {plan.retest}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {plan.drills.map((d, i) => (
          <li key={d.id} id={d.id} className="card p-4">
            <p className="num text-xs text-subtle">DRILL {i + 1}</p>
            <h4 className="mt-1 font-semibold">{d.name}</h4>
            <p className="mt-1 text-sm text-muted">{d.constraint}</p>
            <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-1 text-sm">
              <dt className="text-subtle">Dosage</dt>
              <dd className="num">{d.dosage}</dd>
              <dt className="text-subtle">Pass when</dt>
              <dd>{d.passCondition}</dd>
              <dt className="text-subtle">Cue</dt>
              <dd>{d.cue}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Limitations({ payload }: { payload: AnalysisPayload }) {
  return (
    <details className="card p-4 group">
      <summary className="list-none flex items-center justify-between gap-2 min-h-9">
        <span className="font-semibold">Limits of this result</span>
        <span className="chip border-line-strong text-muted">{payload.limitations.length}</span>
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-muted list-disc pl-5">
        {payload.limitations.map((l) => (
          <li key={l.id} id={l.id}>
            {l.text}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Versions({ payload }: { payload: AnalysisPayload }) {
  const v = payload.versions;
  const rows: Array<[string, string]> = [
    ["Engine", v.engine],
    ["Metric set", v.metric_version],
    ["Classifier", `${v.classifier} (uncalibrated)`],
    ["Registry", v.registry_hash],
    ["Pose source", v.pose_model],
    ["Bat / ball source", `${v.bat_source} / ${v.ball_source}`],
    ["Input hash", payload.input_hash.slice(0, 16)],
    ["Result hash", payload.result_hash.slice(0, 16)],
  ];
  return (
    <dl className="grid grid-cols-[8.5rem_1fr] gap-y-1.5 text-xs">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-subtle">{k}</dt>
          <dd className="num text-muted break-all">{val}</dd>
        </div>
      ))}
    </dl>
  );
}
