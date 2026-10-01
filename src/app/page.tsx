import Link from "next/link";
import { sampleAnalysis } from "@/lib/demo";
import { HeroVisual } from "@/components/home/hero-visual";
import { SHOT_DISPLAY } from "@/engine/classify";
import { Check, Swap, Question, CameraOff, Chevron } from "@/components/icons";

export default function Home() {
  const valid = sampleAnalysis("valid_ffd")!;
  const pull = sampleAnalysis("pull")!;
  const contact = valid.payload.events.find((e) => e.type === "contact")?.frame ?? 100;
  const plant = valid.payload.events.find((e) => e.type === "trigger")?.frame ?? 20;
  const pullShot = pull.payload.observed_shot!;
  const pullEvidence = pull.payload.features.filter((f) => pullShot.evidence_ids.includes(f.id)).map((f) => f.reading);
  const bounce = valid.payload.delivery.bounceDistanceM;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 grid-bg opacity-[0.18]" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow">Cricket movement intelligence</p>
            <h1 className="display mt-4 text-[3.1rem] sm:text-7xl lg:text-[5.4rem]">
              See the delivery your body <span className="text-gold">actually</span> played.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Align reconstructs your movement, bat path and ball context — then turns the evidence into one clear training priority.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/analyse" className="btn btn-primary text-base">Analyse a delivery</Link>
              <Link href="/sample/valid_ffd" className="btn btn-ghost text-base">See a sample report</Link>
            </div>
            <p className="mt-6 max-w-lg text-sm text-subtle border-l-2 border-gold/60 pl-3">
              Video-first. Evidence-linked. Built to say “not enough information” when a result is uncertain.
            </p>
          </div>
          <HeroVisual obs={valid.obs} from={plant} to={Math.min(valid.obs.body.length - 1, contact + 30)} />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <p className="eyebrow">How it works</p>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Capture with guided setup", "Side-on, hip height, slow-motion. Live checks catch framing, light and shake before you waste a ball."],
            ["Reconstruct body, bat and ball", "Pose runs on your phone. You confirm bat and ball on a few frames; every mark is labelled as yours."],
            ["Confirm the shot before grading it", "Different shot? Uncertain? The score is withheld — and you see exactly why."],
            ["Train one priority, then re-measure", "One cue, up to two drills with a pass condition, and a retest against your own baseline."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-panel p-6">
              <span className="num text-sm text-gold">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Wrong-shot trust demo */}
      <section className="paper">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="eyebrow !text-[#8a6a12]">The test that matters most</p>
            <h2 className="display mt-3 text-5xl text-ink">A pull shot never gets a defence score.</h2>
            <p className="mt-4 text-ink-muted max-w-lg">
              Most apps grade whatever you upload. Align first asks what was played. Submit a pull as a forward defence and it is rejected with the evidence —
              short ball, chest-height contact, horizontal bat — instead of a misleading number.
            </p>
            <p className="mt-4 text-sm text-ink-muted">Release gate: 31 pull variants (seeds, frame rates, handedness, missing bat or ball, noise) — none may be scored.</p>
          </div>
          <Link href="/sample/pull" className="block rounded-[16px] border border-[#d9d2c1] bg-white p-6 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.5)]">
            <span className="chip border-coral/60 text-[#b4392f]"><Swap size={14} /> Different shot detected</span>
            <p className="display mt-4 text-4xl text-ink">Not a front-foot defence</p>
            <p className="mt-3 text-ink">
              Most likely: <strong>{SHOT_DISPLAY[pullShot.label]}</strong> <span className="num text-ink-muted">— {Math.round(pullShot.probability * 100)}% prototype confidence</span>
            </p>
            <p className="mt-2 inline-block rounded-md bg-[#efe9dc] px-2 py-1 text-sm font-semibold text-ink">Technique score withheld</p>
            <p className="mt-3 text-sm text-ink-muted">Evidence: {pullEvidence.join("; ")}.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#8a6a12]">Open the full sample <Chevron size={16} /></span>
          </Link>
        </div>
      </section>

      {/* Proof: three decisive outputs */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">From video to action</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl max-w-2xl">Three outputs, each linked to the frame that proves it.</h2>
          </div>
          <span className="demo-badge">DEMO DATA</span>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="card p-6">
            <Check className="text-lime" />
            <p className="mt-4 text-sm text-subtle">Shot identified</p>
            <p className="display text-3xl mt-1">Front-foot defence</p>
            <p className="num mt-2 text-sm text-muted">{Math.round((valid.payload.observed_shot?.probability ?? 0) * 100)}% prototype confidence · body, bat and ball tracked</p>
          </div>
          <div className="card p-6">
            <span className="text-cyan text-xl" aria-hidden>✕</span>
            <p className="mt-4 text-sm text-subtle">Bounce located</p>
            <p className="display text-3xl mt-1 num">{bounce !== null ? `${bounce.toFixed(1)} m` : "—"}</p>
            <p className="mt-2 text-sm text-muted">from your stumps · {valid.payload.delivery.lengthLabel} length · uncertainty shown, never hidden</p>
          </div>
          <div className="card p-6">
            <span className="text-gold text-xl" aria-hidden>◎</span>
            <p className="mt-4 text-sm text-subtle">One priority</p>
            <p className="display text-3xl mt-1">{valid.payload.priorities[0]?.title ?? "—"}</p>
            <p className="mt-2 text-sm text-muted">“{valid.payload.plan?.cue}” · {valid.payload.plan?.drills[0]?.name}</p>
          </div>
        </div>
      </section>

      {/* Four outcomes */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <p className="eyebrow">Four honest outcomes</p>
          <h2 className="display mt-3 text-4xl sm:text-5xl max-w-3xl">“Cannot determine” is a result, not a failure.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/sample/valid_ffd", Icon: Check, tone: "text-lime border-lime/40", t: "Valid front-foot defence", d: "Six domains, measures with uncertainty, one priority, two drills." },
              { href: "/sample/pull", Icon: Swap, tone: "text-coral border-coral/40", t: "Different shot detected", d: "Named with evidence. No score. No misleading number." },
              { href: "/sample/occluded", Icon: Question, tone: "text-amber border-amber/40", t: "Shot uncertain", d: "No forced label. Exactly what to change next time." },
              { href: "/sample/capture_failed", Icon: CameraOff, tone: "text-steel border-steel/40", t: "Capture failed", d: "Caught before processing, with concrete corrections." },
            ].map(({ href, Icon, tone, t, d }) => (
              <li key={href}>
                <Link href={href} className="card block h-full p-5 hover:border-line-strong">
                  <span className={`chip ${tone}`}><Icon size={14} /> {t}</span>
                  <p className="mt-3 text-sm text-muted">{d}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Capture tiers */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <p className="eyebrow">Choose your evidence level</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {[
            { t: "Quick Check", k: "One phone · 120–240 fps", d: "Shot family, timing windows and 2D movement. Depth-sensitive values are labelled estimates.", tag: "Available" },
            { t: "3D Session", k: "Two synced phones · calibrated", d: "Triangulated joints, trunk rotation and higher-confidence spatial measures.", tag: "Preview · not validated" },
            { t: "Lab / Academy", k: "Multi-camera · optional bat sensor", d: "Highest-confidence kinematics and longitudinal academy reports.", tag: "Planned" },
          ].map((x) => (
            <div key={x.t} className="card p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="display text-3xl">{x.t}</h3>
                <span className="chip border-line-strong text-muted">{x.tag}</span>
              </div>
              <p className="num mt-2 text-sm text-gold">{x.k}</p>
              <p className="mt-3 text-sm text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Players vs coaches + loop */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-16 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <p className="eyebrow">For players</p>
          <h3 className="display text-3xl mt-2">One correction for your next net.</h3>
          <p className="mt-3 text-muted">Record on your phone, check the verdict, train the drill, and re-record. Your video stays on your phone unless you choose to save it.</p>
        </div>
        <div className="card p-6">
          <p className="eyebrow">For coaches</p>
          <h3 className="display text-3xl mt-2">Consistent evidence across a squad.</h3>
          <p className="mt-3 text-muted">Players share with an invite code. Review queue, annotations that never overwrite the model result, and side-by-side comparison.</p>
        </div>
        <div className="card p-6 lg:col-span-2">
          <p className="eyebrow">The improvement loop</p>
          <ol className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {["Capture", "Verify", "Understand", "Train", "Re-check", "See progress"].map((s, i, a) => (
              <li key={s} className="flex items-center gap-2">
                <span className="chip border-line-strong text-text">{s}</span>
                {i < a.length - 1 && <Chevron size={14} className="text-subtle" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Evidence and validation */}
      <section className="paper">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="eyebrow !text-[#8a6a12]">Evidence and validation</p>
            <h2 className="display mt-3 text-4xl text-ink">We separate what is tested from what is claimed.</h2>
          </div>
          <dl className="lg:col-span-2 grid gap-6 sm:grid-cols-3 text-ink">
            <div>
              <dt className="font-semibold">Research basis</dt>
              <dd className="mt-1 text-sm text-ink-muted">Defence and drive overlap in body shape but differ in bat and ball speed (Stretch et al., 1998). That is why bat and ball are required to accept a defence.</dd>
            </div>
            <div>
              <dt className="font-semibold">Internal tests</dt>
              <dd className="mt-1 text-sm text-ink-muted">11 synthetic fixtures and 31 pull variants run on every change. These are engineering tests, not accuracy claims.</dd>
            </div>
            <div>
              <dt className="font-semibold">Real-athlete validation</dt>
              <dd className="mt-1 text-sm text-ink-muted">Not yet done. No accuracy figure is published until a named, versioned evaluation exists.</dd>
            </div>
          </dl>
          <Link href="/science" className="btn btn-ghost !border-ink/30 !text-ink lg:col-start-2 w-fit">Read the methodology</Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16 text-center">
        <h2 className="display text-5xl">Capture one delivery.</h2>
        <p className="mt-3 text-muted">Reconstruct body, bat and ball. Understand what happened, why it matters, and what to train next.</p>
        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <Link href="/analyse" className="btn btn-primary">Analyse a delivery</Link>
          <Link href="/sample" className="btn btn-ghost">All sample reports</Link>
        </div>
      </section>
    </div>
  );
}
