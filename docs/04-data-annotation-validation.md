# 04 · Data, annotation and validation plan

## Now: synthetic fixtures (engineering tests only)

Twelve fixtures from a pinhole-camera generator with inverse kinematics and ball physics: valid defence, pull, drive, occluded, photo, no ball, no bat, left-handed, low fps, capture failed, 3D session, baseline series. They test logic, not accuracy.

## Next: labelled real clips

| Item | Target |
|---|---|
| Players | 40+ across age bands, both hands, pace and spin |
| Clips | 600+ (≥ 200 defences, ≥ 200 drives/pulls/cuts, rest mixed) |
| Devices | iPhone and Android, 60–240 fps |
| Venues | indoor nets, outdoor nets, varied light |

### Labels per clip

Shot family (two coaches, adjudicated), delivery length, event frames (bounce, front-foot plant, contact), bat and ball keypoints on sampled frames, capture-quality flags.

### Agreement

Shot family: Cohen's κ ≥ 0.8 before a clip enters the evaluation set. Event frames: ≤ 2 frames at 120 fps between annotators.

## Validation (before any accuracy claim)

| Measure | Exit criterion |
|---|---|
| False acceptance of non-defences | ≤ 1% (95% CI upper bound ≤ 3%) |
| Correct acceptance of clean defences | ≥ 85% |
| Calibration | Expected calibration error ≤ 0.05 after fitting |
| Event timing | contact within ±1 frame for ≥ 90% |
| Metric agreement vs. lab reference | reported per metric with limits of agreement |

Ranges remain labelled "provisional" until refit on this cohort. Results are versioned and published on `/science`.

## Consent for research use

Research use is a separate opt-in consent (`model_training`). Clips are never used for training without it.
