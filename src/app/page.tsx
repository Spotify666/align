import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BatterFigure } from "@/components/landing/batter-figure";
import { HeroFigure } from "@/components/landing/hero-figure";
import { analyze } from "@/engine/analyze";
import { fixture } from "@/engine/fixtures";
import { ENGINE_VERSION } from "@/engine/registry";
import { heroData } from "@/lib/hero-geometry";

export const metadata: Metadata = {
  title: { absolute: "Aline — every shot, explained" },
  description:
    "AI-assisted cricket analysis. Upload a cricket shot from your phone: Aline identifies the movement, shows the evidence and turns it into coaching. Front-foot and back-foot defence are graded today. Your video stays on your phone.",
};

const AT = { analysisId: "landing-sample", createdAt: "2026-01-01T00:00:00.000Z" };

const STEPS = [
  { title: "Upload or record", text: "A phone video of one shot, from the side or the bowler's end. A photo works for a position check." },
  { title: "See the evidence", text: "Aline marks the moments of the shot and shows the frame behind every observation, and how sure it is." },
  { title: "Train and improve", text: "One priority, one cue, a drill ladder, then film again to see the change." },
];

const STATS = [
  ["17", "body points tracked"],
  ["2", "shots graded today"],
  ["0", "videos uploaded"],
];

const LEVELS = [
  { name: "Beginner", text: "Plain words. One thing that was good, one thing to fix, one drill." },
  { name: "Amateur", text: "Cricket terms, values where they help, a practice progression." },
  { name: "Professional", text: "Every measure the recording supports, with ranges, timing and uncertainty." },
];

