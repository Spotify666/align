import Link from "next/link";
import type { Metadata } from "next";
import { SAMPLE_ORDER, sampleAnalysis } from "@/lib/demo";
import { STATUS_META, statusKey, statusLabel } from "@/components/report/status";

export const metadata: Metadata = { title: "Sample reports" };

export default function SamplesIndex() {
  const items = SAMPLE_ORDER.map((k) => sampleAnalysis(k)!).filter(Boolean);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="eyebrow">DEMO DATA</p>
        <h1 className="display text-5xl">Sample reports</h1>
        <p className="text-fg-muted">Every answer Aline can give, on generated examples.</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ spec, payload }) => {
          const m = STATUS_META[statusKey(payload)];
          return (
            <li key={spec.key}>
              <Link href={`/sample/${spec.key}`} className={`card block h-full p-5 border hover:border-line-strong transition-colors`}>
                <span className={`chip ${m.ring} ${m.tone}`}>
                  <m.Icon size={14} /> {statusLabel(payload)}
                </span>
                <h2 className="mt-3 font-semibold text-lg">{spec.title}</h2>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
