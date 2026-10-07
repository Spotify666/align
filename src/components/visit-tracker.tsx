"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { startVisits, trackPage } from "@/lib/visit";

/** Logs the visit (see src/lib/visit.ts): starts once, then records each page. */
export function VisitTracker() {
  const path = usePathname();
  useEffect(() => startVisits(), []);
  useEffect(() => {
    if (path) trackPage(path);
  }, [path]);
  return null;
}
