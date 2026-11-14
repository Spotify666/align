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

## Status

| Batch | State |
|---|---|
| 0 Plan | Approved 2026-11-11 |
| 1 Foundation and landing | **Shipped 2026-11-11** (see "Batch 1 as built" at the end) |
| 2 Analysis interaction | **Shipped 2026-11-12**, in four parts (see "Batch 2 … as built"). Left for later batches, as planned: identifying without a choice inside the engine for more shots (4), live pairing of two phones (7). Not done: the processing steps of the capture flow are still one component |
| 3 Report, evidence, 3D, PDF | **Shipped 2026-11-14**, in five parts (see "Batch 3 … as built"): the report in six sections, the PDF from a print layout, landmark figures, one drawing rule and the 3D view in words, the Comparison section (with the two-angle report folded in) |
| 4 Levels and parameters | **In progress.** Shipped: `present()`, focus groups and level counts, the report's checks by level and focus; the availability matrix; wrist–elbow specified and off. Not yet: body measurements used; identify-without-choice inside the engine (needs real clips: it would be a new way to accept a shot) |
| 5 Reference library | **In progress.** Shipped: `aline.similarity/1` (comparability gate, five parts of the body with coverage, overall unchanged), provenance on every reference, the batter's usual as the fallback reference; the reference tables with rights in Supabase (row-level security: nothing readable without granted, unexpired rights), the library page. Not yet: overlays and PDF with references (nothing to overlay until a reference carries a pose track), the first licensed references (decision 8) |
| 6 Coach workspace | **Shipped 2026-11-14**: squads, the review queue (unreviewed first, then the least clear recordings), the coach's own assessment beside Aline's result, assignments, the player's view of both, history, CSV export; tables with row-level security and an audit trail; a parent's or guardian's agreement before a player under 18 shares with a coach |
| 7–8 | Not started |

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
`lint`, `typecheck`, `test`, `build`, a PR merged after green CI and verified in production
(decision 15), then a report before the next batch.

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

## 16. Decisions

**Taken by the product owner, 2026-11-11**

| # | Decision | Answer |
|---|---|---|
| 1 | Replace the sage two-tone rule and the "no moving canvas on a scrolling page" rule | **Yes.** Black and orange; the hero pauses off-screen, stops when idle, still under reduced motion |
| 2 | Daylight (light) theme | **Keep both.** Dark by default; light for outdoor use and the PDF |
| 3 | Level replaces age as the driver of wording | **Level decides.** Age optional; milliseconds only in Professional → Technical details |
| 4 | Reference site not reviewed | **Proceed without it** |
| 5 | Positioning line | "AI-assisted cricket analysis", as in the brief |
| 6 | Hero technology | **Canvas 2D** |
| 7 | "Check your shot" while two shots are graded | **Say it plainly** on the landing |
| 14 | Typeface | **Archivo + Geist** |
| 15 | How batches reach production | **Merge after green CI**, production verified, then report (standing rule 6 stays; this replaces "draft PR, no automatic merge" in the brief and in section 13) |

2026-11-14: the international batters' line stays, labelled; a licence covers what, where and how long;
first players wanted: Virat Kohli and Sachin Tendulkar, not added until their own permission and a usable
recording exist. Still open, none blocks Batch 1: 8 (who asks players and records licences), 9 (left-handers never
flipped: standing rule 7 holds unless changed), 10 ("match %" renamed), 11 (dual-angle through
Supabase: pass-through only, nothing stored, 2026-11-14), 13 (players under 18: a parent's agreement first, 2026-11-14; legal advice for the markets served still to take). 12 (PDF from a print layout): yes, 2026-11-13 ("Continue" after it was proposed).

**As first asked**

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

## Batch 1 as built (2026-11-11)

**Built**: the second design's tokens under `:root[data-ui="2"]` (dark, and daylight on
`data-theme="light"`); Archivo for display; the new landing (`src/app/page.tsx`) with one
primary action, three steps, a sample made by the engine from a generated example, levels,
players and coaches, "what is true today"; the figure (`hero-figure.tsx`, `hero-geometry.ts`)
in Canvas 2D over a server-drawn still; navigation says "Check your shot" (one link instead of
two per-shot ones). No file under `src/engine` changed; verdicts and reasons are identical on
the 156 golden cases.

