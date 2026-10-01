import { LocalReport } from "@/components/report/local-report";

export const metadata = { title: "Report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LocalReport id={id} />;
}
