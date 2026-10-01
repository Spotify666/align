"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { CaptureObservation } from "@/engine/types";

const Scene3D = dynamic(() => import("../report/scene-3d"), { ssr: false, loading: () => <div className="absolute inset-0 stage" /> });

/** The flagship reconstruction: a front-foot defence replayed as body, bat and ball. DEMO DATA. */
export function HeroVisual({ obs, from, to }: { obs: CaptureObservation; from: number; to: number }) {
  const [frame, setFrame] = useState(to - 8);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((f) => (f >= to ? from : f + 1)), 1000 / 30);
    return () => window.clearInterval(id);
  }, [from, to]);
  return (
    <div className="stage relative h-full w-full overflow-hidden">
      <Scene3D obs={obs} frame={frame} autoRotate className="absolute inset-0" label="Animated reconstruction of a front-foot defence (demo data)" />
    </div>
  );
}
