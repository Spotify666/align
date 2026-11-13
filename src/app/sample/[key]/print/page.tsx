import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SAMPLE_ORDER, sampleWithBaseline } from "@/lib/demo";
import { PrintReport } from "@/components/report/print-report";

export function generateStaticParams() {
  return SAMPLE_ORDER.map((key) => ({ key }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const s = sampleWithBaseline(key);
  return { title: s ? `Sample to print: ${s.spec.title}` : "Sample report" };
}

export default async function SamplePrintPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = sampleWithBaseline(key);
  if (!s) notFound();
  return <PrintReport payload={s.payload} obs={s.obs} keyframes={{}} title={`Sample · ${s.spec.title}`} backHref={`/sample/${key}`} />;
}
