---
name: quality-bar
description: The standard every change to Aline is held to, whoever or whatever writes it — how to build, how to prove it works, what "done" means, and how to report. Load at the start of any task that changes code, copy, data or docs, and again before saying a task is finished.
---

# The quality bar

The owner asked (2026-11-16) that work in later sessions never drops below the standard of the
work so far. This is that standard, written as things to do and things a machine checks. It
applies to every session and every kind of task. Nothing here is optional because a task looks
small.

## 1. Before writing anything

1. Read `docs/context.md` (what the athlete asked for, in their words) and the Map in `CLAUDE.md`.
2. Find how the same thing is already done here and do it that way. A second pattern for the
   same job is a defect.
3. Say what will change and what must not. For anything near the analysis: the stored result
   must stay identical unless changing it is the task (golden cases, `tests/metamorphic.test.ts`).
4. If a standing rule and the request disagree, say so and ask. Do not quietly pick one.

## 2. How things are built here

- **Logic is pure and lives apart from screens.** Rules, maths and data go in `src/engine` or
  `src/lib` with tests; components read them. One source feeds every surface that shows the
  same thing (the screen map feeds the page, its print layout and the PDF).
- **A new measure or check is tested against the truth, not against itself.** The generator
  knows where every joint really was: hold the new reading to that, from every camera position
  and both hands (`tests/pose-model.test.ts` is the pattern).
- **When a test disagrees, the test is information.** Find the cause. Remove or change the
  thing that can't be done reliably; never widen a tolerance, skip a case or special-case a clip
  to get green. (That is how the elbow-bend and shoulder-tilt measures came out of shot models.)
- **Say what a thing is not.** A new file near the analysis opens with what it is and what it
  must never do, and a test holds it to that ("is read by no part of the analysis").
- **Every number a person reads is in their words**: no milliseconds, no minus signs on report
  screens; centimetres or a share of height; which way, in words.
- **Screens**: phone first, both themes, 44 px controls, one main action, no sideways scroll,
  one h1, nothing moving unless the person moves it. Load the `frontend-design` skill first.
- **Honest states**: loading, empty, failed and "can't tell" are designed, and say what to do.
- **Comments say why**, in the file's own voice. No commented-out code, no TODOs left behind.

## 3. Proving it works (all of these, not a sample)

| Check | Command | Must be |
|---|---|---|
| Lint, types, tests, build | `npm run lint && npm run typecheck && npm test && npm run build` | clean, no new warning |
| Every page, both themes, every section opened | `npm run check:pages` (after a build) | "No problems." |
| Load numbers, when a page's weight or first paint could have changed | `TIMING=1 npm run check:pages` | no worse than docs/13's tables, or explained |
| The change itself, in a real browser at phone width | Playwright script: do what a person would do, read what they would read | as intended; no page errors |
| Analysis, capture or identification touched | the `real-media-eval` skill, on real clips, against the previous build | no verdict changed that wasn't meant to |
| Database touched | `scripts/db/check-rls.sh` locally, then `get_advisors` after applying | all checks pass, nothing new |
| A screen added or changed | `scripts/design/capture*.mjs`, then `pdf.mjs` | the screen map and its PDF show today's app |

CI runs the first two on every push. A red check is fixed at its cause; it is never skipped,
quarantined or re-run until it passes.

## 4. Done means

- [ ] Everything in section 3 that applies was run **this session**, after the last edit.
- [ ] A test would fail if the new behaviour broke.
- [ ] `docs/context.md` says what was asked and what was done; the Map in `CLAUDE.md` names
      every new file; a feature has its own `docs/NN-*.md` with what is built, how it was
      checked, and its limits.
- [ ] Committed with the attribution lines, pushed, PR with the footer, CI green, merged with
      the full SHA, **both production sites checked** for the new build and the new page.
- [ ] The athlete was told once, briefly, in plain words, with what is live and what is not.

## 5. Reporting

- Say what was verified and how. Say what was **not** verified, every time, as a list.
- Never describe something as working that was not run. "Built" and "checked" are different
  words.
- If something could not be done (a site that wouldn't open, a clip that wasn't there), say it
  in the report and in the docs, and say what was done instead.
- Numbers come from a run in this session, with the command that made them.
- Messages to the athlete: short, plain, a table when comparing. They read on a phone.

## 6. Long or multi-part work

- Commit and push to the session branch at every working point, before any long step. A
  session can stop without warning; nothing unpushed survives.
- Ship in parts that each stand on their own (one PR each), in the order that keeps production
  correct at every step.
- When asked for status: what is done, what is pending, a percentage, an ETA. At once.
- After opening a PR: subscribe to it, set one safety-net check-in, merge when green, verify,
  report. Do not leave a PR waiting to be asked about.

## 7. Never

- Loosen a threshold, range or tolerance for one clip; change the analysis without real clips.
- Call another shot a defence, or give a confident answer where the app can't tell.
- Commit third-party media, a real player's footage, secrets, or a model's name.
- Mirror a right-hander to make a left-hander.
- Force-push, skip a hook, or merge on red.
- Leave a claim in the app or the docs that is no longer true. Fixing a stale claim found on
  the way is part of the task.
