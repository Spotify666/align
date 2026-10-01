"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { analyze } from "@/engine/analyze";
import { assessCapture } from "@/engine/quality";
import { encodeTracks, quantise } from "@/engine/tracks-codec";
import type { CaptureObservation, CaptureQuality, ImgPoint, Tier } from "@/engine/types";
import { readVideoTrack } from "@/lib/capture/mp4";
import { FrameQualitySampler } from "@/lib/capture/frame-quality";
import { detectFrame, loadPose, seek } from "@/lib/capture/pose";
import { buildObservation, EMPTY_MARKS, type Marks, type TrackingResult } from "@/lib/capture/build-observation";
import { loadProfile, saveAnalysis, saveProfile, type LocalProfile } from "@/lib/store";
import { isSessionUrl, sessionMedia } from "@/lib/session-media";
import { CaptureChecklist } from "../report/panels";
import { CameraPlacementDiagram, LiveFramingCheck } from "./setup-guide";
import { MarkEvidence } from "./mark-evidence";
import { Check, Chevron, Lock, Upload, Record as RecordIcon } from "../icons";

type Phase = "intent" | "tier" | "setup" | "source" | "checking" | "gate" | "trim" | "tracking" | "side" | "mark" | "processing" | "error";

interface Meta {
  kind: "video" | "photo";
  width: number;
  height: number;
  containerFps: number | null;
  fpsSource: CaptureObservation["media"]["fpsSource"];
  durationSec: number;
}

const MAX_FRAMES = 300;
const WINDOW_SEC = 2.5;
const STAGES = ["Tracking batter", "Finding bat and ball", "Reconstructing movement", "Classifying shot", "Computing measures", "Preparing report"];

