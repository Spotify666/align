"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { analyze } from "@/engine/analyze";
import { assessCapture } from "@/engine/quality";
import { encodeTracks, quantise } from "@/engine/tracks-codec";
import { J, type AnalysisPayload, type CameraPoint, type CaptureObservation, type CaptureQuality, type FrameQuality, type ImgPoint, type Tier } from "@/engine/types";
import { readVideoTrack, type VideoTrackInfo } from "@/lib/capture/mp4";
import { FrameQualitySampler } from "@/lib/capture/frame-quality";
import {
  batterLikeness,
  bodyBox,
  detectFrame,
  detectPeople,
  detectStill,
  Follower,
  loadPersonDetector,
  decideDelegate,
  loadPose,
  loadScanPose,
  loadStillPose,
  warmUp,
  roiAround,
  seek,
  EMPTY,
  type Box,
  type PoseFrame,
  type Roi,
} from "@/lib/capture/pose";
import { batterCandidates, boxAt, scanVideo, verifyWindows, type BatterCandidate, type ScanResult } from "@/lib/capture/scan";
import { guessView } from "@/lib/capture/view-guess";
import { strokeSegment } from "@/lib/capture/segments";
import { linkBack } from "@/lib/capture/link";
import { LumaTrack } from "@/lib/capture/picture-cuts";
import { playFrames } from "@/lib/capture/frames";
import { openDecoded, type DecodedVideo } from "@/lib/capture/decoder";
import { canvasBlob, loadPhotos, type PhotoLoad } from "@/lib/capture/photos";
import { gripHandedness } from "@/lib/capture/grip";
import { buildObservation, EMPTY_MARKS, type Marks, type TrackingResult } from "@/lib/capture/build-observation";
import { loadProfile, saveAnalysis, saveProfile, type LocalProfile } from "@/lib/store";
import { isSessionUrl, sessionCapture, sessionMedia } from "@/lib/session-media";
import { CaptureChecklist } from "../report/panels";
import { CameraPlacementDiagram, LiveFramingCheck } from "./setup-guide";
import { MarkEvidence } from "./mark-evidence";
import { MomentPicker } from "./moment-picker";
import { BatterPicker } from "./batter-picker";
import { ViewPicker } from "./view-picker";
import { Check, Chevron, Lock, Upload, Record as RecordIcon, Target } from "../icons";

// One screen to add a clip; everything after that runs on its own. Each automatic
// decision (which shot, which person, where the camera was) is shown as it is made,
// with a "Change" link — the athlete corrects only what is wrong.
type Phase = "add" | "working" | "shot" | "batter" | "view" | "blocked" | "mark" | "error";
type StageKey = "read" | "shot" | "batter" | "camera" | "check" | "track" | "report";
type StageState = "waiting" | "active" | "done";
type ViewChoice = "side_on" | "front_on" | "behind";

const VIDEO_STAGES: Array<[StageKey, string]> = [
  ["read", "Reading the video"],
  ["shot", "Finding the shot"],
  ["batter", "Finding the batter"],
  ["camera", "Camera position"],
  ["check", "Checking the recording"],
  ["track", "Tracking the body"],
  ["report", "Building your report"],
];
const PHOTO_STAGES: Array<[StageKey, string]> = [
  ["read", "Reading the photos"],
  ["batter", "Finding the batter"],
  ["camera", "Camera position"],
  ["report", "Building your report"],
];
const VIEW_TEXT: Record<ViewChoice, string> = { side_on: "side-on", front_on: "bowler's end", behind: "behind the batter" };

interface Meta {
  width: number;
  height: number;
  containerFps: number | null;
  fpsSource: CaptureObservation["media"]["fpsSource"];
  durationSec: number;
}
interface Attempt {
  obs: CaptureObservation;
  payload: AnalysisPayload;
  tr: TrackingResult;
  marks: Marks;
  times: number[];
}

/** Clearest result first: a confirmed defence, then a confirmed different shot, then the most defence-like. */
function rank(p: AnalysisPayload): number {
  const base = { valid: 3, invalid_for_requested_analysis: 2, uncertain_shot: 1, capture_failed: 0 }[p.analysis_status] ?? 0;
  return base + (p.shot_probabilities?.front_foot_defence ?? 0) * 0.5;
}

interface Win {
  start: number;
  end: number;
  peak: number;
}

