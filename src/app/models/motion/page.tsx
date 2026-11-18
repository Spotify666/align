import type { Metadata } from "next";
import { MotionInspector } from "@/components/model/motion-inspector";

export const metadata: Metadata = {
  title: "Motion inspector",
  description: "A development view of the shared motion fit: any take, paused or slowed, from any camera, with the elbows, wrists, grip and feet shown.",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="chip text-xs">For development</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Motion inspector</h1>
      <p className="mt-2 text-sm text-fg-muted">One rig for every shot. Pause, slow and turn it.</p>
      <div className="mt-6">
        <MotionInspector />
      </div>
    </div>
  );
}
