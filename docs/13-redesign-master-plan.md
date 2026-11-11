# 13 · Redesign master plan (Phase 0)

Written 2026-11-11. A plan only: no code changed. Nothing in it is built yet unless it says so.
Batch 1 does not start until the product owner approves this and answers section 16.

Three things to know before reading:

- **The reference site was not reviewed.** `pitchwolf.ai` is not reachable from the session that
  wrote this (network policy). The plan uses the principles named in the brief (one primary
  action, proof over claims, capture → analysis → improvement, separate player and coach
  journeys), not a reading of that site. Nothing here can have been copied from it.
- **None of the six named design skills is installed** (Emil Kowalski, Impeccable, Taste, Framer
  Motion skill, 21st.dev, UI UX Pro Max). Installed and usable: the project's `frontend-design`
  and `webapp-testing` skills, `dataviz`, and the `motion` library (v13) already in
  `package.json`. Ultracode is not enabled and the project forbids sub-agents: one workflow.
- **The brief contradicts five standing project rules** (`CLAUDE.md`). They are listed in
  section 16 as decisions, not assumed away.

## 1. Diagnosis

Measured on the production build, phone width (390 px), 4× CPU slowdown:

| Page | JS | All bytes | LCP | Blocking time | Layout shift | Targets under 40 px | Page height |
|---|---|---|---|---|---|---|---|
| `/` landing | 305 KB | 539 KB | 0.44 s | 180 ms | 0 | 6 of 9 | 938 px |
| `/home` | 231 KB | 436 KB | 1.19 s | 171 ms | 0 | 15 of 26 | 3,278 px |
| `/analyse` | 562 KB | 9.9 MB | 0.98 s | 1,977 ms | 0.058 | 12 of 23 | 1,337 px |
| `/sample/valid_ffd` | 492 KB | 907 KB | 0.34 s | 543 ms | 0 | 6 of 14 | 844 px |
| `/coach` | 498 KB | 920 KB | 0.84 s | 267 ms | 0.064 | 4 of 12 | 946 px |
| `/progress` | 350 KB | 550 KB | 0.85 s | 134 ms | 0.076 | 5 of 15 | 924 px |
| `/profile` | 405 KB | 604 KB | 0.87 s | 207 ms | 0.058 | 9 of 21 | 1,870 px |
| `/guide` | 498 KB | 922 KB | 1.16 s | 270 ms | 0 | 27 of 43 | 10,317 px |

Every page has one `h1`, the four landmarks, no unnamed controls, no images without `alt`, no
sideways scroll. That is a sound base.

**What is strong and must survive**

- Analysis on the device; honest abstention; a five-sentence summary before detail.
- An evidence contract already exists (`aline.result/1`): outcome, moments with uncertainty,
  measures tied to frames, withheld claims, confidence per layer. The redesign reads it.
- Category specs (`category.ts`): adding a shot is a spec, not a pipeline edit.

**What is weak**

1. **The landing proves nothing.** One screen, two shot-specific buttons, no sample of what
   comes back, no player or coach path, no statement of what is supported or experimental.
2. **The product is framed as "a defence checker".** Navigation says "Analyse a defence"; four
   places carry "Check front-foot / back-foot defence". The user must pick the shot before the
   engine sees it.
3. **Capture opens heavy.** `/analyse` moves 9.9 MB (pose models) and blocks for about 2 s on a
   slow phone, behind a screen titled "Add your shot" with four differently named options.
4. **Small touch targets** on every page (4 to 27 controls under 40 px).
5. **Layout shift** of 0.06–0.08 on coach, progress, profile and analyse.
6. **`/guide` is 10,317 px** of reading on a phone.
7. **Age stands in for ability.** `ageBand` drives report wording (`readingLevel`).
8. **Coach is an invite code and a queue** (136 lines). No squads, assignments or assessment.
9. **The PDF is text plus one image** (`jsPDF`). Advice is not shown on frames.
10. **Profile holds height, hand and age band only.** No limb dimensions.
11. **"Dual angle" is two uploads checked afterwards** (sound, then movement). There is no
    two-device session, code or countdown.
12. **Illustrations are solid silhouettes** that look more certain than the data behind them.
13. **Internal words reach the screen**: "prototype confidence", "fixture tracks", "classifier".

## 2. Existing experience map

