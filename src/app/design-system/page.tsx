import type { Metadata } from "next";
import { sampleAnalysis } from "@/lib/demo";
import { STATUS_META } from "@/components/report/status";
import { ConfidenceChip, DemoBadge } from "@/components/report/status";
import { RangeBar } from "@/components/report/range-bar";
import { MetricCard } from "@/components/report/metric-card";
import { CaptureChecklist, DomainGrid, PriorityPlan, ShotProbabilityPanel } from "@/components/report/panels";

export const metadata: Metadata = { title: "Design system" };

const TOKENS: Array<[string, string, string]> = [
  ["Carbon", "#0a0d10", "page"],
  ["Graphite", "#151a20", "inputs, media"],
  ["Panel", "#10151a", "cards"],
  ["Warm paper", "#f3f0e8", "text, editorial bands"],
  ["Signal gold", "#d7a62a", "authority, selection, primary action"],
  ["Performance lime", "#b7f34a", "valid, within range"],
  ["Data cyan", "#5ed6e6", "measured paths, baseline"],
  ["Amber", "#f2b84b", "uncertain, estimate, warning"],
  ["Risk coral", "#f06b5f", "different shot, outside range, error"],
  ["Steel", "#9aa6b2", "capture failed, unknown"],
];

const Block = ({ title, rules, children }: { title: string; rules: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="display text-3xl">{title}</h2>
    <p className="text-sm text-muted max-w-3xl">{rules}</p>
    {children}
  </section>
);

export default function DesignSystemPage() {
  const valid = sampleAnalysis("valid_ffd")!.payload;
  const pull = sampleAnalysis("pull")!.payload;
  const failed = sampleAnalysis("capture_failed")!.payload;
  const metric = valid.metrics.find((m) => m.id === "head_knee_offset")!;
  const nm = valid.metrics.find((m) => m.status === "not_measured")!;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-14">
      <header className="space-y-2">
        <p className="eyebrow">Design system · Editorial sports-performance lab</p>
        <h1 className="display text-5xl">Components and states</h1>
        <p className="text-muted max-w-3xl">Precise, calm, disciplined. Gold marks authority and selection, never “good”. Measurement states always pair colour with an icon and words. Every state below is rendered from the real engine on DEMO DATA.</p>
      </header>

      <Block title="Tokens" rules="Contrast: body text on carbon ≥ 12:1; muted text ≥ 7:1; subtle text ≥ 5:1. Display: Archivo condensed. UI: Inter. Data: IBM Plex Mono with tabular numerals.">
        <ul className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          {TOKENS.map(([n, hex, use]) => (
            <li key={n} className="card overflow-hidden">
              <div className="h-14" style={{ background: hex }} />
              <div className="p-2 text-xs"><p className="font-semibold">{n}</p><p className="num text-subtle">{hex}</p><p className="text-muted">{use}</p></div>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Validity banner states" rules="Four outcomes plus the photo posture screen. The non-valid states are as designed as the valid one and always say the score is withheld.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((k) => {
            const m = STATUS_META[k];
            return (
              <li key={k} className={`card border p-4 ${m.ring} ${m.bg}`}>
                <span className={`chip ${m.ring} ${m.tone}`}><m.Icon size={14} /> {m.label}</span>
                <p className="mt-2 text-sm text-muted">{k === "valid" ? "Domains, measures and plan follow." : "Technique score withheld — with the reason and what to do next."}</p>
              </li>
            );
          })}
        </ul>
      </Block>

      <Block title="Confidence chip and demo badge" rules="Confidence always names what it is about and whether it is calibrated. Demo data is labelled at the top of every view that uses it.">
        <div className="flex flex-wrap gap-2"><ConfidenceChip label="Shot" value={0.98} note="uncalibrated" /><ConfidenceChip label="Capture" value={0.83} /><DemoBadge /></div>
      </Block>

      <Block title="Comparison range" rules="Shaded: provisional coaching range. Dashed: your baseline. Whisker: measurement uncertainty. Caption states the reading in words.">
        <div className="card p-4 max-w-md"><RangeBar value={-0.057} uncertainty={0.012} range={{ lo: -0.03, hi: 0.09 }} baseline={{ mean: 0.02, sd: 0.02 }} decimals={2} unit="× stature" /></div>
      </Block>

      <Block title="Metric card" rules="Name, value with unit and ±, status (measured / estimate / not measured), range, meaning, why it matters, limitation, and a jump to the evidence frame. Not measured is never shown as zero.">
        <div className="grid gap-3 sm:grid-cols-2"><MetricCard m={metric} /><MetricCard m={nm} /></div>
      </Block>

      <Block title="Shot-class panel" rules="Top classes and 'unknown', with coverage and the acceptance rule. Labelled as uncalibrated.">
        <div className="card p-4 max-w-xl"><ShotProbabilityPanel probs={pull.shot_probabilities!} coverage={pull.classifier!.evidenceCoverage} /></div>
      </Block>

      <Block title="Capture checklist" rules="Pass / warn / fail with icon, value and one concrete correction.">
        <div className="card px-4 max-w-xl"><CaptureChecklist checks={failed.capture.checks} /></div>
      </Block>

      <Block title="Domains" rules="Six domains, equal weight visually; not-measured domains say why.">
        <DomainGrid domains={valid.domains} />
      </Block>

      <Block title="Priority coaching card and drill prescription" rules="One priority, one cue, up to two constraint-based drills with dosage and a pass condition the athlete can see.">
        {valid.plan && <PriorityPlan plan={valid.plan} />}
      </Block>

      <Block title="Empty, loading and failed states" rules="Every list and page has all three.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-5 text-center"><p className="display text-2xl">Nothing recorded yet</p><p className="text-sm text-muted mt-1">Record your first shot.</p></div>
          <div className="card p-5"><p className="text-sm text-muted">Loading…</p><div className="mt-3 h-1 rounded bg-line overflow-hidden"><div className="h-full w-1/3 bg-gold animate-pulse" /></div></div>
          <div className="card p-5 border-coral/50"><p className="font-semibold text-coral">Something went wrong</p><p className="text-sm text-muted mt-1">Plain cause, then a retry.</p></div>
        </div>
      </Block>
    </div>
  );
}
