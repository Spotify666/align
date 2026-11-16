import type { Metadata } from "next";
import { Suspense } from "react";
import { EditClient } from "@/components/model/edit-client";

export const metadata: Metadata = { title: "Shot model" };

export default function Page() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-4xl px-4 py-10 text-fg-subtle sm:px-6">Opening the model…</p>}>
      <EditClient />
    </Suspense>
  );
}
