import Link from "next/link";
import { sampleAnalysis, textbookStory } from "@/lib/demo";
import { AlignHero } from "@/components/home/align-hero";
import { ShotStory } from "@/components/home/shot-story";
import { Reveal } from "@/components/common/reveal";
import { SHOT_DISPLAY } from "@/engine/classify";
import { Check, Swap, Question, CameraOff, Chevron, Record as RecordIcon, Target, Trend, Lock, Mark } from "@/components/icons";

// What Align stands for, in the order a newcomer needs it: the idea (one straight line from
// the eyes to the ball), the name and mark that carry it, the promises behind the product,
// then the shot itself, how to use it, and the proof that it won't flatter you.
const PILLARS = [
  { Icon: Target, t: "In line", d: "It measures the alignment that makes a defence work: head, hands, front foot and ball. Not a generic form score." },
  { Icon: Question, t: "Honest", d: "It checks you really played a defence before grading it, and says “not sure” rather than guess." },
  { Icon: Lock, t: "Private", d: "Your video is analysed on your phone. Nothing leaves it unless you choose to save the result." },
  { Icon: Check, t: "One fix", d: "One priority and one drill for your next net. Not twenty numbers to decode." },
];

const STEPS = [
  { Icon: RecordIcon, t: "Film one shot", d: "Phone side-on at hip height, 6–8 m away, or from behind the bowler. Slow motion if you have it; long clips are fine." },
  { Icon: Target, t: "Align checks it", d: "It finds the shot and the batter, confirms it was a forward defence, and measures how you played it." },
  { Icon: Trend, t: "Train one thing", d: "Read the verdict, do the drill, re-record. Your progress builds shot by shot." },
];

