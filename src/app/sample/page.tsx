import Link from "next/link";
import type { Metadata } from "next";
import { SAMPLE_ORDER, sampleAnalysis } from "@/lib/demo";
import { STATUS_META, statusKey } from "@/components/report/status";

export const metadata: Metadata = { title: "Sample reports" };

export default function SamplesIndex() {
  const items = SAMPLE_ORDER.map((k) => sampleAnalysis(k)!).filter(Boolean);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="eyebrow">Sample reports · DEMO DATA</p>
        <h1 className="display text-5xl">Every outcome, designed as carefully as the good one.</h1>
        <p className="text-muted">
          These reports are produced by the real engine running on synthetic fixture tracks. They are labelled DEMO DATA everywhere and exist to show
          how Align behaves — including when it refuses to score.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ spec, payload }) => {
          const m = STATUS_META[statusKey(payload)];
          return (
            <li key={spec.key}>
              <Link href={`/sample/${spec.key}`} className={`card block h-full p-5 border hover:border-line-strong transition-colors`}>
                <span className={`chip ${m.ring} ${m.tone}`}>
                  <m.Icon size={14} /> {m.label}
                </span>
                <h2 className="mt-3 font-semibold text-lg">{spec.title}</h2>
                <p className="mt-1 text-sm text-muted">{payload.headline}</p>
                <p className="mt-3 text-xs text-subtle num">expects: {spec.expectation}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
