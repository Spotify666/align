"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { analyze } from "@/engine/analyze";
import { assessCapture } from "@/engine/quality";
import { encodeTracks, quantise } from "@/engine/tracks-codec";
import { J, type CameraPoint, type CaptureObservation, type CaptureQuality, type ImgPoint, type PhotoPhase, type Tier } from "@/engine/types";
import { readVideoTrack, type VideoTrackInfo } from "@/lib/capture/mp4";
import { FrameQualitySampler } from "@/lib/capture/frame-quality";
import { detectFrame, detectStill, loadPersonDetector, loadPose, loadStillPose, roiAround, seek, type Roi } from "@/lib/capture/pose";
import { batterCandidates, scanVideo, verifyWindows, type BatterCandidate, type ScanResult } from "@/lib/capture/scan";
import { guessView } from "@/lib/capture/view-guess";
import { canvasBlob, loadPhotos, type PhotoLoad } from "@/lib/capture/photos";
import { buildObservation, EMPTY_MARKS, type Marks, type TrackingResult } from "@/lib/capture/build-observation";
import { loadProfile, saveAnalysis, saveProfile, type LocalProfile } from "@/lib/store";
import { isSessionUrl, sessionMedia } from "@/lib/session-media";
import { CaptureChecklist } from "../report/panels";
import { CameraPlacementDiagram, LiveFramingCheck } from "./setup-guide";
import { MarkEvidence } from "./mark-evidence";
import { MomentPicker } from "./moment-picker";
import { BatterPicker } from "./batter-picker";
import { ViewPicker } from "./view-picker";
import { PhotoReview } from "./photo-review";
import { Check, Chevron, Lock, Upload, Record as RecordIcon, Target } from "../icons";

type Phase =
  | "intent"
  | "tier"
  | "setup"
  | "source"
  | "reading"
  | "scanning"
  | "moment"
  | "batter"
  | "view"
  | "checking"
  | "gate"
  | "tracking"
  | "mark"
  | "photos"
  | "processing"
  | "error";

type ViewChoice = "side_on" | "front_on" | "behind";

interface Meta {
  width: number;
  height: number;
  containerFps: number | null;
  fpsSource: CaptureObservation["media"]["fpsSource"];
  durationSec: number;
}

