"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { decodeTracks } from "@/engine/tracks-codec";
import type { CaptureObservation } from "@/engine/types";
import { getAnalysis, getKeyframes, getTracks, type StoredAnalysis } from "@/lib/store";
import { loadCloudAnalysis } from "@/lib/cloud";
import { PrintReport } from "./print-report";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; stored: Pick<StoredAnalysis, "payload" | "title" | "session">; obs: CaptureObservation; keyframes: Record<number, string> };

/** The printed report of an analysis saved on this device (or in the batter's account). */
export function LocalPrint({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      const [stored, tracks] = await Promise.all([getAnalysis(id), getTracks(id)]);
      if (stored && tracks) {
        const [obs, keyframes] = await Promise.all([decodeTracks(tracks), getKeyframes(id, stored.payload.evidence_frames)]);
        return alive && setState({ kind: "ready", stored, obs, keyframes });
      }
      const cloud = await loadCloudAnalysis(id).catch(() => null);
      if (!alive) return;
      if (!cloud) return setState({ kind: "missing" });
      setState({ kind: "ready", stored: { payload: cloud.payload, title: cloud.title }, obs: cloud.obs, keyframes: cloud.keyframes });
    })().catch(() => alive && setState({ kind: "missing" }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.kind === "loading") return <p className="mx-auto max-w-3xl px-4 py-10 text-fg-muted">Preparing the report…</p>;
  if (state.kind === "missing")
    return (
      <main id="main" className="mx-auto max-w-2xl space-y-4 px-4 py-16">
        <h1 className="display text-3xl">Report not on this device</h1>
        <p className="text-fg-muted">Open it on the device that made it, or from your account.</p>
        <Link href="/sessions" className="btn btn-primary">Open sessions</Link>
      </main>
    );
  return <PrintReport payload={state.stored.payload} obs={state.obs} keyframes={state.keyframes} title={state.stored.title} backHref={`/report/${id}`} unchosen={state.stored.session?.intended === null} />;
}
