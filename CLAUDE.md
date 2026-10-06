# Aline — working context

Aline (formerly Align; repo and storage keys keep "align") analyses one cricket shot, the **front-foot defence (FFD)**, from a phone video or photo,
in the browser (MediaPipe pose on device), and coaches the batter toward a perfect one.
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

## Working rules

- Develop on the session's `claude/...` branch; PR to `main`; merge after CI is green (merge API
  needs the full 40-character SHA); never force-push.
- Commit messages end with the session's attribution lines; PR bodies end with the Claude Code
  footer. No model names or identifiers in commits, PRs or code.
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
| Shot identity | `classify.ts`, `features.ts`, `events.ts` |
| Coaching and drill ladders | `coaching.ts`, `scoring.ts` (`buildPlan`) |
| Shot signature and match % | `signature.ts`, `src/lib/compare.ts`, Supabase `shot_profiles` |
| Capture (scan, pick batter, gate, track) | `src/components/capture/capture-flow.tsx`, `src/lib/capture/*` |
| Parallel model work (workers; must give the page's exact results) | `src/lib/capture/vision.worker.ts`, `vision-pool.ts` |
| Brand (mark geometry, flat and 3D logo, icons) | `src/components/brand/*`, `scripts/brand-icons.mjs` |
| Report | `src/components/report/*` (`line-panel.tsx`, `compare-panel.tsx`, `panels.tsx`) |
| Synthetic fixtures and population | `src/engine/fixtures/*` |
| Real-media evaluation | `scripts/eval/*` |
| Product docs | `docs/00…10-*.md` |

Checks: `npm run lint && npm run typecheck && npm test && npm run build`.