**Measured**, production build, phone width, 4× CPU slowdown:

| | Before | After | Budget |
|---|---|---|---|
| Largest paint | 0.44 s | 0.21 s | ≤ 0.8 s |
| JavaScript | 305 KB | 216 KB | ≤ 305 KB |
| All bytes | 539 KB | 494 KB | — |
| Blocking time | 180 ms | 131 ms | ≤ 200 ms |
| Layout shift | 0 | 0 | ≤ 0.02 |
| Targets under 44 px | 6 | 0 | 0 |
| Frames drawn off-screen / under reduced motion | — | 0 / 0 | 0 |

Two things found on the way: the page-entry fade started every page fully transparent, which
delayed first content to about 1 s on a slow phone and hid the headline from the largest-paint
measure (the landing is exempt now); and link prefetching, not the figure, was what grew the
bundle (only the primary action is prefetched).

**Not done in this batch, though planned for it**: `/science` and `/privacy` copy and the
`/design-system` page are restyled by the tokens but not rewritten; Geist Mono and Caveat are
still loaded (illustrations use them until Batch 3); the first-design intro curtain remains on
`/home`. The figure has no bat or ball: the generated track carries none in 3D, and none was
invented. Levels, reference comparison and squads are described on the landing as in
development, because they are.

**Not verified**: a real phone; Safari and Firefox; a screen reader (structure and tab order
were checked, speech was not).

### The landing figure, changed the same day (owner's feedback)

The first figure was a jointed line figure playing the generated example. The owner, on a real
phone: "nowhere close to what human biomechanics show a cricket shot", then of the idea of a
drawn batter at all: "don't just stick to the TED-Ed thing". Both right. The movement comes from
a scripted, generated example, not from a person, so no way of drawing limbs makes its arms
move like a human's; a fuller mannequin was built and discarded for the same reason.

What ships instead is **the line as an instrument** (`instrument()` in `hero-geometry.ts`): a
side elevation to scale (ground, stumps, both feet, bat, ball) and the three things Aline reads
above the front foot, each with the engine's own range, travelling into place as the ball
arrives. It draws only what the engine measured, including the example's fault (head behind
the line, the same finding as the sample report). No person is depicted.

**Still the better hero, and not possible yet**: a real clip of a real batter with the engine's
real overlay. It needs one clip the owner has the rights to.

## Batch 2, first part, as built (2026-11-11)

- `/check` is the way in ("Check your shot"); `/analyse` still works for older links.
- Capture terms: Upload a video (Movement analysis), Per-frame form check, Record a shot,
  Dual-angle capture.
- **Analysis level** (`components/capture/analysis-options.tsx`, `LocalProfile.level`): Beginner,
  Amateur, Professional. It decides the report's wording now (`readingLevel(ageBand, level)`):
  the same sample reads "Get your head over your front foot" at Beginner and adds the value
  and its target at Professional. Age only stands in when no level is chosen. Nothing measured
  changes.
- **Focus areas**: eight, optional, saved with the profile and with each analysis
  (`StoredAnalysis.session`). They do not reorder the report yet, and the screen says so.
- Not touched: `src/engine` apart from `readingLevel`'s extra argument (wording only).

**The landing hero** stays the instrument view. A human figure driven by a real batter's pose
track was built and not shipped (it read as a mannequin). The owner pointed to a YouTube video
and to professionals' defences as reference; neither could be opened from the session (no
access to video sites), and no video file was in the session's storage. Open: needs a clip
file, or screenshots of the reference, sent in the chat.

## Batch 2, second part, as built (2026-11-11)