// The landing page: what Aline does, who it is for, what goes in and what comes back, and what
// is true today. One primary action. It has its own header and footer (the app shell steps
// aside on "/"). The batter at the top is an illustration and says so; the sample and the line
// figure beside it are made by the engine, on the server, from a generated example: nothing
// there is a mock-up of a result.
export default function Landing() {
  const sample = analyze(fixture("valid_ffd"), AT);
  const track = fixture("session3d");
  const tracked = analyze(track, AT);
  const contact = tracked.events.find((e) => e.type === "contact")?.frame ?? Math.round(track.body.length / 2);
  // The figure shows the engine's own ranges for the line; without them there is nothing honest to draw.
  const hero = tracked.line ? heroData(track, contact, tracked.line.bands) : null;
  const facts = [
    ["Shot identified", sample.observed_shot?.display ?? "Not identified"],
    ["What was good", sample.strengths[0]?.title ?? "—"],
    ["What to fix", sample.priorities[0]?.title ?? "Nothing out of range"],
    ["Cue", sample.plan?.cue ?? "—"],
  ];

  return (
    <main id="main" className="landing flex min-h-svh flex-col bg-bg text-fg">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label="Aline">
          <Logo size={26} name={false} />
          <span className="text-base font-semibold tracking-tight">Aline</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-fg-muted md:flex">
          <a href="#how" className="hover:text-fg">How it works</a>
          <Link href="/sample" prefetch={false} className="hover:text-fg">Sample analysis</Link>
          <a href="#coaches" className="hover:text-fg">For coaches</a>
          <Link href="/science" prefetch={false} className="hover:text-fg">Science</Link>
        </nav>
        <Link href="/home" prefetch={false} className="btn btn-ghost !min-h-11 !px-4 text-sm">Open the app</Link>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:pb-16 lg:pt-10">
        <div>
          <p className="chip !bg-transparent !px-3 !py-1 text-fg-muted">AI-assisted cricket analysis</p>
          <h1 className="display mt-4 text-[2.75rem] sm:text-6xl lg:text-7xl">
            Every shot, <span className="text-brand">explained.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
            Film one shot on your phone. Aline finds your body, checks your line and shows you one thing to practise. Your video stays on your phone.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/check" className="btn btn-primary w-full !px-7 text-base font-semibold sm:w-auto">
              Check your shot
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link href="/sample/valid_ffd" prefetch={false} className="btn btn-ghost w-full !px-6 text-base sm:w-auto">See a sample result</Link>
          </div>
          <dl className="mt-8 flex flex-wrap gap-x-7 gap-y-3">
            {STATS.map(([n, label]) => (
              <div key={label} className="flex items-baseline gap-2">
                <dd className="order-1 text-2xl font-semibold num">{n}</dd>
                <dt className="order-2 text-sm text-fg-subtle">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <BatterFigure />
      </section>

      <section id="how" aria-labelledby="how-h" className="scroll-mt-6">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-sm font-medium text-fg-subtle">How it works</p>
          <h2 id="how-h" className="display mt-2 text-3xl sm:text-4xl">From one clip to one thing to work on.</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="panel p-5">
                <p className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-sm font-semibold num" aria-hidden>{i + 1}</p>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-fg-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="sample-h">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-12">
          <div>
            <p className="text-sm font-medium text-fg-subtle">What comes back</p>
            <h2 id="sample-h" className="display mt-2 text-3xl sm:text-4xl">A short answer, then the evidence.</h2>
            <p className="mt-3 max-w-md text-fg-muted">
              This one is a generated example, analysed by the same engine that checks your shot.
            </p>
            <dl className="panel mt-6 divide-y divide-line px-5">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-4 py-3.5">
                  <dt className="text-sm text-fg-subtle">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/sample/valid_ffd" prefetch={false} className="btn btn-ghost mt-6">Open the full sample</Link>
          </div>
          {hero && (
            <div className="panel p-5">
              <HeroFigure data={hero} />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="levels-h">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-sm font-medium text-fg-subtle">Your level</p>
          <h2 id="levels-h" className="display mt-2 text-3xl sm:text-4xl">Three levels, one engine.</h2>
          <p className="mt-3 max-w-2xl text-fg-muted">
            Choose your level when you check a shot. It changes the words and how much is shown, never the measurement.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {LEVELS.map((l) => (
              <li key={l.name} className="panel p-5">
                <h3 className="font-semibold">{l.name}</h3>
                <p className="mt-1 text-fg-muted">{l.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="coaches" aria-labelledby="who-h" className="scroll-mt-6">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-2">
          <h2 id="who-h" className="sr-only">For players and for coaches</h2>
          <div className="panel p-6">
            <h3 className="display text-2xl sm:text-3xl">For players</h3>
            <p className="mt-3 text-fg-muted">
              Check a shot after nets, see your line at contact, and track the change over sessions against your own baseline. Comparing with a reference player is in development.
            </p>
            <Link href="/check" className="btn btn-primary mt-6">Check your shot</Link>
          </div>
          <div className="panel p-6">
            <h3 className="display text-2xl sm:text-3xl">For coaches</h3>
            <p className="mt-3 text-fg-muted">
              Invite a player with a code, review the sessions they choose to share, and add your notes beside the evidence. Squads, assignments and exports are in development.
            </p>
            <Link href="/coach" prefetch={false} className="btn btn-ghost mt-6">Open the coach workspace</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="true-h">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-sm font-medium text-fg-subtle">Straight answers</p>
          <h2 id="true-h" className="display mt-2 text-3xl sm:text-4xl">What is true today.</h2>
          <dl className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
            <div>
              <dt className="font-semibold">Graded</dt>
              <dd className="mt-1 text-fg-muted">The front-foot defence and the back-foot defence. Other shots are identified where possible and are not graded yet.</dd>
            </div>
            <div>
              <dt className="font-semibold">On your phone</dt>
              <dd className="mt-1 text-fg-muted">The video is analysed on your device and is not uploaded. Results leave it only if you sign in and choose to save or share them.</dd>
            </div>
            <div>
              <dt className="font-semibold">Works best</dt>
              <dd className="mt-1 text-fg-muted">Side-on or from the bowler&apos;s end, the whole batter in frame, steady camera, 60 frames a second or more.</dd>
            </div>
            <div>
              <dt className="font-semibold">Experimental</dt>
              <dd className="mt-1 text-fg-muted">A prototype (engine {ENGINE_VERSION}). Ranges are provisional coaching ranges and the engine is not yet validated on real athletes. When it can&apos;t tell, it says so. Not a medical assessment.</dd>
            </div>
          </dl>
          <div className="panel mt-12 px-6 py-10 text-center">
            <h2 className="display text-3xl sm:text-4xl">See your shot more clearly.</h2>
            <p className="mx-auto mt-3 max-w-md text-fg-muted">No sign-up. One clip from your phone is enough to start.</p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Link href="/check" className="btn btn-primary w-full !px-7 text-base font-semibold sm:w-auto">Check your shot</Link>
              <Link href="/science" prefetch={false} className="inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4 hover:text-fg">How the analysis works and what is validated</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lane mt-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 text-fg-muted">
            {[["/guide", "How it works"], ["/sample", "Sample analysis"], ["/science", "Science"], ["/privacy", "Privacy"], ["/visitors", "Visitors"]].map(([href, label]) => (
              <Link key={href} href={href!} prefetch={false} className="inline-flex min-h-11 items-center hover:text-fg">{label}</Link>
            ))}
          </nav>
          <p className="text-xs text-fg-subtle">Your video stays on your phone. Not a medical assessment.</p>
        </div>
      </footer>
    </main>
  );
}
