// Black bars round the picture: an upright phone video saved into a wide frame (pillarbox) or
// a wide one into a tall frame (letterbox), as editing and messaging apps often do. Found on a
// few small grey frames spread over the clip: edge columns (rows) that are dark in every one.

import type { Roi } from "./pose";

/** Brightest any pixel of an edge line may be, in every frame, for the line to count as bar. */
const DARK = 0.07;

/**
 * The picture area inside the bars (normalised), or null when the picture fills the frame
 * (bars under 8% of the width or height in all are ignored: a dark edge, not a bar).
 */
export function findPictureArea(frames: Float32Array[], w: number, h: number): Roi | null {
  if (!frames.length) return null;
  const colDark = (x: number) => frames.every((g) => {
    for (let y = 0; y < h; y++) if (g[y * w + x]! > DARK) return false;
    return true;
  });
  const rowDark = (y: number) => frames.every((g) => {
    for (let x = 0; x < w; x++) if (g[y * w + x]! > DARK) return false;
    return true;
  });
  let left = 0;
  while (left < w && colDark(left)) left++;
  let right = w - 1;
  while (right > left && colDark(right)) right--;
  let top = 0;
  while (top < h && rowDark(top)) top++;
  let bottom = h - 1;
  while (bottom > top && rowDark(bottom)) bottom--;
  const pw = right - left + 1;
  const ph = bottom - top + 1;
  if (pw <= w * 0.2 || ph <= h * 0.2) return null; // nearly all dark: a dark clip, not bars
  const barsX = 1 - pw / w;
  const barsY = 1 - ph / h;
  if (barsX < 0.08 && barsY < 0.08) return null;
  // Keep a one-sample margin inside so the edge of the picture isn't cut.
  return {
    x: barsX >= 0.08 ? left / w : 0,
    y: barsY >= 0.08 ? top / h : 0,
    w: barsX >= 0.08 ? pw / w : 1,
    h: barsY >= 0.08 ? ph / h : 1,
  };
}