- **Capture-position guide** (`components/capture/pitch-guide.tsx`): a plan of the pitch drawn to
  scale, with the two camera positions Aline reads (side-on, 6–8 m square of the crease; straight
  behind the bowler's stumps), what each must keep in the picture, and where not to film from.
  Static guidance: it uses no camera or sensors. It replaces the old placement diagram on the
  check screen and on `/guide`.
- **Body measurements** (`LocalProfile.body`, Profile page): arm span, shoulder width, upper arm,
  forearm, leg length. All optional, each "not provided" until given, kept on the device, with
  why each would help. **Not used in the analysis yet**, and the page says so (Batch 4).
- The analysis level can also be set from the Profile page.


## The landing, changed again (2026-11-11, owner's feedback)

"UI feel should be similar to cricshot… the illustration is still bad… similar to this YouTube
video where every arm action is clearly understandable with movement."

- **Feel**: cricshot's (sentence-case headline with one accented word, a pill label, pill
  buttons, a row of plain numbers, rounded panels) in the colours decided in section 16. This
  replaces "lanes, not cards" and the wide scoreboard display type of section 4; orange is still
  never a surface. Pill buttons and the display type apply app-wide (two CSS rules under
  `[data-ui="2"]`); the other pages are otherwise unchanged.
- **Hero**: a line drawing of a batter (`batter-art.ts`) instead of the instrument view, which
  moved down beside the sample result. Key poses drawn by hand (stance, backlift, mid-stride,
  hands down, plant, contact), joined by a monotone cubic so planted feet stay planted; kit
  drawn as outlined silhouettes that hide what is behind them; both hands on the handle by
  construction. Canvas 2D (`Path2D`) over a server-drawn SVG still; four moments to stop on.
- **Honest limits**: it is an illustration and labelled as one. It is not traced from footage,
  so it has the clean look of a diagram, not the hand-drawn look of the reference. One batter,
  right-handed; a left-hander's own drawing is not made yet (it must be drawn, not mirrored).

Measured, production build, phone width, 4× CPU slowdown: largest paint 0.23 s, blocking
160 ms, JavaScript 222 KB, all bytes 507 KB, layout shift 0, targets under 44 px 0, frames
drawn off-screen, while held on a moment, or under reduced motion 0.

## Batch 2, third part, as built (2026-11-12)

- **Line up the camera** (`components/capture/camera-line-up.tsx`, `lib/capture/line-up.ts`,
  `tests/line-up.test.ts`): a full-screen dialog from "Check your shot". The phone's live
  picture with a frame for the batter and a line for the feet; what the picture shows, read by
  the same pose model the analysis uses (whole batter in the picture, a usable size, one person,
  phone turned the right way for the chosen camera position); a level from gravity
  (`devicemotion`), in portrait or landscape. "Record now" then opens the phone's own camera:
  a web page records at a lower frame rate and quality than the camera app, and the analysis
  needs the better recording, so the overlay lines the phone up and the camera app records.
- **Degrades**: no camera or permission refused → the same frame and the written steps; no
  tilt sensor → it says so; iPhones ask before giving motion ("Turn on the level"); the pose
  model failing to load → the frame only.
- Guidance, not a gate: the recording is still checked before it is analysed. Its sizes are the
  capture guide's words, not engine thresholds. Nothing is recorded, saved or sent.
- The old small framing check under "How to film" (first design, a stick figure) is removed.

**Not verified**: a real phone's camera and motion sensor (tested with Chromium's stand-in
camera and injected motion readings), iOS Safari's motion permission, a screen reader.

## Batch 2, fourth part, as built (2026-11-12)

- **One entry without choosing the shot** (`src/engine/identify.ts`, `shot-chooser.tsx`):
  "Which shot?" is optional; "Aline tells" is the default. `analyzeUnchosen` runs the front-foot
  analysis and, only when its result points to the other shot (`pointsTo`: "looks like a
  back-foot defence", or named one), that shot's analysis on the same tracks. A result that is
  accepted when asked is never changed; a shot neither analysis accepts is not accepted
  (`tests/identify.test.ts`: fixtures, the evaluation set, the population, the real tracks).
  The report's own switch now reads the same rule. `StoredAnalysis.session.intended` records
  what the batter named (null: left to Aline). Section 9's fuller version (each category's gate
  tried in the engine) stays in Batch 4.
- **Wording**: an unconfirmed result for an unnamed shot says "Aline can't tell which shot this
  is" / "Aline doesn't grade this shot yet" (`plainSummary`, `unchosen`).
