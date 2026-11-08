"use client";
// Every page runs the newest build. A tab or a home-screen app left open keeps running the code
// it loaded, so after a deploy it would show the old version until reopened elsewhere. The
// watcher asks which build is live whenever the app comes back to the screen, gets focus or is
// restored, and every two minutes; when it changed, the page reloads. Never in the middle of
// work (an analysis, a report still holding its video): then it reloads on the next page change.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

let busy = 0;
let pending = false;

/** While work is on screen, an update waits for the next page change. Returns the release. */
export function holdUpdates(): () => void {
  busy++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busy = Math.max(0, busy - 1);
  };
}

async function liveBuild(): Promise<string | null> {
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: string };
    return j.id || null;
  } catch {
    return null;
  }
}

/** Reload once per new build (a CDN still serving the old one mustn't cause a loop). */
function reloadFor(id: string) {
  try {
    if (sessionStorage.getItem("align.reloaded-for") === id) return;
    sessionStorage.setItem("align.reloaded-for", id);
  } catch {
    /* storage off: reload anyway */
  }
  window.location.reload();
}

export function VersionWatch() {
  const pathname = usePathname();
  const live = useRef<string | null>(null);

  useEffect(() => {
    if (!BUILD_ID) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const id = await liveBuild();
      if (stopped || !id || id === BUILD_ID) return;
      live.current = id;
      if (busy > 0) pending = true;
      else reloadFor(id);
    };
    const onVisible = () => void check();
    const onShow = (e: PageTransitionEvent) => e.persisted && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onShow);
    const timer = window.setInterval(check, 120_000);
    void check();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onShow);
      window.clearInterval(timer);
    };
  }, []);

  // A page change after an update waited: load the new page from the new build.
  useEffect(() => {
    if (pending && busy === 0 && live.current) reloadFor(live.current);
  }, [pathname]);

  return null;
}
