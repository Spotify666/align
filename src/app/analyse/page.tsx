import type { Metadata } from "next";
import { CaptureFlowClient } from "@/components/capture/capture-flow-client";

export const metadata: Metadata = { title: "Analyse a defence" };

export default function AnalysePage() {
  return <CaptureFlowClient />;
}