| Route | What it is today | Fate |
|---|---|---|
| `/` | Minimal opening: headline, two shot buttons, sample link | Rebuilt (Batch 1) |
| `/home` | App home: two guides, hand roles, sample reports | Rebuilt as application home (Batch 2) |
| `/analyse` | Capture flow, 1,889 lines in one component | Becomes `/check`; `/analyse` redirects (Batch 2) |
| `/angles` | Combined report for two angles | Folds into the report's Comparison and dual-angle (Batches 3, 7) |
| `/report/[id]`, `/sample/[key]` | Report: summary, then "Details" | Six sections (Batch 3) |
| `/sessions`, `/progress` | Saved analyses; trends | Restyled (1), rebuilt (3) |
| `/coach` | Invite and queue | Coach workspace (Batch 6) |
| `/profile` | Hand, height, age band, cloud save | Profile and measurements (Batch 2) |
| `/guide` | Long how-to | Split: How it works (public), capture guidance (in flow) |
| `/science`, `/privacy` | Method and privacy | Kept, rewritten to the new voice (Batch 1) |
| `/design-system` | Token and component page | Becomes the living spec (every batch) |
| `/visitors`, `/signin`, `/auth/callback`, `/api/*` | Owner tools and plumbing | Unchanged |

Engine and data dependencies the UI reads: `AnalysisPayload` (`align.analysis/1`, stored),
`AnalysisResult` (`aline.result/1`, built on open), `CaptureObservation` (tracks),
`CategorySpec`, `plainSummary` (`summary.ts`), `signature.ts` + Supabase `shot_profiles`
(match %), local store (`store.ts`), cloud (`cloud.ts`). Supabase tables that exist:
`profiles, analyses, analysis_payloads, observations, metric_values, reports, baselines,
shot_profiles, coach_invites, coach_links, consents, annotations, audit_log, media_objects,
registry_versions, visits, visit_keys, site_admins`.

3D today: one `three.js` viewer (`report/scene-3d.tsx`, 507 lines), loaded on demand inside the
report, low-power renderer, paused off-screen, honours reduced motion. Nothing 3D on the landing.

## 3. Information architecture

```
Public                          Application (same shell, signed in or local)
/              Landing          /home        What to do next, last result, progress at a glance
/how-it-works                   /check       Check your shot (upload, record, dual angle)
/sample        Sample analysis  /sessions    Every analysis
/levels        Analysis levels  /progress    Change over time
/players                        /library     Reference library (yours, coach's, licensed)
/coaches                        /coach       Coach workspace
/science       Science and validation        /profile     Profile and measurements
/privacy                        /settings    Level, language, theme, data
```

The landing answers "what is this and should I try it". The application home answers "what do I
do next". They share the header, tokens and the one primary action, **Check your shot**.

## 4. Visual direction

**Idea: the line.** Aline already has one thing no other product has: the batter's line (head,
front shoulder, front knee, front foot). The identity is a single orange line that runs through
real joints on a dark field, drawn on real pitch geometry. Orange is never a surface; it is the
line, the moment being looked at, and the one primary button.

**Colour** (contrast computed against WCAG 2.1; to be re-checked in a unit test in Batch 1)

| Token | Value | Use | Contrast |
|---|---|---|---|
| `field` | `#050505` | Page | — |
| `ground` | `#121212` | Sections, sheets | — |
| `raised` | `#1A1A1A` | Controls, rows | — |
| `rule` | `#2A2A28` | Hairlines, crease marks | non-text |
| `chalk` | `#F4F1E8` | Text | 18.0:1 on field |
| `dust` | `#A9A59D` | Secondary text | 8.3:1 on field, 7.1:1 on raised |
| `line` (orange) | `#FF6A00` | The line, focus, primary button | 7.1:1 on field |
| `line-soft` | `#FF8A35` | Trails, hover | 8.7:1 on field |
| `ok` / `warn` / `bad` | `#7FB89A` / `#E0B354` / `#E8736A` | State, always with a word or icon | 9.0, 10.4, 6.9:1 on field |

- **Primary button: orange with near-black label** (7.1:1). White on orange is 2.9:1 and fails.
- **Daylight theme** (proposed, see 16.2): cricket is played in sun. `chalk` paper, black ink,
  orange text darkened to `#B54700` (4.8:1). The PDF uses this theme.
- No gradients as decoration, no glow on cards, no glass. Depth comes from the three surfaces.

**Type**

- Display: **Archivo** (variable, width 112–125, weight 700–800): wide, scoreboard-like, open
  licence. Headlines and big numerals only.
