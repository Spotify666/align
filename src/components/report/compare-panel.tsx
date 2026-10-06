"use client";
// How close this shot is to others: the textbook model, international batters' line, the
// player's own earlier shots, and shots other players chose to share. Match % compares the
// measures both shots have, each difference sized against its coaching range (see
// src/engine/signature.ts); 100% = the same on every one of them.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisPayload } from "@/engine/types";
import { matchSignatures, signatureOf, type Match, type ShotSignature } from "@/engine/signature";
import { plainNumber, plainUnit } from "@/engine/plain";
import { builtInReferences, type Reference } from "@/lib/compare";
import { currentUser, listShotProfiles, shareShotProfile, unshareShotProfile, type SharedProfile } from "@/lib/cloud";
import { getAnalysis, listAnalyses, loadProfile, updateAnalysis } from "@/lib/store";

interface Row extends Reference {
  match: Match;
}

const VIEW = (s: ShotSignature) => (s.axis === "sideways" ? "from either end" : s.axis === "forward" ? "side-on" : "");

export function ComparePanel({ payload, fps, analysisId }: { payload: AnalysisPayload; fps: number | null; analysisId?: string }) {
  const mine = useMemo(() => signatureOf(payload, fps), [payload, fps]);
  const [refs, setRefs] = useState<Reference[] | null>(null);
  const [own, setOwn] = useState<Reference[]>([]);
  const [players, setPlayers] = useState<Reference[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!mine) return;
    let alive = true;
    // The textbook model is built by the engine itself: off the first paint.
    const t = setTimeout(() => alive && setRefs(builtInReferences()), 30);
    (async () => {
      const all = await listAnalyses().catch(() => []);
      const mineStored = analysisId ? all.find((a) => a.id === analysisId) : undefined;
      if (alive) setSharedId(mineStored?.sharedProfileId ?? null);
      const others: Reference[] = [];
      for (const a of all) {
        if (a.id === analysisId) continue;
        const sig = signatureOf(a.payload, null);
        if (sig) others.push({ id: `own_${a.id}`, name: a.title || "Earlier shot", note: new Date(a.recordedAt).toLocaleDateString(), kind: "you", signature: sig, when: a.recordedAt });
      }
      if (alive) setOwn(others.slice(0, 20));
      const user = await currentUser().catch(() => null);
      if (!alive) return;
      setSignedIn(!!user);
      if (user) {
        const shared = await listShotProfiles().catch(() => [] as SharedProfile[]);
        if (alive)
          setPlayers(
            shared
              .filter((s) => s.shared && s.analysis_id !== analysisId && s.signature?.values)
              .map((s) => ({
                id: `player_${s.id}`,
                name: s.display_name,
                note: [s.skill_level, s.handedness === "left" ? "left-handed" : "right-handed", VIEW(s.signature)].filter(Boolean).join(" · "),
                kind: "player" as const,
                signature: s.signature,
              })),
          );
      }
    })();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mine, analysisId]);

  if (!mine) {
    if (payload.mode === "posture_screen" || payload.analysis_status === "valid") return null;
    return null;
  }

  const rows = (xs: Reference[]): Row[] => xs.map((r) => ({ ...r, match: matchSignatures(mine, r.signature) }));
  const allBuiltIn = rows(refs ?? []);
  const builtIn = allBuiltIn.filter((r) => r.match.score !== null);
  const proOther = allBuiltIn.some((r) => r.kind === "pro" && r.match.score === null);
  const yours = rows(own).filter((r) => r.match.score !== null);
  const bestYours = [...yours].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0)).slice(0, 1);
  const latestYours = yours.slice(0, 2).filter((r) => !bestYours.includes(r));
  const others = rows(players)
    .filter((r) => r.match.score !== null)
    .sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0));

  return (
    <section aria-labelledby="compare-h" className="card p-5 space-y-5">
      <header>
        <p className="eyebrow">Compare</p>
        <h2 id="compare-h" className="display mt-1 text-[1.6rem] leading-tight sm:text-3xl">How close is this shot?</h2>
        <p className="mt-2 max-w-3xl text-sm text-fg-muted">
          Match compares the measures both shots have — the line, its timing and the shape around it — each difference sized against its coaching
          range. 100% means the same on all of them. Only shots filmed from the same kind of position are compared on the line.
        </p>
      </header>

      <Group title="References">
        {refs === null && <p className="text-sm text-fg-subtle">Building the textbook model…</p>}
        {builtIn.map((r) => (
          <MatchRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} mineAxis={mine.axis} />
        ))}
        {refs !== null && proOther && (
          <li className="text-xs text-fg-subtle">
            International batters&apos; line is measured from either end of the pitch: film from the bowler&apos;s end to compare with it.
          </li>
        )}
      </Group>

      {(bestYours.length > 0 || latestYours.length > 0) && (
        <Group title="Your other shots">
          {[...bestYours.map((r) => ({ ...r, note: `Closest of your shots · ${r.note}` })), ...latestYours].map((r) => (
            <MatchRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} mineAxis={mine.axis} />
          ))}
        </Group>
      )}

      <Group title="Other players">
        {signedIn === false && (
          <p className="text-sm text-fg-muted">
            <Link href={`/signin?next=${analysisId ? `/report/${analysisId}` : "/home"}`} className="font-medium text-brand hover:underline">
              Sign in
            </Link>{" "}
            to compare with shots other players share, and to share yours.
          </p>
        )}
        {signedIn && others.length === 0 && <p className="text-sm text-fg-subtle">No shared shots from the same camera position yet.</p>}
        {others.slice(0, 8).map((r) => (
          <MatchRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} mineAxis={mine.axis} />
        ))}
        {signedIn && analysisId && <ShareShot analysisId={analysisId} signature={mine} payload={payload} sharedId={sharedId} onChange={setSharedId} />}
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm text-fg-subtle">{title}</h3>
      <ul className="mt-2 space-y-2">{children}</ul>
    </div>
  );
}

