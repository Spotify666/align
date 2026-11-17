"use client";
// Short on the page, complete on demand (the owner, 2026-11-17: "the site is text heavy… replace
// it with a long press action on a shorter version of it to get the complete text… keep it
// simple"). <Hold> shows the short version; pressing and holding it opens the full text in a
// sheet. A mouse click and the Enter or Space key open it too, so it never depends on a
// gesture alone. One sheet serves the whole app (<HoldSheet>, mounted once in the layout).

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const HOLD_MS = 420;
const MOVE_PX = 10;
const LEARNED = "align.hold.learned";

type Open = { title: ReactNode; body: ReactNode; from: HTMLElement | null } | null;
let current: Open = null;
const listeners = new Set<() => void>();
const show = (next: Open) => {
  current = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

const learned = () => {
  try {
    return localStorage.getItem(LEARNED) === "1";
  } catch {
    return true;
  }
};
const learn = () => {
  try {
    localStorage.setItem(LEARNED, "1");
  } catch {}
  document.querySelectorAll(".hold[data-hint]").forEach((e) => e.removeAttribute("data-hint"));
};

/**
 * The short version of something worth reading in full. `children` is what the page shows;
 * `more` is the complete text, opened by a long press (or a click, or Enter).
 */
export function Hold({ children, more, className = "" }: { children: ReactNode; more: ReactNode; className?: string }) {
  const el = useRef<HTMLButtonElement>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);

  // Until someone has held one, the first on a page says how.
  useEffect(() => {
    if (el.current && !learned() && document.querySelector(".hold") === el.current) el.current.dataset.hint = "";
  }, []);

  const open = () => {
    learn();
    show({ title: children, body: more, from: el.current });
  };
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
  };

  return (
    <button
      ref={el}
      type="button"
      className={`hold ${className}`}
      aria-haspopup="dialog"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return; // a mouse clicks
        cancel();
        const p = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
          p.fired = true;
          navigator.vibrate?.(8);
          open();
        }, HOLD_MS) };
        press.current = p;
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // The keyboard and the mouse open at once. A finger must hold: a tap only says so.
        const touch = (e.nativeEvent as PointerEvent).pointerType === "touch" || (e.nativeEvent as PointerEvent).pointerType === "pen";
        if (!touch) return open();
        if (press.current?.fired) return;
        const b = e.currentTarget;
        b.dataset.hint = "";
        setTimeout(() => !learned() || b.removeAttribute("data-hint"), 1800);
      }}
    >
      {children}
      <span className="sr-only"> (hold, or press Enter, for more)</span>
    </button>
  );
}

/** The one sheet every <Hold> opens. Mounted once, in the root layout. */
export function HoldSheet() {
  const open = useSyncExternalStore(subscribe, () => current, () => null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="hold-sheet"
      aria-labelledby="hold-sheet-h"
      onClose={() => {
        const from = current?.from;
        show(null);
        from?.focus({ preventScroll: true });
      }}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      {open && (
        <div className="mx-auto flex max-h-[min(80dvh,40rem)] w-full max-w-xl flex-col gap-3 overflow-y-auto p-5 sm:p-6">
          <h2 id="hold-sheet-h" className="font-semibold">{open.title}</h2>
          <div className="hold-body space-y-3 text-fg-muted">{open.body}</div>
          <button type="button" className="btn btn-ghost mt-2 self-start" onClick={() => dialog.current?.close()}>Close</button>
        </div>
      )}
    </dialog>
  );
}
