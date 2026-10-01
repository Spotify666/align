# 01 · Product requirements

## Problem

Players and coaches get confident scores from tools that grade whatever is uploaded. A pull shot scored as a defence teaches the wrong lesson. Align confirms the shot first and only then measures technique.

## Users

- **Player** (12+, club to academy): records at the nets on one phone and wants one thing to train next.
- **Coach**: reviews several players with consistent evidence and adds notes without overwriting the model.
- **Parent**: reads a plain-language summary.

## Scope (v0.1)

One shot: the **front-foot defence**. Other shots are recognised and refused a defence score until they pass the same validation bar.

## Decision order (non-negotiable)

1. Is the capture usable? Otherwise: **capture failed**, with concrete fixes.
2. Are the body, bat, ball and pitch tracked?
3. What delivery was it (length, bounce)?
4. Which shot family was played?
5. Is it compatible with the requested analysis?
6. Only then: technique measures, priorities and drills.

## Outcomes a report can have

| Status | Meaning | Score shown |
|---|---|---|
| Valid front-foot defence | Shot confirmed with body, bat and ball | Yes (secondary index) |
| Different shot detected | Confidently not a defence; alternative named with evidence | No |
| Shot uncertain | Not enough evidence either way; says exactly what to change | No |
| Capture failed | Caught before processing | No |
| Posture screen (photo) | Single image; posture only | No |

## Functional requirements

- Capture on any modern phone browser; video never leaves the device unless the user saves it.
- Every number links to evidence (frame, event, check id) and carries a version.
- "Not measured" is never displayed as zero.
- Personal baseline after 6 valid defences, kept separate from coaching ranges.
- PDF download of every report. DEMO DATA is labelled on all fixtures.
- Works in portrait and landscape, light and dark, on iOS, Android and desktop.

## Success metrics

- 0 pull variants scored as a defence (release gate, enforced in CI).
- ≥ 95% classification stability across noise seeds for pull, drive and valid fixtures.
- Real-athlete targets are set in `04-data-annotation-validation.md` and are not claimed until met.
