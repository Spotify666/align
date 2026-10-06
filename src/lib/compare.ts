// What a shot can be compared with: the textbook model (filmed side-on and from the bowler's
// end), professionals (the sideways line), the player's own earlier shots, and shots other
// players chose to share. Built-in references are made by the same engine that reads the
// player's own clips, so a match compares like with like.

import { analyze } from "@/engine/analyze";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS, ffdScript } from "@/engine/fixtures";
import { PRO_SIDEWAYS, signatureOf, type ShotSignature } from "@/engine/signature";

export interface Reference {
  id: string;
  name: string;
  note: string;
  kind: "model" | "pro" | "you" | "player";
  signature: ShotSignature;
  when?: string;
}

let cache: Reference[] | null = null;

/** The textbook model (both camera positions) and the professionals' sideways line. */
export function builtInReferences(): Reference[] {
  if (cache) return cache;
  const base = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!.options;
  const textbook = (view: "side_on" | "front_on") => {
    const o = generate({ ...base, script: ffdScript(), id: `textbook_${view}`, view, seed: 5 });
    const sig = signatureOf(analyze(o, { analysisId: `textbook_${view}`, createdAt: "2026-10-06T00:00:00.000Z" }), o.media.fps);
    // The model is a body model: its bat is drawn, not measured.
    if (sig) delete sig.values.bat_angle_contact;
    return sig;
  };
  const out: Reference[] = [];
  for (const view of ["side_on", "front_on"] as const) {
    const sig = textbook(view);
    if (sig)
      out.push({
        id: `textbook_${view}`,
        name: "Textbook defence",
        note: view === "side_on" ? "The coaching model, filmed side-on" : "The coaching model, filmed from the bowler's end",
        kind: "model",
        signature: sig,
      });
  }
  out.push({ id: "pros_sideways", name: "International batters", note: "The line of 323 professional defences, seen from either end of the pitch", kind: "pro", signature: PRO_SIDEWAYS });
  cache = out;
  return out;
}
