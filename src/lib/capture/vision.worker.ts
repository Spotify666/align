// Runs the on-device models off the page, so several cores share the work. Each request
// decodes its own frames from the clip (exactly the frames the page would decode) and
// runs exactly what the page would run on them, so the results are the same.

import { openDecoded, type DecodedVideo } from "./decoder";
import { detectPeople, loadPersonDetector, loadScanPose } from "./pose";
import { scanGrid, scanPart, THUMB_W } from "./scan";
import type { WorkerReq, WorkerRes } from "./vision-pool";

// MediaPipe loads its runtime with importScripts, which module workers don't have.
const scope = self as unknown as { importScripts?: (url: string) => void; postMessage: (m: WorkerRes) => void };
scope.importScripts = (url: string) => {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send();
  (0, eval)(xhr.responseText);
};

let opened: { key: string; video: Promise<DecodedVideo | null> } | null = null;
function decoded(file: File): Promise<DecodedVideo | null> {
  const key = `${file.name}|${file.size}|${file.lastModified}`;
  if (opened?.key !== key) opened = { key, video: openDecoded(file) };
  return opened.video;
}

// Worker-only API (the project's types are the page's).
declare const FileReaderSync: { new (): { readAsDataURL(blob: Blob): string } };

const cancelled = new Set<number>();
const post = (m: WorkerRes) => scope.postMessage(m);

async function thumbUrl(c: OffscreenCanvas): Promise<string> {
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.6 });
  return new FileReaderSync().readAsDataURL(blob);
}

async function handle(req: WorkerReq): Promise<void> {
  if (req.type === "cancel") {
    cancelled.add(req.target);
    return;
  }
  if (req.type === "warm") {
    await Promise.all([loadPersonDetector(), loadScanPose()]);
    return post({ id: req.id, type: "done", result: null });
  }
  if (req.type === "people") {
    // The page's own pixels (decoded on the page), so exactly what the page would find.
    const det = await loadPersonDetector();
    return post({ id: req.id, type: "done", result: detectPeople(det, req.image) });
  }
  const src = await decoded(req.file);
  if (!src) throw new Error("This clip can't be decoded in a worker");
  const stop = () => cancelled.has(req.id);
  if (req.type === "scan") {
    const [det, pose] = await Promise.all([loadPersonDetector(), loadScanPose()]);
    const grid = scanGrid(req.limit);
    // Thumbnails are encoded after the pass (a worker can only encode asynchronously).
    const thumbs: Array<Promise<string>> = [];
    const tc = new OffscreenCanvas(THUMB_W, Math.round(THUMB_W / req.aspect));
    const tctx = tc.getContext("2d")!;
    let last = 0;
    const res = await scanPart(src, req.aspect, req.limit, grid, { from: req.from, to: req.to }, det, pose, (t) => {
      if (t - last >= 0.5) {
        last = t;
        post({ id: req.id, type: "progress", t });
      }
    }, stop, (from) => {
      tctx.drawImage(from, 0, 0, tc.width, tc.height);
      thumbs.push(thumbUrl(tc));
      return `thumb:${thumbs.length - 1}`;
    });
    const urls = await Promise.all(thumbs);
    for (const s of res.samples) if (s.thumb.startsWith("thumb:")) s.thumb = urls[+s.thumb.slice(6)] ?? "";
    return post({ id: req.id, type: "done", result: res });
  }
}

self.onmessage = (e: MessageEvent<WorkerReq>) => {
  const req = e.data;
  handle(req)
    .catch((err) => post({ id: "id" in req ? req.id : -1, type: "error", message: err instanceof Error ? err.message : String(err) }))
    .finally(() => "id" in req && cancelled.delete(req.id));
};
