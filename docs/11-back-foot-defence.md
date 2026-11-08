# 11 · The back-foot defence

The second shot Aline analyses. Built on top of the locked front-foot build
(`lock/ffd-2026-10-10`); the front-foot defence path is unchanged.

## What the shot is

Played to a ball **short of a length, on or around the stumps, rising**: too short to get
forward to, too straight to leave. The aim is to block it safely, not to score.

Coaching sources agree on the shape:

| Part | The textbook | Sources |
|---|---|---|
| Back foot | Moves **back and across** toward the stumps, inside the line of the ball; roughly parallel to the crease so the body stays side-on. It moves first. | Sportplan *Back foot defence* and *Defensive back stroke* drills; ESPNcricinfo coaching *Backfoot defence*; Pitchero academy *Backfoot defence* |
| Front foot | Follows, sliding back toward the back foot until it is **alongside** it (heel up, toes touching). | Sportplan; Pitchero |
| Weight and head | Weight on the ball of the back foot, but the **head stays forward**, still, eyes level, in line with the ball. | Sportplan; ESPNcricinfo |
| Body | Tall and **side-on** to the bowler. | Sportplan; ESPNcricinfo |
| Front elbow and bat | **Front elbow high**; full face of the bat straight down the pitch, angled slightly down (handle ahead of the blade). | Sportplan; ESPNcricinfo |
| Contact | **Under the eyes**, close to the body; look through the hands. | Sportplan; ESPNcricinfo |
| Hands | **Soft**: the grip relaxes so the bat gives; no follow-through, hold the position. | Sportplan; Pitchero |