function MatchRow({ row, open, onToggle, mineAxis }: { row: Row; open: boolean; onToggle: () => void; mineAxis: ShotSignature["axis"] }) {
  const s = row.match.score;
  const tone = s === null ? "bg-line" : s >= 85 ? "bg-ok" : s >= 65 ? "bg-brand" : "bg-bad";
  const why = s === null ? (row.signature.axis && row.signature.axis !== mineAxis ? `Filmed ${VIEW(row.signature)}: compare with a clip filmed the same way.` : "Too few measures in common.") : null;
  return (
    <li className="rounded-xl border border-line">
      <button className="flex w-full items-center gap-3 px-3.5 py-3 text-left" onClick={onToggle} aria-expanded={open} disabled={s === null}>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{row.name}</span>
          <span className="block text-xs text-fg-subtle">{why ?? row.note}</span>
          {s !== null && (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className={`block h-full rounded-full ${tone}`} style={{ width: `${s}%` }} />
            </span>
          )}
        </span>
        <span className="num shrink-0 text-2xl font-semibold">{s === null ? "—" : `${s}%`}</span>
      </button>
      {open && s !== null && <MatchDetail match={row.match} name={row.name} />}
    </li>
  );
}

const fmt = (v: number, unit: string, decimals: number) => `${plainNumber({ unit, decimals }, v)} ${plainUnit({ unit })}`.trim();

function MatchDetail({ match, name }: { match: Match; name: string }) {
  return (
    <div className="border-t border-line px-3.5 py-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Your shot against {name}, measure by measure</caption>
        <thead>
          <tr className="text-left text-xs text-fg-subtle">
            <th className="py-1 font-medium">Measure</th>
            <th className="py-1 font-medium">You</th>
            <th className="py-1 font-medium">{name.length > 14 ? "Them" : name}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {match.parts.map((p) => (
            <tr key={p.id}>
              <td className="py-1.5 pr-2">
                <span className={p.similarity < 0.6 ? "font-medium text-bad" : ""}>{p.name}</span>
              </td>
              <td className="num py-1.5 pr-2">{fmt(p.you, p.unit, p.decimals)}</td>
              <td className="num py-1.5">{fmt(p.them, p.unit, p.decimals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {match.path !== null && (
        <p className="mt-2 text-xs text-fg-muted">
          How the line formed in the last 300 ms before contact: <span className="num font-medium text-fg">{Math.round(match.path * 100)}%</span> alike.
        </p>
      )}
      {match.parts[0] && match.parts[0].similarity < 0.6 && (
        <p className="mt-1 text-xs text-fg-muted">Biggest difference: {match.parts[0].name.toLowerCase()}.</p>
      )}
    </div>
  );
}

function ShareShot({ analysisId, signature, payload, sharedId, onChange }: { analysisId: string; signature: ShotSignature; payload: AnalysisPayload; sharedId: string | null; onChange: (id: string | null) => void }) {
  const [name, setName] = useState(() => loadProfile().displayName || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (sharedId)
    return (
      <li className="flex flex-wrap items-center gap-2 pt-1 text-sm">
        <span className="chip border-ok/50 text-ok">This shot is shared</span>
        <button
          className="btn btn-ghost !min-h-9 !py-1.5 text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await unshareShotProfile(sharedId);
              await updateAnalysis(analysisId, { sharedProfileId: null });
              onChange(null);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Couldn't stop sharing");
            } finally {
              setBusy(false);
            }
          }}
        >
          Stop sharing
        </button>
        {err && <span className="text-xs text-bad" role="alert">{err}</span>}
      </li>
    );
  return (
    <li className="rounded-xl border border-dashed border-line-strong p-3.5">
      <p className="text-sm font-medium">Share this shot so other players can compare with it</p>
      <p className="mt-0.5 text-xs text-fg-subtle">Only its numbers (the line, timing and shape) and the name you choose. Never the video or photos. Stop any time.</p>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setErr("Choose a name to show");
          setBusy(true);
          setErr("");
          try {
            const profile = loadProfile();
            const stored = await getAnalysis(analysisId);
            const id = await shareShotProfile({ analysisId, displayName: name, handedness: payload.handedness ?? profile.handedness, skill: profile.skill, signature, engineVersion: payload.versions.engine });
            if (stored) await updateAnalysis(analysisId, { sharedProfileId: id });
            onChange(id);
          } catch (e2) {
            setErr(e2 instanceof Error ? e2.message : "Couldn't share");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="share-name">
          Name to show
        </label>
        <input id="share-name" className="field min-w-0 flex-1" maxLength={40} placeholder="Name to show" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary !min-h-10" disabled={busy}>
          {busy ? "Sharing…" : "Share"}
        </button>
      </form>
      {err && <p className="mt-1 text-xs text-bad" role="alert">{err}</p>}
    </li>
  );
}
