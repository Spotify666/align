# 02 · Shot ontology and front-foot defence decision policy

## Shot families

`front_foot_defence`, `front_foot_drive`, `back_foot_defence`, `pull`, `hook`, `cut`, `sweep`, `leave`, `unknown`.

Each family has a prototype: bands on features such as forward stride, back-foot travel, head and hand heights, bat angle at contact, bat speed, ball exit speed, contact height and delivery length. `unknown` absorbs clips that fit no prototype (log-likelihood below −5.5).

### Where the bands come from

Bands define **what the shot is**, not how well it was played, so they span the whole range of technique: a beginner's short, upright defence is still a defence. They are set from a generated **population** (`src/engine/fixtures/population.ts`), never from any one clip:

- Defences with randomised technique: stride 0.3–0.85 m, head well behind to well ahead of the front knee, trunk lean 6–36° forward and ±25° sideways, straight to deeply bent front knee, contact beside to ahead of the pad, and 0–0.2 m of hand lift after the bottom of the downswing (real defences settle the hands as the face is presented).
- The shots most often confused with a defence: front-foot drive (push to full drive), half-drive, pull, cut and back-foot defence.
- Every case varies camera position (side-on, bowler's end, behind), frame rate (30–240 fps), handedness, landmark noise and whether bat and ball are seen. In 40% of cases the bottom hand gets extra jitter (up to ~0.03 × height per frame), as measured on real phone footage where the bat hides it.

Real clips are a sanity check only: a real defence must never be called a different shot. Nothing is tuned to them. Where real footage showed the synthetic model was wrong (hand settling, bottom-hand jitter), the model was corrected and the bands re-derived from the population.

The hand signal that best separates a defence from a push or drive is **hands rise**: how far the hands lift after the lowest point of the downswing. A defence is a nearly dead bat (≈0–0.11 × height, including settling); a half-drive lifts ≈0.12–0.17, a drive ≈0.4–0.8. It is measured from the low point after the top of the backlift on the hand track smoothed over ±50 ms (a highest-minus-lowest reading otherwise magnifies landmark jitter), so an early or late contact estimate doesn't change it.

**Where the hands are**: both wrists hold one handle, so they move together, but the camera sees one less well (usually the bottom hand behind the bat). Each wrist is weighted by the inverse variance of its own frame-to-frame jitter, and when only one is seen the usual gap between them is added back.

## Scores

Temperature-softened prototype likelihoods (T = 1.4). They are **not calibrated probabilities**, and the UI says "uncalibrated".

## Acceptance (strict) — all must hold

| Rule | Threshold |
|---|---|
| Body, bat and ball all tracked | required |
| P(front-foot defence) | ≥ 0.80 |
| Margin over runner-up | ≥ 0.30 |
| P(unknown) | ≤ 0.10 |
| Evidence coverage | ≥ 0.75 |

### Coverage counts only what the camera position can see

Filmed along the pitch, back-foot travel, bat speed and ball speed can't be observed, by geometry rather than by tracking failure. Those features are left out of coverage, so the same coverage bar (≥ 0.75) holds for every view.

### Bat or ball not seen (the usual phone clip): confirmed from body movement

Most phone clips show the body well but not the bat or ball. The shot can still be confirmed, from body and hand movement, against a different bar:

| Rule | Threshold |
|---|---|
| P(front-foot defence), top class | ≥ 0.80 (the same bar as full evidence) |
| Margin over runner-up | ≥ 0.50 (full evidence: 0.30) |
| P(unknown) | ≤ 0.10 |
| Coverage of the body and hand signals this camera position can show | ≥ 0.85 |
| Head, hips, front knee and front ankle seen through ±150 ms of contact | ≥ 70% of frames |

Body and hand signals (computed whether or not the bat is tracked):

- **Ground line filmed along the pitch**: the batter's distance from the lens moves the feet up and down the image, and a practice montage's first frames are often the end of the previous ball, so the ground is the median of each frame's lowest foot over the whole clip (side-on: the lowest foot during setup).
- **Contact**: every stroke has a downswing, the hands' largest fall from the top of the backlift. The ball is met at its end: where the hands check (speed below 40% of the downswing peak, a defence) or the bottom of their arc (a stroke that swings through), whichever comes first. When the head clearly drops, the stroke's downswing is the one ending as the head arrives low (trigger movements and re-grips are falls of the hands too). Labelled "estimated from the hands' downswing". Hand speed is measured over ±20 ms, so it means the same at any frame rate.
- **Hands rise** after the downswing low point (see above). Any view.
- **Hand speed** where the hands reach furthest forward, and **hand travel after contact**. Side-on only.
- **Hands height after the stroke**: a defence finishes low; drives and pulls finish high.
- **Hands across the body**: horizontal-bat shots swing across. Bowler's end or behind only.
- **Head height at the stroke**: front-foot shots take the head low; back-foot shots stay tall. Any view.

Measures read from a lowest or highest point (hands rise, hands finish, hands across the body, head height) only use readings their neighbours back up: a lone reading between dropouts (a glove hidden by the bat for a few frames) is dropped rather than allowed to set the extreme. On a low-resolution copy of a broadcast defence, one such reading had made the hands appear to lift through the ball, and the defence was called a drive (engine 0.5.2). Filmed along the pitch, the back knee is often hidden behind the front leg right at contact, which would drop the one body cue that rules out a sweep (a sweeper's back knee is down). Back-knee height is therefore read at the nearest frame within 0.08 s of contact where it is seen (engine 0.5.2). Filmed along the pitch, stride comes from the monocular 3D estimate, which understates depth. That bias can only make a defence look less like a front-foot shot (toward "uncertain", never toward false acceptance), so stride counts with a wider tolerance (1.6×, a judgement, not fitted). Trunk rotation there rests on the estimated depth of the shoulders, whose error on real footage has no known direction, so it **never decides the shot** from those views; it is still reported.

The report says "Confirmed from body movement". Measures that need the bat or ball are not reported, and delivery context is shown as not seen.

### Contact must be seen

A shot is decided at contact. Neither acceptance nor rejection is given unless the stroke is seen through ±150 ms of contact in ≥ 70% of frames: by head, hips, front knee and front ankle when the shot is read from the body alone, otherwise by the body or the whole bat. The ball alone shows where contact was, not the stroke. Otherwise the result is "shot uncertain" (`contact_hidden` or `body_hidden`).

### Grading from the bowler's end or behind

Forward distances filmed along the pitch come from the 3D estimate, which on real footage is wrong in size and in direction: on a broadcast defence it read a clearly bent front knee as 179°, the head 12% of height behind the knee and a lean back, where the picture shows the opposite. Stride, head over knee, weight forward, trunk lean and knee angle are therefore **withheld** ("needs a side-on camera"), not shown (engine 0.5.2; before that they were shown ungraded). Head stillness and decision timing are shown, **not graded**. No priority or drill rests on any of them. Two sideways measures that this view sees directly are graded instead, against physical and anatomical limits rather than any clip's readings:

| Measure | Range | Basis | Coaching |
|---|---|---|---|
| Balanced over your feet: estimated centre of mass outside the sideways span of both feet (heels to toes) at contact | 0–0.02 × height | A body is statically stable only with its centre of mass over the base of support; tolerance is landmark error only. Centre of mass from segment mass fractions (Dempster/Winter). | Hold-the-finish defence, stride-to-the-line |
| Head toward the ball: head on the leg side of the front ankle at contact (off side read from where the toes point) | 0–0.04 × height | Up to half a head width, part of the head is still over the front foot. | Line-tape defence, eyes-level shadow |

A straight bat is the bat's own tilt from vertical, graded only when the bat is tracked. Hands move sideways toward the line of the ball even with a straight bat, so hand travel is not used for it.

### Moving camera

When the batter's apparent size changes by more than a fifth across the shot (a broadcast zoom), every frame is measured against that frame's own body size, feet and back ankle. Back-foot travel is then unobservable and left out. Camera cuts inside the analysed stretch are detected from jumps in the batter's position or size, and only the camera shot holding the stroke is analysed.

## Rejection — "different shot detected"

| Rule | Threshold |
|---|---|
| P(front-foot defence) | ≤ 0.12 |
| Combined P of named non-defence families | ≥ 0.75 |
| The leading alternative (one shot, or one family of related shots) | ≥ 0.50 |
| Evidence coverage | ≥ 0.45 |

The alternative is named (for example, "pull shot") only when its own P ≥ 0.55; otherwise the report says "a different shot". Probability spread over unrelated shots (a drive, a sweep and a back-foot defence at once) points at none of them, so it is "shot uncertain", not a rejection.

## Everything else: "shot uncertain"

The report lists the missing evidence and the recapture fix. It never forces a label. Read from the body alone, it says why the body didn't settle it: parts hidden (`body_hidden`) or the movement fits more than one shot (`body_inconclusive`). Filmed along the pitch without bat or ball, an upright defence (head above about 86% of standing height) is honestly uncertain against a back-foot defence.

## Asymmetry

False acceptance (scoring a pull as a defence) is release-blocking. False rejection costs a re-record. Thresholds are set accordingly.

## Release gates (CI)

- **Population gate** (`tests/population.test.ts`, 420 cases on a seed never used for development): side-on defences confirmed ≥ 95%; along the pitch ≥ 75% (measured 77–83% across seeds with realistic bottom-hand jitter); no defence ever called a different shot; **zero** drives, half-drives, pulls, cuts or back-foot defences confirmed.
- **Real net session** (`tests/real-deliveries.test.ts`, pose tracks only): fourteen deliveries of one batter filmed from the bowler's end on a phone, each analysed on its own. None may be called a different shot (8 of 14 confirmed at engine 0.4.1; the rest uncertain).
- 31 pull variants (seeds, frame rates, handedness, missing bat or ball, noise): none may be scored.
- The same gate for front-on and behind-the-batter pulls, including clips analysed with the **wrong** camera position.
- 40-seed stability ≥ 95% for pull → rejected, drive → rejected, valid → accepted, side-on and front-on, with and without bat and ball, at 120 and 30 fps.
- A front-on drive is never accepted, whichever camera position is chosen.
- Other kinds of video (`tests/e2e/make-variants.sh`, run by the regression guard): the real clips mirrored (a left-hander), at lower resolution, trimmed, and with a camera zoom added. The same logic must hold on all of them: none may be called a different shot; each verdict is recorded and any change fails the guard.
- Real clips (`tests/real-clips.test.ts`, pose tracks only): two public front-foot defences from the bowler's end are never called a different shot, and never graded on forward distances. A sanity check, not a target.
- Same input → same `result_hash`.

All thresholds live in `src/engine/registry.ts` with a unit and rationale, and are published to `registry_versions` by migration.
