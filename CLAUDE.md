# Aline — working context

Aline (formerly Align; repo and storage keys keep "align") analyses the **front-foot defence (FFD)** and, built on top of the
locked FFD build (`lock/ffd-2026-10-10`), the **back-foot defence (BFD)** (@docs/11-back-foot-defence.md), from a phone video
or photo, in the browser (MediaPipe pose on device), and coaches the batter toward a perfect one.
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Vitest · Supabase · Vercel.

- Production: https://align-lab.vercel.app and https://alynn.vercel.app, auto-deployed from `main`.
- Supabase project: `uwhgahpsivwkvxmbchmk`. Never touch the "Action Lab" project or cricshot.vercel.app.
- What the athlete has asked for, in their words and with status: @docs/context.md. Read it
  first; update it whenever they ask for something new or something ships.

## What the athlete expects (standing rules)

1. **Accuracy before features.** Identification (is this a front-foot defence?) and analysis
   must be right on real footage, or the app must say it can't tell. Never a confident wrong
   answer ("hallucinating"). A real defence must never be called a different shot; no other
   shot may ever be accepted as a defence.
2. **The FFD logic** (see the `ffd-model` skill): head, front shoulder, front knee and front
   foot (toe) in one line, held until contact, the front shoulder leading into the line of the
   ball; the stack is the same whatever the length of the ball. Front foot, front knee and
   front shoulder arrive in sync. Every measure explained, with where its range comes from.
3. **Test on real media before shipping** (see the `real-media-eval` skill): at least 10
   different videos and photos, different resolutions and camera positions; compare with the
   previous build; only then finalise and push.
4. **A complete experience**, not a basic one: the line visual, timing, comparison with other
   profiles (match %), a drill ladder to perfection, saved body dynamics.
5. **Fast, never at the cost of the logic**: every step of an analysis within a minute on a
   phone. Speed comes from not repeating work and using more cores, never from fewer frames,
   smaller models or looser rules; prove it by comparing tracks before and after.
6. **Ship it**: merge after green CI, verify production, then tell the athlete once that it is
   live. Don't make them ask. Keep messages short (they read on an Android phone).
7. **Left-handers are not mirrored right-handers.** Batting side is not hand dominance (most
   left-handed batters bat with their stronger hand on top); never flip a demonstration for a
   left-hander. Name the batter's own sides and the role of each hand instead
   (docs/context.md, 2026-10-21).
8. **Simple first.** A report opens with at most five plain sentences a child could follow
   (`src/engine/summary.ts`) and the camera angle on the right; everything else (measures,
   illustrations, drills) only in its sections, closed until opened (Evidence, Training,
   Comparison, Progress, Technical details). Opening pages: a headline, the
   actions, a few steps; no long copy. Wording follows the batter's age (`readingLevel`: under
   13 no numbers; adults the number and target); never milliseconds or minus signs on report
   screens (docs/context.md, 2026-11-08).

## Working rules

