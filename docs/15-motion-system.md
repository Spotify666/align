# 15 · One motion system for any batting shot

Asked for on 2026-11-18: one skeleton, one bat, one camera model and one set of physical
constraints for every shot, with a new shot added by data and annotations only; the front- and
back-foot defences as regressions, and a mechanically different shot held out. Built in this
session; what was not possible is listed at the end.

## What it is

```
take (aline.motion-take/1) ─┐                      ┌─► home page batter (fixed filmed camera)
                            ├─► fitTake ─► Fitted ─┼─► motion inspector (/models/motion)
shot (aline.motion-shot/1) ─┘   (src/lib/motion)   └─► quality measures (before / after)
                                      │
                         src/engine/rig.ts ◄── the shot-model editor (placeBat, dragHandle)
                                      ▲        and the gloves on the handle (lib/mannequin.ts)
```

| Piece | Where | Does |
|---|---|---|
| The rig | `src/engine/rig.ts` | Two bones reaching for a target with the bend kept in its plane near straight (`twoBone`, `STRAIGHT`); an arm closing on its grip, forearm and hand solved together at the evidence's own wrist bend within the wrist's range (`armToGrip`, `WRIST`); the bat as one rigid body with its grip anchors (`BAT`, `GRIP`, `gripPoint`, `batFrame`); the palm and the forearm's twist (`palmNormal`, `forearmTwistDeg`); points held at fixed distances (`onSphere`, `onTwoSpheres`). Read by no analysis (`tests/rig.test.ts`). |
| Data formats and coordinate systems | `src/lib/motion/types.ts` | A take: real frame times, joints with confidence from one camera (depth labelled) or two or more calibrated views, the bat, events, provenance, truth for generated takes. A shot: events in order, phases with names and cues, grip states between events, impacts, intended contacts. Axes, units, roles. |
| Camera model | `src/lib/motion/camera.ts` | Pinhole projection, weighted linear triangulation, reprojection error. |
| The fit | `src/lib/motion/fit.ts` | Evidence → one skeleton per take (confidence-weighted median of each bone) → confidence-weighted local-linear smoothing on real times, never across an impact → foot states (planted, pivot, heel, slide, lifted) and anchors → each frame solved hierarchically: hips moved if a planted leg can't reach, trunk, shoulders as seen, head, legs (knee toward the evidence, else along the foot), feet (the ankle hung exactly over its planted points, nothing below the ground), arms and bat (both hands, one hand or none, from the shot's grip states). `poseAt` plays it at any time with the same solve. |
| Measures | `src/lib/motion/quality.ts` | On tracked frames and three between each pair: bone spread, grip error, wrist bend, elbow, knee and palm flips, planted drift, lowest foot point, bat-through-leg and shin-through-shin samples, distance from the evidence and from the truth. |
| The old way, and the truth | `src/lib/motion/baseline.ts` | Each frame as tracked with `placeBat` (how the home page played until now), and a generated take's truth, played the same way, for comparison only. |
| Views | `src/lib/motion/view.ts` | Filmed camera, side-on, bowler's end, turned round. Turning round only when the take saw depth (`canOrbit`). |
| Takes | `public/motion/takes/*.json`, made by `node scripts/motion/takes.mjs` (`scripts/motion/takes.ts`) | The owner's traced side-on front-foot defence; generated balls seen by the generator's two calibrated cameras (`FIXTURE_CAMERAS`), with truth. |
| Shots | `public/motion/shots/*.json` | Front- and back-foot defence, drive, cut, pull. |
| Inspector | `/models/motion`, `components/model/motion-inspector.tsx` | Any take, played or stepped at full, half or quarter speed, from any view it supports, close-ups of hands and feet, overlays (elbow bend planes, forearm axes and palms, grip anchors, foot states), before and after, and the measures of both. |
| Report and sheets | `node scripts/motion/report.mjs`, `node scripts/motion/sheets.mjs` | The table below; the contact sheets in `docs/motion/`. |