export default function Home() {
  const valid = sampleAnalysis("valid_ffd")!;
  const pull = sampleAnalysis("pull")!;
  const v = valid.payload;
  const pullShot = pull.payload.observed_shot!;
  const pullEvidence = pull.payload.features.filter((f) => pullShot.evidence_ids.includes(f.id)).map((f) => f.reading);
  // The explainer plays the textbook defence, not the sample (which has a fault to fix).
  const story = textbookStory();
  // The hero holds the moment just after contact when the ball, dropping dead, is most
  // nearly under the eyes.
  const c = story.moments[3];
  const hero = Array.from({ length: 10 }, (_, k) => c + k)
    .filter((i) => story.poses[i]?.ball)
    .reduce((best, i) => (Math.abs(story.poses[i]!.ball![0] - story.poses[i]!.head[0]) < Math.abs(story.poses[best]!.ball![0] - story.poses[best]!.head[0]) ? i : best), c);
  const keyMetrics = ["head_knee_offset", "stride_length", "bat_angle_contact"].map((id) => v.metrics.find((m) => m.id === id)!);

  return (
    <div>
      {/* Hero: the idea in one line */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] grid-bg opacity-70" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface py-1 pl-1 pr-3 text-xs text-fg-muted shadow-sm">
              <Mark size={22} /> Align · your forward defence, checked on your phone
            </p>
            <h1 className="display mt-6 text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-7xl">
              Eyes over the ball.
              <br />
              <span className="text-brand">Everything in line.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg text-fg-muted">
              Align watches one front-foot defence and shows whether your head, hands and front foot lined up with the ball. Then it gives you the one thing to train next.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/analyse" className="btn btn-primary w-full sm:w-auto text-base !px-5">Analyse my defence</Link>
              <Link href="/sample/valid_ffd" className="btn btn-ghost w-full sm:w-auto text-base !px-5">See a sample report</Link>
            </div>
            <p className="mt-5 text-sm text-fg-subtle">Video stays on your phone · Fully automatic · Says “not sure” when it isn’t</p>
          </div>
          <Reveal>
            <figure className="lesson-card">
              <AlignHero pose={story.poses[hero]!} ballFrom={story.poses[hero - 1]?.ball} />
              <figcaption className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
                <span className="text-fg-muted">The forward defence: the ball drops dead</span>
                <span className="chip border-ok/40 text-ok"><Check size={14} /> In line</span>
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* The name and the mark */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20">
        <Reveal>
          <div className="card grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.5fr_1fr] lg:items-center">
            <div>
              <p className="eyebrow">Why “Align”</p>
              <h2 className="display mt-3 text-3xl sm:text-5xl">A good defence is one straight line.</h2>
              <p className="mt-4 max-w-2xl text-fg-muted">
                Eyes over the ball. Head over the front knee. The bat coming down beside the pad. When those line up, the ball drops dead at your feet; when they
                don’t, it finds the edge. Align is built to see that line, and to show you which part of you was out of it.
              </p>
            </div>
            <div className="flex items-center gap-5 rounded-2xl bg-brand-soft p-5">
              <span className="shrink-0 overflow-hidden rounded-[22px] shadow-[var(--shadow-card)]"><Mark size={88} /></span>
              <p className="text-sm text-fg-muted">
                <span className="block font-semibold text-fg">The mark is the shot.</span>
                An eye kept level, directly above the ball, joined by one line. Everything Align measures comes back to it.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* What Align stands for */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20">
        <Reveal>
          <p className="eyebrow">What Align stands for</p>
          <h2 className="display mt-3 text-3xl sm:text-5xl max-w-3xl">Feedback you can trust, and train with.</h2>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ Icon, t, d }, i) => (
            <Reveal key={t} delay={i * 0.05}>
              <li className="card h-full p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon size={20} /></span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-sm text-fg-muted">{d}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Learn the shot */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20">
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

      {/* Wrong-shot trust demo */}
      <section className="band">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow !text-band-muted">The test that matters most</p>
            <h2 className="display mt-3 text-3xl sm:text-5xl">A pull shot never gets a defence score.</h2>
            <p className="mt-4 text-band-muted max-w-lg">
              Most tools grade whatever you upload. Align first works out what was played. Submit a pull as a forward defence and it is rejected — with the
              evidence — instead of a misleading number.
            </p>
            <p className="mt-4 text-sm text-band-muted">Release gate: 31 pull variants (seeds, frame rates, handedness, missing bat or ball, noise). None may be scored.</p>
          </Reveal>
          <Reveal delay={0.08}>
            <Link href="/sample/pull" className="card card-hover block p-6">
              <span className="chip w-fit !bg-transparent border-[#f2675c]/50 text-[#f2675c]"><Swap size={14} /> Different shot detected</span>
              <p className="mt-4 text-2xl sm:text-3xl font-semibold tracking-tight">Not a front-foot defence</p>
              <p className="mt-2">
                Most likely: <strong>{SHOT_DISPLAY[pullShot.label]}</strong> <span className="num text-band-muted">— {Math.round(pullShot.probability * 100)}% prototype confidence</span>
              </p>
              <p className="mt-3 inline-block rounded-lg bg-white/10 px-2.5 py-1 text-sm font-medium">Technique score withheld</p>
              <p className="mt-3 text-sm text-band-muted">Evidence: {pullEvidence.join("; ")}.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#5bcd9f]">Open the sample <Chevron size={16} /></span>
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

      {/* Players and coaches */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="card h-full p-7">
            <p className="eyebrow">For players</p>
            <h3 className="display mt-3 text-3xl">One correction for your next net.</h3>
            <p className="mt-3 text-fg-muted">Record, check the verdict, train the drill, re-record. Your video stays on your phone unless you choose to save it.</p>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="card h-full p-7">
            <p className="eyebrow">For coaches</p>
            <h3 className="display mt-3 text-3xl">Consistent evidence across a squad.</h3>
            <p className="mt-3 text-fg-muted">Players share with an invite code. Review queue, notes that never overwrite the model result, and side-by-side comparison.</p>
          </div>
        </Reveal>
      </section>

      {/* Evidence and validation */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
        <Reveal>
          <div className="card p-7 grid gap-8 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="eyebrow">Evidence and validation</p>
              <h2 className="display mt-3 text-3xl">What is tested, and what is claimed.</h2>
              <Link href="/science" className="btn btn-ghost mt-5">Read the methodology</Link>
            </div>
            <dl className="grid gap-6 sm:grid-cols-3">
              <div><dt className="font-semibold">Research basis</dt><dd className="mt-1 text-sm text-fg-muted">Defence and drive look alike in body shape but differ in bat and ball speed (Stretch et al., 1998) — so bat and ball are required to accept a defence.</dd></div>
              <div><dt className="font-semibold">Internal tests</dt><dd className="mt-1 text-sm text-fg-muted">12 synthetic fixtures, 31 pull variants and a 40-seed stability gate run on every change. Engineering tests, not accuracy claims.</dd></div>
              <div><dt className="font-semibold">Real-athlete validation</dt><dd className="mt-1 text-sm text-fg-muted">Not yet done. No accuracy figure is published until a named, versioned evaluation exists.</dd></div>
            </dl>
          </div>
        </Reveal>
      </section>

      <section className="band">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 text-center">
          <span className="inline-block overflow-hidden rounded-[18px]"><Mark size={64} /></span>
          <h2 className="display mt-6 text-4xl sm:text-6xl">Get in line.</h2>
          <p className="mx-auto mt-4 max-w-xl text-band-muted">Record one forward defence and see exactly where your line breaks, and the one thing that fixes it.</p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/analyse" className="btn btn-primary !px-5">Analyse my defence</Link>
            <Link href="/guide" className="btn !px-5 border border-white/20 text-band-fg hover:bg-white/10">How it works</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
