import type { Metadata } from "next";
import { CaptureFlowClient } from "@/components/capture/capture-flow-client";

export const metadata: Metadata = { title: "Check your shot" };

// The one way in to an analysis. (/analyse still works: older links and saved bookmarks use it.)
export default function CheckPage() {
  return <CaptureFlowClient />;
}
