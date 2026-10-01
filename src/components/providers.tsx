"use client";

import { MotionConfig } from "motion/react";

/** Motion respects the OS "reduce motion" setting everywhere. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </MotionConfig>
  );
}
