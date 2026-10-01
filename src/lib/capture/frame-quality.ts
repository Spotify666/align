// Per-frame image statistics on a small grayscale copy: brightness, contrast,
// sharpness (variance of the Laplacian) and background motion at the borders.
import type { FrameQuality } from "@/engine/types";

const W = 160;

export class FrameQualitySampler {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  private prevBorder: Float32Array | null = null;
  private h: number;

  constructor(aspect: number) {
    this.h = Math.max(32, Math.round(W / aspect));
    this.canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, this.h) : Object.assign(document.createElement("canvas"), { width: W, height: this.h });
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  }

  sample(source: CanvasImageSource, frame: number): FrameQuality {
    const { ctx, h } = this;
    ctx.drawImage(source, 0, 0, W, h);
    const data = ctx.getImageData(0, 0, W, h).data;
    const gray = new Float32Array(W * h);
    let sum = 0;
    for (let i = 0; i < W * h; i++) {
      const g = (0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!) / 255;
      gray[i] = g;
      sum += g;
    }
    const mean = sum / gray.length;
    let varSum = 0;
    for (const g of gray) varSum += (g - mean) ** 2;
    let lap = 0;
    let lapSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const l = gray[i - 1]! + gray[i + 1]! + gray[i - W]! + gray[i + W]! - 4 * gray[i]!;
        lap += l;
        lapSq += l * l;
        n++;
      }
    }
    const lapMean = lap / n;
    // Border strip (outer 10%) is mostly background; its change approximates camera shake.
    const border: number[] = [];
    const bw = Math.round(W * 0.1);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < W; x += 2) if (x < bw || x >= W - bw || y < h * 0.1) border.push(gray[y * W + x]!);
    const b = Float32Array.from(border);
    let motion = 0;
    if (this.prevBorder && this.prevBorder.length === b.length) {
      let d = 0;
      for (let i = 0; i < b.length; i++) d += Math.abs(b[i]! - this.prevBorder[i]!);
      motion = d / b.length;
    }
    this.prevBorder = b;
    return {
      frame,
      brightness: mean,
      contrast: Math.sqrt(varSum / gray.length),
      sharpness: lapSq / n - lapMean * lapMean,
      backgroundMotion: motion,
    };
  }
}
