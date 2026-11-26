"use client";

import Link from "next/link";
import { useEffect } from "react";

// A page that failed while drawing. Nothing saved on the device is lost: say so, offer a retry.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[align:page-error]", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-4">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display text-4xl">This page didn&apos;t load.</h1>
      <p className="text-fg-muted">Your saved shots are safe on this device. Try again.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/home" className="btn btn-ghost">Go home</Link>
      </div>
    </div>
  );
}
