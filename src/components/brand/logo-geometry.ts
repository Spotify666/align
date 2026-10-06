// The Aline mark, redrawn as clean geometry from the brand artwork: a batter in a long stride
// built from straight strokes, the front leg a straight vertical line, the name between.
// Units are the artwork's (about 830 × 620), y pointing down. Shared by the flat logo (SVG)
// and the 3D one, so both are always the same mark.

export type P = [number, number];

/** The strokes of the mark, as polygons. */
export const MARK: P[][] = [
  // Upper half: the line (a straight vertical stroke), the bat swung through, the arm.
  [[432, 122], [518, 122], [517, 368], [433, 368]],
  [[637, 122], [714, 122], [781, 368], [704, 368]],
  [[518, 336], [744, 168], [777, 198], [553, 386], [518, 370]],
  // Lower half: the long back leg of the stride, the line again, the crease, the front leg.
  [[92, 736], [404, 461], [441, 503], [206, 736]],
  [[432, 476], [518, 476], [518, 730], [432, 730]],
  [[556, 493], [720, 493], [720, 509], [556, 509]],
  [[758, 476], [814, 476], [890, 730], [796, 730]],
];

/** ALINE between the halves: each letter as stroke centre-lines (polylines). */
export const LETTERS: P[][] = [
  // A
  [[450, 441], [468, 401], [486, 441]],
  [[456.5, 428], [479.5, 428]],
  // L
  [[532, 401], [532, 441], [556, 441]],
  // I
  [[610, 401], [610, 441]],
  // N
  [[672, 441], [672, 401], [700, 441], [700, 401]],
  // E
  [[770, 401], [746, 401], [746, 441], [770, 441]],
  [[746, 421], [766, 421]],
];
export const LETTER_STROKE = 7.5;

/** The whole mark, with a margin. */
export const VIEW = { x: 72, y: 102, w: 838, h: 654 };
