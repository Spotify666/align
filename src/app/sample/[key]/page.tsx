import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SAMPLE_ORDER, sampleWithBaseline } from "@/lib/demo";
import { ReportView } from "@/components/report/report-view";

export function generateStaticParams() {
  return SAMPLE_ORDER.map((key) => ({ key }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const s = sampleWithBaseline(key);
  return { title: s ? `Sample: ${s.spec.title}` : "Sample report" };
}

export default async function SamplePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = sampleWithBaseline(key);
  if (!s) notFound();
  const withBaseline = s.payload.analysis_status === "valid" && s.payload.handedness === "right";
  return (
    <ReportView
      payload={s.payload}
      obs={s.obs}
      baseline={withBaseline ? s.comparisons : undefined}
      reference={withBaseline ? s.reference : null}
      title={`Sample · ${s.spec.title}`}
    />
  );
}
