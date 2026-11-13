import { LocalPrint } from "@/components/report/local-print";

export const metadata = { title: "Report to print" };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LocalPrint id={id} />;
}
