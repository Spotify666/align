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

- **Contact, Top, Plant and Follow are placed as before** (Trigger and Back foot were made
  steady in 0.9.0, below). Contact decides the verdict; changing it needs labelled real clips.
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

## Phase 2 groundwork (2026-11-10): what was measured before touching a detector

**No detector was changed.** No labelled real clips existed in the session, and a detector is not
to be tuned on generated movement.

### Which results depend on which event (`scripts/eval/sensitivity.probe.ts`)

Each event moved by ±25 and ±100 ms, the whole analysis run again (fixtures, both defences, the
three real tracks in `tests/assets/real`):

| Event moved | Measures that change | Classifier features | Verdict |
|---|---|---|---|
| Trigger | none | none | never |
| Plant | none (the line's own arrival detection in `alignment.ts` is what measures use) | none | never |
| Follow | none | none | never |
| Back foot | none | none | never |
| Top | none | `hands_rise` | reason changed on one real track at 100 ms |
| Bounce | `decision_timing` | `length_short` | never |
| **Contact** | **all 31 that are measured at or around contact**, front- and back-foot | 15 of them | **yes, already at 25 ms** |

So Trigger, Plant, Follow and Back foot are display markers; **Contact is the keystone.** On the
real track `sq` (body only, Contact estimated, ±100 ms stated) moving Contact 25 ms later turns
"can't confirm" into an accepted defence. That is the cross-video inconsistency in one line:
where the body-only Contact lands decides the verdict, inside its own uncertainty. Hardening
starts there, not with Trigger.

### Why 12 of 14 supported synthetic shots are accepted

Both misses are back-foot defences that abstain; neither is graded wrongly.

1. *Side-on, body only* → "not a dead bat". Without bat and ball, Contact is placed at the set
   position, 100 ms before the true contact (808 vs 908 ms). The dead-bat check then reads the
   hands still travelling to the ball as a follow-through. The same clip with bat and ball is
   accepted, and moving its Contact 100 ms earlier reproduces the same abstention.
2. *Bowler's end, bat and ball* → "stride". From that view the feet's separation along the pitch
   comes from the monocular 3D estimate and is held to a tighter limit (0.15 × height against
   0.25 side-on); it read 0.183, and "went back" 0.044 against 0.08. In the generated population
   **no** back-foot defence from the bowler's end or behind is accepted (0 of 36), so this is
   either the generator's depth noise or a real gap from that view. Only real clips can say which.

### Cost of the result contract (`scripts/eval/perf.probe.ts`, `[align:time] result contract`)

It reads stored tracks. **Pose, bat and ball inference are not repeated**; only the scene and the
event stage are, on two half-rate copies.

| Clip | analyze | contract | of which half-rate re-detection |
|---|---|---|---|
| 240 frames, 120 fps | 32 ms | 5 ms | 1.7 ms |
| 480 frames, 240 fps | 64 ms | 13 ms | 4 ms |
| real, 101 frames, 30 fps | 12 ms | 3 ms | 0.8 ms |
| real, 1331 frames (44 s) | 137 ms | 50 ms | 19 ms |

In Chromium at phone width it is 5–25 ms unthrottled, 20–70 ms at 4× CPU slowdown and up to
~90 ms at 6× (development build), once per report opened.

### Saved sessions, PDFs, progress, sample reports

The stored payload is byte-identical (156 cases), so PDFs, progress and the sessions list, which
read only the payload, are unaffected. The contract is built when a report opens, so old saved
sessions get it too; it tolerates payloads that lack fields added since (`requested_shot`,
`camera_view`, …) and an observation it can't re-read (tested), falling back to the payload.
Not exercised: opening a session actually saved by an older production build in a browser.

### The real-media evaluation path

`scripts/eval/dataset/README.md`: manifest and schema (`src/engine/eval/dataset.ts`), the
labelling page (`scripts/eval/label.html`), the dataset CLI (`dataset.mjs`), the runner
(`real.probe.ts`), leave-one-athlete-out and the before/after gate (`src/engine/eval/real.ts`,
`compare-reports.mjs`), and the seam a candidate detector plugs into (`AnalyzeOptions.eventDetector`,
`src/engine/eval/detectors.ts`).

## Engine 0.9.0 (2026-11-10): steady Trigger and Back-foot markers, every event limit registered

Asked for without labelled real clips, so the evidence is generated movement plus the three real
tracks in the repo. Stated as that, not as validation.

**Changed**

- Trigger and the back foot's first movement are placed where the foot *keeps moving* for 80 ms
  (`events.foot.sustain_s`), not at the first single frame that reads fast (`steadyFootMarkers`,
  `detectEvents` in `events.ts`). Only the time of a marker that was already found changes.
- All eleven limits that were inline in `events.ts` are in the registry with their reasons
  (`events.foot.*`, `events.contact.*`, `events.bat.*`), values unchanged.

**Evidence** (`scripts/eval/foot-markers.probe.ts`; truth = the same movement generated without
tracker noise at 240 fps)

| | Old rule | Steady rule |
|---|---|---|
| Trigger error, median / 90th percentile | 55 / 409 ms | 38 / 67 ms |
| Back foot error, median / 90th percentile | 55 / 288 ms | 25 / 50 ms |
| Trigger moves at half the frame rate, 90th percentile | 384 ms | 175 ms |
| Back foot moves at half the frame rate, 90th percentile | 317 ms | 41 ms |
| Real tracks (3, no truth): Trigger | 40, 133, 133 ms | 0, 133, 133 ms |

- **Nothing a batter is told changes**: verdict, reason, headline, every measure, classifier
  feature, plan and every other event are identical with the old and the new markers on all
  fixtures, 80 population cases, the 70 evaluation cases and the three real tracks asked as both
  defences (`tests/foot-markers.test.ts`). Verdicts and reasons are identical to the original
  snapshot on all 156 golden cases.
- **Ratchet**: known breaks 26 → 21; "clip starts later" 67 → 69 of 70, variable frame rate 34 →
  37 of 50. None new.

**Tried and not adopted**

- *Plant* by the same rule, with the stance taken from a still interval instead of the first 15%
  of the clip: no better on generated movement (median 21 → 25 ms) and it moved by 1.3 s on a
  real track read at 15 fps where the old rule did not move. Plant keeps the old rule.

- *Withholding a grade when the answer isn't steady* (body only, Contact estimated, the grade
  different with Contact at either end of its stated timing). It can only withhold, never grant,
  and the two real accepted defences in the repo held. But on the project's own gates it cut
  "confirms defences from body and hands" from at least 95% to 0% (`tests/gates.test.ts`) and 50%
  (`tests/population.test.ts`): most phone clips would read "can't confirm". Reverted. Either the
  stated ±0.1 s for an estimated Contact is too wide or body-only grades really are that
  fragile; only labelled clips can say which.

