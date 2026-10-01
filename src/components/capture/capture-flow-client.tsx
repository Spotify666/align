"use client";

import dynamic from "next/dynamic";

// Client-only: the flow reads the on-device profile and uses camera/video APIs.
export const CaptureFlowClient = dynamic(() => import("./capture-flow").then((m) => m.CaptureFlow), {
  ssr: false,
  loading: () => <p className="mx-auto max-w-3xl px-4 py-12 text-muted">Loading…</p>,
});