export function CaptureFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intent");
  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const [tier] = useState<Tier>("quick");
  const [guardianOk, setGuardianOk] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [slow, setSlow] = useState(1);
  const [gate, setGate] = useState<CaptureQuality | null>(null);
  const [start, setStart] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [tracking, setTracking] = useState<TrackingResult | null>(null);
  const [marks, setMarks] = useState<Marks>(EMPTY_MARKS);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const bindVideo = (el: HTMLVideoElement | null) => {
    video.current = el;
    setVideoEl((cur) => (cur === el ? cur : el));
  };
  const img = useRef<HTMLImageElement | null>(null);

  useEffect(() => () => {
    if (url && !isSessionUrl(url)) URL.revokeObjectURL(url);
  }, [url]);

  const minor = profile.ageBand === "u13" || profile.ageBand === "13_15" || profile.ageBand === "16_18";
  const realFps = meta?.containerFps ? meta.containerFps * slow : null;
  const fail = (msg: string) => {
    setError(msg);
    setPhase("error");
  };

  // ---------- 1. Read the file, 2. quick quality gate ----------
  async function onFile(f: File) {
    setFile(f);
    const u = URL.createObjectURL(f);
    setUrl(u);
    setPhase("checking");
    try {
      if (f.type.startsWith("image/")) {
        const im = new Image();
        im.src = u;
        await im.decode();
        img.current = im;
        setMeta({ kind: "photo", width: im.naturalWidth, height: im.naturalHeight, containerFps: null, fpsSource: "unknown", durationSec: 0 });
        await runGate({ kind: "photo", width: im.naturalWidth, height: im.naturalHeight, containerFps: null, fpsSource: "unknown", durationSec: 0 }, im);
        return;
      }
      const track = await readVideoTrack(f);
      const v = video.current!;
      v.src = u;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("This video format can't be decoded on this device. Try MP4 (H.264) or MOV."));
      });
      let fps = track?.fps ?? null;
      let fpsSource: Meta["fpsSource"] = track ? "container" : "unknown";
      if (!fps && "requestVideoFrameCallback" in v) {
        fps = await estimatePlaybackFps(v);
        fpsSource = fps ? "playback" : "unknown";
      }
      const m: Meta = { kind: "video", width: v.videoWidth, height: v.videoHeight, containerFps: fps, fpsSource, durationSec: v.duration };
      setMeta(m);
      await runGate(m, null);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Could not read this file.");
    }
  }

  async function runGate(m: Meta, image: HTMLImageElement | null) {
    const pose = await loadPose();
    const sampler = new FrameQualitySampler(m.width / m.height);
    const body: ImgPoint[][] = [];
    const quality = [];
    let people = 1;
    const times = m.kind === "photo" ? [0] : Array.from({ length: 10 }, (_, i) => (m.durationSec * (i + 0.5)) / 10);
    let prevHip: [number, number] | null = null;
    for (let i = 0; i < times.length; i++) {
      const src = image ?? video.current!;
      if (!image) await seek(video.current!, times[i]!);
      quality.push(sampler.sample(src, i));
      const r = detectFrame(pose, src, Math.round(times[i]! * 1000) + i, prevHip);
      prevHip = r.hip;
      people = Math.max(people, r.people);
      body.push(r.body);
    }
    const probe: CaptureObservation = {
      schema: "align.observation/1",
      id: "probe",
      source: "browser_capture",
      demo: false,
      media: { kind: m.kind, width: m.width, height: m.height, fps: m.containerFps ? m.containerFps * slow : null, fpsSource: m.fpsSource, durationMs: m.durationSec * 1000, frameCount: body.length },
      tier,
      athlete: { handedness: profile.handedness, heightCm: profile.heightCm },
      camera: { view: "side_on", bowlerSide: "right" },
      calibration: { source: "none", metresPerUnit: null, stumpsX: null, groundY: null },
      quality: { frames: quality, maxPeople: people },
      t: times.map((t) => t * 1000),
      body,
      bat: { source: "none", handle: body.map(() => null), toe: body.map(() => null) },
      ball: { source: "none", points: body.map(() => null) },
      marks: { bounceFrame: null, contactFrame: null },
    };
    setGate(assessCapture(probe));
    setPhase("gate");
  }

  // ---------- 3. Track the batter over the chosen window ----------
  async function track() {
    if (!meta) return;
    setPhase("tracking");
    try {
      const pose = await loadPose();
      if (meta.kind === "photo") {
        const r = detectFrame(pose, img.current!, 1, null);
        const sampler = new FrameQualitySampler(meta.width / meta.height);
        setTracking({
          t: [0],
          body: [r.body],
          depth: [r.depth],
          people: r.people,
          quality: [sampler.sample(img.current!, 0)],
          fps: 0,
          fpsSource: "unknown",
          width: meta.width,
          height: meta.height,
          durationMs: 0,
          kind: "photo",
        });
        setPhase("side");
        return;
      }
      const cFps = meta.containerFps ?? 30;
      const rFps = cFps * slow;
      const windowMedia = Math.min(meta.durationSec - start, WINDOW_SEC * slow);
      const containerFrames = Math.max(2, Math.floor(windowMedia * cFps));
      const stride = Math.max(1, Math.ceil(containerFrames / MAX_FRAMES));
      const count = Math.floor(containerFrames / stride);
      const v = video.current!;
      const sampler = new FrameQualitySampler(meta.width / meta.height);
      const out: TrackingResult = {
        t: [],
        body: [],
        depth: [],
        people: 1,
        quality: [],
        fps: rFps / stride,
        fpsSource: meta.fpsSource,
        width: meta.width,
        height: meta.height,
        durationMs: ((count * stride) / rFps) * 1000,
        kind: "video",
      };
      const mediaTimes: number[] = [];
      let prevHip: [number, number] | null = null;
      setProgress({ done: 0, total: count });
      for (let i = 0; i < count; i++) {
        const mt = start + (i * stride + 0.5) / cFps;
        mediaTimes.push(mt);
        await seek(v, mt);
        const r = detectFrame(pose, v, 10 + Math.round(mt * 1000), prevHip);
        prevHip = r.hip;
        out.body.push(r.body);
        out.depth.push(r.depth);
        out.people = Math.max(out.people, r.people);
        out.t.push(Math.round(((i * stride) / rFps) * 1000 * 100) / 100);
        if (i % Math.max(1, Math.round(count / 24)) === 0) out.quality.push(sampler.sample(v, i));
        if (i % 4 === 0) setProgress({ done: i + 1, total: count });
      }
      setProgress({ done: count, total: count });
      mediaTimesRef.current = mediaTimes;
      setTracking(out);
      setPhase("mark");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Tracking failed on this device.");
    }
  }
  const mediaTimesRef = useRef<number[]>([]);

  // ---------- 4. Analyse, store locally, open the report ----------
  async function finish(finalMarks: Marks) {
    if (!tracking) return;
    setPhase("processing");
    try {
      const id = crypto.randomUUID();
      for (let s = 1; s <= 3; s++) {
        setStage(s);
        await new Promise((r) => setTimeout(r, 120));
      }
      const raw = buildObservation({ id, tracking, marks: finalMarks, tier, handedness: profile.handedness, heightCm: profile.heightCm });
      const obs = quantise(raw);
      setStage(4);
      const createdAt = new Date().toISOString();
      const payload = analyze(obs, { analysisId: id, createdAt });
      setStage(5);
      const gz = await encodeTracks(obs);
      const keyframes = meta?.kind === "video" ? await grabKeyframes(video.current!, mediaTimesRef.current, payload.evidence_frames) : {};
      await saveAnalysis(
        {
          id,
          createdAt,
          recordedAt: file?.lastModified ? new Date(file.lastModified).toISOString() : createdAt,
          payload,
          title: file?.name?.replace(/\.[^.]+$/, "") ?? "Front-foot defence",
          notes: "",
          tags: [],
          representative: false,
          cloud: null,
        },
        gz,
        keyframes,
      );
      if (url) sessionMedia.set(id, { url, mediaTimes: meta?.kind === "video" ? mediaTimesRef.current : null });
      setStage(6);
      router.push(`/report/${id}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Analysis failed.");
    }
  }

  // ---------- UI ----------
  return (
    <>
      <video ref={bindVideo} muted playsInline preload="auto" className="hidden" />
      <Shell step={STEP_OF[phase]}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            className="space-y-6"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
      {phase === "intent" && (
        <>
          <p className="eyebrow">New analysis</p>
          <h1 className="display text-[2.4rem] sm:text-5xl">What are you working on?</h1>
          <button
            className="card card-hover group w-full p-5 text-left border-brand/60 ring-1 ring-brand/30 transition-shadow"
            onClick={() => setPhase("tier")}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-lg font-semibold">Front-foot defence</span>
              <span className="chip border-ok/50 text-ok">Supported</span>
            </span>
            <span className="mt-1 block text-sm text-fg-muted">We first confirm the shot really is a forward defence, then measure it.</span>
            <span className="btn btn-primary mt-4 w-full sm:w-auto">
              Start <Chevron size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
          <div className="card p-5">
            <p className="font-semibold">What happens next · about 3 minutes</p>
            <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {[
                "Pick one phone (Quick Check)",
                "Set the camera: side-on, slow motion",
                "Add your clip — it stays on your phone",
                "We check the recording before processing",
                "Your body is tracked on your phone",
                "You tap the ball and bat on a few frames",
                "You get the verdict, measures and one drill",
              ].map((t, i) => (
                <li key={t} className="flex gap-2.5"><span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[0.65rem] font-semibold text-brand">{i + 1}</span><span className="text-fg-muted">{t}</span></li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-sm font-medium text-fg-muted">Coming after validation</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {["Drives", "Pull and hook", "Cut", "Sweep", "Back-foot defence"].map((s) => (
                <li key={s} className="chip border-line text-fg-subtle"><Lock size={12} /> {s}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-fg-subtle">Uploading these now still works: they are recognised and the defence score is withheld.</p>
          </div>
        </>
      )}

      {phase === "tier" && (
        <>
          <h1 className="display text-[2.4rem] sm:text-5xl">How will you capture it?</h1>
          <div className="grid gap-3">
            <button className="card p-5 text-left border-brand/60 ring-1 ring-brand/40" onClick={() => setPhase("setup")}>
              <span className="flex items-center justify-between"><span className="text-lg font-semibold">Quick Check</span><span className="chip border-ok/50 text-ok">Recommended now</span></span>
              <span className="mt-1 block text-sm text-fg-muted">One phone in slow-motion. Shot family, timing windows and 2D measures; depth values are labelled estimates.</span>
            </button>
            <Link href="/sample/session3d" className="card p-5 block">
              <span className="flex items-center justify-between"><span className="text-lg font-semibold">3D Session</span><span className="chip border-warn/50 text-warn">Preview · demo only</span></span>
              <span className="mt-1 block text-sm text-fg-muted">Two synced, calibrated phones for triangulated 3D. See how it reports with demo data; live two-phone sync is not available yet.</span>
            </Link>
            <div className="card p-5 opacity-60">
              <span className="flex items-center justify-between"><span className="text-lg font-semibold">Lab / Academy</span><span className="chip border-line-strong text-fg-subtle">Planned</span></span>
              <span className="mt-1 block text-sm text-fg-muted">Multi-camera, optional bat sensor and force data.</span>
            </div>
          </div>
        </>
      )}

      {phase === "setup" && (
        <>
          <h1 className="display text-[2.4rem] sm:text-5xl">Set up the camera</h1>
          <CameraPlacementDiagram />
          <ul className="grid gap-2 text-sm">
            {[
              "Slow-motion mode (120 or 240 fps) in your camera app",
              "Landscape, phone fixed on a tripod or wedged still",
              "Square-on to the batter at hip height, 6–8 m away",
              "Batter, whole bat, stumps and bounce zone in frame",
              "Start before the ball is released; stop after the follow-through",
              "Nobody standing between the camera and the batter",
            ].map((t) => (
              <li key={t} className="flex gap-2"><Check size={16} className="text-brand mt-0.5 shrink-0" /> {t}</li>
            ))}
          </ul>
          <LiveFramingCheck />
          <div className="card p-4 space-y-3">
            <p className="font-semibold flex items-center gap-2"><Lock size={16} /> Privacy, before you upload</p>
            <ul className="text-sm text-fg-muted list-disc pl-5 space-y-1">
              <li>Your video is processed on this device. It is not uploaded.</li>
              <li>We keep only movement tracks (~20 KB), a few still frames and the report, on this device.</li>
              <li>Cloud saving, coach sharing and any use for model training are separate choices you make later.</li>
            </ul>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={profile.consentProcessing}
                onChange={(e) => { const p = { ...profile, consentProcessing: e.target.checked }; setProfile(p); saveProfile(p); }} />
              <span>I agree to my movement (biometric) data being processed on this device to produce this analysis.</span>
            </label>
            {minor && (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={guardianOk} onChange={(e) => setGuardianOk(e.target.checked)} />
                <span>I am under 18 and a parent or guardian has agreed to this.</span>
              </label>
            )}
            <p className="text-xs text-fg-subtle">
              Batting {profile.handedness}-handed{profile.heightCm ? `, ${profile.heightCm} cm` : ", height not set"} · <Link href="/profile" className="underline">change in profile</Link>
            </p>
          </div>
          <button className="btn btn-primary w-full" disabled={!profile.consentProcessing || (minor && !guardianOk)} onClick={() => setPhase("source")}>
            Continue to video
          </button>
        </>
      )}

      {phase === "source" && (
        <>
          <h1 className="display text-[2.4rem] sm:text-5xl">Add your front-foot defence clip</h1>
          <p className="text-fg-muted">Record in your camera app&apos;s slow-motion mode, then choose the clip. MP4 or MOV, under about 30 seconds.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="card p-6 cursor-pointer flex flex-col items-center gap-2 text-center hover:border-line-strong">
              <Upload size={26} className="text-brand" />
              <span className="font-semibold">Choose a video</span>
              <span className="text-xs text-fg-subtle">Best: slow-motion clip from your camera app</span>
              <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <label className="card p-6 cursor-pointer flex flex-col items-center gap-2 text-center hover:border-line-strong">
              <RecordIcon size={26} className="text-bad" />
              <span className="font-semibold">Record now</span>
              <span className="text-xs text-fg-subtle">Opens your camera (often 30 fps — timing measures may be withheld)</span>
              <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </div>
          <p className="text-xs text-fg-subtle">A photo is accepted as a posture screen only: no shot identity, timing, bat or ball claims.</p>
        </>
      )}

      {phase === "checking" && (
        <>
          <h1 className="display text-4xl">Checking the recording…</h1>
          <p className="text-fg-muted">Reading frame rate and resolution, sampling frames for light, blur, shake and full-body visibility.</p>
          <div className="h-1 w-full overflow-hidden rounded bg-line"><div className="h-full w-1/3 animate-pulse bg-brand" /></div>
        </>
      )}

      {phase === "gate" && gate && meta && (
        <>
          <p className="eyebrow">Quality gate</p>
          <h1 className="display text-4xl">{gate.status === "fail" ? "This recording can't be analysed" : gate.status === "warn" ? "Usable, with warnings" : "Recording looks good"}</h1>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="card p-3"><dt className="text-fg-subtle">Frame rate</dt><dd className="num text-lg">{realFps ? `${Math.round(realFps)} fps` : "unknown"}</dd><dd className="text-xs text-fg-subtle">{meta.fpsSource === "container" ? "from file" : meta.fpsSource === "playback" ? "estimated" : ""}</dd></div>
            <div className="card p-3"><dt className="text-fg-subtle">Resolution</dt><dd className="num text-lg">{meta.width}×{meta.height}</dd></div>
            <div className="card p-3"><dt className="text-fg-subtle">Length</dt><dd className="num text-lg">{meta.kind === "photo" ? "photo" : `${meta.durationSec.toFixed(1)} s`}</dd></div>
          </dl>
          {meta.kind === "video" && (
            <label className="block text-sm">
              <span className="text-fg-muted">Was this exported as a slowed-down video (slow-motion baked in)?</span>
              <select className="field mt-1" value={slow} onChange={(e) => { setSlow(Number(e.target.value)); }}>
                <option value={1}>No — plays at real speed (or it&apos;s a native high-fps file)</option>
                <option value={4}>Yes — 4× slowed (120 fps slow-mo)</option>
                <option value={8}>Yes — 8× slowed (240 fps slow-mo)</option>
              </select>
            </label>
          )}
          <div className="card px-4"><CaptureChecklist checks={gate.checks} /></div>
          <div className="flex flex-wrap gap-3">
            {gate.status !== "fail" ? (
              <button className="btn btn-primary" onClick={() => (meta.kind === "photo" || meta.durationSec <= WINDOW_SEC * slow + 0.2 ? track() : setPhase("trim"))}>
                {meta.kind === "photo" ? "Continue with posture screen" : "Continue"}
              </button>
            ) : (
              <p className="text-sm text-fg-muted w-full">Nothing has been processed — fix the items above and record again.</p>
            )}
            <button className="btn btn-ghost" onClick={() => { setGate(null); setFile(null); setPhase("source"); }}>Record again</button>
          </div>
        </>
      )}

      {phase === "trim" && meta && (
        <>
          <h1 className="display text-4xl">Choose the moment of the shot</h1>
          <p className="text-fg-muted">We analyse {WINDOW_SEC} seconds of real time. Slide so the window starts just before the ball is released.</p>
          <TrimPreview video={videoEl} start={start} />
          <input type="range" min={0} max={Math.max(0, meta.durationSec - WINDOW_SEC * slow)} step={0.01} value={start}
            onChange={(e) => setStart(Number(e.target.value))} className="w-full h-11 accent-[var(--color-brand)]" aria-label="Window start" />
          <p className="num text-sm text-fg-subtle">{start.toFixed(2)} s → {(start + WINDOW_SEC * slow).toFixed(2)} s</p>
          <button className="btn btn-primary w-full" onClick={track}>Track this window</button>
        </>
      )}

      {phase === "tracking" && (
        <>
          <h1 className="display text-4xl">Tracking batter</h1>
          <p className="text-fg-muted">Running pose tracking on this device. Keep this screen open.</p>
          <div className="h-2 w-full overflow-hidden rounded bg-line" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
            <div className="h-full bg-brand transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
          </div>
          <p className="num text-sm text-fg-subtle">{progress.total ? `frame ${progress.done} of ${progress.total}` : "loading the pose model…"}</p>
        </>
      )}

      {phase === "side" && (
        <>
          <h1 className="display text-4xl">Which side is the bowler?</h1>
          <p className="text-fg-muted">In the photo, is the bowler&apos;s end to the left or the right?</p>
          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1" onClick={() => finish({ ...EMPTY_MARKS, bowlerSide: "left" })}>← Left</button>
            <button className="btn btn-ghost flex-1" onClick={() => finish({ ...EMPTY_MARKS, bowlerSide: "right" })}>Right →</button>
          </div>
        </>
      )}

      {phase === "mark" && tracking && videoEl && (
        <>
          <MarkEvidence video={videoEl} tracking={tracking} marks={marks} onChange={setMarks} onDone={(m) => finish(m)} />
        </>
      )}

      {phase === "processing" && (
        <>
          <h1 className="display text-4xl">Preparing your report</h1>
          <ol className="space-y-2">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 ${i < stage ? "text-fg" : "text-fg-subtle"}`}>
                <span className={`h-5 w-5 rounded-full border ${i < stage ? "bg-brand border-brand" : i === stage ? "border-brand animate-pulse" : "border-line-strong"}`} aria-hidden />
                {s}
                <span className="sr-only">{i < stage ? "done" : i === stage ? "in progress" : "waiting"}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {phase === "error" && (
        <>
          <h1 className="display text-4xl">Something went wrong</h1>
          <p className="text-fg-muted">{error}</p>
          <button className="btn btn-primary" onClick={() => setPhase("source")}>Try another file</button>
        </>
      )}
          </motion.div>
        </AnimatePresence>
      </Shell>
    </>
  );
}

