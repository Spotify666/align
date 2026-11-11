import type { Metadata } from "next";
import { CaptureFlowClient } from "@/components/capture/capture-flow-client";

export const metadata: Metadata = { title: "Check your shot" };

export default function AnalysePage() {
  return <CaptureFlowClient />;
}
