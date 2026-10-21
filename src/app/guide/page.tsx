import Link from "next/link";
import type { Metadata } from "next";
import { CameraPlacementDiagram } from "@/components/capture/setup-guide";
import { MarkHint } from "@/components/guide/mark-illustrations";
import { Reveal } from "@/components/common/reveal";
import { Check, Cross } from "@/components/icons";
import { BackFootGuide } from "@/components/guide/back-foot-guide";

export const metadata: Metadata = { title: "How to analyse your defence" };

const Stage = ({ id, when, title, time, children }: { id: string; when: string; title: string; time: string; children: React.ReactNode }) => (
  <Reveal>
    <section id={id} className="grid scroll-mt-24 gap-6 border-t border-line py-10 lg:grid-cols-[14rem_1fr]" aria-labelledby={`${id}-h`}>
      <div>
        <span className="text-sm font-medium text-brand">{when}</span>
        <h2 id={`${id}-h`} className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
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
        <h1 className="display mt-3 text-4xl sm:text-6xl">How to analyse your defence</h1>
        <p className="mt-4 text-lg text-fg-muted">The front-foot defence, and now the <a href="#back-foot" className="underline">back-foot defence</a>. You film and upload. Aline finds the shot, the batter and the camera angle, checks the recording and tracks the body on your phone — no setup screens.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/analyse" className="btn btn-primary">Start now</Link>
          <Link href="/sample/valid_ffd" className="btn btn-ghost">See what you&apos;ll get</Link>
        </div>
        <ol className="mt-8 flex flex-wrap gap-2 text-sm">
          {[["prepare", "Prepare"], ["film", "Film"], ["upload", "Upload"], ["read", "Read and train"], ["ball-bat", "Optional: ball and bat"], ["back-foot", "Back-foot defence"]].map(([id, s], i, all) => (
            <li key={id} className="flex items-center gap-2">
              <a href={`#${id}`} className="chip min-h-9 text-fg-muted hover:text-fg">{s}</a>
              {i < all.length - 1 && <span aria-hidden className="text-fg-subtle">→</span>}
            </li>
          ))}
        </ol>
      </header>

      <div className="mt-12">
        <Stage id="prepare" when="Before the nets" title="Prepare" time="Once">
          <Do items={["A phone that records slow motion (most phones from the last few years)", "Something to hold it still: a tripod, a bag or a cone", "A bowler or throw-downs — one shot per clip works best", "Your batting hand and height saved in Profile (height scales distances)"]} />
        </Stage>

        <Stage id="film" when="At the nets" title="Film" time="1 minute to set up">
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
          <p className="rounded-xl bg-tint p-3 text-sm text-fg-muted">
            Only able to film from behind the bowler? That works too — Aline recognises the camera position. Some distances become estimates and bounce, bat speed and ball speed aren&apos;t measured.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Do items={["Square-on to the batter, at hip height", "6–8 m away, so head, feet, bat and stumps stay in frame", "The bounce area visible in the frame", "Phone fixed still — no hand-holding"]} />
            <Do dont items={["Filming from behind the keeper (the body hides bat and ball)", "Zooming in so the feet or head leave the frame", "People walking between the camera and batter", "Bright sun or nets lights behind the batter"]} />
          </div>
          <Do items={["Start recording before the ball is released", "Play the defence as you normally would (pick front-foot or back-foot on the Analyse screen)", "Stop after your follow-through — or keep filming a whole net session", "Record a few: your personal baseline needs 6 valid defences"]} />
        </Stage>


        <Stage id="upload" when="In Aline" title="Upload — the rest is automatic" time="About a minute">
          <p className="text-fg-muted">Choose the clip — any length — or a few photos. While you watch, Aline:</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["Finds the shot", "Scans the whole clip and skips camera cuts, replays and close-ups."],
              ["Finds the batter", "The person holding the bat with both hands — not the bowler, keeper or umpire."],
              ["Works out the camera position", "Side-on, from the bowler's end or from behind."],
              ["Checks the recording", "Frame rate, light, blur, shake and the whole batter in view. If the shot isn't usable it tries the next one, and tells you exactly what to change."],
              ["Tracks the body", "Frame by frame, following the batter through pans and zooms. The video never leaves your phone."],
            ].map(([t, d]) => (
              <li key={t} className="card p-3"><p className="font-medium">{t}</p><p className="mt-0.5 text-fg-muted">{d}</p></li>
            ))}
          </ul>
          <p className="text-sm text-fg-subtle">Each choice shows with a “Change” link — use it only if Aline got one wrong.</p>
        </Stage>

        <Stage id="read" when="After" title="Read and train" time="2 minutes, then practise">
          <ol className="space-y-3 text-sm">
            <li><strong>Verdict first.</strong> <span className="text-fg-muted">Valid defence, different shot, uncertain, or capture failed. A score is only given to a confirmed defence.</span></li>
            <li><strong>Evidence.</strong> <span className="text-fg-muted">Scrub the replay, switch to 3D, and tap any measure to jump to the frame that proves it.</span></li>
            <li><strong>One priority, up to two drills.</strong> <span className="text-fg-muted">Each drill has a dosage and a pass condition you can see on video.</span></li>
            <li><strong>Keep it.</strong> <span className="text-fg-muted">Download the PDF, save it to your account, or share with a coach.</span></li>
            <li><strong>Re-record.</strong> <span className="text-fg-muted">Your next report compares against this one and your baseline.</span></li>
          </ol>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/analyse" className="btn btn-primary">Analyse front-foot defence</Link>
            <Link href="/analyse?shot=back" className="btn btn-ghost">Analyse back-foot defence</Link>
            <Link href="/sample" className="btn btn-ghost">All sample reports</Link>
          </div>
        </Stage>

        <Stage id="ball-bat" when="If you want more" title="Optional: add ball and bat" time="About 30 seconds">
          <p className="text-fg-muted">The ball and bat are small and fast, so a phone can&apos;t always see them. Without them the report shows what your body did but can&apos;t confirm the shot. To get the full verdict, tap “Add ball and bat” on the report and mark them on a few frames. Every mark is labelled “marked by you”; skip anything you can&apos;t see.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
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
        </Stage>

      </div>

      <BackFootGuide />

      <section className="mt-6 border-t border-line pt-10">
        <h2 className="text-2xl font-semibold tracking-tight">Common questions</h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {[
            ["Why was my shot called “different shot”?", "The evidence — ball length, contact height, bat angle, footwork — pointed to another shot, such as a pull or a drive. You'll see exactly which signals decided it."],
            ["Why “uncertain”?", "Something needed to confirm a defence was missing: usually the ball or bat, which a phone can't always see. Tap “Add ball and bat” on the report to mark them, or follow the recording tips it lists."],
            ["Is my video uploaded?", "No. It's analysed on your phone. Only if you choose to save to your account do we store the small movement tracks, a few still frames and the report."],
            ["I bat left-handed.", "Set it in Profile. Aline works out “front” and “forward” from your batting hand and the bowler's side, not from the screen."],
            ["Which shots are supported?", "The front-foot defence and the back-foot defence: pick one on the Analyse screen. Other shots are recognised so they can be rejected, and will unlock once they pass the same validation."],
            ["Can I film from behind the bowler?", "Yes. Aline recognises the camera position (you can change it if it's wrong). Forward distances then come from a 3D pose estimate, and bounce distance, bat speed and ball speed aren't measured — side-on gives the most complete report."],
            ["My clip is long, or has several shots or people in it.", "That's fine. Aline scans the whole clip, finds each shot, skips camera cuts and close-ups, and follows the person holding the bat. If it picks the wrong shot or person, tap “Change”."],
            ["Can I upload photos instead?", "Yes — one or up to 12. A side-on photo at the moment of contact is checked against the front-foot defence position formula: stride, front knee, back leg, head over the knee, trunk lean, weight forward and hands ahead of the knee. A back-foot defence photo is checked on its own position: front foot alongside, head forward, standing tall, front elbow and hands. A photo can't show timing, the bat's path or the ball, so it never confirms the shot or gets a score."],
            ["My video won't open.", "Most phones record MP4 or MOV, which work. Some iPhones and new Android phones record HEVC: open Aline in Safari or recent Chrome, set iPhone Camera → Formats → Most Compatible, or send the clip to yourself on WhatsApp to convert it."],
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
