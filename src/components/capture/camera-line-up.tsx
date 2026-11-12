"use client";

import { useEffect, useRef, useState } from "react";
import { detectFrame, loadPose } from "@/lib/capture/pose";
import { GUIDES, LEVEL_WITHIN, framing, ready, tiltFromGravity, type Check as State, type Framing, type LineUpView, type Tilt } from "@/lib/capture/line-up";
import { CAMERA_STEPS } from "./pitch-guide";
import { Check, Cross, Info, Record as RecordIcon } from "../icons";

type Cam = "starting" | "live" | "paused" | "unavailable";
type Sensor = "waiting" | "ask" | "on" | "none";
type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const sameFraming = (a: Framing | null, b: Framing) =>
  !!a && a.whole === b.whole && a.size === b.size && a.sizeHint === b.sizeHint && a.one === b.one && a.turned === b.turned;

function Row({ state, children }: { state: State; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className={`mt-0.5 shrink-0 ${state === "pass" ? "text-ok" : state === "warn" ? "text-warn" : "text-fg-subtle"}`} aria-hidden>
        {state === "pass" ? <Check size={16} /> : state === "warn" ? <Info size={16} /> : <span className="inline-block h-4 w-4 text-center leading-4">–</span>}
      </span>
      <span className={state === "unknown" ? "text-fg-muted" : "text-fg"}>{children}</span>
    </li>
  );
}

/**
 * "Line up the camera": the phone's live picture with guides for where the batter should be,
 * a check of what the picture shows (whole batter, size, one person, turned the right way) and
 * a level from the phone's motion sensor. Then "Record now" opens the phone's own camera, which
 * records better than a web page can; the phone stays where it was lined up.
 *
 * Nothing is recorded, saved or sent here. Without a camera it is the same guides and the
 * written steps; without a motion sensor it says so and leaves the level to the eye. It is
 * guidance: the recording itself is still checked before it is analysed.
 */