## Coordinate systems

- **World**: forward toward the bowler, up against gravity, across toward the batter's off side;
  the ground is up = 0. Units: body heights (a take in metres gives its stature).
- **Camera**: a 3 × 4 pinhole matrix, world to image pixels, said to be calibrated or estimated.
- **Body**: each bone from parent to child; joints named by role (front, back), so a left-hander's
  sides come from their batting side (`ROLE_OF`) and nothing is mirrored.
- **Bat**: along (handle point to toe), the face's normal, across the blade. The handle point is
  where the two gloves meet; a tracked handle marks the top hand's grip, `GRIP.top` above it.
- **Wrist mark**: a pose tracker's wrist is the joint; the engine's generator draws no hands and
  its "wrist" is at the grip, so a generated take says `wristMark: "grip"` and is moved a hand's
  length back on the way in (truth too).

## Adding a shot: a worked example (the pull)

Nothing in `src/engine/rig.ts` or `src/lib/motion/` was changed to add the pull, the cut or the
drive; they were added after the fit's settings were chosen on the defences.

1. The motion: a take, `public/motion/takes/gen-pull.json` (here generated by
   `scripts/motion/takes.ts` from `pullScript()`, seen by two calibrated cameras; a real take would
   carry its own cameras or one camera's 3D estimate, its frame times and confidences).
2. Its events, in the take: `"events": { "backlift_top": 0.7, "foot_down": 0.6667, "contact": 0.8833 }`.
3. The shot file, `public/motion/shots/pull.json`:

```json
{ "schema": "aline.motion-shot/1", "shot": "pull", "label": "Pull",
  "events": [{ "id": "backlift_top", "label": "Top of the backlift" }, { "id": "foot_down", "label": "Foot down" }, { "id": "contact", "label": "Contact" }],
  "phases": [
    { "id": "backlift", "label": "Backlift", "cue": "The bat goes up high as the back foot goes back.", "from": "start", "to": "backlift_top" },
    { "id": "swing", "label": "Swing", "cue": "The hips and shoulders turn to leg; the bat swings across, arms extended.", "from": "backlift_top", "to": "contact" },
    { "id": "follow", "label": "Follow-through", "cue": "The wrists roll the bat over; it finishes round the body.", "from": "contact", "to": "end" }],
  "grip": [{ "from": "start", "state": "both" }],
  "impacts": ["contact"] }
```

4. Open `/models/motion?take=gen-pull`. A one-handed finish is one more grip entry
   (`{ "from": "contact", "state": "top" }`): `tests/motion-fit.test.ts` fits the drive that way.

Phases are bounded only by events whose order is the same in every take of the shot ("foot down"
comes before or after the top of the backlift depending on the batter, so it is an event, not a
boundary).

## Measured

`node scripts/motion/report.mjs` (this session). Before: each frame as tracked, blended straight
between frames, the bat put in the hands (the home page until today). After: the fit. Source: the
generated truth itself, played the same way. Centimetres on the take's batter; samples are the
tracked frames and three between each pair (about 320 per generated take, 181 for the real one).
Tuning set: the defences. Held out: drive, cut, pull.

| Take | | Bone spread % | Wrist bend ° | Elbow / knee flips | Palm flips | Planted drift cm | Lowest foot cm | Bat through leg | Evidence mean / worst cm | Truth mean / worst cm |
|---|---|---|---|---|---|---|---|---|---|---|
| real FFD (one camera) | before | 49.8 | 25.0 | 0 / 0 | 0 | 12.1 | 1.7 below | 0 | 2.2 / 32.3 | none |
| | after | 0.0 | 25.0 | 0 / 0 | 0 | 0.0 | 0.0 | 0 | 3.8 / 12.3 | none |
| gen FFD | source | 105.8 | 20.9 | 0 / 0 | 0 | 4.3 | 2.0 | 11 | | |
| | before | 106.6 | 25.0 | 0 / 0 | 1 | 6.9 | 0.4 | 0 | 2.6 / 29.0 | 2.8 / 38.1 |
| | after | 0.0 | 25.0 | 0 / 0 | 1 | 0.0 | 1.8 | 9 | 2.0 / 22.0 | 2.1 / 32.3 |
| gen FFD, back heel pivoting | before | 137.2 | 25.0 | 0 / 0 | 1 | 6.8 | 0.2 | 0 | 2.6 / 28.1 | 2.8 / 37.9 |
| | after | 0.0 | 25.0 | 0 / 0 | 0 | 0.0 | 1.9 | 9 | 2.3 / 21.8 | 2.4 / 31.2 |
| gen FFD, another batter | before | 209.8 | 25.0 | 0 / 0 | 0 | 6.9 | 0.1 | 6 | 2.6 / 25.7 | 2.8 / 40.4 |
| | after | 0.0 | 25.0 | 0 / 0 | 0 | 0.0 | 1.9 | 10 | 2.8 / 25.3 | 2.8 / 43.7 |
| gen BFD | before | 39.2 | 25.0 | 1 / 0 | 1 | 9.2 | 0.0 | 10 | 2.3 / 25.5 | 2.4 / 20.6 |
| | after | 0.0 | 25.0 | 0 / 0 | 0 | 0.0 | 1.8 | 9 | 1.2 / 10.1 | 1.2 / 23.2 |
| gen BFD, another batter (1.62 m) | before | 73.2 | 25.0 | 0 / 0 | 1 | 12.9 | 0.2 | 0 | 2.4 / 15.6 | 2.6 / 15.3 |
| | after | 0.0 | 25.0 | 0 / 0 | 0 | 0.0 | 1.9 | 4 | 2.1 / 9.7 | 2.1 / 9.8 |
| **gen drive (held out)** | source | 410.5 | 23.5 | 1 / 0 | 1 | 5.2 | 2.0 | 18 | | |
| | before | 412.8 | 25.0 | 0 / 0 | 0 | 6.7 | 0.3 | 18 | 3.0 / 26.5 | 3.0 / 32.8 |
| | after | 0.0 | 25.0 | 1 / 0 | 1 | 0.0 | 1.4 | 25 | 4.2 / 66.7 | 4.3 / 71.5 |
| **gen cut (held out)** | before | 153.6 | 25.0 | 0 / 0 | 0 | 4.5 | 0.6 below | 0 | 2.5 / 22.7 | 2.7 / 28.7 |
| | after | 0.0 | 25.0 | 0 / 0 | 1 | 0.0 | 1.9 | 0 | 1.2 / 24.0 | 1.4 / 22.1 |
| **gen pull, wrist hidden (held out)** | before | 91.3 | 25.0 | 0 / 0 | 3 | 5.9 | 0.2 | 0 | 2.5 / 17.3 | 2.7 / 19.2 |
| | after | 0.0 | 25.0 | 0 / 0 | 0 | 0.0 | 1.8 | 13 | 1.7 / 12.0 | 1.8 / 23.0 |

Grip error (a holding wrist's distance from its anchor minus a hand's length): 0.0 cm before and
after on every take, both use the rig. Reprojection of the fit, mean / worst pixels, side-on and
bowler's end: 5.5–12.3 / 30–185 and 10.0–19.2 / 57–247. Fit time 4–70 ms a take in Node.

**Reading it, including the worst cases**

- Every bone and the bat keep one length on every frame and between frames (before: up to 413%);
  planted points don't move (before: up to 13 cm); no foot below the ground (before: 1.7 cm below
  on the real take).
