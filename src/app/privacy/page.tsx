import { ComingNext } from "@/components/common/coming-next";

export const metadata = { title: "Privacy and data" };

export default function Page() {
  return <ComingNext eyebrow="Privacy and data" title="Your video, your decision." points={["Video stays on your phone unless you save it", "Raw video auto-deletes after 14 days by default", "Self-service export and deletion; no training use without opt-in"]} />;
}
