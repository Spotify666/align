# Puts captured frames into one contact sheet: python3 sheet.py <out.jpg> <columns> <file|caption>...
import sys
from PIL import Image, ImageDraw

out, cols, items = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
frames = [(Image.open(i.split("|")[0]).convert("RGB"), i.split("|")[1]) for i in items]
w = max(f.width for f, _ in frames)
h = max(f.height for f, _ in frames)
cap = 22
rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + cap)), (5, 5, 5))
d = ImageDraw.Draw(sheet)
for n, (f, c) in enumerate(frames):
    x, y = (n % cols) * w, (n // cols) * (h + cap)
    sheet.paste(f, (x, y + cap))
    d.text((x + 6, y + 5), c, fill=(244, 241, 232))
sheet.thumbnail((cols * 260, rows * 320))
sheet.save(out, quality=82)