- The real take: the fit sits 3.8 cm from its evidence on average (12.3 at worst), against 2.2
  for the old way, which followed the evidence by stretching the arms (the back upper arm from
  11.7% to 19.6% of height across the take).
- **The generated truth is not a rigid body.** Its arms stretch (the source's own bone spread is
  17–410%): where the hands are scripted beyond the arms' reach the generator puts the wrist there
  anyway. The fit keeps lengths, so it can't follow, and the worst distances show where: the
  drive's follow-through, 67 cm from the evidence at the bottom wrist, which the arm cannot reach.
  That case also has one elbow flip, which the source has too (its elbow jumps 21 cm in one frame);
  the fit's comes one frame earlier.
- **Bat through a leg**: counted, not resolved. The generated source itself does it 0–18 times a
  take. The fit's 13 on the pull are three stance frames where the grounded bat is 2 mm inside the
  clearance allowed round the back thigh, counted at each of four samples.
- Wrist bend sits at its 25° limit on every take: the trackers' wrists and the two-point bat put
  the hand anywhere round the grip, and the rig holds it inside a grip's range.

## Tests

- `tests/rig.test.ts`: lengths for any target; never past an unreachable one; no flip through
  straight under a wandering pole; arms on their grip with a bend from the evidence (many
  different bends, never one) within the range; what an unreachable grip reports; points at two
  fixed distances; read by no analysis.
