import type { Metadata } from "next";
import Link from "next/link";
import { sampleAnalysis, textbookStory } from "@/lib/demo";
import { ShotStory } from "@/components/home/shot-story";
import { Reveal } from "@/components/common/reveal";
import { Intro } from "@/components/landing/intro";
import { Check, Swap, Question, CameraOff, Chevron, Record as RecordIcon, Target, Trend } from "@/components/icons";

// The app's home (the landing page at "/" tells newcomers what Align stands for): the next
// shot first, then the shot explained, how to film it, and what a report can say.
const STEPS = [
  { Icon: RecordIcon, t: "Film one shot", d: "Phone side-on at hip height, 6–8 m away, or from behind the bowler. Slow motion if you have it; long clips are fine." },
  { Icon: Target, t: "Align checks it", d: "It finds the shot and the batter, confirms it was a forward defence, and measures how you played it." },
  { Icon: Trend, t: "Train one thing", d: "Read the verdict, do the drill, re-record. Your progress builds shot by shot." },
];

export const metadata: Metadata = { title: "Home" };

export default function AppHome() {
  const valid = sampleAnalysis("valid_ffd")!;
  const v = valid.payload;
  // The explainer plays the textbook defence, not the sample (which has a fault to fix).
  const story = textbookStory();
  const keyMetrics = ["line_head", "sync_spread", "stride_length"].map((id) => v.metrics.find((m) => m.id === id)!);

  return (
    <div>
      <Intro />
      {/* The app's home: straight to the next shot */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[360px] grid-bg opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
          <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="eyebrow">Your next net session</p>
              <h1 className="display mt-2 text-3xl sm:text-5xl">Film one defence. Get your line checked.</h1>
              <p className="mt-3 max-w-xl text-fg-muted">Eyes over the ball, head over the front knee, bat beside the pad: Align shows which part was out of line and the one thing to fix.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2.5 sm:w-56">
              <Link href="/analyse" className="btn btn-primary text-base">Analyse my defence</Link>
              <Link href="/sample/valid_ffd" className="btn btn-ghost">See a sample report</Link>
              <Link href="/" className="inline-flex items-center justify-center gap-1 pt-1 text-sm text-fg-subtle hover:text-fg">What Align stands for <Chevron size={14} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Learn the shot */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14">
        <Reveal>
          <p className="eyebrow">Learn the shot</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-3xl sm:text-5xl max-w-2xl">The forward defence in four moves.</h2>
            <p className="max-w-sm text-sm text-fg-muted">Every report teaches the same way: your own shot, drawn, with the one idea that matters most.</p>
          </div>
        </Reveal>
        <Reveal className="mt-8">
          <ShotStory story={story} />
        </Reveal>
      </section>

      {/* How it works, and what comes back */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-3xl sm:text-5xl max-w-2xl">Film it. Align checks it. You train it.</h2>
            <Link href="/guide" className="btn btn-ghost">How to film</Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.05fr]">
          <ol className="grid gap-4">
            {STEPS.map(({ Icon, t, d }, i) => (
              <Reveal key={t} delay={i * 0.05}>
                <li className="card flex h-full gap-4 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon size={20} /></span>
                  <div>
                    <h3 className="font-semibold tracking-tight"><span className="num text-fg-subtle">{i + 1}.</span> {t}</h3>
                    <p className="mt-1 text-sm text-fg-muted">{d}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={0.08}>
            <Link href="/sample/valid_ffd" className="card card-hover flex h-full flex-col gap-4 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Your report</span>
                <span className="demo-badge">DEMO DATA</span>
              </div>
              <span className="chip w-fit border-ok/40 text-ok"><Check size={14} /> Valid front-foot defence</span>
              <p className="text-xl font-semibold tracking-tight">Main priority: get your head over the front knee.</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {keyMetrics.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="text-fg-muted">{m.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="num">{m.value?.toFixed(m.decimals)}</span>
                      <span className={`h-2 w-2 rounded-full ${m.inRange === false ? "bg-bad" : "bg-ok"}`} aria-hidden />
                      <span className="sr-only">{m.inRange === false ? "outside range" : "within range"}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-brand-soft p-3 text-sm">
                <p className="font-medium">Cue: “{v.plan?.cue}”</p>
                <p className="mt-1 text-fg-muted">{v.plan?.drills[0]?.name} · {v.plan?.drills[0]?.dosage}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand">Open the full sample report <Chevron size={16} /></span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Four outcomes */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <Reveal>
          <p className="eyebrow">Four honest outcomes</p>
          <h2 className="display mt-3 text-3xl sm:text-5xl max-w-3xl">“Not sure” is a result, not a failure.</h2>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/sample/valid_ffd", Icon: Check, tone: "text-ok border-ok/40", t: "Valid front-foot defence", d: "Six areas measured with uncertainty, one priority, up to two drills." },
            { href: "/sample/pull", Icon: Swap, tone: "text-bad border-bad/40", t: "Different shot detected", d: "Named with evidence. No score, no misleading number." },
            { href: "/sample/occluded", Icon: Question, tone: "text-warn border-warn/40", t: "Shot uncertain", d: "No forced label — and exactly what to change next time." },
            { href: "/sample/capture_failed", Icon: CameraOff, tone: "text-neutral border-neutral/40", t: "Capture failed", d: "Caught before processing, with concrete fixes." },
          ].map(({ href, Icon, tone, t, d }, i) => (
            <Reveal key={href} delay={i * 0.04}>
              <li className="h-full">
                <Link href={href} className="card card-hover block h-full p-5">
                  <span className={`chip ${tone}`}><Icon size={14} /> {t}</span>
                  <p className="mt-4 text-sm text-fg-muted">{d}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">View example <Chevron size={14} /></span>
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

    </div>
  );
}
