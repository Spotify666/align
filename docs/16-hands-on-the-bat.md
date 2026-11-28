# 16 · Hands on the bat: the illustrations and the demonstrations

Asked for on 2026-11-20: the hands, wrists, elbows and bat of the right-handed front-foot defence
should move together convincingly through the whole shot, in the sample's evidence viewer, on the
landing page and in the shot-model editor. Pictures before and after: `docs/hands/`.

## What was wrong, and why

**The sample (`/sample/valid_ffd`, Evidence, Tracked).** At frame 85 a marker hung under the grip,
and by contact the wrists were back beside the handle. The viewer draws the tracks as given, so the
cause was the data. The generator (`src/engine/fixtures/generate.ts`) put both wrist marks on the
bat line wherever the script put the hands, then fitted each elbow afterwards with a two-bone solve
that silently clamped. Where the scripted grip was too close to the shoulder the arm folded shut;
where it was too far, the forearm stretched. Measured on the generator's own truth for the sample
(`node scripts/motion/grip.mjs valid_ffd`):

| | Before | After |
|---|---|---|
| A hand's distance from its grip, top / bottom (cm off a hand's length) | 8.8 / 6.4 (no hand: the wrist on the handle) | 0 / 0 |
| An arm bone changing length over the shot | 13.3 cm (a forearm 33-51% too long after contact) | 0 |
| Rear elbow at the top of the backlift | 164° (folded shut: its marker under the grip) | 125° |
| Blade's clearance from the front pad | 1.1 cm inside it | 2.4 cm clear |
| Elbow flips, hands swapped | 1, 0 | 0, 0 |

The script also had the lead elbow pointing down at contact (a defence's front elbow is high), the
ball meeting the bat inside the front pad, and the hands pushing on after contact past the rear
arm's reach.

**The landing's traced batter.** Its stops jumped from Stride (traced frame 18, the bat still up) to
Contact (frame 32, the blade lowered and swung back along the pad, the hands over the torso): the
downswing between had no stop, and the contact still was the frame where the grip reads least.

**The landing's contact card** (the engine's measured example) drew the bat and no arms or hands.

**The editor.** Dragging the bat's toe round in the Front and 3D views of a back-foot model could
cross the forearms (the bottom hand's wrist above the top hand's on the handle: 3 and 12 of 121
positions) or put the blade through a leg (3 of 121).

## What changed

- **The generator** (`grip: "rigid"` on a script): one rigid bat with two grip points (the top
  hand's at the handle mark, the bottom hand's the rig's spacing below), each wrist a hand's length
  behind its grip, each arm of fixed length reaching it with the rig's own solve (`armToGrip`,
  `src/engine/rig.ts`), its elbow keeping its bend direction from frame to frame. A grip just beyond
  reach brings the shoulder forward on the chest by at most 5 cm, never a stretched bone. `onFrame`
  hands out each frame's truth for checking (`src/engine/fixtures/grip-report.ts`).
- **The front-foot script** (`ffdScript({ hold: true })`): the top of the backlift back and out
  from the striding body, the lead elbow coming up and forward as the bat comes down, a short
  follow-through at contact height within the rear arm's reach, and the ball's line a little
  outside the front pad, so the blade meets it clear of the pad and it goes back from there.
  Used by the sample, its siblings, the baseline deliveries and the 3D session (the landing card).
- **Evidence viewer**: each hand drawn from the wrist to its nearest point on the tracked handle
  (`handOnBat`, `src/lib/viz.ts`), only when both were tracked and the wrist is within a hand and a
  half; dotted when either is unsure (an occluded grip); never drawn on the blade or from a wrist
  that isn't holding the bat. It joins two measured things and adds no landmark: real clips are
  graded on their measured landmarks exactly as before.
- **Landing batter**: six phases (stance, backlift, stride, downswing, contact, follow-through)
  with the frame each begins on, and a stop in each after the stance; contact is held on traced
  frame 25, the blade upright beside the pad with the hands clear of the torso
  (`scripts/trace/still.py`, `src/lib/traced-batter.ts`).
- **Contact card**: both arms to their hands on the handle, the lead arm and hands in the text
  colour, the rear arm and the bat quieter.
- **Editor** (`dragHandle`): an edit that would cross the forearms or put the blade through a leg is
  refused, the last pose the batter can hold staying (`heldNaturally`); a saved model already
  outside that can still be moved back.

## What did not change, and why

The engine's validation population, its metamorphic suite and the drive, half-drive, cut and pull
scripts keep their old arms, byte-identical (156 golden cases: status and reason identical; only
the 26 demonstration fixtures' stored numbers change). Applied to the population, the same rigid
grip lowered front-foot acceptance from at least 95% to 92% and called one generated defence a
different shot: the engine was judged against wrist marks on the handle, where a pose tracker
puts the wrist a hand's length behind. That is a finding about real footage, not something to tune
here: changing the benchmark or a detector needs labelled real clips (CLAUDE.md, docs/12).

## Checked (2026-11-20/21)

- `tests/fixture-grip.test.ts` (50 checks: every demonstration, both batting sides; the population
  unchanged), `tests/editor-bat.test.ts` (the toe right round in Side, Front and 3D at every moment
  of both shots; each hand dragged past its reach six ways), `tests/hand-on-bat.test.ts`.
- In Chromium at phone width: the sample's frames 80-106 and the follow-through to 180; the
  landing's five stops and its card (motion and reduced motion); the editor, a right-handed and a
  left-handed front-foot model and a right-handed back-foot model, the toe dragged by pointer round
  Side, Front and 3D, saved and reloaded with the bat kept; no page errors.
- `npm run lint`, `typecheck`, 746 tests, `build`, `check:pages`.

## Not done or not verified

- The landing's tracing is from a clip that isn't in the repository, and its four tracked points
  don't match the real take's (6-8% of height apart at every offset), so the measured hands could
  not be drawn on it; its grip is as traced.
- Other shots' scripts (drive, pull, cut) put the hands up to 69 cm beyond a rigid arm's reach;
  they were not rewritten.
- The bat's face (roll) is still never shown as measured. A real phone's touch drag, Safari.

## Fingers round the handle (2026-11-28)

The owner: "See fingers on wrist give a different feel of the hold. I guess that's what you are
missing, focus on that." Each gloved hand was a cuff, a palm and one round fist on the handle:
nothing showed it holding. Now (`fingersRound` in `src/lib/mannequin.ts`) four fingers lie side by
side along the handle, little finger toward the top for both hands, each in three segments curling
from the knuckles behind the handle round its far side (250 to 285 degrees); the thumb comes round
the other way onto them. The two hands are mirror images, so both wrap the same way round the
handle. They are drawn on the grip anchor the arm reaches, so they turn with the bat.
`tests/mannequin.test.ts` holds every finger joint just off the handle's surface, within the hand's
width of its grip. Drawing only: no measure, fit or analysis reads it.

Tried the same day and not kept: holding the hand's line at a set angle to the handle in the
motion fit. With the owner's clip it bent the wrists up to 166 degrees and flipped palms in the
held-out shots (drive 1 to 12), so the tracked forearms and the bat's direction can't both hold with
it. The clip has no hand points (the pose model gives a wrist only); a hand tracker on the clip would
give how the hands really turned. Needs the clip file.