const STEP_NAMES = ["Shot", "Method", "Setup", "Clip", "Check", "Track", "Mark", "Report"];
const STEP_OF: Record<Phase, number> = { intent: 0, tier: 1, setup: 2, source: 3, checking: 4, gate: 4, trim: 4, tracking: 5, side: 6, mark: 6, processing: 7, error: 3 };

function Shell({ children, step }: { children: React.ReactNode; step: number }) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-7 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-subtle">
            Step {step + 1} of {STEP_NAMES.length} · <span className="font-medium text-fg">{STEP_NAMES[step]}</span>
          </span>
          <Link href="/guide" className="text-fg-subtle underline-offset-2 hover:text-fg hover:underline">How it works</Link>
        </div>
        <ol className="grid grid-cols-8 gap-1.5" aria-label="Progress">
          {STEP_NAMES.map((s, i) => (
            <li key={s} className="min-w-0" aria-current={i === step ? "step" : undefined}>
              <motion.div
                className="h-1.5 rounded-full"
                initial={false}
                animate={{ backgroundColor: i <= step ? "var(--color-brand)" : "var(--color-line)" }}
                transition={{ duration: 0.3 }}
              />
              <span className={`mt-1.5 hidden truncate text-[0.68rem] sm:block ${i === step ? "text-fg font-medium" : "text-fg-subtle"}`}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      {children}
    </div>
  );
}

function TrimPreview({ video, start }: { video: HTMLVideoElement | null; start: number }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!video) return;
    let alive = true;
    seek(video, start).then(() => {
      if (!alive || !c.current) return;
      const ctx = c.current.getContext("2d")!;
      c.current.width = 640;
      c.current.height = Math.round((640 * video.videoHeight) / Math.max(1, video.videoWidth));
      ctx.drawImage(video, 0, 0, c.current.width, c.current.height);
    });
    return () => {
      alive = false;
    };
  }, [video, start]);
  return <canvas ref={c} className="w-full rounded-xl border border-line bg-sunken" aria-label="Frame at window start" />;
}

