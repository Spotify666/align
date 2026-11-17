"use client";
// The screen map: each flow is a lane of phone screens strung on one orange line, in the order a
// person meets them. A lane scrolls sideways inside itself (the page never does). Tapping a
// screen opens it larger with what each thing on it does. The pictures load as they come near.

import { Hold } from "@/components/common/hold";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FLOWS, SCREEN_SIZE, screenById, screenImage, type Flow, type Screen } from "@/lib/screen-map";

type Open = { flow: Flow; index: number };

export function ScreenMap() {
  const [open, setOpen] = useState<Open | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const screen = open ? screenById(open.flow.steps[open.index]!) : undefined;

  return (
    <>
      {FLOWS.map((flow, f) => (
        <section key={flow.id} id={flow.id} aria-labelledby={`${flow.id}-h`} className="scroll-mt-20 border-t border-line py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id={`${flow.id}-h`} className="display text-2xl sm:text-3xl">{flow.name}</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              <Hold more={<p>{flow.goal}</p>}>{flow.who}</Hold>
            </p>
          </div>
          <div
            role="region"
            aria-label={`${flow.name}: ${flow.steps.length} screens in order`}
            tabIndex={0}
            className="mx-auto mt-6 max-w-6xl snap-x overflow-x-auto scroll-px-4 px-4 pb-3 sm:scroll-px-6 sm:px-6"
          >
            <ol className="flex w-max">
              {flow.steps.map((id, i) => {
                const s = screenById(id)!;
                const last = i === flow.steps.length - 1;
                return (
                  <li key={id} className={`w-[13rem] shrink-0 snap-start ${last ? "" : "mr-5"}`}>
                    {/* The line: a numbered joint for this screen, running on to the next. */}
                    <div className="flex items-center" aria-hidden>
                      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-brand text-xs font-semibold">{i + 1}</span>
                      {!last && <span className="-mr-5 h-0.5 flex-1 bg-brand" />}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen({ flow, index: i })}
                      className="mt-3 block w-full overflow-hidden rounded-[1.4rem] border border-line-strong bg-stage"
                      aria-label={`${s.name}: open with what each thing does`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenImage(id)}
                        alt=""
                        width={SCREEN_SIZE.width}
                        height={SCREEN_SIZE.height}
                        loading={f === 0 && i < 2 ? "eager" : "lazy"}
                        decoding="async"
                        className="block h-auto w-full"
                      />
                    </button>
                    <h3 className="mt-3 font-semibold">{s.name}</h3>
                  </li>
                );
              })}
            </ol>
          </div>
          {flow.note && (
            <p className="mx-auto mt-2 max-w-6xl px-4 text-sm text-fg-subtle sm:px-6">
              <Hold more={<p>{flow.note}</p>}>A note on this flow</Hold>
            </p>
          )}
        </section>
      ))}

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && setOpen(null)}
        aria-labelledby="screen-h"
        className="screen-dialog m-auto w-[min(100vw-1.5rem,52rem)] rounded-[1.4rem] border border-line-strong bg-surface p-0 text-fg"
      >
        {open && screen && <Detail open={open} screen={screen} onMove={(index) => setOpen({ flow: open.flow, index })} onClose={() => setOpen(null)} />}
      </dialog>
    </>
  );
}

function Detail({ open, screen, onMove, onClose }: { open: Open; screen: Screen; onMove: (index: number) => void; onClose: () => void }) {
  const n = open.flow.steps.length;
  return (
    <div className="grid max-h-[calc(100dvh-1.5rem)] gap-5 overflow-y-auto p-4 sm:grid-cols-[17rem_1fr] sm:p-6">
      <div className="mx-auto w-[min(46vw,17rem)] overflow-hidden rounded-[1.4rem] border border-line-strong bg-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screenImage(screen.id)} alt={`The ${screen.name} screen`} width={SCREEN_SIZE.width} height={SCREEN_SIZE.height} className="block h-auto w-full" />
      </div>
      <div className="flex min-w-0 flex-col">
        <p className="text-sm text-fg-subtle">
          {open.flow.name}, screen {open.index + 1} of {n}
        </p>
        <h2 id="screen-h" className="display mt-1 text-2xl">{screen.name}</h2>
        <p className="num mt-1 text-sm text-fg-subtle">{screen.route}</p>
        <p className="mt-3 text-fg-muted">{screen.says}</p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {screen.options.map(([label, does]) => (
            <div key={label} className="py-2.5">
              <dt className="font-medium">{label}</dt>
              <dd className="text-sm text-fg-muted">{does}</dd>
            </div>
          ))}
        </dl>
        {screen.captured && <p className="mt-3 text-sm text-fg-subtle">{screen.captured}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2 sm:mt-auto sm:pt-5">
          <button type="button" className="btn btn-ghost" disabled={open.index === 0} onClick={() => onMove(open.index - 1)}>Previous</button>
          <button type="button" className="btn btn-ghost" disabled={open.index === n - 1} onClick={() => onMove(open.index + 1)}>Next</button>
          {screen.href && <Link href={screen.href} className="btn btn-ghost">Open this page</Link>}
          <button type="button" className="btn btn-quiet ml-auto" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
