"use client";

import { useState, type CSSProperties } from "react";
import { Mark } from "@/components/icons";

// The app's home plays it once per visit (when Align is opened from the home screen);
// the landing page plays it every time it is opened.
let played = false;

// The curtain: vertical slats that turn on their own axes, one after another, in a single
// sweep across the screen (left to right, all the same way), so nothing parts in the middle.
const SLATS = 12;
const slats = Array.from({ length: SLATS }, (_, i) => ({ "--i": i })) as CSSProperties[];

/**
 * Align's opening, like a film studio's ident before the feature, telling the idea before
 * the page does: the mark spins in, its gold line drops from the eye to the ball, the name
 * appears, then "Eyes over the ball. Everything in line.", and the curtain, a row of
 * vertical slats, turns open in one sweep across the screen. About 2.6 s, all CSS (it starts before any
 * script loads and runs on the compositor), and it never blocks a tap. With reduced
 * motion asked for, it shows still and fades.
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
          {/* shifted so the mark's own gold line sits on the screen's */}
          <span className="relative block overflow-hidden rounded-[30px]" style={{ left: (112 * 5) / 64 }}>
            <Mark size={112} />
          </span>
        </div>
        <p className="intro-word">Align</p>
        <p className="intro-tag">
          <span className="intro-t1">Eyes over the ball.</span>
          <span className="intro-t2">Everything in line.</span>
        </p>
      </div>
    </div>
  );
}
