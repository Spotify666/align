import Link from "next/link";
import { sampleAnalysis, textbookClip } from "@/lib/demo";
import { HeroVisual } from "@/components/home/hero-visual";
import { ShotStory } from "@/components/home/shot-story";
import { Reveal } from "@/components/common/reveal";
import { SHOT_DISPLAY } from "@/engine/classify";
import { Check, Swap, Question, CameraOff, Chevron, Record as RecordIcon, Upload, Target, Trend } from "@/components/icons";

export default function Home() {
  const valid = sampleAnalysis("valid_ffd")!;
  const pull = sampleAnalysis("pull")!;
  const v = valid.payload;
  const contact = v.events.find((e) => e.type === "contact")?.frame ?? 100;
  const trigger = v.events.find((e) => e.type === "trigger")?.frame ?? 20;
  const pullShot = pull.payload.observed_shot!;
  const pullEvidence = pull.payload.features.filter((f) => pullShot.evidence_ids.includes(f.id)).map((f) => f.reading);
  // The explainer draws the textbook defence, not the sample (which has a fault to fix).
  const book = textbookClip();
  const at = (t: string, d: number) => book.payload.events.find((e) => e.type === t)?.frame ?? d;
  const story = [at("setup", 0), at("backswing_top", 85), at("front_foot_plant", 100), at("contact", 105)].map((f) => ({
    body: book.obs.body[f]!,
    bat: [book.obs.bat.handle[f], book.obs.bat.toe[f]] as [(typeof book.obs.bat.handle)[number] | undefined, (typeof book.obs.bat.toe)[number] | undefined],
  }));
  const keyMetrics = ["head_knee_offset", "stride_length", "bat_angle_contact"].map((id) => v.metrics.find((m) => m.id === id)!);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] grid-bg opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-20 text-center">
          <Link href="/guide" className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs text-fg-muted shadow-sm hover:text-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Now analysing the front-foot defence · more shots after validation <Chevron size={14} />
          </Link>
          <h1 className="display mx-auto mt-6 max-w-4xl text-[2.6rem] sm:text-6xl lg:text-7xl">See the shot your body actually played.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-fg-muted">
            Record one front-foot defence on your phone. Align confirms it really was a defence, measures how you played it, and gives you one thing to train next.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/analyse" className="btn btn-primary w-full sm:w-auto text-base !px-5">Analyse front-foot defence</Link>
            <Link href="/sample/valid_ffd" className="btn btn-ghost w-full sm:w-auto text-base !px-5">See a sample report</Link>
          </div>
          <p className="mt-5 text-sm text-fg-subtle">Video stays on your phone · Fully automatic · Says “not enough information” when it isn’t sure</p>
        </div>

        {/* Product window */}
        <Reveal className="relative mx-auto mt-12 max-w-6xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="ml-3 truncate text-xs text-fg-subtle num">align · report · front-foot defence</span>
              <span className="demo-badge ml-auto">DEMO DATA</span>
            </div>
            <div className="grid lg:grid-cols-[1.45fr_1fr]">
              <div className="min-w-0 aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[420px]">
                <HeroVisual obs={valid.obs} from={trigger} to={Math.min(valid.obs.body.length - 1, contact + 36)} still={contact} />
              </div>
              <div className="flex flex-col gap-4 border-t border-line p-5 text-left lg:border-l lg:border-t-0">
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
                <Link href="/sample/valid_ffd" className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand">Open the full report <Chevron size={16} /></Link>
              </div>
            </div>
          </div>
        </Reveal>
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
          <ShotStory frames={story} aspect={book.obs.media.width / book.obs.media.height} hand={book.obs.athlete.handedness} />
        </Reveal>
      </section>

      {/* How to analyse */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <Reveal>
          <p className="eyebrow">How to analyse your front-foot defence</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-3xl sm:text-5xl max-w-2xl">Film it. Upload it. Align does the rest.</h2>
            <Link href="/guide" className="btn btn-ghost">Read the full guide</Link>
          </div>
        </Reveal>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { Icon: RecordIcon, k: "Film", t: "Record in slow motion", d: "Phone side-on at hip height, 6–8 m away, on a stand — or from behind the bowler. Long clips are fine." },
            { Icon: Upload, k: "Upload", t: "Add the clip", d: "One tap. No trimming, no settings." },
            { Icon: Target, k: "Automatic", t: "Align finds everything", d: "The shot, the batter holding the bat, the camera angle — then checks the recording and tracks the body." },
            { Icon: Trend, k: "Train", t: "Read and train", d: "The verdict, your measures and one drill. Re-record to see the change." },
          ].map(({ Icon, k, t, d }, i) => (
            <Reveal key={t} delay={i * 0.05}>
              <li className="card card-hover h-full p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon size={20} /></span>
                  <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{k}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-sm text-fg-muted">{d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
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

      {/* Capture tiers */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
          <Reveal>
            <p className="eyebrow">Choose your evidence level</p>
            <h2 className="display mt-3 text-3xl sm:text-5xl max-w-3xl">Start with one phone. Add precision when you need it.</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {[
              { t: "Quick Check", k: "One phone · 120–240 fps", d: "Shot recognition, timing and 2D measures. Depth-sensitive values are clearly marked as estimates.", tag: "Available now", tone: "border-ok/40 text-ok" },
              { t: "3D Session", k: "Two synced phones · calibrated", d: "Triangulated joints, trunk rotation and higher-confidence spatial measures.", tag: "Preview", tone: "border-warn/40 text-warn" },
              { t: "Lab / Academy", k: "Multi-camera · optional bat sensor", d: "Highest-confidence movement data and squad reports.", tag: "Planned", tone: "border-line-strong text-fg-subtle" },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 0.05}>
                <div className="card h-full p-6">
                  <span className={`chip ${x.tone}`}>{x.tag}</span>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight">{x.t}</h3>
                  <p className="num mt-1 text-sm text-fg-subtle">{x.k}</p>
                  <p className="mt-3 text-sm text-fg-muted">{x.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
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
          <h2 className="display text-4xl sm:text-6xl">Record one shot.</h2>
          <p className="mx-auto mt-4 max-w-xl text-band-muted">Confirm the shot, understand why it happened, and know exactly what to train next.</p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/analyse" className="btn btn-primary !px-5">Analyse front-foot defence</Link>
            <Link href="/guide" className="btn !px-5 border border-white/20 text-band-fg hover:bg-white/10">How it works</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
