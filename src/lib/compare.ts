// What a shot can be compared with: the textbook model (filmed side-on and from the bowler's
// end), professionals (the sideways line), the player's own earlier shots, and shots other
// players chose to share. Built-in references are made by the same engine that reads the
// player's own clips, so a match compares like with like.

import { PRO_SIDEWAYS, type Match, type ShotSignature } from "@/engine/signature";
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

/** The parts of the body a match is broken into: each is the measures it rests on. */
export const DOMAINS = [
  { id: "line", name: "The line", ids: ["line_head", "line_shoulder", "line_knee", "line_held"] },
  { id: "timing", name: "Timing", ids: ["sync_spread"] },
  { id: "footwork", name: "Footwork and base", ids: ["stride_length", "foot_spread", "front_knee_flexion", "back_knee_extension"] },
  { id: "balance", name: "Balance", ids: ["trunk_inclination", "weight_forward", "balance_over_feet"] },
  { id: "bat", name: "Hands and bat", ids: ["hands_ahead_of_knee", "bat_angle_contact"] },
] as const;

export interface DomainMatch {
  id: (typeof DOMAINS)[number]["id"];
  name: string;
  /** 0–100: the mean likeness of the measures both shots have in this part; null when they share none. */
  score: number | null;
  /** How many measures it rests on (the line's path counts as one, under Timing). */
  measures: number;
}

/**
 * A match broken down by part of the body. Each part is the plain mean of its measures'
 * likeness (the same likeness the overall match uses); a part with no measure in common says
 * so instead of guessing. Presentation only: the overall match is unchanged.
 */
export function domainsOf(m: Match): DomainMatch[] {
  return DOMAINS.map((d) => {
    const sims = m.parts.filter((p) => (d.ids as readonly string[]).includes(p.id)).map((p) => p.similarity);
    if (d.id === "timing" && m.path !== null) sims.push(m.path);
    return { id: d.id, name: d.name, score: sims.length ? Math.round((100 * sims.reduce((a, b) => a + b, 0)) / sims.length) : null, measures: sims.length };
  });
}

/** A likeness in words, for readers who get no numbers. */
export const likeness = (score: number) => (score >= 85 ? "close" : score >= 65 ? "some way off" : "far off");

/** Why two shots can't be compared, and what would make them comparable; null when they can. */
export function notComparable(you: ShotSignature, them: ShotSignature, match: Match): string | null {
  if (match.score !== null) return null;
  if (you.axis && them.axis && you.axis !== them.axis)
    return them.axis === "sideways" ? "Filmed from one end of the pitch. Film from the bowler's end to compare with it." : "Filmed side-on. Film side-on to compare with it.";
  return "Too few measures in common. A clip that shows the whole batter through contact gives more.";
}
