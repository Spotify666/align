# What the athlete has asked for

Newest first. Keep their words; say what was done and where. Update this file in the same
change that answers a new ask, so the next session starts from the same page.

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
