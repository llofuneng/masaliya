"""Draw 35-piece jigsaw lines (5 × 7) over a puzzle picture, in the style of img/buz-satosunun-sirri-yapboz.jpg.
python3 tools/puzzle-lines.py <in.jpg> <out.jpg>"""
import sys, random
from PIL import Image, ImageDraw

def edge(p0, p1, sign, n=48):
    # a straight edge with one rounded tab in the middle, bulging to `sign` side
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0; L = (dx * dx + dy * dy) ** .5; ux, uy = dx / L, dy / L; nx, ny = -uy * sign, ux * sign
    pts = []
    def at(t, h): return (x0 + dx * t + nx * h * L, y0 + dy * t + ny * h * L)
    # neck → round head → neck, as a sequence of (t, height) keys smoothed with a cosine
    keys = [(0, 0), (.36, 0), (.40, .02), (.37, .12), (.42, .22), (.5, .25), (.58, .22), (.63, .12), (.60, .02), (.64, 0), (1, 0)]
    for i in range(len(keys) - 1):
        (ta, ha), (tb, hb) = keys[i], keys[i + 1]
        for k in range(8):
            u = k / 8; import math; w = (1 - math.cos(math.pi * u)) / 2
            pts.append(at(ta + (tb - ta) * u, ha + (hb - ha) * w))
    pts.append(at(1, 0))
    return pts

def main(src, dst, cols=5, rows=7, seed=7):
    im = Image.open(src).convert('RGB'); W, H = im.size; rnd = random.Random(seed)
    over = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(over)
    cw, ch = W * 2 / cols, H * 2 / rows; col = (52, 46, 44, 205); w = 4
    for r in range(1, rows):          # horizontal seams
        for c in range(cols):
            d.line(edge((c * cw, r * ch), ((c + 1) * cw, r * ch), rnd.choice((-1, 1))), fill=col, width=w, joint='curve')
    for c in range(1, cols):          # vertical seams
        for r in range(rows):
            d.line(edge((c * cw, r * ch), (c * cw, (r + 1) * ch), rnd.choice((-1, 1))), fill=col, width=w, joint='curve')
    over = over.resize((W, H), Image.LANCZOS)
    out = im.convert('RGBA'); out.alpha_composite(over); out.convert('RGB').save(dst, quality=88)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
