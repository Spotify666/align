# Tracing a clip into line art

The landing page's batter is traced, frame by frame, from a real clip of a front-foot defence
that the owner sent for this (2026-11-13). The clip itself is not in the repository; only the
drawing made from it is (`public/art/front-foot-defence.json`).

What the tracer does (`trace.py`), per frame:

1. Finds the batter with the app's own pose model (`public/models/pose_landmarker_full.task`)
   and takes the model's outline of the body.
2. Finds the bat: the long, thin, pale strip that starts at the hands (tried in every
   direction; the one that is pale along its length and not beside it).
3. Draws the body's outline; inside it, the borders of skin, shoes, hair and the kit's trim,
   and long edges (a sleeve across the chest, one leg in front of the other); then the bat in
   front, with the hands over it.
4. Stores the drawing as filled shapes (start point, then steps), and the joints the line is
   read at: front foot, front knee, front shoulder, head.

To trace another clip (Python 3 with `numpy`, `opencv-python-headless`, `mediapipe`; on Linux
also `libegl1`):

```bash
python scripts/trace/trace.py <clip.mp4> public/models/pose_landmarker_full.task <out-dir> <first-frame> <last-frame> <step> auto
```

```bash
cp <out-dir>/paths.json public/art/front-foot-defence.json
```

```bash
python scripts/trace/still.py public/art/front-foot-defence.json src/lib/traced-batter.ts <stance>,<backlift>,<stride>,<contact>
```

`<out-dir>/sheet.png` shows every traced frame for a look before it is used. The four numbers
are frame positions in the traced sequence (0 is the first traced frame).

Only trace clips the owner has the right to use. A left-handed batter needs their own clip:
a tracing is never mirrored.

## The shot-model figure (`rig.py`)

The figure people place joints on (/models/edit) is traced the same way (`lib.py` is shared), at
the moments a model holds, with the joints the drawing hangs on and the bat apart from the body:

```bash
python scripts/trace/rig.py <clip.mp4> public/models/pose_landmarker_full.task public/art/model-ffd-side.json front_foot_defence side side_on backlift=46,foot_down=55,contact=61
```

```bash
node scripts/pose-starters.mjs > src/lib/pose-starters.json
```

The frames are the moments Aline found in the clip (its saved analysis). Made on 2026-11-17 from
the owner's `side_ffd` (backlift 46, foot down 55, contact 61) and `side_bfd` (53, 59, 65, picked
from its traced frames). `tests/traced-figure.test.ts` checks the files and the starting poses.

From the bowler's end (the batter is small there, so `rig.py` works at six times the clip's size):

```bash
python scripts/trace/rig.py <end_net.mp4> public/models/pose_landmarker_full.task public/art/model-bfd-front.json back_foot_defence front front_on backlift=25,foot_down=27,contact=29
```

Contact (29) is the moment Aline found; 25 and 27 were picked from the traced frames.

The whole movement for the home page's figure (`components/home/motion-figure.tsx`), every frame
from the stance to the end of the stroke, smoothed over time:

```bash
MOTION_OUT=public/art/motion-ffd-side.json python scripts/trace/rig.py <side_ffd.mp4> public/models/pose_landmarker_full.task /tmp/rig.json front_foot_defence side side_on backlift=46,foot_down=55,contact=61
```
