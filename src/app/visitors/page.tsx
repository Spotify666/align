import type { Metadata } from "next";
import { Visitors } from "@/components/visitors";

export const metadata: Metadata = { title: "Visitors", robots: { index: false, follow: false } };

export default function VisitorsPage() {
  return <Visitors />;
}