async function estimatePlaybackFps(v: HTMLVideoElement): Promise<number | null> {
  type RVFC = (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  const rvfc = (v as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(v);
  if (!rvfc) return null;
  const samples: number[] = [];
  return new Promise((resolve) => {
    let last: { t: number; n: number } | null = null;
    const done = () => {
      v.pause();
      v.currentTime = 0;
      samples.sort((a, b) => a - b);
      resolve(samples.length > 5 ? Math.round(1 / samples[Math.floor(samples.length / 2)]!) : null);
    };
    const cb = (_: number, m: { mediaTime: number; presentedFrames: number }) => {
      if (last && m.presentedFrames - last.n === 1 && m.mediaTime > last.t) samples.push(m.mediaTime - last.t);
      last = { t: m.mediaTime, n: m.presentedFrames };
      if (samples.length >= 20) return done();
      rvfc(cb);
    };
    rvfc(cb);
    v.playbackRate = 0.25;
    v.play().catch(() => resolve(null));
    setTimeout(done, 4000);
  });
}

async function grabKeyframes(video: HTMLVideoElement, mediaTimes: number[], frames: number[]): Promise<Record<number, Blob>> {
  const out: Record<number, Blob> = {};
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = Math.round((480 * video.videoHeight) / Math.max(1, video.videoWidth));
  const ctx = canvas.getContext("2d")!;
  for (const f of frames.slice(0, 8)) {
    const t = mediaTimes[f];
    if (t === undefined) continue;
    await seek(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.72));
    if (blob) out[f] = blob;
  }
  return out;
}

