# 00 · Current-state audit

Status as of 2026-10-01. Align is a new product: it does not reuse CricShot code, data or infrastructure.

## What exists

| Area | State | Evidence |
|---|---|---|
| Analysis engine | Deterministic, versioned, validity-first pipeline for the front-foot defence (FFD) | `src/engine/*`, 92 unit tests |
| Capture | Fully automatic after upload: any-length clips scanned for shots, camera cuts skipped, batter found (bat-holder cues), camera position guessed, quality gate with automatic retry, crop that follows the batter; "Change" links for corrections; photos (1–12); optional bat/ball marking from the report | `src/lib/capture/*`, `tests/e2e/capture-flow.mjs` |
| Report | Verdict-first report, evidence viewer (video, tracked, 3D, compare), metrics with ranges, drills, PDF | `src/components/report/*`, `src/lib/pdf.ts` |
| Storage | IndexedDB on device; optional Supabase save with RLS, private buckets, retention purge | `src/lib/store.ts`, `supabase/` |
| LLM | Optional rewrite of the template report through a strict contract; template is the default | `src/engine/llm/*`, `src/app/api/report` |
| Hosting | Vercel project `align`, production `align-lab.vercel.app` from `main` | Vercel dashboard |

## Gaps that matter

1. **No real-athlete validation yet.** Thresholds and coaching ranges are provisional. No accuracy figure is published.
2. **Bat and ball are not detected automatically.** The on-device detector sees bats only weakly (used as a hint for who is batting) and balls rarely. Without marks a video gives "shot uncertain" with ungraded body observations; marking from the report unlocks the full verdict. A trained bat/ball detector is the next capture milestone.
3. **Classifier is uncalibrated.** It is a transparent prototype-band model. Calibration needs labelled clips.
4. **3D Session tier** (two calibrated phones) is a preview. Depth-dependent measures show "not measured" on one phone.
6. **Front-on accuracy** rests on MediaPipe's monocular depth estimate. It is validated on synthetic data only; real-clip validation is part of Phase 2.
7. **Video decoding** relies on the browser. HEVC, AV1, AVI and MKV files a browser can't play get specific fixes, not in-app conversion.
5. **Email sign-in uses Supabase's default SMTP**, which is rate limited. A custom SMTP is needed before a public launch.

## Known risks

- Side-on single camera cannot see movement toward or away from the lens. Affected measures are labelled "estimate".
- Low frame rates (< 60 fps) blur timing. Speed measures are dropped, not guessed.
- The `redeem_coach_invite` RPC is `SECURITY DEFINER` by design. It only links the caller to a coach for a valid unexpired code.
