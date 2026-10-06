---
name: ffd-model
description: How Align judges a front-foot defence — the line (head, front shoulder, front knee over the front foot until contact), sync of foot/knee/shoulder, identification gates, ranges and their sources. Load before changing any analysis logic, threshold, range, metric, coaching text or drill in src/engine.
---

# The front-foot defence model

## What the shot is (the athlete's own definition)

Head, front shoulder, front knee and front foot (toe) **in one line, held until contact**. The
front shoulder leads into the line of the ball; the head goes over the ball. The stride changes
with the ball's length; **the stack over the front foot does not**. Front foot, front knee and
front shoulder **arrive together**.

## How it is measured (`src/engine/alignment.ts`)

- Offsets from the **front ankle** (most reliable foot landmark), × standing height, read in the
  picture: side-on along the pitch (`forward`, + toward the bowler); from either end sideways
  (`sideways`, + toward the off side). Off side = batting hand + camera end (right-hander from
  the bowler's end: picture left), cross-checked with the toes; if they disagree the head's side
  is shown, not graded.
- Zooming camera: offsets use each frame's own body size and only frames where the scale is
  steady; no timing at all.
- Bands (`LINE_BANDS`): sideways = 10th–90th percentile of 323 international defences (KU
  CricShot 3D). Forward = coaching geometry checked on side-on photos — the 3D estimates
  compress depth (stride reads ~0.33 × height vs ~0.68 on side-on footage), so never derive
  forward ranges from them.
- **Arrivals**: front foot = comes to rest (speed < 0.33 × height/s, ±30 ms average) and stays
  until 300 ms past contact; knee = hips stop lowering (knee takes the weight — the knee angle
  alone passes through its final value mid-stride); shoulder/head = reach the furthest point
  from the start and stay within 15% of it. Signals averaged over ±30 ms.
- **Contact**: seen (bat–ball, deflection, user mark: confidence ≥ 0.65) or else placed at the
  **set position** (last of foot/knee/shoulder arrivals). Gloved wrists are too unreliable to
  time contact (they read 200 ms early on a real clip). `set_late` is only graded against a seen
  contact.
- Metrics: `line_head`, `line_shoulder`, `line_knee`, `line_held`, `sync_spread`, `set_late`
  (domain `alignment`). Old `head_knee_offset` / `head_falling_away` are retired; stored reports
  still carry them.

## Identification gates (never relax without real-media evidence)

- Strict acceptance in `statusOf` (probability, margin, unknown, coverage, contact visibility).
- **Forward and down**: valid only if head drops ≥ 5% or hips ≥ 3% of height from the stance
  (`lowering`): a stance + backlift reads 3%/2%; back-foot shots ~0.
- **Zoom**: if the batter's size changes ≥ 1.8× in the clip, never name a different shot.
- Frame-rate floor 15 fps (identity held at 15 and 10 fps on real clips).
- Release gates: `tests/population.test.ts`, `tests/gates.test.ts` — zero false acceptances,
  zero real defences called another shot.

## Changing anything

1. Measure first on real tracks (`real-media-eval` skill) and on the population; write the
   evidence into the comment next to the number.
2. Thresholds/ranges in `registry.ts` (or `LINE_BANDS`): bump `ENGINE_VERSION`/`METRIC_VERSION`
   when meaning changes, publish the registry migration (`scripts/registry-sql.mjs`), apply it.
3. Coaching text and drill ladders in `coaching.ts` (axis-specific wording via `sideways`);
   every fault needs a 4-step ladder (shadow → tee/drop → throw-downs → machine/live) with
   measurable pass conditions.
4. Update `docs/context.md` and, if the model changes, this skill.

Honesty rules: a value that can't be measured is "not measured" with the reason, never zero or
guessed; estimates are labelled; every range names its source.
