import type { Metadata } from "next";
import { Suspense } from "react";
import { AnglesReport } from "@/components/report/angles-report";

export const metadata: Metadata = { title: "Both angles" };

// The same ball from the side and from the front, combined (an optional extra after a report).
export default function AnglesPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-16 text-fg-muted">Loading…</p>}>
      <AnglesReport />
    </Suspense>
  );
}
