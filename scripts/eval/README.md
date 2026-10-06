# Real-media evaluation

The athlete's rule: test on real videos and photos of different resolutions, frame rates and
camera positions before finalising logic and shipping. How to run it: the `real-media-eval`
skill (`.claude/skills/real-media-eval/SKILL.md`).

- `cases.example.json` — the 54-case manifest used for engine 0.6.0 (ids, file names, ground
  truth, notes). The media files themselves are third-party or personal and are never committed.
- `run.mjs` — runs each case through the app in headless Chromium and records the verdict,
  screenshots, the report PDF and the exported tracks.
- `tracks.probe.ts` — offline: re-analyses exported tracks with the current engine
  (`PROBE_DIR=… npx vitest run --config scripts/eval/vitest.config.ts`).
- `overlay.mjs` — draws the tracked skeleton on the real frames to check timing by eye.

Truth labels: `ffd` (a front-foot defence video), `other` (another shot), `none` (no stroke),
`ffd_pos` / `ffd_pos_front` (a defence position photo, side-on / from the bowler's end),
`other_pos` (another shot's photo).
