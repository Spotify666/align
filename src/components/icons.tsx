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
/**
 * The Align mark: an "A" whose left stroke is a rhino's horn, whose right stroke is an
 * elephant's trunk and whose crossbar is a bird's beak pointing forward, toward the
 * bowler. All three meet at one point: in line.
 */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M30.25 10.67 L30.77 11.60 L31.28 12.54 L31.79 13.49 L32.30 14.44 L32.80 15.39 L33.30 16.35 L33.79 17.31 L34.29 18.28 L34.78 19.25 L35.26 20.22 L35.74 21.19 L36.21 22.17 L36.69 23.14 L37.15 24.11 L37.61 25.09 L38.06 26.06 L38.51 27.03 L38.95 28.00 L39.39 28.97 L39.82 29.93 L40.24 30.89 L40.66 31.84 L41.06 32.79 L41.46 33.74 L41.85 34.68 L42.23 35.61 L42.61 36.53 L42.97 37.45 L43.33 38.36 L43.68 39.26 L44.01 40.15 L44.34 41.04 L44.65 41.91 L44.96 42.77 L45.25 43.62 L45.54 44.46 L45.81 45.28 L46.07 46.10 L46.32 46.90 L46.55 47.66 L46.78 48.52 L46.95 49.32 L47.05 50.06 L47.11 50.77 L47.12 51.42 L47.09 52.03 L47.01 52.59 L46.90 53.10 L46.77 53.56 L46.60 53.98 L46.41 54.35 L46.21 54.68 L45.99 54.96 L45.76 55.20 L45.52 55.41 L45.28 55.57 L45.03 55.70 L44.78 55.80 L44.52 55.86 L44.26 55.89 L43.99 55.89 L43.71 55.85 L43.43 55.78 L43.13 55.66 L42.83 55.50 L42.51 55.28 L42.33 55.13 L42.16 54.96 L42.01 54.79 L41.89 54.61 L41.80 54.44 L41.72 54.27 L41.66 54.10 L41.62 53.94 L41.60 53.77 L41.59 53.60 L41.60 53.44 L41.63 53.28 L41.66 53.12 L41.72 52.97 L41.79 52.82 L41.87 52.68 L41.97 52.54 L42.09 52.41 L42.22 52.29 L42.36 52.18 L42.52 52.08 L42.70 52.00 L42.90 51.92 L43.11 51.86 L43.34 51.82 L43.65 51.80 L43.55 49.40 L43.13 49.41 L42.68 49.46 L42.24 49.55 L41.82 49.68 L41.42 49.84 L41.04 50.04 L40.68 50.28 L40.36 50.54 L40.06 50.83 L39.79 51.15 L39.55 51.49 L39.35 51.85 L39.19 52.23 L39.05 52.62 L38.96 53.03 L38.91 53.45 L38.89 53.87 L38.92 54.30 L38.99 54.73 L39.11 55.16 L39.26 55.58 L39.46 55.99 L39.70 56.39 L39.98 56.78 L40.31 57.15 L40.69 57.52 L41.21 57.93 L41.78 58.28 L42.38 58.56 L43.00 58.77 L43.63 58.90 L44.27 58.95 L44.91 58.92 L45.55 58.81 L46.16 58.62 L46.76 58.37 L47.33 58.04 L47.86 57.64 L48.36 57.19 L48.82 56.67 L49.23 56.10 L49.60 55.47 L49.92 54.79 L50.19 54.07 L50.40 53.30 L50.56 52.48 L50.67 51.62 L50.71 50.72 L50.69 49.78 L50.61 48.80 L50.46 47.77 L50.25 46.74 L50.05 45.88 L49.84 45.04 L49.63 44.18 L49.40 43.30 L49.16 42.42 L48.91 41.52 L48.65 40.62 L48.38 39.70 L48.10 38.77 L47.81 37.84 L47.52 36.89 L47.21 35.93 L46.90 34.97 L46.57 34.00 L46.24 33.02 L45.91 32.04 L45.56 31.05 L45.21 30.05 L44.85 29.05 L44.48 28.05 L44.11 27.04 L43.73 26.02 L43.34 25.01 L42.95 23.99 L42.56 22.97 L42.16 21.94 L41.75 20.92 L41.34 19.89 L40.92 18.87 L40.50 17.85 L40.08 16.82 L39.65 15.80 L39.22 14.78 L38.79 13.76 L38.35 12.75 L37.91 11.74 L37.47 10.73 L37.03 9.72 L36.59 8.72 L36.15 7.73 Z" fill="var(--color-fg)" />
      <circle cx="33.2" cy="9.4" r="3.25" fill="var(--color-fg)" />
      <path d="M42.82 26.40 L39.86 27.62 M44.71 31.38 L41.92 32.46 M46.41 36.22 L43.78 37.16" stroke="var(--color-bg)" strokeWidth="1.15" strokeLinecap="round" opacity="0.55" />
      <path d="M9 55.5 C 11 37, 20.5 19, 33.4 6.6 C 28 20.5, 24.4 36.5, 23 55.5 Z" fill="var(--color-brand)" />
      <path d="M24.6 31.6 C 31 30.6, 38.6 31.6, 44.2 35.2 C 37.6 34.9, 31 35.4, 24.2 36.6 Z" fill="#e8b23a" />
      <path d="M24 38.9 C 30.2 38.1, 36 38.3, 40.6 38.6 C 35.4 39.9, 30 41.2, 24.2 42.9 Z" fill="#e8b23a" />
    </svg>
  );
}
