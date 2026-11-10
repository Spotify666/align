"use client";

import { useEffect, useState } from "react";
import type { AnalysisResult } from "@/engine/result";
import { contactSensitivity, type ContactSensitivity } from "@/engine/sensitivity";
import type { AnalysisPayload, CaptureObservation } from "@/engine/types";
import { SHOT_DISPLAY } from "@/engine/classify";

const OUTCOME: Record<AnalysisResult["action"]["outcome"], (name: string) => string> = {
  accepted: (n) => `Confirmed as a ${n}, so it was graded.`,
  recognised_other_supported: () => "Looks like another shot Aline grades. It wasn't graded as this one.",
  recognised_unsupported: () => "Another shot, which Aline doesn't grade yet. Nothing was graded.",
  unknown_action: () => "Not a movement Aline recognises as this shot. Nothing was graded.",
  ambiguous: () => "The movement fits more than one shot. Nothing was graded.",
  insufficient_evidence: () => "Not enough was seen to decide the shot. Nothing was graded.",
  capture_failed: () => "The recording couldn't be analysed.",
};

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "not assessed" : `${Math.round(x * 100)}%`);

/**
 * How sure each layer of the analysis is, kept apart: a clear recording doesn't make the shot
 * certain, and a certain shot doesn't make every measure certain. Also what was not claimed.
 */
export function ResultPanel({ result: r, payload, obs }: { result: AnalysisResult; payload?: AnalysisPayload; obs?: CaptureObservation }) {
  // Would the answer be the same with contact a moment earlier or later? Worked out after the
  // page has drawn (two more runs of the analysis), so opening a report never waits on it.
  const [steady, setSteady] = useState<ContactSensitivity | null>(null);
  useEffect(() => {
    if (!payload || !obs) return;
    const t = setTimeout(() => {
      try {
        setSteady(contactSensitivity(obs, payload, r));
      } catch {
        setSteady(null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [payload, obs, r]);
  const found = r.events.filter((e) => e.state !== "missing");
  const shaky = found.filter((e) => e.stable === false || e.state === "inferred");
  const rows: Array<[string, string, string]> = [
    ["Recording", pct(r.confidence.capture), r.capture.timebase?.issues[0] ?? (r.capture.status === "pass" ? "Every recording check passed." : "See the recording checks.")],
    ["Batter tracked", pct(r.confidence.subject), `${Math.round(r.subject.bodyCoverage * 100)}% of frames${r.subject.viewNote ? `. ${r.subject.viewNote}` : ""}`],
    ["Shot identified", pct(r.confidence.action), r.action.probability === null ? "No shot was named." : `${r.action.display ?? "A shot"}${r.action.basis === "body_only" ? ", from the body alone" : ""}. A prototype figure, not yet calibrated.`],
    [
      "Moments found",
      r.confidence.events ? `${found.length} of ${r.events.length}` : "none",
      r.confidence.events ? (shaky.length ? `Approximate: ${shaky.map((e) => e.label).join(", ")}.` : "Each one seen directly.") : "No movement phases in this result.",
    ],
    ["Measures", r.confidence.metrics ? `${r.confidence.metrics.measured} of ${r.confidence.metrics.measured + r.confidence.metrics.withheld}` : "none", r.confidence.metrics?.withheld ? "The rest were withheld: see below." : r.confidence.metrics ? "All reported." : "None reported."],
  ];
  if (steady)
    rows.push([
      "Answer steady",
      steady.holds ? "yes" : "borderline",
      steady.holds
        ? "The same answer wherever contact falls within how sure its timing is."
        : `Placing contact a moment earlier or later (within how sure its timing is, about ${steady.bandS} s) would change this answer. Tap the ball and the bat on a few frames to pin contact down.`,
    ]);
  const alts = r.action.alternatives.filter((a) => a.label !== "unknown").slice(0, 3);
  return (
    <section aria-labelledby="result-h" className="space-y-3">
      <h3 id="result-h" className="text-lg font-semibold">How sure each part is</h3>
      <p className="text-sm text-fg-muted">{OUTCOME[r.action.outcome](r.category.name)}</p>
      <div className="card overflow-x-auto px-4">
        <table className="w-full text-sm">
          <caption className="sr-only">Confidence of each layer of the analysis</caption>
          <tbody className="divide-y divide-line">
            {rows.map(([name, value, note]) => (
              <tr key={name}>
                <th scope="row" className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">{name}</th>
                <td className="num whitespace-nowrap py-2.5 pr-3">{value}</td>
                <td className="py-2.5 text-fg-muted">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alts.length > 1 && (
        <p className="text-sm text-fg-muted">
          Shots considered: {alts.map((a) => `${SHOT_DISPLAY[a.label].toLowerCase()} ${Math.round(a.probability * 100)}%`).join(", ")}.
        </p>
      )}
      {r.withheld.length > 0 && (
        <details className="rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium">
            Not claimed in this report ({r.withheld.length})<span className="text-fg-subtle" aria-hidden>›</span>
          </summary>
          <ul className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
            {r.withheld.map((w) => (
              <li key={w.claim}>
                <span className="font-medium">{w.claim}.</span> <span className="text-fg-muted">{w.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="num text-xs text-fg-subtle">
        Engine {r.versions.engine} · {r.versions.category} · {r.versions.metrics} · {r.versions.classifier} · {r.versions.uncertainty_model} · result {r.reproducibility.result_hash.slice(0, 8)}
      </p>
    </section>
  );
}