export function CameraLineUp({ onClose, onFiles }: { onClose: () => void; onFiles: (files: FileList | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [view, setView] = useState<LineUpView>("side");
  const viewRef = useRef<LineUpView>("side");
  const [cam, setCam] = useState<Cam>("starting");
  const [attempt, setAttempt] = useState(0);
  const [picture, setPicture] = useState<{ w: number; h: number } | null>(null);
  const [seen, setSeen] = useState<Framing | null>(null);
  const [poseOff, setPoseOff] = useState(false);
  const [tilt, setTilt] = useState<Tilt | null>(null);
  const [sensor, setSensor] = useState<Sensor>("waiting");

  const pick = (v: LineUpView) => {
    viewRef.current = v;
    setView(v);
    setSeen(null);
  };
  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return release;
  }, []);

  // The camera, and what the picture shows.
  useEffect(() => {
    let stop = false;
    let raf = 0;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stop) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        if (stop) return;
        setCam("live");
        setPicture({ w: v.videoWidth, h: v.videoHeight });
        const pose = await loadPose().catch(() => null);
        if (stop) return;
        if (!pose) return setPoseOff(true);
        let last = 0;
        const loop = (now: number) => {
          if (stop || !stream.current) return;
          raf = requestAnimationFrame(loop);
          if (document.hidden || now - last < 250 || v.readyState < 2) return;
          last = now;
          const r = detectFrame(pose, v, Math.round(now), null);
          const next = framing(r.body, r.people, viewRef.current, { w: v.videoWidth, h: v.videoHeight });
          setSeen((prev) => (sameFraming(prev, next) ? prev : next));
          setPicture((p) => (p && p.w === v.videoWidth && p.h === v.videoHeight ? p : { w: v.videoWidth, h: v.videoHeight }));
        };
        raf = requestAnimationFrame(loop);
      } catch {
        if (!stop) setCam("unavailable");
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      release();
    };
  }, [attempt]);

  // The level, from gravity.
  useEffect(() => {
    let got = false;
    let last = 0;
    const on = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      const t = tiltFromGravity(g?.x, g?.y, g?.z);
      if (!got && g && typeof g.x === "number") {
        got = true;
        setSensor("on");
      }
      const now = performance.now();
      if (now - last < 200) return;
      last = now;
      const next = t ? { roll: Math.round(t.roll), lean: Math.round(t.lean) } : null;
      setTilt((prev) => (prev?.roll === next?.roll && prev?.lean === next?.lean ? prev : next));
    };
    window.addEventListener("devicemotion", on);
    const needsAsking = typeof window.DeviceMotionEvent !== "undefined" && typeof (window.DeviceMotionEvent as unknown as MotionPermission).requestPermission === "function";
    const timer = window.setTimeout(() => {
      if (!got) setSensor(needsAsking ? "ask" : "none");
    }, 1500);
    return () => {
      window.removeEventListener("devicemotion", on);
      window.clearTimeout(timer);
    };
  }, []);

  const askForLevel = async () => {
    try {
      const answer = await (window.DeviceMotionEvent as unknown as MotionPermission).requestPermission?.();
      setSensor(answer === "granted" ? "waiting" : "none");
    } catch {
      setSensor("none");
    }
  };

  const g = GUIDES[view];
  const steps = CAMERA_STEPS[view];
  const ratio = picture && cam !== "unavailable" ? picture.w / picture.h : g.landscape ? 16 / 9 : 9 / 16;
  const level: State = sensor !== "on" || !tilt ? "unknown" : Math.abs(tilt.roll) <= LEVEL_WITHIN ? "pass" : "warn";
  const isReady = cam === "live" && ready(seen, sensor === "on" ? tilt : null);
  const big = view === "side" ? "Too close: move back so the stumps and where the ball bounces fit in" : "Too close: move back or zoom out a little";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="lineup-h"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-bg p-0 text-fg open:flex landscape:flex-row"
    >
      <div className="relative grid min-h-0 flex-1 place-items-center bg-black [container-type:size]">
        <div className="relative overflow-hidden bg-surface" style={{ aspectRatio: String(ratio), width: `min(100cqw, calc(100cqh * ${ratio}))` }}>
          <video ref={video} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${cam === "live" ? "" : "invisible"}`} />
          {/* Where the batter goes: a frame for the body and the line the feet stand on. */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <rect
              x={g.box[0] * 100}
              y={g.box[1] * 100}
              width={(g.box[2] - g.box[0]) * 100}
              height={(g.box[3] - g.box[1]) * 100}
              fill="none"
              stroke={seen?.whole === "pass" && seen.size === "pass" ? "var(--ok)" : "#F4F1E8"}
              strokeWidth="2"
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
            />
            <line x1="0" x2="100" y1={g.ground * 100} y2={g.ground * 100} stroke="#F4F1E8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <p className="pointer-events-none absolute left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-[#F4F1E8]" style={{ top: `calc(${g.ground * 100}% + 4px)` }}>
            Feet on this line
          </p>
          <p className="pointer-events-none absolute rounded bg-black/70 px-1.5 py-0.5 text-xs text-[#F4F1E8]" style={{ left: `${g.box[0] * 100}%`, top: `calc(${g.box[1] * 100}% - 1.6rem)` }}>
            Whole batter inside
          </p>
          {cam !== "live" && (
            <div className="absolute inset-x-0 top-0 p-3 text-center text-sm text-fg-muted">
              {cam === "starting" && "Starting the camera…"}
              {cam === "paused" && (
                <button type="button" className="btn btn-ghost" onClick={() => { setCam("starting"); setAttempt((n) => n + 1); }}>
                  Show the camera again
                </button>
              )}
              {cam === "unavailable" && "The camera isn't available here. Use the frame and the steps as a guide, then record."}
            </div>
          )}
        </div>
      </div>

      <div className="flex max-h-[62dvh] shrink-0 flex-col gap-3 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] landscape:max-h-none landscape:w-80">
        <div className="flex items-center justify-between gap-3">
          <h2 id="lineup-h" className="display text-xl">Line up the camera</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted hover:text-fg">
            <Cross size={20} />
          </button>
        </div>
        <div role="group" aria-label="Camera position" className="grid grid-cols-2 gap-1.5">
          {(["side", "end"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => pick(v)}
              className={`min-h-11 rounded-full border px-2 text-sm font-medium transition-colors duration-150 ${view === v ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
            >
              {CAMERA_STEPS[v].title}
            </button>
          ))}
        </div>

        {cam === "unavailable" ? (
          <ol className="grid gap-1.5 text-sm text-fg-muted">
            {steps.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="num w-4 shrink-0 text-fg-subtle">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="grid gap-1.5">
            <Row state={seen?.turned ?? "unknown"}>
              {seen?.turned === "warn" ? (g.landscape ? "Turn the phone on its side" : "Turn the phone upright") : g.landscape ? "Phone on its side" : "Phone upright"}
            </Row>
            <Row state={poseOff ? "unknown" : (seen?.whole ?? "unknown")}>
              {poseOff ? "Can't check the picture here: use the frame" : seen?.whole === "pass" ? "Whole batter in the picture" : seen?.whole === "warn" ? "Head or feet are cut off: move back" : "Waiting to see the batter"}
            </Row>
            {!poseOff && (
              <Row state={seen?.size ?? "unknown"}>
                {seen?.sizeHint === "closer" ? "Batter is small: move closer or zoom in" : seen?.sizeHint === "back" ? big : seen?.size === "pass" ? "Good size" : "Size: waiting"}
              </Row>
            )}
            {!poseOff && seen?.one === "warn" && <Row state="warn">More than one person: only the batter should be in the picture</Row>}
            <Row state={level}>
              {level === "pass" ? "Level" : level === "warn" ? `Tilted ${Math.abs(tilt!.roll)}°: straighten the phone` : sensor === "on" ? "Stand the phone up to check the level" : sensor === "waiting" ? "Level: waiting" : sensor === "ask" ? (
                <button type="button" onClick={askForLevel} className="-my-2 inline-flex min-h-11 items-center underline underline-offset-4">
                  Turn on the level
                </button>
              ) : "No tilt sensor here: check the line under the feet looks level"}
            </Row>
          </ul>
        )}

        <p className="min-h-5 text-sm font-medium" aria-live="polite">
          {isReady ? "Ready. Keep the phone where it is and record." : ""}
        </p>
        <label className="btn btn-primary w-full cursor-pointer text-base font-semibold">
          <RecordIcon size={18} />
          Record now
          <input
            type="file"
            accept="video/*"
            capture="environment"
            className="sr-only"
            onClick={() => {
              // The phone's camera can't open while this page holds it.
              release();
              setCam((c) => (c === "unavailable" ? c : "paused"));
            }}
            onChange={(e) => {
              const files = e.target.files;
              if (!files?.length) return;
              onFiles(files);
              onClose();
            }}
          />
        </label>
        <p className="text-xs text-fg-subtle">Opens your phone&apos;s own camera, which records better than a web page can. Nothing is recorded or sent from this screen.</p>
      </div>
    </dialog>
  );
}
