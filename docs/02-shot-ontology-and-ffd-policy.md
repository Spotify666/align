# 02 · Shot ontology and front-foot defence decision policy

## Shot families

`front_foot_defence`, `front_foot_drive`, `back_foot_defence`, `pull`, `hook`, `cut`, `sweep`, `leave`, `unknown`.

Each family has a prototype: bands on features such as forward stride, back-foot travel, bat angle at contact, bat speed, ball exit speed, contact height and delivery length. `unknown` absorbs clips that fit no prototype (log-likelihood below −5.5).

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

### Filmed along the pitch (front-on or behind the batter)

Back-foot travel, bat speed and ball speed can't be observed from these views, by geometry rather than by tracking failure. Those features are left out, never estimated, and acceptance instead requires coverage ≥ **0.72**. That is nearly every remaining signal (the maximum possible is 0.748). The other acceptance rules are unchanged.

### Bat or ball not seen (the usual phone clip): confirmed from body movement

Most phone clips show the body well but not the bat or ball. The shot can still be confirmed, from body and hand movement, against a different bar:

| Rule | Threshold |
|---|---|
| P(front-foot defence), top class | ≥ 0.65 |
| Margin over runner-up | ≥ 0.50 (full evidence: 0.30) |
| P(unknown) | ≤ 0.10 |
| Coverage of the body and hand signals this camera position can show | ≥ 0.85 |
| Head, hips, front knee and front ankle seen through ±150 ms of contact | ≥ 70% of frames |

Signals used in place of the bat (computed only when the bat isn't tracked):

- **Contact**: where hand speed first drops below 40% of its downswing peak, around the lowest head position. Labelled "estimated from the head and hands".
- **Hand speed** where the hands reach furthest forward: a defence checks the hands; drives swing through. Side-on only.
- **Hand travel after the push**. Side-on only.
- **Hands height after the push**: a defence finishes low; drives and pulls finish high.
- **Hands across the body**: horizontal-bat shots swing across. Bowler's end or behind only.
- **Head height at the stroke**: front-foot shots take the head low; back-foot shots stay tall. Any view.

Filmed along the pitch, stride and trunk rotation come from the monocular 3D estimate, which understates depth, so their tolerance is widened 1.6×. The report says "Confirmed from body movement". Measures that need the bat or ball are not reported, and delivery context is shown as not seen.

### Grading from the bowler's end or behind

Forward distances filmed along the pitch come from the 3D estimate. Stride, head over knee, weight forward, trunk lean, knee angle, head stillness and decision timing are therefore shown as estimates and **not graded**: no priority or drill rests on them. Two sideways measures that this view sees well are graded instead (provisional ranges):

| Measure | Range | Coaching |
|---|---|---|
| Head in line over front foot (sideways offset at contact) | 0–0.22 × height | Line-tape defence, eyes-level shadow |
| Bat comes down straight (sideways hand travel in the downswing) | 0–0.20 × height | Stump-gate defence, top-hand-only defence |

### Moving camera

When the batter's apparent size changes by more than a fifth across the shot (a broadcast zoom), every frame is measured against that frame's own body size, feet and back ankle. Back-foot travel is then unobservable and left out. Camera cuts inside the analysed stretch are detected from jumps in the batter's position or size, and only the camera shot holding the stroke is analysed.

## Rejection — "different shot detected"

| Rule | Threshold |
|---|---|
| P(front-foot defence) | ≤ 0.12 |
| Combined P of named non-defence families | ≥ 0.75 |
| Evidence coverage | ≥ 0.45 |

The alternative is named (for example, "pull shot") only when its own P ≥ 0.55; otherwise the report says "a different shot".

## Everything else: "shot uncertain"

The report lists the missing evidence (for example, "ball not visible") and the recapture fix. It never forces a label.

## Asymmetry

False acceptance (scoring a pull as a defence) is release-blocking. False rejection costs a re-record. Thresholds are set accordingly.

## Release gates (CI)

- 31 pull variants (seeds, frame rates, handedness, missing bat or ball, noise): none may be scored.
- The same gate for front-on and behind-the-batter pulls, including clips analysed with the **wrong** camera position.
- 40-seed stability ≥ 95% for pull → rejected, drive → rejected, valid → accepted, side-on and front-on.
- A front-on drive is never accepted, whichever camera position is chosen.
- Without bat or ball: no pull, drive or ambiguous half-drive is accepted across seeds, frame rates, handedness, noise and wrong camera labels. Defences are confirmed ≥ 95% side-on and front-on, at 120 and 30 fps.
- Real clips: two public front-foot defences from the bowler's end (broadcast and phone) are confirmed from body movement (`tests/real-clips.test.ts`, pose tracks only).
- Same input → same `result_hash`.

All thresholds live in `src/engine/registry.ts` with a unit and rationale, and are published to `registry_versions` by migration.
