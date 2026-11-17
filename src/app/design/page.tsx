import { Hold } from "@/components/common/hold";
import type { Metadata } from "next";
import Link from "next/link";
import { ScreenMap } from "@/components/design/screen-map";
import { Download } from "@/components/icons";
import { DESIGN_PDF, FLOWS, SCREENS } from "@/lib/screen-map";

// The screen map: every flow through Aline, screen by screen, and the same thing as a document
// to download. The data is src/lib/screen-map.ts; the pictures and the PDF come from scripts/design/.

export const metadata: Metadata = {
  title: "Screens and flows",
  description: "Every flow through Aline as the screens you meet, in order, with what each one is for.",
};

export default function DesignPage() {
  return (
    <div>
      <header className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
        <h1 className="display max-w-3xl text-4xl sm:text-6xl">Every screen, in the order you meet it.</h1>
        <p className="mt-4 max-w-2xl text-lg text-fg-muted">
          {FLOWS.length} flows, {SCREENS.length} screens. Tap a screen for what it does.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={DESIGN_PDF} download="aline-design.pdf" className="btn btn-primary">
            <Download size={16} /> Download the design document (PDF)
          </a>
          <Link href="/design-system" className="btn btn-ghost">Colours, type and components</Link>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-fg-subtle">
          <Hold more={<p>The pictures are the app itself, on generated examples and test accounts. No real player&apos;s footage is shown.</p>}>About the pictures</Hold>
        </p>
        <nav aria-label="Flows" className="mt-8 flex flex-wrap gap-2">
          {FLOWS.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="chip min-h-11 px-4 text-sm text-fg-muted hover:text-fg">
              {f.name}
            </a>
          ))}
        </nav>
      </header>
      <ScreenMap />
    </div>
  );
}
