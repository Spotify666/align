"use client";
// "Learn the shot": a coach demonstrating the defence on video, and the four moves to watch
// for beside it. The video is YouTube's, played in place: nothing is loaded from YouTube until
// the viewer taps play (then in its privacy-enhanced, no-cookie mode). A left-handed batter
// can mirror it, so the shot is seen the way they play it.

import { useState, useSyncExternalStore } from "react";
import { loadProfile } from "@/lib/store";

export type StoryShot = "front" | "back";
export type BattingHand = "right" | "left";

/** The videos, one per shot. To use another video, change its YouTube id and credit here. */
export const SHOT_VIDEOS: Record<StoryShot, { id: string; title: string; credit: string }> = {
  front: { id: "CdlYCoqUVEQ", title: "How to play a front-foot defence", credit: "Sikana, How to Play Cricket" },
  back: { id: "sKIwkvdAyJU", title: "How to play a back-foot defence", credit: "Sikana, How to Play Cricket" },
};

/** What to watch for, in order: the four moves of each defence. */
const STEPS: Record<StoryShot, Array<{ k: string; d: string }>> = {
  front: [
    { k: "Set up", d: "Side-on, knees soft, eyes level. Both hands near the top of the handle, the top hand above the bottom hand." },
    { k: "Pick up", d: "The bat goes up straight back, a short pick-up with the hands by the back hip. The head and front shoulder lead toward the ball." },
    { k: "Stride", d: "The front foot steps to the pitch of the ball, the front knee bends and the weight comes forward. The bat comes down late." },
    { k: "Contact", d: "Head over the front knee, bat beside the pad and angled down, front elbow up. Soft hands: the ball drops dead. Hold it." },
  ],
  back: [
    { k: "Set up", d: "Side-on, knees soft, eyes level. Both hands near the top of the handle, the top hand above the bottom hand." },
    { k: "Back and across", d: "To a short ball the back foot moves first, back toward the stumps and across into the line. The head stays still." },
    { k: "Alongside", d: "The front foot comes back next to the back foot. Stand tall and side-on, weight back, head forward over it." },
    { k: "Contact", d: "Front elbow high, the bat straight and angled down, hands about belt height. Meet it under your eyes with soft hands, then hold." },
  ],
};

// Which batter the videos show: chosen once, shared by every video on the page and
// remembered on this device; until chosen, the hand in the profile (right by default).
const HAND_KEY = "align.demo.hand";
const handListeners = new Set<() => void>();
let handNow: BattingHand | null = null;
function readHand(): BattingHand {
  try {
    const v = localStorage.getItem(HAND_KEY);
    if (v === "left" || v === "right") return v;
  } catch {
    /* storage unavailable */
  }
  return loadProfile().handedness;
}
function setHand(h: BattingHand) {
  handNow = h;
  try {
    localStorage.setItem(HAND_KEY, h);
  } catch {
    /* private mode: the choice lasts for this page */
  }
  handListeners.forEach((l) => l());
}
function useBattingHand(): BattingHand {
  return useSyncExternalStore(
    (cb) => {
      handListeners.add(cb);
      return () => handListeners.delete(cb);
    },
    () => (handNow ??= readHand()),
    () => "right",
  );
}

export function ShotVideo({ shot = "front" }: { shot?: StoryShot }) {
  const video = SHOT_VIDEOS[shot];
  const steps = STEPS[shot];
  const hand = useBattingHand();
  const flip = hand === "left";
  const [playing, setPlaying] = useState(false);
  const [thumb, setThumb] = useState(true);
  const watch = `https://www.youtube.com/watch?v=${video.id}`;
  const embed = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div className="lesson-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-4">
        <p className="text-xs text-fg-subtle">{flip ? "Mirrored for a left-handed batter" : "Shown for a right-handed batter"}</p>
        <div role="radiogroup" aria-label="Batter" className="inline-flex rounded-full border border-line-strong p-0.5 text-xs">
          {(["right", "left"] as const).map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={hand === h}
              onClick={() => setHand(h)}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${hand === h ? "bg-brand text-brand-fg" : "text-fg-muted hover:text-fg"}`}
            >
              {h === "right" ? "Right-handed" : "Left-handed"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="p-3 sm:p-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-fg">
            <div className="absolute inset-0" style={flip ? { transform: "scaleX(-1)" } : undefined}>
              {playing ? (
                <iframe
                  src={embed}
                  title={`${video.title} (${video.credit})`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                thumb && (
                  // eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, shown only until play
                  <img
                    src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setThumb(false)}
                    className="h-full w-full object-cover opacity-80 grayscale"
                  />
                )
              )}
            </div>
            {!playing && (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="group absolute inset-0 flex flex-col items-center justify-center gap-3 text-bg"
                aria-label={`Play the video: ${video.title}`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bg text-fg transition-transform group-hover:scale-105 group-focus-visible:scale-105">
                  <svg width="22" height="22" viewBox="0 0 14 14" aria-hidden>
                    <path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
                  </svg>
                </span>
                <span className="rounded-full bg-fg px-3 py-1 text-sm font-semibold">{video.title}</span>
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Video: {video.credit}.{" "}
            <a className="underline" href={watch} target="_blank" rel="noopener noreferrer">
              Watch on YouTube
            </a>
          </p>
        </div>

        <div className="border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0">
          <p className="font-semibold">What to watch for</p>
          <ol className="mt-3 space-y-3 text-sm">
            {steps.map((s, i) => (
              <li key={s.k} className="flex gap-3">
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold">{s.k}.</span> <span className="text-fg-muted">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
