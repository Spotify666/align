"use client";

import { PageLoading } from "@/components/common/page-loading";
import dynamic from "next/dynamic";

// Client-only: the flow reads the on-device profile and uses camera/video APIs.
export const CaptureFlowClient = dynamic(() => import("./capture-flow").then((m) => m.CaptureFlow), {
  ssr: false,
  loading: () => <PageLoading what="Getting the analyser ready. Nothing leaves this device." width="max-w-3xl" />,
});
