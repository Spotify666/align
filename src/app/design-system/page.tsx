import { ComingNext } from "@/components/common/coming-next";

export const metadata = { title: "Design system" };

export default function Page() {
  return <ComingNext eyebrow="Design system" title="Components and states." points={["Validity banner, confidence chip, metric card, range bar", "Evidence viewer, phase timeline, 3D replay", "Empty, loading, failed, invalid, uncertain and valid states"]} />;
}