- `tests/motion-fit.test.ts`: on every take, held-out shots under the same limits: rigid bones,
  hands on anchors, wrists in range, planted points held, nothing in the ground, flips no more than
  the source's, close to the evidence and the truth (mean under 5 cm: the capture noise and the
  generator's stretching arms), each camera agreeing, frames played as fitted and phases changing
  at their events at any speed; a release after contact; a hidden wrist placed by the grip and
  continuous at 240 samples a second; one take never fitted as another shot; one-camera takes never
  turned; the editor's far drag keeping every length.

## Applied in the app

- **Home page batter** (`components/home/motion-figure.tsx`): plays the fitted real take from the
  filmed camera (it used to drift 16–26° round a one-camera take); phases and cues from the shot
  file, changing exactly at the events; "Filmed by one camera, so shown from where it stood."
- **Landing** (`components/landing/batter-figure.tsx`): the caption names the phase the frame is
  in (backlift from frame 8 to 14, stride from 15, contact from 24), so "Backlift" is no longer
  shown over a bat already coming down (frames 15 to 17 before).
- **Editor** (`placeBat`, `dragHandle` in `pose-model.ts`): the rig's grip anchors and two-bone
  reach; the wrist bend comes from where the wrist is (no fixed 15°); the bottom elbow's preferred
  direction turns with the trunk (no fixed world direction). The gloves are drawn on the same
  anchors (the bottom glove was 0.5% of height away from where the solver put the hand).
- **Front-foot starters** (`pose-starters.ts`): across positions from the front-foot clip itself,
  labelled an estimate in the editor, no longer the back-foot clip's.

## Not done, not verified, and why

- **MyoSuite and Brave**: the MyoSuite demo, its model pages and the paper could not be opened
  from this session (the network proxy refuses them), and Brave is not installed; checks used
  Chromium. Nothing of MyoSuite or MuJoCo is used; no offline physics prototype was run. The
  joint axes follow the ISB description in outline (bend planes, a separate forearm twist), not a
  per-joint ISB frame.
- **Source footage**: the owner's clips are not in the session. The real take is the trace already
  in the repository (smoothed when traced, with no per-joint confidence: 0.8 is assumed). No new
  tracing, no second camera of a real ball, no real drive, cut or pull.
- **Bat roll and depth**: never observed (two points give the long axis only); the face is the
  rig's estimate everywhere, and on the real take the bat's across direction is zero, as traced.
- **Left-handers**: no left-handed reference exists; none is shown, nothing is mirrored. Only
  role naming is tested.
- **Collisions** are measured, not resolved. **Centre of mass and forces** are not computed; no
  ground reaction, grip force or torque is shown or claimed.
- **Ball**: not simulated or drawn in the motion system.
- **A cricket coach** has not reviewed the examples; they are not published as teaching references.
- **Real phones** (touch, WebGL speed) were not checked; Chromium at phone width with a software
  renderer was.
