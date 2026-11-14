"use client";

import { ANALYSIS_LEVELS, FOCUS_AREAS, type FocusAreaId, type LocalProfile } from "@/lib/store";

/**
 * What the batter can choose before an analysis: the level the report is written at, and,
 * optionally, the areas they care about. Neither changes what is measured. The level changes
 * the words now; focus areas are saved with the analysis.
 */
export function AnalysisOptions({ profile, onChange }: { profile: LocalProfile; onChange: (next: LocalProfile) => void }) {
  const level = profile.level;
  const picked = new Set<FocusAreaId>(profile.focusAreas ?? []);
  const toggle = (id: FocusAreaId) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...profile, focusAreas: FOCUS_AREAS.map((a) => a.id).filter((a) => next.has(a)) });
  };
  const said = ANALYSIS_LEVELS.find((l) => l.id === level)?.says ?? "Not chosen: the wording follows the age in your profile.";

  return (
    <section aria-labelledby="options-h" className="rounded-lg border border-line p-4">
      <h2 id="options-h" className="font-semibold">Analysis level</h2>
      <div role="radiogroup" aria-labelledby="options-h" className="mt-3 grid grid-cols-3 gap-2">
        {ANALYSIS_LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            onClick={() => onChange({ ...profile, level: l.id })}
            className={`min-h-11 rounded-md border px-2 text-sm font-medium transition-colors duration-150 ${level === l.id ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-fg-muted" aria-live="polite">{said}</p>
      <p className="mt-1 text-xs text-fg-subtle">The measurement is the same at every level. The level changes the words and how many checks the report lists first.</p>

      <details className="mt-4 border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">
          <span>
            Focus areas <span className="font-normal text-fg-subtle">(optional{picked.size ? `, ${picked.size} chosen` : ""})</span>
          </span>
          <span className="text-fg-subtle" aria-hidden>›</span>
        </summary>
        <ul className="mt-2 flex flex-wrap gap-2">
          {FOCUS_AREAS.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={picked.has(a.id)}
                onClick={() => toggle(a.id)}
                className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors duration-150 ${picked.has(a.id) ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-fg-subtle">
          Saved with your analysis. Your report lists these areas first. Everything is still checked, and a bigger issue outside them is still shown.
        </p>
      </details>
    </section>
  );
}
