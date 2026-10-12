// What a shot can be compared with: the textbook model (filmed side-on and from the bowler's
// end), professionals (the sideways line), the player's own earlier shots, and shots other
// players chose to share. Built-in references are made by the same engine that reads the
// player's own clips, so a match compares like with like.

import { PRO_SIDEWAYS, type ShotSignature } from "@/engine/signature";
// Computed at build time (src/lib/textbook-refs.ts): the engine never runs for them on the phone.
import TEXTBOOK from "./textbook-refs.json";

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
  const textbook = TEXTBOOK as Partial<Record<"side_on" | "front_on", ShotSignature>>;
  const out: Reference[] = [];
  for (const view of ["side_on", "front_on"] as const) {
    const sig = textbook[view];
    if (sig)
      out.push({
        id: `textbook_${view}`,
        name: "Textbook defence",
        note: view === "side_on" ? "The coaching model, filmed side-on" : "The coaching model, filmed from the bowler's end",
        kind: "model",
        signature: structuredClone(sig),
      });
  }
  out.push({ id: "pros_sideways", name: "International batters", note: "The line of 323 professional defences, seen from either end of the pitch", kind: "pro", signature: PRO_SIDEWAYS });
  cache = out;
  return out;
}
