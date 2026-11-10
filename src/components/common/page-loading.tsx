"use client";

import { useEffect, useState } from "react";

/**
 * What is loading, said out loud, instead of a blank "Loading…". If it takes long the screen
 * says so and offers a way out, so nobody is left looking at a page that will never arrive.
 */
export function PageLoading({ what, width = "max-w-7xl" }: { what: string; width?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`mx-auto ${width} px-4 py-12`} role="status" aria-live="polite">
      <p className="text-fg-muted">{what}</p>
      <div className="mt-3 h-0.5 w-40 overflow-hidden rounded bg-line" aria-hidden>
        <div className="load-bar h-full w-1/3 bg-fg" />
      </div>
      {slow && (
        <div className="tl-in mt-5 space-y-3 text-sm">
          <p className="text-fg-muted">This is taking longer than usual. Check your connection: the page needs it once, then the analysis runs on this device.</p>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      )}
    </div>
  );
}
