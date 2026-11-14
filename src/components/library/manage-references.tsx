"use client";
// Recording a reference player's permission (site admins only; the database refuses anyone
// else). A permission says what may be used (numbers, pictures), where (comparisons, the PDF)
// and until when, and names the signed agreement. Without a signed agreement the reference is
// saved as waiting and shown to no one. Withdrawing one hides it for everyone at once.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signatureOf, type ShotSignature } from "@/engine/signature";
import { addReference, isSiteAdmin, listManagedReferences, withdrawReference, type ManagedReference } from "@/lib/cloud";
import { listAnalyses, type StoredAnalysis } from "@/lib/store";

type Use = "compare" | "show_numbers" | "show_pictures" | "pdf";
const USES: Array<{ id: Use; group: "What" | "Where"; label: string; note?: string }> = [
  { id: "show_numbers", group: "What", label: "Its numbers (the line, timing, shape)" },
  { id: "show_pictures", group: "What", label: "Its pictures", note: "No pictures are stored yet: this only records the permission." },
  { id: "compare", group: "Where", label: "In comparisons in the app", note: "Needed for it to appear at all." },
  { id: "pdf", group: "Where", label: "In the PDF" },
];

const VIEW = (s: ShotSignature) => (s.axis === "sideways" ? "from either end" : s.axis === "forward" ? "side-on" : "camera position not known");

