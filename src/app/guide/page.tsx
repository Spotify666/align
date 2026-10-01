import Link from "next/link";
import type { Metadata } from "next";
import { CameraPlacementDiagram } from "@/components/capture/setup-guide";
import { MarkHint } from "@/components/guide/mark-illustrations";
import { Reveal } from "@/components/common/reveal";
import { Check, Cross } from "@/components/icons";

export const metadata: Metadata = { title: "How to analyse your front-foot defence" };

const Step = ({ n, title, time, children }: { n: number; title: string; time: string; children: React.ReactNode }) => (
  <Reveal>
    <section className="grid gap-6 border-t border-line py-10 lg:grid-cols-[14rem_1fr]" aria-labelledby={`s${n}`}>
      <div>
        <span className="num text-sm text-brand">Step {n}</span>
        <h2 id={`s${n}`} className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{time}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  </Reveal>
);

const Do = ({ items, dont = false }: { items: string[]; dont?: boolean }) => (
  <ul className="space-y-2">
    {items.map((t) => (
      <li key={t} className="flex gap-2.5 text-sm">
        {dont ? <Cross size={16} className="mt-0.5 shrink-0 text-bad" /> : <Check size={16} className="mt-0.5 shrink-0 text-ok" />}
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-16">
      <header className="max-w-3xl">
        <p className="eyebrow">Guide</p>
        <h1 className="display mt-3 text-4xl sm:text-6xl">How to analyse your front-foot defence</h1>
        <p className="mt-4 text-lg text-fg-muted">Seven short steps, about three minutes once you have the clip. Everything runs on your phone.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/analyse" className="btn btn-primary">Start now</Link>
          <Link href="/sample/valid_ffd" className="btn btn-ghost">See what you&apos;ll get</Link>
        </div>
        <ol className="mt-8 flex flex-wrap gap-2 text-sm">
          {["Get set up", "Set the camera", "Record", "Upload and check", "Track", "Mark bat and ball", "Read and train"].map((s, i) => (
            <li key={s}><a href={`#s${i + 1}`} className="chip min-h-9 text-fg-muted hover:text-fg"><span className="num text-brand">{i + 1}</span>{s}</a></li>
          ))}
        </ol>
      </header>

      <div className="mt-12">
        <Step n={1} title="Get set up" time="Before you go to the nets">
          <Do items={["A phone that records slow motion (most phones from the last few years)", "Something to hold it still: a tripod, a bag or a cone", "A bowler or throw-downs — one shot per clip works best", "Your batting hand and height saved in Profile (height scales distances)"]} />
        </Step>

        <Step n={2} title="Set the camera" time="1 minute">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <p className="font-semibold">iPhone</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-fg-muted">
                <li>Settings → Camera → Record Slo-mo → <strong className="text-fg">1080p at 240 fps</strong> (or 120 fps).</li>
                <li>Open Camera and swipe to <strong className="text-fg">SLO-MO</strong>.</li>
                <li>Hold the phone sideways (landscape).</li>
              </ol>
            </div>
            <div className="card p-5">
              <p className="font-semibold">Android</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-fg-muted">
                <li>Open Camera → <strong className="text-fg">More</strong> → <strong className="text-fg">Slow motion</strong> (Samsung, Pixel and most others).</li>
                <li>Pick 120 or 240 fps if offered.</li>
                <li>Hold the phone sideways (landscape).</li>
              </ol>
            </div>
          </div>
          <CameraPlacementDiagram />
          <div className="grid gap-4 md:grid-cols-2">
            <Do items={["Square-on to the batter, at hip height", "6–8 m away, so head, feet, bat and stumps stay in frame", "The bounce area visible in the frame", "Phone fixed still — no hand-holding"]} />
            <Do dont items={["Filming from behind the bowler or the keeper", "Zooming in on the batter only", "People walking between the camera and batter", "Bright sun or nets lights behind the batter"]} />
          </div>
        </Step>

        <Step n={3} title="Record" time="Each shot">
          <Do items={["Start recording before the ball is released", "Play a front-foot defence as you normally would", "Stop after your follow-through — 3 to 10 seconds is ideal", "Record a few: your personal baseline needs 6 valid defences"]} />
        </Step>

        <Step n={4} title="Upload and check" time="About 15 seconds">
          <p className="text-fg-muted">Choose the clip in Align. Before any processing we read the real frame rate from the file and check resolution, light, blur, camera shake, whether one batter is fully in view, and the camera angle. If something would make the result unreliable, you are told exactly what to change — and nothing is processed.</p>
          <p className="text-sm text-fg-subtle">Exported a slowed-down video? Tell us on the check screen so timing stays correct.</p>
        </Step>

        <Step n={5} title="Track" time="20–60 seconds">
          <p className="text-fg-muted">Align tracks your body frame by frame on your phone. Keep the screen open; progress shows real frames processed. The video is not uploaded.</p>
        </Step>

        <Step n={6} title="Mark bat and ball" time="About a minute">
          <p className="text-fg-muted">The ball and bat are small and fast, so you confirm them on a few frames. Every mark is labelled “marked by you” in the report. If you can&apos;t see something, skip it — the report will say what it could not measure rather than guess.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["side", "Which side is the bowler?", "Sets “forward” so left-handers and either camera side work."],
              ["stumps", "Stumps: base, then top", "Gives the pitch scale for distances."],
              ["bounce", "Ball at bounce", "Scrub to where it hits the pitch, then tap the ball."],
              ["contact", "Ball at contact", "Scrub to where bat meets ball, then tap the ball."],
              ["after", "Ball just after", "Shows how softly the ball came off the bat."],
              ["bat", "Bat on 4 frames", "Tap your top hand on the handle, then the toe."],
            ] as const).map(([k, t, d]) => {
              const Hint = MarkHint[k];
              return (
                <figure key={k} className="card overflow-hidden">
                  <Hint />
                  <figcaption className="p-4">
                    <p className="font-medium">{t}</p>
                    <p className="mt-1 text-sm text-fg-muted">{d}</p>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </Step>

        <Step n={7} title="Read and train" time="2 minutes, then practise">
          <ol className="space-y-3 text-sm">
            <li><strong>Verdict first.</strong> <span className="text-fg-muted">Valid defence, different shot, uncertain, or capture failed. A score is only given to a confirmed defence.</span></li>
            <li><strong>Evidence.</strong> <span className="text-fg-muted">Scrub the replay, switch to 3D, and tap any measure to jump to the frame that proves it.</span></li>
            <li><strong>One priority, up to two drills.</strong> <span className="text-fg-muted">Each drill has a dosage and a pass condition you can see on video.</span></li>
            <li><strong>Keep it.</strong> <span className="text-fg-muted">Download the PDF, save it to your account, or share with a coach.</span></li>
            <li><strong>Re-record.</strong> <span className="text-fg-muted">Your next report compares against this one and your baseline.</span></li>
          </ol>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/analyse" className="btn btn-primary">Analyse front-foot defence</Link>
            <Link href="/sample" className="btn btn-ghost">All sample reports</Link>
          </div>
        </Step>
      </div>

      <section className="mt-6 border-t border-line pt-10">
        <h2 className="text-2xl font-semibold tracking-tight">Common questions</h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {[
            ["Why was my shot called “different shot”?", "The evidence — ball length, contact height, bat angle, footwork — pointed to another shot, such as a pull or a drive. You'll see exactly which signals decided it."],
            ["Why “uncertain”?", "Something needed to confirm a defence was missing: often the ball or bat wasn't visible, or someone blocked the view. The report lists what to change."],
            ["Is my video uploaded?", "No. It's analysed on your phone. Only if you choose to save to your account do we store the small movement tracks, a few still frames and the report."],
            ["I bat left-handed.", "Set it in Profile. Align works out “front” and “forward” from your batting hand and the bowler's side, not from the screen."],
            ["Which shots are supported?", "The front-foot defence first. Other shots are recognised so they can be rejected, and will unlock once they pass the same validation."],
          ].map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="flex min-h-9 items-center justify-between gap-3 font-medium">{q}<span className="text-fg-subtle transition-transform group-open:rotate-45">+</span></summary>
              <p className="mt-2 text-sm text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
