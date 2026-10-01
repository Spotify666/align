import { ComingNext } from "@/components/common/coming-next";

export const metadata = { title: "New analysis" };

export default function Page() {
  return <ComingNext eyebrow="New analysis" title="Capture one delivery." points={["Shot goal and capture tier", "Guided side-on setup with live framing checks", "Record or upload, with detected frame rate and resolution", "Quality gate before any processing", "On-device pose tracking and bat/ball marking", "Validity-first result and report"]} />;
}
