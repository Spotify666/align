"use client";
// "Learn the shot": a coach demonstrating the defence on video, and the four moves to watch
// for beside it. The video is YouTube's, played in place: nothing is loaded from YouTube until
// the viewer taps play (then in its privacy-enhanced, no-cookie mode).
//
// Handedness follows the science, not a mirror. A left-handed batter is not a flipped
// right-hander: batting side and hand dominance are separate (at the 2003 World Cup most
// left-handed batters bowled right-handed, so their stronger hand was the top hand, the one
// that guides the bat), and flipping a video also turns the bowler's arm round. So the video is
// never flipped: the steps name the viewer's own sides, and say whether their stronger hand is
// on top.

import { useState, useSyncExternalStore } from "react";
import { loadProfile } from "@/lib/store";

export type StoryShot = "front" | "back";
export type Side = "right" | "left";

/** The videos, one per shot. To use another video, change its YouTube id and credit here. */
export const SHOT_VIDEOS: Record<StoryShot, { id: string; title: string; credit: string }> = {
  front: { id: "CdlYCoqUVEQ", title: "How to play a front-foot defence", credit: "Sikana, How to Play Cricket" },
  back: { id: "sKIwkvdAyJU", title: "How to play a back-foot defence", credit: "Sikana, How to Play Cricket" },
};

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * What to watch for, in order: the four moves of each defence, with the batter's own sides
 * named. A right-hander leads with the left shoulder and foot and has the left hand on top; a
 * left-hander the right.
 */
function steps(shot: StoryShot, bats: Side): Array<{ k: string; d: string }> {
  const f = bats === "right" ? "left" : "right";
  const b = bats;
  const setUp = {
    k: "Set up",
    d: `Side-on, ${f} shoulder and ${f} foot toward the bowler, knees soft, eyes level. ${cap(f)} hand on top of the handle, ${b} hand just below it.`,
  };
  return shot === "front"
    ? [
        setUp,
        { k: "Pick up", d: `The bat goes up straight back, a short pick-up with the hands by the ${b} hip. The head and ${f} shoulder start toward the line of the ball.` },
        { k: "Stride", d: `The ${f} foot steps to the pitch of the ball, the ${f} knee bends and the weight comes forward. The bat comes down late.` },
        {
          k: "Contact",
          d: `Head over the ${f} knee, the bat beside the ${f} pad and angled down, ${f} elbow up. The top (${f}) hand guides the bat, the bottom (${b}) hand stays loose: the ball drops dead. Hold it.`,
        },
      ]
    : [
        setUp,
        { k: "Back and across", d: `To a short ball the ${b} foot moves first, back toward the stumps and across into the line of the ball. The head stays still.` },
        { k: "Alongside", d: `The ${f} foot comes back next to the ${b} foot. Stand tall and side-on, the weight on the ${b} foot, the head forward over it.` },
        {
          k: "Contact",
          d: `${cap(f)} elbow high, the bat straight and angled down, the hands about belt height. The top (${f}) hand guides, the bottom (${b}) hand stays loose. Meet the ball under your eyes, then hold.`,
        },
      ];
}

/**
 * Which hand does the work. The top hand guides the bat and the bottom hand supports it, so
 * what matters is whether the batter's stronger hand is the top one. Batting left-handed with
 * a stronger right hand (or right-handed with a stronger left) puts it on top: the "reversed"
 * stance, which most left-handed batters use. Professionals were about 7 times more likely than
 * inexperienced batters to bat that way (Mann, Runswick & Allen, Sports Medicine 2016: an
 * association, not proof); at the 2003 World Cup, 25 of 41 left-handed batters bowled
 * right-handed (same paper).
 */
function handNote(bats: Side, stronger: Side): string {
  const top = bats === "right" ? "left" : "right";
  return stronger === top
    ? `Your stronger hand (${stronger}) is on top: let it guide the bat, and keep the bottom hand as a light support. This is the “reversed” stance most left-handed international batters use; professionals were about 7 times more likely than inexperienced batters to bat this way.`
    : `Your stronger hand (${stronger}) is at the bottom: the conventional stance. It tends to take over and push the bat at the ball: keep it loose and let the top (${top}) hand guide.`;
}

