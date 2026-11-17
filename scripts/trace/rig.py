# The shot-model figure (/models/edit), traced from a real clip: at each moment, the batter's
# line art and the joints it hangs on, in the model's own units (body heights), so the editor
# can bend the drawing with the joints a person moves (components/model/traced-figure.tsx).
#
#   python scripts/trace/rig.py <clip.mp4> public/models/pose_landmarker_full.task <out.json> \
#       <shot> <view: side|front> <camera: side_on|front_on> <moment=frame,...>
#
# What comes out, per moment: the starting pose (every joint: forward, up, across), the bat (its
# handle where the top hand holds it, and its toe), and the drawing in the picture's own plane
# (side: forward and up; front: across and up), apart in three layers: the body's lines, the
# bat's outline, the hands' outlines (drawn over the bat). Positions in thousandths of the
# batter's height. The clip is the owner's own (scripts/trace/README.md); a right-hander's
# drawing is never mirrored for a left-hander.
import sys, json, os, cv2, numpy as np, mediapipe as mp
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import find_bat, learn_colours, layers
from mediapipe.tasks.python import vision, BaseOptions

video, model, out_path, shot, view, camera = sys.argv[1:7]
moments = {k: int(v) for k, v in (m.split("=") for m in sys.argv[7].split(","))}
K = 3
SEGMENT_FRACTION_OF_STATURE = 0.779  # thigh + shank + trunk (Winter), as the engine (scene.ts)

cap = cv2.VideoCapture(video); frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
pl = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.IMAGE, output_segmentation_masks=True, num_poses=1))
rgb = lambda f: mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)))

# Where the batter is across the clip's stroke, with room for the bat.
lo, hi = max(0, min(moments.values()) - 20), min(len(frames) - 1, max(moments.values()) + 10)
xs, ys, hs = [], [], []
for i in range(lo, hi + 1):
    r = pl.detect(rgb(frames[i]))
    if not r.pose_landmarks: continue
    Hh, Ww = frames[i].shape[:2]
    px = [p.x * Ww for p in r.pose_landmarks[0]]; py = [p.y * Hh for p in r.pose_landmarks[0]]
    xs += [min(px), max(px)]; ys += [min(py), max(py)]; hs.append(max(py) - min(py))
h = float(np.median(hs)); Hh, Ww = frames[0].shape[:2]
x0, x1 = int(max(0, min(xs) - 0.45 * h)), int(min(Ww, max(xs) + 0.45 * h))
y0, y1 = int(max(0, min(ys) - 0.22 * h)), int(min(Hh, max(ys) + 0.1 * h))

def prepare(i):
    crop = cv2.resize(frames[i][y0:y1, x0:x1], None, fx=K, fy=K, interpolation=cv2.INTER_CUBIC)
    H, W = crop.shape[:2]
    r = pl.detect(rgb(crop))
    if not r.pose_landmarks or not r.segmentation_masks: return None
    lm = np.array([[p.x * W, p.y * H, p.visibility] for p in r.pose_landmarks[0]])
    world = np.array([[p.x, p.y, p.z] for p in r.pose_world_landmarks[0]])
    m = r.segmentation_masks[0].numpy_view()
    m = cv2.resize(m[:, :, 0] if m.ndim == 3 else m, (W, H))
    person = (cv2.GaussianBlur(m, (0, 0), 2.0) > 0.5).astype(np.uint8) * 255
    return crop, lm, world, person

ready = {i: prepare(i) for i in range(lo, hi + 1)}
ready = {i: r for i, r in ready.items() if r is not None}
def body_size(p, two_d=True):
    """thigh + shank + trunk, each side's mean, as the engine sizes a batter."""
    d = lambda a, b: np.linalg.norm((p[a, :2] if two_d else p[a]) - (p[b, :2] if two_d else p[b]))
    thigh = (d(23, 25) + d(24, 26)) / 2; shank = (d(25, 27) + d(26, 28)) / 2
    trunk = np.linalg.norm((p[11, :2] + p[12, :2]) / 2 - (p[23, :2] + p[24, :2]) / 2) if two_d else np.linalg.norm((p[11] + p[12]) / 2 - (p[23] + p[24]) / 2)
    return thigh + shank + trunk
stature_px = float(np.percentile([body_size(r[1]) for r in ready.values()], 75)) / SEGMENT_FRACTION_OF_STATURE
stature_m = float(np.percentile([body_size(r[2], False) for r in ready.values()], 75)) / SEGMENT_FRACTION_OF_STATURE
ground = float(np.median([max(r[1][[29, 30, 31, 32], 1]) for r in ready.values()]))

