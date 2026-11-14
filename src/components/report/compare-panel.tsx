"use client";
// How close this shot is to others: the textbook model, international batters' line, the
// player's own earlier shots, and shots other players chose to share. Match % compares the
// measures both shots have, each difference sized against its coaching range (see
// src/engine/signature.ts); 100% = the same on every one of them.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisPayload, Metric } from "@/engine/types";
import { signatureOf, type Match, type ShotSignature } from "@/engine/signature";
import { similarity, usualSignature, SIMILARITY_DOMAINS, type Similarity } from "@/engine/similarity";
import { friendlyValue } from "@/engine/summary";
import { METRICS } from "@/engine/registry";
import { FRONTAL_METRICS } from "@/engine/frontal";
import { builtInReferences, libraryProvenance, likeness, PROVENANCE, type Reference } from "@/lib/compare";
import { currentUser, listLibraryShots, listShotProfiles, shareShotProfile, unshareShotProfile, type SharedProfile } from "@/lib/cloud";
import { getAnalysis, listAnalyses, loadProfile, updateAnalysis } from "@/lib/store";

interface Row extends Reference {
  sim: Similarity;
}

const VIEW = (s: ShotSignature) => (s.axis === "sideways" ? "from either end" : s.axis === "forward" ? "side-on" : "");

export function ComparePanel({ payload, fps, analysisId, numbers = true }: { payload: AnalysisPayload; fps: number | null; analysisId?: string; numbers?: boolean }) {
  const mine = useMemo(() => signatureOf(payload, fps), [payload, fps]);
  const [refs, setRefs] = useState<Reference[] | null>(null);
  const [own, setOwn] = useState<Reference[]>([]);
  const [players, setPlayers] = useState<Reference[]>([]);
  const [library, setLibrary] = useState<Reference[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!mine) return;
    let alive = true;
    // The textbook model is built by the engine itself: off the first paint.
    const t = setTimeout(() => alive && setRefs(builtInReferences()), 30);
    // The library: only references whose rights are granted reach this page (the database decides).
    listLibraryShots()
      .then(
        (rows) =>
          alive &&
          setLibrary(
            rows
              .filter((r) => r.shot === "front_foot_defence" && r.signature?.values)
              .map((r) => ({
                id: `library_${r.id}`,
                name: r.reference_athletes?.display_name ?? "Library reference",
                note: [r.reference_athletes?.kind === "coach_model" ? "A coach's model" : r.reference_athletes?.kind === "generated" ? "Generated" : "Licensed player", VIEW(r.signature)].filter(Boolean).join(" · "),
                kind: "library" as const,
                signature: r.signature,
                provenance: r.reference_athletes?.kind === "generated" ? PROVENANCE.generated : libraryProvenance(r.source, r.licence_ref, r.rights_expires_at),
              })),
          ),
      )
      .catch(() => {});
    (async () => {
      const all = await listAnalyses().catch(() => []);
      const mineStored = analysisId ? all.find((a) => a.id === analysisId) : undefined;
      if (alive) setSharedId(mineStored?.sharedProfileId ?? null);
      const others: Reference[] = [];
      for (const a of all) {
        if (a.id === analysisId) continue;
        const sig = signatureOf(a.payload, null);
        if (sig) others.push({ id: `own_${a.id}`, name: a.title || "Earlier shot", note: new Date(a.recordedAt).toLocaleDateString(), kind: "you", signature: sig, provenance: PROVENANCE.yours, when: a.recordedAt });
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
                provenance: PROVENANCE.shared,
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

  const rows = (xs: Reference[]): Row[] => xs.map((r) => ({ ...r, sim: similarity(mine, r.signature) }));
  const allBuiltIn = rows([...(refs ?? []), ...library]);
  // Comparable references first; the others stay listed, with why and what would make them comparable.
  const builtIn = [...allBuiltIn].sort((a, b) => Number(b.sim.comparable) - Number(a.sim.comparable));
  const allYours = rows(own);
  const yours = allYours.filter((r) => r.sim.comparable);
  const yoursApart = allYours.length - yours.length;
  const bestYours = [...yours].sort((a, b) => (b.sim.overall ?? 0) - (a.sim.overall ?? 0)).slice(0, 1);
  const latestYours = yours.slice(0, 2).filter((r) => !bestYours.includes(r));
  // Your usual: the middle of your earlier shots filmed the same way. Always there to compare
  // with once you have three, whatever else is comparable (the fallback reference).
  const sameWay = own.filter((r) => r.signature.axis === mine.axis && r.signature.media === "video").length;
  const usualSig = usualSignature(own.map((r) => r.signature), mine.axis);
  const usual = usualSig
    ? rows([{ id: "usual", name: "Your usual", note: `The middle of your ${sameWay} earlier shots filmed the same way`, kind: "usual", signature: usualSig, provenance: PROVENANCE.usual }]).filter((r) => r.sim.comparable)
    : [];
  const others = rows(players)
    .filter((r) => r.sim.comparable)
    .sort((a, b) => (b.sim.overall ?? 0) - (a.sim.overall ?? 0));

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
          <MatchRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} mine={mine} numbers={numbers} />
        ))}
      </Group>

      {(usual.length > 0 || bestYours.length > 0 || latestYours.length > 0) && (
        <Group title="Your other shots">
          {[...usual, ...bestYours.map((r) => ({ ...r, note: `Closest of your shots · ${r.note}` })), ...latestYours].map((r) => (
            <MatchRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} mine={mine} numbers={numbers} />
          ))}
          {yoursApart > 0 && (
            <li className="text-xs text-fg-subtle">
              {yoursApart === 1 ? "One of your shots was" : `${yoursApart} of your shots were`} filmed another way or show too little, so {yoursApart === 1 ? "it isn't" : "they aren't"} compared.
            </li>
          )}
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
          <MatchRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} mine={mine} numbers={numbers} />
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

