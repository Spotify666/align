// Stage A — capture quality gate. Runs before any tracking-dependent analysis so an
// unusable clip never reaches the shot classifier.

import { clamp, mean } from "./math";
import { th } from "./registry";
import { J, type CaptureObservation, type CaptureQuality, type QualityCheck } from "./types";

const KEY_JOINTS = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_wrist",
  "right_wrist",
] as const;

export function bodyCoverage(obs: CaptureObservation): { coverage: number; meanConfidence: number } {
  const minConf = th("tracking.joint_min_conf");
  let full = 0;
  const confs: number[] = [];
  for (const frame of obs.body) {
    let ok = true;
    for (const j of KEY_JOINTS) {
      const p = frame[J[j]];
      if (!p || p[2] < minConf) ok = false;
      if (p) confs.push(p[2]);
    }
    if (ok) full++;
  }
  return { coverage: obs.body.length ? full / obs.body.length : 0, meanConfidence: confs.length ? mean(confs) : 0 };
}

export function assessCapture(obs: CaptureObservation): CaptureQuality {
  const checks: QualityCheck[] = [];
  const isPhoto = obs.media.kind === "photo";
  const short = Math.min(obs.media.width, obs.media.height);

  checks.push({
    id: "chk_resolution",
    label: "Resolution",
    status: short < th("capture.fail_short_side_px") ? "fail" : short < th("capture.min_short_side_px") ? "warn" : "pass",
    value: `${obs.media.width}×${obs.media.height}`,
    requirement: `Short side ≥ ${th("capture.min_short_side_px")} px`,
    correction: "Record at 1080p (or at least 720p) in landscape.",
  });

  if (isPhoto) {
    checks.push({
      id: "chk_media_type",
      label: "Media type",
      status: "warn",
      value: "Photo",
      requirement: "Video for shot identity, timing, bat and ball",
      correction: "Record a short video of the whole delivery to get a shot verdict and technique measures.",
    });
  } else {
    const fps = obs.media.fps ?? 0;
    checks.push({
      id: "chk_frame_rate",
      label: "Frame rate",
      status: fps < th("capture.min_fps_any") ? "fail" : fps < th("capture.min_fps_timing") ? "warn" : "pass",
      value: obs.media.fps ? `${Math.round(fps)} fps${obs.media.fpsSource === "playback" ? " (estimated)" : ""}` : "Unknown",
      requirement: `≥ ${th("capture.min_fps_timing")} fps for timing; 120–240 fps preferred`,
      correction: "Switch the camera to slow-motion (120 or 240 fps) before recording.",
    });
    checks.push({
      id: "chk_duration",
      label: "Clip length",
      status: obs.media.durationMs < th("capture.min_duration_ms") ? "fail" : "pass",
      value: `${(obs.media.durationMs / 1000).toFixed(1)} s`,
      requirement: "Setup, delivery and follow-through all in the clip",
      correction: "Start recording before the bowler's run-up ends and stop after the follow-through.",
    });
  }

  const { coverage } = bodyCoverage(obs);
  checks.push({
    id: "chk_body_visible",
    label: "Full body visible",
    status: coverage < th("capture.fail_body_coverage") ? "fail" : coverage < th("capture.min_body_coverage") ? "warn" : "pass",
    value: `${Math.round(coverage * 100)}% of frames`,
    requirement: `Head to feet visible in ≥ ${Math.round(th("capture.min_body_coverage") * 100)}% of frames`,
    correction: "Move the camera back about 1.5 m so the batter's head and feet stay in frame throughout.",
  });

  const q = obs.quality.frames;
  const brightness = mean(q.map((f) => f.brightness));
  checks.push({
    id: "chk_lighting",
    label: "Lighting",
    status:
      !Number.isFinite(brightness)
        ? "not_applicable"
        : brightness < th("capture.min_brightness") || brightness > th("capture.max_brightness")
          ? "warn"
          : "pass",
    value: Number.isFinite(brightness) ? `${Math.round(brightness * 100)}% brightness` : "—",
    requirement: "Even light; batter not silhouetted",
    correction: "Face the camera away from the sun or bright nets lights; avoid backlighting.",
  });

  const contrast = mean(q.map((f) => f.contrast));
  checks.push({
    id: "chk_contrast",
    label: "Contrast",
    status: !Number.isFinite(contrast) ? "not_applicable" : contrast < th("capture.min_contrast") ? "warn" : "pass",
    value: Number.isFinite(contrast) ? contrast.toFixed(2) : "—",
    requirement: "Batter clearly separated from background",
    correction: "Choose a plainer background behind the batter.",
  });

  const sharp = mean(q.map((f) => f.sharpness));
  checks.push({
    id: "chk_blur",
    label: "Motion blur",
    status: !Number.isFinite(sharp) ? "not_applicable" : sharp < th("capture.min_sharpness") ? "warn" : "pass",
    value: Number.isFinite(sharp) ? (sharp < th("capture.min_sharpness") ? "Blurred" : "Sharp") : "—",
    requirement: "Bat and ball edges visible mid-swing",
    correction: "Use slow-motion mode and better light so the shutter stays fast.",
  });

  const shake = Math.max(0, ...q.map((f) => f.backgroundMotion));
  checks.push({
    id: "chk_stability",
    label: "Camera stability",
    status: q.length === 0 ? "not_applicable" : shake > th("capture.max_background_motion") ? "warn" : "pass",
    value: q.length === 0 ? "—" : shake > th("capture.max_background_motion") ? "Moving" : "Steady",
    requirement: "Phone fixed on a tripod or wedged",
    correction: "Fix the phone on a tripod or prop it against a bag; do not hand-hold.",
  });

  checks.push({
    id: "chk_single_batter",
    label: "Single batter",
    status: obs.quality.maxPeople > 1 ? "warn" : "pass",
    value: obs.quality.maxPeople > 1 ? `${obs.quality.maxPeople} people detected` : "One person",
    requirement: "Only the batter in the analysis area",
    correction: "Ask the keeper and others to stand clear of the frame, or move the camera so they are out of view.",
  });

  checks.push({
    id: "chk_camera_view",
    label: "Camera angle",
    status: obs.camera.view === "side_on" || obs.camera.view === "oblique" ? "pass" : "warn",
    value: obs.camera.view.replace("_", "-"),
    requirement: "Side-on, square to the pitch, at hip height",
    correction: "Place the phone square-on to the batter at hip height, about 6–8 m away.",
  });

  checks.push({
    id: "chk_calibration",
    label: "Pitch scale",
    status: obs.calibration.metresPerUnit ? "pass" : obs.athlete.heightCm ? "warn" : "warn",
    value: obs.calibration.metresPerUnit ? "Calibrated" : obs.athlete.heightCm ? "From your height (estimate)" : "Not set",
    requirement: "Stumps marked, or your height in your profile",
    correction: "Mark the stumps base and top in the setup step, or add your height to your profile.",
  });

  const scored = checks.filter((c) => c.status !== "not_applicable");
  const status = scored.some((c) => c.status === "fail") ? "fail" : scored.some((c) => c.status === "warn") ? "warn" : "pass";
  const passes = scored.filter((c) => c.status === "pass").length;
  const warns = scored.filter((c) => c.status === "warn").length;
  const confidence = status === "fail" ? 0 : clamp((passes + 0.5 * warns) / scored.length, 0, 1);

  return {
    status,
    confidence,
    checks: checks.map((c) => (c.status === "pass" || c.status === "not_applicable" ? { ...c, correction: undefined } : c)),
  };
}