export function ManageReferences() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ManagedReference[] | null>(null);
  const [shots, setShots] = useState<Array<{ a: StoredAnalysis; sig: ShotSignature }>>([]);

  const reload = () =>
    listManagedReferences()
      .then(setRows)
      .catch(() => setRows([]));

  useEffect(() => {
    let alive = true;
    isSiteAdmin().then((ok) => {
      if (!alive) return;
      setAdmin(ok);
      if (ok) reload();
    });
    listAnalyses()
      .then((all) => alive && setShots(all.flatMap((a) => {
        const sig = signatureOf(a.payload, null);
        return sig ? [{ a, sig }] : [];
      })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (admin === null) return <Shell><p className="text-fg-muted">Checking your account…</p></Shell>;
  if (!admin)
    return (
      <Shell>
        <p className="text-fg-muted">Only a site admin can record a player&apos;s permission. Sign in with the admin account.</p>
        <Link href="/signin?next=/library/manage" className="btn btn-primary">Sign in</Link>
      </Shell>
    );

  return (
    <Shell>
      <NewReferenceForm shots={shots} onSaved={reload} />
      <section aria-labelledby="recorded-h" className="space-y-3">
        <h2 id="recorded-h" className="text-xl font-semibold">Recorded</h2>
        {rows === null ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-fg-muted">None yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <RecordedRow key={r.id} r={r} onChange={reload} />
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <Link href="/library" className="text-sm text-fg-subtle hover:text-fg">Reference library</Link>
        <h1 className="display text-4xl">Record a permission</h1>
        <p className="text-fg-muted">A player appears in the library only with their written permission: what may be used, where, and until when.</p>
      </header>
      {children}
    </div>
  );
}

function NewReferenceForm({ shots, onSaved }: { shots: Array<{ a: StoredAnalysis; sig: ShotSignature }>; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"licensed_athlete" | "coach_model">("licensed_athlete");
  const [hand, setHand] = useState<"right" | "left">("right");
  const [shotId, setShotId] = useState("");
  const [source, setSource] = useState("");
  const [uses, setUses] = useState<Set<Use>>(new Set(["compare", "show_numbers"]));
  const [endless, setEndless] = useState(false);
  const [until, setUntil] = useState("");
  const [signed, setSigned] = useState(false);
  const [licence, setLicence] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const picked = useMemo(() => shots.find((s) => s.a.id === shotId), [shots, shotId]);

  const problem =
    !name.trim()
      ? "Name the player."
      : !picked
        ? "Choose the shot: analyse the player's clip in Aline first, then pick it here."
        : source.trim().length < 3
          ? "Say where the recording came from."
          : !uses.has("compare")
            ? "Without comparisons in the app it can't appear anywhere."
            : !endless && !until
              ? "Say until when, or that it has no end date."
              : signed && !licence.trim()
                ? "Name the signed agreement (date and reference)."
                : null;

  const toggle = (u: Use) => setUses((s) => {
    const n = new Set(s);
    if (n.has(u)) n.delete(u);
    else n.add(u);
    return n;
  });

  return (
    <form
      className="panel space-y-5 p-5"
      aria-labelledby="new-h"
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem || !picked) return setMsg({ ok: false, text: problem ?? "" });
        setBusy(true);
        setMsg(null);
        try {
          await addReference({
            name,
            kind,
            handedness: hand,
            signature: picked.sig,
            engineVersion: picked.a.payload.versions.engine,
            source,
            uses: [...uses],
            expires: endless ? null : new Date(`${until}T23:59:59`).toISOString(),
            licence: licence || null,
            signed,
          });
          setMsg({ ok: true, text: signed ? `${name.trim()} is in the library now.` : `${name.trim()} is saved and waiting for the signed permission. No one sees it yet.` });
          setName("");
          setSource("");
          setLicence("");
          onSaved();
        } catch (err) {
          setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save it." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 id="new-h" className="text-xl font-semibold">A new reference</h2>

      <Field label="Player's name" id="ref-name">
        <input id="ref-name" className="field w-full" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who they are" id="ref-kind">
          <select id="ref-kind" className="field w-full" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="licensed_athlete">A player</option>
            <option value="coach_model">A coach&apos;s model</option>
          </select>
        </Field>
        <Field label="Batting hand" id="ref-hand">
          <select id="ref-hand" className="field w-full" value={hand} onChange={(e) => setHand(e.target.value as typeof hand)}>
            <option value="right">Right-handed</option>
            <option value="left">Left-handed</option>
          </select>
        </Field>
      </div>
      <Field label="The shot" id="ref-shot" note="Analyse the clip the player gave you in Aline on this device; its numbers are what is shared, never the video.">
        <select id="ref-shot" className="field w-full" value={shotId} onChange={(e) => setShotId(e.target.value)}>
          <option value="">Choose a confirmed front-foot defence</option>
          {shots.map(({ a, sig }) => (
            <option key={a.id} value={a.id}>
              {a.title || "Shot"} · {new Date(a.recordedAt).toLocaleDateString()} · {VIEW(sig)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Where the recording came from" id="ref-source" note="For example: filmed by the player's academy for Aline, 2026.">
        <input id="ref-source" className="field w-full" maxLength={300} value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>

      {(["What", "Where"] as const).map((g) => (
        <fieldset key={g} className="space-y-2">
          <legend className="text-sm font-medium">{g === "What" ? "What may be used" : "Where"}</legend>
          {USES.filter((u) => u.group === g).map((u) => (
            <label key={u.id} className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={uses.has(u.id)} onChange={() => toggle(u.id)} />
              <span>
                {u.label}
                {u.note && <span className="block text-xs text-fg-subtle">{u.note}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      ))}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How long</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={endless} onChange={(e) => setEndless(e.target.checked)} />
          No end date
        </label>
        {!endless && (
          <label className="block text-sm">
            <span className="text-fg-muted">Until</span>
            <input type="date" className="field mt-1 w-full" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">The permission</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="radio" name="signed" className="h-5 w-5" checked={!signed} onChange={() => setSigned(false)} />
          Asked, not signed yet (saved, shown to no one)
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="radio" name="signed" className="h-5 w-5" checked={signed} onChange={() => setSigned(true)} />
          Signed
        </label>
        {signed && (
          <Field label="The signed agreement" id="ref-licence" note="Its date and reference, so it can be found again.">
            <input id="ref-licence" className="field w-full" maxLength={120} value={licence} onChange={(e) => setLicence(e.target.value)} />
          </Field>
        )}
      </fieldset>

      {problem && <p className="text-sm text-fg-muted">{problem}</p>}
      <button className="btn btn-primary" disabled={busy || !!problem}>
        {busy ? "Saving…" : signed ? "Add to the library" : "Save, waiting for signature"}
      </button>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

function Field({ label, id, note, children }: { label: string; id: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children}
      {note && <p className="text-xs text-fg-subtle">{note}</p>}
    </div>
  );
}

const USE_WORDS: Record<string, string> = { compare: "comparisons", show_numbers: "numbers", show_pictures: "pictures", pdf: "PDF" };

function RecordedRow({ r, onChange }: { r: ManagedReference; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const expired = !!r.rights_expires_at && new Date(r.rights_expires_at) < new Date();
  const state = r.rights_status === "revoked" ? "Withdrawn" : r.rights_status === "pending" ? "Waiting for signature" : expired ? "Ended" : "In the library";
  return (
    <li className="panel space-y-1 p-4 text-sm">
      <p className="font-medium">
        {r.reference_athletes?.display_name ?? "Reference"} <span className="ml-1 font-normal text-fg-muted">· {state}</span>
      </p>
      <p className="text-fg-muted">
        {r.permitted_use.map((u) => USE_WORDS[u] ?? u).join(", ") || "nothing"} · {r.rights_expires_at ? `until ${new Date(r.rights_expires_at).toLocaleDateString()}` : "no end date"}
      </p>
      <p className="text-xs text-fg-subtle">
        {r.source}
        {r.licence_ref ? ` · ${r.licence_ref}` : ""}
      </p>
      {r.rights_status !== "revoked" && (
        <button
          type="button"
          className="btn btn-ghost mt-2"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Withdraw this permission? The reference disappears for everyone at once.")) return;
            setBusy(true);
            try {
              await withdrawReference(r.id);
              onChange();
            } finally {
              setBusy(false);
            }
          }}
        >
          Withdraw
        </button>
      )}
    </li>
  );
}