const MAX_FRAMES = 300;
const WINDOW_SEC = 3.4;
const GATE_SAMPLES = 12;
const MAX_AUTO_TRIES = 3;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|3g2|avi|wmv|flv|mts|m2ts|ts)$/i;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function CaptureFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("add");
  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const [tier] = useState<Tier>("quick");
  const [guardianOk, setGuardianOk] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [slow, setSlowState] = useState(1);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [pick, setPick] = useState(0);
  const [win, setWin] = useState<Win | null>(null);
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
  const [photoMode, setPhotoMode] = useState(false);
  // Photos with two batter-like people: the set being picked from, and its shape.
  const photoRes = useRef<{ res: PhotoLoad; at: number } | null>(null);
  const [photoAspect, setPhotoAspect] = useState<number | null>(null);
  const [stages, setStages] = useState<Partial<Record<StageKey, StageState>>>({});
  const [notes, setNotes] = useState<Partial<Record<StageKey, string>>>({});
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [remark, setRemark] = useState<{ id: string; title: string; createdAt: string; recordedAt: string } | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const bindVideo = (el: HTMLVideoElement | null) => {
    video.current = el;
    setVideoEl((cur) => (cur === el ? cur : el));
  };
  const mediaTimesRef = useRef<number[]>([]);
  // The running pipeline outlives the render that started it: read file and URL from refs.
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string | null>(null);
  const [mediaTimes, setMediaTimes] = useState<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  // The current automatic run. Every await checks it, so "Change" cancels cleanly.
  const run = useRef(0);
  // Latest choices, readable from inside a running pipeline.
  const job = useRef({
    meta: null as Meta | null,
    scan: null as ScanResult | null,
    win: null as Win | null,
    cands: [] as BatterCandidate[],
    batter: 0,
    view: "side_on" as ViewChoice,
    bowlerSide: "right" as "left" | "right",
    viewChosen: false,
    shotChosen: false,
    slow: 1,
    tried: [] as number[],
    attempts: [] as Attempt[],
    /** Exact frame decoder for this file (MP4/MOV with a supported codec), else null: play through. */
    src: null as DecodedVideo | null,
    /** Batting hand read from the grip at the stance and the stroke, when clear. */
    hand: null as "right" | "left" | null,
  });

  useEffect(() => () => {
    if (url && !isSessionUrl(url)) URL.revokeObjectURL(url);
  }, [url]);
  useEffect(() => () => {
    abort.current?.abort();
    run.current++;
  }, []);
  // Fetch the on-device models while the athlete is still choosing a clip.
  useEffect(() => warmUp(), []);

  // Opened from a report to add bat and ball marks (same browser session only).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("mark");
    const cap = id ? sessionCapture.get(id) : null;
    const media = id ? sessionMedia.get(id) : null;
    const v = video.current;
    if (!id || !cap || !media || !v) return;
    (async () => {
      v.src = media.url;
      await loaded(v).catch(() => undefined);
      setUrl(media.url);
      urlRef.current = media.url;
      setTracking(cap.tracking);
      mediaTimesRef.current = media.mediaTimes ?? [];
      setMediaTimes(media.mediaTimes ?? []);
      setMarks({ ...EMPTY_MARKS, view: cap.view, bowlerSide: cap.bowlerSide });
      setView(cap.view);
      setBowlerSide(cap.bowlerSide);
      setRemark({ id, title: cap.title, createdAt: cap.createdAt, recordedAt: cap.recordedAt });
      setPhase("mark");
    })();
  }, []);

  const minor = profile.ageBand === "u13" || profile.ageBand === "13_15" || profile.ageBand === "16_18";
  const consented = profile.consentProcessing && (!minor || guardianOk);
  const aspect = meta ? meta.width / meta.height : 16 / 9;
  const realFps = meta?.containerFps ? meta.containerFps * slow : null;
  const stageList = photoMode ? PHOTO_STAGES : VIDEO_STAGES;

  const fail = (title: string, body: string) => {
    run.current++;
    setError({ title, body });
    setPhase("error");
  };
  const stage = (k: StageKey, st: StageState, note?: string) => {
    setStages((s) => ({ ...s, [k]: st }));
    if (note !== undefined) setNotes((n) => ({ ...n, [k]: note }));
  };
  const resetStages = (from: StageKey) => {
    const keys = VIDEO_STAGES.map(([k]) => k);
    const after = keys.slice(keys.indexOf(from));
    setStages((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !after.includes(k as StageKey))));
    setNotes((n) => Object.fromEntries(Object.entries(n).filter(([k]) => !after.includes(k as StageKey))));
  };
  const setSlow = (s: number) => {
    job.current.slow = s;
    setSlowState(s);
  };
  const chooseWin = (w: Win, i: number) => {
    job.current.win = w;
    setWin(w);
    setPick(i);
  };

  function resetClip() {
    abort.current?.abort();
    run.current++;
    job.current.src?.close();
    job.current = { meta: null, scan: null, win: null, cands: [], batter: 0, view: "side_on", bowlerSide: "right", viewChosen: false, shotChosen: false, slow: 1, tried: [], attempts: [], src: null, hand: null };
    setScan(null);
    setScanProgress(0);
    setWin(null);
    setCands([]);
    setBatter(0);
    setStill(null);
    setGate(null);
    setTracking(null);
    setMarks(EMPTY_MARKS);
    setSlowState(1);
    setStages({});
    setNotes({});
    setGuess(null);
    setProgress({ done: 0, total: 0 });
  }

  // ---------- Video: read → scan → shot ----------
  async function startVideo(f: File) {
    resetClip();
    const id = ++run.current;
    const alive = () => id === run.current;
    setPhotoMode(false);
    setFile(f);
    fileRef.current = f;
    const u = URL.createObjectURL(f);
    setUrl(u);
    urlRef.current = u;
    setPhase("working");
    stage("read", "active");
    const [track, decoded] = await Promise.all([readVideoTrack(f), openDecoded(f)]);
    const v = video.current!;
    try {
      v.src = u;
      await loaded(v);
    } catch {
      const msg = decodeMessage(f, track);
      return fail(msg.title, msg.body);
    }
    if (!alive()) return;
    if (!v.videoWidth || !v.videoHeight) return fail("No picture in this file", "The file plays but has no video image (audio only?). Choose the original video from your camera roll.");
    if (!Number.isFinite(v.duration) || v.duration < 0.5) return fail("Clip too short", "The clip must include the whole shot — start before the ball is bowled and stop after the follow-through.");
    let fps = track?.fps ?? null;
    let fpsSource: Meta["fpsSource"] = track ? "container" : "unknown";
    if (!fps && "requestVideoFrameCallback" in v) {
      fps = await estimatePlaybackFps(v);
      fpsSource = fps ? "playback" : "unknown";
    }
    if (!alive()) return;
    const m: Meta = { width: v.videoWidth, height: v.videoHeight, containerFps: fps, fpsSource, durationSec: v.duration };
    // Only when the decoder sees the picture exactly as the player does (size, orientation).
    job.current.src = decoded && decoded.width === m.width && decoded.height === m.height ? decoded : null;
    job.current.meta = m;
    setMeta(m);
    stage("read", "done", `${m.width}×${m.height} · ${fps ? `${Math.round(fps)} fps` : "frame rate unknown"} · ${m.durationSec.toFixed(1)} s`);

    stage("shot", "active", "Getting the on-device analyser ready (first time only)…");
    try {
      const [det, scanPose] = await Promise.all([loadPersonDetector(), loadScanPose()]);
      if (!alive()) return;
      stage("shot", "active", m.durationSec > 20 ? "Looking through the whole clip…" : "");
      abort.current = new AbortController();
      const scanned = await scanVideo(v, det, WINDOW_SEC, setScanProgress, abort.current.signal, scanPose, job.current.src);
      if (!alive() || abort.current.signal.aborted) return;
      const res = { ...scanned, windows: await verifyWindows(v, await loadStillPose(), scanned) };
      if (!alive()) return;
      job.current.scan = res;
      setScan(res);
      const best = bestWindow(res, []);
      const w = res.windows[best];
      chooseWin(w ? { start: w.start, end: w.end, peak: w.peak } : { start: 0, end: Math.min(m.durationSec, WINDOW_SEC), peak: Math.min(m.durationSec, WINDOW_SEC) / 2 }, best);
      job.current.tried = [best];
      stage("shot", "done", shotNote(res, best));
      await fromBatter(id);
    } catch (e) {
      if (alive()) fail("Couldn't scan this clip", e instanceof Error ? e.message : "The on-device vision model failed to load. Check your connection and try again.");
    }
  }

  // ---------- Batter → camera → check → track, each resumable after a "Change" ----------
  async function fromBatter(id: number) {
    const alive = () => id === run.current;
    const { scan: sc, win: w, meta: m } = job.current;
    if (!sc || !w || !m) return;
    const v = video.current!;
    stage("batter", "active");
    const { at, candidates } = batterCandidates(sc.samples, w);
    const cs = await verifyCandidates(v, candidates, w, at, m.width / m.height);
    if (!alive()) return;
    job.current.cands = cs;
    job.current.batter = 0;
    setCands(cs);
    setBatter(0);
    await seek(v, at);
    setStill(snapshot(v));
    stage(
      "batter",
      "done",
      cs.length > 1 ? `${cs.length} people in view — following the one batting` : cs.length ? "Found the batter" : "No clear person found — using the whole frame",
    );
    await fromCamera(id);
  }

  async function fromCamera(id: number) {
    const alive = () => id === run.current;
    const j = job.current;
    if (!j.win || !j.meta) return;
    stage("camera", "active");
    if (!j.viewChosen) {
      const v = video.current!;
      const stillPose = await loadStillPose();
      const c = j.cands[j.batter];
      const frames = [];
      // Stance and stroke: the stride at the stroke makes the front side's direction clearest.
      for (const t of [j.win.peak, j.win.start + (j.win.end - j.win.start) * 0.12]) {
        await seek(v, t);
        if (!alive()) return;
        frames.push(detectStill(stillPose, v, cropFor(c, t, j.meta)));
      }
      // The top hand on the handle is the front-side hand: this batter's own hand, whatever the profile says.
      j.hand = gripHandedness(frames.map((f) => f.body), j.meta.width / j.meta.height, 1)?.handedness ?? null;
      const g = guessView(frames, j.hand ?? profile.handedness);
      const choice: ViewChoice = g && (g.view === "front_on" || g.view === "behind") ? g.view : "side_on";
      setGuess(g ? choice : null);
      j.view = choice;
      setView(choice);
      if (g) {
        j.bowlerSide = g.bowlerSide;
        setBowlerSide(g.bowlerSide);
      }
    }
    stage("camera", "done", `${VIEW_TEXT[j.view][0]!.toUpperCase()}${VIEW_TEXT[j.view].slice(1)}${j.viewChosen ? " (your choice)" : ""}`);
    await fromCheck(id);
  }

  async function fromCheck(id: number) {
    const alive = () => id === run.current;
    const j = job.current;
    if (!j.win || !j.meta || !j.scan) return;
    stage("check", "active");
    try {
      const q = await runGate(j.win, j.meta, j.cands[j.batter]);
      if (!alive()) return;
      setGate(q);
      if (q.status === "fail") {
        // Try the next-best shot on its own before asking the athlete to do anything.
        const next = bestWindow(j.scan, j.tried);
        if (next >= 0 && j.tried.length < MAX_AUTO_TRIES && !j.shotChosen) {
          const w = j.scan.windows[next]!;
          j.tried.push(next);
          chooseWin({ start: w.start, end: w.end, peak: w.peak }, next);
          stage("shot", "done", `${shotNote(j.scan, next)} · the first one wasn't clear enough`);
          resetStages("batter");
          return fromBatter(id);
        }
        if (j.attempts.length) {
          // An earlier shot was analysed: report the clearest of those instead.
          const b = j.attempts.reduce((best, a) => (rank(a.payload) > rank(best.payload) ? a : best), j.attempts[0]!);
          mediaTimesRef.current = b.times;
          stage("check", "done", "This shot isn't usable — using the earlier one");
          return finish(b.marks, b.tr);
        }
        stage("check", "done", "Not usable");
        setPhase("blocked");
        return;
      }
      const warns = q.checks.filter((c) => c.status === "warn").length;
      stage("check", "done", q.status === "pass" ? "Recording looks good" : `Usable · ${warns} ${warns === 1 ? "note" : "notes"} in the report`);
      await track(id);
    } catch (e) {
      if (alive()) fail("Couldn't check this clip", e instanceof Error ? e.message : "The quality check failed on this device.");
    }
  }

  /** Quality check on sampled frames of the shot, following the batter. */
  async function runGate(w: Win, m: Meta, c: BatterCandidate | undefined): Promise<CaptureQuality> {
    const v = video.current!;
    const stillPose = await loadStillPose();
    const a = m.width / m.height;
    const sampler = new FrameQualitySampler(a);
    const body: ImgPoint[][] = [];
    const quality: FrameQuality[] = [];
    let people = 1;
    const len = Math.min(w.end, m.durationSec) - w.start;
    const times = Array.from({ length: GATE_SAMPLES }, (_, i) => w.start + (len * (i + 0.5)) / GATE_SAMPLES);
    let follow: Roi | null = null;
    const at = (i: number, from: HTMLVideoElement | HTMLCanvasElement) => {
      quality[i] = sampler.sample(from, i);
      // Where the scan saw the batter at this moment, else where pose last found them.
      let p = detectStill(stillPose, from, cropFor(c, times[i]!, m));
      if (!bodyBox(p.body) && follow) p = detectStill(stillPose, from, follow);
      const b = bodyBox(p.body);
      if (b) follow = roiAround(b, a, 0.32);
      people = Math.max(people, p.people);
      body[i] = p.body;
    };
    // Exact frames from the file when possible (same frames every run); else one pass
    // through the shot instead of a seek per sample.
    let missed: number[] | null = null;
    const src = job.current.src;
    if (src) missed = await src.read(times, (i, frame) => at(i, frame)).catch(() => null);
    if (!src || !missed) {
      const fd = 1 / (m.containerFps ?? 30);
      missed = await playFrames(v, times, (i) => at(i, v), { frameDur: fd, rate: 2, tolerance: fd * 1.5 });
    }
    for (const i of missed ?? times.map((_, k) => k)) {
      await seek(v, times[i]!);
      at(i, v);
    }
    const s = job.current.slow;
    const probe: CaptureObservation = {
      schema: "align.observation/1",
      id: "probe",
      source: "browser_capture",
      demo: false,
      media: { kind: "video", width: m.width, height: m.height, fps: m.containerFps ? m.containerFps * s : null, fpsSource: m.fpsSource, durationMs: (len / s) * 1000, frameCount: body.length },
      tier,
      athlete: { handedness: profile.handedness, heightCm: profile.heightCm },
      camera: { view: job.current.view, bowlerSide: job.current.bowlerSide },
      calibration: { source: "none", metresPerUnit: null, stumpsX: null, groundY: null },
      // People overlapping the batter's region, not everyone on the field.
      quality: { frames: quality, maxPeople: people },
      t: times.map((t) => t * 1000),
      body,
      bat: { source: "none", handle: body.map(() => null), toe: body.map(() => null) },
      ball: { source: "none", points: body.map(() => null) },
      marks: { bounceFrame: null, contactFrame: null },
    };
    return assessCapture(probe);
  }

  /** Track the batter frame by frame over the shot, then build the report. */
  async function track(id: number) {
    const alive = () => id === run.current;
    const j = job.current;
    const w = j.win;
    const m = j.meta;
    if (!m || !w) return;
    stage("track", "active");
    try {
      // The faster pose path on this device, decided once (on a frame of this shot) and then
      // kept, so the same clip always gives the same result here.
      await seek(video.current!, w.start + 0.5 / (m.containerFps ?? 30));
      await decideDelegate(video.current!);
      const [firstPose, det] = await Promise.all([loadPose(), loadPersonDetector()]);
      let pose = firstPose;
      let cpuTried = false;
      const c = j.cands[j.batter];
      const a = m.width / m.height;
      const cFps = m.containerFps ?? 30;
      const rFps = cFps * j.slow;
      const windowLen = Math.min(m.durationSec - w.start, w.end - w.start);
      const containerFrames = Math.max(2, Math.floor(windowLen * cFps));
      const stride = Math.max(1, Math.ceil(containerFrames / MAX_FRAMES));
      const count = Math.floor(containerFrames / stride);
      const v = video.current!;
      const sampler = new FrameQualitySampler(a);
      const world: CameraPoint[][] = [];
      const out: TrackingResult = {
        t: [],
        body: [],
        world,
        depth: [],
        people: 1,
        quality: [],
        fps: rFps / stride,
        fpsSource: m.fpsSource,
        width: m.width,
        height: m.height,
        durationMs: ((count * stride) / rFps) * 1000,
        kind: "video",
      };
      const times = Array.from({ length: count }, (_, i) => w.start + (i * stride + 0.5) / cFps);
      const startRoi = () => roiAround(c ? (boxAt(c, w.start, 1) ?? c.box) : { x: 0, y: 0, w: 1, h: 1 }, a, 0.32);
      const follower = new Follower(c ? (boxAt(c, w.start, 1) ?? c.box) : { x: 0, y: 0, w: 1, h: 1 }, a);
      const qEvery = Math.max(1, Math.round(count / 24));
      // Start from where the chosen batter's hips are, so the first frame can't lock onto
      // someone else in the crop (the keeper right behind).
      const seedHip = (): [number, number] | null => {
        const b = c ? (boxAt(c, w.start, 1) ?? c.box) : null;
        return b ? [b.x + b.w / 2, b.y + b.h * 0.55] : null;
      };
      let prevHip: [number, number] | null = seedHip();
      let seen = 0;
      let done = 0;
      let ran = 0;
      // Some phones' GPU path loads but returns nothing: after 12 empty frames, start again on the CPU path.
      const gpuDead = () => !cpuTried && ran >= 12 && seen === 0;
      // The stroke: the frame the batter was identified on.
      const key = times.reduce((best, t, i) => (Math.abs(t - w.peak) < Math.abs(times[best]! - w.peak) ? i : best), 0);
      // Before the stroke, the batter is linked back from there through the person
      // detector, so a zoom or pan can't hand the tracking to someone else.
      const anchorBox = c ? (boxAt(c, w.peak, 0.35) ?? c.box) : null;
      // Only needed when the scan can't vouch for the batter at the window start: it
      // didn't see them there, or they jumped in size or place before the stroke (the
      // camera zoomed, panned or cut). A camera on a stand skips it.
      const startBox = c ? boxAt(c, w.start, 0.35) : null;
      const steady =
        !!startBox &&
        !!anchorBox &&
        Math.abs(Math.log(startBox.h / anchorBox.h)) < Math.log(1.3) &&
        Math.hypot((startBox.x + startBox.w / 2 - (anchorBox.x + anchorBox.w / 2)) * a, startBox.y + startBox.h / 2 - (anchorBox.y + anchorBox.h / 2)) <
          0.5 * Math.max(startBox.h, anchorBox.h);
      let linked: Array<Box | null> | null = null;
      if (anchorBox && key > 0 && !steady) {
        stage("track", "active", "Following the batter back from the shot…");
        const pre = times.slice(0, key + 1);
        const people: Box[][] = [];
        const look = (i: number, src: HTMLVideoElement | HTMLCanvasElement) => {
          people[i] = detectPeople(det, src);
          return alive();
        };
        let missed: number[] | null = null;
        if (j.src) {
          try {
            missed = await j.src.read(pre, (i, frame) => look(i, frame), () => !alive());
          } catch {
            j.src = null; // decoder failed on this device: play through instead
          }
        }
        if (!j.src) missed = await playFrames(v, pre, (i) => look(i, v), { frameDur: 1 / cFps, stop: () => !alive() });
        for (const i of missed ?? []) {
          if (!alive()) return;
          await seek(v, pre[i]!);
          look(i, v);
        }
        if (!alive()) return;
        linked = linkBack(people, anchorBox, key, a, Math.max(4, Math.round(0.3 * rFps / stride)));
      }
      const luma = new LumaTrack(a);
      const at = (i: number, src: HTMLVideoElement | HTMLCanvasElement) => {
        const mt = times[i]!;
        luma.take(i, src);
        // Linked frames follow the link; frames it couldn't reach aren't the batter's.
        const lb = linked && i <= key ? linked[i] : undefined;
        let p: PoseFrame;
        if (lb === null) p = EMPTY(prevHip);
        else {
          if (lb) {
            follower.roi = roiAround(lb, a, 0.32);
            prevHip = [lb.x + lb.w / 2, lb.y + lb.h * 0.55];
          }
          p = detectFrame(pose, src, 10 + Math.round(mt * 1000), prevHip, follower.roi);
          ran++;
          if (!follower.see(p) && follower.isLost && !lb) {
            // Lost (cut, zoom, occlusion): re-anchor on the scan's box, else the detector.
            const anchor = c ? boxAt(c, mt, 0.3) : null;
            if (anchor) follower.roi = roiAround(anchor, a, 0.32);
            else follower.reacquire(detectPeople(det, src));
            p = detectFrame(pose, src, 11 + Math.round(mt * 1000), prevHip, follower.roi);
            follower.see(p);
          }
        }
        if (bodyBox(p.body)) seen++;
        prevHip = p.hip;
        out.body[i] = p.body;
        world[i] = p.world;
        out.depth[i] = p.depth;
        out.people = Math.max(out.people, p.people);
        out.t[i] = Math.round(((i * stride) / rFps) * 1000 * 100) / 100;
        if (i % qEvery === 0) out.quality.push(sampler.sample(src, i));
        done++;
        if (done % 4 === 0) setProgress({ done, total: count });
      };
      const reset = () => {
        [out.body, out.depth, out.quality, out.t, world.length, seen, done, ran, prevHip] = [[], [], [], [], 0, 0, 0, 0, seedHip()];
        luma.reset();
        follower.roi = startRoi();
      };
      const pass = async () => {
        let missed: number[] | null = null;
        if (j.src) {
          // Exact frames decoded straight from the file: the same frames every run.
          try {
            missed = await j.src.read(times, (i, frame) => (at(i, frame), alive() && !gpuDead()), () => !alive());
          } catch {
            j.src = null; // decoder failed on this device: play through instead
            reset();
          }
        }
        // One play-through of the window, pausing on each frame (no per-frame seek).
        if (!j.src) missed = await playFrames(v, times, (i) => (at(i, v), alive() && !gpuDead()), { frameDur: 1 / cFps, stop: () => !alive() });
        for (const i of missed ?? times.map((_, k) => k)) {
          if (!alive() || gpuDead()) return;
          await seek(v, times[i]!);
          at(i, v);
        }
      };
      setProgress({ done: 0, total: count });
      await pass();
      if (!alive()) return;
      if (gpuDead()) {
        cpuTried = true;
        pose = await loadPose({ cpu: true });
        reset();
        await pass();
        if (!alive()) return;
      }
      out.quality.sort((x, y) => x.frame - y.frame);
      setProgress({ done: count, total: count });
      // Keep only the camera shot that holds the stroke (broadcast cuts, replays).
      const [s0, s1] = strokeSegment(out.body, a, key, Math.round(1.0 * out.fps), undefined, luma.cuts());
      let note = "";
      if (s0 > 0 || s1 < out.body.length) {
        const t0 = out.t[s0] ?? 0;
        out.t = out.t.slice(s0, s1).map((t) => Math.round((t - t0) * 100) / 100);
        out.body = out.body.slice(s0, s1);
        out.world = world.slice(s0, s1);
        out.depth = out.depth.slice(s0, s1);
        out.quality = out.quality.filter((q) => q.frame >= s0 && q.frame < s1).map((q) => ({ ...q, frame: q.frame - s0 }));
        out.durationMs = ((s1 - s0) * stride * 1000) / rFps;
        times.splice(s1);
        times.splice(0, s0);
        seen = out.body.filter((b) => bodyBox(b)).length;
        note = " · camera cut skipped";
      }
      // Batting hand: the grip at the stance (bat held down) in the tracked frames, else the one read while finding the camera.
      const setup = out.body.slice(0, Math.max(3, Math.round(out.body.length * 0.2)));
      out.handedness = gripHandedness(setup, a, 3)?.handedness ?? j.hand ?? undefined;
      mediaTimesRef.current = times;
      setMediaTimes(times);
      setTracking(out);
      stage("track", "done", `${out.body.length} frames · body found in ${Math.round((seen / Math.max(1, out.body.length)) * 100)}%${note}`);
      const fm = { ...EMPTY_MARKS, view: j.view, bowlerSide: j.bowlerSide };
      setMarks(fm);
      await finish(fm, out);
    } catch (e) {
      if (alive()) fail("Tracking stopped", e instanceof Error ? e.message : "Tracking failed on this device. Close other apps and try again.");
    }
  }

  // ---------- Photos: read → batter → report ----------
  async function startPhotos(files: File[]) {
    resetClip();
    const id = ++run.current;
    setPhotoMode(true);
    setFile(files[0] ?? null);
    fileRef.current = files[0] ?? null;
    setUrl(null);
    urlRef.current = null;
    setMeta(null);
    setPhase("working");
    stage("read", "active");
    setProgress({ done: 0, total: files.length });
    try {
      const res = await loadPhotos(files, (done, total) => {
        setProgress({ done, total });
        if (done > 0) stage("batter", "active");
      });
      if (id !== run.current) return;
      if (!res.items.length) {
        return fail(
          files.length === 1 ? "This photo can't be used" : "None of these photos can be used",
          res.failed.map((f) => `${f.name}: ${f.reason}`).join("\n") || "No photo could be decoded.",
        );
      }
      stage("read", "done", `${res.items.length} ${res.items.length === 1 ? "photo" : "photos"}${res.failed.length ? ` · ${res.failed.length} skipped` : ""}`);
      const found = res.items.filter((i) => i.frame).length;
      if (!found) {
        // Say what was seen: no person at all, or a person whose joints couldn't be placed.
        const people = Math.max(...res.items.map((i) => i.seen.people));
        const px = Math.max(0, ...res.items.map((i) => i.seen.personPx ?? 0));
        return people
          ? fail(
              "Can't read the batter's body",
              `We can see ${people === 1 ? "a person" : `${people} people`}${px ? `, about ${px} px tall in the photo,` : ""} but couldn't place the joints of their body. Use a larger or sharper photo, with the batter fully in frame from head to feet.`,
            )
          : fail("No batter found", "We couldn't see a person in the photo. Use a photo with the whole batter in frame, head to feet, not too far away.");
      }
      stage("batter", "done", found === res.items.length ? "Found in every photo" : `Found in ${found} of ${res.items.length}`);
      await continuePhotos(res);
    } catch (e) {
      if (id === run.current) fail("Couldn't read the photos", e instanceof Error ? e.message : "The on-device vision model failed to load. Check your connection and try again.");
    }
  }

  /** Ask who bats in any photo where two people look alike; then analyse. */
  async function continuePhotos(res: PhotoLoad) {
    const at = res.items.findIndex((i) => i.frame && i.ambiguous);
    if (at >= 0) {
      const it = res.items[at]!;
      photoRes.current = { res, at };
      setPhotoAspect(res.width / res.height);
      setStill(it.canvas.toDataURL("image/jpeg", 0.85));
      setCands(it.options.map((o) => ({ box: o.box, persistence: 1, extent: o.box, bat: 0, track: [] })));
      setBatter(0);
      stage("batter", "active", res.items.length > 1 ? `Photo ${at + 1}: two people look alike` : "Two people look alike");
      setPhase("batter");
      return;
    }
    photoRes.current = null;
    // This batter's hand from the grip (top hand on the handle), else the profile's.
    const bodies = res.items.filter((i) => i.frame).map((i) => i.frame!.body);
    const hand = gripHandedness(bodies, res.width / res.height, 1)?.handedness ?? profile.handedness;
    const g = guessView(res.items.map((i) => i.frame), hand);
    const choice: ViewChoice = g && (g.view === "front_on" || g.view === "behind") ? g.view : "side_on";
    // Not clearly square-on: the stride and lean run partly toward the camera and read short,
    // so the photo is treated as taken at an angle (posture shown, not graded).
    const angled = !g || (g.view === "side_on" && !g.confident);
    stage("camera", "done", angled ? "At an angle, not square side-on" : `${VIEW_TEXT[choice][0]!.toUpperCase()}${VIEW_TEXT[choice].slice(1)}`);
    await analysePhotos(res, angled ? "oblique" : choice, g?.bowlerSide ?? "right", hand);
  }

  async function analysePhotos(photos: PhotoLoad, v: ViewChoice | "oblique", side: "left" | "right", hand: "right" | "left") {
    const use = photos.items.filter((i) => i.frame);
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
      handedness: hand,
    };
    setTracking(tr);
    await finish({ ...EMPTY_MARKS, view: v, bowlerSide: side }, tr, keyframes);
  }

  // ---------- Analyse, store locally, open the report ----------
  async function finish(finalMarks: Marks, tr: TrackingResult | null = tracking, photoKeyframes?: Record<number, Blob>) {
    if (!tr) return;
    stage("report", "active");
    try {
      const id = remark?.id ?? crypto.randomUUID();
      const raw = buildObservation({ id, tracking: tr, marks: finalMarks, tier, handedness: tr.handedness ?? profile.handedness, heightCm: profile.heightCm });
      const obs = quantise(raw);
      const createdAt = remark?.createdAt ?? new Date().toISOString();
      let payload = analyze(obs, { analysisId: id, createdAt });
      let attempt: Attempt = { obs, payload, tr, marks: finalMarks, times: [...mediaTimesRef.current] };

      // A clip with several shots: if this one couldn't be confirmed either way (or the
      // batter turned out not to be fully in view), try the next one on its own, and
      // report the clearest result.
      const j = job.current;
      if (!remark && tr.kind === "video" && !j.shotChosen && j.scan) {
        j.attempts.push(attempt);
        const next = bestWindow(j.scan, j.tried);
        const unclear = payload.analysis_status === "uncertain_shot" || payload.analysis_status === "capture_failed";
        if (unclear && next >= 0 && j.tried.length < MAX_AUTO_TRIES) {
          const w = j.scan.windows[next]!;
          j.tried.push(next);
          chooseWin({ start: w.start, end: w.end, peak: w.peak }, next);
          stage("shot", "done", `${shotNote(j.scan, next)} · the last one wasn't clear enough`);
          resetStages("batter");
          return fromBatter(run.current);
        }
        attempt = j.attempts.reduce((best, a) => (rank(a.payload) > rank(best.payload) ? a : best), j.attempts[0]!);
        payload = attempt.payload;
        tr = attempt.tr;
        finalMarks = attempt.marks;
        mediaTimesRef.current = attempt.times;
        setMediaTimes(attempt.times);
        setTracking(attempt.tr);
      }
      const gz = await encodeTracks(attempt.obs);
      const keyframes = photoKeyframes ?? (tr.kind === "video" ? await grabKeyframes(video.current!, mediaTimesRef.current, payload.evidence_frames) : {});
      const f = fileRef.current;
      const clipUrl = urlRef.current;
      const name = f?.name?.replace(/\.[^.]+$/, "");
      const title = remark?.title ?? (tr.kind === "photo" ? (tr.body.length > 1 ? `${tr.body.length} photos` : (name ?? "Photo")) : (name ?? "Front-foot defence"));
      const recordedAt = remark?.recordedAt ?? (f?.lastModified ? new Date(f.lastModified).toISOString() : createdAt);
      await saveAnalysis({ id, createdAt, recordedAt, payload, title, notes: "", tags: [], representative: false, cloud: null }, gz, keyframes);
      if (clipUrl && tr.kind === "video") {
        sessionMedia.set(id, { url: clipUrl, mediaTimes: mediaTimesRef.current });
        sessionCapture.set(id, { tracking: tr, view: finalMarks.view === "front_on" || finalMarks.view === "behind" ? finalMarks.view : "side_on", bowlerSide: finalMarks.bowlerSide, title, createdAt, recordedAt });
      }
      stage("report", "done");
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
    if (vid) return startVideo(vid);
    if (images.length) return startPhotos(images);
    fail("Unsupported file", `${files[0]!.name} isn't a video or photo this app can read. Use MP4 or MOV videos, or JPEG, PNG or WebP photos.`);
  };

  // ---------- Corrections: cancel the run, ask, resume from that point ----------
  const openChange = (p: "shot" | "batter" | "view") => {
    run.current++;
    abort.current?.abort();
    setPhase(p);
  };
  const resume = (from: "batter" | "camera" | "check") => {
    const id = ++run.current;
    resetStages(from);
    setPhase("working");
    if (from === "batter") void fromBatter(id);
    else if (from === "camera") void fromCamera(id);
    else void fromCheck(id);
  };

  // ---------- UI ----------
  return (
    <>
      {/* Rendered but invisible: browsers only report displayed frames for a video that is laid out. */}
      <video ref={bindVideo} muted playsInline preload="auto" aria-hidden className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {phase === "add" && (
              <>
                <div>
                  <p className="eyebrow">Front-foot defence</p>
                  <h1 className="display mt-2 text-[2.4rem] sm:text-5xl">Add your shot</h1>
                  <p className="mt-2 text-fg-muted">A video of any length — one ball, a net session or match footage — or a few photos. Align finds the shot, the batter and the camera angle on its own.</p>
                </div>

                <div className="card p-4 space-y-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
                      checked={profile.consentProcessing}
                      onChange={(e) => {
                        const p = { ...profile, consentProcessing: e.target.checked };
                        setProfile(p);
                        saveProfile(p);
                      }}
                    />
                    <span>
                      Analyse my movement on this device. <span className="text-fg-muted">The video never leaves your phone; only movement tracks and the report are kept.</span>{" "}
                      <Link href="/privacy" className="underline">Privacy</Link>
                    </span>
                  </label>
                  {minor && (
                    <label className="flex items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" checked={guardianOk} onChange={(e) => setGuardianOk(e.target.checked)} />
                      <span>I am under 18 and a parent or guardian has agreed to this.</span>
                    </label>
                  )}
                </div>

                <div
                  className={`grid gap-3 rounded-2xl sm:grid-cols-3 ${dragging ? "outline-2 outline-dashed outline-brand outline-offset-4" : ""} ${consented ? "" : "opacity-50"}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (consented) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (consented) onFiles(e.dataTransfer.files);
                  }}
                  aria-disabled={!consented}
                >
                  <label className={`card card-hover p-5 flex flex-col items-center gap-2 text-center ${consented ? "cursor-pointer" : "pointer-events-none"}`}>
                    <Upload size={26} className="text-brand" />
                    <span className="font-semibold">Choose a video</span>
                    <span className="text-xs text-fg-subtle">MP4, MOV or WebM · slow-motion is best</span>
                    <input type="file" disabled={!consented} accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                  <label className={`card card-hover p-5 flex flex-col items-center gap-2 text-center ${consented ? "cursor-pointer" : "pointer-events-none"}`}>
                    <Target size={26} className="text-data" />
                    <span className="font-semibold">Choose photos</span>
                    <span className="text-xs text-fg-subtle">1–12 photos · position check</span>
                    <input type="file" disabled={!consented} accept="image/*,.heic,.heif" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                  <label className={`card card-hover p-5 flex flex-col items-center gap-2 text-center ${consented ? "cursor-pointer" : "pointer-events-none"}`}>
                    <RecordIcon size={26} className="text-bad" />
                    <span className="font-semibold">Record now</span>
                    <span className="text-xs text-fg-subtle">Opens your camera</span>
                    <input type="file" disabled={!consented} accept="video/*" capture="environment" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
                {!consented && <p className="text-sm text-fg-muted">Tick the box above to add a video or photos.</p>}

                <details className="card p-4 group">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                    How to film it for the best result
                    <Chevron size={18} className="transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="mt-4 space-y-4">
                    <CameraPlacementDiagram />
                    <ul className="grid gap-2 text-sm">
                      {[
                        "Slow-motion mode (120 or 240 fps) if your phone has it",
                        "Phone fixed on a tripod or wedged still",
                        "Square-on to the batter at hip height, 6–8 m away — or from behind the bowler",
                        "Batter head to feet, the whole bat and the bounce zone in frame",
                      ].map((t) => (
                        <li key={t} className="flex gap-2"><Check size={16} className="text-brand mt-0.5 shrink-0" /> {t}</li>
                      ))}
                    </ul>
                    <LiveFramingCheck />
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-subtle">
                  <span>
                    Batting {profile.handedness}-handed{profile.heightCm ? `, ${profile.heightCm} cm` : ""} · <Link href="/profile" className="underline">change</Link>
                  </span>
                  <Link href="/sample/session3d" className="underline">Two-phone 3D session (preview)</Link>
                </div>
                <div>
                  <p className="text-sm font-medium text-fg-muted">Other shots, after validation</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {["Drives", "Pull and hook", "Cut", "Sweep", "Back-foot defence"].map((s) => (
                      <li key={s} className="chip border-line text-fg-subtle"><Lock size={12} /> {s}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-fg-subtle">Upload them anyway: they are recognised, and the defence score is withheld.</p>
                </div>
              </>
            )}

            {phase === "working" && (
              <>
                <div>
                  <p className="eyebrow">Analysing{file ? ` · ${file.name}` : ""}</p>
                  <h1 className="display mt-2 text-[2.2rem] sm:text-5xl">{stages.report === "active" ? "Building your report…" : "Working on it…"}</h1>
                  <p className="mt-2 text-fg-muted">Everything runs on this device. Keep this screen open.</p>
                </div>
                <ol className="card divide-y divide-line" aria-label="Analysis progress">
                  {stageList.map(([k, label]) => {
                    const st = stages[k] ?? "waiting";
                    const change =
                      st === "done" && !photoMode
                        ? k === "shot" && (scan?.windows.length ?? 0) > 1
                          ? () => openChange("shot")
                          : k === "batter" && cands.length > 1
                            ? () => openChange("batter")
                            : k === "camera"
                              ? () => openChange("view")
                              : null
                        : null;
                    const pct =
                      k === "shot" ? scanProgress : (k === "track" || (photoMode && k === "read")) && progress.total ? progress.done / progress.total : null;
                    return (
                      <li key={k} className="flex items-start gap-3 px-4 py-3" aria-current={st === "active" ? "step" : undefined}>
                        <StageIcon state={st} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={st === "waiting" ? "text-fg-subtle" : "font-medium"}>{label}</span>
                            {change && (
                              <button onClick={change} className="shrink-0 text-sm font-medium text-brand hover:underline">
                                Change
                              </button>
                            )}
                          </div>
                          {notes[k] && <p className="mt-0.5 text-sm text-fg-muted">{notes[k]}</p>}
                          {st === "active" && pct !== null && (
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-line" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemax={100}>
                              <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(3, pct * 100)}%` }} />
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {!photoMode && meta && (meta.containerFps ?? 0) <= 60 && stages.check === "done" && (
                  <SlowExport slow={slow} onChange={(s) => {
                    setSlow(s);
                    const w = job.current.win;
                    if (w && meta) chooseWin({ ...w, end: Math.min(meta.durationSec, w.start + WINDOW_SEC * s) }, pick);
                    resume("check");
                  }} />
                )}
                <button className="btn btn-quiet" onClick={() => { resetClip(); setPhase("add"); }}>Cancel</button>
              </>
            )}

            {phase === "shot" && scan && win && url && meta && (
              <>
                <MomentPicker
                  url={url}
                  windows={scan.windows}
                  selected={pick}
                  onSelect={(i) => {
                    const w = scan.windows[i];
                    if (w) chooseWin({ start: w.start, end: Math.min(meta.durationSec, w.start + Math.max(w.end - w.start, WINDOW_SEC * slow)), peak: w.peak }, i);
                  }}
                  current={win}
                  onAdjust={(s) => {
                    const w = job.current.win;
                    if (w) chooseWin({ start: s, end: Math.min(meta.durationSec, s + (w.end - w.start)), peak: Math.min(Math.max(w.peak, s), s + (w.end - w.start)) }, pick);
                  }}
                  duration={meta.durationSec}
                  windowMedia={WINDOW_SEC * slow}
                  scannedTo={scan.scannedTo}
                  cuts={scan.cuts}
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    className="btn btn-primary flex-1 sm:flex-none"
                    onClick={() => {
                      job.current.tried = [pick];
                      job.current.attempts = [];
                      job.current.shotChosen = true;
                      stage("shot", "done", `${shotNote(scan, pick)} (your choice)`);
                      resume("batter");
                    }}
                  >
                    Use this shot
                  </button>
                </div>
              </>
            )}

            {phase === "batter" && still && (
              <>
                <BatterPicker image={still} aspect={photoMode && photoAspect ? photoAspect : aspect} candidates={cands} selected={batter} onSelect={(i) => { setBatter(i); job.current.batter = i; }} />
                <div className="flex flex-wrap gap-3">
                  <button
                    className="btn btn-primary w-full sm:w-auto"
                    onClick={() => {
                      stage("batter", "done", "The person you picked");
                      const pick = photoRes.current;
                      if (photoMode && pick) {
                        // Analyse the chosen person's skeleton (read for their box), then any other unclear photo.
                        const it = pick.res.items[pick.at]!;
                        const o = it.options[batter] ?? it.options[0]!;
                        Object.assign(it, { frame: o.frame, batter: o.box, ambiguous: false });
                        setPhase("working");
                        void continuePhotos(pick.res).catch((e) => fail("Analysis failed", e instanceof Error ? e.message : "Something went wrong while preparing the report."));
                        return;
                      }
                      resume("camera");
                    }}
                  >
                    {photoMode ? "Analyse this person" : "Follow this person"}
                  </button>
                </div>
              </>
            )}

            {phase === "view" && (
              <>
                <ViewPicker
                  view={view}
                  bowlerSide={bowlerSide}
                  suggested={guess}
                  onView={(v) => { setView(v); job.current.view = v; }}
                  onBowlerSide={(s) => { setBowlerSide(s); job.current.bowlerSide = s; }}
                  image={still}
                  aspect={aspect}
                />
                <button
                  className="btn btn-primary w-full sm:w-auto"
                  onClick={() => {
                    job.current.viewChosen = true;
                    resume("camera");
                  }}
                >
                  Use this camera position
                </button>
              </>
            )}

            {phase === "blocked" && gate && meta && win && (
              <>
                <div>
                  <p className="eyebrow">Recording check</p>
                  <h1 className="display mt-2 text-[2.2rem] sm:text-5xl">We can&apos;t analyse this clip yet</h1>
                  <p className="mt-2 text-fg-muted">
                    {gate.checks.find((c) => c.status === "fail")?.correction ?? "The recording doesn't show enough of the batter."} Nothing has been processed or saved.
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div className="card p-3"><dt className="text-fg-subtle">Frame rate</dt><dd className="num text-lg">{realFps ? `${Math.round(realFps)} fps` : "unknown"}</dd></div>
                  <div className="card p-3"><dt className="text-fg-subtle">Resolution</dt><dd className="num text-lg">{meta.width}×{meta.height}</dd></div>
                  <div className="card p-3"><dt className="text-fg-subtle">Shot</dt><dd className="num text-lg">{fmtTime(win.start)}</dd><dd className="text-xs text-fg-subtle">of {fmtTime(meta.durationSec)}</dd></div>
                </dl>
                <div className="card px-4"><CaptureChecklist checks={gate.checks} /></div>
                <div className="flex flex-wrap gap-3">
                  {scan && scan.windows.length > 1 && <button className="btn btn-primary" onClick={() => openChange("shot")}>Pick the shot myself</button>}
                  {cands.length > 1 && <button className="btn btn-ghost" onClick={() => openChange("batter")}>Pick the batter</button>}
                  <button className="btn btn-ghost" onClick={() => openChange("view")}>Change camera position</button>
                  <button className="btn btn-quiet" onClick={() => { resetClip(); setPhase("add"); }}>Use another file</button>
                </div>
                {(meta.containerFps ?? 0) <= 60 && <SlowExport slow={slow} onChange={(s) => {
                  setSlow(s);
                  chooseWin({ ...win, end: Math.min(meta.durationSec, win.start + WINDOW_SEC * s) }, pick);
                  resume("check");
                }} />}
              </>
            )}

            {phase === "mark" && tracking && videoEl && (
              <MarkEvidence video={videoEl} tracking={tracking} mediaTimes={mediaTimes} marks={marks} onChange={setMarks} onDone={(m) => { setPhase("working"); void finish(m); }} />
            )}

            {phase === "error" && error && (
              <>
                <h1 className="display text-4xl">{error.title}</h1>
                <p className="whitespace-pre-line text-fg-muted">{error.body}</p>
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary" onClick={() => { resetClip(); setPhase("add"); }}>Try another file</button>
                  <Link className="btn btn-ghost" href="/guide">Recording tips</Link>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "done")
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg" aria-label="done">
        <Check size={13} />
      </span>
    );
  if (state === "active")
    return <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-label="in progress" />;
  return <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line-strong" aria-label="waiting" />;
}