const MAX_FRAMES = 300;
const WINDOW_SEC = 2.5;
const GATE_SAMPLES = 12;
const STAGES = ["Tracking batter", "Finding bat and ball", "Reconstructing movement", "Classifying shot", "Computing measures", "Preparing report"];
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|3g2|avi|wmv|flv|mts|m2ts|ts)$/i;

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
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [pick, setPick] = useState(0);
  const [win, setWin] = useState<{ start: number; end: number; peak: number } | null>(null);
  const [cands, setCands] = useState<BatterCandidate[]>([]);
  const [batter, setBatter] = useState(0);
  const [still, setStill] = useState<string | null>(null);
  const [view, setView] = useState<ViewChoice>("side_on");
  const [bowlerSide, setBowlerSide] = useState<"left" | "right">("right");
  const [guess, setGuess] = useState<ViewChoice | null>(null);
  const [gate, setGate] = useState<CaptureQuality | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [tracking, setTracking] = useState<TrackingResult | null>(null);
  const [marks, setMarks] = useState<Marks>(EMPTY_MARKS);
  const [photos, setPhotos] = useState<PhotoLoad | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const bindVideo = (el: HTMLVideoElement | null) => {
    video.current = el;
    setVideoEl((cur) => (cur === el ? cur : el));
  };
  const mediaTimesRef = useRef<number[]>([]);
  const [mediaTimes, setMediaTimes] = useState<number[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (url && !isSessionUrl(url)) URL.revokeObjectURL(url);
  }, [url]);
  useEffect(() => () => abort.current?.abort(), []);

  const minor = profile.ageBand === "u13" || profile.ageBand === "13_15" || profile.ageBand === "16_18";
  const realFps = meta?.containerFps ? meta.containerFps * slow : null;
  const windowMedia = WINDOW_SEC * slow;
  const aspect = meta ? meta.width / meta.height : 16 / 9;
  const fail = (title: string, body: string) => {
    setError({ title, body });
    setPhase("error");
  };
  const roi = (): Roi => {
    const c = cands[batter];
    if (!c || !meta) return { x: 0, y: 0, w: 1, h: 1 };
    return roiAround(c.extent, aspect, 0.3);
  };

  function resetClip() {
    abort.current?.abort();
    setScan(null);
    setScanProgress(0);
    setWin(null);
    setCands([]);
    setBatter(0);
    setStill(null);
    setGate(null);
    setTracking(null);
    setMarks(EMPTY_MARKS);
    setPhotos(null);
    setSlow(1);
  }

  // ---------- Video: read → scan → choose shot ----------
  async function onVideo(f: File) {
    resetClip();
    setFile(f);
    const u = URL.createObjectURL(f);
    setUrl(u);
    setPhase("reading");
    const track = await readVideoTrack(f);
    const v = video.current!;
    try {
      v.src = u;
      await loaded(v);
    } catch {
      const msg = decodeMessage(f, track);
      return fail(msg.title, msg.body);
    }
    if (!v.videoWidth || !v.videoHeight) return fail("No picture in this file", "The file plays but has no video image (audio only?). Choose the original video from your camera roll.");
    if (!Number.isFinite(v.duration) || v.duration < 0.5) return fail("Clip too short", "The clip must include the whole shot — start before the ball is bowled and stop after the follow-through.");
    let fps = track?.fps ?? null;
    let fpsSource: Meta["fpsSource"] = track ? "container" : "unknown";
    if (!fps && "requestVideoFrameCallback" in v) {
      fps = await estimatePlaybackFps(v);
      fpsSource = fps ? "playback" : "unknown";
    }
    const m: Meta = { width: v.videoWidth, height: v.videoHeight, containerFps: fps, fpsSource, durationSec: v.duration };
    setMeta(m);

    setPhase("scanning");
    try {
      const det = await loadPersonDetector();
      abort.current = new AbortController();
      const scanned = await scanVideo(v, det, WINDOW_SEC, setScanProgress, abort.current.signal);
      if (abort.current.signal.aborted) return;
      const res = { ...scanned, windows: await verifyWindows(v, await loadStillPose(), scanned) };
      setScan(res);
      const best = res.windows.reduce((b, w, i) => (w.score > (res.windows[b]?.score ?? -1) ? i : b), 0);
      setPick(best);
      const w = res.windows[best];
      setWin(w ? { start: w.start, end: w.end, peak: w.peak } : { start: 0, end: Math.min(m.durationSec, WINDOW_SEC), peak: Math.min(m.durationSec, WINDOW_SEC) / 2 });
      setPhase("moment");
    } catch (e) {
      fail("Couldn't scan this clip", e instanceof Error ? e.message : "The on-device vision model failed to load. Check your connection and try again.");
    }
  }

  const chooseWindow = (i: number) => {
    const w = scan?.windows[i];
    if (!w) return;
    setPick(i);
    setWin({ start: w.start, end: Math.min(meta!.durationSec, w.start + Math.max(w.end - w.start, windowMedia)), peak: w.peak });
  };

  async function confirmMoment() {
    if (!win || !scan || !meta) return;
    const v = video.current!;
    const { at, candidates } = batterCandidates(scan.samples, win);
    const cs = await verifyCandidates(v, candidates, win, at, aspect);
    setCands(cs);
    setBatter(0);
    await seek(v, at);
    setStill(snapshot(v));
    if (cs.length > 1) setPhase("batter");
    else await prepareView(cs, 0);
  }

  async function prepareView(cs: BatterCandidate[] = cands, b = batter) {
    if (!win || !meta) return;
    const v = video.current!;
    const r = cs[b] ? roiAround(cs[b].extent, aspect, 0.3) : { x: 0, y: 0, w: 1, h: 1 };
    const stillPose = await loadStillPose();
    // Stance and stroke: the stride at the stroke makes the front side's direction clearest.
    const frames = [];
    for (const t of [win.peak, win.start + (win.end - win.start) * 0.12]) {
      await seek(v, t);
      frames.push(detectStill(stillPose, v, r));
    }
    const g = guessView(frames, profile.handedness);
    setStill(snapshot(v));
    if (g) {
      const choice: ViewChoice = g.view === "front_on" || g.view === "behind" ? g.view : "side_on";
      setGuess(choice);
      setView(choice);
      setBowlerSide(g.bowlerSide);
    }
    setPhase("view");
  }

  // ---------- Quality gate on the chosen window ----------
  async function runGate() {
    if (!meta || !win) return;
    setPhase("checking");
    try {
      const v = video.current!;
      const stillPose = await loadStillPose();
      const r = roi();
      const sampler = new FrameQualitySampler(aspect);
      const body: ImgPoint[][] = [];
      const quality = [];
      let people = 1;
      const len = Math.min(win.end, meta.durationSec) - win.start;
      const times = Array.from({ length: GATE_SAMPLES }, (_, i) => win.start + (len * (i + 0.5)) / GATE_SAMPLES);
      for (let i = 0; i < times.length; i++) {
        await seek(v, times[i]!);
        quality.push(sampler.sample(v, i));
        const p = detectStill(stillPose, v, r);
        people = Math.max(people, p.people);
        body.push(p.body);
      }
      const probe: CaptureObservation = {
        schema: "align.observation/1",
        id: "probe",
        source: "browser_capture",
        demo: false,
        media: { kind: "video", width: meta.width, height: meta.height, fps: realFps, fpsSource: meta.fpsSource, durationMs: (len / slow) * 1000, frameCount: body.length },
        tier,
        athlete: { handedness: profile.handedness, heightCm: profile.heightCm },
        camera: { view, bowlerSide },
        calibration: { source: "none", metresPerUnit: null, stumpsX: null, groundY: null },
        // People overlapping the batter's region, not everyone on the field.
        quality: { frames: quality, maxPeople: people },
        t: times.map((t) => t * 1000),
        body,
        bat: { source: "none", handle: body.map(() => null), toe: body.map(() => null) },
        ball: { source: "none", points: body.map(() => null) },
        marks: { bounceFrame: null, contactFrame: null },
      };
      setGate(assessCapture(probe));
      setPhase("gate");
    } catch (e) {
      fail("Couldn't check this clip", e instanceof Error ? e.message : "The quality check failed on this device.");
    }
  }

  // ---------- Track the batter over the window ----------
  async function track() {
    if (!meta || !win) return;
    setPhase("tracking");
    try {
      const pose = await loadPose();
      const r = roi();
      const cFps = meta.containerFps ?? 30;
      const rFps = cFps * slow;
      const windowLen = Math.min(meta.durationSec - win.start, win.end - win.start);
      const containerFrames = Math.max(2, Math.floor(windowLen * cFps));
      const stride = Math.max(1, Math.ceil(containerFrames / MAX_FRAMES));
      const count = Math.floor(containerFrames / stride);
      const v = video.current!;
      const sampler = new FrameQualitySampler(aspect);
      const world: CameraPoint[][] = [];
      const out: TrackingResult = {
        t: [],
        body: [],
        world,
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
        const mt = win.start + (i * stride + 0.5) / cFps;
        mediaTimes.push(mt);
        await seek(v, mt);
        const p = detectFrame(pose, v, 10 + Math.round(mt * 1000), prevHip, r);
        prevHip = p.hip;
        out.body.push(p.body);
        world.push(p.world);
        out.depth.push(p.depth);
        out.people = Math.max(out.people, p.people);
        out.t.push(Math.round(((i * stride) / rFps) * 1000 * 100) / 100);
        if (i % Math.max(1, Math.round(count / 24)) === 0) out.quality.push(sampler.sample(v, i));
        if (i % 4 === 0) setProgress({ done: i + 1, total: count });
      }
      setProgress({ done: count, total: count });
      mediaTimesRef.current = mediaTimes;
      setMediaTimes(mediaTimes);
      setTracking(out);
      setMarks({ ...EMPTY_MARKS, view, bowlerSide });
      setPhase("mark");
    } catch (e) {
      fail("Tracking stopped", e instanceof Error ? e.message : "Tracking failed on this device. Close other apps and try again.");
    }
  }

  // ---------- Photos ----------
  async function onPhotos(files: File[]) {
    resetClip();
    setFile(files[0] ?? null);
    setUrl(null);
    setMeta(null);
    setPhase("reading");
    setProgress({ done: 0, total: files.length });
    try {
      const res = await loadPhotos(files, (done, total) => setProgress({ done, total }));
      if (!res.items.length) {
        return fail(
          files.length === 1 ? "This photo can't be used" : "None of these photos can be used",
          res.failed.map((f) => `${f.name}: ${f.reason}`).join("\n") || "No photo could be decoded.",
        );
      }
      setPhotos(res);
      const g = guessView(res.items.map((i) => i.frame), profile.handedness);
      if (g) {
        const choice: ViewChoice = g.view === "front_on" || g.view === "behind" ? g.view : "side_on";
        setGuess(choice);
        setView(choice);
        setBowlerSide(g.bowlerSide);
      }
      setPhase("photos");
    } catch (e) {
      fail("Couldn't read the photos", e instanceof Error ? e.message : "The on-device vision model failed to load. Check your connection and try again.");
    }
  }

  async function analysePhotos() {
    if (!photos) return;
    const use = photos.items.filter((i) => i.frame);
    if (!use.length) return fail("No batter found", "We couldn't find a whole batter in any photo. Use photos where the batter is fully in frame, head to feet.");
    const sampler = new FrameQualitySampler(photos.width / photos.height);
    const keyframes: Record<number, Blob> = {};
    for (let i = 0; i < use.length; i++) {
      const b = await canvasBlob(use[i]!.canvas, "image/webp", 0.82);
      if (b) keyframes[i] = b;
    }
    const tr: TrackingResult = {
      t: use.map((_, i) => i),
      body: use.map((i) => i.frame!.body),
      world: use.map((i) => i.frame!.world),
      depth: use.map((i) => i.frame!.depth),
      photoPhases: use.map((i) => i.phase),
      people: Math.max(1, ...use.map((i) => i.people)),
      quality: use.map((i, k) => sampler.sample(i.canvas, k)),
      fps: 0,
      fpsSource: "unknown",
      width: photos.width,
      height: photos.height,
      durationMs: 0,
      kind: "photo",
    };
    setTracking(tr);
    await finish({ ...EMPTY_MARKS, view, bowlerSide }, tr, keyframes);
  }

  // ---------- Analyse, store locally, open the report ----------
  async function finish(finalMarks: Marks, tr: TrackingResult | null = tracking, photoKeyframes?: Record<number, Blob>) {
    if (!tr) return;
    setPhase("processing");
    try {
      const id = crypto.randomUUID();
      for (let s = 1; s <= 3; s++) {
        setStage(s);
        await new Promise((r) => setTimeout(r, 120));
      }
      const raw = buildObservation({ id, tracking: tr, marks: finalMarks, tier, handedness: profile.handedness, heightCm: profile.heightCm });
      const obs = quantise(raw);
      setStage(4);
      const createdAt = new Date().toISOString();
      const payload = analyze(obs, { analysisId: id, createdAt });
      setStage(5);
      const gz = await encodeTracks(obs);
      const keyframes = photoKeyframes ?? (tr.kind === "video" ? await grabKeyframes(video.current!, mediaTimesRef.current, payload.evidence_frames) : {});
      const name = file?.name?.replace(/\.[^.]+$/, "");
      await saveAnalysis(
        {
          id,
          createdAt,
          recordedAt: file?.lastModified ? new Date(file.lastModified).toISOString() : createdAt,
          payload,
          title: tr.kind === "photo" ? (tr.body.length > 1 ? `${tr.body.length} photos` : (name ?? "Photo")) : (name ?? "Front-foot defence"),
          notes: "",
          tags: [],
          representative: false,
          cloud: null,
        },
        gz,
        keyframes,
      );
      if (url && tr.kind === "video") sessionMedia.set(id, { url, mediaTimes: mediaTimesRef.current });
      setStage(6);
      router.push(`/report/${id}`);
    } catch (e) {
      fail("Analysis failed", e instanceof Error ? e.message : "Something went wrong while preparing the report.");
    }
  }

  const onFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(f.name));
    const vid = files.find((f) => f.type.startsWith("video/") || VIDEO_EXT.test(f.name));
    if (vid) return onVideo(vid);
    if (images.length) return onPhotos(images);
    fail("Unsupported file", `${files[0]!.name} isn't a video or photo this app can read. Use MP4 or MOV videos, or JPEG, PNG or WebP photos.`);
  };

  // ---------- UI ----------
  return (
    <>
      <video ref={bindVideo} muted playsInline preload="auto" className="hidden" />
      <Shell step={STEP_OF[phase]} photos={!!photos && phase !== "source"}>
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
                "Add a video (any length) or a few photos",
                "We find the shot and the batter in it",
                "Confirm where the phone was",
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
              <span className="mt-1 block text-sm text-fg-muted">One phone — side-on or from the bowler&apos;s end — or a few photos. Shot family, timing and 2D measures; depth values are labelled estimates.</span>
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
              "Slow-motion mode (120 or 240 fps) if your phone has it",
              "Phone fixed on a tripod or wedged still",
              "Best: square-on to the batter at hip height, 6–8 m away. Also fine: from behind the bowler",
              "Batter head to feet, whole bat and the bounce zone in frame",
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
              <li>Your video or photos are processed on this device. They are not uploaded.</li>
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
            Continue
          </button>
        </>
      )}

      {phase === "source" && (
        <>
          <h1 className="display text-[2.4rem] sm:text-5xl">Add your front-foot defence</h1>
          <p className="text-fg-muted">A video of any length — a single shot, a practice session or match footage — or one or more photos.</p>
          <div
            className={`grid gap-3 rounded-2xl sm:grid-cols-3 ${dragging ? "outline-2 outline-dashed outline-brand outline-offset-4" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
          >
            <label className="card card-hover p-5 cursor-pointer flex flex-col items-center gap-2 text-center sm:col-span-1">
              <Upload size={26} className="text-brand" />
              <span className="font-semibold">Choose a video</span>
              <span className="text-xs text-fg-subtle">MP4, MOV or WebM · slow-motion is best</span>
              <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="card card-hover p-5 cursor-pointer flex flex-col items-center gap-2 text-center">
              <Target size={26} className="text-data" />
              <span className="font-semibold">Choose photos</span>
              <span className="text-xs text-fg-subtle">1–12 photos · posture screen</span>
              <input type="file" accept="image/*,.heic,.heif" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="card card-hover p-5 cursor-pointer flex flex-col items-center gap-2 text-center">
              <RecordIcon size={26} className="text-bad" />
              <span className="font-semibold">Record now</span>
              <span className="text-xs text-fg-subtle">Opens your camera</span>
              <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          <ul className="grid gap-1.5 text-xs text-fg-subtle">
            <li>Long clips are fine: we find each shot and you pick one.</li>
            <li>More than one person in view is fine: you tap the batter.</li>
            <li>Photos give posture observations only — no shot verdict, timing, bat or ball.</li>
          </ul>
        </>
      )}

      {phase === "reading" && (
        <>
          <h1 className="display text-4xl">{photos === null && progress.total > 0 ? "Reading your photos…" : "Opening the file…"}</h1>
          <p className="text-fg-muted">{progress.total > 0 ? `Finding the batter in photo ${Math.min(progress.done + 1, progress.total)} of ${progress.total}.` : "Reading frame rate, size and format."}</p>
          <div className="h-1.5 w-full overflow-hidden rounded bg-line">
            <div className="h-full bg-brand transition-all" style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "30%" }} />
          </div>
        </>
      )}

      {phase === "scanning" && (
        <>
          <p className="eyebrow">Moment</p>
          <h1 className="display text-4xl">Finding the shot…</h1>
          <p className="text-fg-muted">Looking for the batter and the stroke{meta && meta.durationSec > 15 ? " across the whole clip" : ""}. Camera cuts, replays and close-ups are skipped.</p>
          <div className="h-1.5 w-full overflow-hidden rounded bg-line" role="progressbar" aria-valuenow={Math.round(scanProgress * 100)} aria-valuemax={100}>
            <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(4, scanProgress * 100)}%` }} />
          </div>
          <p className="num text-sm text-fg-subtle">{Math.round(scanProgress * 100)}%{meta ? ` · ${meta.durationSec.toFixed(0)} s clip` : ""}</p>
        </>
      )}

      {phase === "moment" && scan && win && url && meta && (
        <>
          <MomentPicker
            url={url}
            windows={scan.windows}
            selected={pick}
            onSelect={chooseWindow}
            current={win}
            onAdjust={(s) => setWin((w) => (w ? { start: s, end: Math.min(meta.durationSec, s + (w.end - w.start)), peak: Math.min(Math.max(w.peak, s), s + (w.end - w.start)) } : w))}
            duration={meta.durationSec}
            windowMedia={windowMedia}
            scannedTo={scan.scannedTo}
            cuts={scan.cuts}
          />
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary flex-1 sm:flex-none" onClick={confirmMoment}>Use this shot</button>
            <button className="btn btn-ghost" onClick={() => setPhase("source")}>Choose another file</button>
          </div>
        </>
      )}

      {phase === "batter" && still && (
        <>
          <BatterPicker image={still} aspect={aspect} candidates={cands} selected={batter} onSelect={setBatter} />
          <button className="btn btn-primary w-full sm:w-auto" onClick={() => prepareView(cands, batter)}>Track this person</button>
        </>
      )}

      {phase === "view" && (
        <>
          <ViewPicker view={view} bowlerSide={bowlerSide} suggested={guess} onView={setView} onBowlerSide={setBowlerSide} image={still} aspect={aspect} />
          <button className="btn btn-primary w-full sm:w-auto" onClick={runGate}>Check the recording</button>
        </>
      )}

      {phase === "checking" && (
        <>
          <h1 className="display text-4xl">Checking the recording…</h1>
          <p className="text-fg-muted">Sampling the shot for light, blur, shake and whether the whole batter is in frame.</p>
          <div className="h-1 w-full overflow-hidden rounded bg-line"><div className="h-full w-1/3 animate-pulse bg-brand" /></div>
        </>
      )}

      {phase === "gate" && gate && meta && win && (
        <>
          <p className="eyebrow">Quality check</p>
          <h1 className="display text-4xl">{gate.status === "fail" ? "This shot can't be analysed" : gate.status === "warn" ? "Usable, with warnings" : "Recording looks good"}</h1>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="card p-3"><dt className="text-fg-subtle">Frame rate</dt><dd className="num text-lg">{realFps ? `${Math.round(realFps)} fps` : "unknown"}</dd><dd className="text-xs text-fg-subtle">{meta.fpsSource === "container" ? "from file" : meta.fpsSource === "playback" ? "estimated" : ""}</dd></div>
            <div className="card p-3"><dt className="text-fg-subtle">Resolution</dt><dd className="num text-lg">{meta.width}×{meta.height}</dd></div>
            <div className="card p-3"><dt className="text-fg-subtle">Shot window</dt><dd className="num text-lg">{((win.end - win.start) / slow).toFixed(1)} s</dd><dd className="text-xs text-fg-subtle">of a {meta.durationSec.toFixed(0)} s clip</dd></div>
          </dl>
          <label className="block text-sm">
            <span className="text-fg-muted">Was this exported as a slowed-down video (slow motion baked in)?</span>
            <select className="field mt-1" value={slow} onChange={(e) => {
              const s = Number(e.target.value);
              setSlow(s);
              setWin((w) => (w ? { ...w, end: Math.min(meta.durationSec, w.start + WINDOW_SEC * s) } : w));
            }}>
              <option value={1}>No — plays at real speed (or it&apos;s a native high-fps file)</option>
              <option value={4}>Yes — 4× slowed (120 fps slow-mo)</option>
              <option value={8}>Yes — 8× slowed (240 fps slow-mo)</option>
            </select>
          </label>
          <div className="card px-4"><CaptureChecklist checks={gate.checks} /></div>
          <div className="flex flex-wrap gap-3">
            {gate.status !== "fail" ? (
              <button className="btn btn-primary" onClick={track}>Track the batter</button>
            ) : (
              <p className="text-sm text-fg-muted w-full">Nothing has been processed. Try another shot from this clip, or fix the items above and record again.</p>
            )}
            {scan && scan.windows.length > 1 && <button className="btn btn-ghost" onClick={() => setPhase("moment")}>Pick another shot</button>}
            <button className="btn btn-ghost" onClick={() => setPhase("view")}>Change camera position</button>
            <button className="btn btn-quiet" onClick={() => { resetClip(); setPhase("source"); }}>Use another file</button>
          </div>
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

      {phase === "mark" && tracking && videoEl && (
        <MarkEvidence video={videoEl} tracking={tracking} mediaTimes={mediaTimes} marks={marks} onChange={setMarks} onDone={(m) => finish(m)} />
      )}

      {phase === "photos" && photos && (
        <>
          <PhotoReview
            items={photos.items}
            failed={photos.failed}
            onPhase={(id, ph: PhotoPhase | null) => setPhotos((p) => (p ? { ...p, items: p.items.map((i) => (i.id === id ? { ...i, phase: ph } : i)) } : p))}
            onRemove={(id) => setPhotos((p) => (p ? { ...p, items: p.items.filter((i) => i.id !== id) } : p))}
          />
          <div className="card p-4">
            <ViewPicker compact view={view} bowlerSide={bowlerSide} suggested={guess} onView={setView} onBowlerSide={setBowlerSide} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary flex-1 sm:flex-none" disabled={!photos.items.some((i) => i.frame)} onClick={analysePhotos}>
              Analyse {photos.items.filter((i) => i.frame).length === 1 ? "photo" : `${photos.items.filter((i) => i.frame).length} photos`}
            </button>
            <button className="btn btn-ghost" onClick={() => { resetClip(); setPhase("source"); }}>Choose other files</button>
          </div>
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

      {phase === "error" && error && (
        <>
          <h1 className="display text-4xl">{error.title}</h1>
          <p className="whitespace-pre-line text-fg-muted">{error.body}</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" onClick={() => { resetClip(); setPhase("source"); }}>Try another file</button>
            <Link className="btn btn-ghost" href="/guide">Recording tips</Link>
          </div>
        </>
      )}
          </motion.div>
        </AnimatePresence>
      </Shell>
    </>
  );
}

const STEP_NAMES = ["Shot", "Method", "Setup", "Clip", "Moment", "Check", "Track", "Mark", "Report"];
const PHOTO_STEP_NAMES = ["Shot", "Method", "Setup", "Photos", "Review", "Report"];
const STEP_OF: Record<Phase, number> = {
  intent: 0,
  tier: 1,
  setup: 2,
  source: 3,
  reading: 3,
  scanning: 4,
  moment: 4,
  batter: 4,
  view: 4,
  checking: 5,
  gate: 5,
  tracking: 6,
  mark: 7,
  photos: 4,
  processing: 8,
  error: 3,
};

function Shell({ children, step, photos }: { children: React.ReactNode; step: number; photos: boolean }) {
  const names = photos ? PHOTO_STEP_NAMES : STEP_NAMES;
  const at = photos ? (step >= 8 ? 5 : Math.min(step, 4)) : step;
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-7 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-subtle">
            Step {at + 1} of {names.length} · <span className="font-medium text-fg">{names[at]}</span>
          </span>
          <Link href="/guide" className="text-fg-subtle underline-offset-2 hover:text-fg hover:underline">How it works</Link>
        </div>
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }} aria-label="Progress">
          {names.map((s, i) => (
            <li key={s} className="min-w-0" aria-current={i === at ? "step" : undefined}>
              <motion.div
                className="h-1.5 rounded-full"
                initial={false}
                animate={{ backgroundColor: i <= at ? "var(--color-brand)" : "var(--color-line)" }}
                transition={{ duration: 0.3 }}
              />
              <span className={`mt-1.5 hidden truncate text-[0.68rem] sm:block ${i === at ? "text-fg font-medium" : "text-fg-subtle"}`}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      {children}
    </div>
  );
}

/**
 * Keep only detections that hold a real, whole person: pose must find a confident body
 * whose hips sit inside the box, early in the window and at the stroke. Stumps, nets or
 * a hand at the frame edge drop out; the best-verified person comes first.
 */
async function verifyCandidates(v: HTMLVideoElement, cs: BatterCandidate[], win: { start: number; end: number; peak: number }, at: number, aspect: number): Promise<BatterCandidate[]> {
  if (!cs.length) return cs;
  const stillPose = await loadStillPose();
  const KEY = [J.nose, J.left_shoulder, J.right_shoulder, J.left_hip, J.right_hip, J.left_knee, J.right_knee, J.left_ankle, J.right_ankle];
  const quality = cs.slice(0, 6).map(() => 0);
  // At the boxes' own frame each box is checked; the stance frame uses the person's extent.
  for (const [t, own] of [[at, true], [win.start + (win.end - win.start) * 0.12, false]] as const) {
    await seek(v, t);
    cs.slice(0, 6).forEach((c, i) => {
      const r = roiAround(own ? c.box : c.extent, aspect, 0.3);
      const p = detectStill(stillPose, v, r);
      const vis = KEY.reduce((s, k) => s + (p.body[k]?.[2] ?? 0), 0) / KEY.length;
      const hip = p.hip;
      const e = own ? c.box : c.extent;
      const inside = !!hip && hip[0] >= e.x - e.w * 0.15 && hip[0] <= e.x + e.w * 1.15 && hip[1] >= e.y && hip[1] <= e.y + e.h;
      quality[i] = Math.max(quality[i]!, inside ? vis : vis * 0.3);
    });
  }
  const ranked = cs
    .slice(0, 6)
    .map((c, i) => ({ c, q: quality[i]! }))
    .filter((x) => x.q >= 0.55)
    .sort((a, b) => b.q * Math.sqrt(b.c.box.h) * (0.5 + b.c.persistence) - a.q * Math.sqrt(a.c.box.h) * (0.5 + a.c.persistence))
    .map((x) => x.c);
  return ranked.length ? ranked : cs;
}

/** Resolve when the first frame is decodable; reject on a decode error or a stall. */
function loaded(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      v.removeEventListener("loadeddata", ok);
      v.removeEventListener("error", bad);
    };
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error("decode"));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, 20000);
    v.addEventListener("loadeddata", ok);
    v.addEventListener("error", bad);
    v.load();
  });
}

