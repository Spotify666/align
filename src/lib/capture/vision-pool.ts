"use client";
// A few workers that run the on-device models in parallel (phones have 6–8 cores; the page
// runs on one). The page still decodes, scales and crops every frame itself, exactly as when
// it runs the models alone; only the finished images go to a worker. So the results are the
// page's own, to the pixel. Anything that fails here falls back to the page.

import { openDecoded } from "./decoder";
import type { Box, PoseFrame, Roi } from "./pose";
import { finishScan, joinParts, scanGrid, scanPartRemote, splitGrid, THUMB_W, type ScanResult } from "./scan";

export type WorkerReq =
  | { id: number; type: "warm" }
  | { id: number; type: "objects"; image: ImageBitmap }
  | { id: number; type: "still"; image: ImageBitmap; roi: Roi }
  | { id: number; type: "people"; image: ImageData };
export type WorkerRes = { id: number; type: "done"; result: unknown } | { id: number; type: "error"; message: string };

type Call = { resolve: (v: unknown) => void; reject: (e: Error) => void; worker: number };
type Req = WorkerReq extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

class Pool {
  private workers: Worker[] = [];
  private calls = new Map<number, Call>();
  private nextId = 1;
  private turn = 0;
  broken = false;

  constructor(n: number) {
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerRes>) => {
        const m = e.data;
        const c = this.calls.get(m.id);
        if (!c) return;
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
    for (const [id, c] of this.calls)
      if (c.worker === worker) {
        this.calls.delete(id);
        c.reject(err);
      }
  }

  private call<T>(worker: number, req: Req, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve: resolve as (v: unknown) => void, reject, worker });
      this.workers[worker]!.postMessage({ ...req, id } as WorkerReq, transfer);
    });
  }

  /** Load the models in every worker ahead of time. */
  warm(): void {
    this.workers.forEach((_, k) => void this.call(k, { type: "warm" }).catch(() => undefined));
  }

  /**
   * The whole-clip scan (see scanPart), split into parts that run side by side: each part
   * decoded on the page by its own decoder, its models in its own worker. The same samples as
   * one pass on the page.
   */
  async scan(file: File, limit: number, aspect: number, windowMedia: number, onProgress: (f: number) => void, signal?: AbortSignal): Promise<ScanResult> {
    const grid = scanGrid(limit);
    const parts = splitGrid(grid, this.size);
    const seen = parts.map(() => 0);
    const span = parts.map((p) => [grid[p.from]!.t, p.to < grid.length ? grid[p.to]!.t : limit] as const);
    const report = () => onProgress(Math.min(1, seen.reduce((s, t, k) => s + Math.max(0, Math.min(t, span[k]![1]) - span[k]![0]), 0) / limit));
    const stop = () => !!signal?.aborted;
    const res = await Promise.all(
      parts.map(async (p, k) => {
        const src = await openDecoded(file);
        if (!src) throw new Error("This clip can't be decoded");
        // Thumbnails as the page's scan makes them.
        const tc = Object.assign(document.createElement("canvas"), { width: THUMB_W, height: Math.max(8, Math.round(THUMB_W / aspect)) });
        const tctx = tc.getContext("2d")!;
        const thumbOf = (from: CanvasImageSource) => {
          tctx.drawImage(from, 0, 0, tc.width, tc.height);
          return tc.toDataURL("image/jpeg", 0.6);
        };
        const w = k % this.size;
        return scanPartRemote(
          src,
          aspect,
          grid,
          p,
          {
            objects: (image) => this.call<{ people: Box[]; bats: Box[] }>(w, { type: "objects", image }, [image]),
            still: (image, roi) => this.call<PoseFrame>(w, { type: "still", image, roi }, [image]),
          },
          (t) => {
            seen[k] = t;
            report();
          },
          stop,
          thumbOf,
        );
      }),
    );
    const all = joinParts(res);
    return finishScan(all.samples, all.motion, limit, windowMedia, onProgress);
  }

  /**
   * People in a frame the page decoded, found in the next worker in turn. The worker gets the
   * page's own pixels, so the boxes are exactly the page's.
   */
  people(image: ImageData): Promise<Box[]> {
    const k = this.turn++ % this.size;
    return this.call<Box[]>(k, { type: "people", image }, [image.data.buffer]);
  }
}

let pool: Pool | null | undefined;
/** The shared worker pool, or null where workers can't run the models (callers use the page). */
export function visionPool(): Pool | null {
  if (pool === undefined) {
    try {
      const nav = navigator as Navigator & { deviceMemory?: number };
      const cores = nav.hardwareConcurrency || 4;
      // One core stays with the page (decoding, tracking, interface); fewer workers on low-memory phones.
      const n = Math.max(1, Math.min(nav.deviceMemory && nav.deviceMemory <= 4 ? 2 : 3, cores - 1));
      // "align:workers" = "off": everything on the page (support, and checking that both give the same result).
      const off = (() => {
        try {
          return localStorage.getItem("align:workers") === "off";
        } catch {
          return false;
        }
      })();
      pool = !off && typeof Worker !== "undefined" && typeof createImageBitmap !== "undefined" ? new Pool(n) : null;
    } catch {
      pool = null;
    }
  }
  return pool && !pool.broken ? pool : null;
}
