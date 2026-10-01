"use client";

import { motion } from "motion/react";

// Each navigation fades and settles in: short, ease-out, never blocks input.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