- Text: **Geist** (already loaded). Numbers use its tabular figures; **Geist Mono and Caveat are
  dropped** (two fewer font files).
- Scale (ratio 1.25): 13, 15, 17, 21, 27, 34, 44, 56, 72. Sentence case everywhere except the
  one hero eyebrow the brief asks for. Body lines under 70 characters.

**Layout**: lanes, not cards. Content sits in full-width lanes separated by crease-like rules;
a 4-column grid on phones, 12 on desktop; 8 px spacing unit; radius 4 px on controls, 0 on lanes.
Targets are 44 px minimum.

## 5. Motion and 3D

**Tokens**: `feedback` 140 ms, `detail` 200 ms, `section` 240 ms, `narrative` 480 ms; ease
`cubic-bezier(.2,.8,.2,1)`; one spring (stiffness 380, damping 34) for sheets and the level
selector via `motion`. Everything else is CSS. Under `prefers-reduced-motion` every transition is
an instant state change and the hero is a still.

**Hero: recommended approach is Canvas 2D with its own projection, not WebGL.** The scene is a
few hundred line segments and points. A 2D canvas with a small perspective projection draws that
in about 10 KB of code with no library; `three.js` stays where it is needed, in the report.

- **Source**: the pose track of a real engine fixture (`fixtureWorld`), so the hero is actual
  engine data, not an invented animation. It is labelled "generated example".
- **Scene**: pitch plane with creases and stumps to scale; a jointed line figure playing one
  defence on a slow loop; the ball's path and bounce; a pulse of orange travelling foot → knee →
  hip → shoulder → hands → bat; a sparse field of drifting points (≤ 300).
- **Response**: pointer or tilt turns the camera by at most 4°. Scrolling the first screen
  freezes the figure at contact, the joints become landmarks, and three labels appear as real
  HTML over it (head over front foot, front knee, contact).
- **Loading**: the headline is the largest paint, in HTML. A server-rendered SVG of the same
  pose is the poster. The canvas code loads when the browser is idle and only if motion is
  allowed, `Save-Data` is off and the device reports ≥ 4 GB memory; otherwise the poster stays.
- **Cost controls**: pauses when off-screen or the tab is hidden; 30 fps on phones; device pixel
  ratio capped at 1.5 (phone) and 2 (desktop); stops after 8 s without input and resumes on
  input. Never captures scroll. The CTA is above it in the DOM and in tab order.

**Report viewer (Batch 3)** keeps `three.js`, rebuilt on the result contract: skeleton with
per-joint confidence (dashed when hidden, absent when unseen), pitch plane, axes, camera badge,
body / bat / ball layers, phase stepping, user / reference toggle, side by side, ghost only when
comparable, text alternative (a table of the same frames).

## 6. Component system

- **Tokens**: colour, type, space, radius, motion, layer. Scoped under `[data-ui="2"]` so old
  and new coexist until Batch 3 (this is also the rollback switch).
- **Primitives**: Button (primary, secondary, quiet), IconButton, Field, Select,
  SegmentedControl, ChoiceChip, Tabs, Sheet, Dialog, Toast, StatusPill, Progress, Skeleton.
  Each with rest, hover, focus-visible, pressed, disabled, loading, error.
- **Domain**: EvidenceFrame, LandmarkOverlay, PhaseTimeline (exists), LayerConfidence (exists
  as "How sure each part is"), MetricRow + RangeBar (exists), ComparePair, SimilarityBreakdown,
  PitchGuide, CaptureOverlay, LevelSelector, FocusAreaPicker, ReferenceCard (with rights badge),
  QueueRow, DrillStep.
- **States** for every screen: loading, empty, partial evidence, failed, offline.

## 7. Terminology

| Today | Becomes |
|---|---|
| Analyse a defence; Check front-foot / back-foot defence | Check your shot |
| Add your shot | Upload your shot |
| Choose a video | Upload a video (Movement analysis) |
| Choose photos | Per-frame form check |
| Record a video | Record a shot |
| Two angles of one ball | Dual-angle capture |
| Valid front-foot defence | Shot identified: front-foot defence |
| This appears to be a pull, not a … | Shot identified: pull. Aline doesn't grade this shot yet. |
| We can't confirm a … | We need a clearer recording (with the reason) |
| Match % | Movement similarity (with its breakdown, or "not comparable") |
| Details | Evidence, Training, Comparison, Progress, Technical details |
| prototype confidence / classifier / fixture tracks | Only in Technical details |
| Age band (drives wording) | Analysis level (Beginner, Amateur, Professional); age optional |

