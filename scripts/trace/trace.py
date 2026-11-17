# Trace a clip of a batter into line art, frame by frame: the outline of the body and bat,
# and the lines inside it (arms across the body, kit, folds). Writes one line image per frame,
# a review sheet, and the joints each frame was traced around.
import sys, json, os, cv2, numpy as np, mediapipe as mp
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import find_bat, learn_colours, draw
from mediapipe.tasks.python import vision, BaseOptions
video, model, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
first, last, step = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
box = sys.argv[7]  # x0,y0,x1,y1 in the video's own pixels, or "auto"
K = 3  # work at three times the video's size
os.makedirs(outdir, exist_ok=True)
cap = cv2.VideoCapture(video); frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
fps = cap.get(cv2.CAP_PROP_FPS)
pl = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.IMAGE, output_segmentation_masks=True, num_poses=1))
if box == "auto":
    # Where the batter is across the chosen frames, with room for the bat.
    xs, ys, hs = [], [], []
    for i in range(first, last + 1, step):
        f = frames[i]; Hh, Ww = f.shape[:2]
        r = pl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))))
        if not r.pose_landmarks: continue
        px = [p.x * Ww for p in r.pose_landmarks[0]]; py = [p.y * Hh for p in r.pose_landmarks[0]]
        xs += [min(px), max(px)]; ys += [min(py), max(py)]; hs.append(max(py) - min(py))
    h = float(np.median(hs)); Hh, Ww = frames[0].shape[:2]
    x0, x1 = int(max(0, min(xs) - 0.45 * h)), int(min(Ww, max(xs) + 0.45 * h))
    y0, y1 = int(max(0, min(ys) - 0.22 * h)), int(min(Hh, max(ys) + 0.1 * h))
    print("box", x0, y0, x1, y1, "batter height", round(h))
else:
    x0, y0, x1, y1 = [int(v) for v in box.split(",")]
def prepare(f):
    crop = cv2.resize(f[y0:y1, x0:x1], None, fx=K, fy=K, interpolation=cv2.INTER_CUBIC)
    H, W = crop.shape[:2]
    r = pl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))))
    if not r.pose_landmarks or not r.segmentation_masks: return None
    lm = np.array([[p.x * W, p.y * H, p.visibility] for p in r.pose_landmarks[0]])
    m = r.segmentation_masks[0].numpy_view()
    m = cv2.resize(m[:, :, 0] if m.ndim == 3 else m, (W, H))
    person = (cv2.GaussianBlur(m, (0, 0), 2.0) > 0.5).astype(np.uint8) * 255
    return crop, lm, person

picked = list(range(first, last + 1, step))
tiles = []; meta = []; paths = []
ready = []
for i in picked:
    r = prepare(frames[i])
    if r is None: print(i, "no pose"); continue
    ready.append((i, *r))
centres = learn_colours([cv2.cvtColor(cv2.bilateralFilter(c, 9, 50, 9), cv2.COLOR_BGR2LAB)[cv2.erode(p, np.ones((7, 7), np.uint8)) > 0][::7] for _, c, _, p in ready])
prev = None
for i, crop, lm, person in ready:
    bat, deg = find_bat(crop, lm, person, prev)
    if deg is not None: prev = deg
    line = draw(crop, lm, person, bat, centres)
    hasbat = deg is not None
    small = cv2.resize(line, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    cv2.imwrite(f"{outdir}/f{i:03d}.png", small)
    # The same drawing as shapes: the outline of every stroke, to be filled (even-odd).
    ink = (cv2.resize(line, None, fx=2 / 3, fy=2 / 3, interpolation=cv2.INTER_AREA) > 110).astype(np.uint8) * 255
    cs, _ = cv2.findContours(ink, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    d = ""
    for c in cs:
        if len(c) < 8: continue
        c = cv2.approxPolyDP(c, 0.75, True)
        if len(c) < 3: continue
        pts = c[:, 0, :].astype(int)
        # Start point, then steps from point to point (shorter to store than positions).
        d += f"M{pts[0][0]} {pts[0][1]}l" + " ".join(f"{dx} {dy}" for dx, dy in np.diff(pts, axis=0)) + "z"
    paths.append(d)
    meta.append({"frame": i, "t": round(i / fps, 3), "bat": bool(hasbat), "joints": [[round(float(x) * 2 / 3, 1), round(float(y) * 2 / 3, 1), round(float(v), 2)] for x, y, v in lm]})
    tiles.append(cv2.resize(small, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
json.dump({"fps": fps, "step": step, "size": [tiles[0].shape[1] * 2, tiles[0].shape[0] * 2], "frames": meta}, open(f"{outdir}/meta.json", "w"))
# The line Aline reads, per frame: front foot, front knee, front shoulder, head. The front side
# is the one whose foot ends nearer the bowler (the way the batter moves).
J = [np.array(m["joints"]) for m in meta]
moved = J[-1][[27, 28], 0].mean() - J[0][[27, 28], 0].mean()
def front(j):
    left_is_front = (j[27, 0] > j[28, 0]) == (moved > 0)
    a, k, sh = (27, 25, 11) if left_is_front else (28, 26, 12)
    return [round(float(v)) for v in (j[a, 0], j[a, 1], j[k, 0], j[k, 1], j[sh, 0], j[sh, 1], j[0, 0], j[0, 1])]
ground = int(round(float(np.median([max(j[29, 1], j[30, 1], j[31, 1], j[32, 1]) for j in J])) + 6))
json.dump({"size": [(x1 - x0) * 2, (y1 - y0) * 2], "fps": round(fps / step, 3), "ground": ground, "first": first, "step": step, "lines": [front(j) for j in J], "paths": paths}, open(f"{outdir}/paths.json", "w"), separators=(",", ":"))
cols = 6
while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(f"{outdir}/sheet.png", np.vstack([np.hstack(tiles[r:r + cols]) for r in range(0, len(tiles), cols)]))
print("traced", len(meta), "frames; no bat in", [m["frame"] for m in meta if not m["bat"]])