function SlowExport({ slow, onChange }: { slow: number; onChange: (s: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-fg-muted">Was this clip saved as a slowed-down video (slow motion baked in)?</span>
      <select className="field mt-1" value={slow} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={1}>No — it plays at real speed</option>
        <option value={4}>Yes — 4× slowed (120 fps slow-mo)</option>
        <option value={8}>Yes — 8× slowed (240 fps slow-mo)</option>
      </select>
    </label>
  );
}

/** The best shot not tried yet: verified first, then by score. -1 when none is left. */
function bestWindow(res: ScanResult, tried: number[]): number {
  let best = -1;
  res.windows.forEach((w, i) => {
    if (tried.includes(i)) return;
    const b = res.windows[best];
    if (!b || Number(!!w.verified) > Number(!!b.verified) || (!!w.verified === !!b.verified && w.score > b.score)) best = i;
  });
  return best;
}

function shotNote(res: ScanResult, i: number): string {
  const w = res.windows[i];
  if (!w) return "Using the whole clip";
  const n = res.windows.length;
  return n > 1 ? `Shot at ${fmtTime(w.peak)} — best of ${n} found` : `Shot at ${fmtTime(w.peak)}`;
}

/** Crop around the batter at media time `t`: where the scan saw them then, else their extent. */
function cropFor(c: BatterCandidate | undefined, t: number, m: Meta): Roi {
  if (!c) return { x: 0, y: 0, w: 1, h: 1 };
  const b: Box | Roi = boxAt(c, t) ?? c.extent;
  return roiAround(b, m.width / m.height, 0.32);
}

/**
 * Rank the people who could be the batter. Pose must find a real, whole person (stumps,
 * nets or a hand at the frame edge drop out). Then the one who looks like batting wins:
 * both hands together on a handle, not crouched like the keeper, a bat seen at the hands,
 * in view through the shot.
 */
async function verifyCandidates(v: HTMLVideoElement, cs: BatterCandidate[], win: Win, at: number, aspect: number): Promise<BatterCandidate[]> {
  if (!cs.length) return cs;
  const stillPose = await loadStillPose();
  const KEY = [J.nose, J.left_shoulder, J.right_shoulder, J.left_hip, J.right_hip, J.left_knee, J.right_knee, J.left_ankle, J.right_ankle];
  const top = cs.slice(0, 6);
  const quality = top.map(() => 0);
  const likeness = top.map(() => 0);
  for (const t of [at, win.start + (win.end - win.start) * 0.12, win.start + (win.end - win.start) * 0.5]) {
    await seek(v, t);
    top.forEach((c, i) => {
      const b = boxAt(c, t);
      if (!b) return;
      const p = detectStill(stillPose, v, roiAround(b, aspect, 0.3));
      const vis = KEY.reduce((s, k) => s + (p.body[k]?.[2] ?? 0), 0) / KEY.length;
      const hip = p.hip;
      const inside = !!hip && hip[0] >= b.x - b.w * 0.15 && hip[0] <= b.x + b.w * 1.15 && hip[1] >= b.y && hip[1] <= b.y + b.h;
      quality[i] = Math.max(quality[i]!, inside ? vis : vis * 0.3);
      if (inside && vis >= 0.5) likeness[i] = Math.max(likeness[i]!, batterLikeness(p.body, aspect));
    });
  }
  const score = (i: number) => {
    const c = top[i]!;
    return quality[i]! * Math.sqrt(c.box.h) * (0.5 + c.persistence) * (0.25 + likeness[i]!) * (1 + 1.5 * c.bat);
  };
  const ranked = top
    .map((c, i) => ({ c, i }))
    .filter((x) => quality[x.i]! >= 0.55)
    .sort((a, b) => score(b.i) - score(a.i))
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
