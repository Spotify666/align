// Stage A — capture quality gate. Runs before any tracking-dependent analysis so an
// unusable clip never reaches the shot classifier.

import { clamp, mean } from "./math";
import { th } from "./registry";
import { J, type CaptureObservation, type CaptureQuality, type ImgPoint, type QualityCheck } from "./types";

const CORE_JOINTS = ["nose", "left_shoulder", "right_shoulder", "left_hip", "right_hip"] as const;

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

/**
 * Share of frames where the whole batter is in frame: head, shoulders and hips tracked,
 * and each foot (ankle, heel or toe) visible inside the image. Self-occlusion of a knee
 * or wrist behind the bat or the other leg is normal while batting and does not count
 * as "out of frame".
 */
export function bodyCoverage(obs: CaptureObservation): { coverage: number; meanConfidence: number } {
  const minConf = th("tracking.joint_min_conf");
  const footConf = minConf * 0.7;
  let full = 0;
  const confs: number[] = [];
  const ok = (p: ImgPoint, c: number) => !!p && p[2] >= c && p[1] <= 1.0 && p[1] >= -0.02 && p[0] >= -0.02 && p[0] <= 1.02;
  for (const frame of obs.body) {
    const core = CORE_JOINTS.every((j) => ok(frame[J[j]] ?? null, minConf));
    const feet = (["left", "right"] as const).every((side) =>
      (["ankle", "heel", "foot"] as const).some((part) => ok(frame[J[`${side}_${part}`]] ?? null, footConf)),
    );
    const present = KEY_JOINTS.map((j) => frame[J[j]]?.[2] ?? 0);
    const meanC = present.reduce((a, b) => a + b, 0) / present.length;
    if (core && feet && meanC >= 0.45) full++;
    for (const j of KEY_JOINTS) {
      const p = frame[J[j]];
      if (p) confs.push(p[2]);
    }
  }
  return { coverage: obs.body.length ? full / obs.body.length : 0, meanConfidence: confs.length ? mean(confs) : 0 };
}

const VIEW_TEXT: Record<CaptureObservation["camera"]["view"], string> = {
  side_on: "Side-on",
  front_on: "Front-on (bowler's end)",
  behind: "Behind the batter",
  oblique: "Diagonal",
  unknown: "Not set",
};

/**
 * The batter's standing height in pixels, from segment lengths that don't change with
 * posture (thigh, shin and trunk are 0.779 of standing height), so a crouched defence
 * isn't mistaken for a small batter. Median over the frames where they are all seen.
 */
export function batterPixels(obs: CaptureObservation): number | null {
  const W = obs.media.width;
  const H = obs.media.height;
  const minConf = th("tracking.joint_min_conf");
  const sizes: number[] = [];
  for (const frame of obs.body) {
    const L = (a: keyof typeof J, b: keyof typeof J) => {
      const p = frame[J[a]];
      const q = frame[J[b]];
      return p && q && p[2] >= minConf && q[2] >= minConf ? Math.hypot((p[0] - q[0]) * W, (p[1] - q[1]) * H) : NaN;
    };
    const legs = [L("left_hip", "left_knee") + L("left_knee", "left_ankle"), L("right_hip", "right_knee") + L("right_knee", "right_ankle")].filter(Number.isFinite);
    const trunks = [L("left_hip", "left_shoulder"), L("right_hip", "right_shoulder")].filter(Number.isFinite);
    // The longer leg: a leg pointing at the camera looks short.
    if (legs.length && trunks.length) sizes.push((Math.max(...legs) + mean(trunks)) / 0.779);
  }
  if (!sizes.length) return null;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)]!;
}

export function assessCapture(obs: CaptureObservation): CaptureQuality {
  const checks: QualityCheck[] = [];
  const isPhoto = obs.media.kind === "photo";
  const px = batterPixels(obs);

  checks.push({
    id: "chk_resolution",
    label: "Batter size",
    status: px === null ? "not_applicable" : px < th("capture.fail_batter_px") ? "fail" : px < th("capture.min_batter_px") ? "warn" : "pass",
    value: px === null ? `${obs.media.width}×${obs.media.height}` : `about ${Math.round(px)} px tall (${obs.media.width}×${obs.media.height} ${isPhoto ? "photo" : "video"})`,
    requirement: `Batter at least ${th("capture.min_batter_px")} px tall (under ${th("capture.fail_batter_px")} px the body can't be read)`,
    correction: isPhoto ? "Use a larger photo, or one taken closer, so the batter fills more of it." : "Record at 1080p, or move closer so the batter fills more of the frame.",
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
    const cut = !!obs.media.trimmed;
    checks.push({
      id: "chk_duration",
      label: cut ? "Batter in view" : "Clip length",
      status: obs.media.durationMs < th("capture.min_duration_ms") ? "fail" : "pass",
      value: cut ? `${(obs.media.durationMs / 1000).toFixed(1)} s, then the camera cuts or zooms away` : `${(obs.media.durationMs / 1000).toFixed(1)} s`,
      requirement: "Setup, delivery and follow-through all in the clip",
      correction: cut
        ? "Use footage where the camera stays on the batter from the stance until after the shot: a phone fixed on a tripod, not a TV clip that cuts away."
        : "Start recording before the bowler's run-up ends and stop after the follow-through.",
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

  const view = obs.camera.view;
  checks.push({
    id: "chk_camera_view",
    label: "Camera angle",
    status: view === "side_on" || view === "front_on" ? "pass" : "warn",
    value: VIEW_TEXT[view],
    requirement: "Side-on at hip height (best), or front-on from behind the bowler",
    correction:
      view === "behind"
        ? "From behind the batter the body hides the bat and ball at contact — film side-on, or from behind the bowler."
        : "Place the phone square-on to the batter at hip height, about 6–8 m away.",
  });

  checks.push({
    id: "chk_calibration",
    label: "Pitch scale",
    status: obs.calibration.metresPerUnit ? "pass" : obs.athlete.heightCm ? "warn" : "warn",
    value: obs.calibration.metresPerUnit ? "Calibrated" : obs.athlete.heightCm ? "From your height (estimate)" : "Not set",
    requirement: "Stumps marked, or your height in your profile",
    correction: "Add your height in your profile so distances are in metres (or mark the stumps on the report).",
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
