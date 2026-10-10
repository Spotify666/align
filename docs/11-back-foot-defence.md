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

## Identification

The classifier already knew the back-foot defence (prototype bands from the generated
population: back foot travels back, little forward stride, head stays tall, dead bat met
waist-to-chest high). Analysing a back-foot defence uses the same strict, asymmetric gate
as the front-foot defence, centred on the back-foot defence:

- accepted only with P(back-foot defence) ≥ 0.80, a clear margin and enough evidence;
- another shot is named only when it clearly leads (a front-foot defence, a pull, a cut);
- **went back and stayed tall**: side-on the back foot must have moved back (≥ 4% of
  height) or the front foot come back toward it; from either end the front foot must not
  have strided forward and the head must not have gone down into a front-foot stroke;
- a zooming camera never names a different shot.

## Real media

The test sets reachable from the build environment (GitHub only) hold few clean back-foot
defences: the published back-foot block clips (UJ-AQA CricketVision, 247 blocks) sit on
Dropbox, which the environment can't reach. Validation therefore rests on the generated
population, every real front-foot and other-shot clip of the existing matrix run as a
back-foot request (none may be accepted), and the broadcast clips that show back-foot blocks.
Clear phone videos of back-foot defences (side-on and from the bowler's end) are the next
thing to add to the matrix.
