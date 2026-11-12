"use client";

// Dual-angle capture: one ball filmed by two phones at once. A short plan of the session (where
// the phones go, what to do, how the videos get here), then the two videos, one slot at a time:
// a side video and a front video, each shown
// (its picture, name and length, with a tick) as soon as it is chosen, so the batter sees both
// were taken before anything starts. Two videos at most, and said before anything is chosen:
// each slot's picker takes exactly one video, so a third can't even be picked (no picker that
// takes several at once, which phones also make easy to miss). Aline still reads each video's
// angle itself and puts them right.

import { useEffect, useState } from "react";
import { Camera, Check, Upload } from "../icons";
import { CameraLineUp } from "./camera-line-up";
import { DualPlan } from "./pitch-guide";

export const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp";

export type TwoSlots = { side: File | null; front: File | null };
type Slot = keyof TwoSlots;

const SLOT_NAME: Record<Slot, string> = { side: "Side video", front: "Front video" };
const SLOT_HINT: Record<Slot, string> = { side: "Filmed from the side", front: "Filmed from the bowler's end" };

/** The session, in order. Short on purpose: the plan below shows where the phones go. */
const SESSION_STEPS = [
  "Put one phone side-on and one straight behind the bowler's stumps.",
  "Start both recordings, then play one ball. Keep the sound on: Aline matches the two videos by your movement and the sound.",
  "Share the other phone's video to this phone, then add both here.",
];

const seconds = (s: number) => (Number.isFinite(s) && s > 0 ? `${s < 10 ? s.toFixed(1) : Math.round(s)} s` : "");

const thumbs = new WeakMap<File, Promise<{ src: string | null; duration: number }>>();

/**
 * One still from a video (half a second in) and its length, read once per file and kept as a
 * small picture. The video is let go straight after, so no extra video decoder stays open
 * while the analysis needs them (phones have only a few).
 */
function grabThumb(file: File) {
  let p = thumbs.get(file);
  if (!p) {
    p = new Promise((resolve) => {
      const v = document.createElement("video");
      const u = URL.createObjectURL(file);
      let duration = NaN;
      let settled = false;
      const done = (src: string | null) => {
        if (settled) return;
        settled = true;
        v.removeAttribute("src");
        v.load();
        URL.revokeObjectURL(u);
        resolve({ src, duration });
      };
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.onloadedmetadata = () => {
        duration = v.duration;
        v.currentTime = Number.isFinite(duration) ? Math.min(0.5, duration / 2) : 0;
      };
      v.onseeked = () => {
        try {
          const w = 192;
          const h = Math.max(1, Math.round((w * v.videoHeight) / Math.max(1, v.videoWidth)));
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d")!.drawImage(v, 0, 0, w, h);
          done(c.toDataURL("image/jpeg", 0.75));
        } catch {
          done(null);
        }
      };
      v.onerror = () => done(null);
      setTimeout(() => done(null), 8000);
      v.src = u;
    });
    thumbs.set(file, p);
  }
  return p;
}

function useThumb(file: File | null) {
  const [t, setT] = useState<{ file: File; src: string | null; duration: number } | null>(null);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    void grabThumb(file).then((r) => alive && setT({ file, ...r }));
    return () => {
      alive = false;
    };
  }, [file]);
  return t && t.file === file ? t : null;
}

/** The video's still, filling its box (blank until it is read). */
export function VideoThumb({ file, className = "" }: { file: File; className?: string }) {
  const t = useThumb(file);
  if (!t?.src) return null;
  // A data URL made on this device: nothing for the image optimiser to do.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={t.src} alt="" aria-hidden className={`pointer-events-none h-full w-full object-cover ${className}`} />;
}

