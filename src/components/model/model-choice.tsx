"use client";
// On "Check your shot": which model the next check is set against. Optional: without a choice
// (or without any model) a report uses Aline's own ranges, as before.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PoseModel } from "@/engine/pose-model";
import { chooseModel, chosenModelId, listModels } from "@/lib/pose-models";

export function ModelChoice() {
  const [models, setModels] = useState<PoseModel[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    // The models live in this browser: read them once it is there.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModels(listModels());
    setChosen(chosenModelId());
  }, []);

  if (!models.length)
    return (
      <p className="mt-3 border-t border-line pt-3 text-sm text-fg-muted">
        Have your own picture of a correct shot?{" "}
        <Link href="/models" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Build a shot model</Link>
      </p>
    );
  return (
    <div className="mt-3 border-t border-line pt-3">
      <label className="block text-sm">
        <span className="font-medium">Checked against</span> <span className="text-fg-subtle">(optional)</span>
        <select
          className="field mt-2"
          value={chosen ?? ""}
          onChange={(e) => {
            const id = e.target.value || null;
            chooseModel(id);
            setChosen(id);
          }}
        >
          <option value="">Aline&apos;s own ranges</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>Your model: {m.name}</option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-fg-subtle">
        Aline still decides which shot was played. A confirmed shot is then set against your model.{" "}
        <Link href="/models" className="underline underline-offset-4">Shot models</Link>
      </p>
    </div>
  );
}
