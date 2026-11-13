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
