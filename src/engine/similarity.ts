// Movement similarity between two shots (`aline.similarity/1`): whether they can be compared
// at all, and if so how alike they are in each part of the body, with how much of each part
// both shots carry. Built on the shot signature and its match (`signature.ts`): the overall
// score is that match, unchanged.
//
// Comparable only when both are the same shot, read by the same version of the signature, from
// the same kind of camera position, with at least three measures in common. Otherwise there is
// no score at all, only the reasons and what would make the two comparable. Left-handed and
// right-handed batters are compared in the signature's own frame (every measure is taken
// toward the bowler); no recording is ever flipped.

import { matchSignatures, SIGNATURE_IDS, SIGNATURE_VERSION, type Match, type ShotSignature } from "./signature";

export const SIMILARITY_SCHEMA = "aline.similarity/1" as const;

export const SIMILARITY_DOMAINS = [
  { id: "alignment", name: "The line", ids: ["line_head", "line_shoulder", "line_knee", "line_held"] },
  { id: "timing", name: "Timing", ids: ["sync_spread"] },
  { id: "footwork", name: "Footwork and base", ids: ["stride_length", "foot_spread", "front_knee_flexion", "back_knee_extension"] },
  { id: "balance", name: "Balance", ids: ["trunk_inclination", "weight_forward", "balance_over_feet"] },
  { id: "bat_path", name: "Hands and bat", ids: ["hands_ahead_of_knee", "bat_angle_contact"] },
] as const;
export type SimilarityDomainId = (typeof SIMILARITY_DOMAINS)[number]["id"];

export interface DomainSimilarity {
  name: string;
  /** 0–100: the mean likeness of the measures both shots have in this part; null when they share none. */
  score: number | null;
  /**
   * 0–1: how much of this part the comparison rests on (measures both shots have, out of the
   * part's measures; Timing also counts the line's path into contact). Low means few measures.
   */
  confidence: number;
  /** How many measures it rests on. */
  measures: number;
}

export interface Similarity {
  schema: typeof SIMILARITY_SCHEMA;
  comparable: boolean;
  /** Why not, each with what would make the two comparable. Empty when comparable. */
  reasons: string[];
  domains: Record<SimilarityDomainId, DomainSimilarity>;
  /** The overall match (0–100); null when not comparable. */
  overall: number | null;
  /** The match underneath, measure by measure, for the detail table. */
  match: Match;
}

/** Why two shots can't be compared, each with what would make them comparable. */
export function comparabilityReasons(you: ShotSignature, them: ShotSignature, match: Match): string[] {
  const out: string[] = [];
  if (you.shot !== them.shot) out.push("They are different shots. Compare with the same shot.");
  if (you.version !== them.version) out.push("They were measured by different versions of Aline. Check the shot again to compare.");
  if (you.axis && them.axis && you.axis !== them.axis)
    out.push(them.axis === "sideways" ? "Filmed from one end of the pitch. Film from the bowler's end to compare with it." : "Filmed side-on. Film side-on to compare with it.");
  if (!out.length && match.score === null) out.push("Too few measures in common. A clip that shows the whole batter through contact gives more.");
  return out;
}

function domains(m: Match): Record<SimilarityDomainId, DomainSimilarity> {
  const out = {} as Record<SimilarityDomainId, DomainSimilarity>;
  for (const d of SIMILARITY_DOMAINS) {
    const sims = m.parts.filter((p) => (d.ids as readonly string[]).includes(p.id)).map((p) => p.similarity);
    let total: number = d.ids.length;
    if (d.id === "timing") {
      total += 1;
      if (m.path !== null) sims.push(m.path);
    }
    out[d.id] = {
      name: d.name,
      score: sims.length ? Math.round((100 * sims.reduce((a, b) => a + b, 0)) / sims.length) : null,
      confidence: Math.round((sims.length / total) * 100) / 100,
      measures: sims.length,
    };
  }
  return out;
}

export function similarity(you: ShotSignature, them: ShotSignature): Similarity {
  const match = matchSignatures(you, them);
  const reasons = comparabilityReasons(you, them, match);
  const comparable = reasons.length === 0;
  const none = Object.fromEntries(SIMILARITY_DOMAINS.map((d) => [d.id, { name: d.name, score: null, confidence: 0, measures: 0 }])) as Record<SimilarityDomainId, DomainSimilarity>;
  return { schema: SIMILARITY_SCHEMA, comparable, reasons, domains: comparable ? domains(match) : none, overall: comparable ? match.score : null, match };
}

/**
 * The batter's own usual shot: the median of each measure (and of each point of the line's
 * path) over their earlier signatures filmed the same way. The fallback reference when there
 * is nothing else to compare with. Null with fewer than three such shots.
 */
export function usualSignature(sigs: ShotSignature[], axis: ShotSignature["axis"]): ShotSignature | null {
  const same = sigs.filter((s) => s.axis === axis && s.version === SIGNATURE_VERSION && s.media === "video");
  if (same.length < 3) return null;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
  };
  const values: ShotSignature["values"] = {};
  for (const id of SIGNATURE_IDS) {
    const xs = same.map((s) => s.values[id]).filter((v): v is number => v !== undefined);
    if (xs.length >= 3) values[id] = median(xs);
  }
  const withPath = same.filter((s) => s.path);
  let path: ShotSignature["path"];
  if (withPath.length >= 3) {
    const first = withPath[0]!.path!;
    path = Object.fromEntries(
      (Object.keys(first) as Array<keyof typeof first>).map((part) => [part, first[part].map((_, k) => median(withPath.map((s) => s.path![part][k]!)))]),
    ) as ShotSignature["path"];
  }
  return { version: SIGNATURE_VERSION, shot: "front_foot_defence", axis, media: "video", values, ...(path ? { path } : {}) };
}
