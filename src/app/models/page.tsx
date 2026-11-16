import type { Metadata } from "next";
import { ModelsPage } from "@/components/model/models-page";

export const metadata: Metadata = { title: "Shot models", description: "Place each joint on a figure to say what a correct shot looks like, save it, export it as text, and check your shots against it." };

export default function Page() {
  return <ModelsPage />;
}