- **Dual-angle session** (`two-videos.tsx`, `DualPlan` in `pitch-guide.tsx`): the steps, a plan
  with both phones, the two slots, "Record here" (the line-up screen opened for that position).
  No live pairing: said on the screen.
- **Capture flow**: `flow-helpers.ts` (types, limits, video helpers) and `shot-chooser.tsx`
  moved out of `capture-flow.tsx` (1,936 → 1,680 lines). The processing state machine is not
  split.

**Not verified**: real clips through the new default (none available); the limit noted in
`docs/context.md` for a back-foot stroke in a long clip when no shot is named.

## Batch 3, first part, as built (2026-11-13)

- **Six sections** (`report-view.tsx`): the Summary card, then a row of five sections
  (`SectionTabs`), none open to begin with; opening one draws it and brings it into view, tapping
  it again closes it. Evidence: the full verdict, key checks, the line, the back-foot panel, the
  evidence viewer, the delivery, the position check, ungraded observations. Training: the
  lesson, the plan, the written report. Comparison: the match with other profiles. Progress
  (new, `ProgressSection`): each measure against the batter's own baseline, changed ones first,
  in words; numbers only above the simple reading level. Technical details: how sure each part
  is, the domains, every measure, why this result, capture checks, limits, versions.
- The blocks themselves are unchanged; only their place is. The "Details" switch remains on
  the two-angle report (`angles-report.tsx`) until that folds into Comparison.
- Checked on five sample reports (accepted, another shot, unreadable, no bat, photo): every
  section opens and closes, no page errors, no control under 44 px in the section row, no
  sideways scroll; "Show me" on a measure opens Evidence at its frame.

## Batch 3, second part, as built (2026-11-13)

- **Print layout** (`components/report/print-report.tsx`; routes `/report/[id]/print` via
  `local-print.tsx`, and `/sample/[key]/print`): outside the app shell, daylight theme set
  before anything draws, A4 print styles (`globals.css`, `@media print`). The report's "PDF"
  button links to it; the jsPDF text PDF stays as "Simple PDF" (and where no print page exists).
