"use client";

import { MotionConfig } from "motion/react";
import { VisitTracker } from "./visit-tracker";

/** Motion respects the OS "reduce motion" setting everywhere; the visit log runs on every page. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
      <VisitTracker />
      {children}
    </MotionConfig>
  );
}
