# Trace a clip of a batter into line art, frame by frame: the outline of the body and bat,
# and the lines inside it (arms across the body, kit, folds). Writes one line image per frame,
# a review sheet, and the joints each frame was traced around.
import sys, json, os, cv2, numpy as np, mediapipe as mp
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

def find_bat(crop, lm, person, prev):
    """The bat: a long thin pale strip that starts at the hands. Tried in every direction;
    the best is the one that is pale along its length and not pale beside it."""
    H, W = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    pale = ((hsv[:, :, 2] > 140) & (hsv[:, :, 1] < 105)).astype(np.float32)
    pale = cv2.GaussianBlur(pale, (0, 0), 1.5)
    size = lm[:, 1].max() - lm[:, 1].min()
    hx, hy = lm[[15, 16, 19, 20], 0].mean(), lm[[15, 16, 19, 20], 1].mean()
    L, wd = size * 0.5, size * 0.035
    best = None
    steps = np.linspace(0.12, 1.0, 40) * L
    for deg in range(0, 360, 3):
        a = np.deg2rad(deg); ux, uy = np.cos(a), np.sin(a); nx, ny = -uy, ux
        def sample(off):
            xs = (hx + ux * steps + nx * off).astype(int); ys = (hy + uy * steps + ny * off).astype(int)
            ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
            v = np.zeros(len(steps), np.float32); v[ok] = pale[ys[ok], xs[ok]]
            return v
        mid = (sample(0) + sample(wd * 0.5) + sample(-wd * 0.5)) / 3
        side = (sample(wd * 3.2) + sample(-wd * 3.2)) / 2
        # The longest run from the hands outward that stays pale.
        on = mid > 0.45
        run = 0; gaps = 0; end = 0
        for k, v in enumerate(on):
            if v: run += 1; end = k; gaps = 0
            else:
                gaps += 1
                if gaps > 5 and run > 0: break
        score = mid[: end + 1].mean() * (run / len(steps)) - 0.6 * side[: end + 1].mean() if run >= 8 else -1
        if prev is not None:
            d = abs((deg - prev + 180) % 360 - 180)
            score -= 0.002 * d
        if best is None or score > best[0]: best = (score, deg, steps[end])
    if best is None or best[0] < 0.12: return np.zeros((H, W), np.uint8), None
    _, deg, reach = best
    a = np.deg2rad(deg); ux, uy = np.cos(a), np.sin(a); nx, ny = -uy, ux
    strip = np.zeros((H, W), np.uint8)
    p = lambda t, o: (int(hx + ux * t + nx * o), int(hy + uy * t + ny * o))
    half = wd * 1.25
    cv2.fillConvexPoly(strip, np.array([p(0, half), p(reach + wd, half), p(reach + wd, -half), p(0, -half)]), 255)
    bat = ((pale > 0.45) & (strip > 0)).astype(np.uint8) * 255
    bat = cv2.morphologyEx(bat, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    bat = cv2.morphologyEx(bat, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bat, 8)
    if n <= 1: return np.zeros((H, W), np.uint8), None
    c = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (lab == c).astype(np.uint8) * 255, deg

def learn_colours(samples):
    """The few colours the batter is made of (kit, trim, skin, shoes, hair), from all frames."""
    px = np.vstack(samples).astype(np.float32)
    if len(px) > 60000: px = px[np.random.default_rng(1).choice(len(px), 60000, replace=False)]
    _, _, centres = cv2.kmeans(px, 6, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    return centres

def smooth(mask, k=2.2):
    return (cv2.GaussianBlur(mask, (0, 0), k) > 127).astype(np.uint8) * 255

def draw(crop, lm, person, bat, centres):
    H, W = crop.shape[:2]
    person = smooth(person, 2.5)
    soft = cv2.bilateralFilter(crop, 9, 50, 9)
    hsv = cv2.cvtColor(soft, cv2.COLOR_BGR2HSV)
    h, sa, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    inner = cv2.erode(person, np.ones((7, 7), np.uint8)) > 0
    # What the batter is made of, by colour: skin, shoes, hair, and the kit's trim.
    parts = {
        "skin": (h >= 5) & (h <= 24) & (sa >= 45) & (sa <= 200) & (v >= 85),
        "shoes": (sa < 70) & (v > 150),
        "hair": (v < 62),
        "trim": ((h >= 140) | (h <= 4)) & (sa >= 80) & (v >= 70),
    }
    least = {"skin": 260, "shoes": 500, "hair": 500, "trim": 1500}
    line = np.zeros((H, W), np.uint8)
    for name, m in parts.items():
        region = (m & inner).astype(np.uint8) * 255
        region = cv2.medianBlur(region, 11)
        region = cv2.morphologyEx(region, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        region = cv2.morphologyEx(region, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        region = smooth(region, 2.0)
        cs, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cs = [k for k in cs if cv2.contourArea(k) > least[name]]
        cv2.drawContours(line, cs, -1, 255, 2, cv2.LINE_AA)
    # Long edges inside the kit: a sleeve across the chest, one leg in front of the other.
    g = cv2.GaussianBlur(cv2.bilateralFilter(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), 11, 45, 11), (0, 0), 2.4)
    e = cv2.Canny(g, 26, 64)
    e[~inner] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(e, 8)
    for c in range(1, n):
        if max(stats[c, cv2.CC_STAT_WIDTH], stats[c, cv2.CC_STAT_HEIGHT]) >= 70:
            line[lab == c] = 255
    line = cv2.max(line, cv2.GaussianBlur(line, (0, 0), 0.7))
    # Borders that lie on the body's own edge belong to the outline, drawn next.
    line[cv2.erode(person, np.ones((13, 13), np.uint8)) == 0] = 0
    out = np.zeros((H, W), np.uint8)
    cs, _ = cv2.findContours(person, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cs = [k for k in cs if cv2.contourArea(k) > 600]
    cv2.drawContours(out, cs, -1, 255, 3, cv2.LINE_AA)
    out = cv2.max(out, line)
    # The bat, clean-edged, in front of what it crosses.
    if bat.any():
        hull = cv2.convexHull(np.vstack(cv2.findContours(bat, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]))
        shape = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(shape, hull, 255)
        out[cv2.dilate(shape, np.ones((5, 5), np.uint8)) > 0] = 0
        cv2.drawContours(out, [hull], -1, 255, 3, cv2.LINE_AA)
        # The hands hold it: their outline shows over the bat.
        hands = np.zeros((H, W), np.uint8)
        for k in (15, 16, 17, 18, 19, 20, 21, 22): cv2.circle(hands, (int(lm[k, 0]), int(lm[k, 1])), 16, 255, -1)
        grip = ((parts["skin"] & (person > 0)).astype(np.uint8) * 255) & hands
        grip = smooth(cv2.morphologyEx(grip, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)), 1.6)
        gc, _ = cv2.findContours(grip, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        gc = [k for k in gc if cv2.contourArea(k) > 150]
        if gc:
            fill = np.zeros((H, W), np.uint8); cv2.drawContours(fill, gc, -1, 255, -1)
            out[fill > 0] = 0
            cv2.drawContours(out, gc, -1, 255, 2, cv2.LINE_AA)
    return out

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
