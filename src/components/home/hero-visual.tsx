"use client";

import dynamic from "next/dynamic";
import type { CaptureObservation } from "@/engine/types";

const Scene3D = dynamic(() => import("../report/scene-3d"), { ssr: false, loading: () => <div className="absolute inset-0 stage" /> });

/** The flagship reconstruction: a front-foot defence replayed in slow motion as body, bat and ball. DEMO DATA. */
export function HeroVisual({ obs, from, to, still }: { obs: CaptureObservation; from: number; to: number; still: number }) {
  return (
    <div className="stage relative h-full w-full overflow-hidden">
      <Scene3D
        obs={obs}
        frame={still}
        play={{ from, to, speed: 0.3 }}
        autoRotate
        interactive={false}
        framing="close"
        className="absolute inset-0"
        label="Slow-motion reconstruction of a front-foot defence (demo data)"
      />
    </div>
  );
}
