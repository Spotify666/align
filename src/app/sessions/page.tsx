import { ComingNext } from "@/components/common/coming-next";

export const metadata = { title: "Sessions" };

export default function Page() {
  return <ComingNext eyebrow="Sessions" title="Your delivery library." points={["Every analysis on this device and in your cloud account", "Search, tags, notes and coach comments", "Representative attempts for your baseline"]} />;
}