- **Frames**: the three moments (backlift, foot down, contact; a photo's one position), each the
  kept picture cropped to the batter, the tracked body (dotted where unsure) and the line in the
  accent; a ring on the plan's own part when it is a line part out of its range
  (`line_head`/`line_shoulder`/`line_knee`), its words under the picture. Without a kept picture:
  the body drawn on paper, and it says so. Pictures are JPEG (a real clip's PDF: 317 KB).
- **Greyscale**: every state is a word or a mark ("Good:", "Fix:", "!" on out-of-range checks,
  the dashed ring).

**Not verified**: a phone's own "Save as PDF" (tested with Chromium's PDF output); the account
copy of a report (the cloud path is wired, not exercised).

## Batch 3, third part, as built (2026-11-13)

- **Landmark figures** (`components/lesson/figure.tsx`, `LandmarkFigure`): the lesson draws the
  batter as tracked, points and bones only. `figurePose` now carries each point's tracker
  confidence (`FigurePose.seen`, 0 where it placed a point by guess); a bone is drawn when both
  ends were seen (≥ 0.2), solid from 0.5, faint and dotted below; the bat only where tracked.
  The filled silhouette and its helpers are deleted (369 → 100 lines). Acceptance criterion 3's
  "nothing drawn for unseen joints" holds for the lesson (`tests/landmark-figure.test.ts`).
- The lesson's numbers use the report's everyday wording (`friendlyValue`, `friendlyRange`),
  which never shows a minus sign, and are left out at the simple reading level.
- Caveat (the lesson labels' hand lettering) is still loaded; Geist Mono still sets
  `--font-mono`. Dropping them is a separate change.

## Batch 3, fourth part, as built (2026-11-13)

- **One drawing rule** (`lib/viz.ts`: `SEEN_MIN` 0.2, `SURE_MIN` = `tracking.joint_min_conf`):
  not drawn below `SEEN_MIN`, faint and dotted below `SURE_MIN`, solid above. Used by the 2D
  evidence viewer (which drew every point before), the lesson and the print layout. The 3D view
  already leaves out points under the engine's cut-off (`buildScene`) and keeps gaps as gaps.
  Acceptance criterion 3 ("nothing drawn for unseen joints") now holds in every view.
- **Text alternative for 3D** (`SceneInWords` in `evidence-viewer.tsx`): a table, per moment of
  the shot, of which parts, bat and ball were seen. Shown under the 3D and Compare views.
- Not done, and not needed for the criterion: the viewers were not rebuilt from scratch on the
  result contract; the evidence viewer already reads it for its timeline.

## The landing batter, traced from a real clip (2026-11-13)

The owner sent their clips. The hero is now a tracing of the side-on front-foot defence
(`scripts/trace/`, `public/art/front-foot-defence.json`, `src/lib/traced-batter.ts`,
`components/landing/batter-figure.tsx`): 41 frames stored as filled shapes, fetched when the
page is idle; the contact frame is the server-drawn still. Same rules as before: nothing drawn
off-screen, in a hidden tab, while held or once left alone; stills only under reduced motion.
The caption says what it is and what Aline read on that clip. Measured (production build, phone
width, 4× slowdown): largest paint 0.20 s, blocking 130 ms, JavaScript 222 KB, all bytes
575 KB, layout shift 0. The section below is what it replaced.

## The landing batter is still not right (2026-11-12, owner's feedback)

"Still TED-Ed style… not conveying the motion of a human." Agreed: key poses with smooth
in-betweens move like a diagram. The reference is traced frame by frame from film. Plan: trace
real footage (a clip the owner sends, or a freely licensed one) into line art, per frame, and
replace `batter-art.ts`' poses with it. Blocked on the footage; see `docs/context.md`.


## Batch 3, fifth part, as built (2026-11-14)

- **Comparison section** (`compare-panel.tsx`, `side-by-side.tsx`, `lib/compare.ts`):
  - every reference says whether it is comparable ("Same camera position · n measures in
    common") or why not and what would make it so; non-comparable ones stay listed;
  - a match opens on a breakdown by part of the body (`domainsOf`: the line, timing, footwork
    and base, balance, hands and bat), each with the measures it rests on or "Not compared";
    words instead of numbers at the simple reading level; the measure table in everyday units;
  - **side by side** at three matched moments (each clip's own events), points and bones only,
    against the last attempt (same position and hand) or the generated textbook defence
    (labelled an illustration).
- **Two-angle report folded in**: each clip's Comparison shows the combined answer and each
  check (`BothAngles`, `AngleChecks` in `angles-report.tsx`); `/angles` stays, with an "Each
  check" button instead of the Details switch, which is deleted.
- Per-part scores are a presentation of the existing match, not the planned
  `aline.similarity/1` (Batch 5): no confidence per part beyond the count of measures.
- Checked: samples (accepted, no bat, another shot, back-foot), the owner's real side-on clip
  against an earlier attempt, a two-clip pair (different balls: "Not combined"); no sideways
  scroll, no page errors. Not verified: a real same-ball pair; a real phone.

## Batch 4, first part, as built (2026-11-14)

- **`present(payload, level, focus) → ReportModel`** (`src/engine/present.ts`, `aline.report-model/1`):
  pure; the analysis never reads the level or the focus. It lists only measured checks: the
  engine's own priorities first (always, whatever the focus), then the chosen focus areas
  (faults first), then the rest in the category's order. Beginner up to 7 checks, Amateur up to
  14, Professional all; the rest are "n more checks in Technical details", one tap away.
- **Category specs** carry `presentation` (`category.ts`): the measures of each focus area, the
  order of importance, the level counts (5–7, 10–14). Presentation only; the category versions
  are unchanged because no phase, policy or wording changed.
- **Report**: "Your checks" follows the analysis's saved level and focus (else the profile's),
  tags the focus checks, and names a chosen focus the clip had nothing to measure for.
- **Tests** (`tests/present.test.ts`): on every fixture asked as both defences, 60 population
  cases and the real tracks, at each level and every focus choice: only measured checks, each
  once, inside the level's count, the priorities never hidden, the payload untouched. The
  stored payload is identical on all 156 golden cases before and after.
- The words of a check still follow the reading level as before (Beginner: no numbers).

## Batch 4, second part, as built (2026-11-14)

- **Availability matrix** (`src/engine/availability.ts`): for a shot and a set-up (video or
  photo, camera position, bat, ball, frame rate, scale, depth), every measure as graded, shown
  (taken, not graded) or not available with what would make it available. The rules mirror the
  analysis (`computeMetrics`' prerequisites, `withholdAlongPitch`, `FRONTAL_UNGRADED`,
  `backFootMetrics`' view and photo rules). `tests/availability.test.ts` holds them to it: on
  every fixture asked as both defences, 60 population cases and the real tracks, no measure the
  analysis took is ever called unavailable. On the Science page ("Which measures a recording can
  give"), for four set-ups, each defence behind its own disclosure.
- **Wrist and elbow together** (`src/engine/provisional.ts`): rationale (a hypothesis for a
  coach to check), phases, landmarks, view, formula, uncertainty and what must happen before it
  is turned on. Off: no file of the analysis reads it, it is in no analysis, it adds no
  threshold (`tests/provisional.test.ts`). Shown on the Science page as "Off".
- Not done, and why: **identify without a choice inside the engine** (each category's gate
  tried, at most one accepted) would accept a back-foot defence where the front-foot result
  doesn't point to it: a new way to accept a shot, which needs real clips first (standing rules
  1 and 3). **Body measurements** are still not used: using them changes measures, which needs
  the same.

## Batch 5, first part, as built (2026-11-14)

- **`aline.similarity/1`** (`src/engine/similarity.ts`): `{ comparable, reasons[], domains, overall, match }`.
  Comparable only for the same shot, the same signature version, the same kind of camera
  position, and at least three measures in common; otherwise no score at all, only the reasons
  and what would make the two comparable. Five parts of the body (the line, timing, footwork
  and base, balance, hands and bat), each with its score and its confidence: the share of the
  part's measures both shots carry (Timing also counts the line's path). The overall score is
  the existing match, unchanged. Left-handers are compared in the signature's frame; no
  recording is flipped.
- **Provenance on every reference** (`lib/compare.ts`, `PROVENANCE`): yours, made from yours,
  generated by Aline (the textbook), shared by a player (numbers only), or a research dataset
  whose licence for use as a reference is not yet confirmed (the international batters' line,
  KU CricShot medians). Shown under each reference.
- **Your usual** (`usualSignature`): the median of the batter's earlier shots filmed the same
  way (three or more), listed first under "Your other shots": the fallback reference when no
  other is comparable.
- Replaces `domainsOf` / `notComparable` in `lib/compare.ts`; `tests/similarity.test.ts`
  (no score across views, shots, versions or with too few measures, including every pair of
  the population filmed different ways; medians; provenance).
- Open, for the owner: the international batters' line is derived from a research dataset
  whose licence for use as a reference hasn't been checked (section 10). It stays, labelled so.

## Batch 5, second part, as built (2026-11-14)

- **Reference tables** (`supabase/migrations/20261114000100_reference_library.sql`, applied):
  `reference_athletes` (generated, coach model, licensed athlete), `reference_shots` (a
  signature, its source, rights status, permitted uses, licence record, expiry, visibility) and
  `reference_assets` (pictures, pose tracks; their own rights). Row-level security: a shot is
  readable only when public and its rights are granted, unexpired and permit comparison; an
  athlete only with a readable shot; an asset only with its own rights to show pictures and a
  readable shot. Granted rights need a licence record. Only site admins write. Checked on a
  local Postgres as anon, a player and an admin, including expiry, revocation and an asset whose
  shot isn't readable (`scripts/db/check-rls.sh`, `reference-rls.sql`); on production as anon:
  0 rows, no write access. The tables start empty.
- **Library page** (`/library`, `components/library/library-page.tsx`; in the menu): yours
  (your usual per camera position), made by Aline and from research, licensed references (from
  the tables; "None yet", or "couldn't be reached" after 8 s), each with what it covers, how many
  measures it carries and its provenance. The report's Comparison links to it and lists library
  references beside the built-in ones, with their recorded rights.
- Not done: overlays and the PDF with a reference (no reference carries a pose track or picture
  yet); adding references (an admin tool) waits on the first licence (decision 8).

## Batch 5, third part, as built (2026-11-14)

- **Record a permission** (`/library/manage`, `components/library/manage-references.tsx`; a
  button on `/library` for site admins only): a player's or a coach's reference with its
  permission. What (numbers, pictures), where (comparisons in the app, the PDF), how long (a
  date or "no end date"), and the signed agreement. Unsigned, it is saved and shown to no one;
  signed, it is public and in the library at once. The shot is one of the admin's own analyses
  on the device (the player's clip analysed in Aline: its numbers are shared, never the video).
  Recorded references are listed with their state (in the library, waiting, ended, withdrawn)
  and can be withdrawn, which hides them for everyone at once.
- Checks: the database refuses anyone but a site admin (local check) and accepts an admin's
  write on production (inside a transaction, rolled back); the form tested in a browser with
  the network faked as an admin: every required field, the licence asked only when signed, the
  rows it sends (status, uses, expiry, visibility), withdrawal.

## Batch 6, first part, as built (2026-11-14)

- **Tables** (`supabase/migrations/20261114000200_coach_workspace.sql`, applied): `squads`,
  `squad_members`, `coach_assessments` (whether the coach agrees with Aline's result, the main
  focus, notes, reviewed), `assignments` (focus, drill, retest by, an optional library
  reference, status). A coach reads and writes only for players linked to them who consented to
  share (`private.can_view`); a coach can't touch `analyses`, so Aline's result never changes. A
  player reads what their coaches wrote and may only mark an assignment done (a trigger refuses
  any other change). Every insert, change and removal writes the audit log, readable by the
  coach and the player concerned.
- **Checked** on a local Postgres with the real core schema (`scripts/db/check-rls.sh`,
  `coach-rls.sql`): an unlinked player can't be added, assessed or assigned; another coach sees
  nothing; a coach's update of an analysis changes no row and its result hash is unchanged; the
  player marks done but can't change the drill or write an assessment; the audit rows are there;
  after the link is revoked the coach can't assign. A run with the "linked players only" rule
  removed fails, as it should.
- **Coach page** (`components/coach/coach-page.tsx`, `src/lib/coach.ts`): review queue in that
  order with a squad filter; per shot, "your view of Aline's result" (agree, disagree, not sure),
  the main thing to work on, notes, "Save and mark reviewed"; assign a drill and a retest date;
  assignments with cancel; squads (add, add or remove linked players); invite codes; history in
  words; "Export my assessments and assignments" (CSV, every cell quoted, formulas neutralised,
  Aline's result in words).
- **Player** (`components/coach/coach-feedback.tsx`, in the report of an analysis saved to the
  account): "From your coach", labelled as the coach's own view, Aline's result unchanged; the
  assignment with "Mark done".
- Browser checks with the network faked as a coach and as a player (this session can't reach
  Supabase): queue order, every write's rows, the export, the player's view and "Mark done".
- **Open: minors** (decision 13). Today a player under 18 can link a coach with an invite code
  like anyone else; the plan asks for a guardian's consent first, and legal sign-off on how.

## Batch 6, second part, as built (2026-11-14)

- **Players under 18** (decision 13, the owner's answer: "Ask a parent first";
  `supabase/migrations/20261114000300_guardian_consent.sql`, applied): a player whose profile
  is under 18 can't link a coach (`redeem_coach_invite` refuses with
  `guardian_consent_required`), and a linked coach sees nothing of theirs (`private.can_view`),
  until a 'guardian' consent is recorded; withdrawing it hides their reports from coaches at
  once. Profile: under 18, "A parent or guardian agreed to me sharing my reports with this
  coach" must be ticked before "Link coach", and the agreement can be withdrawn from the list
  of consents. No account was affected when it went live (no under-18 profiles or links).
- Checked locally (`scripts/db/guardian-rls.sql`): refused without, allowed with, hidden again
  after withdrawal, including an assessment; in a browser with the network faked: the order of
  the writes (under 18 on the account, the agreement, then the link). Legal advice for the
  markets served is still to be taken.
