import { ComingNext } from "@/components/common/coming-next";

export const metadata = { title: "Athlete profile" };

export default function Page() {
  return <ComingNext eyebrow="Athlete profile" title="Your profile and data controls." points={["Handedness, height, age band and skill level", "Reference baseline management", "Consent, sharing, retention, export and deletion"]} />;
}
