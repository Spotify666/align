import { Hold } from "@/components/common/hold";
import type { Metadata } from "next";
import Link from "next/link";
import { sampleAnalysis } from "@/lib/demo";
import { STATUS_META } from "@/components/report/status";
import { ConfidenceChip, DemoBadge } from "@/components/report/status";
import { RangeBar } from "@/components/report/range-bar";
import { MetricCard } from "@/components/report/metric-card";
import { CaptureChecklist, DomainGrid, PriorityPlan, ShotProbabilityPanel } from "@/components/report/panels";

export const metadata: Metadata = { title: "Design system" };

// The second design's tokens (globals.css, `:root[data-ui="2"]`): the value in the dark theme, then in daylight.
const TOKENS: Array<[string, string, string, string]> = [
  ["Field", "#050505", "#f4f1e8", "the page"],
  ["Ground", "#121212", "#f4f1e8", "panels"],
  ["Raised", "#1a1a1a", "#ebe7da", "controls, rows"],
  ["Rule", "#2a2a28", "#cecbc4", "hairlines"],
  ["Chalk", "#f4f1e8", "#050505", "text"],
  ["Dust", "#a9a59d", "#55534e", "secondary text"],
  ["The line", "#ff6a00", "#b54700", "the line, the moment in view, the one main action"],
  ["Good", "#7fb89a", "#0b6b4f", "within range, confirmed"],
  ["Check", "#e0b354", "#855000", "unsure, estimate"],
  ["Fix", "#e8736a", "#b02e25", "outside range, another shot"],
];

const Block = ({ title, rules, children }: { title: string; rules: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="display text-3xl">{title}</h2>
    <p className="text-sm text-fg-muted max-w-3xl">
      <Hold more={<p>{rules}</p>}>The rules</Hold>
    </p>
    {children}
  </section>
);

export default function DesignSystemPage() {
  const valid = sampleAnalysis("valid_ffd")!.payload;
  const pull = sampleAnalysis("pull")!.payload;
  const failed = sampleAnalysis("capture_failed")!.payload;
  const metric = valid.metrics.find((m) => m.id === "line_head")!;
  const nm = valid.metrics.find((m) => m.status === "not_measured")!;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-14">
      <header className="space-y-2">
        <p className="eyebrow">Design system</p>
        <h1 className="display text-5xl">Components and states</h1>
        <p className="text-fg-muted max-w-3xl">
          <Hold more={<p>A dark field, warm white text and one orange. Orange is the line, the moment being looked at and the one main action; it is never a surface and never means “good”. A state always carries a word or a mark as well as a colour. Every state below is drawn from the real engine on DEMO DATA.</p>}>
            Dark, warm white, one orange
          </Hold>
        </p>
        <p><Link href="/design" className="inline-flex min-h-11 items-center underline underline-offset-4">Every screen and flow, mapped</Link></p>
      </header>

      <Block title="Colours" rules="Each swatch shows the dark theme on the left and daylight on the right. Every text pair is held to AA contrast by a test. No gradients, shadows, blur or glass.">
        <ul className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          {TOKENS.map(([n, dark, light, use]) => (
            <li key={n} className="card overflow-hidden">
              <div className="flex h-14 border-b border-line">
                <div className="flex-1" style={{ background: dark }} />
                <div className="flex-1" style={{ background: light }} />
              </div>
              <div className="p-2 text-xs"><p className="font-semibold">{n}</p><p className="num text-fg-subtle">{dark} · {light}</p><p className="text-fg-muted">{use}</p></div>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Type" rules="Archivo for headlines and big numbers, Geist for everything else. Sentence case. Numbers use tabular figures.">
        <div className="panel space-y-3 p-5">
          <p className="display text-4xl">Every shot, explained.</p>
          <p className="text-lg text-fg-muted">Get your head over your front foot.</p>
          <p className="num text-sm text-fg-subtle">0.12 × height · 0.83 s · 6 of 8 checks</p>
        </div>
      </Block>

      <Block title="Actions" rules="One main action a screen, in orange. Everything else is a quiet pill. Every control is at least 44 px tall.">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary">Check your shot</button>
          <button type="button" className="btn btn-ghost">How to film</button>
          <button type="button" className="btn btn-quiet">Not now</button>
        </div>
      </Block>

      <Block title="Validity banner states" rules="Four outcomes plus the photo posture screen. The non-valid states are as designed as the valid one and always say the score is withheld.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((k) => {
            const m = STATUS_META[k];
            return (
              <li key={k} className={`card border p-4 ${m.ring} ${m.bg}`}>
                <span className={`chip ${m.ring} ${m.tone}`}><m.Icon size={14} /> {m.label}</span>
                <p className="mt-2 text-sm text-fg-muted">{k === "valid" ? "Domains, measures and plan follow." : "Technique score withheld — with the reason and what to do next."}</p>
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
        <h3 className="sr-only">A measured and a not-measured example</h3>
        <div className="grid gap-3 sm:grid-cols-2"><MetricCard m={metric} /><MetricCard m={nm} /></div>
      </Block>

      <Block title="Shot-class panel" rules="Top classes and 'unknown', with coverage and the acceptance rule. Labelled as uncalibrated.">
        <div className="card p-4 max-w-xl"><ShotProbabilityPanel probs={pull.shot_probabilities!} coverage={pull.classifier!.evidenceCoverage} /></div>
      </Block>

      <Block title="Capture checklist" rules="Pass / warn / fail with icon, value and one concrete correction.">
        <div className="card px-4 max-w-xl"><CaptureChecklist checks={failed.capture.checks} /></div>
      </Block>

      <Block title="Domains" rules="Seven domains, equal weight visually; not-measured domains say why.">
        <DomainGrid domains={valid.domains} />
      </Block>

      <Block title="Priority coaching card and drill prescription" rules="One priority, one cue, up to two constraint-based drills with dosage and a pass condition the athlete can see.">
        {valid.plan && <PriorityPlan plan={valid.plan} />}
      </Block>

      <Block title="Empty, loading and failed states" rules="Every list and page has all three.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-5 text-center"><p className="display text-2xl">Nothing recorded yet</p><p className="text-sm text-fg-muted mt-1">Record your first shot.</p></div>
          <div className="card p-5"><p className="text-sm text-fg-muted">Loading…</p><div className="mt-3 h-1 rounded bg-line overflow-hidden"><div className="h-full w-1/3 bg-brand animate-pulse" /></div></div>
          <div className="card p-5 border-bad/50"><p className="font-semibold text-bad">Something went wrong</p><p className="text-sm text-fg-muted mt-1">Plain cause, then a retry.</p></div>
        </div>
      </Block>
    </div>
  );
}
