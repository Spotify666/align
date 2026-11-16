"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PoseModel } from "@/engine/pose-model";
import { getModel } from "@/lib/pose-models";
import { ModelEditor } from "./model-editor";

/** Opens the model named in the address (?m=…) from this device. */
export function EditClient() {
  const id = useSearchParams().get("m");
  const [model, setModel] = useState<PoseModel | null | undefined>(undefined);
  useEffect(() => {
    // The model is in this browser's storage: read it once the page is there.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModel(getModel(id));
  }, [id]);

  if (model === undefined) return <p className="mx-auto max-w-4xl px-4 py-10 text-fg-subtle sm:px-6">Opening the model…</p>;
  if (model === null)
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6">
        <h1 className="display text-3xl">That model isn&apos;t on this device.</h1>
        <p className="text-fg-muted">Models are kept in the browser they were made in. If you have its text, it can be rebuilt.</p>
        <Link href="/models" className="btn btn-primary">Shot models</Link>
      </div>
    );
  return <ModelEditor key={model.id} initial={model} />;
}
