// The textbook model's shot signatures, as the engine reads them (side-on and from the
// bowler's end). Computing them takes about a second of a phone's main thread, so they are
// computed once at build time into textbook-refs.json:
//   node scripts/textbook-refs.mjs > src/lib/textbook-refs.json
// tests/textbook-refs.test.ts fails whenever the engine would read them differently.

import { analyze } from "@/engine/analyze";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS, ffdScript } from "@/engine/fixtures";
import { signatureOf, type ShotSignature } from "@/engine/signature";

export type TextbookView = "side_on" | "front_on";

export function computeTextbookSignatures(): Partial<Record<TextbookView, ShotSignature>> {
  const base = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!.options;
  const out: Partial<Record<TextbookView, ShotSignature>> = {};
  for (const view of ["side_on", "front_on"] as const) {
    const o = generate({ ...base, script: ffdScript(), id: `textbook_${view}`, view, seed: 5 });
    const sig = signatureOf(analyze(o, { analysisId: `textbook_${view}`, createdAt: "2026-10-06T00:00:00.000Z" }), o.media.fps);
    // The model is a body model: its bat is drawn, not measured.
    if (sig) delete sig.values.bat_angle_contact;
    if (sig) out[view] = sig;
  }
  return out;
}
