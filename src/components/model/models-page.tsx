"use client";
// Shot models (/models): a person's own picture of a correct shot, joint by joint. This page
// lists the ones on this device, starts a new one, reads one back from its text, and says which
// one new checks are set against.

import { Hold } from "@/components/common/hold";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MOMENTS, type ModelAngles, type PoseModel } from "@/engine/pose-model";
import type { Handedness, TargetShot } from "@/engine/types";
import { chooseModel, chosenModelId, importModel, listModels, newModel, saveModel } from "@/lib/pose-models";
import { loadProfile } from "@/lib/store";
import { DeleteModel } from "./delete-model";

const SHOT_LABEL: Record<TargetShot, string> = { front_foot_defence: "Front-foot defence", back_foot_defence: "Back-foot defence" };
const ANGLES: Array<{ id: ModelAngles; label: string; says: string }> = [
  { id: "both", label: "Side and front", says: "Place every joint from both angles: a full 3D pose, checked against clips from either position." },
  { id: "side", label: "Side only", says: "Place joints from the side: checked against side-on clips only." },
  { id: "front", label: "Front only", says: "Place joints from the bowler's end: checked against clips filmed along the pitch only." },
];

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="text-sm text-fg-muted">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${value === o.id ? "border-brand bg-brand-soft text-fg" : "border-line-strong text-fg-muted"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const HOW: Array<[string, string]> = [
  ["Holds a pose at each moment", "It holds where each joint is at contact (and, if you add them, when the foot lands and at the top of the backlift), from the side, the front or both."],
  ["Compares what one camera can read", "A clip is compared on what one camera can truly read: where the head, shoulder, knee and hands sit over the feet, how the knees bend, how the body leans. An elbow's bend seen end-on is left out; its height is used."],
  ["Never decides the shot", "It never decides which shot was played. If Aline can't confirm the shot, or it was filmed from a position the model wasn't placed from, the model isn't applied and the report says so."],
  ["Stays on this device", "It stays on this device. Its text can be saved, shared and read back anywhere."],
];

export function ModelsPage() {
  const router = useRouter();
  const [models, setModels] = useState<PoseModel[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "new" | "import">("list");
  const [name, setName] = useState("");
  const [shot, setShot] = useState<TargetShot>("front_foot_defence");
  const [side, setSide] = useState<Handedness>("right");
  const [angles, setAngles] = useState<ModelAngles>("both");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    // The models live in this browser: read them once it is there.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModels(listModels());
    setChosen(chosenModelId());
    setSide(loadProfile().handedness);
  }, []);

  const use = (id: string | null) => {
    chooseModel(id);
    setChosen(id);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-3">
        <h1 className="display text-4xl sm:text-5xl">Your own model of a shot.</h1>
        <p className="max-w-2xl text-lg text-fg-muted">
          Place each joint to show a correct shot. Check your shots against it.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn btn-primary" onClick={() => { setMode("new"); setProblem(null); }}>New model</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode("import"); setProblem(null); }}>Import from text</button>
        </div>
      </header>

      {mode === "new" && (
        <form className="panel space-y-5 p-5 sm:p-6" aria-labelledby="new-h"
          onSubmit={(e) => {
            e.preventDefault();
            const m = saveModel(newModel({ name: name || `My ${SHOT_LABEL[shot].toLowerCase()}`, shot, battingSide: side, angles, heightCm: loadProfile().heightCm ?? null }));
            router.push(`/models/edit?m=${m.id}`);
          }}>
          <h2 id="new-h" className="display text-2xl">A new model</h2>
          <label className="block text-sm">
            <span className="text-fg-muted">Name</span>
            <input className="field mt-1" value={name} maxLength={80} placeholder={`My ${SHOT_LABEL[shot].toLowerCase()}`} onChange={(e) => setName(e.target.value)} />
          </label>
          <Choice label="The shot" value={shot} onChange={setShot} options={[{ id: "front_foot_defence", label: "Front-foot defence" }, { id: "back_foot_defence", label: "Back-foot defence" }]} />
          <Choice label="Made for a batter who bats" value={side} onChange={setSide} options={[{ id: "right", label: "Right-handed" }, { id: "left", label: "Left-handed" }]} />
          <div>
            <Choice label="Placed from" value={angles} onChange={setAngles} options={ANGLES} />
            <p className="mt-2 text-sm text-fg-muted" aria-live="polite">{ANGLES.find((a) => a.id === angles)!.says}</p>
          </div>
          <p className="text-sm text-fg-subtle">
            It starts from Aline&apos;s textbook pose at contact, for you to move. A model is never flipped for the other batting side: make one for each.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary">Start placing joints</button>
            <button type="button" className="btn btn-quiet" onClick={() => setMode("list")}>Cancel</button>
          </div>
        </form>
      )}

      {mode === "import" && (
        <form className="panel space-y-4 p-5 sm:p-6" aria-labelledby="import-h"
          onSubmit={(e) => {
            e.preventDefault();
            const r = importModel(text);
            if (!r.ok) return setProblem(r.problem);
            router.push(`/models/edit?m=${r.model.id}`);
          }}>
          <h2 id="import-h" className="display text-2xl">Import from text</h2>
          <label className="block text-sm">
            <span className="text-fg-muted">Paste a model&apos;s text (what &quot;Export as text&quot; gave)</span>
            <textarea className="field num mt-1 h-48 text-xs" value={text} onChange={(e) => { setText(e.target.value); setProblem(null); }} />
          </label>
          {problem && <p role="alert" className="text-sm text-bad">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!text.trim()}>Rebuild the model</button>
            <button type="button" className="btn btn-quiet" onClick={() => setMode("list")}>Cancel</button>
          </div>
        </form>
      )}

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="display text-2xl">On this device</h2>
        {models === null ? (
          <p className="text-fg-subtle">Reading your models…</p>
        ) : models.length === 0 ? (
          <p className="panel p-5 text-fg-muted">None yet.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {models.map((m) => (
                <li key={m.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-sm text-fg-muted">
                      {SHOT_LABEL[m.shot]}, {m.battingSide}-handed, {m.angles === "both" ? "side and front" : `${m.angles} only`}; {MOMENTS.filter((x) => m.moments[x.id]).length === 1 ? "contact" : `${MOMENTS.filter((x) => m.moments[x.id]).length} moments`}
                    </p>
                    {chosen === m.id && <p className="mt-1 text-sm font-medium text-brand">Your shots are checked against this one</p>}
                  </div>
                  <Link href={`/models/edit?m=${m.id}`} className="btn btn-ghost">Open</Link>
                  <button type="button" className="btn btn-quiet" onClick={() => use(chosen === m.id ? null : m.id)}>{chosen === m.id ? "Stop using" : "Use for my checks"}</button>
                  <DeleteModel id={m.id} name={m.name} onDeleted={() => { setModels(listModels()); setChosen(chosenModelId()); }} />
                </li>
              ))}
            </ul>
            <p className="text-sm text-fg-subtle">
              {chosen ? "Your shots are checked against your model." : "No model in use: Aline's own ranges."}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="how-h" className="space-y-1 border-t border-line pt-8">
        <h2 id="how-h" className="display text-2xl">What a model does, and doesn&apos;t</h2>
        <ul className="pt-2">
          {HOW.map(([short, full]) => (
            <li key={short}>
              <Hold more={<p>{full}</p>}>{short}</Hold>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
