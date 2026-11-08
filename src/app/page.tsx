import type { Metadata } from "next";
import Link from "next/link";
import { Intro } from "@/components/landing/intro";
import { Chevron } from "@/components/icons";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: { absolute: "Aline — eyes over the ball, everything in line" },
  description: "Film your front-foot or back-foot defence on your phone. Aline checks it and tells you, in a few simple lines, what was good and what to fix.",
};

// The landing page: the idea in one line, the two things you can do, and how, in three
// steps. Nothing else (the guide, the science and sample reports are one tap away in the
// footer). It has its own header and footer (the app shell steps aside on "/") and opens
// in the two tones, black on sage-cream, with the flat mark.

const STEPS = ["Film one shot from the side.", "Add it here.", "Read your feedback. Practise. Film again."];

export default function Landing() {
  return (
    <main id="main" className="landing-light flex min-h-svh flex-col">
      <Intro always />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Aline">
          <Logo size={26} name={false} />
          <span className="text-sm font-semibold tracking-[0.32em]">ALINE</span>
        </Link>
        <Link href="/home" className="btn btn-landing-ghost !min-h-10 !px-4 !py-1.5 text-sm">
          Open the app <Chevron size={16} />
        </Link>
      </header>

      <section className="flex flex-1">
        <div className="intro-after mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pb-12 pt-2 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="order-last lg:order-none">
          <h1 className="display text-[2.4rem] leading-[1.02] min-[400px]:text-[2.7rem] sm:text-7xl lg:text-[5.2rem]">
            Eyes over the ball.
            <br />
            <span className="lp-muted">Everything in line.</span>
          </h1>
          <p className="lp-muted mt-5 max-w-md text-lg">Check your defence on your phone.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/analyse" className="btn btn-landing w-full text-base !px-6 sm:w-auto">Check front-foot defence</Link>
            <Link href="/analyse?shot=back" className="btn btn-landing-ghost w-full text-base !px-6 sm:w-auto">Check back-foot defence</Link>
          </div>
          <ol className="mt-9 grid gap-3 border-t border-[var(--lp-line)] pt-6 sm:max-w-md" aria-label="How it works">
            {STEPS.map((t, i) => (
              <li key={t} className="flex items-baseline gap-3 text-base">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full border border-[var(--lp-fg)] text-sm font-semibold">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        {/* The mark, flat: a black silhouette of the shot on the sage-cream ground. */}
        <figure className="grid h-[clamp(170px,28svh,260px)] w-full place-items-center lg:h-[420px]">
          <Logo size={300} className="h-full w-auto max-w-full" title="The Aline mark" />
        </figure>
        </div>
      </section>

      <footer className="border-t border-[var(--lp-line)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <nav aria-label="Footer" className="lp-muted flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/guide" className="hover:text-[var(--lp-fg)]">How to film</Link>
            <Link href="/sample" className="hover:text-[var(--lp-fg)]">Sample reports</Link>
            <Link href="/science" className="hover:text-[var(--lp-fg)]">Science</Link>
            <Link href="/privacy" className="hover:text-[var(--lp-fg)]">Privacy</Link>
            <Link href="/visitors" className="hover:text-[var(--lp-fg)]">Visitors</Link>
          </nav>
          <p className="lp-muted text-xs">Your video stays on your phone. Not a medical assessment.</p>
        </div>
      </footer>
    </main>
  );
}
