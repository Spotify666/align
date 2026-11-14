# What the athlete has asked for

Newest first. Keep their words; say what was done and where. Update this file in the same
change that answers a new ask, so the next session starts from the same page.

## 2026-11-14 · Batch 7: two phones, one ball

- `/check/pair` (from the dual-angle screen): one phone starts and shows a code, the other
  joins; both show the same check number; the phones agree on the time and count down together
  to "Record now". Each checks its own clip; the second sends its result (never video) to the
  first, which puts both angles together only if it is the same ball from two places.
- Not yet tried on two real phones.

## 2026-11-14 · Answers: two phones pass-through only; under 18, a parent agrees first

- Two phones filming the same ball (Batch 7): "Pass-through only": the start signal, clock
  sync and the second phone's numbers go through the server and are never stored; never video.
- Under 18: "Ask a parent first". Built: an under-18 player ticks that a parent or guardian
  agreed before linking a coach; without it the database refuses the link and coaches see
  nothing; unticking it hides their reports from coaches at once.

## 2026-11-14 · Batch 6 begun: the coach workspace

- Coaches: squads, a review queue (not yet reviewed first, then the least clear recordings),
  their own view of each shot beside Aline's result (agree or not, what to work on, notes),
  assignments (drill, check-again date), history and an export. They can never change Aline's
  result, and only see players who linked them and agreed to share.