Photos: "A photo shows one moment. It can't show timing, the ball or which shot was played."

## 8. Flows

**Player**: Landing → Check your shot → choose Upload a video / Record a shot / Per-frame form
check / Dual-angle capture → (first time) level, optional focus areas, optional "what did you
mean to play" → capture guidance → recording check → analysis with staged progress → report
Summary → Evidence → Training → retest. Failure at any step says what to change.

**Reference comparison**: report → Comparison → choose reference (my best, my baseline, coach's
standard, licensed athlete) → comparability check (shot, view, hand, frame rate, landmarks) →
either side-by-side frames at matched phases with a domain breakdown and its confidence, or
"not comparable" with the reason and what would make it so.

**Coach**: Coach workspace → squad → queue (unreviewed, low confidence first) → open a
player-shared session → engine result (read only) beside coach assessment (own fields) → assign
focus, drill, retest target, reference → mark reviewed → player sees coach notes labelled as
the coach's → export. Every action lands in the audit history.

## 9. Data and contract changes (proposed)

| Change | Where | Batch |
|---|---|---|
| `session`: `{ level, focusAreas[], intended, presentationVersion }` saved with each analysis | store, cloud, `analyses` | 2 (UI), 4 (logic) |
| `present(result, level, focus) → ReportModel`: pure; the engine payload is identical at every level (tested) | `src/engine/present.ts` | 4 |
| `CategorySpec.focusGroups`, `levels` (which measures surface, in what order) | `category.ts` | 4 |
| Identify without a chosen shot: try each supported category's own gate, accept at most one | `analyze.ts` orchestration, no threshold change | 4 (Batch 2 uses today's "looks like the other defence" hand-off) |
| `BodyProfile`: height, arm span, upper arm, forearm, shoulder width, leg length, batting side, dominant hand; each `measured` / `estimated_from_video` / `not_provided` | store, `profiles` | 2 (UI), 4 (use) |
| Metric availability matrix from `metrics[].requires` × view × signals | `category.ts`, Science page | 4 |
| Wrist–elbow synchronisation: provisional spec only (rationale, phases, landmarks, views, formula, uncertainty); enabled after labelled examples and a coach's review | registry, `docs/` | 4 |
| `reference_athletes`, `reference_shots`, `reference_assets` (rights, provenance, permitted use, visibility) | Supabase + RLS | 5 |
| `aline.similarity/1`: `{ comparable, reasons[], domains{alignment, footwork, timing, bat_path}: { score|null, confidence }, overall|null }` | `src/engine/similarity.ts` | 5 |
| `squads`, `squad_members`, `coach_assessments`, `assignments`, `review_status` (reusing `coach_links`, `consents`, `annotations`, `audit_log`) | Supabase + RLS | 6 |
| `capture_sessions` (code, roles, state, clock offsets); only session state and pose tracks travel, never video; rows expire | Supabase Realtime | 7 |
| PDF from a print layout of the report (`/report/[id]/print`), `jsPDF` kept as fallback | report | 3 |

## 10. Legal and licensing risks

| Risk | Handling |
|---|---|
| A named professional's name, image or footage (the Virat Kohli example) | Not used. Library launches with the user's own best, coach-approved models and generated references. Every asset row carries rights, source, permitted use and expiry; nothing is visible without them. |
| Broadcast clips | Owned by boards and broadcasters. Never stored or shown. |
| "AI cricket coach", coach endorsements | "AI-assisted cricket analysis". No endorsement wording without a named, contracted coach. |
| Medical or injury claims | None. "Not a medical assessment" stays on every report. |
| Minors | Age stays optional; coach sharing by a minor needs a guardian's consent. Needs legal review for the markets served before Batch 6. |
| Research datasets used for calibration (KU CricShot) | Check its licence before any of it becomes a visible reference. |
| Fonts | Archivo and Geist are open-licensed; licence files committed. |
| Reference site | Not reviewed, nothing copied; Aline's layout comes from its own "line" idea. |

## 11. Performance risks

