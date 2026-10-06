import { LETTER_STROKE, LETTERS, MARK, VIEW } from "./logo-geometry";

const pts = (ps: Array<[number, number]>) => ps.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * The Aline mark in one colour (currentColor): the strokes, and the name between them unless
 * `name` is false (small sizes, where the letters can't be read).
 */
export function Logo({ size = 64, name = true, title = "Aline", className }: { size?: number; name?: boolean; title?: string; className?: string }) {
  return (
    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} width={(size * VIEW.w) / VIEW.h} height={size} role="img" aria-label={title} className={className}>
      <g fill="currentColor">
        {MARK.map((p, i) => (
          <polygon key={i} points={pts(p)} />
        ))}
      </g>
      {name && (
        <g fill="none" stroke="currentColor" strokeWidth={LETTER_STROKE} strokeLinejoin="bevel" strokeLinecap="butt">
          {LETTERS.map((p, i) => (
            <polyline key={i} points={pts(p)} />
          ))}
        </g>
      )}
    </svg>
  );
}