function MatchRow({ row, open, onToggle, mine, numbers }: { row: Row; open: boolean; onToggle: () => void; mine: ShotSignature; numbers: boolean }) {
  const s = row.sim.overall;
  const tone = s === null ? "bg-line" : s >= 85 ? "bg-ok" : s >= 65 ? "bg-brand" : "bg-bad";
  const why = row.sim.reasons.join(" ") || null;
  // The comparability check, in words: what the two have in common.
  const basis = s === null ? null : `Same shot and camera position · ${row.sim.match.parts.length} measures in common`;
  return (
    <li className="rounded-xl border border-line">
      <button className="flex min-h-11 w-full items-center gap-3 px-3.5 py-3 text-left" onClick={onToggle} aria-expanded={open} disabled={s === null}>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{row.name}</span>
          <span className="block text-xs text-fg-subtle">{row.note}</span>
          <span className="block text-xs text-fg-subtle">{row.provenance.label}.</span>
          <span className={`block text-xs ${why ? "text-fg-muted" : "text-fg-subtle"}`}>{why ? `Not comparable. ${why}` : basis}</span>
          {s !== null && (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className={`block h-full rounded-full ${tone}`} style={{ width: `${s}%` }} />
            </span>
          )}
        </span>
        <span className="num shrink-0 text-2xl font-semibold">{s === null ? "—" : `${s}%`}</span>
      </button>
      {open && s !== null && <MatchDetail sim={row.sim} name={row.name} numbers={numbers} axis={mine.axis} />}
    </li>
  );
}

// Everyday units, never a minus sign or milliseconds (the report's rule); "height" is each batter's own.
const def = (id: string) => METRICS.find((d) => d.id === id) ?? FRONTAL_METRICS.find((d) => d.id === id);
const fmt = (id: string, v: number, unit: string, decimals: number, axis: ShotSignature["axis"]) =>
  friendlyValue({ id, unit, decimals, value: v, range: (def(id)?.range ?? null) as Metric["range"], inRange: null, ...(axis ? { axis } : {}) }).replace("of your height", "of height");

function MatchDetail({ sim, name, numbers, axis }: { sim: Similarity; name: string; numbers: boolean; axis: ShotSignature["axis"] }) {
  const match: Match = sim.match;
  const domains = SIMILARITY_DOMAINS.map((d) => ({ id: d.id, ...sim.domains[d.id] }));
  return (
    <div className="border-t border-line px-3.5 py-3">
      <h4 className="text-xs text-fg-subtle">By part of the body</h4>
      <ul className="mt-1.5 divide-y divide-line" aria-label={`Your shot against ${name}, by part of the body`}>
        {domains.map((d) => (
          <li key={d.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span>{d.name}</span>
            <span className={d.score === null ? "text-fg-subtle" : d.score < 65 ? "font-medium text-bad" : ""}>
              {d.score === null ? "Not compared" : numbers ? <span className="num">{d.score}%</span> : likeness(d.score)}
              {d.score !== null && <span className="text-xs text-fg-subtle"> · {d.measures === 1 ? "1 measure" : `${d.measures} measures`}</span>}
            </span>
          </li>
        ))}
      </ul>
      {numbers && (
      <table className="mt-3 w-full text-sm">
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
              <td className="num py-1.5 pr-2">{fmt(p.id, p.you, p.unit, p.decimals, axis)}</td>
              <td className="num py-1.5">{fmt(p.id, p.them, p.unit, p.decimals, axis)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
      {numbers && match.path !== null && (
        <p className="mt-2 text-xs text-fg-muted">
          How the line formed in the last third of a second before contact: <span className="num font-medium text-fg">{Math.round(match.path * 100)}%</span> alike.
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