- **Design** (docs/13, the owner's decisions of 2026-11-11): a dark field (#050505), warm white
  text (#F4F1E8) and one orange (#FF6A00) that is the line, the moment being looked at and the
  one primary action, never a surface; a daylight theme for outdoor use and print; Archivo for
  display, Geist for text; the feel of the owner's reference (cricshot, 2026-11-11) in these
  colours: sentence-case headlines, pill buttons, rounded panels (`.panel`), plain numbers; no
  gradients, shadows or glass. Tokens:
  `globals.css` under `:root[data-ui="2"]` (`NEXT_PUBLIC_UI=1` brings the first design back),
  held to AA contrast by `tests/design-tokens.test.ts`. Load the `frontend-design` skill before
  UI work and check the result in a browser with the `webapp-testing` skill (phone viewport,
  both themes, 4× CPU slowdown for performance). A moving canvas must draw nothing off-screen,
  in a hidden tab, once left alone, or under reduced motion, and must show a still first (the
  landing batter, `components/landing/batter-figure.tsx`, is the pattern). A picture says what it
  is on the page (the landing batter: "Traced from a real clip"); a drawing that is not from a
  recording says "Illustration". Only clips the owner may use are traced; never mirrored.

- The BFD runs only when the observation carries `target: "back_foot_defence"`; without it every
  result must stay byte-identical to the FFD build (check with `scripts/eval/verdicts.probe.ts`
  on saved real tracks against a worktree of `lock/ffd-2026-10-10`), with one deliberate
  exception: a clip that shows the back-foot defence's whole definition (`backfoot-formula.ts`) is
  never passed as a front-foot defence; it reads "looks like a back-foot defence" (or is named one
  when the FFD model names no shot) and offers that analysis (docs/11, 2026-11-08). Since engine
  0.9.0 the times of the Trigger and Back-foot markers also differ, by design (they read nothing
  else: `tests/foot-markers.test.ts`, docs/12).
- The BFD is identified by its definition checked on the body from any camera position
  (`backfoot-formula.ts`), never tuned to one clip: check every change on real movement from every
  view (`scripts/eval/ku3d.probe.ts`, `formula.probe.ts`) and on the athlete's real clips.

- Develop on the session's `claude/...` branch; PR to `main`; merge after CI is green (merge API
  needs the full 40-character SHA); never force-push.
- Commit messages end with the session's attribution lines; PR bodies end with the Claude Code
  footer. No model names or identifiers in commits, PRs or code.
- No threshold or detector change on the strength of one clip: `tests/metamorphic.test.ts` must
  pass (its list of known breaks may shrink, never grow), and the slice report before and after
  goes in the change (docs/12).
- Do not commit third-party media (broadcast clips, dataset videos, photos of real players).
  Real-media test sets live outside the repo; only their manifests and tools are committed.
- Do all work in this session (no sub-agents).
- Every threshold, range and weight lives in `src/engine/registry.ts` (or `alignment.ts` for
  the line bands). Changing any of them changes `REGISTRY_HASH`: publish it with
  `node scripts/registry-sql.mjs > supabase/migrations/<ts>_registry_<label>.sql` and apply that
  migration to Supabase, or `tests/gates.test.ts` fails.

## Map

| Area | Where |
|---|---|
| Pipeline (gate → scene → events → classify → status → metrics → plan) | `src/engine/analyze.ts` |
| The line and its timing | `src/engine/alignment.ts` |
| Measures and ranges | `src/engine/registry.ts`, `metrics.ts`, `frontal.ts` (bowler's-end view) |
| Shot identity | `classify.ts`, `features.ts`, `events.ts` (`detectEvents`; old against steady markers: `scripts/eval/foot-markers.probe.ts`) |
| A shot checked without naming it (front-foot analysis, then the back-foot one only when that result points there; never a new rule) | `src/engine/identify.ts`, `tests/identify.test.ts`, `scripts/eval/unchosen.probe.ts`; chooser `components/capture/shot-chooser.tsx` |
| Coaching and drill ladders | `coaching.ts`, `scoring.ts` (`buildPlan`) |
| What a report lists at each analysis level and focus (pure; the analysis never reads them) | `src/engine/present.ts` (`present`, `aline.report-model/1`), `CategorySpec.presentation` in `category.ts`, `tests/present.test.ts` |
| Which measures a set-up gives (camera, media, bat, ball, fps, scale; mirrors the analysis) | `src/engine/availability.ts`, `tests/availability.test.ts`, Science page |
| Measures specified but off (never read by the analysis) | `src/engine/provisional.ts` (wrist and elbow together), `tests/provisional.test.ts` |
| Back-foot defence (measures, ranges, coaching, gate) | `backfoot.ts`, `backfoot-defs.ts`, `backfoot-coaching.ts`, `analyze.ts` (`analyzeBackFoot`), report `back-foot-panel.tsx`, guide `back-foot-guide.tsx` |
| Shot signature, match % and movement similarity (comparability gate, parts of the body, your usual; provenance on every reference) | `signature.ts`, `similarity.ts` (`aline.similarity/1`), `src/lib/compare.ts` (`PROVENANCE`), Supabase `shot_profiles` |
| Reference library (rights on every row, readable only when granted and unexpired; admins write) | `/library` (`components/library/library-page.tsx`), `listLibraryShots` in `src/lib/cloud.ts`, Supabase `reference_athletes`, `reference_shots`, `reference_assets`; access rules checked locally with `scripts/db/check-rls.sh` |
| Capture (scan, pick batter, gate, track) | `src/components/capture/capture-flow.tsx` (its stateless helpers: `flow-helpers.ts`), `src/lib/capture/*`; lining the phone up before recording (live picture, guides, level; guidance, not a gate) `camera-line-up.tsx`, `src/lib/capture/line-up.ts`; where to stand `pitch-guide.tsx` |
| Parallel model work (workers; must give the page's exact results) | `src/lib/capture/vision.worker.ts`, `vision-pool.ts` |
| Landing (one action, a real batter traced frame by frame from a clip and stopped on four moments, the engine's measured example beside the sample, what is true today) | `src/app/page.tsx`, `src/components/landing/batter-figure.tsx`, `src/lib/traced-batter.ts` (generated), `public/art/front-foot-defence.json`, tracer `scripts/trace/` (`tests/traced-batter.test.ts`), `hero-figure.tsx`, `src/lib/hero-geometry.ts` (the measured line); redesign plan and batches @docs/13-redesign-master-plan.md |
| Brand (mark geometry, flat and 3D logo, icons) | `src/components/brand/*`, `scripts/brand-icons.mjs` |
| Fresh pages after a release (build id, reload when a new one is live, held while busy) | `src/lib/fresh.ts` (`VersionWatch`, `holdUpdates`), `src/app/api/version`, `next.config.ts` |
| Visitor log (tracker, bot filter, public totals page) | `src/lib/visit.ts`, `visit-shared.ts`, `src/app/api/visit`, `src/components/visitors.tsx`, Supabase `visits`, `visits_overview()` |
| Report | `src/components/report/*` (`report-view.tsx`: the summary, then five sections closed until opened: Evidence, Training, Comparison, Progress, Technical details; `line-panel.tsx`, `compare-panel.tsx` (reads `similarity()`), `side-by-side.tsx` (three matched moments), `panels.tsx`; for paper and Save as PDF `print-report.tsx`, `/report/[id]/print`, `/sample/[key]/print`, the text PDF `src/lib/pdf.ts`; the lesson's figures, drawn only from tracked points, `src/components/lesson/figure.tsx`); plain summary `src/engine/summary.ts` |
| Two angles of the same ball (optional, `/angles`) | `src/engine/angles.ts`, `src/components/report/angles-report.tsx`; side and front slots on the Add screen (`src/components/capture/two-videos.tsx`; one video per picker, two at most; its own angle check `twoAngleView`, `scripts/eval/view.probe.ts`) or capture `?angle=<id>`; same ball from the sound `src/engine/same-ball.ts`, `src/lib/capture/audio.ts` (two-video option: or from the movement, `sameBallTwoVideos`, `scripts/eval/motion.probe.ts`); `tests/e2e/two-videos.mjs`, `two-angles.mjs` |
| Category specs (phases, order, views, abstention table per shot) | `src/engine/category.ts` |
| Result contract the report reads (outcome, events with uncertainty, withheld claims) | `src/engine/result.ts`, `timebase.ts`; timeline `report/phase-timeline.tsx`, `result-panel.tsx`; @docs/12-engine-architecture.md |
| Gate against one-clip fixes (same movement, different recording) | `src/engine/eval/*`, `tests/metamorphic.test.ts`, `tests/baselines/metamorphic.json`, `scripts/eval/metamorphic.probe.ts`, `golden.probe.ts` |
| Real-clip dataset and detector gate (labels, manifest, per-slice and leave-one-athlete-out, accept / reject) | `scripts/eval/dataset/README.md`, `label.html`, `dataset.mjs`, `real.probe.ts`, `compare-reports.mjs`, `src/engine/eval/dataset.ts`, `real.ts`, `detectors.ts`; clips in `eval-media/` (ignored) |
| What depends on each event; what the contract costs | `scripts/eval/sensitivity.probe.ts`, `perf.probe.ts` |
| Synthetic fixtures and population | `src/engine/fixtures/*` |
| Real-media evaluation | `scripts/eval/*` |
| Product docs | `docs/00…10-*.md` |

Checks: `npm run lint && npm run typecheck && npm test && npm run build`.