Sources:
[Sportplan, Back foot defence](https://www.sportplan.net/drills/Cricket/Back-foot-batting/Back-Foot-Defence.jsp);
[Sportplan, Defensive back stroke](https://www.sportplan.net/drills/Cricket/Techniques/U12/Defensive-Back-stroke-XStraightBack2.jsp);
[ESPNcricinfo coaching, Backfoot defence](https://i.imgci.com/link_to_database/INTERACTIVE/COACHING/BATTING/BACKFOOT_DEFENCE.html);
[Pitchero cricket academy, Backfoot defence](https://www.pitchero.com/en_US/coaching/cricket/batting/training/backfoot-defence).

No published lab measurements of the back-foot defence were found (searches of the sports
biomechanics literature turned up the pull, cut, drives and bowling only). Every range below
is therefore **coaching geometry, provisional**, and labelled as such in the app.

## What Aline measures (`src/engine/backfoot.ts`)

The base of the shot is the **back foot** (the front-foot defence measures from the front
foot). Offsets are × standing height, read in the picture: side-on along the pitch (+ toward
the bowler); from either end of the pitch sideways (+ toward the off side).

| Measure | Side-on | From either end | Range (provisional) |
|---|---|---|---|
| Back foot back (`bfd_back_step`) | travel toward the stumps | not visible (depth) | 0.05–0.35 |
| Front foot alongside (`bfd_feet_gap`) | ankle gap along the pitch at contact | shown, not graded | 0–0.22 |
| Head forward over the back foot (`bfd_head`) | head ahead of the back ankle (over it to just past the front foot) | head over the line, inside it | 0.02–0.26 / −0.04–0.16 |
| Standing tall (`bfd_tall`) | head drop from the stance | same | ≤ 0.06 |
| Front elbow high (`bfd_elbow`) | elbow height vs front shoulder | same | −0.14–0.04 |
| Contact under the eyes (`bfd_hands_eyes`) | hands ahead of the head | hands beside the head | −0.04–0.18 / −0.08–0.10 |
| Soft hands (`bfd_dead_bat`) | hands' travel after contact | same | ≤ 0.12 |
| Back foot first (`bfd_back_first`) | back foot sets before the front foot | same | 0–350 ms |
| Set before contact (`bfd_set_late`) | last of back foot, front foot, head | same | ≤ 0 ms (seen contact only) |

Photos (one moment, taken to be contact) are checked on the position: front foot
alongside, head forward, standing tall (head height for one photo), front elbow, contact
under the eyes.

## In the app

- **Analyse**: a Front-foot / Back-foot choice on the "Add your shot" screen (`/analyse?shot=back`
  opens it on the back-foot defence). The observation carries `target: "back_foot_defence"`.
- **Finding the shot in a long clip**: front-foot strokes are found from the head dropping;
  a back-foot defence keeps the head tall, so its windows come from movement peaks.
- **Report**: "The base" panel (front foot, head and hands against their ranges, the back
  step, standing tall, elbow, soft hands, and when the back foot, front foot and head set).
  The front-foot line and match-% panels are not shown for this shot.
- **Named as the other defence**: one tap re-checks the same tracks as that shot, saved as
  a new report.
- Baselines, comparisons and progress charts never mix the two shots.
- Samples: `/sample/valid_bfd`, `/sample/front_on_bfd`, `/sample/ffd_as_bfd`; guide section
  `/guide#back-foot`.

## Identification: the definition, checked on the body (`src/engine/backfoot-formula.ts`)

Since engine 0.8.0 the back-foot defence is identified by its definition, not by how close a
clip comes to a prototype of generated batters (which never accepted a real back-foot defence:
the athlete's own front-on and side-on clips were called front-foot defences or "fits more than
one shot"). The same four parts are read from any camera position: side-on, from the bowler's
end, from behind, at an angle, still or panning, at any resolution and frame rate.

| Part | Read as | Side-on | From either end |
|---|---|---|---|
| **No stride** | the feet end close together along the pitch, and the batter never held a stride with the body down | gap ≤ 0.25 × height in the picture; with the camera's movement known, a front foot that didn't move toward the bowler is "left out in front", a fault, not a stride | gap ≤ 0.15 in the pose estimate's depth (compressed) |
| **Went back** | the feet closed up (front foot drawn back), or the hips moved back over the back foot, or the back foot travelled toward the stumps | gap closes ≥ 0.08, hips ≥ 0.10, back foot ≥ 0.04 (camera movement taken out) | gap closes ≥ 0.08, hips ≥ 0.10, or the feet rise ≥ 0.05 in the picture (stepping away from a camera that looks down on the pitch) |
| **Stayed tall** | hips no lower than 0.04 and head no lower than 0.12 than in the stance, when set | picture heights | picture heights |
| **Defensive bat** | the hands stop at the ball (≤ 0.15 travel in 0.3 s), stay below the shoulders and in front (sweep ≤ 0.15), and the shoulders stay side-on (turn ≤ 36°); with the ball tracked, the ball dropping dead off the bat | sweep in the pose estimate's depth | sweep across the picture |

How it is read:
- **The stance** is the last upright rest before the stroke's main movement (head within 0.06 of
  the tallest the batter stands in the clip), so a trigger that dips the head, or a held stride,
  is never taken for it.
- **The set position** (when bat and ball aren't seen) is where the feet come to rest after the
  main movement: a defence holds it and meets the ball there. Found from footwork speed (the feet
  matched frame to frame, so a pose model swapping the ankles reads as no movement).
- **Feet by position, not by label**: the foremost and rearmost foot along the pitch, so a wrong
  batting hand or swapped ankles change nothing.
- **Shoulder turn** from the pose estimate (an angle, so independent of where the camera stood),
  with frames where the shoulders swap or overlap left out.

Verdicts:
- **Valid** when all four parts are seen and met. With bat and ball seen, the prototype model must
  not clearly name another shot.
- **Another shot named** only when the body clearly shows it: a stride, no going back and the body
  down (a front-foot shot), or the hands swinging through (an attacking stroke), and the prototype
  model agrees.
- Otherwise **can't confirm**, saying which part wasn't met or couldn't be seen. The report lists
  the four parts, each met, not met or not seen, with the reason in words.

The front-foot defence keeps its own identification, with one guard: when a clip analysed as a
front-foot defence shows the back-foot defence's whole definition, it is never passed as a
front-foot defence; it reads "this looks like a back-foot defence" and offers that analysis.

### Evidence

- **Real movement from every camera position** (`scripts/eval/ku3d.probe.ts`): 1,281 shots by
  international batters (KU CricShot 3D pose estimates, Sourav-017/Cricket-Shot-Analysis-Framework;
  86 back-foot and 99 front-foot defences by their footwork, 247 pulls, 357 drives, 351 flicks),
  seen from the bowler's end and through virtual cameras side-on, behind and at 45°. Back-foot
  analysis, valid: front-foot defences 1 of 198 from the ends, 3 of 396 side-on/angled; pulls 2 of
  494 and 30 of 988; drives 14/714 and 64/1428; flicks 15/702 and 199/1404; back-foot defences
  27/172 and 84/344. These estimates have no real timing (20 poses per shot, spread evenly), so
  the hands-stop check, which is what separates a defence from a back-foot punch or flick, can't
  act on them: these rates are the position checks alone. Front-foot analysis: the live build
  passed 72 of 172 back-foot defences (from the ends) as front-foot defences; now 54, the rest
  offered as back-foot defences.
- **The athlete's clips** (bowler's end with black bars at 1920×1080 and 854×480, cropped at 1080
  and 720, mirrored; side-on hand-held at 30 and 15 fps, mirrored): all eight valid back-foot
  defences; analysed as front-foot defences, all eight offered as back-foot defences (the live
  build: none recognised, five called front-foot defences, one passed as a valid front-foot
  defence).
- **Broadcast clips of other shots** (CricketShotQualityAI, 50 clips of cover, straight, lofted
  drives, flicks, pulls, hooks, cuts, sweeps and defences): none accepted as a back-foot defence
  (44 declined for camera cuts and zooms, 6 not confirmed).
- **Generated population** (`tests/backfoot.test.ts`): no front-foot defence, drive, half drive,
  pull or cut accepted; no back-foot defence called another shot.

### Capture, for any video

- **Black bars** (an upright video saved into a wide frame): the picture inside them is found and
  people are looked for there (a batter in a narrow picture was too small for the detector).
- **A panning phone**: the camera's movement is read from the background on every tracked frame
  (`camera-motion.ts`) and taken out before a foot's travel is measured.
- **Batting hand**: side-on, from which foot is nearer the bowler in the stance; never from one or
  two frames of the grip (a stance with the bat raised behind puts the bottom hand on top).

## Real media

The test sets reachable from the build environment (GitHub only) hold few clean back-foot
defences: the published back-foot block clips (UJ-AQA CricketVision, 247 blocks) sit on
Dropbox, which the environment can't reach. Validation therefore rests on the generated
population, every real front-foot and other-shot clip of the existing matrix run as a
back-foot request (none may be accepted), and the broadcast clips that show back-foot blocks.
Clear phone videos of back-foot defences (side-on and from the bowler's end) are the next
thing to add to the matrix.
