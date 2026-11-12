"use client";

import type { TargetShot } from "@/engine/types";

const CHOICES: Array<{ id: TargetShot | null; title: string; note: string }> = [
  { id: null, title: "Aline tells", note: "Aline checks for a front-foot defence, and for a back-foot defence if it looks like one. These two are graded today." },
  { id: "front_foot_defence", title: "Front foot", note: "Front-foot defence. Full ball: step forward." },
  { id: "back_foot_defence", title: "Back foot", note: "Back-foot defence. Short ball: step back." },
];

/**
 * Which shot is being checked. Optional: left on "Aline tells", the recording is checked as a
 * front-foot defence and, when that result itself points there, as a back-foot defence
 * (`engine/identify.ts`). `value` is the shot the batter named, or null.
 */
export function ShotChooser({ value, onChange }: { value: TargetShot | null; onChange: (shot: TargetShot | null) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">
        Which shot? <span className="font-normal text-fg-subtle">(optional)</span>
      </legend>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Shot to check">
        {CHOICES.map((c) => (
          <button
            key={c.title}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            onClick={() => onChange(c.id)}
            className={`min-h-11 rounded-full border px-2 text-sm font-medium transition-colors duration-150 ${value === c.id ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-fg-muted">{CHOICES.find((c) => c.id === value)?.note}</p>
    </fieldset>
  );
}
