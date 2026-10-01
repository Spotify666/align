// Small diagrams that show exactly what to tap at each marking step.
const S = "#5ed6e6";
const G = "#d7a62a";
const B = "#e2463a";
const W = "#f3f2ee";

const Frame = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg viewBox="0 0 160 90" className="stage w-full rounded-xl" role="img" aria-label={label}>
    <line x1="0" y1="78" x2="160" y2="78" stroke="#3a434c" strokeWidth="1" />
    {children}
  </svg>
);

const Batter = ({ x = 40, lunge = false }: { x?: number; lunge?: boolean }) => (
  <g stroke={S} strokeWidth="2" fill="none" strokeLinecap="round">
    <circle cx={x + (lunge ? 10 : 2)} cy="22" r="4" />
    <path d={`M${x + (lunge ? 8 : 2)} 27 L${x + 2} 48`} />
    <path d={lunge ? `M${x + 2} 48 L${x + 18} 62 L${x + 22} 77 M${x + 2} 48 L${x - 6} 77` : `M${x + 2} 48 L${x - 4} 77 M${x + 2} 48 L${x + 8} 77`} />
  </g>
);

export const MarkHint = {
  side: () => (
    <Frame label="The bowler is at one end of the frame; the batter at the other.">
      <Batter />
      <path d="M150 50 l-14 -6 v12 z" fill={W} opacity="0.8" />
      <text x="108" y="40" fontSize="8" fill={W}>bowler →</text>
    </Frame>
  ),
  stumps: () => (
    <Frame label="Tap the base of the stumps, then the top.">
      <rect x="20" y="52" width="4" height="26" fill={W} />
      <circle cx="22" cy="78" r="4" fill="none" stroke={G} strokeWidth="2" />
      <circle cx="22" cy="52" r="4" fill="none" stroke={G} strokeWidth="2" />
      <text x="29" y="74" fontSize="7" fill={G}>1 base</text>
      <text x="29" y="52" fontSize="7" fill={G}>2 top</text>
      <Batter x={70} />
    </Frame>
  ),
  bounce: () => (
    <Frame label="Tap the ball where it hits the pitch.">
      <Batter />
      <path d="M150 30 Q120 45 104 77 Q90 60 64 58" stroke={B} strokeDasharray="2 3" fill="none" />
      <circle cx="104" cy="76" r="3" fill={B} />
      <circle cx="104" cy="76" r="7" fill="none" stroke={G} strokeWidth="2" />
      <text x="96" y="66" fontSize="7" fill={G}>tap</text>
    </Frame>
  ),
  contact: () => (
    <Frame label="Tap the ball as it meets the bat.">
      <Batter lunge />
      <path d="M56 40 L60 70" stroke={G} strokeWidth="3" strokeLinecap="round" />
      <circle cx="62" cy="66" r="3" fill={B} />
      <circle cx="62" cy="66" r="7" fill="none" stroke={W} strokeWidth="1.5" />
      <text x="72" y="68" fontSize="7" fill={W}>tap the ball</text>
    </Frame>
  ),
  after: () => (
    <Frame label="Tap the ball a moment after contact.">
      <Batter lunge />
      <path d="M56 40 L60 70" stroke={G} strokeWidth="3" strokeLinecap="round" />
      <circle cx="74" cy="74" r="3" fill={B} />
      <circle cx="74" cy="74" r="7" fill="none" stroke={W} strokeWidth="1.5" />
      <text x="84" y="72" fontSize="7" fill={W}>ball after</text>
    </Frame>
  ),
  bat: () => (
    <Frame label="Tap the top hand on the handle, then the toe of the bat.">
      <Batter lunge />
      <path d="M54 36 L62 72" stroke={G} strokeWidth="3" strokeLinecap="round" />
      <circle cx="54" cy="36" r="5" fill="none" stroke={W} strokeWidth="1.5" />
      <circle cx="62" cy="72" r="5" fill="none" stroke={W} strokeWidth="1.5" />
      <text x="62" y="34" fontSize="7" fill={W}>1 hands</text>
      <text x="70" y="74" fontSize="7" fill={W}>2 toe</text>
    </Frame>
  ),
};
