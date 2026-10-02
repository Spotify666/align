import Link from "next/link";
import type { Metadata } from "next";
import { CLASSIFIER_VERSION, DOMAIN_LABELS, ENGINE_VERSION, INDEX_WEIGHTS_VERSION, METRICS, METRIC_VERSION, POSE_MODEL, REGISTRY_HASH, THRESHOLDS } from "@/engine/registry";
import { DRILL_LIBRARY_VERSION } from "@/engine/coaching";
import { PROTOTYPES, SHOT_DISPLAY } from "@/engine/classify";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { MODEL_ROUTES } from "@/engine/llm/eval";

export const metadata: Metadata = { title: "Science and validation" };

const Section = ({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20 space-y-4">
    <p className="eyebrow">{eyebrow}</p>
    <h2 className="display text-3xl sm:text-4xl">{title}</h2>
    {children}
  </section>
);

export default function SciencePage() {
  const ffd = PROTOTYPES.front_foot_defence;
  const compare = ["front_foot_defence", "front_foot_drive", "pull", "back_foot_defence"] as const;
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-14">
      <header className="space-y-3">
        <p className="eyebrow">Science and validation</p>
        <h1 className="display text-5xl">How a result is produced — and what is not yet proven.</h1>
        <p className="text-fg-muted max-w-3xl">
          Align is a measurement system with an explanation layer, not an AI that watches cricket. This page lists every rule, range and version the engine
          uses. Nothing here is a claim of accuracy on real athletes: that validation has not been done yet.
        </p>
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="On this page">
          {[["order", "Decision order"], ["ontology", "Shots"], ["metrics", "Measures"], ["index", "Index"], ["thresholds", "Thresholds"], ["validation", "Validation"], ["llm", "Language model"], ["refs", "References"]].map(([id, l]) => (
            <a key={id} href={`#${id}`} className="chip border-line-strong text-fg-muted min-h-9">{l}</a>
          ))}
        </nav>
      </header>

      <Section id="order" eyebrow="Policy" title="The decision order never changes">
        <ol className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2">
          {[
            ["Is the capture usable?", "Resolution, frame rate, length, full-body visibility, light, blur, shake, people in frame, camera angle, scale."],
            ["Can body, bat, ball and pitch be tracked?", "Body from on-device pose; bat and ball from tracking or your marks — every mark labelled as yours."],
            ["What delivery came down?", "Bounce position and arrival height give soft full / good / short probabilities. No ball, no claim."],
            ["What shot was attempted?", "Open-set prototype model over body, bat and ball features, with an explicit 'unknown' class."],
            ["Is it a front-foot defence?", "Strict acceptance (body + bat + ball, high score, clear margin). Rejection may rest on fewer signals."],
            ["Only then: how was it executed?", "Six domains of measures with uncertainty, provisional ranges, one priority and up to two drills."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-surface p-5">
              <span className="num text-brand text-sm">{i + 1}</span>
              <p className="mt-1 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-fg-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="ontology" eyebrow="Shot ontology" title="One graded shot, many recognised ones">
        <p className="text-fg-muted">Only the front-foot defence is graded in this release. Other shots are recognised so they can be rejected with evidence; each unlocks only after passing the same validation bar.</p>
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-subtle border-b border-line">
                <th className="p-3 font-normal">Feature (typical band)</th>
                {compare.map((c) => <th key={c} className="p-3 font-normal">{SHOT_DISPLAY[c]}</th>)}
              </tr>
            </thead>
            <tbody className="num">
              {Object.keys(ffd).map((f) => (
                <tr key={f} className="border-b border-line last:border-0">
                  <td className="p-3 text-fg-muted">{f.replaceAll("_", " ")}</td>
                  {compare.map((c) => {
                    const b = (PROTOTYPES[c] as Record<string, readonly number[]>)[f];
                    return <td key={c} className="p-3">{b ? `${b[0]}–${b[1]}` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-subtle">Units: fractions of standing height, degrees, or height per second. Bands are coach-authored prototypes ({CLASSIFIER_VERSION}); scores are softened likelihoods, not calibrated probabilities.</p>
      </Section>

      <Section id="metrics" eyebrow={`Measures · ${METRIC_VERSION}`} title="Front-foot-defence movement indicators">
        <ul className="grid gap-3 sm:grid-cols-2">
          {METRICS.map((m) => (
            <li key={m.id} className="card p-4">
              <p className="text-xs text-fg-subtle">{DOMAIN_LABELS[m.domain]}</p>
              <p className="font-semibold">{m.name} <span className="num text-sm text-fg-muted">({m.unit || "ratio"})</span></p>
              <p className="mt-1 text-sm text-fg-muted">{m.meaning}</p>
              <p className="mt-2 text-xs num text-fg-subtle">
                phase {m.phase} · range {m.range ? `${m.range.lo}–${m.range.hi}` : "none (baseline only)"} · needs {m.requires.join(", ")} · index weight {m.weight}
                {m.only ? ` · ${m.only} only` : ""}
              </p>
              {m.basis && <p className="mt-1.5 text-xs text-fg-muted">Range: {m.basis}</p>}
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-muted">These are movement indicators, not biomarkers or diagnoses. Ranges are provisional coaching ranges for adult club batters facing medium pace from a side-on view, pending validation.</p>
        <p className="text-sm text-fg-muted">
          <strong className="text-fg">The position formula (photos).</strong> A side-on photo is checked against seven of these at once: stride (foot to foot), front knee, back leg,
          head over the front knee, trunk lean, weight over the front foot, and hands ahead of the front knee. Each is met or not; the photo is taken to be the moment of contact.
          A photo can&apos;t show timing, the bat&apos;s path or the ball, and a drive can look the same at contact, so a photo never confirms the shot or gets a score.
        </p>
        <p className="text-xs text-fg-subtle">
          Sources: Stretch RA, Buys F, Du Toit E, Viljoen G (1998), Kinematics and kinetics of the drive off the front foot in cricket batting, Journal of Sports Sciences
          (bat angle at impact in the forward defence: 62.6 ± 6.5° from horizontal; drive 77.8 ± 7.1°). Taliep MS, Galal U, Vaughan CL (2007), The position of the head and
          centre of mass during the front foot off-drive in skilled and less-skilled cricket batsmen, Sports Biomechanics (skilled batters&apos; head and centre of mass further
          forward; less-skilled more upright at the hip). Where no measurement exists, the range is a coaching criterion and says so.
        </p>
      </Section>

      <Section id="index" eyebrow={INDEX_WEIGHTS_VERSION} title="The secondary technique index">
        <p className="text-fg-muted">
          Shown only for a valid defence with at least {THRESHOLDS["index.min_domains"].value} of 6 domains measured. Each measure scores 1 inside its range and falls off as
          exp(−½·(d/0.5)²), where d is the distance outside the range in half-range-widths. The index is the weight-averaged score × 100, rounded to an integer, with a band
          from re-scoring at ± one uncertainty. Domains are always read first; the index is a summary, never the truth.
        </p>
      </Section>

      <Section id="thresholds" eyebrow={`Registry ${REGISTRY_HASH}`} title="Every threshold, with its reason">
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-fg-subtle border-b border-line"><th className="p-3 font-normal">Rule</th><th className="p-3 font-normal">Value</th><th className="p-3 font-normal">Why</th></tr></thead>
            <tbody>
              {Object.entries(THRESHOLDS).map(([k, t]) => (
                <tr key={k} className="border-b border-line last:border-0 align-top">
                  <td className="p-3 num text-xs">{k}</td>
                  <td className="p-3 num whitespace-nowrap">{t.value} {t.unit}</td>
                  <td className="p-3 text-fg-muted">{t.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[["Engine", ENGINE_VERSION], ["Metrics", METRIC_VERSION], ["Classifier", CLASSIFIER_VERSION], ["Pose model", POSE_MODEL], ["Drill library", DRILL_LIBRARY_VERSION], ["Registry hash", REGISTRY_HASH]].map(([k, v]) => (
            <div key={k} className="card p-3"><dt className="text-fg-subtle text-xs">{k}</dt><dd className="num break-all">{v}</dd></div>
          ))}
        </dl>
      </Section>

      <Section id="validation" eyebrow="Validation status" title="Tested, not yet validated">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-4"><p className="font-semibold">Research basis</p><p className="mt-1 text-sm text-fg-muted">Defence vs drive differ mainly in bat and ball speed, not body shape — so acceptance requires bat and ball.</p></div>
          <div className="card p-4"><p className="font-semibold">Internal engineering tests</p><p className="mt-1 text-sm text-fg-muted">Synthetic fixtures (below), 31 pull variants that must never be scored, reproducibility and report-contract tests, run on every change.</p></div>
          <div className="card p-4 border-warn/50"><p className="font-semibold text-warn">Real-athlete validation</p><p className="mt-1 text-sm text-fg-muted">Not done. Planned release gates: non-defence false-accept below 2%, at least 90% recall of usable defences, event timing and joint-angle error targets per tier.</p></div>
        </div>
        <ul className="card divide-y divide-line">
          {FIXTURE_SPECS.map((f) => (
            <li key={f.key} className="p-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href={`/sample/${f.key}`} className="font-medium hover:underline">{f.title}</Link>
              <span className="num text-xs text-fg-subtle">{f.expectation}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="llm" eyebrow="Language model boundary" title="Explains the evidence. Never measures.">
        <p className="text-fg-muted">The written report comes from a fixed template, or optionally a language model given the typed payload. Every sentence with a number must cite payload IDs and match them; reports that contradict the status, invent a measure or use medical language are rejected and the template is used instead.</p>
        <ul className="card divide-y divide-line text-sm">
          {MODEL_ROUTES.map((r) => (
            <li key={r.id} className="p-3 flex flex-wrap gap-x-4">
              <span className="num">{r.model}</span>
              <span className="text-fg-muted">{r.role}</span>
              <span className="ml-auto text-xs text-fg-subtle">{r.implemented ? "adapter implemented" : "eval harness only"}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="refs" eyebrow="References" title="Sources">
        <ul className="space-y-2 text-sm text-fg-muted list-disc pl-5">
          <li><a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/10189076/">Stretch et al., 1998 — front-foot drive and forward defence kinematics</a></li>
          <li><a className="underline" href="https://www.researchgate.net/publication/5912436_The_position_of_the_head_and_centre_of_mass_during_the_front_foot_off-drive_in_skilled_and_less-skilled_cricket_batsmen">Taliep et al., 2007 — head and centre of mass at contact, skilled vs less-skilled batters</a></li>
          <li><a className="underline" href="https://doi.org/10.1371/journal.pcbi.1011462">OpenCap — multi-phone markerless biomechanics</a></li>
          <li><a className="underline" href="https://arxiv.org/abs/1907.03698">TrackNet — tracking small, fast sports balls</a></li>
          <li><a className="underline" href="https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker">MediaPipe Pose Landmarker</a></li>
          <li><a className="underline" href="https://openaccess.thecvf.com/content/ICCV2023/papers/Zhu_MotionBERT_A_Unified_Perspective_on_Learning_Human_Motion_Representations_ICCV_2023_paper.pdf">MotionBERT — temporal 3D pose lifting</a></li>
        </ul>
      </Section>
    </div>
  );
}
