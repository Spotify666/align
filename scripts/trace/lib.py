# What tracing a clip into line art is made of, shared by trace.py (the landing's batter) and
# rig.py (the shot-model figure): finding the bat, the batter's colours, and the drawing.
import cv2, numpy as np


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

def layers(crop, lm, person, bat, centres):
    """The body's lines (outline, kit, long edges inside), the bat's outline and the hands' outlines, apart."""
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
    # The bat, clean-edged, and the hands that hold it.
    hull, gc = None, []
    if bat.any():
        hull = cv2.convexHull(np.vstack(cv2.findContours(bat, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]))
        hands = np.zeros((H, W), np.uint8)
        for k in (15, 16, 17, 18, 19, 20, 21, 22): cv2.circle(hands, (int(lm[k, 0]), int(lm[k, 1])), 16, 255, -1)
        grip = ((parts["skin"] & (person > 0)).astype(np.uint8) * 255) & hands
        grip = smooth(cv2.morphologyEx(grip, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)), 1.6)
        gc, _ = cv2.findContours(grip, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        gc = [k for k in gc if cv2.contourArea(k) > 150]
    return out, hull, gc

def draw(crop, lm, person, bat, centres):
    """The body's lines, then the bat in front of what it crosses, then the hands over the bat."""
    out, hull, gc = layers(crop, lm, person, bat, centres)
    H, W = out.shape
    if hull is not None:
        shape = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(shape, hull, 255)
        out[cv2.dilate(shape, np.ones((5, 5), np.uint8)) > 0] = 0
        cv2.drawContours(out, [hull], -1, 255, 3, cv2.LINE_AA)
        if gc:
            fill = np.zeros((H, W), np.uint8); cv2.drawContours(fill, gc, -1, 255, -1)
            out[fill > 0] = 0
            cv2.drawContours(out, gc, -1, 255, 2, cv2.LINE_AA)
    return out

