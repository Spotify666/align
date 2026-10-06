// Runs the on-device models off the page, so several cores share the work. It only ever
// sees images the page drew (the page decodes, scales and crops every frame itself), so it
// computes exactly what the page would.

import { detectObjects, detectPeople, detectStillOn, loadPersonDetector, loadScanPose } from "./pose";
import type { WorkerReq, WorkerRes } from "./vision-pool";

// MediaPipe loads its runtime with importScripts, which module workers don't have.
const scope = self as unknown as { importScripts?: (url: string) => void; postMessage: (m: WorkerRes) => void };
scope.importScripts = (url: string) => {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send();
  (0, eval)(xhr.responseText);
};

const post = (m: WorkerRes) => scope.postMessage(m);

async function handle(req: WorkerReq): Promise<void> {
  if (req.type === "warm") {
    await Promise.all([loadPersonDetector(), loadScanPose()]);
    return post({ id: req.id, type: "done", result: null });
  }
  if (req.type === "objects") {
    const det = await loadPersonDetector();
    const res = detectObjects(det, req.image);
    req.image.close();
    return post({ id: req.id, type: "done", result: res });
  }
  if (req.type === "still") {
    const pose = await loadScanPose();
    const res = detectStillOn(pose, req.image, req.roi);
    req.image.close();
    return post({ id: req.id, type: "done", result: res });
  }
  if (req.type === "people") {
    const det = await loadPersonDetector();
    return post({ id: req.id, type: "done", result: detectPeople(det, req.image) });
  }
}

self.onmessage = (e: MessageEvent<WorkerReq>) => {
  const req = e.data;
  handle(req).catch((err) => post({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) }));
};