**Added instead (display only)**

- "Answer steady: yes / borderline" in "How sure each part is" (`src/engine/sensitivity.ts`),
  shown only where Contact is estimated, worked out after the report has drawn. It changes no
  result. On the real tracks: the two accepted defences steady, the unstable clip borderline.
- No milliseconds in the timeline's notes or labels (standing rule 8): seconds.

**Not changed, and why**

- *Contact*. It decides the verdict, so any change to it is a change to acceptance (see the
  reverted attempt above). Without labelled real clips there is no way to tell a better Contact
  from a different one.
- *Bat and ball found automatically*: needs a detection model and labelled frames.
- *Slow motion*: telling a 240 fps file played at 30 from a slow shadow drill needs real examples
  of both; a guess would refuse real drills.
- *More shots*, *calibration*, *ranges fitted to players*: all need real data.
- *Back-foot defence from the bowler's end in the generated set*: not an engine gap. Its limit
  (0.15 × height) was set on real footage, where the pose estimate reads the feet's gap shorter
  (median 0.09); the generator doesn't model that. The case is now marked "unmodelled"
  (`eval/suite.ts`); supported shots accepted: 12 of 13.

## Next

1. Label 20–30 real clips from at least 3 athletes (`scripts/eval/dataset/README.md`). Nothing
   below can be decided without them.
2. A candidate detector behind `eventDetector`, Contact first (the body-only set position), then
   the foot markers: windows in ms, sustained movement instead of one frame, a stance baseline
   from a detected still interval, every limit in the registry, Contact and Follow never on one
   frame without a reason. Accepted only by the gate; acceptance thresholds untouched.
3. Move normalisation to ingestion (even grid, slow-motion detection, media-time mapping), then
   the report's sections onto the contract.
