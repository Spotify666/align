"use client";
// The reference library: everything a shot can be compared with, each with where it comes from.
// Your own (your usual, built from your shots on this device), made by Aline (not a real
// player), from research (numbers only, licence not yet confirmed) and the library's licensed
// references (shown only once their rights are recorded: the database hides the rest).

import Link from "next/link";
import { useEffect, useState } from "react";
import { signatureOf, type ShotSignature } from "@/engine/signature";
import { usualSignature } from "@/engine/similarity";
import { builtInReferences, libraryProvenance, PROVENANCE, type Provenance } from "@/lib/compare";
import { listLibraryShots, type LibraryShot } from "@/lib/cloud";
import { listAnalyses } from "@/lib/store";

interface Card {
  id: string;
  name: string;
  covers: string;
  measures: number;
  provenance: Provenance;
}

const VIEW = (s: ShotSignature) => (s.axis === "sideways" ? "filmed from either end" : s.axis === "forward" ? "filmed side-on" : "camera position not known");
const measuresOf = (s: ShotSignature) => Object.keys(s.values).length + (s.path ? 1 : 0);

export function LibraryPage() {
  const [yours, setYours] = useState<Card[] | null>(null);
  const [library, setLibrary] = useState<Card[] | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const builtIn: Card[] = builtInReferences().map((r) => ({
    id: r.id,
    name: r.name,
    covers: `Front-foot defence, ${VIEW(r.signature)}`,
    measures: measuresOf(r.signature),
    provenance: r.provenance,
  }));

  useEffect(() => {
    let alive = true;
    listAnalyses()
      .then((all) => {
        const sigs = all.map((a) => signatureOf(a.payload, null)).filter((s): s is ShotSignature => !!s);
        const cards: Card[] = [];
        for (const axis of ["forward", "sideways"] as const) {
          const u = usualSignature(sigs, axis);
          const n = sigs.filter((s) => s.axis === axis && s.media === "video").length;
          if (u) cards.push({ id: `usual_${axis}`, name: "Your usual", covers: `Front-foot defence, ${VIEW(u)}: the middle of your ${n} shots`, measures: measuresOf(u), provenance: PROVENANCE.usual });
        }
        if (alive) setYours(cards);
      })
      .catch(() => alive && setYours([]));
    listLibraryShots()
      .then(
        (rows: LibraryShot[]) =>
          alive &&
          setLibrary(
            rows.map((r) => ({
              id: r.id,
              name: r.reference_athletes?.display_name ?? "Library reference",
              covers: `${r.shot === "back_foot_defence" ? "Back-foot" : "Front-foot"} defence, ${VIEW(r.signature)}`,
              measures: measuresOf(r.signature),
              provenance: r.reference_athletes?.kind === "generated" ? PROVENANCE.generated : libraryProvenance(r.source, r.licence_ref, r.rights_expires_at),
            })),
          ),
      )
      .catch(() => {
        if (!alive) return;
        setLibrary([]);
        setLibraryError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <h1 className="display text-4xl sm:text-5xl">Reference library</h1>
        <p className="text-fg-muted">What a shot can be compared with, and where each one comes from. Numbers only: no reference carries anyone&apos;s video.</p>
      </header>

      <Group title="Yours" note="Built from your own shots on this device. Comparing with your usual shows what changed.">
        {yours === null ? (
          <p className="text-sm text-fg-subtle">Reading your shots…</p>
        ) : yours.length ? (
          yours.map((c) => <CardRow key={c.id} c={c} />)
        ) : (
          <p className="text-sm text-fg-muted">
            Your usual appears once you have three confirmed front-foot defences filmed the same way. <Link href="/check" className="font-medium underline underline-offset-4">Check a shot</Link>
          </p>
        )}
      </Group>

      <Group title="Made by Aline and from research">
        {builtIn.map((c) => (
          <CardRow key={c.id} c={c} />
        ))}
      </Group>

      <Group title="Licensed references" note="A coach's model or a player who signed a licence. One appears only once its rights are recorded, and disappears when they end.">
        {library === null ? (
          <p className="text-sm text-fg-subtle">Opening the library…</p>
        ) : library.length ? (
          library.map((c) => <CardRow key={c.id} c={c} />)
        ) : (
          <p className="text-sm text-fg-muted">{libraryError ? "The library couldn't be reached. Your own and Aline's references still work." : "None yet."}</p>
        )}
      </Group>

      <p className="text-sm text-fg-muted">
        To compare a shot, open its report and then Comparison. Players who share a shot from their report appear there too, once you are signed in.
      </p>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {note && <p className="text-sm text-fg-muted">{note}</p>}
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function CardRow({ c }: { c: Card }) {
  return (
    <li className="panel p-4">
      <p className="font-medium">{c.name}</p>
      <p className="text-sm text-fg-muted">{c.covers} · {c.measures === 1 ? "1 measure" : `${c.measures} measures`}</p>
      <p className="mt-1 text-xs text-fg-subtle">{c.provenance.label}.</p>
    </li>
  );
}
