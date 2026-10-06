"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { currentUser, latestConsent, setConsent } from "@/lib/cloud";
import { deleteEverything, getTracks, listAnalyses, loadProfile, saveProfile, storageEstimate, type LocalProfile, type StoredAnalysis } from "@/lib/store";
import { decodeTracks } from "@/engine/tracks-codec";
import { th } from "@/engine/registry";
import { Download, Lock, Trash } from "../icons";

const CONSENTS: Array<{ kind: string; label: string; help: string }> = [
  { kind: "cloud_storage", label: "Save reports to my account", help: "Tracks (~20 KB), still frames and reports. Never raw video unless you upload it." },
  { kind: "coach_sharing", label: "Share with my linked coaches", help: "Coaches you linked with an invite code can see your saved reports and add notes." },
  { kind: "model_training", label: "Use my data to improve the models", help: "Off by default. De-identified tracks only, never video. You can withdraw at any time." },
];

export function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<LocalProfile>(() => loadProfile());
  const [user, setUser] = useState<User | null>(null);
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [analyses, setAnalyses] = useState<StoredAnalysis[]>([]);
  const [usage, setUsage] = useState<{ trackBytes: number; analyses: number } | null>(null);
  const [retention, setRetention] = useState(14);
  const [invite, setInvite] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [audit, setAudit] = useState<Array<{ action: string; subject_id: string | null; created_at: string }>>([]);

  useEffect(() => {
    listAnalyses().then(setAnalyses).catch(() => setAnalyses([]));
    storageEstimate().then((u) => setUsage(u)).catch(() => null);
    currentUser()
      .then(async (u) => {
        setUser(u);
        if (!u) return;
        const entries = await Promise.all(CONSENTS.map(async (c) => [c.kind, await latestConsent(c.kind)] as const));
        setConsents(Object.fromEntries(entries));
        const { data } = await supabase().from("profiles").select("raw_video_retention_days").eq("id", u.id).maybeSingle();
        if (data?.raw_video_retention_days !== undefined) setRetention(data.raw_video_retention_days);
        const { data: log } = await supabase().from("audit_log").select("action, subject_id, created_at").order("created_at", { ascending: false }).limit(20);
        setAudit(log ?? []);
      })
      .catch(() => null);
  }, []);

  const update = (patch: Partial<LocalProfile>) => {
    const next = { ...p, ...patch };
    setP(next);
    saveProfile(next);
    if (user)
      supabase()
        .from("profiles")
        .upsert({ id: user.id, display_name: next.displayName || null, handedness: next.handedness, height_cm: next.heightCm, age_band: next.ageBand, skill_level: next.skill, is_minor: ["u13", "13_15", "16_18"].includes(next.ageBand ?? "") })
        .then(() => null);
  };

  const valid = analyses.filter((a) => a.payload.analysis_status === "valid");
  const needed = th("baseline.min_deliveries");

  async function exportData() {
    const local = await Promise.all(
      analyses.map(async (a) => {
        const t = await getTracks(a.id);
        return { ...a, observation: t ? await decodeTracks(t) : null };
      }),
    );
    let cloud: Record<string, unknown> | null = null;
    if (user) {
      const sb = supabase();
      const tables = ["profiles", "consents", "analyses", "analysis_payloads", "metric_values", "reports", "baselines", "annotations", "coach_links", "audit_log"];
      cloud = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, (await sb.from(t).select("*")).data ?? []])));
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: p, local, cloud }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `align-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-8">
      <header>
        <p className="eyebrow">Athlete profile</p>
        <h1 className="display text-5xl mt-2">You, your baseline, your data.</h1>
      </header>

      <section className="card p-5 space-y-4" aria-labelledby="details">
        <h2 id="details" className="text-lg font-semibold">Batting details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-fg-muted">Name (optional)</span>
            <input className="field mt-1" value={p.displayName} maxLength={80} onChange={(e) => update({ displayName: e.target.value })} />
          </label>
          <fieldset className="text-sm">
            <legend className="text-fg-muted">Batting hand</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["right", "left"] as const).map((h) => (
                <label key={h} className={`btn ${p.handedness === h ? "btn-primary" : "btn-ghost"}`}>
                  <input type="radio" name="hand" className="sr-only" checked={p.handedness === h} onChange={() => update({ handedness: h })} />
                  {h === "right" ? "Right-handed" : "Left-handed"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm">
            <span className="text-fg-muted">Height (cm) — scales distances when stumps aren&apos;t marked</span>
            <input className="field mt-1" type="number" inputMode="numeric" min={100} max={230} value={p.heightCm ?? ""} onChange={(e) => update({ heightCm: e.target.value ? Number(e.target.value) : null })} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Age band</span>
            <select className="field mt-1" value={p.ageBand ?? ""} onChange={(e) => update({ ageBand: (e.target.value || null) as LocalProfile["ageBand"] })}>
              <option value="">Prefer not to say</option>
              <option value="u13">Under 13</option>
              <option value="13_15">13–15</option>
              <option value="16_18">16–18</option>
              <option value="adult">Adult</option>
              <option value="masters">Masters</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Level</span>
            <select className="field mt-1" value={p.skill ?? ""} onChange={(e) => update({ skill: (e.target.value || null) as LocalProfile["skill"] })}>
              <option value="">Not set</option>
              <option value="beginner">Beginner</option>
              <option value="club">Club</option>
              <option value="academy">Academy</option>
              <option value="elite">Elite</option>
            </select>
          </label>
        </div>
        {["u13", "13_15", "16_18"].includes(p.ageBand ?? "") && (
          <p className="text-sm text-warn border-l-2 border-warn/60 pl-3">Under 18: a parent or guardian must agree before each analysis, and cloud saving needs their consent too.</p>
        )}
      </section>

      <section className="card p-5 space-y-3" aria-labelledby="baseline">
        <h2 id="baseline" className="text-lg font-semibold">Personal baseline</h2>
        <p className="text-fg-muted text-sm">
          Built from {needed}–10 of your valid front-foot defences, weighted by confidence. It is kept separate from the coaching ranges.
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 rounded bg-line overflow-hidden" role="progressbar" aria-valuenow={Math.min(valid.length, needed)} aria-valuemax={needed}>
            <div className="h-full bg-data" style={{ width: `${Math.min(100, (valid.length / needed) * 100)}%` }} />
          </div>
          <span className="num text-sm">{valid.length}/{needed}</span>
        </div>
        <p className="text-sm">{valid.length >= needed ? "Baseline established. New reports compare you against it." : `Record ${needed - valid.length} more valid defence${needed - valid.length === 1 ? "" : "s"} to establish it.`}</p>
        <Link href="/sessions" className="text-sm underline text-fg-muted">Choose representative attempts in Sessions</Link>
      </section>

      <section className="card p-5 space-y-4" aria-labelledby="account">
        <h2 id="account" className="text-lg font-semibold">Account and sharing</h2>
        {user ? (
          <>
            <p className="text-sm">Signed in as <strong>{user.email}</strong></p>
            <ul className="space-y-3">
              {CONSENTS.map((c) => (
                <li key={c.kind} className="flex items-start gap-3">
                  <input
                    id={`c_${c.kind}`}
                    type="checkbox"
                    className="mt-1 h-5 w-5 accent-[var(--color-brand)]"
                    checked={!!consents[c.kind]}
                    onChange={async (e) => {
                      await setConsent(c.kind, e.target.checked);
                      setConsents((x) => ({ ...x, [c.kind]: e.target.checked }));
                    }}
                  />
                  <label htmlFor={`c_${c.kind}`} className="text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="block text-fg-muted">{c.help}</span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="block text-sm">
              <span className="text-fg-muted">Delete uploaded raw video after</span>
              <select
                className="field mt-1 max-w-xs"
                value={retention}
                onChange={async (e) => {
                  const days = Number(e.target.value);
                  setRetention(days);
                  await supabase().from("profiles").upsert({ id: user.id, raw_video_retention_days: days });
                }}
              >
                {[0, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>{d === 0 ? "Immediately after analysis" : `${d} days`}</option>
                ))}
              </select>
            </label>
            <form
              className="flex flex-wrap gap-2 items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                const { error } = await supabase().rpc("redeem_coach_invite", { invite_code: invite.trim() });
                setNote(error ? error.message : "Coach linked. They can now see reports you save to your account.");
                if (!error) setConsents((x) => ({ ...x, coach_sharing: true }));
              }}
            >
              <label className="text-sm flex-1 min-w-48">
                <span className="text-fg-muted">Coach invite code</span>
                <input className="field mt-1 num" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="e.g. 3f9a1c22b7d0" />
              </label>
              <button className="btn btn-ghost" disabled={!invite.trim()}>Link coach</button>
            </form>
            {note && <p className="text-sm text-fg-muted" role="status">{note}</p>}
            <button className="btn btn-ghost" onClick={async () => { await supabase().auth.signOut(); setUser(null); }}>Sign out</button>
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            Not signed in. Everything works on this device. <Link href="/signin?next=/profile" className="underline text-fg">Sign in</Link> to save reports to your account or share with a coach.
          </p>
        )}
      </section>

      <section className="card p-5 space-y-4" aria-labelledby="data">
        <h2 id="data" className="text-lg font-semibold flex items-center gap-2"><Lock size={18} /> Your data</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-fg-subtle">Reports on this device</dt><dd className="num text-lg">{usage?.analyses ?? "—"}</dd></div>
          <div><dt className="text-fg-subtle">Track data</dt><dd className="num text-lg">{usage ? `${(usage.trackBytes / 1024).toFixed(0)} KB` : "—"}</dd></div>
          <div><dt className="text-fg-subtle">Raw video stored</dt><dd className="text-lg">None</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={exportData}><Download size={16} /> Export my data (JSON)</button>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (!confirm("Delete every report, track and still frame on this device?")) return;
              await deleteEverything();
              location.reload();
            }}
          >
            <Trash size={16} /> Delete everything on this device
          </button>
          {user && (
            <button
              className="btn btn-ghost !border-bad/60 !text-bad"
              onClick={async () => {
                if (!confirm("Permanently delete your account and everything saved in it? This cannot be undone.")) return;
                const { error } = await supabase().functions.invoke("account-delete", { method: "POST" });
                if (error) return setNote(error.message);
                await supabase().auth.signOut();
                router.push("/");
              }}
            >
              <Trash size={16} /> Delete my account
            </button>
          )}
        </div>
        {user && audit.length > 0 && (
          <details className="text-sm">
            <summary className="min-h-9 text-fg-muted">Activity log (consents, sharing, deletions)</summary>
            <ul className="mt-2 space-y-1 num text-xs text-fg-subtle">
              {audit.map((a, i) => (
                <li key={i}>{new Date(a.created_at).toLocaleString()} · {a.action.replaceAll("_", " ")} {a.subject_id ? `· ${a.subject_id}` : ""}</li>
              ))}
            </ul>
          </details>
        )}
        <Link href="/privacy" className="text-sm underline text-fg-muted">How Aline handles your data</Link>
      </section>
    </div>
  );
}
