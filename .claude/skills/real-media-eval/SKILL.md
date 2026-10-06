---
name: real-media-eval
description: Run Align's real-media evaluation matrix (10+ videos and photos at different resolutions, frame rates and camera positions) through the real browser pipeline, compare with the previous build, and inspect failures with skeleton overlays. Use before shipping any change to capture, identification or analysis, and whenever the athlete reports a wrong result.
---

# Real-media evaluation

The athlete's rule: **test on at least 10 different videos and photos, different resolutions,
before finalising logic and pushing to production.** Synthetic tests are necessary, not enough.

## Media (never committed)

Kept outside the repo (scratchpad or `/home/user/ext`). Sources used so far — see
`scripts/eval/cases.example.json` for ids, truths and notes:
- phone clips of a junior batter from the bowler's end (480p, 240p, mirrored, 15 fps re-encode);
- broadcast defences (Dravid 720p/360p; `vipulpandey21/CricketShotQualityAI` `data/*` 720p 25 fps:
  defence, cover, pull, straight, sweep, …) — clone with `GIT_LFS_SKIP_SMUDGE=1`, sparse checkout;
- CricShot10 (320×240, 12 fps: expected to be declined);
- photos: side-on club batter at 720/360/180/120 px, front-on and angled professional photos,
  two-batter composite, broadcast frames.
- 3D reference poses: `Sourav-017/Cricket-Shot-Analysis-Framework` `KU_Cric_Shot_3d` (defence,
  drive, pull, flick; METRAbs smpl+head_30, camera mm). Sideways values are reliable; forward
  (depth) values are compressed.

Headless Chromium can't decode H.264: transcode to VP9 in MP4
(`ffmpeg -i in.mp4 -c:v libvpx-vp9 -b:v 1500k -deadline realtime -cpu-used 8 -an out.mp4`).

## Run

```bash
npm run build && npx next start -p 3123 &                 # the build under test
CHROMIUM_PATH=/opt/pw-browsers/chromium CASES=<cases.json> \
  node scripts/eval/run.mjs http://localhost:3123 <mediaDir> <outDir> [id,id]
```
Each case runs `tests/e2e/capture-flow.mjs` (CPU pose delegate, answers "which one is the
batter?" with the suggestion) and writes `<id>.log`, screenshots, the report PDF and
`<id>.tracks.b64` (the observation, for offline engine work). `results.json` has every verdict.

Offline, on the exported tracks (no browser): `PROBE_DIR=<outDir> npx vitest run --config
scripts/eval/vitest.config.ts` prints status, metrics, the line and arrivals per case.

Did a change move any result? Run the matrix before and after (keep a frozen copy of the
"before" build on another port; never restart its server while a run uses it), then
`BEFORE=<dir> AFTER=<dir> npx vitest run --config scripts/eval/vitest.config.ts compare
--disableConsoleIntercept`: tracked frames compared value by value, then verdict and every
measure. `diff.probe.ts` (A=, B= files) shows which frames and joints differ.

Speed: every step logs `[align:time] <step> <ms>`; `THROTTLE=4` slows the page's CPU about
like a phone (it does not slow workers, so judge worker gains unthrottled); `PROFILE=<file>`
records a CPU profile; `NO_WORKERS=1` runs everything on the page (must equal the worker run
exactly).

Overlay the tracked skeleton on the real frames to check timing by eye:
`node scripts/eval/overlay.mjs <video> <obs.json> <out.png> 40,43,46,49 480` (obs.json from the
probe's dump; frame time = `media.sourceStartMs + t[i]`).

## Pass bar

- No non-defence accepted as a defence; no real defence called a different shot.
- Every real defence that is clearly visible (whole batter, ≥ 15 fps) is valid, with the line
  read at the right moment (check with overlays: contact within ~2 frames).
- Declines say why in plain words (frame rate, batter too small, camera cuts away, no stroke).
- Photos: never stuck; front-on photos graded on the line; low-res batter found once.
- Compare results with the previous build case by case and report changes honestly.
