"use client";
// How long each analysis step takes on this device. Logged to the console ("[align:time]")
// so the real-media evaluation can time every step as a phone would.

const starts = new Map<string, number>();
const totals = new Map<string, number>();

/** Start timing a step. */
export function timeStart(label: string): void {
  starts.set(label, performance.now());
}

/** End a step started with timeStart, log it, and return its duration (ms). */
export function timeEnd(label: string): number {
  const t0 = starts.get(label);
  if (t0 === undefined) return 0;
  starts.delete(label);
  const ms = performance.now() - t0;
  console.info(`[align:time] ${label} ${Math.round(ms)} ms`);
  return ms;
}

/** Add to a running total (e.g. time inside the pose model across a pass). */
export function timeAdd(label: string, ms: number): void {
  totals.set(label, (totals.get(label) ?? 0) + ms);
}

/** Log and clear the running totals. */
export function timeFlush(): void {
  for (const [label, ms] of totals) console.info(`[align:time] ${label} ${Math.round(ms)} ms (total)`);
  totals.clear();
}
