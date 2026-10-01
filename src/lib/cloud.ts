"use client";
// Explicit, consented cloud save. Stores the compact track file, still frames, the
// immutable payload, narrow metric rows and the written report — never raw video.

import { supabase } from "./supabase/client";
import { POLICY_VERSION } from "./supabase/config";
import { getAnalysis, getTracks, updateAnalysis } from "./store";
import { templateReport } from "@/engine/report";
import { decodeTracks } from "@/engine/tracks-codec";
import { METRICS, REGISTRY_HASH, THRESHOLDS, ENGINE_VERSION, METRIC_VERSION } from "@/engine/registry";

async function sha256Hex(bytes: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function currentUser() {
  const { data } = await supabase().auth.getUser();
  return data.user ?? null;
}

export async function latestConsent(kind: string): Promise<boolean> {
  const { data } = await supabase().from("consents").select("granted").eq("kind", kind).order("created_at", { ascending: false }).limit(1);
  return data?.[0]?.granted ?? false;
}

export async function setConsent(kind: string, granted: boolean) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await supabase().from("consents").insert({ user_id: user.id, kind, granted, policy_version: POLICY_VERSION });
  if (error) throw error;
}

export async function saveToCloud(id: string, keyframeBlobs: Record<number, Blob>) {
  const sb = supabase();
  const user = await currentUser();
  if (!user) throw new Error("Sign in first");
  const stored = await getAnalysis(id);
  const tracks = await getTracks(id);
  if (!stored || !tracks) throw new Error("Analysis not found on this device");
  const p = stored.payload;
  const uid = user.id;

  await sb.from("profiles").upsert({ id: uid }, { onConflict: "id", ignoreDuplicates: true });
  await sb.from("registry_versions").upsert(
    { hash: REGISTRY_HASH, engine_version: ENGINE_VERSION, metric_version: METRIC_VERSION, content: { thresholds: THRESHOLDS, metrics: METRICS } },
    { onConflict: "hash", ignoreDuplicates: true },
  );

  const { error: aErr } = await sb.from("analyses").insert({
    id,
    owner_id: uid,
    recorded_at: stored.recordedAt,
    requested_shot: p.requested_shot,
    tier: p.tier,
    mode: p.mode,
    status: p.analysis_status,
    status_reason: p.status_reason,
    observed_label: p.observed_shot?.label ?? null,
    observed_prob: p.observed_shot?.probability ?? null,
    capture_confidence: p.capture_confidence,
    technique_index: p.technique_index?.value ?? null,
    engine_version: p.versions.engine,
    metric_version: p.versions.metric_version,
    registry_hash: p.versions.registry_hash,
    input_hash: p.input_hash,
    result_hash: p.result_hash,
    demo: p.demo,
    title: stored.title.slice(0, 120),
    notes: stored.notes,
    tags: stored.tags,
    representative: stored.representative,
  });
  if (aErr && aErr.code !== "23505") throw aErr;

  const trackPath = `${uid}/${id}/tracks.bin`;
  const up = await sb.storage.from("tracks").upload(trackPath, new Blob([tracks as BlobPart], { type: "application/octet-stream" }), { upsert: true, contentType: "application/octet-stream" });
  if (up.error) throw up.error;
  const media: Array<{ owner_id: string; analysis_id: string; bucket: string; path: string; bytes: number }> = [
    { owner_id: uid, analysis_id: id, bucket: "tracks", path: trackPath, bytes: tracks.byteLength },
  ];
  for (const [frame, blob] of Object.entries(keyframeBlobs)) {
    const path = `${uid}/${id}/frame_${frame}.webp`;
    const r = await sb.storage.from("evidence").upload(path, blob, { upsert: true, contentType: "image/webp" });
    if (!r.error) media.push({ owner_id: uid, analysis_id: id, bucket: "evidence", path, bytes: blob.size });
  }

  const obs = await decodeTracks(tracks);
  const report = templateReport(p);
  const results = await Promise.all([
    sb.from("analysis_payloads").upsert({ analysis_id: id, owner_id: uid, payload: p }, { onConflict: "analysis_id", ignoreDuplicates: true }),
    sb.from("observations").upsert(
      { analysis_id: id, owner_id: uid, storage_path: trackPath, bytes: tracks.byteLength, sha256: await sha256Hex(tracks), frame_count: obs.body.length, fps: obs.media.fps },
      { onConflict: "analysis_id", ignoreDuplicates: true },
    ),
    p.metrics.length
      ? sb.from("metric_values").upsert(
          p.metrics.map((m) => ({
            analysis_id: id,
            owner_id: uid,
            metric_id: m.id,
            status: m.status,
            value: m.value,
            uncertainty: m.uncertainty,
            confidence: m.confidence,
            in_range: m.inRange,
            recorded_at: stored.recordedAt,
          })),
          { onConflict: "analysis_id,metric_id", ignoreDuplicates: true },
        )
      : Promise.resolve({ error: null }),
    sb.from("reports").insert({ analysis_id: id, owner_id: uid, generator: report.generator, audience: report.audience, body: report, violations: 0 }),
    sb.from("media_objects").upsert(media, { onConflict: "path", ignoreDuplicates: true }),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  await updateAnalysis(id, { cloud: { syncedAt: new Date().toISOString() } });
}
