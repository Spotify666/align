// Camera cuts from the picture itself, on the frames tracking reads anyway. A cut between
// two similar-looking shots (a close-up and a wide shot, both mostly grass) changes the
// picture far less than a fixed bar expects, but it is still a sudden jump against the
// frames around it: a smooth zoom or pan changes it a little every frame.

/** Mean absolute change of a small luma image from the previous frame, per frame. */
export function spikeCuts(change: Array<number | undefined>, minChange = 0.05, ratio = 4, around = 6): number[] {
  const cuts: number[] = [];
  for (let i = 1; i < change.length; i++) {
    const c = change[i];
    if (c === undefined || c < minChange) continue;
    const near: number[] = [];
    for (let k = Math.max(1, i - around); k <= Math.min(change.length - 1, i + around); k++) {
      const v = change[k];
      if (k !== i && v !== undefined) near.push(v);
    }
    near.sort((a, b) => a - b);
    const typical = near.length ? near[Math.floor(near.length / 2)]! : 0;
    if (c > ratio * typical) cuts.push(i);
  }
  return cuts;
}

const W = 32;

/** Records a small luma image of each tracked frame; `cuts()` finds where a new shot starts. */
export class LumaTrack {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frames: Array<Float32Array | undefined> = [];
  constructor(aspect: number) {
    this.canvas = Object.assign(document.createElement("canvas"), { width: W, height: Math.max(8, Math.round(W / aspect)) });
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }
  take(i: number, src: CanvasImageSource) {
    this.ctx.drawImage(src, 0, 0, this.canvas.width, this.canvas.height);
    const px = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const l = new Float32Array(this.canvas.width * this.canvas.height);
    for (let k = 0; k < l.length; k++) l[k] = (0.299 * px[k * 4]! + 0.587 * px[k * 4 + 1]! + 0.114 * px[k * 4 + 2]!) / 255;
    this.frames[i] = l;
  }
  reset() {
    this.frames = [];
  }
  cuts(): number[] {
    const change = this.frames.map((f, i) => {
      const p = this.frames[i - 1];
      if (!f || !p) return undefined;
      let s = 0;
      for (let k = 0; k < f.length; k++) s += Math.abs(f[k]! - p[k]!);
      return s / f.length;
    });
    return spikeCuts(change);
  }
}
