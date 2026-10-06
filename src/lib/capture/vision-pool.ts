"use client";
// A few workers that run the on-device models in parallel (phones have 6–8 cores; the page
// runs on one). They compute exactly what the page would: the same decoded frames, the same
// models and settings. Anything that fails here falls back to the page.

import type { Box } from "./pose";
import { joinParts, scanGrid, splitGrid, type ScanPart } from "./scan";

export type WorkerReq =
  | { id: number; type: "warm" }
  | { id: number; type: "scan"; file: File; limit: number; aspect: number; from: number; to: number }
  | { id: number; type: "people"; image: ImageData }
  | { type: "cancel"; target: number };
export type WorkerRes = { id: number; type: "progress"; t: number } | { id: number; type: "done"; result: unknown } | { id: number; type: "error"; message: string };

type Call = { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (t: number) => void; worker: number };
type Req = WorkerReq extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

class Pool {
  private workers: Worker[] = [];
  private calls = new Map<number, Call>();
  private nextId = 1;
  broken = false;

  constructor(n: number) {
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerRes>) => {
        const m = e.data;
        const c = this.calls.get(m.id);
        if (!c) return;
        if (m.type === "progress") return c.progress?.(m.t);
        this.calls.delete(m.id);
        if (m.type === "done") c.resolve(m.result);
        else {
          console.error(`[align] worker: ${m.message}`);
          c.reject(new Error(m.message));
        }
      };
      w.onerror = (e) => {
        e.preventDefault();
        this.fail(k, new Error(e.message || "worker failed"));
      };
      this.workers.push(w);
    }
  }

  get size() {
    return this.workers.length;
  }

  private fail(worker: number, err: Error) {
    this.broken = true;
    for (const [id, c] of this.calls) if (c.worker === worker) {
      this.calls.delete(id);
      c.reject(err);
    }
  }

  private call<T>(worker: number, req: Req, progress?: (t: number) => void, transfer: Transferable[] = []): { id: number; done: Promise<T> } {
    const id = this.nextId++;
    const done = new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve: resolve as (v: unknown) => void, reject, progress, worker });
      this.workers[worker]!.postMessage({ ...req, id } as WorkerReq, transfer);
    });
    return { id, done };
  }

  private turn = 0;
  /**
   * People in a frame the page decoded, found in the next worker in turn. The worker gets the
   * page's own pixels, so the boxes are exactly the page's.
   */
  people(image: ImageData): Promise<Box[]> {
    const k = this.turn++ % this.size;
    return this.call<Box[]>(k, { type: "people", image }, undefined, [image.data.buffer]).done;
  }

  private cancel(worker: number, id: number) {
    this.workers[worker]?.postMessage({ type: "cancel", target: id } satisfies WorkerReq);
  }

  /** Load the models in every worker ahead of time. */
  warm(): void {
    this.workers.forEach((_, k) => void this.call(k, { type: "warm" }).done.catch(() => undefined));
  }

  /** The whole-clip scan (see scanPart), split across the workers; the same samples as one pass. */
  async scan(file: File, limit: number, aspect: number, onProgress: (f: number) => void, signal?: AbortSignal): Promise<ScanPart> {
    const grid = scanGrid(limit);
    const parts = splitGrid(grid, this.size);
    const seen = parts.map(() => 0);
    const span = parts.map((p) => [grid[p.from]!.t, p.to < grid.length ? grid[p.to]!.t : limit] as const);
    const report = () => onProgress(Math.min(1, seen.reduce((s, t, k) => s + Math.max(0, Math.min(t, span[k]![1]) - span[k]![0]), 0) / limit));
    const calls = parts.map((p, k) =>
      this.call<ScanPart>(k, { type: "scan", file, limit, aspect, from: p.from, to: p.to }, (t) => {
        seen[k] = t;
        report();
      }),
    );
    const abort = () => calls.forEach((c, k) => this.cancel(k, c.id));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return joinParts(await Promise.all(calls.map((c) => c.done)));
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

}

let pool: Pool | null | undefined;
/** The shared worker pool, or null where workers can't run the models (callers use the page). */
export function visionPool(): Pool | null {
  if (pool === undefined) {
    try {
      const nav = navigator as Navigator & { deviceMemory?: number };
      const cores = nav.hardwareConcurrency || 4;
      // One core stays with the page (tracking, interface); fewer workers on low-memory phones.
      const n = Math.max(1, Math.min(nav.deviceMemory && nav.deviceMemory <= 4 ? 2 : 3, cores - 1));
      // "align:workers" = "off": everything on the page (support, and checking that both give the same result).
      const off = (() => {
        try {
          return localStorage.getItem("align:workers") === "off";
        } catch {
          return false;
        }
      })();
      pool = !off && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof VideoDecoder !== "undefined" ? new Pool(n) : null;
    } catch {
      pool = null;
    }
  }
  return pool && !pool.broken ? pool : null;
}
