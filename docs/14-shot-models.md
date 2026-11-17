# 14 · Shot models: a person's own picture of a correct shot

Asked for by the owner on 2026-11-16 (docs/context.md): place joints on a 3D figure to say why a
shot is correct, export the values as text, save them, and optionally have a shot analysed
against them instead of Aline's own logic. For the front-foot and the back-foot defence.

## What is built

| Piece | Where |
|---|---|
| The model's format, the geometry of placing joints, the measures, the check of a clip | `src/engine/pose-model.ts` (`aline.pose-model/1`, `aline.model-check/1`) |
| Where a new model starts: the real batter traced from the owner's side-on clips, at three moments (and the way the bat pointed) | `src/lib/pose-starters.ts`, `pose-starters.json` (made by `scripts/pose-starters.mjs` from `public/art/model-*-side.json`) |
| The figure: line art traced from those clips (`aline.traced-figure/1`), bent to the joints as they move | `scripts/trace/rig.py` (shares `scripts/trace/lib.py` with the landing's tracer), `public/art/model-ffd-side.json`, `model-bfd-side.json`, `src/lib/traced-figure.ts` |
| The optional bat (held in both hands; its toe sets its angle; checked only on clips whose bat was tracked) | `pose-model.ts` (`placeBat`, `bat_handle` / `bat_toe`, four bat measures) |
| Models on the device, and the one in use | `src/lib/pose-models.ts` (localStorage) |
| List, new, import from text | `/models`, `components/model/models-page.tsx` |
| The editor | `/models/edit?m=<id>`, `components/model/model-editor.tsx`, `pose-canvas.tsx` |
| The choice before a check | `components/model/model-choice.tsx`, inside `AnalysisOptions` on `/check` |
| The report set against a model | `components/report/model-check-panel.tsx`, `local-report.tsx`, `report-view.tsx` (`modelCheck`, `modelPanel`) |
| Tests | `tests/pose-model.test.ts`, `tests/traced-figure.test.ts` (generated poses for clip checks: `tests/helpers/generated-poses.ts`) |

## The model

- **Joints** by role (front / back; the top hand is the front wrist), 17 of them, the engine's own.
- **Axes** as everywhere in the engine: forward (toward the bowler), up, across (toward the off
  side). **Units**: body heights; centimetres are shown and exported when the height is given.
- **Moments**: contact (always), and optionally "foot down" and "top of the backlift". Each is
  matched to the moment Aline finds in a clip (`contact`, `front_foot_plant` or
  `back_foot_commit`, `backswing_top`).
- **Angles**: placed from the side and the front (a full 3D pose), or from one of them only. A
  single-angle model fixes one plane; the other axis is written as null in its text and it is
  checked only against clips filmed from that position.
- **Batting side**: the side it was made for. It is never applied to the other side (standing
  rule 7); a left-hander's figure is drawn as a left-hander seen from their own off side.
- **Tolerance**: how close a clip must be (degrees for an angle, a share of height for a
  distance). The author's own, saved in the model. Not an engine threshold, not in the registry.
- **Note**: why this is right, in the author's words.

## Placing joints

One projection serves Side, Front and 3D (the camera on the off side, at the bowler's end, or
turned anywhere between). A joint is dragged in the plane of the picture; **no bone changes
length** (tested for every handle, any target):

- hips: the body moves, the feet stay planted, the knees bend to suit;
- chest: the trunk leans about the hips, carrying the head and arms;
- a shoulder or a hip: the line of the shoulders or hips turns about its centre;
- an elbow or a knee: swings about the shoulder or hip;
- a hand or an ankle: goes where it is put, the elbow or knee bending to suit;
- head, heel, toe: swing about the neck or the ankle.

A joint's place can also be typed. The figure has standard proportions, or the batter's own
measurements from Profile.

## Checking a clip

`checkAgainstModel(model, obs, payload)` is pure: it reads the stored result and tracks and
changes neither (tested). It is applied only when **all** of these hold, and says which one
doesn't otherwise:

1. Aline confirmed the clip as the model's shot (`analysis_status: valid`, the same
   `requested_shot`). A model never decides which shot was played (standing rule 1).
2. The batter's side is the one the model was made for.
3. The clip was filmed from a position the model was placed from (side-on; or front-on / behind).
4. It is a video and Aline found contact.

