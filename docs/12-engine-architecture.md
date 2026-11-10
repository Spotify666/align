# 12 · Engine architecture: category specs, the result contract, and the regression gate

Written 2026-11-10. Says what is built, what was measured, and what is only proposed.

## Why

The same engine gave different answers on different uploads, and fixes made for one clip did not
carry to the next. Looking for the cause in the code and measuring it on generated movement:

1. **No clip-specific code was found.** No file names, fixture ids, athlete conditions or
   coordinate patches in `src/engine` or `src/lib/capture`. Time is measured in seconds and
   distances in body heights almost everywhere. Mirroring, resizing and moving every timestamp
   change nothing at all (70 of 70 synthetic cases each).
2. **What does move is the event markers and the reason given for not confirming a shot**, when
   the same movement is read at another frame rate or from a later start:
   - `events.ts` places Trigger and the back foot's first movement at the *first single frame*
     whose foot speed crosses a limit. Speed from one frame to the next amplifies tracking noise,
     so one noisy frame fires it: Trigger moved by up to ~400 ms between 120 and 60 fps of one
     movement while claiming 75% confidence.
   - The detectors hold inline limits that are not in the registry (`0.35 × stature/s`,
     `0.08`, `0.12`, `0.06 × stature`) and a stance baseline of "the first 15% of the clip's
     frames", which depends on where the clip happens to start.
   - Contact and Follow fall on the same frame (even on the reference fixture) with no reason
     given.
   - The engine takes time as `frame ÷ fps`. Nothing checked that the frame times agree.
3. **There was nothing to stop a one-clip fix.** Tests checked fixtures one at a time; none asked
   whether two recordings of one movement get one answer.

Accept / don't-accept never flipped in any comparison. The instability is in markers, in
speed-type measures and in which abstention reason is given.

## What is built

```
observation ─► timebase check ─► capture gate ─► scene ─► events ─► identity ─► grading
                (timebase.ts)                                (CategorySpec decides wording,
                                                              phases, abstention outcome)
payload (align.analysis/1, unchanged) ─► buildResult() ─► AnalysisResult (aline.result/1) ─► report
```

| Piece | Where | State |
|---|---|---|
| Category specs (id, version, views, signals, phases, order, metrics with prerequisites, acceptance thresholds by name, abstention table, limitations) | `src/engine/category.ts` | Built for both defences. `analyze.ts` reads abstention wording and recapture advice from them. |
| Timebase check and resampler | `src/engine/timebase.ts` | Check is reported in every result. The resampler is tested but **not** applied in the capture path (see limits). |
| Result contract: open-set outcome, alternatives, events with state / confidence / uncertainty / sources, phase order, measures tied to events and frames, withheld claims, confidence per layer, versions, hash | `src/engine/result.ts` | Built. A projection of the stored payload plus the observation: old saved reports get it too. |
| Evidence timeline and "How sure each part is" | `src/components/report/phase-timeline.tsx`, `result-panel.tsx` | Built, reading the contract only. |
| Transforms, relations, the labelled synthetic set | `src/engine/eval/*` | Built. |
| Regression gate and slice report | `tests/metamorphic.test.ts`, `tests/baselines/metamorphic.json`, `scripts/eval/metamorphic.probe.ts`, `golden.probe.ts` | Built. |

The stored payload and its `result_hash` are byte-identical to before on all 156 fixture and
population cases (`scripts/eval/golden.probe.ts`, run before and after).

### Open-set outcomes

`accepted` · `recognised_other_supported` · `recognised_unsupported` · `unknown_action` ·
`ambiguous` · `insufficient_evidence` · `capture_failed`. Each abstention reason maps to one of
them in the category's own table. Grading happens only on `accepted` (tested). The shot the
batter chose is recorded as `intended`; it is never the classifier's answer.

### Events

Every phase of the category is reported, found or not: `detected`, `inferred`, `corrected`
(placed by hand) or `missing` with the reason. Uncertainty (± frames, and ms) is the larger of:

- half a frame + (1 − confidence) × the stretch the detector reads + half the frames around the
  moment in which the body parts it rests on were hidden; and
- **stability**: how far the marker moves when the same clip is read again at half its frame
  rate (even frames, then odd frames). Measured on the clip, not assumed. A marker that moves
  further than its own detector's window is shown as estimated, with the distance.

The first part is a stated heuristic (`event-uncertainty-0.2.0`). **It has not been checked
against hand-labelled frames.**

## Evaluation (synthetic movement only)

70 generated cases: 5 shot families × asked as each defence × 30/60/120/240 fps × both hands ×
side-on and bowler's end × with and without bat and ball (one condition changed at a time).

| Relation | Holds |
|---|---|
| Mirrored (other hand) | 70/70 |
| Half / double resolution | 70/70, 70/70 |
| All timestamps moved | 70/70 |
| Clip starts 50 ms later | 67/70 |
| Half the frame rate (≥ 60 fps left) | 43/50 |
| Variable frame rate, put on an even grid | 34/50 |
| Graded ↔ not graded flips, any relation | 0 |
| Another shot accepted as the requested one | 0 |
| Supported shot accepted | 12/14 (2 abstentions) |
| Bat/ball measures reported without bat/ball | 0 |

Before the stability term, "clip starts later" held 60/70, half rate 17/50, variable rate 12/50:
the gain is the uncertainty becoming honest, **not** the detectors becoming steadier.

**This shows consistency on generated movement. It is not evidence of accuracy on real
athletes.** Real clips are still evaluated outside the repo (`scripts/eval/run.mjs`, `pairs.mjs`)
and were not available in the session that wrote this.

### The rule for any threshold or detector change

1. Run `npx vitest run tests/metamorphic.test.ts`. A relation that held and now breaks fails
   the build. The list of known breaks may shrink, never grow.
2. Run the slice report before and after and put both tables in the change:
   `METAMORPHIC_OUT=out.txt npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/metamorphic.probe.ts`
3. Then the real-media matrix (`real-media-eval` skill). A change justified by one clip is not
   accepted.

## Limits, and why they remain

- **Detectors unchanged.** Trigger, back-foot commit and the plant's search start still fire on
  one frame; their inline limits are still outside the registry. Changing them changes results
  on real clips, which could not be checked here, and the FFD build is locked.
- **The resampler is not in the capture path.** Capture already samples on an even grid, and
  event frames are tied to media times and hand marks there; resampling at ingestion needs those
  moved together and tested in the browser on real variable-rate clips.
- **Slow-motion files** (240 fps saved as 30 fps playback) are not detected: their seconds are
  stretched.
- **Camera view and handedness confidence** are not in the contract: neither is produced as a
  number today.
- **Report sections** (Summary / Evidence / Training / Progress / Technical) and the progress
  charts were not reorganised.
- **The classifier is uncalibrated** and says so everywhere it is shown.

## Next

1. Make the foot-movement detectors steady: sustained movement over a fixed time window instead
   of one frame, a stance baseline in seconds, every limit in the registry. Gate: the ratchet
   shrinks, and the real-media matrix does not regress.
2. Label event frames by hand on the athlete's real clips (20–30 clips) and fit the uncertainty
   model to them; report coverage (how often the true frame is inside the stated band).
3. Move normalisation to ingestion (even grid, slow-motion detection, media-time mapping), then
   the report's sections onto the contract.
