"use client";
// Delete a model, after its passcode (DELETE_PASSCODE in lib/pose-models.ts). Used on the
// models list and in the editor, so both ask the same way.

import { useId, useState } from "react";
import { Trash } from "@/components/icons";
import { deleteModel, passcodeOk } from "@/lib/pose-models";

export function DeleteModel({ id, name, onDeleted }: { id: string; name: string; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const field = useId();

  if (!asking)
    return (
      <button type="button" className="btn btn-quiet" onClick={() => setAsking(true)}>
        <Trash size={16} /> Delete
      </button>
    );

  return (
    <form
      className="flex basis-full flex-wrap items-end gap-2"
      aria-label={`Delete ${name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!passcodeOk(code)) return setWrong(true);
        deleteModel(id);
        onDeleted();
      }}
    >
      <label htmlFor={field} className="block text-sm">
        <span className="text-fg-muted">Passcode to delete &ldquo;{name}&rdquo;</span>
        <input id={field} type="password" inputMode="numeric" autoComplete="off" autoFocus className="field mt-1 w-32"
          value={code} onChange={(e) => { setCode(e.target.value); setWrong(false); }} />
      </label>
      <button className="btn btn-ghost" disabled={!code}>Delete</button>
      <button type="button" className="btn btn-quiet" onClick={() => { setAsking(false); setCode(""); setWrong(false); }}>Cancel</button>
      {wrong && <p role="alert" className="basis-full text-sm text-bad">Wrong passcode. Nothing was deleted.</p>}
    </form>
  );
}