The model and the clip are read by the **same functions**, each in one camera's plane (20
measures: 12 from the side, 8 along the pitch). `tests/pose-model.test.ts` holds every measure
to the true pose of generated movement from the side, the bowler's end and behind, for both
hands (within 7° and 5% of height: a phone's lens is not a flat projection).

That test removed three measures that one camera cannot read reliably: an elbow's bend (an arm
pointing at the lens is foreshortened: 11° wrong on the textbook clip) and the tilt of the
shoulders and hips seen along the pitch (the two ends sit one behind the other: 20° wrong). The
elbow's height and the shoulders' and hips' levels are read instead.

In the report, when a model is applied, its findings lead the summary ("Checked against your
model: …", how many checks match, the largest differences in words, never a minus sign); Aline's
own checks stay in Evidence. Where it isn't applied, Aline's summary stays and the reason is
added. The choice is kept with the analysis (`session.modelId`) and can be changed on any saved
report.

## Checked

- 21 tests: bone lengths, planted feet, the clip read as the model is, application rules, real
  tracks, the text out and back, the analysis untouched.
- In a browser at phone width: new model, drag, undo, the three views, export, save.
- The owner's three real clips through the capture flow with a model chosen (about 30 s each):
  side-on front-foot defence (7 of 12 checks match the textbook start), side-on back-foot
  defence (7 of 12), back-foot defence from the bowler's end (5 of 7).
- No file of the analysis reads the model; the 156 golden results are unchanged.

## Limits, said plainly

- The start is one real batter (the owner, right-handed) at one ball: a starting point, not a
  standard. Its moments were read from Aline's analysis of the front-foot clip; the back-foot
  clip's were picked from its traced frames by eye (the capture test could not run it that day).
- Tracings exist side-on for both shots and from the bowler's end for the back-foot defence
  (traced at six times the clip's size: the batter is small in it). There is no front-foot
  defence from the bowler's end: that view shows the back-foot tracing, moved with the joints,
  and says so, and the front-foot starting pose borrows its across positions from it (the side
  clip's depth estimate put the head 29% of height to the off side). A front-on front-foot clip
  would replace both. A left-hander sees joints and bones only (never mirrored).
- The side-on and bowler's-end clips are two different balls, so a tracing starts as traced,
  standing where the model stands, and moves only by how far each joint is moved from the start
  (`followFrom`); its joints sit near, not exactly on, its lines from the other take.
- A drawing bent far from the traced pose stretches: it follows the nearest bones, so a joint
  moved a long way pulls the lines near it.
- A model holds poses at moments, not the movement between them.
- From one camera only that camera's plane is compared, whatever the model holds.
- Photos are not checked against a model (a photo can't confirm the shot).
- The printed report and the PDF do not show the model check yet.
- Models are on one device; they move by their text.
- Not verified: a real phone's touch on the joints; Safari.

## The figure, changed (2026-11-17)

The owner, of the drawn figure: "This thing doesn't feel like a human… we should be giving bat as an
additional option", then of a filled mannequin: "the base model itself is wrong. Do not use this
figure at all", with a reference: line art of a batter traced from film. That video is not the
owner's, so nothing of it is used. What ships:

- **A real batter**: the owner's own side-on clips, traced into line art at each moment
  (`scripts/trace/rig.py`), and the starting pose is that batter's tracked joints, not a generated
  pose.
- **The drawing bends with the joints**: each point of it is tied to the nearest one or two bones
  (`src/lib/traced-figure.ts`); at the traced pose it is the tracing exactly (tested).
- **The bat** is optional ("Add a bat"): held in both hands (moving a hand moves both), its toe
  sets its angle, saved in the text; four measures (its angle and where its toe is, from the side
  and from the bowler's end), compared only when the clip's bat was tracked.

### Every angle (2026-11-17, later)

"Add the front view drawing too. All angles covered for both shots." The bowler's-end clip is
traced again, larger (`rig.py` scales a small batter up), for all three moments; the drawing bends
in 3D (each line keeps its bone's depth), so it shows from the side, from the front and at any 3D
turn (the side tracing up to 45°, the bowler's-end one beyond); a moment whose clip didn't show the
bat clearly draws a full-size bat in the hands instead.

### A cut-out, not a stretch (2026-11-17, later)

The owner, on a 3D turn and on a hand dragged far: "The arcs don't give the real idea of a human
being. It's all messed up… There is no way this is called a good representation." Both were right:
each traced line was one closed outline whose points blended between two bones, so a joint moved
far dragged it across the body, and in 3D a line bent round a bone pointing at the camera tore.
Now each point belongs to one part only and a traced line is cut where it passes to the next part,
so every part (head, trunk, each upper arm, forearm, thigh, shin, foot) moves rigidly with its bone,
like a cut-out pinned at the joints; at worst a small gap opens at a joint. In 3D a tracing is a flat
cut-out on its own plane at the hips' depth.

## The mannequin (2026-11-17, evening)

The owner pointed to a 3D posing tool (posemaker.org/editor, a jointed wooden-style mannequin):
"refer to this site for the accurate depiction of it. Try to blend this depiction with the current
model so it becomes accessible and makes it easy for someone who is registering the data points of
body." Nothing of that site is copied: Aline draws its own mannequin.

- **A mannequin built from the joints** (`src/lib/mannequin.ts`, `components/model/mannequin-view.tsx`):
  every limb hangs between two placed points, with a ball at each joint, an egg-shaped head behind
  the nose, a chest, waist and hips, mitten hands, feet on the ground, and the bat when held. It is
  the pose given a body, so it never tears or stretches, and it reads the same from the side, the
  front and any 3D turn, for both shots and both batting sides (it is built, never mirrored).
- **Drawn in 3D (three.js) under the joint dots**, with the same camera, so a dot sits on its joint.
  Softly lit, a warm neutral in either theme; the parts the picked handle moves in the accent.
  Drawn only when something changes; loaded only on the editor. Without WebGL the joints and bones
  are shown.
- **The traced batter stays** as the other choice ("Mannequin" / "Traced batter").
- Tests: `tests/mannequin.test.ts` (every part on its placed points, at every moment of both
  shots and after far drags of every handle; the bat only when held).
- **The grip** (the owner: "Holding of the bat is nowhere close to what a human holds it like"):
  with a bat, both hands close round the handle as fists, the top hand (the front wrist's) just
  above the bottom one, each joined to its wrist by the palm; without a bat, open hands.
- **A cricketer, not a manikin** (the owner: "You are doing an exact rip-off; add a touch of a
  cricketing athlete… so it looks polished and crafted for this solution"): cream whites with the
  joints rounded in the same cloth, a navy helmet with its peak and steel grille, batting pads with
  three ridges and a knee roll, gloves with cuffs, white spiked shoes with dark soles, a willow
  blade on a dark rubber grip (`Part.tone` in `src/lib/mannequin.ts`). Orange stays the line and
  the part picked.
- **Both hands on the bat** (the owner, with a coaching photo: "Right hand is not in sync with how a
  human holds the bat… similarly check the back-foot defence"): with a bat, each arm reaches from its
  shoulder (bone lengths kept) to its place on the handle, the top hand just above the bottom one;
  the top elbow keeps its bend (high and forward), the bottom elbow drops down and a little forward, tucked in front of the
  hip (`placeBat`, `GRIP` in `pose-model.ts`). A side-on clip of a right-hander can't see that arm
  (it is behind the body, where the tracker guesses), so it is solved, not copied. Tested on every
  moment of both shots.
- **The wrist** (the owner: "There is no concept of wrist… that's why it's not matching the human
  thing"): each wrist sits a hand's length (`GRIP.hand`, about 9 cm) back from the handle, on the side
  its arm comes from, and the gloved hand runs from the wrist to the handle at its own angle before
  closing round it, so the hand bends at the wrist as a batter's does. Where an arm can't reach that
  far, the bat comes toward the hands until both hold it.
- **The wrists through the stroke** (the owner: "right wrist angle seems off with movement"): each
  wrist sits mostly behind the handle (opposite the face, `GRIP.behind`), a little toward its own arm,
  so the hands keep their angle on the handle as the bat swings; the bottom elbow bends down and a
  little forward, tucked in front of the hip ("right elbow rotation is not in sync").
- **The hand on the line of the forearm** (the owner: "right side wrist facing upwards, left side
  wrist downwards, the core human motion logic is missing"): each arm reaches with the forearm and
  hand as one line from the elbow to its grip, the wrist bent only a little (`GRIP.cock`, 15°) toward
  the back of the handle, both bones keeping their lengths. Tested: the wrist bend under 25° on every
  moment of both shots.
