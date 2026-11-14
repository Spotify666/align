"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decodeTracks, encodeTracks } from "@/engine/tracks-codec";
import { analyze } from "@/engine/analyze";
import { angleFamily } from "@/engine/angles";
import { buildBaseline, compareToBaseline, type BaselineComparison } from "@/engine/baseline";
import type { AnalysisPayload, CaptureObservation, TargetShot } from "@/engine/types";
import { deleteAnalysis, getAnalysis, getKeyframes, getTracks, listAnalyses, saveAnalysis, type StoredAnalysis } from "@/lib/store";
import { deleteFromCloud, loadCloudAnalysis } from "@/lib/cloud";
import { Annotations } from "../coach/annotations";
import { CoachFeedback } from "../coach/coach-feedback";
import { sessionCapture, sessionMedia } from "@/lib/session-media";
import { ReportView } from "./report-view";
import type { CompareReference } from "./evidence-viewer";
import { CloudSave } from "../cloud/cloud-save";
import { Trash } from "../icons";
import { holdUpdates } from "@/lib/fresh";

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
      /** The same ball from the other angle, when added and still on this device. */
      other?: { id: string; payload: AnalysisPayload } | null;
    };

export function LocalReport({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  // A report still holding this session's video (playback, marking) isn't reloaded under the batter.
  useEffect(() => (sessionMedia.has(id) ? holdUpdates() : undefined), [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [stored, tracks] = await Promise.all([getAnalysis(id), getTracks(id)]);
      if (!stored || !tracks) {
        const cloud = await loadCloudAnalysis(id).catch(() => null);
        if (!cloud) return alive && setState({ kind: "missing" });
        const stub: StoredAnalysis = { id, createdAt: cloud.payload.created_at, recordedAt: cloud.recordedAt, payload: cloud.payload, title: cloud.title, notes: "", tags: [], representative: false, cloud: { syncedAt: cloud.recordedAt } };
        return alive && setState({ kind: "ready", stored: stub, obs: cloud.obs, keyframes: cloud.keyframes, baseline: [], reference: null, remote: true });
      }
      const otherId = stored.otherAngle;
      const [obs, keyframes, other] = await Promise.all([
        decodeTracks(tracks),
        getKeyframes(id, stored.payload.evidence_frames),
        otherId ? getAnalysis(otherId).then((o) => (o ? { id: otherId, payload: o.payload } : null)) : null,
      ]);
      if (!alive) return;
      // The report shows now; the comparisons with earlier analyses (only under Details) follow.
      setState({ kind: "ready", stored, obs, keyframes, baseline: [], reference: null, other });
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
      if (alive) setState((s) => (s.kind === "ready" && s.stored.id === id ? { ...s, baseline, reference } : s));
    })().catch(() => alive && setState({ kind: "missing" }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.kind === "loading") return <ReportSkeleton />;
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
  // Optional: the same ball from the other angle (a refined, combined result).
  const family = angleFamily(p);
  // Adding it needs this video's sound (to check the other is the same ball): while it is still open.
  const angleLink =
    state.remote || !family || state.obs.media.kind !== "video"
      ? null
      : state.other
        ? { href: `/angles?a=${id}&b=${state.other.id}`, label: "See both angles together" }
        : media
          ? { href: `/analyse?angle=${id}${p.requested_shot === "back_foot_defence" ? "&shot=back" : ""}`, label: family === "side" ? "Add the front angle of this ball" : "Add the side angle of this ball" }
          : null;
  return (
    <>
    <ReportView
      angleLink={angleLink}
      otherAngle={state.other ?? null}
      session={state.stored.session}
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
      unchosen={state.stored.session?.intended === null}
      printHref={`/report/${id}/print`}
      markHref={canMark ? `/analyse?mark=${id}` : null}
      notice={
        canMark ? (
          <p className="mt-3 text-sm text-fg-muted">
            {p.analysis_status === "valid"
              ? `Confirmed from your body and hands. Tap the ${state.obs.ball.source === "none" && state.obs.bat.source === "none" ? "ball and bat" : state.obs.ball.source === "none" ? "ball" : "bat"} on a few frames (about 30 seconds) to add the bat and contact measures.`
              : `Aline couldn't see the ${state.obs.ball.source === "none" && state.obs.bat.source === "none" ? "ball and bat" : state.obs.ball.source === "none" ? "ball" : "bat"} clearly enough on its own. Tap them on a few frames (about 30 seconds) to confirm the shot.`}
          </p>
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
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 pb-10">
        <CoachFeedback analysisId={id} />
        <Annotations analysisId={id} payload={p} />
      </div>
    )}
    </>
  );
}

/** The report's first card in outline while it is read from this device (a moment), so the page doesn't jump. */
function ReportSkeleton() {
  const bar = "rounded bg-line";
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10 space-y-8" aria-busy="true">
      <span className="sr-only">Loading report…</span>
      <div aria-hidden className="flex items-center gap-3">
        <span className={`${bar} h-4 w-16`} />
        <span className={`${bar} ml-auto h-9 w-28`} />
      </div>
      <div aria-hidden className="card animate-pulse space-y-5 px-5 py-5 sm:px-7 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <span className={`${bar} h-6 w-24`} />
          <span className={`${bar} h-6 w-28`} />
        </div>
        <span className={`${bar} block h-9 w-4/5`} />
        <div className="space-y-3">
          <span className={`${bar} block h-4 w-full`} />
          <span className={`${bar} block h-4 w-11/12`} />
          <span className={`${bar} block h-4 w-3/4`} />
        </div>
        <div className="flex gap-3">
          <span className={`${bar} h-11 w-36`} />
          <span className={`${bar} h-11 w-28`} />
        </div>
      </div>
    </div>
  );
}
