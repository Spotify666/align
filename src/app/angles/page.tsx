import { PageLoading } from "@/components/common/page-loading";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AnglesReport } from "@/components/report/angles-report";

export const metadata: Metadata = { title: "Both angles" };

// The same ball from the side and from the front, combined (an optional extra after a report).
export default function AnglesPage() {
  return (
    <Suspense fallback={<PageLoading what="Opening both angles of the ball…" />}>
      <AnglesReport />
    </Suspense>
  );
}