function SlotCard({ slot, file, disabled, onPick }: { slot: Slot; file: File | null; disabled: boolean; onPick: (files: File[]) => void }) {
  const length = seconds(useThumb(file)?.duration ?? NaN);
  return (
    <label
      className={`flex min-w-0 flex-col gap-2 rounded-2xl p-2.5 transition-colors ${file ? "border-2 border-brand" : "border border-line-strong"} ${disabled ? "pointer-events-none" : "cursor-pointer hover:border-brand"}`}
    >
      <span className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-sm font-semibold">{SLOT_NAME[slot]}</span>
        {file && (
          <span className="step-done flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg" aria-label="chosen">
            <Check size={13} />
          </span>
        )}
      </span>
      <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-line">
        {file ? (
          <VideoThumb file={file} />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-fg-muted">
            <Upload size={22} />
            <span className="text-sm font-medium text-fg">Choose</span>
            <span className="text-xs">{SLOT_HINT[slot]}</span>
          </span>
        )}
      </span>
      {file ? (
        <span className="min-w-0 px-0.5 text-xs">
          <span className="block truncate font-medium">{file.name}</span>
          <span className="text-fg-muted">
            {length ? `${length} · ` : ""}
            <span className="underline underline-offset-2">Change</span>
          </span>
        </span>
      ) : (
        <span className="px-0.5 text-xs text-fg-subtle">Not chosen yet</span>
      )}
      <input
        type="file"
        disabled={disabled}
        accept={VIDEO_ACCEPT}
        className="sr-only"
        aria-label={`Choose the ${SLOT_NAME[slot].toLowerCase()}`}
        onChange={(e) => {
          onPick(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** The first video, already checked: kept while the other angle is chosen again. */
function DoneCard({ slot, file, title }: { slot: Slot; file: File | null; title: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border-2 border-brand p-2.5">
      <span className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-sm font-semibold">{SLOT_NAME[slot]}</span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg" aria-label="checked">
          <Check size={13} />
        </span>
      </span>
      <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-line">{file && <VideoThumb file={file} />}</span>
      <span className="min-w-0 px-0.5 text-xs">
        <span className="block truncate font-medium">{file?.name ?? title}</span>
        <span className="text-fg-muted">Checked</span>
      </span>
    </div>
  );
}

/**
 * The two slots and the button that starts both. With `done`, the first video of the pair is
 * already checked (the second was refused): it stays, and only the other angle is chosen again.
 */
export function TwoVideoPicker({
  slots,
  onChange,
  onStart,
  onClose,
  disabled,
  done,
  onStartOne,
  onStartAgain,
}: {
  slots: TwoSlots;
  onChange: (s: TwoSlots) => void;
  onStart: (files: [File, File]) => void;
  onClose: () => void;
  disabled: boolean;
  done?: { slot: Slot; file: File | null; title: string };
  onStartOne?: (f: File) => void;
  onStartAgain?: () => void;
}) {
  const [next, setNext] = useState<File | null>(null);
  // Recording one angle with this phone: the line-up screen, opened for that camera position.
  const [recording, setRecording] = useState<Slot | null>(null);
  if (done) {
    const other: Slot = done.slot === "side" ? "front" : "side";
    const pickNext = (files: File[]) => setNext(files.find((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(f.name)) ?? null);
    const cards = [<DoneCard key="done" slot={done.slot} file={done.file} title={done.title} />, <SlotCard key="next" slot={other} file={next} disabled={disabled} onPick={pickNext} />];
    return (
      <section aria-labelledby="two-h" className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="two-h" className="text-lg font-semibold">Dual-angle capture</h2>
            <p className="mt-1 text-sm text-fg-muted">2 videos only: the same ball, filmed at the same time, one from the side and one from the front.</p>
          </div>
          <button type="button" onClick={onStartAgain} className="-my-2 inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-fg-muted hover:text-fg hover:underline">
            Start again
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">{done.slot === "side" ? cards : [...cards].reverse()}</div>
        <p className="text-sm" aria-live="polite">
          {next ? (
            <span className="font-medium">2 of 2 videos chosen.</span>
          ) : (
            <span className="text-fg-muted">{`${SLOT_NAME[done.slot]} checked. Now choose the ${other} video again.`}</span>
          )}
        </p>
        <button type="button" className="btn btn-primary w-full" disabled={!next || disabled} onClick={() => next && onStartOne?.(next)}>
          Check the {other} video
        </button>
      </section>
    );
  }
  const pick = (slot: Slot) => (files: File[]) => {
    const video = files.find((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(f.name));
    if (video) onChange({ ...slots, [slot]: video });
  };
  const both = slots.side && slots.front;
  const missing = !slots.side && !slots.front ? null : !slots.side ? "side" : !slots.front ? "front" : null;
  return (
    <section aria-labelledby="two-h" className="card space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="two-h" className="text-lg font-semibold">Dual-angle capture</h2>
          <p className="mt-1 text-sm text-fg-muted">One ball, two phones filming at the same time: one from the side, one from the front.</p>
        </div>
        <button type="button" onClick={onClose} className="-my-2 inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-fg-muted hover:text-fg hover:underline">
          Close
        </button>
      </div>
      <ol className="grid gap-2 text-sm text-fg-muted">
        {SESSION_STEPS.map((t, i) => (
          <li key={t} className="flex gap-2.5">
            <span className="num w-4 shrink-0 text-fg-subtle">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <DualPlan />
      <div className="grid grid-cols-2 gap-3">
        {(["side", "front"] as const).map((slot) => (
          <div key={slot} className="flex min-w-0 flex-col gap-1.5">
            <SlotCard slot={slot} file={slots[slot]} disabled={disabled} onPick={pick(slot)} />
            <button type="button" disabled={disabled} onClick={() => setRecording(slot)} aria-label={`Record the ${slot} video with this phone`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong px-2 text-sm font-medium text-fg-muted hover:text-fg">
              <Camera size={16} />
              Record here
            </button>
          </div>
        ))}
      </div>
      {recording && (
        <CameraLineUp
          initialView={recording === "side" ? "side" : "end"}
          onClose={() => setRecording(null)}
          onFiles={(files) => pick(recording)(Array.from(files ?? []))}
        />
      )}
      <p className="text-sm" aria-live="polite">
        {both ? (
          <span className="font-medium">2 of 2 videos chosen.</span>
        ) : (
          <span className="text-fg-muted">
            {missing ? `1 of 2 chosen. Now the ${missing} video.` : "Choose both videos."}
          </span>
        )}
      </p>
      <button type="button" className="btn btn-primary w-full" disabled={!both || disabled} onClick={() => both && onStart([slots.side!, slots.front!])}>
        Check both videos
      </button>
      <p className="text-xs text-fg-subtle">2 videos only. Linking the two phones live, with one countdown for both, isn&apos;t built yet: for now the second video is shared to this phone.</p>
    </section>
  );
}

export type TwoRun = { files: [File, File]; step: 1 | 2; firstAngle: "side" | "end" | null };

/** While two videos are analysed: both, one after the other, each with where it is. */
export function TwoVideoStrip({ run }: { run: TwoRun }) {
  return (
    <ol className="grid grid-cols-2 gap-3" aria-label="Your two videos">
      {run.files.map((f, i) => {
        const n = (i + 1) as 1 | 2;
        const state = run.step === n ? "now" : run.step > n ? "done" : "next";
        const angle = n === 1 && run.firstAngle ? (run.firstAngle === "side" ? "side angle" : "front angle") : null;
        return (
          <li key={`${f.name}-${f.size}`} className={`flex min-w-0 items-center gap-2.5 rounded-2xl p-2 ${state === "now" ? "border-2 border-brand" : "border border-line"}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-line">
              <VideoThumb file={f} className={state === "next" ? "opacity-60" : ""} />
              {state === "done" && (
                <span className="step-done absolute inset-0 m-auto flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-fg" aria-label="done">
                  <Check size={14} />
                </span>
              )}
            </span>
            <span className="min-w-0 text-xs">
              <span className="block font-semibold">Video {n}</span>
              <span className="block truncate text-fg-muted">{f.name}</span>
              <span className={`block ${state === "now" ? "font-medium" : "text-fg-subtle"}`}>{state === "now" ? "Checking now" : state === "done" ? `Done${angle ? ` · ${angle}` : ""}` : "Next"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
