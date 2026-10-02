// Copies the MediaPipe WASM runtime into public/ and downloads the pose model,
// so the app never loads analysis code from a third-party CDN at runtime.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/vendor/mediapipe/wasm");
const modelDest = join(root, "public/models");

const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

const MODELS = [
  {
    file: "pose_landmarker_full.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  },
  {
    // Light pose for scanning a whole clip quickly (posture of the main person).
    file: "pose_landmarker_lite.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
  {
    // Person boxes: finds small or distant batters so pose can run on a crop.
    file: "efficientdet_lite0.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
  },
];

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

await mkdir(wasmDest, { recursive: true });
await mkdir(modelDest, { recursive: true });

for (const file of WASM_FILES) {
  await copyFile(join(wasmSrc, file), join(wasmDest, file));
}

for (const model of MODELS) {
  const dest = join(modelDest, model.file);
  if (await exists(dest)) continue;
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`Model download failed (${res.status}): ${model.url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, bytes);
  const sha = createHash("sha256").update(await readFile(dest)).digest("hex").slice(0, 16);
  console.log(`vendored ${model.file} (${(bytes.length / 1e6).toFixed(1)} MB, sha256 ${sha}…)`);
}
console.log("MediaPipe runtime vendored to public/");
