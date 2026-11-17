// What the screen shows of a stored result, without em dashes. The owner, 2026-11-17: "This em dash
// itself gives a clear indicator of being AI generated completely and doesn't feel genuine."
// The app's own copy is written without them; the analysis's own sentences (a strength, a reason,
// a capture check) stay exactly as stored, since the result must stay byte-identical to the locked
// front-foot build, and are changed here only on their way to the screen, the print layout and
// the PDF. A dash standing alone for "no value" becomes an en dash.

/** One piece of text: " — " joins two clauses with a comma; a lone "—" (no value) becomes "–". */
export const undash = (s: string): string => (s.trim() === "—" ? "–" : s.replace(/\s*—\s*/g, ", "));

/** Every string in a value (a stored result), undashed; numbers, flags and structure unchanged. */
export function forDisplay<T>(v: T): T {
  if (typeof v === "string") return undash(v) as T;
  if (Array.isArray(v)) return v.map(forDisplay) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forDisplay(x)])) as T;
  return v;
}
