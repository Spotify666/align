"use client";

import { useState } from "react";
import { Mark } from "@/components/icons";

// Shown once per visit: on the page Align opens on (the landing page, or the app's home
// when it is launched from the home screen), never again on moving between pages.
let played = false;

/**
 * Align's opening, like a film studio's ident before the feature: the mark spins in, its
 * gold line runs the height of the screen, then the curtain splits along that line and
 * swings open onto the page. About 1.3 s, all CSS (it starts before any script loads and
 * runs on the compositor), and it never blocks a tap. With reduced motion asked for, the
 * mark simply fades away instead.
 */
export function Intro() {
  const [first] = useState(() => {
    // The server always draws it (each page is prepared on its own); the browser keeps
    // count, so the page a visit opens on plays it and later pages don't.
    if (typeof window === "undefined") return true;
    const f = !played;
    played = true;
    return f;
  });
  if (!first) return null;
  return (
    <div className="intro" aria-hidden>
      <div className="intro-half intro-left" />
      <div className="intro-half intro-right" />
      <div className="intro-line" />
      <div className="intro-mark">
        <span className="block overflow-hidden rounded-[30px]">
          <Mark size={120} />
        </span>
      </div>
    </div>
  );
}
