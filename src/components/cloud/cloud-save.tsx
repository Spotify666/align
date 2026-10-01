"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentUser, latestConsent, saveToCloud, setConsent } from "@/lib/cloud";
import { getAnalysis } from "@/lib/store";
import { Upload } from "../icons";

type S = "checking" | "signed_out" | "ready" | "confirm" | "saving" | "saved" | "error";

export function CloudSave({ id }: { id: string }) {
  const [s, setS] = useState<S>("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const stored = await getAnalysis(id);
      if (stored?.cloud) return setS("saved");
      const user = await currentUser().catch(() => null);
      setS(user ? "ready" : "signed_out");
    })();
  }, [id]);

  async function go() {
    try {
      if (!(await latestConsent("cloud_storage"))) return setS("confirm");
      setS("saving");
      const frames = await keyframeBlobs(id);
      await saveToCloud(id, frames);
      setS("saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
      setS("error");
    }
  }

  if (s === "checking") return null;
  if (s === "signed_out")
    return (
      <Link href={`/signin?next=/report/${id}`} className="btn btn-ghost !min-h-9 !py-1.5 text-sm">
        <Upload size={16} /> Save to account
      </Link>
    );
  if (s === "saved") return <span className="chip border-lime/50 text-lime">Saved to account</span>;
  if (s === "confirm")
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Store tracks, stills and report in your account (no video)?</span>
        <button className="btn btn-primary !min-h-9 !py-1.5" onClick={async () => { await setConsent("cloud_storage", true); await go(); }}>Agree and save</button>
        <button className="btn btn-ghost !min-h-9 !py-1.5" onClick={() => setS("ready")}>Cancel</button>
      </span>
    );
  return (
    <span className="flex items-center gap-2">
      <button className="btn btn-ghost !min-h-9 !py-1.5 text-sm" onClick={go} disabled={s === "saving"}>
        <Upload size={16} /> {s === "saving" ? "Saving…" : "Save to account"}
      </button>
      {s === "error" && <span className="text-xs text-coral" role="alert">{msg}</span>}
    </span>
  );
}

async function keyframeBlobs(id: string): Promise<Record<number, Blob>> {
  const stored = await getAnalysis(id);
  if (!stored) return {};
  const out: Record<number, Blob> = {};
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("align");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await Promise.all(
    stored.payload.evidence_frames.map(
      (f) =>
        new Promise<void>((resolve) => {
          const req = db.transaction(["keyframes"], "readonly").objectStore("keyframes").get(`${id}:${f}`);
          req.onsuccess = () => {
            if (req.result) out[f] = req.result as Blob;
            resolve();
          };
          req.onerror = () => resolve();
        }),
    ),
  );
  return out;
}
