"use client";
// On-device store (IndexedDB). Analyses work fully offline and signed-out; cloud
// sync is an explicit, consented action. Raw video is never written here.

import type { AnalysisPayload } from "@/engine/types";

export interface StoredAnalysis {
  id: string;
  createdAt: string;
  recordedAt: string;
  payload: AnalysisPayload;
  title: string;
  notes: string;
  tags: string[];
  representative: boolean;
  cloud: { syncedAt: string } | null;
}

const DB = "align";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("analyses")) db.createObjectStore("analyses", { keyPath: "id" }).createIndex("recordedAt", "recordedAt");
      if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks");
      if (!db.objectStoreNames.contains("keyframes")) db.createObjectStore("keyframes");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveAnalysis(a: StoredAnalysis, tracks: Uint8Array, keyframes: Record<number, Blob>) {
  await tx(["analyses", "tracks", "keyframes"], "readwrite", (t) => {
    t.objectStore("analyses").put(a);
    t.objectStore("tracks").put(tracks, a.id);
    for (const [frame, blob] of Object.entries(keyframes)) t.objectStore("keyframes").put(blob, `${a.id}:${frame}`);
  });
}

export async function updateAnalysis(id: string, patch: Partial<Pick<StoredAnalysis, "title" | "notes" | "tags" | "representative" | "cloud">>) {
  const cur = await getAnalysis(id);
  if (!cur) return;
  await tx(["analyses"], "readwrite", (t) => {
    t.objectStore("analyses").put({ ...cur, ...patch });
  });
}

export const getAnalysis = (id: string) => tx<StoredAnalysis>(["analyses"], "readonly", (t) => t.objectStore("analyses").get(id));
export const getTracks = (id: string) => tx<Uint8Array>(["tracks"], "readonly", (t) => t.objectStore("tracks").get(id));

export async function listAnalyses(): Promise<StoredAnalysis[]> {
  const all = (await tx<StoredAnalysis[]>(["analyses"], "readonly", (t) => t.objectStore("analyses").getAll())) ?? [];
  return all.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function getKeyframes(id: string, frames: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const db = await open();
  await Promise.all(
    frames.map(
      (f) =>
        new Promise<void>((resolve) => {
          const req = db.transaction(["keyframes"], "readonly").objectStore("keyframes").get(`${id}:${f}`);
          req.onsuccess = () => {
            if (req.result) out[f] = URL.createObjectURL(req.result as Blob);
            resolve();
          };
          req.onerror = () => resolve();
        }),
    ),
  );
  return out;
}

export async function deleteAnalysis(id: string) {
  const db = await open();
  const keys: IDBValidKey[] = await new Promise((resolve) => {
    const req = db.transaction(["keyframes"], "readonly").objectStore("keyframes").getAllKeys(IDBKeyRange.bound(`${id}:`, `${id}:￿`));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });
  await tx(["analyses", "tracks", "keyframes"], "readwrite", (t) => {
    t.objectStore("analyses").delete(id);
    t.objectStore("tracks").delete(id);
    for (const k of keys) t.objectStore("keyframes").delete(k);
  });
}

export async function deleteEverything() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function storageEstimate() {
  const list = await listAnalyses();
  let tracks = 0;
  for (const a of list) tracks += (await getTracks(a.id))?.byteLength ?? 0;
  return { analyses: list.length, trackBytes: tracks, quota: (await navigator.storage?.estimate?.()) ?? null };
}

// ---------- Profile (local, signed-out) ----------

export interface LocalProfile {
  handedness: "right" | "left";
  heightCm: number | null;
  ageBand: "u13" | "13_15" | "16_18" | "adult" | "masters" | null;
  skill: "beginner" | "club" | "academy" | "elite" | null;
  displayName: string;
  consentProcessing: boolean;
  retentionDays: number;
}

const PROFILE_KEY = "align.profile.v1";
export const DEFAULT_PROFILE: LocalProfile = {
  handedness: "right",
  heightCm: null,
  ageBand: null,
  skill: null,
  displayName: "",
  consentProcessing: false,
  retentionDays: 14,
};

export function loadProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: LocalProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* private mode: profile lasts for this session only */
  }
}