| Risk | Budget and control |
|---|---|
| Hero costs paint or battery | Hero code ≤ 15 KB gzipped, loaded on idle; landing JS stays ≤ 305 KB before it; LCP ≤ 0.8 s and blocking ≤ 200 ms at 4× slowdown; zero frames drawn off-screen (tested) |
| Dark theme repaints large areas | No blur, no fixed backgrounds, no shadows |
| New fonts shift layout | One variable display file, `size-adjust` fallback; layout shift ≤ 0.02 on every page |
| `/check` still blocks 2 s | Models load after the first choice, not on arrival (Batch 2 target: blocking ≤ 600 ms before interaction) |
| Three.js on the report | Stays lazy; never on the landing |

## 12. Accessibility risks

| Risk | Control |
|---|---|
| Orange used as the only signal | State always carries a word or icon; orange is emphasis |
| Text over a moving canvas | Text sits on `field` beside or above the canvas, never on it; labels have a solid backing |
| Canvas is invisible to screen readers | Canvas is `aria-hidden`; the same content is real text and a list |
| Motion sickness | Reduced motion gives stills; pointer response capped at 4°; nothing auto-scrolls |
| Small targets (today 4–27 per page) | 44 px minimum, tested per page |
| Level selector hides information | "What else was checked" is always one tap away at every level |
| Colour-only meaning in the PDF | Print theme, patterns and labels |

## 13. Batch plan

Each batch: its own branch from `main`, baseline tests recorded, only its scope, tests with the
change, desktop + phone + reduced-motion checks, before/after screenshots, performance numbers,
`lint`, `typecheck`, `test`, `build`, a draft PR marked not ready, then stop for review.

