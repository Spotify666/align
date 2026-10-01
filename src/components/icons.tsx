import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 18, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const Check = (p: P) => (<svg {...base(p)}><path d="M5 12.5l4.2 4.2L19 7" /></svg>);
export const Cross = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Question = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.6" /><path d="M12 17h.01" /></svg>);
export const CameraOff = (p: P) => (<svg {...base(p)}><path d="M3 3l18 18" /><path d="M9.5 5H15l1.5 2H19a2 2 0 012 2v8m-2.6 2H5a2 2 0 01-2-2V9a2 2 0 012-2h1" /><path d="M10 10.2a3 3 0 004 4" /></svg>);
export const Swap = (p: P) => (<svg {...base(p)}><path d="M7 4L3 8l4 4" /><path d="M3 8h13a4 4 0 014 4" /><path d="M17 20l4-4-4-4" /><path d="M21 16H8a4 4 0 01-4-4" /></svg>);
export const Info = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const Play = (p: P) => (<svg {...base(p)}><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" /></svg>);
export const Pause = (p: P) => (<svg {...base(p)}><path d="M8 5v14M16 5v14" strokeWidth={3} /></svg>);
export const Upload = (p: P) => (<svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>);
export const Record = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></svg>);
export const Lock = (p: P) => (<svg {...base(p)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>);
export const Download = (p: P) => (<svg {...base(p)}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>);
export const Trash = (p: P) => (<svg {...base(p)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>);
export const Home = (p: P) => (<svg {...base(p)}><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z" /></svg>);
export const Plus = (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const List = (p: P) => (<svg {...base(p)}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>);
export const Trend = (p: P) => (<svg {...base(p)}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>);
export const User = (p: P) => (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>);
export const Users = (p: P) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6" /></svg>);
export const Beaker = (p: P) => (<svg {...base(p)}><path d="M9 3h6M10 3v6l-5 9a2 2 0 001.7 3h10.6a2 2 0 001.7-3l-5-9V3" /><path d="M7.5 15h9" /></svg>);
export const Shield = (p: P) => (<svg {...base(p)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>);
export const Menu = (p: P) => (<svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const Chevron = (p: P) => (<svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>);
export const Rotate = (p: P) => (<svg {...base(p)}><path d="M20 12a8 8 0 11-2.3-5.7" /><path d="M20 4v5h-5" /></svg>);
export const Layers = (p: P) => (<svg {...base(p)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);
export const Target = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>);
export const Spark = (p: P) => (<svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></svg>);

/** Align mark: two converging lines resolving onto one axis. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="var(--color-fg)" />
      <path d="M6 18L12 6l6 12" fill="none" stroke="var(--color-bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 13.4h6.8" stroke="var(--color-brand)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