/** A specific, fixable explanation for a clip this browser can't decode. */
export function decodeMessage(f: File, track: VideoTrackInfo | null): { title: string; body: string } {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const codec = track?.codec ?? "";
  if (/^(hvc1|hev1|dvh1|dvhe)$/.test(codec))
    return {
      title: "This browser can't play HEVC video",
      body:
        "The clip is HEVC (H.265), the default on many iPhones and newer Android phones.\n\n" +
        "Any of these fixes it:\n• Open Align in Safari (iPhone, iPad, Mac) or recent Chrome / Edge.\n" +
        "• iPhone: Settings → Camera → Formats → Most Compatible, then record again.\n" +
        "• Send the clip to yourself on WhatsApp or save it from Google Photos — that converts it to H.264.",
    };
  if (codec === "av01") return { title: "This device can't play AV1 video", body: "Re-export the clip as MP4 (H.264), or open Align in a recent Chrome or Edge." };
  if (["avi", "wmv", "flv", "mts", "m2ts", "ts"].includes(ext))
    return { title: `.${ext.toUpperCase()} files can't be played in a browser`, body: "Convert the clip to MP4 (H.264) — most phones and free converters can — then add it again." };
  if (ext === "mkv") return { title: "This MKV file can't be played here", body: "Re-save it as MP4 (H.264) and add it again. MP4 and MOV work on every phone and computer." };
  return {
    title: "This video can't be opened on this device",
    body: `The format${codec ? ` (${codec})` : f.type ? ` (${f.type})` : ""} isn't supported by this browser, or the file is incomplete.\n\nMP4 (H.264) and MOV work everywhere. Try the original clip from your camera roll, or send it to yourself on WhatsApp to convert it.`,
  };
}

function snapshot(v: HTMLVideoElement): string {
  const c = document.createElement("canvas");
  const s = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
  c.width = Math.round(v.videoWidth * s);
  c.height = Math.round(v.videoHeight * s);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

async function estimatePlaybackFps(v: HTMLVideoElement): Promise<number | null> {
  type RVFC = (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  const rvfc = (v as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(v);
  if (!rvfc) return null;
  const samples: number[] = [];
  return new Promise((resolve) => {
    let last: { t: number; n: number } | null = null;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      v.pause();
      v.currentTime = 0;
      samples.sort((a, b) => a - b);
      resolve(samples.length > 5 ? Math.round(1 / samples[Math.floor(samples.length / 2)]!) : null);
    };
    const cb = (_: number, m: { mediaTime: number; presentedFrames: number }) => {
      if (finished) return;
      if (last && m.presentedFrames - last.n === 1 && m.mediaTime > last.t) samples.push(m.mediaTime - last.t);
      last = { t: m.mediaTime, n: m.presentedFrames };
      if (samples.length >= 20) return done();
      rvfc(cb);
    };
    rvfc(cb);
    v.playbackRate = 0.25;
    v.play().catch(() => done());
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
