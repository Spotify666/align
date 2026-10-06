import type { Metadata } from "next";
import Link from "next/link";
import { sampleAnalysis, textbookStory } from "@/lib/demo";
import { AlignHero } from "@/components/home/align-hero";
import { ShotStory } from "@/components/home/shot-story";
import { Reveal } from "@/components/common/reveal";
import { Intro } from "@/components/landing/intro";
import { Ground } from "@/components/landing/pitch";
import { SHOT_DISPLAY } from "@/engine/classify";
import { Check, Chevron, Lock, Question, Record as RecordIcon, Swap, Target, Trend } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { Logo3D } from "@/components/brand/logo-3d-lazy";

export const metadata: Metadata = {
  title: { absolute: "Aline — eyes over the ball, everything in line" },
  description:
    "Aline watches your forward defence on your phone and shows whether your head, hands and front foot lined up with the ball, then gives you one thing to fix.",
};

// The landing page: what Aline stands for, before any of the app. It has its own header and
// footer (the app shell steps aside on "/"), opens on the brand's black with the mark in 3D,
// and tells one idea in order: the line, the name, the promises, the shot, how to use it,
// the proof.

const PILLARS = [
  { Icon: Target, t: "In line", d: "It measures the alignment that makes a defence work: eyes, head, hands, front foot and ball. Not a vague form score." },
  { Icon: Question, t: "Honest", d: "It checks you really played a forward defence before grading it, and says “not sure” instead of guessing." },
  { Icon: Lock, t: "Private", d: "Your video is analysed on your phone. Nothing leaves it unless you choose to save the result." },
  { Icon: Check, t: "One fix", d: "One priority and one drill for your next net session. Not twenty numbers to decode." },
];

const STEPS = [
  { Icon: RecordIcon, t: "Film one shot", d: "Phone side-on at hip height, 6–8 m away, or from behind the bowler. Slow motion if you have it." },
  { Icon: Target, t: "Aline checks it", d: "It finds the shot and the batter, confirms it was a forward defence, and measures the line." },
  { Icon: Trend, t: "Train one thing", d: "Read the verdict, do the drill, film again. Watch the line straighten, session by session." },
];

