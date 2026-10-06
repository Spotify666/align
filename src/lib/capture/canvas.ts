// Canvases that work on the page and in a worker (where there is no document).

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
/** A frame the pose models can read: the player, a photo or a canvas. */
export type FrameSource = HTMLVideoElement | HTMLImageElement | AnyCanvas;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== "undefined") return Object.assign(document.createElement("canvas"), { width: w, height: h });
  return new OffscreenCanvas(w, h);
}

/** Pixel size of a frame source. */
export function sizeOf(source: FrameSource | ImageBitmap | ImageData): { w: number; h: number } {
  return "videoWidth" in source ? { w: source.videoWidth, h: source.videoHeight } : { w: source.width, h: source.height };
}
