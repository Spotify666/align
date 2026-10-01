import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy and data" };

const rows: Array<[string, string, string]> = [
  ["Your video", "Stays on your phone. Analysed in the browser.", "Never uploaded unless you choose to save a clip. Uploaded clips are deleted automatically (14 days by default, adjustable to immediately)."],
  ["Movement tracks", "Joint, bat and ball positions over time (~20 KB per shot).", "On this device. In your account only if you save the report."],
  ["Still frames", "Up to 8 small images that prove the result.", "On this device; in your account only if you save the report."],
  ["Report", "The verdict, measures and written report.", "On this device; in your account only if you save it."],
  ["Profile", "Batting hand, height, age band, level.", "On this device; in your account if you sign in."],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-10">
      <header className="space-y-3">
        <p className="eyebrow">Privacy and data</p>
        <h1 className="display text-5xl">Your video, your decision.</h1>
        <p className="text-muted">Plain-language summary. Movement data from video is biometric data, so every use is a separate choice you can change.</p>
      </header>

      <section className="space-y-3">
        <h2 className="display text-3xl">What is kept, and where</h2>
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-subtle border-b border-line"><th className="p-3 font-normal">Data</th><th className="p-3 font-normal">What it is</th><th className="p-3 font-normal">Where it lives</th></tr></thead>
            <tbody>{rows.map(([a, b, c]) => <tr key={a} className="border-b border-line last:border-0 align-top"><td className="p-3 font-medium">{a}</td><td className="p-3 text-muted">{b}</td><td className="p-3 text-muted">{c}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {[
          ["Consent first", "You agree to on-device processing before any upload. Cloud saving, coach sharing and model-training use are separate switches, all off until you turn them on."],
          ["Training use", "Off by default. If you opt in, only de-identified tracks are used — never video — and you can withdraw at any time."],
          ["Coach sharing", "Coaches see nothing until you enter their invite code. You can revoke the link; every share and consent change is recorded in your activity log."],
          ["Under 18", "A parent or guardian must agree before analysis and before saving to an account."],
          ["Security", "Encrypted in transit (TLS) and at rest. Database rules make every row visible only to its owner and consented coaches."],
          ["Not medical", "Align describes technique. It does not diagnose, predict injury or replace a physiotherapist."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5"><p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></div>
        ))}
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold">Your controls</h2>
        <p className="text-sm text-muted">Export everything as a file, delete everything on this device, delete your account and all saved data, change video retention, and switch each consent on or off.</p>
        <Link href="/profile" className="btn btn-primary w-fit">Open data controls</Link>
      </section>
    </div>
  );
}
