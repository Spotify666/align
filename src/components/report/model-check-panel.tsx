"use client";
// A report set against the batter's own shot model (/models). Shown only when this device has
// a model. The choice is kept with the analysis; Aline's own result is never changed by it.

import Link from "next/link";
import { valueInWords, type ModelCheck, type PoseModel } from "@/engine/pose-model";

export function ModelCheckPanel({
  models, modelId, onChoose, check, model, numbers,
}: {
  models: PoseModel[];
  modelId: string | null;
  onChoose: (id: string | null) => void;
  check: ModelCheck | null;
  model: PoseModel | null;
  /** False at the simple reading level: words only. */
  numbers: boolean;
}) {
  if (!models.length) return null;
  return (
    <section aria-labelledby="model-h" className="panel p-5 sm:p-6">
      <h2 id="model-h" className="font-semibold">Your own model</h2>
      <label className="mt-3 block max-w-md text-sm">
        <span className="text-fg-muted">This shot is checked against</span>
        <select className="field mt-1" value={modelId ?? ""} onChange={(e) => onChoose(e.target.value || null)}>
          <option value="">Aline&apos;s own ranges</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>Your model: {m.name}</option>
          ))}
        </select>
      </label>

      {check && model && !check.applied && <p className="mt-3 text-fg-muted">{check.says}</p>}

      {check && model && check.applied && (
        <>
          <p className="mt-3 text-fg-muted">
            {check.matched} of {check.compared} checks match &quot;{model.name}&quot;, read from {check.plane === "side" ? "the side" : "the bowler's end"}. Aline decided the shot; your model decided what right looks like.
          </p>
          <details className="mt-3 border-t border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">
              <span>Each check against your model</span>
              <span className="text-fg-subtle" aria-hidden>+</span>
            </summary>
            {check.moments.map((m) => (
              <div key={m.id} className="pb-3">
                <h3 className="mt-2 text-sm text-fg-subtle">{m.label}: {m.matched} of {m.compared} match</h3>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${m.label}: each check`}>
                  <table className="mt-1 w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-fg-subtle">
                        <th className="py-2 pr-3 font-normal">Check</th>
                        {numbers && <th className="py-2 pr-3 font-normal">You</th>}
                        {numbers && <th className="py-2 pr-3 font-normal">Your model</th>}
                        <th className="py-2 font-normal">Reading</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((r) => (
                        <tr key={r.id} className="border-b border-line align-top last:border-0">
                          <td className="py-2 pr-3">{r.label}</td>
                          {numbers && <td className="num py-2 pr-3 text-fg-muted">{valueInWords(r, r.yours, model.heightCm)}</td>}
                          {numbers && <td className="num py-2 pr-3 text-fg-muted">{valueInWords(r, r.model, model.heightCm)}</td>}
                          <td className={`py-2 ${r.within === false ? "font-medium" : "text-fg-muted"}`}>
                            {r.within === null ? "Not seen by this camera" : r.within ? "Matches" : `${r.reads![0]!.toUpperCase()}${r.reads!.slice(1)} than your model`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="pb-3 text-xs text-fg-subtle">
              A check matches within {model.tolerance.angleDeg}° for an angle and {Math.round(model.tolerance.offset * 100)}% of the batter&apos;s height for a distance: the model&apos;s own setting.
            </p>
          </details>
        </>
      )}
      <p className="mt-3 text-sm">
        <Link href={model ? `/models/edit?m=${model.id}` : "/models"} className="inline-flex min-h-11 items-center underline underline-offset-4">{model ? "Open this model" : "Shot models"}</Link>
      </p>
    </section>
  );
}
