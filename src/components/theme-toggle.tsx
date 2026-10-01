"use client";

import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const EVENT = "align-theme";

const read = (): Mode => {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

function apply(m: Mode) {
  const root = document.documentElement;
  try {
    if (m === "system") {
      root.removeAttribute("data-theme");
      localStorage.removeItem("align.theme");
    } else {
      root.setAttribute("data-theme", m);
      localStorage.setItem("align.theme", m);
    }
  } catch {
    /* storage unavailable: choice lasts for this page only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full border border-line-strong bg-surface p-0.5 text-xs">
      {(["system", "light", "dark"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => apply(m)}
          className={`min-h-8 rounded-full px-3 capitalize transition-colors ${mode === m ? "bg-tint text-fg" : "text-fg-subtle hover:text-fg"}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
