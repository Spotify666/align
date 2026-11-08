/**
 * Shown beside the analysis steps while Aline works: the defence itself, seen from a little in
 * front of square, so the pitch runs away into the distance. The ball leaves the far stumps
 * small, grows as it comes down the pitch, lands on its own shadow, meets the bat (which gives a
 * little, soft hands) and drops dead at the batter's feet, over and over.
 *
 * Depth comes from the drawing, not shading: the pitch's edges meet towards the bowler, the far
 * stumps are tiny, the ball grows and its flat shadow tracks it along the ground, and the scene
 * gives a small jolt at contact. Flat ink on illustration paper in both themes, like every
 * illustration.
 *
 * The moving parts are whole HTML layers moved by CSS transforms, which the browser animates
 * off the main thread, so the loop stays smooth while pose tracking keeps that thread busy.
 * With reduced motion it is a still picture of the moment of contact.
 */
export function CricketLoader({ className = "" }: { className?: string }) {
  const ink = "var(--ill-ink)";
  return (
    <div aria-hidden className={`cricket-loader ${className}`}>
      <div className="cl-layer cl-scene">
        {/* The pitch running away to the bowler, the creases, both sets of stumps: still. */}
        <svg viewBox="0 0 120 120" className="cl-layer">
          <g stroke={ink} strokeLinecap="round" fill="none">
            <path d="M-2 98.2 L122 83.8" strokeWidth="1.6" />
            <path d="M-2 116.4 L122 90.8" strokeWidth="1.6" />
            <path d="M27.5 95 L25 110.6" strokeWidth="1.3" />
            <path d="M104.6 85.8 L104 94.2" strokeWidth="0.9" />
          </g>
          <g fill={ink}>
            <rect x="5" y="62" width="3" height="44" rx="1" />
            <rect x="10.5" y="62" width="3" height="44" rx="1" />
            <rect x="16" y="62" width="3" height="44" rx="1" />
            <rect x="4.5" y="58.5" width="7.5" height="2.4" rx="1" />
            <rect x="12" y="58.5" width="7.5" height="2.4" rx="1" />
            <rect x="110.2" y="80" width="1.3" height="8" rx="0.5" />
            <rect x="112" y="80" width="1.3" height="8" rx="0.5" />
            <rect x="113.8" y="80" width="1.3" height="8" rx="0.5" />
          </g>
        </svg>
        {/* The ball's shadow on the pitch. */}
        <div className="cl-layer cl-shadow">
          <svg viewBox="0 0 120 120" className="cl-layer">
            <ellipse cx="60" cy="60" rx="6.5" ry="1.7" fill={ink} />
          </svg>
        </div>
        {/* The bat, pivoting at the hands. */}
        <div className="cl-layer cl-bat">
          <svg viewBox="0 0 120 120" className="cl-layer">
            <g fill={ink}>
              <rect x="44.1" y="16" width="4.6" height="28" rx="2.3" />
              <path d="M40.4 42 h12 v50 q0 6 -6 6 q-6 0 -6 -6 z" />
            </g>
          </svg>
        </div>
        {/* The ball: comes down the pitch, lands, meets the bat, drops; its seam spins. */}
        <div className="cl-layer cl-ball">
          <div className="cl-layer cl-spin">
            <svg viewBox="0 0 120 120" className="cl-layer">
              <circle cx="60" cy="60" r="7" fill={ink} />
              <path d="M55.5 56.5 q4.5 3.5 9 0 M55.5 63.5 q4.5 -3.5 9 0" fill="none" stroke="var(--ill-paper)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        {/* The touch: short strokes thrown off where bat meets ball. */}
        <div className="cl-layer cl-touch">
          <svg viewBox="0 0 120 120" className="cl-layer">
            <g stroke={ink} strokeWidth="1.6" strokeLinecap="round">
              <path d="M59 70.5 L61.5 66.5" />
              <path d="M62.5 77 L67 75.5" />
              <path d="M63 84 L67.5 85" />
              <path d="M60 90.5 L63 94" />
              <path d="M53.5 68.5 L54 64" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
