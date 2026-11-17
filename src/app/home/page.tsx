import type { Metadata } from "next";
import Link from "next/link";
import { HomeNext } from "@/components/home/home-next";
import { MotionFigure } from "@/components/home/motion-figure";
import { ShotVideo } from "@/components/home/shot-video";
import { Reveal } from "@/components/common/reveal";

// The app's home: the next shot first, a real defence played on Aline's figure with the line it
// reads, then a coach playing each defence. Kept short on
// purpose: the guide, the science and sample reports are a tap away.

export const metadata: Metadata = { title: "Home" };

export default function AppHome() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
          <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h1 className="display text-3xl sm:text-5xl">Film one shot.</h1>
              <p className="mt-3 max-w-md text-lg text-fg-muted">What was good, and one thing to fix.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2.5 sm:w-60">
              <Link href="/check" className="btn btn-primary text-base">Check your shot</Link>
              <Link href="/guide" className="btn btn-ghost text-base">How to film</Link>
            </div>
          </div>
        </div>
      </section>

      <HomeNext />

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14">
        <Reveal>
          <h2 className="display text-3xl sm:text-4xl">What Aline reads</h2>
        </Reveal>
        <Reveal className="mt-6">
          <MotionFigure />
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14">
        <Reveal>
          <h2 className="display text-3xl sm:text-4xl">The front-foot defence</h2>
        </Reveal>
        <Reveal className="mt-6">
          <ShotVideo shot="front" />
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <Reveal>
          <h2 className="display text-3xl sm:text-4xl">The back-foot defence</h2>
        </Reveal>
        <Reveal className="mt-6">
          <ShotVideo shot="back" />
        </Reveal>
        <p className="mt-8 text-sm text-fg-muted">
          <Link href="/sample" className="inline-flex min-h-11 items-center underline underline-offset-4">See sample reports</Link>
        </p>
      </section>
    </div>
  );
}