// The viewer's batting side and stronger hand: chosen once, shared by every video on the page
// and remembered on this device. Until chosen, the side in the profile (right by default) and a
// stronger right hand (as for most people).
interface Setting {
  key: string;
  initial: () => Side;
  now: Side | null;
  listeners: Set<() => void>;
}
const SIDES = ["right", "left"] as const;
const setting = (key: string, initial: () => Side): Setting => ({ key, initial, now: null, listeners: new Set() });
const battingSide = setting("align.demo.hand", () => loadProfile().handedness);
const strongerHand = setting("align.demo.strongHand", () => "right");

function readSetting(s: Setting): Side {
  try {
    const v = localStorage.getItem(s.key);
    if (v === "right" || v === "left") return v;
  } catch {
    /* storage unavailable */
  }
  return s.initial();
}
function changeSetting(s: Setting, v: Side) {
  s.now = v;
  try {
    localStorage.setItem(s.key, v);
  } catch {
    /* private mode: the choice lasts for this page */
  }
  s.listeners.forEach((l) => l());
}
function useSetting(s: Setting): Side {
  return useSyncExternalStore(
    (cb) => {
      s.listeners.add(cb);
      return () => s.listeners.delete(cb);
    },
    () => (s.now ??= readSetting(s)),
    () => "right",
  );
}

function Choice({ label, value, onChange, names }: { label: string; value: Side; onChange: (v: Side) => void; names: Record<Side, string> }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-fg-subtle">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line-strong p-0.5 text-xs">
        {SIDES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${value === v ? "bg-brand text-brand-fg" : "text-fg-muted hover:text-fg"}`}
          >
            {names[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ShotVideo({ shot = "front" }: { shot?: StoryShot }) {
  const video = SHOT_VIDEOS[shot];
  const bats = useSetting(battingSide);
  const stronger = useSetting(strongerHand);
  const [playing, setPlaying] = useState(false);
  const [thumb, setThumb] = useState(true);
  const watch = `https://www.youtube.com/watch?v=${video.id}`;
  const embed = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div className="lesson-card">
      <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="p-3 sm:p-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-fg">
            {playing ? (
              <iframe
                src={embed}
                title={`${video.title} (${video.credit})`}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <>
                {thumb && (
                  // eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, shown only until play
                  <img
                    src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setThumb(false)}
                    className="absolute inset-0 h-full w-full object-cover opacity-80 grayscale"
                  />
                )}
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
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Video: {video.credit}.{" "}
            <a className="underline" href={watch} target="_blank" rel="noopener noreferrer">
              Watch on YouTube
            </a>
            . Never flipped: a flipped batter isn&apos;t a real left-hander. If the batter in it bats the other way round from you, the steps name your sides.
          </p>
        </div>

        <div className="border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="space-y-2">
            <Choice label="You bat" value={bats} onChange={(v) => changeSetting(battingSide, v)} names={{ right: "Right-handed", left: "Left-handed" }} />
            <Choice label="Your stronger hand" value={stronger} onChange={(v) => changeSetting(strongerHand, v)} names={{ right: "Right", left: "Left" }} />
          </div>
          <p className="mt-5 font-semibold">What to watch for</p>
          <ol className="mt-3 space-y-3 text-sm">
            {steps(shot, bats).map((s, i) => (
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
          <div className="mt-5 rounded-xl border border-line p-4 text-sm">
            <p className="font-semibold">Which hand does the work</p>
            <p className="mt-1 text-fg-muted">
              The top hand guides the bat; the bottom hand supports it. Batting side is not the same as your stronger hand: at the 2003 World Cup, 25 of
              41 left-handed batters bowled right-handed. {handNote(bats, stronger)}
            </p>
            <p className="mt-2 text-xs text-fg-subtle">
              Source: Mann, Runswick &amp; Allen, “Hand and eye dominance in sport: are cricket batters taught to bat back-to-front?”, Sports Medicine
              2016 (43 professional and 93 inexperienced batters; an observed link, not proof).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
