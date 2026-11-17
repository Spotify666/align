import { Hold } from "@/components/common/hold";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy and data" };

// Each kind of data in a few words; what it is and where it lives on a long press.
const SHORT: Record<string, string> = {
  "Your video": "never leaves your phone",
  "Movement tracks": "on your phone; your account only if you save",
  "Still frames": "on your phone; your account only if you save",
  "Report": "on your phone; your account only if you save",
  "Profile": "on your phone; basics in your account if signed in",
  "Shot models": "on your phone only",
  "Coach's notes": "you and that coach only",
  "Two phones, one ball": "passed through, never stored",
  "Reference library": "only while a permission is signed",
  "Visit log": "totals only in public; 180 days",
};

const rows: Array<[string, string, string]> = [
  ["Your video", "Stays on your phone. Analysed in the browser.", "Never uploaded. Aline has no way to send a video anywhere; a saved report carries numbers and a few small still frames, not the clip."],
  ["Movement tracks", "Joint, bat and ball positions over time (~20 KB per shot).", "On this device. In your account only if you save the report."],
  ["Still frames", "Up to 8 small images that prove the result.", "On this device; in your account only if you save the report."],
  ["Report", "The verdict, measures and written report.", "On this device; in your account only if you save it."],
  ["Profile", "Batting hand, height, age band, level, focus areas and any body measurements you give.", "On this device; batting hand, height, age band and level in your account if you sign in. Body measurements stay on this device."],
  ["Shot models", "Your own picture of a correct shot: where you placed each joint, your tolerances and your note.", "On this device only. It leaves only as text you export yourself."],
  ["Coach's notes", "Your coach's own view of a shot you shared, what to work on, and any drill they set.", "In Aline's database, readable by you and that coach only. Every change is written to a history you can both read. A coach can never change Aline's result."],
  ["Two phones, one ball", "A pairing code, the start signal, the phones' clocks, and the second phone's result (numbers and tracked body points).", "Passed between the two phones through the server and stored nowhere. Never video or pictures."],
  ["Reference library", "A reference player's numbers, with the permission they signed: what, where and until when.", "In Aline's database. Shown only while the permission is signed and has not ended; withdrawing it hides the reference for everyone at once."],
  [
    "Visit log",
    "Approximate place (from your IP address), the IP address, device, OS and browser, the pages and buttons you used, analyses tried (file type and size, and the result) and time spent. Never video, photos, file names or anything you type.",
    "Aline's database, kept 180 days. The public Visitors page shows totals only: no IP addresses, towns or single visits. Not kept for bots, or for browsers that ask not to be tracked (Global Privacy Control or Do Not Track); the Visitors page can also stop counting your device.",
  ],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-10">
      <header className="space-y-3">
        <p className="eyebrow">Privacy and data</p>
        <h1 className="display text-5xl">Your video, your decision.</h1>
        <p className="text-fg-muted">Every use is your choice, and can be changed.</p>
      </header>

      <section className="space-y-3">
        <h2 className="display text-3xl">What is kept, and where</h2>
        <ul className="divide-y divide-line border-y border-line">
          {rows.map(([a, b, c]) => (
            <li key={a}>
              <Hold more={<><p>{b}</p><p>{c}</p></>}>
                <span>
                  <span className="font-medium">{a}:</span> <span className="text-fg-muted">{SHORT[a]}</span>
                </span>
              </Hold>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-x-6 sm:grid-cols-2">
        {[
          ["Consent first", "You agree to on-device processing before any upload. Cloud saving, coach sharing and model-training use are separate switches, all off until you turn them on."],
          ["Training use", "Off by default. If you opt in, only de-identified tracks are used, never video, and you can withdraw at any time."],
          ["Coach sharing", "Coaches see nothing until you enter their invite code. You can revoke the link; every share and consent change is recorded in your activity log."],
          ["Under 18", "You tick that a parent or guardian agreed before each analysis. Linking a coach is refused until their agreement is recorded on your account, and withdrawing it hides your reports from coaches at once."],
          ["Security", "Encrypted in transit (TLS) and at rest. Database rules make every row visible only to its owner and consented coaches."],
          ["Not medical", "Aline describes technique. It does not diagnose, predict injury or replace a physiotherapist."],
        ].map(([t, d]) => (
          <div key={t} className="border-b border-line">
            <Hold more={<p>{d}</p>}><span className="font-semibold">{t}</span></Hold>
          </div>
        ))}
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold">Your controls</h2>
        <p className="text-sm text-fg-muted">Export, delete, and every consent.</p>
        <Link href="/profile" className="btn btn-primary w-fit">Open data controls</Link>
      </section>
    </div>
  );
}
