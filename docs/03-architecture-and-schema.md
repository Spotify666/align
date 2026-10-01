# 03 · Architecture and typed schema

## Overview

```
Phone browser
  ├─ Read: MP4/MOV fps + codec parse; clear fixes for HEVC/AV1/AVI/MKV a browser can't decode
  ├─ Scan: whole clip (≤ 5 min) → person boxes (EfficientDet-Lite0), motion, camera cuts
  │     → candidate shot windows, each verified by pose (head to feet in view)
  ├─ Batter: candidates verified by pose; athlete taps the batter when several remain
  ├─ Camera: side-on / bowler's end / behind, suggested from 3D pose, athlete confirms
  ├─ Gate: quality checks on the chosen window (engine.assessCapture)
  ├─ Tracking: MediaPipe Pose on an upscaled crop around the batter → 2D body + 3D estimate
  ├─ Marks: athlete marks stumps, bounce, contact, bat (each skippable)
  ├─ Photos: 1–12 stills, EXIF-aware decode, letterboxed, batter found, pose → posture screen
  ├─ Engine (pure TS, deterministic): scene → events → delivery → features → classify
  │     → status policy → metrics → domains → priorities → plan → template report
  ├─ Storage: IndexedDB (analyses, align-tracks-v1 binary tracks, WebP keyframes)
  └─ Optional: Supabase save (RLS) · /api/report (Claude rewrite under contract)
```

Next.js 16 (App Router) on Vercel. All analysis runs on the device; the server only handles sign-in, optional cloud save and the optional LLM rewrite.

## Engine contract

- Input: `CaptureObservation` (media, tier, athlete, camera side, calibration, quality, timestamps, body, bat, ball, marks).
- Output: `AnalysisPayload` with `analysis_status`, `observed_shot`, `shot_probabilities`, `events`, `features`, `metrics`, `domains`, `technique_index`, `plan`, `limitations`, `evidence_frames`, `versions`, `input_hash`, `result_hash`.
- Deterministic: canonical JSON + SHA-256, seeded PRNG. `result_hash` excludes id and timestamp.
- Batter-centric frame: forward = toward the bowler; left-handers are mirrored semantically, not visually.
- Side-on: forward is the image x-axis. Front-on or behind: forward comes from the monocular 3D estimate (`poseWorld`, MediaPipe world landmarks), relative to the back ankle in the same frame. Bat and ball stay in image-plane coordinates and are never compared with body forward positions. Side-view-only metrics are marked `side_view` in the registry.
- Photo sets: each photo is analysed on its own (posture metrics only). The payload carries `photo_set`, and its headline measures come from the photo tagged "contact".
- Uncertain shots carry ungraded `observations` (no ranges, no score). A different shot carries none.
- Scale: stumps (0.711 m) → athlete height → stature units.

## Storage format

`align-tracks-v1`: int16 positions, uint8 confidences, gzip via `CompressionStream`. About 19.5 KB per 2 s at 120 fps, against 219 KB as JSON. Analysis always runs on the quantised observation, so saved and live results match.

## Database (Supabase, Mumbai)

| Table | Purpose |
|---|---|
| `profiles` | handedness, height, retention setting |
| `consents` | append-only consent events with policy version |
| `coach_invites`, `coach_links` | invite codes; links active only with `coach_sharing` consent |
| `analyses` | one row per analysis (status, observed shot, hashes) |
| `analysis_payloads` | immutable payload (LZ4-compressed jsonb) |
| `observations` | pointer to the binary track object |
| `metric_values` | narrow table for trend queries |
| `reports`, `baselines`, `annotations` | report text, personal baseline, coach notes |
| `media_objects` | raw video with `expires_at` |
| `audit_log`, `registry_versions` | audit trail; public, migration-only registry snapshots |

RLS: `private.can_view(owner)` = owner, or a coach with an active link and current consent. Buckets `tracks` (2 MB), `evidence` (512 KB), `raw-video` (25 MB) are private and keyed by `<owner uuid>/`.

Edge functions: `retention-purge` (daily via pg_cron + pg_net, secret in Vault) and `account-delete`.
