"use client";

import { useState, type CSSProperties } from "react";
import { Logo } from "@/components/brand/logo";

// The app's home plays it once per visit (when Aline is opened from the home screen);
// the landing page plays it every time it is opened.
let played = false;

// The curtain: vertical slats that turn on their own axes, one after another, in a single
// sweep across the screen (left to right, all the same way), so nothing parts in the middle.
// The sweep gathers pace as it crosses (each slat starts a little sooner after the one before).
const SLATS = 12;
const SWEEP_S = 0.5;
const slats = Array.from({ length: SLATS }, (_, i) => ({ "--i": i, "--d": `${(SWEEP_S * Math.pow(i / (SLATS - 1), 0.85)).toFixed(3)}s` })) as CSSProperties[];

/**
 * Aline's opening, like a film studio's ident before the feature, telling the idea before
 * the page does: the mark (with its name) spins in, a line drops through it, then "Eyes
 * over the ball. Everything in line.", and the curtain, a row of
 * vertical slats, turns open in one sweep across the screen. About 2.8 s, all CSS (it starts
 * before any script loads and runs on the compositor: transform and opacity only), and it
 * never blocks a tap. It is black from the first frame (the page's own fade-in steps aside
 * for it), and each slat ends exactly edge-on and gone, so nothing is left to pop off at the
 * end. With reduced motion asked for, it shows still and fades.
 */
export function Intro({ always = false }: { always?: boolean }) {
  const [show] = useState(() => {
    // The server always draws it (each page is prepared on its own); the browser keeps count.
    if (typeof window === "undefined") return true;
    const first = !played;
    played = true;
    return always || first;
  });
  if (!show) return null;
  return (
    <div className="intro" aria-hidden>
      {slats.map((style, i) => (
        <div key={i} className="intro-slat" style={style} />
      ))}
      <div className="intro-line" />
      <div className="intro-stage">
        <div className="intro-mark">
          <Logo size={150} />
        </div>
        <p className="intro-tag">
          <span className="intro-t1">Eyes over the ball.</span>
          <span className="intro-t2">Everything in line.</span>
        </p>
      </div>
    </div>
  );
}
