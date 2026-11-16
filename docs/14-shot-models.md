# 14 · Shot models: a person's own picture of a correct shot

Asked for by the owner on 2026-11-16 (docs/context.md): place joints on a 3D figure to say why a
shot is correct, export the values as text, save them, and optionally have a shot analysed
against them instead of Aline's own logic. For the front-foot and the back-foot defence.

## What is built

| Piece | Where |
|---|---|
| The model's format, the geometry of placing joints, the measures, the check of a clip | `src/engine/pose-model.ts` (`aline.pose-model/1`, `aline.model-check/1`) |
| Where a new model starts (Aline's generated textbook pose at three moments) | `src/lib/pose-starters.ts`, `pose-starters.json` (made by `scripts/pose-starters.mjs`) |
| Models on the device, and the one in use | `src/lib/pose-models.ts` (localStorage) |
| List, new, import from text | `/models`, `components/model/models-page.tsx` |
| The editor | `/models/edit?m=<id>`, `components/model/model-editor.tsx`, `pose-canvas.tsx` |
| The choice before a check | `components/model/model-choice.tsx`, inside `AnalysisOptions` on `/check` |
| The report set against a model | `components/report/model-check-panel.tsx`, `local-report.tsx`, `report-view.tsx` (`modelCheck`, `modelPanel`) |
| Tests | `tests/pose-model.test.ts` |

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

- The textbook start is generated by Aline, not measured from a player. It is a starting point.
- A model holds poses at moments, not the movement between them.
- From one camera only that camera's plane is compared, whatever the model holds.
- Photos are not checked against a model (a photo can't confirm the shot).
- The printed report and the PDF do not show the model check yet.
- Models are on one device; they move by their text.
- Not verified: a real phone's touch on the joints; Safari.
