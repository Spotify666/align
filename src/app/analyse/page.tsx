import type { Metadata } from "next";
import { CaptureFlowClient } from "@/components/capture/capture-flow-client";

export const metadata: Metadata = { title: "Analyse front-foot defence" };

export default function AnalysePage() {
  return <CaptureFlowClient />;
}
