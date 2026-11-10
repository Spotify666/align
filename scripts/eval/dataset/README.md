# The real-media dataset

Labelled real clips decide whether a detector change is better. Nothing else does: a detector
is not tuned on generated movement, and not on one clip.

**No video is ever committed.** Clips live in `eval-media/` (ignored by Git). What is committed is
`manifest.json`: for each clip an anonymised id made from the file's hash, the hash, and the
labels. Anyone holding the same files gets the same evaluation.

## What is needed before a detector decision

At least **10 clips from 3 athletes** (the gate refuses to decide on fewer). To be worth
trusting, aim for 20–30 clips covering: both defences and at least five other shots or
non-shots; right- and left-handers; side-on and bowler's-end; 30, 60 and 120+ fps; indoor and
outdoor; two or more phones; a few poor captures (blur, zoom, someone walking across) whose right
answer is an abstention.

## Steps

1. **Label.** Open `scripts/eval/label.html` in a browser (no server; the video stays on the
   machine). Choose the clip, set its frame rate, step to each moment and set it:
   `← →` one frame, `Shift` ten, `1–7` set Trigger / Top / Bounce / Plant / Back foot / Contact /
   Follow at this frame, `Shift+1–7` mark it "can't be seen". Fill in the athlete as `ath_01`
   (never a name), the device class, camera, light, hand, what was actually played, what it would
   be analysed as, the recording's quality and problems, and **every outcome that would be
   right**. Export.
2. **Register.** `node scripts/eval/dataset.mjs add <video> <clip_….labels.json>` copies the file
   to `eval-media/clips/<id>` and adds it to the manifest (version bumps).
3. **Check.** `node scripts/eval/dataset.mjs verify` — every file present, hashes unchanged.
4. **Track.** `node scripts/eval/dataset.mjs cases`, then with the app running:
   `CASES=eval-media/cases.json node scripts/eval/run.mjs http://localhost:3000 eval-media eval-media/tracks`
   (the real browser pipeline; this is also where phone step timings come from).
5. **Evaluate.**
   `NAME=before npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/real.probe.ts`
   writes `eval-media/reports/before.json`: per clip, per slice (athlete, device, view, fps,
   light, hand, capture, category) and leave one athlete out.
6. **Correct the engine's markers** instead of labelling from nothing: in `label.html`, "Open
   labels or an evaluation report" with that report loads the engine's markers as suggestions;
   each must be confirmed or moved before export. `dataset.mjs relabel <labels.json>` replaces
   a clip's labels and bumps its revision.
7. **Compare a candidate.** Add it to `src/engine/eval/detectors.ts`, run step 5 with
   `DETECTOR=<name> NAME=after`, then
   `node scripts/eval/compare-reports.mjs eval-media/reports/before.json eval-media/reports/after.json`.

## The gate (`compareReports`)

A candidate replaces the current detector only when all of these hold on the same dataset version:

| | Measured as |
|---|---|
| Timing improves on held-out athletes | Median absolute error per event, averaged over athletes each held out in turn: none worse, at least one better, Contact not worse for any athlete |
| No verdict regression | No clip that was right becomes wrong; no new false accept |
| Uncertainty stays calibrated | With the uncertainty scale fitted on the other athletes, at least 80% of the held-out athlete's events fall inside their stated band (aim 90%), and no lower than before |
| Time stays acceptable | Engine + contract per clip no more than 1.25× before; phone step times from the browser run |
| Phases stay sane | No more unexplained Contact/Follow collapses or order violations than before |
| No synthetic ratchet growth | `npx vitest run tests/metamorphic.test.ts` |

Also reported, not gated yet: how often the verdict survives Contact moving to either end of its
own stated uncertainty (`verdictHolds`). On the three exported real tracks in the repo it does
not always (docs/12).

## Label meanings

- Times are **media time of the source file in ms**, never analysed-frame numbers.
- `visible: false` means a person can't see that moment in the clip. The engine is then wrong to
  report it as seen directly, and right to report it as estimated or not found.
- `expected` lists every acceptable outcome. A clip of another shot can never expect `accepted`.
- Slow motion saved at 30 fps playback: set "media ms per real ms" (8 for 240 fps).
