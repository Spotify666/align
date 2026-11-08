/**
 * Shown beside the analysis steps while Aline works: a bat comes down from its backlift, meets
 * a ball that pitched in front of it, and the ball drops dead at its feet, over and over (the
 * defence itself). Flat black on sage-cream in both themes, like every illustration.
 * The moving parts are whole HTML layers moved by CSS transforms, which the browser animates
 * off the main thread, so the loop stays smooth while pose tracking keeps that thread busy.
 * With reduced motion it is a still picture of the moment of contact.
 */
export function CricketLoader({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`cricket-loader ${className}`}>
      {/* Ground and stumps: still. */}
      <svg viewBox="0 0 120 120" className="cl-layer">
        <line x1="0" y1="105" x2="120" y2="105" stroke="var(--ill-ink)" strokeWidth="2.5" strokeLinecap="round" />
        <g fill="var(--ill-ink)">
          <rect x="5" y="60" width="3" height="45" rx="1" />
          <rect x="10.5" y="60" width="3" height="45" rx="1" />
          <rect x="16" y="60" width="3" height="45" rx="1" />
          <rect x="4.5" y="56.5" width="7.5" height="2.5" rx="1" />
          <rect x="12" y="56.5" width="7.5" height="2.5" rx="1" />
        </g>
      </svg>
      {/* The bat, pivoting at the hands. */}
      <div className="cl-layer cl-bat">
        <svg viewBox="0 0 120 120" className="cl-layer">
          <g fill="var(--ill-ink)">
            <rect x="61.5" y="18" width="5" height="26" rx="2.5" />
            <path d="M57 42 h14 v50 q0 7 -7 7 q-7 0 -7 -7 z" />
          </g>
        </svg>
      </div>
      {/* The touch: a ring where bat meets ball. */}
      <div className="cl-layer cl-touch">
        <svg viewBox="0 0 120 120" className="cl-layer">
          <circle cx="64" cy="80" r="9" fill="none" stroke="var(--ill-ink)" strokeWidth="2" />
        </svg>
      </div>
      {/* The ball: travels, pitches, meets the bat, drops; its seam spins. */}
      <div className="cl-layer cl-ball">
        <div className="cl-layer cl-spin">
          <svg viewBox="0 0 120 120" className="cl-layer">
            <circle cx="72" cy="80" r="7" fill="var(--ill-ink)" />
            <path d="M67.5 76.5 q4.5 3.5 9 0 M67.5 83.5 q4.5 -3.5 9 0" fill="none" stroke="var(--ill-paper)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