# A right-hander's front side is their left (the clips are the owner's, a right-hander). From the
# side, the bowler is the way the batter faces in the stance (nose ahead of the ears), not the way
# they step: a back-foot defence steps away from the bowler.
contact = ready[moments["contact"]]
if view == "side":
    stance = [r[1] for i, r in sorted(ready.items())][:8]
    facing = np.median([p[0, 0] - (p[7, 0] + p[8, 0]) / 2 for p in stance])
    sign = 1.0 if facing > 0 else -1.0  # +1: the bowler is to the right of the picture
else:
    sign = -1.0 if camera == "front_on" else 1.0  # from the bowler's end a right-hander's off side is on the picture's left
F, B = "left", "right"
IDX = {"left": {"shoulder": 11, "elbow": 13, "wrist": 15, "hip": 23, "knee": 25, "ankle": 27, "heel": 29, "foot": 31},
       "right": {"shoulder": 12, "elbow": 14, "wrist": 16, "hip": 24, "knee": 26, "ankle": 28, "heel": 30, "foot": 32}}
JOINTS = {"head": 0}
for role, side in (("front", F), ("back", B)):
    for part, k in IDX[side].items(): JOINTS[f"{role}_{part}"] = k
origin_x = (contact[1][23, 0] + contact[1][24, 0]) / 2

def plane(x, y):
    """A point of the picture in the model's plane: (forward or across, up), body heights."""
    return [sign * (x - origin_x) / stature_px, (ground - y) / stature_px]

def depth(world, k):
    """The axis the camera looks along, from the 3D estimate: across (side view) or forward (front view)."""
    z = world[k, 2] - (world[23, 2] + world[24, 2]) / 2
    return -z / stature_m  # nearer the camera: the off side (filmed from the off side) or the bowler (from the bowler's end)

def polys(mask, step=0.75):
    cs, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if len(c) < 8: continue
        c = cv2.approxPolyDP(c, step, True)
        if len(c) < 3: continue
        out.append(c[:, 0, :])
    return out
milli = lambda pts: [int(round(v * 1000)) for p in pts for v in plane(*p)]

centres = learn_colours([cv2.cvtColor(cv2.bilateralFilter(r[0], 9, 50, 9), cv2.COLOR_BGR2LAB)[cv2.erode(r[3], np.ones((7, 7), np.uint8)) > 0][::7] for r in ready.values()])
result = {"schema": "aline.traced-figure/1", "shot": shot, "view": view, "camera": camera, "batting_side": "right", "clip": os.path.basename(video), "moments": {}}
prev = None
for name, i in moments.items():
    crop, lm, world, person = ready[i]
    bat, deg = find_bat(crop, lm, person, prev)
    if deg is not None: prev = deg
    body, hull, grips = layers(crop, lm, person, bat, centres)
    ink = (body > 110).astype(np.uint8) * 255
    pose = {}
    for j, k in JOINTS.items():
        a, u = plane(lm[k, 0], lm[k, 1])
        pose[j] = [round(a, 4), round(u, 4), round(depth(world, k), 4)] if view == "side" else [round(depth(world, k), 4), round(u, 4), round(a, 4)]
    entry = {"frame": i, "pose": pose, "body": [milli(p) for p in polys(ink)]}
    if hull is not None:
        hx, hy = lm[[15, 16, 19, 20], 0].mean(), lm[[15, 16, 19, 20], 1].mean()
        a = np.deg2rad(deg); ux, uy = np.cos(a), np.sin(a)
        pts = hull[:, 0, :].astype(float)
        reach = float(((pts[:, 0] - hx) * ux + (pts[:, 1] - hy) * uy).max())
        entry["bat"] = {"handle": [round(v, 4) for v in plane(hx, hy)], "toe": [round(v, 4) for v in plane(hx + ux * reach, hy + uy * reach)], "outline": milli(pts)}
        entry["grips"] = [milli(g[:, 0, :]) for g in grips]
    result["moments"][name] = entry
    print(name, i, "lines", len(entry["body"]), "bat", "bat" in entry)
json.dump(result, open(out_path, "w"), separators=(",", ":"))
print("stature px", round(stature_px), "m", round(stature_m, 2), "front", F, "size", os.path.getsize(out_path))