export default function Landing() {
  const story = textbookStory();
  // The hero holds the moment just after contact when the ball, dropping dead, is most
  // nearly under the eyes.
  const c = story.moments[3];
  const gap = (i: number) => Math.abs(story.poses[i]!.ball![0] - story.poses[i]!.head[0]);
  const hero = Array.from({ length: 10 }, (_, k) => c + k)
    .filter((i) => story.poses[i]?.ball)
    .reduce((best, i) => (gap(i) < gap(best) ? i : best), c);
  const pull = sampleAnalysis("pull")!;
  const pullShot = pull.payload.observed_shot!;
  const pullEvidence = pull.payload.features.filter((f) => pullShot.evidence_ids.includes(f.id)).map((f) => f.reading);

  return (
    <main id="main">
      <Intro always />
      {/* 1 · The line: a full first screen on the brand's own ground */}
      <section className="landing-dark relative overflow-hidden">
        <Ground pitch />
        <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Aline">
            <Logo size={26} name={false} />
            <span className="text-sm font-semibold tracking-[0.32em]">ALINE</span>
          </Link>
          <Link href="/home" className="btn btn-landing-ghost !min-h-10 !px-4 !py-1.5 text-sm">
            Open the app <Chevron size={16} />
          </Link>
        </header>
        <div className="intro-after relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-6 px-4 pb-14 pt-2 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-20">
          <div className="order-last lg:order-none">
            <p className="lp-muted text-xs font-semibold uppercase tracking-[0.2em]">Cricket technique, checked on your phone</p>
            <h1 className="display mt-5 text-[2.3rem] leading-[1.02] min-[400px]:text-[2.5rem] sm:text-7xl lg:text-[5.2rem]">
              Eyes over the ball.
              <br />
              <span className="lp-muted">Everything in line.</span>
            </h1>
            <p className="lp-muted mt-6 max-w-xl text-base sm:text-lg">
              Aline watches your forward defence and shows whether your head, hands and front foot lined up with the ball. Then it gives you the one thing to
              fix.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/analyse" className="btn btn-landing w-full text-base !px-6 sm:w-auto">Analyse my defence</Link>
              <a href="#stands-for" className="btn btn-landing-ghost w-full text-base !px-6 sm:w-auto">What Aline stands for</a>
            </div>
            <ul className="lp-muted mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <li className="flex items-center gap-1.5"><Lock size={15} /> Video stays on your phone</li>
              <li className="flex items-center gap-1.5"><Check size={15} /> Confirms the shot first</li>
              <li className="flex items-center gap-1.5"><Question size={15} /> Says “not sure” honestly</li>
            </ul>
          </div>
          {/* The mark, in 3D: drag-free, it turns on its own and leans toward the pointer. */}
          <figure className="relative h-[clamp(220px,34svh,300px)] w-full lg:h-[460px]">
            <Logo3D label="The Aline mark" />
          </figure>
        </div>
      </section>

      {/* 2 · The name */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.3fr_1fr]">
          <Reveal>
            <p className="eyebrow">The name</p>
            <p className="display mt-4 text-5xl sm:text-7xl">
              a·line <span className="align-middle text-xl font-normal tracking-normal text-fg-subtle sm:text-2xl">/əˈlaɪn/, said like align</span>
            </p>
            <p className="mt-3 text-xl text-fg-muted sm:text-2xl">a line: head, front knee and front foot, one above the other.</p>
            <p className="mt-8 max-w-2xl text-lg">
              The forward defence is exactly that. <strong>Eyes over the ball. Head over the front knee. Bat beside the pad.</strong> When they line up, the ball
              drops dead at your feet. When they don’t, it finds the edge.
            </p>
            <p className="mt-4 max-w-2xl text-fg-muted">Aline is built to see that one line, and to show you which part of you stepped out of it.</p>
          </Reveal>
          <Reveal delay={0.08}>
            <figure className="overflow-hidden rounded-[22px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] ring-1 ring-line">
              <AlignHero pose={story.poses[hero]!} ballFrom={story.poses[hero - 1]?.ball} after={0.3} />
              <figcaption className="border-t border-line bg-surface px-5 py-4 text-sm">
                <span className="block font-semibold">The mark is the shot.</span>
                <span className="mt-1 block text-fg-muted">A long stride, the front leg straight down the line, the bat in line with it. Everything Aline measures comes back to it.</span>
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* 3 · What it stands for */}
      <section id="stands-for" className="scroll-mt-6 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <Reveal>
            <p className="eyebrow">What Aline stands for</p>
            <h2 className="display mt-3 max-w-3xl text-4xl sm:text-6xl">Feedback you can trust, and train with.</h2>
          </Reveal>
          <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ Icon, t, d }, i) => (
              <Reveal key={t} delay={i * 0.05}>
                <li className="border-t-2 border-brand pt-5">
                  <div className="flex items-center justify-between">
                    <span className="num text-sm text-fg-subtle">0{i + 1}</span>
                    <span className="text-brand"><Icon size={22} /></span>
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight">{t}</h3>
                  <p className="mt-2 text-fg-muted">{d}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 · The shot itself */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <Reveal>
          <p className="eyebrow">See the shot</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display max-w-2xl text-4xl sm:text-6xl">The forward defence in four moves.</h2>
            <p className="max-w-sm text-sm text-fg-muted">This is how every report teaches: your own shot, drawn, with the one idea that matters most.</p>
          </div>
        </Reveal>
        <Reveal className="mt-10">
          <ShotStory story={story} />
        </Reveal>
      </section>

      {/* 5 · How it works */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-3 max-w-2xl text-4xl sm:text-6xl">Film it. Aline checks it. You train it.</h2>
        </Reveal>
        <ol className="mt-12 grid gap-4 lg:grid-cols-3">
          {STEPS.map(({ Icon, t, d }, i) => (
            <Reveal key={t} delay={i * 0.06}>
              <li className="card h-full p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon size={22} /></span>
                  <span className="display text-4xl text-line-strong">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-fg-muted">{d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/sample/valid_ffd" className="btn btn-ghost">See a sample report</Link>
          <Link href="/guide" className="btn btn-quiet">How to film your shot <Chevron size={16} /></Link>
        </div>
      </section>

      {/* 6 · The proof */}
      <section className="band">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow !text-band-muted">The test that matters most</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl">A pull shot never gets a defence score.</h2>
            <p className="mt-4 max-w-lg text-band-muted">
              Most tools grade whatever you upload. Aline first works out what was played. Send it a pull as a forward defence and it says so, with the
              evidence, instead of a misleading number.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <Link href="/sample/pull" className="card card-hover block p-6">
              <span className="chip w-fit !bg-transparent border-[#f2675c]/50 text-[#f2675c]"><Swap size={14} /> Different shot detected</span>
              <p className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Not a front-foot defence</p>
              <p className="mt-2">
                Most likely: <strong>{SHOT_DISPLAY[pullShot.label]}</strong>
              </p>
              <p className="mt-3 inline-block rounded-lg bg-white/10 px-2.5 py-1 text-sm font-medium">Technique score withheld</p>
              <p className="mt-3 text-sm text-band-muted">Evidence: {pullEvidence.join("; ")}.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-band-fg underline underline-offset-4">Open the sample <Chevron size={16} /></span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* 7 · The ask */}
      <section className="landing-dark relative overflow-hidden">
        <Ground />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 sm:py-28">
          <Logo size={120} className="mx-auto" />
          <h2 className="display mt-8 text-5xl sm:text-7xl">Get in line.</h2>
          <p className="lp-muted mx-auto mt-5 max-w-xl text-lg">Film one forward defence and see exactly where your line breaks, and the one thing that fixes it.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/analyse" className="btn btn-landing text-base !px-6">Analyse my defence</Link>
            <Link href="/home" className="btn btn-landing-ghost text-base !px-6">Open the app</Link>
          </div>
        </div>
        <footer className="relative border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-center gap-2.5"><Logo size={20} name={false} /> <span className="text-xs font-semibold tracking-[0.32em]">ALINE</span></span>
            <nav aria-label="Footer" className="lp-muted flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/guide" className="hover:text-white">How it works</Link>
              <Link href="/sample" className="hover:text-white">Sample reports</Link>
              <Link href="/science" className="hover:text-white">Science</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
            </nav>
          </div>
          <p className="lp-muted mx-auto max-w-6xl px-4 pb-8 text-xs sm:px-6">Prototype engine, not yet validated on real athletes. Not a medical assessment.</p>
        </footer>
      </section>
    </main>
  );
}