- Players: "From your coach" in the report (labelled as the coach's view), and "Mark done".
- Open: players under 18 can link a coach today without a guardian's consent; the plan asks
  for one, and how is a legal question (decision 13).

## 2026-11-14 · "Yes build the form": recording a permission

- `/library/manage` (site admins; a button on the library page): name, who they are, batting
  hand, the shot (analysed in Aline), where the recording came from, what may be used, where,
  until when, and the signed agreement. Unsigned: saved, shown to no one. Withdraw hides it at
  once.

## 2026-11-14 · Reference decisions (owner)

- "yeah it should stay": the international batters' line (KU CricShot medians) stays, labelled
  as a research dataset whose licence isn't confirmed.
- A licensed reference's permission covers all three: what (numbers, pictures), where
  (comparisons, PDF) and how long. The tables already hold each (`permitted_use`,
  `rights_expires_at`, `licence_ref`).
- First players wanted: Virat Kohli, Sachin Tendulkar. Not added: their name, image and shots
  need their own permission (through their management), and a recording the owner may use
  (broadcast footage belongs to the boards and broadcasters). Until then they are not shown by
  name; the research line covers international batters, unnamed.

## 2026-11-14 · Batch 5: the reference library

- `/library` (in the menu, and from a report's Comparison): your usual, the references Aline
  makes, the research line, and licensed references.
- Licensed references live in the database with their rights; the database itself hides any
  without granted, unexpired rights. None are in it yet: adding one waits on who signs licences.

## 2026-11-14 · Batch 5 begun: when two shots can be compared, and where each reference comes from

- Two shots get a match only when they are the same shot, filmed the same way, with at least
  three measures in common; otherwise no number, only why and what would fix it.
- Each match has a score per part of the body with how much of that part it rests on.
- Every reference says where it comes from (yours; made by Aline, not a real player; shared by
  a player, numbers only; a research dataset whose licence isn't confirmed yet).
- "Your usual" (the middle of your earlier shots filmed the same way) is always there once you
  have three.
- To decide: the international batters' line comes from the KU CricShot research dataset;
  its licence for use as a reference has not been checked.

## 2026-11-14 · Batch 4: which measures each set-up gives; wrist and elbow, specified and off

- Science page, "Which measures a recording can give": for side-on video, side-on with bat and
  ball at 60 fps, the bowler's end and a side-on photo, every measure of both defences as
  graded, shown or not available, with what would make it available. Checked against the
  analysis itself in the tests.
- "Wrist and elbow together" is written down in full (why, how, what it needs, its
  uncertainty) and stays off until labelled clips and a coach's review exist.
- Waiting on real clips: identifying the shot without a choice inside the engine, and using
  the body measurements from the profile.

## 2026-11-14 · Batch 4 begun: the level and focus decide what the report lists

- The analysis level now decides how many checks "Your checks" lists: Beginner the 7 that
  matter most, Amateur up to 14, Professional every one. The rest are one tap away ("n more
  checks in Technical details"). The words already followed the level.
- Focus areas chosen on the check screen now lead the list (tagged "Your focus"), after the
  engine's own top faults, which are always shown whatever the focus. A focus the clip had
  nothing to measure for is named ("Not measured in this clip: shot outcome").
- `src/engine/present.ts`; nothing measured changes (156 golden cases identical).

## 2026-11-14 · Batch 3 finished: the Comparison section

- **Each match broken down by part of the body** (`domainsOf` in `lib/compare.ts`): the line,
  timing, footwork and base, balance, hands and bat; each the mean likeness of the measures it
  rests on, with how many, or "Not compared" when the two shots share none. At the simple
  reading level, words ("close", "some way off", "far off") instead of numbers.
- **Comparability, said for every reference**: "Same camera position · 11 measures in common",
  or "Not comparable" with the reason and what would make it comparable (`notComparable`).
  References that can't be compared stay listed instead of being hidden.
- **Side by side** (`report/side-by-side.tsx`): backlift, foot down and contact, each found in
  its own clip, drawn from tracked points only (the lesson's rule), against the batter's last
  attempt from the same position and hand, or the textbook defence played by the test
  generator for their hand (labelled an illustration, not a real player). Side-on, confirmed
  front-foot defences.
- **Both angles of one ball** now also show in each clip's report, under Comparison: the
  combined answer and each check with the angle that read it. `/angles` keeps working; its
  "Details" switch is now an "Each check" button like the report's sections.
- The measure table no longer shows minus signs or milliseconds (standing rule 8).
- Not changed: the match itself (`signature.ts`) and anything under `src/engine`. The fuller
  similarity (`aline.similarity/1`, with confidence per part) is Batch 5.
- Not verified: two clips of the same ball (none in the session; tested with two different
  balls, which reads "Not combined"); a real phone.

## 2026-11-13 · Batch 3: one rule for drawing the body; the 3D view in words

- Every picture of the body (the evidence viewer's tracked view, the lesson, the printed
  report; the 3D view already did) now follows one rule (`lib/viz.ts`): a point the tracker
  didn't see (confidence under 0.2) is not drawn at all; an unsure one (under 0.5, the engine's
  own cut-off, so not used in any measure) is faint and dotted; the rest solid. The evidence
  viewer used to draw every point, however unsure.
- Under the 3D view, "The 3D view in words": a table of the shot's moments and whether the head,
  front shoulder, front knee, front foot, hands, bat and ball were seen at each. On the
  athlete's clip: the body seen throughout, bat and ball not seen.
- Not verified: the 3D picture itself in the test browser (it has no graphics card and draws
  black; the 3D code was not changed).

## 2026-11-13 · Batch 3: landmark figures instead of silhouettes

The report's lesson (Training) drew the batter as a filled body, with joints the tracker never
saw put in by guess and a bat always drawn. It now draws only what was tracked: points and
bones, solid where the tracker was sure, faint and dotted where it was unsure, nothing where
it saw nothing; the bat only where it was tracked. The textbook outline stays dashed. The
lesson's numbers are now in everyday words without minus signs ("6% of your height behind ·
aim 3% behind to 16% ahead"), and none at the youngest reading level. Checked on the athlete's
own clip and three samples.

## 2026-11-13 · "Continue": Batch 3, the PDF from a print layout

Taken as a yes to the print-layout PDF (decision 12), which was proposed just before.

- The report's **PDF** button now opens the report laid out for paper (`/report/<id>/print`,
  `/sample/<key>/print`, `components/report/print-report.tsx`): the plain summary, three moments
  of the clip (backlift, foot down, contact) as the recording's own pictures with the tracked
  body and the line drawn on them, the training plan, every check (out-of-range ones marked
  "!"), the report in words, and the limits. Daylight theme, readable in greyscale. "Save as
  PDF or print" uses the phone's own print screen; "Simple PDF" is the old text PDF, kept.
- On the contact frame a ring marks the part the plan asks to fix, only when that fix is a part
  of the line out of its range, with the words under the picture (so the page says what the
  summary says). The athlete's own clip: no ring (its fix is the timing of foot, knee and
  shoulder).
- Checked: the real clip's saved report (3 pages, 317 KB) and four samples (accepted, another
  shot, photo, unreadable), no page errors; the batter's own theme comes back after.

## 2026-11-13 · The athlete sent four clips: the landing batter is now traced from one

Four videos attached in the chat (three different: a side-on front-foot defence, a side-on
back-foot defence, one from the bowler's end in a net; two files are the same clip).

- **The landing batter is traced from the side-on front-foot clip**, frame by frame, the way
  the reference video is: the body's outline from the pose model, the bat found from the hands,
  the borders of skin, shoes, hair and kit inside (`scripts/trace/trace.py`, 41 frames, 70 KB
  compressed, `public/art/front-foot-defence.json`). It plays at under half speed, stops on
  four moments, and shows the line at contact through the joints read on that frame. The clip
  itself is not in the repository. The key-pose drawing (`batter-art.ts`) is deleted.
- Assumed: the clips are the athlete's own to use. Said so to them; a different clip can be
  traced with the same tool.
- **First real-media run of Batch 2's changes**: the three clips through the app with no shot
  named. Side-on front-foot → "This is a front-foot defence"; side-on back-foot → "This is a
  back-foot defence" (the automatic hand-off); bowler's end in the net → "This is a back-foot
  defence". Each in about 20 s on this machine. Three clips, one batter: a check, not a
  validation.

## 2026-11-13 · Batch 3 begun: the report in six sections

"Resume" (continuing "finish the rest"). Shipped, first part of Batch 3:
- The report opens on the **Summary** (unchanged: at most five plain sentences), then five
  sections that stay closed until opened: **Evidence** (what was seen, the line, the frames),
  **Training** (the lesson, the one priority and its drills, the report in words),
  **Comparison** (this shot beside other profiles), **Progress** (this shot against the batter's
  own usual; new), **Technical details** (how sure each part is, every measure, how the result
  was reached, versions). It replaces the single "Details" switch. Nothing a section shows was
  changed, only where it sits; "Show me" on a measure still jumps to its frame in Evidence.
- "% prototype confidence" no longer shows in Evidence (it is in Technical details); a confirmed
  back-foot defence reads "Shot identified: back-foot defence".
- Still to do in Batch 3: landmark figures in place of solid silhouettes, the evidence and 3D
  viewers on the result contract, comparison on fixtures, the PDF from a print layout.

## 2026-11-12 · "Continue with the rest of Batch 2"

Shipped:
- **One way in, without choosing the shot.** "Which shot?" is optional and starts on "Aline
  tells": the recording is checked as a front-foot defence, as before, and when that result
  itself points to the back-foot defence, the same tracks are checked as one, by that shot's
  own gate (`src/engine/identify.ts`). This is the report's "Check as back-foot defence"
  button pressed for the batter: no new rule, no threshold. Measured on generated movement
  (`scripts/eval/unchosen.probe.ts`): front-foot results unchanged (14 of 14, 95 of 120, the
  same as asked); every back-foot defence accepted when asked is reached without asking (11 of
  11, 17 of 17); drives, pulls and cuts accepted: 0 of 282. The three real tracks: unchanged.
  An unconfirmed result for an unnamed shot reads "Aline can't tell which shot this is" or
  "Aline doesn't grade this shot yet", not "This is not a front-foot defence".
- **Dual-angle capture as a session** (`two-videos.tsx`): three steps, a plan of the pitch with
  both phones on it, the two slots, and "Record here" on each, which opens the line-up screen
  for that camera position. The second phone's video is still shared to this phone; linking
  two phones live is Batch 7 and the screen says it isn't built.
- **The capture file split**: its stateless helpers (`flow-helpers.ts`) and the shot chooser
  (`shot-chooser.tsx`) moved out; 1,936 → 1,680 lines. The processing steps themselves are
  still one component: taking that apart safely needs real clips to run end to end.

Not verified: any of this on real clips (none are available here). In particular a back-foot
defence in a long clip with several balls: with no shot named, the stroke is looked for the
front-foot way (the head going down), which can miss a back-foot stroke. Naming the shot
("Back foot") still looks for it the back-foot way.

## 2026-11-12 · "Still TED-Ed style… not conveying the motion of a human"; Batch 2: line up the camera

> I mentioned you to use different illustration style. Why are you still using Ted ed ref style
> for motion, it's not at all conveying the motion of human

Right. The batter shipped on 2026-11-11 is key poses with smooth in-betweens: it moves like an
animated diagram. The reference looks human because it is traced frame by frame from film of a
real batter. That needs real footage; nothing drawn from poses will get there.

- The athlete's earlier videos are not reachable: not in the session, the repo or Supabase
  (storage buckets and tables are empty).
- With the athlete's approval the session may now reach Wikimedia Commons, Pexels and Mixkit
  to find a freely licensed clip. Found on Commons: "Hatfield Heath CC v Potter Street & Church
  Langley CC Video 5 forward defensive on side push shot" (Acabashi, CC BY-SA 4.0, 1080p, 10 s).
  Commons refused the download from this session (too many requests); going around that was
  not done. Pexels refuses automated visits; Mixkit has no batting clip.
- **Open**: the clip itself. Either the Commons download succeeds on a later try, or the
  athlete sends a clip file in the chat (their own nets video is the best source). Then: trace
  it frame by frame into line art and replace the drawn batter. A CC BY-SA source means the
  traced animation carries the author's credit on the page.

Shipped meanwhile (Batch 2): **Line up the camera** (`components/capture/camera-line-up.tsx`,
`lib/capture/line-up.ts`): from "Check your shot", the phone's live picture with a frame for
the batter and a line for the feet, a check of what the picture shows (whole batter, size, one
person, phone turned the right way), and a level from the phone's motion sensor; then "Record
now" opens the phone's own camera. Nothing is recorded or sent from that screen. Without a
camera: the same frame and the written steps. Without a tilt sensor: it says so. It replaces
the small framing check that sat under "How to film".

## 2026-11-11 · "UI feel like cricshot"; a line-art batter where every arm action is clear

> UI feel should be similar to this https://cricshot.vercel.app/ The illustration is still bad
> https://youtu.be/onRylyZ0DX8 Need it similar to this YouTube video where every arm action is
> clearly understandble with movement

Both references were opened this time (a cloud environment "align" now allows those hosts;
cricshot was only looked at, never touched). cricshot: sentence-case headline with one accented
phrase, a small pill label, pill buttons, a row of plain numbers, rounded panels. The video: a
black line drawing of a batter traced from footage (Green Screen Fx); its licence could not be
read, so nothing was taken from it.

Shipped:
- **Feel**: the landing and the controls follow cricshot's feel, in Aline's own black and orange
  (the colours approved the same day): pill buttons app-wide, rounded panels, a friendlier
  display type, "Every shot, explained." with the last word in orange, three plain numbers (17
  body points tracked, 2 shots graded today, 0 videos uploaded). Navy and blue were **not**
  taken; asked the athlete whether they want those too.
- **The batter** (`src/lib/batter-art.ts`, `components/landing/batter-figure.tsx`): a line
  drawing of a kitted batter (helmet, pads, gloves, bat) playing a front-foot defence, seen from
  the off side so both arms and the bat are in view the whole way. It plays slowly and stops on
  four moments (Stance, Backlift, Stride, Contact), each with what the hands, elbows and head are
  doing; the orange line appears at contact. Hands are named by role (top hand, bottom hand).
  It is drawn from hand-made key poses, not traced from a person and not a result, and the
  page says "Illustration" and "Not a recording". `tests/batter-art.test.ts` holds it to a human
  body (bone lengths, planted feet, the bat coming down from behind, the contact position).
- The measured example (the line with the engine's ranges) moved down beside the sample result.

Still open: a figure traced from a real batter (the look of the reference) needs a clip the
athlete has the rights to, sent as a file in the chat.

## 2026-11-11 · Batch 2, second part: where to put the phone; body measurements

Continuing "finish the rest". Shipped: a to-scale plan of the pitch showing both camera
positions (check screen and How it works), and optional body measurements in the Profile (kept
on the device; not used in the analysis yet, and it says so). `docs/13`, "Batch 2, second part".
Next in Batch 2: the camera overlay and the dual-angle session screen.

## 2026-11-11 · References for the human figure; "finish the rest"; Batch 2 begun

> https://youtu.be/onRylyZ0DX8 Something of this sort. Also please keep updating me on where
> are we with shipping complete changes.

> I have uploaded few videos earlier, you can take reference of them. Batsman, you can
> consider Sachin, Virat. Scout from internet for their defence shots and apply the logic. And
> then coach videos I'll upload later. And continue working and finish for the rest.

- The YouTube link and any footage of professionals could not be opened: the session has no
  access to video sites, and the earlier uploads are not in this session's storage (only the
  one screenshot is). Told the athlete; asked for a clip file or screenshots in the chat.
- Professionals' footage: usable as private reference for how a defence moves; showing their
  clips, names or faces on the site needs rights (the athlete's own rule in the redesign brief).
- Batch 2, first part, shipped: `/check`, the new capture terms, the analysis level (changes
  the wording now) and focus areas (saved). `docs/13`, "Batch 2, first part, as built".
- A status table goes in every report from now on.

## 2026-11-11 · A human in the landing figure: asked for, not delivered yet

> Why can't you use human for action and illustration?

> See human illustration playing a cricketing [shot].

Tried: a figure with a body's proportions driven by a real batter's movement (the pose track of
a phone clip at the nets already in `tests/assets/real`, which turned out to be filmed from the
bowler's end). Not shipped: seventeen tracked points and no tracked bat still draw a mannequin,
not a person, and the bat had to be guessed from the hands. The instrument view (PR #48) stays
live. What would work: a real clip or photo the athlete has the rights to (their own, or
licensed stock) shown with Aline's real overlay, or a finished illustration or animation from an
illustrator. Waiting on the athlete for one of those.

## 2026-11-11 · The landing figure: not a drawn batter

> This illustration is nowhere close to what human biomechanics show a cricket shot. It looks
> like a dud just swinging across lines.

> The hands body movement of illustration is nowhere close to human. It's poor. Make sure you
> do it differently. Don't just stick to Ted Ed thing. Choose the best one.

Found: the movement is a scripted, generated example, not a person, so no drawing of limbs can
make it look human. Done: the figure is now the line as an instrument (side elevation to scale:
stumps, feet, bat, ball; head, front shoulder and front knee against the engine's own ranges;
the orange line joining them), showing what the engine measured, including that example's
fault. No person is drawn. Open: the better hero is a real clip with the real overlay, which
needs one clip the athlete has the rights to.

## 2026-11-11 · Redesign Batch 1: the new look and the landing page (live)

Decisions taken in the pop-ups: replace the sage design with black and orange and a moving
figure; keep a daylight theme; Canvas 2D; say plainly that two shots are graded; Archivo +
Geist; proceed without the reference site; **merge after green CI**; level, not age, decides
wording (Batch 2 onward). Then: "Approve, start Batch 1".

Done: `docs/13`, "Batch 1 as built". The landing: "Every shot, explained.", one action (Check
your shot), the figure drawn from the engine's own track with the orange line, three steps, a
sample made by the engine, what is true today. The whole app takes the new colours; navigation
says "Check your shot". Faster than before on a slow phone (largest paint 0.44 → 0.21 s,
JavaScript 305 → 216 KB). Analysis untouched.

Open: Batch 2 (the check flow, levels, focus areas, capture guidance) has not started.

## 2026-11-11 · Redesign: master plan (Phase 0), approved the same day

> Plan and execute a substantial phased redesign of Aline … First produce a complete master
> plan … Do not begin Batch 1 until the Phase 0 plan is complete and explicitly approved.

Done: `docs/13-redesign-master-plan.md` (audit with measured baseline, information
architecture, the "line" visual direction in black and orange, hero approach, components,
terminology, flows, data changes, risks, eight batches with acceptance criteria, Batch 1 scope,
fifteen decisions for the owner). No code changed. Not done: the reference site
(`pitchwolf.ai`) could not be opened from the session, so it was not reviewed; none of the six
named design skills is installed. Batch 1 has not started.

The brief contradicts standing rules (sage two-tone design, no moving canvas on a scrolling
page, wording by age, "ship it"): listed as decisions 1, 3 and 15 in the plan, not assumed.

## 2026-11-10 · The gaps: what could be fixed without real clips, and what could not

> work on these changes [the seven gaps] … commit and push

Done (engine 0.9.0, pushed, **not live**; `docs/12`, "Engine 0.9.0"):
- **Moment detectors on one noisy frame; limits outside the registry**: Trigger and Back foot are
  now placed where the foot keeps moving for 80 ms. Worst-case error on generated clips 409 → 67
  ms and 288 → 50 ms; the same or within a frame on the three real tracks. All ten inline
  limits in `events.ts` are registered with reasons, values unchanged. Nothing a batter is told
  changes (tested). Plant was tried the same way and made worse on real tracks, so it was left.
- **Back-foot defence from the bowler's end**: the generated set can't stand in for that view
  (its limit was set on real footage); marked so. Not an engine gap on the evidence there is.

- **Contact**: tried withholding a grade whenever it would change with Contact a moment earlier
  or later. It cut body-only acceptance from 95% to 0–50% on the project's own gates, so it was
  reverted. Instead the report says "Answer steady: yes / borderline" (Details, How sure each
  part is), which changes no result.
- The timeline's notes no longer show milliseconds (seconds, per the standing rule).

> yes, work on the gaps, fix and make them live

Made live (engine 0.9.0, registry `18d0cc2bd491fd17` applied to Supabase).

Still open, because each needs real clips or a model, not code alone: Contact (it decides the
verdict), automatic bat and ball, slow motion, validation and calibration, more shots.

## 2026-11-10 · Made live at the athlete's request

> push changes and make it live on vecel

Shipped (PR #45): the category specs, the result contract, the evidence timeline and "How sure
each part is" in the report, loading screens that say what is loading, the real engine version in
the footer, the gate against one-clip fixes, and the real-clip dataset tools. Verdicts and
measures are unchanged (byte-identical on 156 fixture cases; engine 0.8.5, registry unchanged).
Shipped without the real-media matrix: no real clips were available, and the athlete was told so.
Still open: the detectors themselves (Contact first), which need 20–30 labelled real clips.

## 2026-11-10 · Phase 2 groundwork: measure first, a real-clip dataset, no detector change yet

> Continue with Phase 2: real-media detector hardening. […] If real clips are not yet available,
> stop after implementing the manifest, label tooling, evaluation runner and performance
> instrumentation. Do not tune the detectors using synthetic fixtures alone.

No labelled real clips were available, so it stops there. Found and
built (`docs/12-engine-architecture.md`, "Phase 2 groundwork"):
- **Contact is the keystone**: every measure at contact, 15 classifier features and the verdict
  move with it (25 ms is enough); Trigger, Plant, Follow and Back foot change nothing but the
  marker. On a real body-only track the verdict flips inside Contact's own uncertainty.
- **12 of 14**: two back-foot abstentions (body-only Contact 100 ms early reads as "not a dead
  bat"; from the bowler's end the feet read a stride apart). Neither is a wrong grade.
- **Cost**: the contract re-reads stored tracks (no pose, bat or ball inference again): 5 ms for
  a 2 s clip, 20–70 ms on a throttled phone, once per report.
- **Older saved sessions** open with the new contract (tested); PDFs and progress are unchanged.
- **Real-clip dataset**: label page (`scripts/eval/label.html`), `dataset.mjs`, a manifest with
  anonymised ids and hashes (clips never committed), per-slice and leave-one-athlete-out
  evaluation, and a gate that says accept / reject / not enough data
  (`scripts/eval/dataset/README.md`).

Needed from the athlete: 20–30 clips from at least 3 batters, labelled with the page.

## 2026-11-10 · One engine for every clip: a gate against one-video fixes

> The analysis is behaving differently across uploaded videos. Thresholds or logic are being
> tuned to make one video work, but the resulting fix does not generalize. This is the core
> problem to solve.

Found (measured on generated movement, `docs/12-engine-architecture.md`): no clip-specific code;
mirroring, resizing and moving timestamps change nothing (70/70). What moves between two
recordings of one movement is the markers and the reason given: Trigger fires on one noisy frame
and moved by up to 0.4 s between 120 and 60 fps while claiming 75%; Contact and Follow shared a
frame with no reason; nothing stopped a one-clip fix. Graded / not graded never flipped.

Done, on the branch (the stored result is byte-identical on all 156 fixture cases; engine
version unchanged):
- **Category specs** (`src/engine/category.ts`): each defence's phases, order, views, measures,
  acceptance thresholds by name, and why it wasn't confirmed, in one versioned place.
- **A typed result** (`src/engine/result.ts`): accepted / another shot / unknown / fits more than
  one / not enough seen / recording failed; every moment as seen, estimated, marked by you or
  not found, with how sure its timing is (including how far it moves when the clip is read
  again at half its frame rate); each measure tied to its moments and frames; what wasn't
  claimed; confidence per layer, no single number.
- **The timeline** (report, Details): markers with a bar for how sure the timing is, the reason
  two moments share a frame, arrow keys between markers, 44 px targets, reduced motion.
  "How sure each part is" under Every measure.
- **The gate** (`tests/metamorphic.test.ts`, `tests/baselines/metamorphic.json`): the same
  movement as a mirrored, resized, re-timed, half-rate, variable-rate and evidence-missing
  recording must agree; what doesn't yet hold is listed and may only shrink.
- Loading screens say what is loading and offer a reload if it stalls; the footer shows the real
  engine version.

Not done (said plainly): the detectors themselves, report sections, progress charts, landing copy.

## 2026-11-09 · The Visitors page in plain words; the athlete's clips kept as a test set

> Visitors page is not clear for understanding.

Done (`src/components/visitors.tsx`): a line on who counts (one person is one phone or
computer; bots aren't counted); the totals as a labelled table (people, visits, typical visit ×
today, 7 days, 30 days); then the last 30 days in sections with plain names: analyses started and
their results by shot ("Back-foot defence: scored 18 · couldn't tell the shot 6 · another
shot 2"), why analyses stopped, where people came from (country names, devices, systems,
browsers), pages by name ("A report", not `/report/…`), and the buttons tapped most by their own
words (the smaller line under a button no longer runs into its name; the same button counted
once). On the owner's private link each visit is a card (date and time, time spent, place,
device, pages and actions, came before) that opens into its steps, instead of an 11-column table.

> I asked you to not fix only case specific to one video. Logic should remain same for multiple
> ranges. Why am I re-uploading everything and even then testing doesn't work for real world
> scenarios? I don't get the point of me spoon feeding everything here.

- Every two-angle clip the athlete sent is kept as one labelled set
  (`scripts/eval/athlete-pairs.example.json`: which pairs are one ball; media outside the repo)
  and `scripts/eval/pairs.mjs` runs each pair through the real two-video flow on both pose paths.
  The live build: 8 of 10 right; their front-foot pair (one ball) is refused on both paths.
- `scripts/eval/twoangles.probe.ts` tests the two-video checks across ranges (real 3D batting
  through two virtual phones: camera positions, distances, 15–60 fps, clip starts and lengths,
  shot speed, pose jitter, lost wrists; one ball vs two balls vs two shots). It showed the
  same-ball check by movement is not range-proof: anchored to each camera's own reading of the
  shot moment it misses true pairs (that reading is 0.3–1.5 s off across ranges); searched
  freely it accepts different shots (the athlete's own mismatched pair 0.975); head and hips
  are too noisy from the front. The case-tuned change (compare only around the shot) was taken
  out, not shipped. Proposed instead (waiting on the athlete): clear match → combine; clear
  mismatch → refuse with the reason; anything between → "can't confirm" and the batter decides.

## 2026-11-09 · The same ball, told by the movement (two-video option)

> Report still says it's not the same ball, why? Actually it's the same ball played in 2 angles.
> The place setup is also same, you can analyse the biomechanics instead of focusing on grass and
> surroundings. Yeah test and make the changes.

Found: the athlete was right. Compared by the movement, their side video (WA0003) and front video
(WA00041) line up as one ball: the hands' height over time follows the same course in both (0.98)
once the front video is shifted 1.13–1.15 s, and their set positions are 1.32 s apart. The sound
did not confirm it (0.12): the front phone, at the bowler's end, hears the bat faintly and the
messaging app compresses the sound, so sound alone wrongly refused them.

Done, for the two-video option only (engine 0.8.5; the report's "Add the other angle" link and the
one-video flow are unchanged, checked end to end):
- **The same ball by movement** (`handsHeight`, `movementAgreement`, `sameBallTwoVideos` in
  `src/engine/same-ball.ts`): the hands' height above the feet, as a share of the batter's height
  (vertical in the picture, so read alike from the side and the front), must follow the same course
  in both videos (0.95 or closer) near the offset their shots give (within 0.4 s), over at least
  1.5 s. Clear sound still confirms on its own; sound alone no longer refuses. Neither: "Not the same
  ball", saying the movement doesn't line up.
- **Evidence** (`scripts/eval/motion.probe.ts`): the athlete's pair 0.98 on every pose path; their
  front-foot stride (WA00021) against the same front video −0.51 (refused); international defences
  in 3D seen from the side and the front, one ball: 85% reach 0.95; two different balls of the same
  kind: 5%. Movement can't tell apart two balls played identically; that is the known limit.
- End to end: the athlete's pair now combines (both pose paths); the stride pair is refused; a
  refused second video retried with the right one combines.

## 2026-11-09 · Two angles: the front video "not detected"; the option gone after a refusal

> I have uploaded the right side angle and front angle videos but it's not detecting. And also
> after one processing when I go back, the upload 2 videos option is missing. Again on hard
> refresh it's visible. Make sure these changes are only for the 2 video option. Do not change
> other flows.

Found (from their screen recording): the front video's step read "Camera position: Bowler's end",
so Aline had the angle right, but refused it as "Camera angle not detected". The guess counts as
sure only when the body's depth is at least 1.6× its width; this clip reads 1.57–1.63 (right on
the line) and fell just under it on the phone, although the head faced the camera by 11–21 cm in
every frame. After that refusal the screen kept the first video as "the other angle" of a ball,
which hid the two-video option until the page was reloaded.

Done, for the two-video option only (engine 0.8.4; the one-video flow and the report's "Add the
other angle" link are unchanged, checked end to end):
- **Its own angle check** (`twoAngleView` in `src/lib/capture/view-guess.ts`): from the bowler's
  end, a sure guess as before, or depth at least 1.4× width when the head clearly faces the camera
  (8 cm or more) and the front side is clearly the nearer one. Measured on 642 international shots
  per camera position through virtual cameras round the batter (`scripts/eval/view.probe.ts`):
  straight on 99% accepted, 10–20° off 83–99%; 35° off 6% and 40° 2% (the sure guess alone: 5%
  and 1%); 45° and wider never; behind never. Side-on is unchanged (sure only). Both limits in
  the registry with this evidence.
- **A refused second video goes back to the two slots**: the first video stays, shown as
  "Checked", and only the other angle is chosen again ("Check the front video" analyses just
  that one). "Start again" clears both.
- **The athlete's clips**: with the fix both angles are read on both pose paths. Their two
  videos are then refused as "Not the same ball", correctly: the side video (WA00021) is
  outdoors on grass with a long front-foot stride, the front video (WA00041) in indoor nets, a
  back-foot defence; their sounds match nowhere (best 0.21 at any offset; one ball on two
  phones reads 0.4–0.99). The option needs one ball filmed by two phones at the same time.

## 2026-11-08 · Two videos at most, said up front; a third can't be chosen

> Why is there no disclaimer of max 2 video uploads (only works for the same video shot in side
> angle and front angle)? Also the user should not be able to choose the 3rd video at all. I am
> still able to choose; only after that I see 3 videos are not acceptable. Why waste the user's
> time instead of clearly communicating it?

Done (no engine change):
- **No video picker takes more than one video.** "Choose a video" takes 1 video (it says so);
  two videos only through "Two angles of one ball", whose Side and Front slots take exactly one
  each. So a third video can't be picked at all (a phone picker can't be told "at most 2", so
  none of them offers several). Photos still take up to 12.
- **The limit is said before anything is chosen**: "2 videos max: the same ball, filmed from the
  side and the front at the same time" on the option itself, and "2 videos only: the same ball,
  filmed at the same time, one from the side and one from the front" when it opens.
- On a computer, two videos dropped together go into the two slots (seen before they start);
  three or more are refused at once, with the same rule.

## 2026-11-08 · A smooth opening; two videos chosen one by one, both shown

> Slatted door effect also feels buggy, it's not smooth. Make sure it's a premium feel at the
> time of rendering. Also selection of 2 videos is not showing clearly for the user: it shows
> 1 video selected but only chooses one and confuses the user whether he selected that video
> or not.

Done (no engine change):
- **The opening** (`landing/intro.tsx`, `globals.css`): it was not the curtain itself but two
  faults around it. The page's fade-in ran under the curtain, so the screen showed the page,
  then grey, then black. Now the curtain is black from the first frame. A perspective on the
  whole curtain left each turned slat as a thin black sliver until it vanished at once. Now each
  slat turns on its own axis to exactly edge-on and fades in its last moment. The sweep gathers
  pace across the screen. Still transform and opacity only, on the compositor.
- **Two angles of one ball** (`capture/two-videos.tsx`): its own option on the Add screen, with a
  slot for the side video and one for the front video. Each slot is chosen on its own, so it
  doesn't depend on the phone's picker taking two files (on many phones a tap takes one and
  closes). Each chosen video shows straight away with a still, its name, length and a tick;
  "1 of 2 chosen. Now the front video." then "2 of 2 videos chosen", and "Check both videos"
  starts. Choosing two at once in one slot fills both. Aline still reads each video's angle
  itself, so a video in the wrong slot is put right.
- **While they run**, both videos show side by side: "Checking now", "Next", then "Done · side
  angle". The same shows when two are chosen at once with "Choose a video". The stills are made
  once and the video is released, so no extra video decoder stays open during the analysis.

## 2026-11-08 · Pages refresh themselves after a release; a processing screen with depth

> These changes should auto refresh the pages. Sometimes old stale sessions show no changes
> until opened in incognito or some new browser. Don't want that to happen. It should reflect
> with a refresh. And the visual illustration shown while working on the report (processing
> indicator on top right) does not seem appealing: add some depth and effect. Status update in
> every step should also feel transitive, because the last step after completion feels like
> there is a delay in generation.

Done (no engine change):
- **Fresh pages** (`src/lib/fresh.ts`, `src/app/api/version`): every build carries its id; an
  open page (also the installed app) asks the server for the live id when it comes back to the
  screen or gets focus and every 2 minutes, and reloads itself once when a new release
  is live. Never in the middle of an analysis or while a report still holds this session's video
  (it waits for the next page change instead).
- **The loader has depth** (`cricket-loader.tsx`): the pitch runs away towards the bowler, the
  far stumps are tiny, the ball comes down the pitch growing, lands on its own shadow, meets the
  bat (which gives: soft hands) with a small jolt and drops dead. Still flat ink on paper; moved
  off the main thread, so it stays smooth while tracking; a still picture with reduced motion.
- **Each step shows its change**: a tick pops in when a step finishes, a bar grows beside the
  step now running, notes slide in. The last step says what it is doing ("Checking each part of
  the shot", "Saving it on this device", for two videos "Checking it's the same ball, from the
  sound"), and when it is done the heading says "Opening your report…".
- **No wait at the end**: the report page is fetched while the body is being tracked, so it opens
  the moment the report is saved (46 ms after the last step on a desktop browser, 0.7 s at 4×
  CPU slowdown; before, it waited for the network). The report shows from the saved result at
  once and fills in the comparisons with earlier sessions (under Details) after; while it is
  read from the device, an outline of the report shows instead of "Loading report…".

## 2026-11-08 · Choose two videos at once: sorted into side and front, checked as the same ball

> Is it live? Unable to segregation on multiple videos upload and limiting to 2: side angle and
> forward angle. And they should also mean they have uploaded the same video in 2 angles. All
> these have to be in place.

Done (engine 0.8.3):
- **"Choose a video" takes one video, or two of one ball** (more: "Too many videos"). Aline
  sorts them itself: the first's camera angle is detected (side-on or front-on, never chosen by
  hand, else "Camera angle not detected"), and the second must be the other one ("Not the front
  angle" otherwise). The screen says "Video 1 of 2", "Video 2 of 2".
- **The same ball, checked from the sound** (`src/engine/same-ball.ts`, `src/lib/capture/audio.ts`):
  two phones filming one ball hear the same things (bat on ball, bounce, voices), so their
  soundtracks line up at the offset the two shots give. Both must match there (correlation ≥ 0.4)
  and stand out from every other offset (≥ 3.5 robust SD), else "Not the same ball"; no readable
  sound: "Can't check it's the same ball". Never assumed. Thresholds in the registry with their
  evidence: 1,000 random different soundtracks, none accepted; one soundtrack through a
  simulated second phone, 99% accepted.
- The report's "Add the front/side angle of this ball" runs the same checks; it is offered while
  the first video is still open (its sound is needed).
- **The athlete's two clips**: their sounds don't line up with the shot (correlation 0.12 at the
  offset their shots give; the bat-on-ball sound in the front clip has nothing at that moment in
  the side clip), so Aline says "Not the same ball": they look like two different deliveries.
- Checked in the real browser pipeline: the athlete's side + front refused (not the same ball);
  a side + front pair sharing one ball's sound (the front video given the side's soundtrack,
  shifted to the shot and with its own noise) combined in either order; side + side refused;
  three videos refused; one video unchanged.

## 2026-11-08 · Two angles: exactly one side and one front, detected by Aline

> When multiple videos, you should restrict the user to upload only 2: side angle and front
> angle. And if the angle is not detected then the video should not be considered.

Done:
- Only **two clips per ball**: one side-on, one front-on (from the bowler's end). Behind, angled or
  unknown camera positions don't take part (`angleFamily`); a report filmed from those doesn't
  offer the other angle, and a ball that already has both angles takes no third clip ("This ball
  already has both angles").
- The second clip must be **the missing angle, read by Aline itself**: the camera position comes
  from the pose with confidence (`guessView`), and the manual "Change" is hidden for it. Clearly
  the wrong angle: stopped before tracking ("Not the front angle: this video is filmed from the
  side, so it isn't used"); not detected with confidence, or the wrong angle after tracking: not
  saved and not used ("Camera angle not detected").
- Checked in the real browser pipeline on the athlete's clips: side + front paired; side + side
  refused in 6 s; front + front refused; a third clip not offered once paired.

## 2026-11-08 · Add the other angle (optional)

> Can we provide an option for the user to upload both views? … Add other angle, but this is like
> an additional feature. Don't mess it up with the current flows. It's just like we are giving a
> more refined output.

Done (additive: the single-clip flow and its report are unchanged):
- **On a video report** filmed side-on or from the front, under the summary: "Add the front
  angle of this ball" (or the side angle), with "Optional: a second camera gives a more exact
  result". It opens the usual Add
  screen with a note naming the first clip; the second clip goes through the usual steps and is
  saved as its own report too.
- **The two are linked** (`otherAngle` on each saved analysis) and shown together at
  `/angles?a=…&b=…`; the first report's link becomes "See both angles together".
- **Combined result** (`src/engine/angles.ts`): the shot is confirmed when an angle confirms it
  and the other doesn't contradict it; one angle confirming and the other naming a different
  shot gives no answer ("The two angles disagree"); two clips from the same side, or checked as
  different shots, aren't combined. Each check is read from the angle that sees it (going back and
  the feet from the side, the sideways line and the elbow from the front); where both read it,
  both must agree or it isn't marked. One summary of at most five sentences, labelled "Side +
  front angle", worded for the batter's age; Details list each check with what each angle read.
- Checked in the real browser pipeline on the athlete's two clips, both orders (side first,
  front first), both themes: a back-foot defence, going back and the feet from the side, the
  elbow from the front, standing tall and soft hands agreed by both. No thresholds; engine
  results unchanged.

Open: whether the two clips show the same ball isn't checked (the athlete is asked for the same
ball; two different balls that disagree on the shot get no answer).

## 2026-11-08 · Feedback worded for the batter's age

> What's the logic of this [Fix next: "Foot, knee and shoulder out of sync … You: 234 ms; aim
> for 0–150 ms"] … But how can a player understand the time thing? It's too technical for
> children. … Add age as an input: age ranges in a drop-down, and give responses accordingly
> so it's better understood.

Done:
- **Age on the Add-your-shot screen** ("Your age": Under 13, 13–15, 16–18, Adult, Masters, or
  prefer not to say), saved to the profile (the same field the Profile page and the guardian
  consent use).
- **Worded by age** (`src/engine/summary.ts`, `readingLevel`): under 13, words only (no numbers in
  the summary or the checks, "Doing well" in plain words); 13–18 or not given, the same summary
  with friendly numbers in the details; adults and masters, the number and its target next to
  the fix in the summary too. "Every measure" stays technical, for coaches.
- **No milliseconds or minus signs on the report's screens**: times in seconds ("0.23 s",
  "under 0.15 s", "0.23 s early"), distances with their direction ("6% of your height behind;
  aim for 3% behind to 16% ahead").
- **Foot, knee and shoulder together** names the part that came last, in words: "Your front
  shoulder came late: lean it over the ball as your foot lands" (or the knee taking the weight
  late, or the foot landing late).
- Engine results unchanged (wording only; front-foot payloads byte-identical).

## 2026-11-08 · The same shot from the side and the front: the front elbow

> These are basically same video from front and side angles. Why is the report different?
> Front elbow high point is common, but why is the indication green in one of them?
> [side-on report: "Your front elbow was high" (green); bowler's-end report: "Don't lift your
> elbow so high" (red)]

What was wrong:
- Side-on, the front arm goes up past the head. The pose model, unsure of the elbow there, put
  it at the bat handle, so the elbow read level with the shoulder (in range, green) while it was
  well above it. Every version of the side-on clip did this.
- From the bowler's end the elbow was read at the moment the feet came to rest, while the arm
  was still rising: the same clip read anywhere from 0.03 (green) to 0.13 (red) across its copies.

Done (engine 0.8.2): the elbow is read over the held position, and only from frames where it is
clearly seen (the model sure of it and the forearm not collapsed onto the hands); otherwise the
report says it wasn't seen clearly from this angle instead of guessing (docs/11).
- The athlete's elbow: 0.12–0.14 × height above the shoulder from the bowler's end, in all 7
  versions (red: "Don't lift your elbow so high"); side-on, all 13 versions now "not seen
  clearly", never a false green. Every other measure and every verdict unchanged.
- The red is right: on 112 international back-foot defences (3D, every camera position) the
  front elbow sits 4–13% of height below the shoulder and never more than 4% above. "High" in
  the coaching sense means level with the shoulder, not above the head.
- Cost: 6 of the 112 correctly placed elbows go ungraded (side-on and angled); none read wrong.
  Front-foot results identical.

## 2026-11-08 · Why the side-on clip still failed; a five-line report, a cricket loader, a minimal opening

> In this video the batsman is going backward to play the defence shot, why is this not
> considered as that shot [the side-on clip on the live site, on their phone: "no movement back
> toward the stumps was seen"]
>
> After the analysis just show the output as summary in max 5 statements as feedback for the
> user. Only if toggles on in detail button (then show him full content and the illustrations
> to correct, else hide it). Keep it simple. Even 5y old should be able to understand.
>
> At the time of processing, show something like the settings loading on Zoho, with a cricket
> bat hitting the ball, beside the steps (don't change the current layout, add it beside).
>
> Even on the opening page make sure details are very minimal, just the text and action points.
> Keep it professional, understandable and accessible to all age groups who play cricket as a
> real career.
>
> Add a label on the right in the summary and its expansion (side angle or forward angle), so
> the user has clarity.

What was wrong: on the phone, the clip's tracks showed a small adjustment of the feet in the
stance at about 1 s. Aline took the first rest after any movement as the shot, so it measured
the "stroke" before the batter had gone back, and found no movement back. In the test browser
the same clip passed because there the adjustment happened to read a little smaller: the
choice was fragile, not the definition.

Done (engine 0.8.1):
- **Which movement is the stroke**: every rest held 0.3 s or more is a candidate set position;
  the stroke is the one with the most footwork from the stance before it. A shuffle or bat tap
  in the stance never wins over the real step back (docs/11).
- **Report**: opens with the answer and at most four more plain sentences (what was good, the one
  fix, what to remember or do next), with the camera angle on the right ("Side angle", "Front
  angle", "Back angle"). Everything else, measures, illustrations, video, drills, sits behind a
  "Details" switch, off by default, and is drawn only when it's turned on; the details repeat the
  angle with a sentence on where the camera was. `src/engine/summary.ts`.
- **Processing**: a bat blocking a ball, on a loop, beside the heading of the steps (flat black
  on sage-cream; still with reduced motion). The steps are unchanged.
- **Opening page**: the headline, "Check your defence on your phone", the two actions, three
  steps. App home: the two actions and the coach's video of each defence. The start screen's
  long notes are cut to a line each; buttons say "Check front-foot defence" / "Check back-foot
  defence".
- Checked in the real browser pipeline on the athlete's clips: as a back-foot defence, all 8
  versions valid (bars at 1080 and 480, cropped 1080 and 720, mirrored, side-on 30 and 15 fps,
  side-on mirrored) and the side-on clip's 5 variants (bitrates, 720p, zoomed) valid on both the
  CPU and the GPU pose model (the live build: 1 of the 5 on the GPU, 4 on the CPU). As a
  front-foot defence, all 8 offered as back-foot defences. Front-foot verdicts on 64 saved real
  tracks: identical to the locked build except the back-foot guard and the earlier wording
  change; no broadcast clip accepted as a back-foot defence. At 4× CPU slowdown the report shows in about 0.6 s and
  "Details" opens in 0.35 s.

## 2026-11-08 · The back-foot defence by its formula, from any video

> Is the report correct? [a back-foot defence from the bowler's end, analysed as a front-foot
> defence: "without the bat or ball in view, the body movement alone fits more than one shot"]
>
> This is backfoot defence right? Why this analysis [analysed as a back-foot defence: "This
> appears to be a front-foot defence"]
>
> This is also backfoot defence in side angle. Why is this not detected
>
> Make sure the fix is not specific to this video. Logic of backfoot defence should be
> applicable on any kind of video applied based on the formula. You can refer to text material
> definitions, videos from internet for additional reference to apply on human biomechanics

What was wrong:
- The back-foot defence was recognised by closeness to a prototype built from generated
  batters; no real back-foot defence ever passed (the athlete's front-on clip was called a
  front-foot defence, the side-on one "fits more than one shot").
- Contact (bat and ball not seen) was placed where the head dipped in the back-and-across
  trigger, 0.4 s before the bat met the ball, so the head read "low over the front leg".
- The side-on clip was read as a left-hander from one frame of a raised-bat stance, swapping the
  front and back feet in every measure.
- An upright clip saved into a wide frame (black bars) left the batter too small to follow; a
  panning phone read as the feet travelling.
- Analysed as a front-foot defence, a real back-foot defence could pass as a valid front-foot
  defence (the bars-free copy of the athlete's clip did; 72 of 172 real back-foot defences seen
  from the bowler's end in the 3D set did).
- Reports said "without the bat or ball in view" when they were in view: Aline doesn't look for
  them unless they're tapped.

Done (engine 0.8.0, bfd-0.2.0):
- **The formula**: no stride, went back, stayed tall, a defensive bat; each read from what the
  camera sees (side-on, bowler's end, behind, angled, still or panning), with limits set on real
  movement (1,281 international shots in 3D, from every camera position) and the athlete's
  clips; every limit's evidence is in the registry. The report lists the four parts, each met,
  not met or not seen, in words. docs/11 has the detail.
- **Contact** at the set position (where the feet come to rest after the stroke), not the head
  dip; the stance is the last upright rest before the stroke.
- **Front-foot guard**: a clip meeting the whole back-foot definition is never passed as a
  front-foot defence: "this looks like a back-foot defence", with a button to analyse it as one.
- **Capture**: the picture inside black bars; the camera's own movement read from the background
  and taken out; the batting hand side-on from the feet (never from one or two frames).
- **Wording**: "Aline didn't find the bat and ball on its own" instead of "not in view".
- Checked: all eight versions of the athlete's clips (bars at 1080 and 480, cropped 1080 and 720,
  mirrored, side-on 30 and 15 fps, side-on mirrored) valid back-foot defences, and offered as
  back-foot defences when analysed as front-foot ones (live build: none recognised; one passed as
  a front-foot defence). 50 broadcast clips of 10 other shots (CricketShotQualityAI): none accepted
  as a back-foot defence (44 declined for camera cuts and zooms, 6 not confirmed). The 3D set and
  the generated population: see docs/11.

Open:
- Without the bat and ball, a back-foot flick or punch can look like a block in the body's
  positions; the hands stopping at the ball is what tells them apart, and that needs real video
  timing. It held on the real clips here, but more real back-foot flicks and punches (side-on)
  are the next thing to test. Tapping the ball and bat settles it.
- From the bowler's end, back-foot defences that turn the shoulders open (as many international
  batters do) are not confirmed without the bat and ball (36° limit, to keep flicks out).
- Front-foot analysis (found in this check, live before this change and unchanged by it): a
  zoomed broadcast late cut from the bowler's end (CricketShotQualityAI `late_cut/video5`) is
  passed as a valid front-foot defence. Needs its own fix and real-media check.

## 2026-10-21 · Left-handers are not mirrored right-handers

> Damn / You literally mirrored the left hand, the logic isn't that way / Study the science and
> then apply / It's not at all right

What the science says (applied now):
- Batting side is not hand dominance. A left-handed batter stands with the right shoulder and
  foot toward the bowler and the right hand on top, but is often right-hand dominant: at the
  2003 World Cup, 25 of 41 left-handed batters bowled right-handed.
- The top hand guides the bat; the bottom hand supports it. Professionals were about 7 times
  more likely than inexperienced batters to bat with the stronger hand on top (the "reversed"
  stance), whichever side they bat (Mann, Runswick & Allen, Sports Medicine 2016: 43
  professional, 93 inexperienced batters; an observed link, not proof).
- So a mirrored right-hander is not a real left-hander (it swaps hand dominance and turns the
  bowler's arm round too).

Done:
- The videos are never flipped. "You bat: Right-handed / Left-handed" names your own sides in
  every step (which shoulder and foot lead, which hand is on top); "Your stronger hand: Right /
  Left" says whether your stronger hand is on top or at the bottom and what to do about it
  ("let it guide" or "keep it loose"), with the source.
- Open: a real left-handed demonstration video for each defence. YouTube is blocked in the
  build environment, so none could be watched and verified; allowing youtube.com and
  i.ytimg.com in the environment's network settings would let the next session do it.

## 2026-10-21 · A real video instead of the drawn demonstration

> You are not able to build proper illustration just replace it with nice video which
> properly showcases the defence

Done:
- **Videos, not drawings**: "Learn the shot" (landing page, Home, the Guide's back-foot
  section) now shows a coach demonstrating each defence on video: Sikana's free "How to Play
  Cricket" lessons, "How to Play a Front Foot Defence" and "How to Play a Back Foot Defence"
  (YouTube, embedded, credited, with a "Watch on YouTube" link). Beside each video, the four
  moves to watch for (set up, pick up or back and across, stride or alongside, contact).
- **Private and light**: nothing is loaded from YouTube until play is tapped, then in its
  no-cookie mode; the picture before that is the video's own frame in grey under a flat play
  button. No third-party video is committed to the repo.
- **Either hand**: the right-/left-handed switch stays; left-handed mirrors the video
  (replaced the same day: see "Left-handers are not mirrored right-handers").
- The drawn batter is gone from the public pages (the landing page's "The name" shows the
  Aline mark instead). Reports still draw the batter's own shot from their clip.
- To use other videos, change the YouTube ids in `SHOT_VIDEOS`
  (`src/components/home/shot-video.tsx`). The videos could not be previewed from the build
  environment (YouTube is blocked there); they were chosen by title and source.

## 2026-10-20 · Teach both defences: four connected stages, two hands, either hand

> Restructure the visual demo video to accurately demonstrate the human body dynamics of a
> cricket forward defensive shot. The current silhouette looks visually appealing but does not
> clearly teach the learner how to perform the movement. Replace it with anatomically
> realistic, coordinated body poses that clearly show the front-foot stride, knee bend, forward
> weight transfer, stable head position, hand coordination, bat angle, and point of contact.
> Show all four stages as a connected sequence of movement, ensuring each pose transitions
> naturally into the next. Preserve the existing clean visual style, but prioritise
> biomechanical accuracy and instructional clarity so a beginner can understand and imitate
> the correct technique just by observing the visual. also for backfoot defence
>
> the main disconnect is the left hand and right hand movement where there should be some gap
> to clearly demonstrate that but it is missing and also give user an option for left hand
> batsman, right hand batsman
>
> when left hand has to be backside why is the right hand front / visual does not convey the
> actual human representation
>
> I guess you are messing it up, understand real life videos and then work on it

Done:
- **Four connected stages, both shots** ("Learn the shot" on the landing page, Home and the
  Guide): forward defence = set up, pick up, stride, contact; back-foot defence = set up, back
  and across, alongside, contact. One batter moves continuously through all four (slowed
  down, held at each stage, any stage replayable from the strip of stage poses). Each stage
  draws on what to copy: eyes level, knees soft, the grip; bat up straight back, head leads;
  head and shoulder lead, front knee bend (in degrees), foot to the ball; head, knee and toe in
  one line, bat angle (in degrees), contact under the eyes, back leg long; for the back foot:
  back foot back and across, head still, front foot alongside, stand tall, front elbow high,
  straight bat. A dot under the feet shows where the weight is (centre of mass) throughout.
- **Shaped on real defences**: 323 defences by international batters (KU CricShot 3D pose
  estimates, filmed from the bowler's end, so heights and the off/leg-side axis are
  reliable; split by footwork into 49 front-foot and 83 back-foot defences). What they show,
  and the demos now do: a short pick-up (the hands rise only to just above the hip, the bat
  up behind them; the old demo lifted them to the chest); at front-foot contact the head
  about a fifth of the batter's height lower than in the stance (the old demo stayed too
  upright), the hands at hip height, the top hand a hand's width above the bottom one, the
  front elbow up toward the bowler (just below the shoulder) and the back elbow tucked by the
  hip; at back-foot contact the hands at belt height (the old demo had them at the
  shoulders). In every phase the bottom-hand arm is nearer an off-side viewer than the
  top-hand arm (85–96% of the clips). Analysis scripts are in the session scratchpad, not
  the repo (third-party data).
- **Biomechanically checked**: each demonstration is a clip run through Aline's own engine
  and passes every check of its shot (valid forward defence; valid back-foot defence). The
  bat stays up as the front foot lands and comes down late and slowly to meet the ball
  beside the pad (about 0.19 s from foot down to contact).
- **Two hands**: the top hand and the bottom hand are separate gloves with a gap of handle
  between them, each with its own arm. Seen from the off side, the bottom-hand arm reaches
  across the chest in front; the top-hand arm sits behind it (this was the wrong way round;
  confirmed on the real defences above).
  The set-up stage labels which is which (top hand left, bottom hand right for a right-hander),
  and the coaching says the top hand guides the bat while the bottom hand stays loose.
- **Right- or left-handed**: a switch on every demonstration mirrors the batter (labels still
  read normally); the choice is shared by every demonstration and remembered on the device,
  starting from the hand in the profile.

## 2026-10-12 · Faster, two-tone, natural motion, professional skills

> add relevant anthropic skills to this project so the website remains industry grade and is
> according to professional standards
>
> the site feels laggy and the back foot defence shot is not live yet
>
> all of the demonstration videos and site transition and feel should have this effect (apply
> it carefully, check if logo can also have this one) [a flat two-tone silhouette: solid black
> subject on pale sage-cream #E3EADF, #EDEDED only for tiny accents, no gradients, shadows or
> texture]. The cricketer's body mechanics do not seem to have real human fluidity in the
> motion, which feels like an incorrect demonstration: correct that.

Done:
- **Skills**: Anthropic's `frontend-design` (design quality) and `webapp-testing` (Playwright
  checks of the running site) added to `.claude/skills/` (Apache-2.0, licence files kept).
- **Back-foot defence not visible**: it was live, but the landing page only offered the
  forward defence. The landing hero, a new back-foot section and the closing call now offer
  both shots.
- **Lag** (measured at phone speed, 4× CPU slowdown): the landing page scrolled at 12 frames a
  second because of the live 3D logo (WebGL); now 60, and load blocking fell from 2.6 s to
  0.4 s. Reports no longer run the engine on the phone to build their textbook references
  (now computed at build time, guarded by a test), and "More detail" is drawn only when opened.
- **Two tones**: black on sage-cream (#000 on #E3EADF) across the site, inverted in the dark
  theme; flat, no shadows or gradients. Every demonstration batter is a solid black
  silhouette (bat, ball and stumps too) with ink annotations on a thin sage halo. The opening
  curtain is black with the sage mark; pages cross-fade (CSS only). The logo is the flat black
  mark (it was the 3D one); app icons are black on sage-cream.
- **Natural motion**: the explainer's batter trembled (simulated tracker noise meant for
  testing the engine) and its back foot skated (every frame was re-centred and re-scaled on
  the feet). Now noise-free on one still camera, with every joint's speed rising and falling
  smoothly, and the back heel lifting as the weight goes forward.

## 2026-10-10 · The back-foot defence, on top of the locked front-foot build

> Now lock this code, on top of this Add a new section for back foot defence cricket shot.
> Scout for videos, images, references, definition, understand and then merge those changes

Done:
- **Locked**: the front-foot build is kept as branch `lock/ffd-2026-10-10` (main at 80717e4).
  The back-foot defence runs only when asked for; every front-foot result on 124 saved real
  tracks is byte-identical to the locked build.
- **Definition and sources** (docs/11-back-foot-defence.md, `/guide#back-foot`): played to a
  short ball on the stumps; back foot back and across first, front foot alongside, tall and
  side-on, head forward over the ball, front elbow high, contact under the eyes, soft hands
  (Sportplan, ESPNcricinfo coaching, Pitchero academy). No lab measurements of the shot exist:
  every range is labelled provisional coaching geometry.
- **Analyse**: a Front-foot / Back-foot choice on the Analyse screen (`/analyse?shot=back`), in
  the menu, on Home and in Sessions. In a long clip its strokes are found from movement (the
  head stays tall, so the front-foot head-drop finder would miss them).
- **Identification**: its own strict gate (≥ 80%, clear margin, went back and stayed tall). A
  front-foot defence, pull or cut is named for what it is and never scored; one tap re-checks
  the same tracks as a front-foot defence. Photos are checked on the position (front foot
  alongside, head, height, elbow, hands).
- **Report**: "The base" panel (front foot, head and hands against their ranges; back step,
  standing tall, elbow, soft hands; when back foot, front foot and head set), every measure
  with its range and source, a priority with a four-step drill ladder for each fault, PDF.
  Baselines, comparisons and progress charts keep the two shots apart. Samples:
  `/sample/valid_bfd`, `/sample/front_on_bfd`, `/sample/ffd_as_bfd`.

Open:
- No real back-foot defence footage could be reached from the build environment (the
  published back-foot clips are on Dropbox, which it can't reach). Validated on generated
  back-foot defences (side-on and from the bowler's end) and on every real front-foot and
  other-shot clip and photo run as a back-foot request: none accepted. Side-on and bowler's-end
  phone clips of real back-foot defences are the next thing to test.

## 2026-10-07 · A visitor log

> capture related to visitors and maintain it in db, like device, ip, place, time, os, tried
> operations, spent time (I don't want spam bots info here, try handling that). Give access to
> visitors page in the bottom (very minimalistic)

Done:
- **What is kept** (Supabase `visits`, one row per visit; a tab's session, a new one after 30
  minutes away): time, IP, place (city, region, country from Vercel's headers), device (model
  from the browser's own hints where it gives one), OS and version, browser, screen, language,
  referring site, pages in order, what they did (pages, buttons tapped, analyses tried with file
  type and size, the result and how long it took, failures) and time spent (visible and in use;
  idle over 5 minutes isn't counted). Never video, photos, file names or typed text.
- **No bots**: nothing is sent until a person does something (a real tap, key, scroll or mouse
  move; scripts can't fake these), never from automated browsers (`navigator.webdriver`,
  headless) or from browsers asking not to be tracked; the server (`/api/visit`) drops crawler,
  link-preview, monitor and script user agents, other sites' requests and bursts; the database
  caps new visits per IP (30 an hour) and per day. Only the live site logs.
- **Visitors page** (`/visitors`, linked at the bottom of every page), open to anyone:

  > I don't want the sign action now. Main is to just check visitors, no protection required

  Because it's public it shows totals only (`visits_overview()`): people, visits and typical
  time today, 7 and 30 days; over 30 days the countries, kinds of device, systems, browsers,
  where they came from, pages, analysis results, failures and most-tapped buttons. No IPs,
  towns, device models or single visits leave the database (the full rows are in Supabase's
  table editor, `visits`). "Don't count my visits on this device" switches the owner's phone
  off. (A fully public per-visit list with IPs was declined as exposing visitors' personal
  data; the athlete chose totals only. The owner-only list and `site_admins` remain unused.)
  Sign-in links currently open `localhost:3000`: Supabase Auth's Site URL needs to be the live
  site, with both live domains in its redirect URLs.

  > It's for testing, I need complete table with data. Just make sure spam bots visits are
  > eliminated

  The full table (every visit: time, place, IP, device, system, browser, time spent, pages,
  actions, source, a short browser id; tap a visit for its steps, screen and language) is on
  the owner's private link `/visitors?k=…` (`visits_full(key)`; keys are SHA-256 hashes in
  `visit_keys`, added by hand, never committed). The key is remembered on that device, so the
  bottom link opens the full table there. Everyone else still sees totals only.
- Checked: `tests/visit.test.ts` (bots vs real phones and in-app browsers, device reading,
  beacon checks) and `tests/e2e/visits.mjs` (an automated browser sends nothing; a person's
  visit arrives with pages, taps, the analysis tried and time; opt-out works).
- **Open**: anyone who reads the page's code could still post a made-up visit straight to the
  database function (there's no server secret to sign with yet); it's capped per IP and per day.
  The 180-day clean-up isn't running yet: removing rows needs a statement Supabase asks to
  confirm, and that prompt doesn't reach the athlete's phone. Set it up (e.g. a daily pg_cron
  delete of `visits` older than 180 days) from a session where the prompt can be approved,
  before 2027-04-05, when the first visits turn 180 days old. A leftover header probe,
  `zz_debug_headers()`, has no grants and can be dropped then too.

## 2026-10-06 · Faster analysis, a human 3D figure, and the Aline brand

> the video analysis is taking a lot of time and too slow … user cannot spend 5 mins … anything
> related to analysis should be within a minute, every step

> increasing the speed should not mean compromising on the logic, if that is not working then
> no point of this change

> in 3d the centre line can extend until the head … the illustration should feel more human
> like not stick figure like … the hands feel like an overlap and do not convey what the human
> has to take action in real life

> use this as logo and change colours on the site accordingly and maintain the branding …
> improve the resolution, create a 3d model version of it, enhance, make it better and use it

Done:
- **Speed, same logic**: profiled every step (`[align:time]` logs; `THROTTLE=4` in the e2e
  harness approximates a phone). 96 of 126 s was the pose and person models on one core. Now
  the models run in 2–3 workers (`vision.worker.ts`, `vision-pool.ts`) while the page keeps
  every pixel operation it always had: for clips of 8 s or more the scan ("finding the shot")
  runs in parts side by side, each decoded on the page and drawing on the page's canvases,
  sending only the finished images to a worker; the link-back person detection gets the page's
  decoded pixels; the tracking model loads during the scan; progress redraws are throttled.
  Tracking and the batter, camera and recording checks stay on the page.
  What it took to be exact (each found by comparing tracks): a frame decoded *in* a worker has
  very slightly different colours (that moved a sync timing by one frame, and turned a TV
  defence into a "back-foot defence"), so workers never decode; and a canvas keeps a faint
  trace of the previous frame at its edges, so each scan part first redraws the few frames
  before it. Result: tracked frames, verdicts and measures identical to the previous build on
  the real-media matrix. Workers can be switched off (`localStorage align:workers = off`,
  `NO_WORKERS=1`).
- **Measured** (same machine, before → after): the 44 s net clip 44 → 33 s (with the page
  slowed 4× like a budget phone: 124 → 69 s; the workers aren't slowed by that setting, so
  the phone figure is optimistic); a 9 s broadcast clip 28 → 24 s. Real-media matrix (42
  videos): every clip that decodes exactly is identical (13 of 16 tracked; the other 3 are
  odd-sized transcodes that fall back to playing the video, which varies run to run in the
  old build too).
- **Open**: tracking (the full pose model on every frame of the shot, in order) is now most
  of the time and can't be split without changing results; on a budget phone a long net clip
  can still take over a minute.

> fix the odd-sized videos too

Done: videos whose pixels aren't quite square (a pixel-aspect box like 426:427, so a 240×426
file shows as 240×427) used to fail the decoder's size check and fall back to playing the
video, which isn't repeatable. The decoder now sizes frames exactly as the player does
(stretching one side, never shrinking), so they take the exact path: two runs of each of the
three such test clips give identical tracks, with the same verdicts as before, and faster
(the 15 fps clip 53 → 21 s). Files with square pixels (all phone recordings) are untouched.
- **3D**: the batter is a solid figure (whites, blue shirt, helmet, forearms, gloves), not
  lines; the near side lit and the far side darker so crossing limbs read in depth; the
  centre line runs from the ground up to the top of the head.
- **Demo illustrations**: both gloves on the handle, the top hand above the bottom hand, the
  arms reaching them (two-bone reach keeping each arm's length).
- **Brand**: the ALINE mark redrawn as clean vector geometry (`src/components/brand`), a 3D
  extruded version in the landing hero, app icons and favicon from the same geometry
  (`scripts/brand-icons.mjs`), the site in the mark's near-black and warm white (status
  colours kept for status only), and the name shown as Aline.

## 2026-10-06 · Take a photo with the camera

> capture a photo should also be an option, is that avl?

Done: the analyse page has four options in a 2×2 grid on a phone: choose a video, choose
photos, record a video, and **take a photo** (opens the rear camera; tip: side-on, head to
feet, at contact). Photos taken this way go through the same position check as chosen ones.

## 2026-10-06 · Reassess everything: the FFD line, sync, comparison, drills, real testing

> there are lot of gaps, just reassess everything. The front foot defence has a logic where
> shoulder, head, knee, toe have to be in line until the contact … the shoulder that is
> following the ball … shoulder dynamics, length of the ball remains same … knee & shoulder
> & feet — these are the key signals to be in sync … can you also do an estimation of the body
> pose in side angle? or having a video helps? … identification and analysis have to be
> accurate … every body dynamic has to be saved … compare with other profiles and what's the
> match with them, and also check across other cricket profiles … you cannot keep
> hallucinating … for some low resolution photos, identification is not working on other
> devices … do a thorough testing by picking 10 different videos, photos, different
> resolutions, then only finalise the logic and push it to production … recommend a drill to
> get close to perfection … it should be a complete experience, not just basic.

> maintain a context md file and skills so every time the prompting and context is in sync
> with the asks.

Done in this change (engine 0.6.0, metrics ffd-0.6.0):

- **The line** (`src/engine/alignment.ts`): head, front shoulder and front knee measured from the
  front ankle at contact, along the pitch side-on and sideways from either end. Sideways ranges
  are the 5th–95th percentile (plus 1% of height for landmark error) of 323 international defences (KU CricShot 3D); side-on ranges
  are coaching geometry checked on side-on photos (the 3D estimates compress forward distance).
  Same stack whatever the ball's length.
- **Held to contact**: share of frames from the front foot's landing to contact in line.
- **Sync**: when the front foot lands (comes to rest), the knee takes the weight (hips stop
  lowering) and the front shoulder arrives; spread in ms, and whether all were set before a
  seen contact.
- **Contact without bat or ball**: the gloved hands are tracked too poorly to time contact
  (they read 200 ms early on a real clip), so contact is placed at the set position.
- **Identification gates**: a defence must go forward and down (head ≥ 5% or hips ≥ 3% of
  height); a stance with a backlift used to be called a defence. A camera zooming ≥ 1.8× during
  the stroke never yields a "different shot" verdict. Frame-rate floor 15 fps (identification
  held at 15 and 10 fps on real clips).
- **Photos**: from either end of the pitch now graded on the line (was "not graded"); the same
  batter detected twice at low resolution is merged instead of asking who bats.
- **Comparison**: shot signature (line, timing, shape) and match % against the textbook model,
  professionals' line, your earlier shots and players who share theirs (Supabase
  `shot_profiles`, numbers only, opt-in).
- **Drills**: each fault has a four-step ladder (shadow → tee or dropped ball → throw-downs →
  machine or live) with pass conditions; the report says where to start.
- **Side view**: from a front-on video the side view is an estimate (shown, not graded). A
  side-on video, or two phones, measures the forward line.
- **Testing**: real-media matrix of 54 cases (phone clips 240p–720p at 15–30 fps, broadcast
  clips 320×240–720p, photos 120–1200 px, side-on, front-on and angled); see
  `scripts/eval/README.md`. Results at ship:
  - phone defences (480p, 240p, mirrored, 15 fps): all valid, line in, held 100%, foot–knee–
    shoulder within 67–100 ms, contact at the set position within ~1 frame of the true one
    (checked on skeleton overlays); a clip with no stroke: "no batting stroke";
  - side-on photos 9/9, front-on 3–4/4, angled 4/4; a junior's photo 5/9 with head over the
    ball and stride to work on; a stance photo: "front foot hasn't stepped"; an 81 px batter:
    "too small: about 81 px tall, needs at least 100 px";
  - broadcast clips that cut or zoom: declined with the reason, none called a wrong shot (a
    zoomed defence used to be called a drive); 12 fps and 91 px-tall clips declined;
  - GPU and CPU pose give the same verdicts (the "other devices" check).
- **Drills to perfection**: when every check passes, the report offers the next level (the same
  shot faster: throw-downs → machine → live) instead of nothing.

Open:
- Broadcast highlight clips that cut or zoom around the shot are mostly declined ("the batter
  is in view for only 0.9 s"): honest, but not analysed.
- No real side-on *video* of a defence in the test set yet; side-on timing is validated on
  synthetic clips and side-on photos only.

## Earlier (shipped)

- Landing page at `/` with a kinetic slatted curtain intro (left to right) and an orange mark;
  app home at `/home`; cricket-ground background; athletic figure in the lesson.
- Front-on / behind views, photos and photo sets, multi-person clips, broadcast cuts, body-led
  verdict without bat or ball, population-validated identity gates, 3D replay and Compare.