| Batch | Scope | Main files | Engine touched |
|---|---|---|---|
| 1 Foundation and landing | Tokens, type, primitives, landing, hero, navigation, trust copy | `globals.css`, `layout.tsx`, `app/page.tsx`, `components/landing/*`, `components/ui/*` (new), `app-shell.tsx`, `design-system/page.tsx`, `science`, `privacy` | No |
| 2 Analysis interaction | `/check`, terms, level and focus pickers, measurements, pitch guide, camera overlay, dual-angle shell, states | `components/capture/*` (split the 1,889-line flow), `app/check`, `profile-page.tsx`, `store.ts` (session fields) | No (reads today's engine) |
| 3 Report, evidence, 3D, PDF | Six sections, landmark figures, evidence viewer, 3D viewer, comparison UI on fixtures, print PDF | `components/report/*`, `lib/pdf.ts`, `app/report/[id]/print` | No |
| 4 Levels and parameters | `present()`, focus rules, body normalisation, availability matrix, wrist–elbow (provisional), identify-without-choice | `engine/present.ts`, `category.ts`, `summary.ts`, `registry.ts` | Yes, presentation and new measures; acceptance thresholds untouched |
| 5 Reference library | Tables, rights, comparability gate, similarity domains, overlays, PDF | `engine/similarity.ts`, `lib/compare.ts`, `app/library`, Supabase | Yes (comparison only) |
| 6 Coach workspace | Squads, queue, assessment, assignments, audit, exports | `components/coach/*`, Supabase + RLS | No |
| 7 Dual angle | Sessions, QR / code, roles, countdown, sync, same-delivery check | `components/capture/dual/*`, `engine/same-ball.ts`, Supabase Realtime | Yes (sync contract) |
| 8 Hardening | Budgets, audits, devices, flags, rollout | Cross-cutting | No |

**Rollback**: the new look lives under `[data-ui="2"]` and a flag (`NEXT_PUBLIC_UI`, overridable
by cookie for review). Turning the flag off restores the current product; Vercel can also
promote the previous deployment. Database changes (Batches 5–7) are additive only.

## 14. Acceptance criteria

| Batch | Passes when |
|---|---|
| 1 | Token contrast test green (AA for every text pair); landing budgets in section 11 met; hero draws 0 frames off-screen and under reduced motion; keyboard reaches the CTA first; phone and desktop screenshots; engine golden snapshot identical; build green |
| 2 | Whole flow completes on fixtures for video, photos and dual-angle shell; empty, loading, failed, success states shown; camera overlay degrades to static guidance without sensors; screen-reader pass; no threshold or registry change |
| 3 | Valid, another-shot, unclear and failed fixtures each render all six sections correctly; nothing drawn for unseen joints; PDF renders with frames, no clipped charts, readable in greyscale; 3D has a text alternative |
| 4 | Engine payload byte-identical across the three levels; each level surfaces only available measures in its range (5–7, 10–14, all); a serious finding outside the chosen focus is still shown; wrist–elbow labelled provisional and off until validated |
| 5 | No similarity when shot, view or landmarks are incompatible; every reference shows provenance; no asset visible without rights; own-baseline fallback works |
| 6 | Role and consent tests; a coach edit never changes engine output; audit trail complete |
| 7 | Two different deliveries are never paired silently; sync confidence shown; one device failing is recoverable; only declared data leaves a device |
| 8 | All tests, build, no console errors, real-device pass, accessibility and performance reports, security review, migration and rollback rehearsed |

## 15. Batch 1, exactly

In: design tokens under `[data-ui="2"]`; Archivo + Geist; primitives with all states; the new
landing (hero, one CTA, three steps, sample-report preview built from a real fixture result,
levels explained, reference-comparison preview marked "coming", coach preview marked "coming",
privacy and validation status, player and coach entry points, closing CTA); header and mobile
navigation with **Check your shot**; `/science` and `/privacy` copy; `/design-system` updated;
a contrast unit test; a landing smoke test (renders without the canvas, reduced motion, tab
order); `docs/07-design-system.md`; before/after screenshots and numbers.

Out: anything under `src/engine`, the capture flow, the report, the PDF, Supabase, the coach
page's behaviour. `/analyse` keeps working; the CTA points to it until Batch 2.

Wireframe, phone:

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Aline              ☰         │   │ 1 Upload or record           │
│                              │   │ 2 See the evidence           │
│ AI-ASSISTED CRICKET ANALYSIS │   │ 3 Train and improve          │
│ Every shot,                  │   ├──────────────────────────────┤
│ explained.                   │   │ A real result (sample)       │
│ Upload a cricket shot. Aline │   │ [frame with the line]        │
│ identifies the movement …    │   │ Shot identified · what was   │
│ [ Check your shot ]          │   │ good · what to fix           │
│  View a sample analysis      │   │  View the sample analysis    │
│                              │   ├──────────────────────────────┤
│   · figure on the pitch ·    │   │ Three levels, one engine     │
│   ──── the orange line ────  │   │ Beginner · Amateur · Pro     │
│                              │   ├──────────────────────────────┤
│ Private by design ·          │   │ For players │ For coaches    │
│ Evidence-backed ·            │   ├──────────────────────────────┤
│ Coach-review ready           │   │ What is graded today, what   │
└──────────────────────────────┘   │ is experimental, what stays  │
                                   │ on your phone                │
                                   │ [ Check your shot ]          │
                                   └──────────────────────────────┘
```

The landing must state plainly: two shots are graded today (front-foot and back-foot defence);
other shots are identified where possible and not graded; ranges are provisional; the engine is
not yet validated on real athletes.

## 16. Decisions needed from the product owner

1. **Replace the standing design rule?** Today: two tones, sage-cream paper, flat, "never a
   continuously rendering canvas on a page that scrolls". The brief asks for black and orange and
   a moving hero. Recommended: yes, with the hero paused off-screen and stopped when idle.
2. **Keep a daylight (light) theme** for outdoor use and print? Recommended: yes.
3. **Level replaces age as the driver of wording?** Today `ageBand` sets the language, and
   reports never show milliseconds. Recommended: level decides; milliseconds allowed only in
   Professional → Technical details; age stays optional.
4. **The reference site was not reviewed.** Allow `pitchwolf.ai` on the environment's network
   and I will review it, or proceed on the principles in the brief.
5. **Positioning line**: "AI-assisted cricket analysis" (recommended) rather than "AI cricket
   coach".
6. **Hero technology**: Canvas 2D (recommended, about 10 KB) or WebGL.
7. **"Check your shot" while only two shots are graded.** Recommended: say so on the landing
   and in the flow; never imply any shot can be graded.
8. **Reference library seed**: own best, coach-approved models and generated references only,
   until a licensed athlete is signed. Who can sign licences?
9. **Left-handers**: similarity is computed in a common frame, but video is never flipped
   (standing rule 7). Confirm.
10. **Existing "match %"** becomes "movement similarity" with a breakdown, and disappears when
    recordings are not comparable. Confirm.
11. **Dual-angle coordination through Supabase** (session state and pose tracks, never video).
    Acceptable?
12. **PDF from a print layout** rather than `jsPDF`. Confirm.
13. **Minors**: who gives legal sign-off on consent before the coach workspace ships?
14. **Typeface**: Archivo for display, Geist for text. Confirm or name an alternative.
15. **Draft PRs, no automatic merge** for this programme, overriding standing rule 6 ("ship it").
