"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decodeTracks, encodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";
import { buildBaseline, compareToBaseline, type BaselineComparison } from "@/engine/baseline";
import type { AnalysisPayload, CaptureObservation, TargetShot } from "@/engine/types";
import { deleteAnalysis, getAnalysis, getKeyframes, getTracks, listAnalyses, saveAnalysis, type StoredAnalysis } from "@/lib/store";
import { deleteFromCloud, loadCloudAnalysis } from "@/lib/cloud";
import { Annotations } from "../coach/annotations";
import { sessionCapture, sessionMedia } from "@/lib/session-media";
import { ReportView } from "./report-view";
import type { CompareReference } from "./evidence-viewer";
import { CloudSave } from "../cloud/cloud-save";
import { Trash } from "../icons";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | {
      kind: "ready";
      stored: StoredAnalysis;
      obs: CaptureObservation;
      keyframes: Record<number, string>;
      baseline: BaselineComparison[];
      reference: CompareReference | null;
      remote?: boolean;
    };

export function LocalReport({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await getAnalysis(id);
      const tracks = await getTracks(id);
      if (!stored || !tracks) {
        const cloud = await loadCloudAnalysis(id).catch(() => null);
        if (!cloud) return alive && setState({ kind: "missing" });
        const stub: StoredAnalysis = { id, createdAt: cloud.payload.created_at, recordedAt: cloud.recordedAt, payload: cloud.payload, title: cloud.title, notes: "", tags: [], representative: false, cloud: { syncedAt: cloud.recordedAt } };
        return alive && setState({ kind: "ready", stored: stub, obs: cloud.obs, keyframes: cloud.keyframes, baseline: [], reference: null, remote: true });
      }
      const obs = await decodeTracks(tracks);
      const keyframes = await getKeyframes(id, stored.payload.evidence_frames);
      // Personal baseline from earlier valid analyses of the same shot on this device.
      const all = await listAnalyses();
      const shot = (a: StoredAnalysis) => a.payload.requested_shot ?? "front_foot_defence";
      const earlier = all.filter((a) => a.id !== id && a.payload.analysis_status === "valid" && shot(a) === shot(stored) && a.recordedAt <= stored.recordedAt);
      const representative = earlier.filter((a) => a.representative);
      const pool = (representative.length >= 6 ? representative : earlier).slice(0, 10).map((a) => a.payload);
      const base = buildBaseline(pool, { version: 1, createdAt: new Date().toISOString() });
      const baseline = compareToBaseline(stored.payload, base);
      // Compare: the most recent earlier confirmed defence filmed from the same camera
      // position by the same-handed batter (otherwise the two can't be laid over each other).
      let reference: CompareReference | null = null;
      const prev = earlier.find((a) => a.payload.camera_view === stored.payload.camera_view && a.payload.handedness === stored.payload.handedness);
      const c1 = stored.payload.events.find((e) => e.type === "contact")?.frame;
      const c2 = prev?.payload.events.find((e) => e.type === "contact")?.frame;
      if (prev && c1 !== undefined && c2 !== undefined) {
        const t = await getTracks(prev.id);
        if (t) reference = { obs: await decodeTracks(t), payload: prev.payload, label: prev.title, recordedAt: prev.recordedAt, contactSelf: c1, contactRef: c2 };
      }
      if (alive) setState({ kind: "ready", stored, obs, keyframes, baseline, reference });
    })().catch(() => alive && setState({ kind: "missing" }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.kind === "loading") return <p className="mx-auto max-w-7xl px-4 py-16 text-fg-muted">Loading report…</p>;
  if (state.kind === "missing")
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 space-y-4">
        <h1 className="display text-4xl">Report not on this device</h1>
        <p className="text-fg-muted">Reports live on the device that made them unless you saved them to your account. Sign in on that device, or open it from Sessions.</p>
        <Link href="/sessions" className="btn btn-primary">Open sessions</Link>
      </div>
    );

  const media = sessionMedia.get(id);
  const p: AnalysisPayload = state.stored.payload;
  // Bat and ball are hard to see automatically; while the clip is still open in this
  // session, the athlete can add them to unlock a full verdict.
  const canMark = !!media && sessionCapture.has(id) && p.mode !== "posture_screen" && (state.obs.ball.source === "none" || state.obs.bat.source === "none");
  // The shot was named as the other defence: re-check the same tracks as that shot, saved as a new report.
  const analyseAs = async (target: TargetShot) => {
    const newId = crypto.randomUUID();
    const { target: _asked, ...rest } = state.obs;
    void _asked;
    const obs: CaptureObservation = { ...rest, id: newId, ...(target !== "front_foot_defence" ? { target } : {}) };
    const createdAt = new Date().toISOString();
    const payload = analyze(obs, { analysisId: newId, createdAt });
    const urls = await getKeyframes(id, [...new Set([...p.evidence_frames, ...payload.evidence_frames])]);
    const keyframes: Record<number, Blob> = {};
    await Promise.all(Object.entries(urls).map(async ([f, u]) => void (keyframes[Number(f)] = await (await fetch(u)).blob())));
    const defaults = ["Front-foot defence", "Back-foot defence"];
    const title = defaults.includes(state.stored.title) ? (target === "back_foot_defence" ? "Back-foot defence" : "Front-foot defence") : state.stored.title;
    await saveAnalysis({ id: newId, createdAt, recordedAt: state.stored.recordedAt, payload, title, notes: "", tags: [], representative: false, cloud: null }, await encodeTracks(obs), keyframes);
    if (media) sessionMedia.set(newId, media);
    const cap = sessionCapture.get(id);
    if (cap) sessionCapture.set(newId, { ...cap, title, createdAt, target });
    router.push(`/report/${newId}`);
  };
  return (
    <>
    <ReportView
      payload={p}
      obs={state.obs}
      videoUrl={media?.url ?? null}
      mediaTimes={media?.mediaTimes ?? null}
      keyframes={media ? undefined : state.keyframes}
      baseline={state.baseline}
      reference={state.reference}
      title={state.stored.title}
      analysisId={state.remote ? undefined : id}
      onAnalyseAs={state.remote ? undefined : analyseAs}
      notice={
        canMark ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-brand/40 bg-surface/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{p.analysis_status === "valid" ? "Add the ball and bat measures" : "Want the full verdict?"}</p>
              <p className="text-sm text-fg-muted">
                {p.analysis_status === "valid"
                  ? `Your defence was confirmed from body and hand movement. Tap the ${state.obs.ball.source === "none" && state.obs.bat.source === "none" ? "ball and bat" : state.obs.ball.source === "none" ? "ball" : "bat"} on a few frames (about 30 seconds) to add bat angle, contact point and delivery measures.`
                  : `Aline couldn't see the ${state.obs.ball.source === "none" && state.obs.bat.source === "none" ? "ball and bat" : state.obs.ball.source === "none" ? "ball" : "bat"} clearly enough on its own. Tap them on a few frames (about 30 seconds) to confirm the shot.`}
              </p>
            </div>
            <Link href={`/analyse?mark=${id}`} className="btn btn-primary shrink-0">Add ball and bat</Link>
          </div>
        ) : null
      }
      actions={
        state.remote ? null : <>
          <CloudSave id={id} />
          <button
            className="btn btn-ghost !min-h-9 !py-1.5 text-sm"
            onClick={async () => {
              const inCloud = !!state.stored.cloud;
              if (!confirm(inCloud ? "Delete this analysis from this device and from your account? This cannot be undone." : "Delete this analysis from this device? This cannot be undone.")) return;
              if (inCloud) {
                try {
                  await deleteFromCloud(id);
                } catch (e) {
                  alert(`Couldn't delete the saved copy: ${e instanceof Error ? e.message : "unknown error"}. Nothing was deleted.`);
                  return;
                }
              }
              await deleteAnalysis(id);
              router.push("/sessions");
            }}
          >
            <Trash size={16} /> Delete
          </button>
        </>
      }
    />
    {state.stored.cloud && (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-10">
        <Annotations analysisId={id} payload={p} />
      </div>
    )}
    </>
  );
}
