# What the athlete has asked for

Newest first. Keep their words; say what was done and where. Update this file in the same
change that answers a new ask, so the next session starts from the same page.

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
