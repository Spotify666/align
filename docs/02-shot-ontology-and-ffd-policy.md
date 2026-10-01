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
- Same input → same `result_hash`.

All thresholds live in `src/engine/registry.ts` with a unit and rationale, and are published to `registry_versions` by migration.
