"""The wooden puzzle picture for every book (17.11, her words «hepsine çizgi… belirgin olsun, puzzle olduğu anlaşılsın… bir iki
parça çıkmış… doğru şekilde dursun»): the book's clean cover art (img/<id>-temiz.jpg) cut into 35 pieces (5 × 7) with clear
embossed seams; two pieces lifted out, lying picture-up on the puzzle with a soft shadow, the wooden board showing in their holes.
python3 tools/puzzle-art.py            → writes img/<id>-yapboz.jpg for every book that has img/<id>-temiz.jpg and a puzzle
17.11, her words «çizgiler yüzlerinden geçerken çok belli olur… itici gelmesin»: the seams are softer, and almost gone over the
faces (tools/puzzle-faces.json: the faces' boxes, 0–1, found with the site's own face finder; two added by hand); the pieces taken
out and the loose ones never touch a face.
"""
import glob, json, math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H, S = 800, 1067, 2            # output size, supersampling
COLS, ROWS = 5, 7

def edge(p0, p1, sign):
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L; nx, ny = -uy * sign, ux * sign
    keys = [(0, 0), (.36, 0), (.40, .02), (.37, .12), (.42, .22), (.5, .25), (.58, .22), (.63, .12), (.60, .02), (.64, 0), (1, 0)]
    pts = []
    for i in range(len(keys) - 1):
        (ta, ha), (tb, hb) = keys[i], keys[i + 1]
        for k in range(10):
            u = k / 10; w = (1 - math.cos(math.pi * u)) / 2; t = ta + (tb - ta) * u; h = ha + (hb - ha) * w
            pts.append((x0 + dx * t + nx * h * L, y0 + dy * t + ny * h * L))
    pts.append((x1, y1))
    return pts

def build(src, dst, seed, faces=()):
    rnd = random.Random(seed)
    im = Image.open(src).convert('RGB')
    # cover-fit to 3:4
    k = max(W * S / im.width, H * S / im.height); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    l, t = (im.width - W * S) // 2, (im.height - H * S) // 2; im = im.crop((l, t, l + W * S, t + H * S)).convert('RGBA')
    cw, ch = W * S / COLS, H * S / ROWS
    hs = [[rnd.choice((-1, 1)) for c in range(COLS)] for r in range(ROWS + 1)]   # seam under row r-1 / above row r
    vs = [[rnd.choice((-1, 1)) for c in range(COLS + 1)] for r in range(ROWS)]
    P = lambda c, r: (c * cw, r * ch)
    def hseam(r, c): return [P(c, r), P(c + 1, r)] if r in (0, ROWS) else edge(P(c, r), P(c + 1, r), hs[r][c])
    def vseam(r, c): return [P(c, r), P(c, r + 1)] if c in (0, COLS) else edge(P(c, r), P(c, r + 1), vs[r][c])
    def piece(r, c): return hseam(r, c) + vseam(r, c + 1) + hseam(r + 1, c)[::-1] + vseam(r, c)[::-1]
    # the seams: a dark cut with a fine light edge beside it, so they read as real cuts
    lines = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lines)
    seams = [hseam(r, c) for r in range(1, ROWS) for c in range(COLS)] + [vseam(r, c) for r in range(ROWS) for c in range(1, COLS)]
    for s in seams: d.line([(x + 2, y + 2) for x, y in s], fill=(255, 244, 225, 150), width=3, joint='curve')
    for s in seams: d.line(s, fill=(38, 26, 20, 255), width=4, joint='curve')
    # softer seams, and a soft clearing over each face (with a margin), where they nearly vanish
    fade = Image.new('L', im.size, 255); fd = ImageDraw.Draw(fade)
    for x0, y0, x1, y1 in faces:
        mx_, my_ = (x1 - x0) * .28, (y1 - y0) * .28
        fd.ellipse(((x0 - mx_) * W * S, (y0 - my_) * H * S, (x1 + mx_) * W * S, (y1 + my_) * H * S), fill=28)
    fade = fade.filter(ImageFilter.GaussianBlur(40))
    lines.putalpha(ImageChops.multiply(lines.getchannel('A'), fade.point(lambda v: v * 165 // 255)))
    art = im.copy(); art.alpha_composite(lines)
    # two pieces out, away from the faces: one at a side edge, one in the bottom row, and their loose copies not over a face
    def hits(cx, cy, rw, rh):
        return any(not (cx + rw < x0 * W * S - 20 or cx - rw > x1 * W * S + 20 or cy + rh < y0 * H * S - 20 or cy - rh > y1 * H * S + 20) for x0, y0, x1, y1 in faces)
    def cell_ok(r, c): return not hits((c + .5) * cw, (r + .5) * ch, cw * .75, ch * .75)
    side = [(r, 4) for r in (3, 4, 2, 5)] + [(r, 0) for r in (3, 4, 2, 5)]
    bottom = [(6, c) for c in (1, 3, 0, 4, 2)]
    picks = [next((p for p in side if cell_ok(*p)), side[0]), next((p for p in bottom if cell_ok(*p)), bottom[0])]
    moves = []
    for (r, c), base in zip(picks, [(-0.62 if picks[0][1] == 4 else 0.62, 0.42), (0.55, -0.62)]):
        tries = [base, (base[0], -base[1]), (base[0] * 1.3, base[1] * .4), (-base[0], base[1])]
        mv = next((t for t in tries if not hits((c + .5 + t[0]) * cw, (r + .5 + t[1]) * ch, cw * .7, ch * .7) and 0 < (c + .5 + t[0]) * cw < W * S and 0 < (r + .5 + t[1]) * ch < H * S), base)
        moves.append((mv, 13 if c == 4 else -11 if r == 6 else -13))
    out = art.copy()
    for (r, c) in picks:   # the holes: the wooden board, a soft shadow along their rim
        poly = piece(r, c)
        m = Image.new('L', im.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
        board = Image.new('RGBA', im.size, (74, 50, 34, 255))
        grain = Image.effect_noise(im.size, 18).convert('L').point(lambda v: v // 6)
        board = ImageChops.subtract(board, Image.merge('RGBA', (grain, grain, grain, Image.new('L', im.size, 0))))
        out.paste(board, (0, 0), m)
        rim = Image.new('L', im.size, 0); ImageDraw.Draw(rim).line(poly + poly[:1], fill=200, width=10)
        rim = ImageChops.multiply(rim.filter(ImageFilter.GaussianBlur(6)), m)
        out.paste((20, 12, 8, 255), (0, 0), rim)
    for (r, c), ((mx, my), ang) in zip(picks, moves):   # the loose pieces, picture up
        poly = piece(r, c)
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]; bx0, by0, bx1, by1 = int(min(xs)) - 8, int(min(ys)) - 8, int(max(xs)) + 8, int(max(ys)) + 8
        m = Image.new('L', im.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
        pc = Image.new('RGBA', im.size, (0, 0, 0, 0)); pc.paste(art, (0, 0), m)
        pc = pc.crop((bx0, by0, bx1, by1)); pm = m.crop((bx0, by0, bx1, by1))
        edgeline = Image.new('RGBA', pc.size, (0, 0, 0, 0))
        ImageDraw.Draw(edgeline).line([(x - bx0, y - by0) for x, y in poly + poly[:1]], fill=(38, 26, 20, 230), width=4)
        pc.alpha_composite(edgeline)
        # the wooden thickness under the piece
        side = Image.new('RGBA', pc.size, (120, 84, 52, 255)); side.putalpha(pm)
        piece_img = Image.new('RGBA', (pc.width + 12, pc.height + 12), (0, 0, 0, 0))
        piece_img.alpha_composite(side, (5, 7)); piece_img.alpha_composite(pc, (0, 0))
        piece_img = piece_img.rotate(ang, resample=Image.BICUBIC, expand=True)
        sh = Image.new('RGBA', piece_img.size, (0, 0, 0, 0)); sh.putalpha(piece_img.getchannel('A').point(lambda v: v * 150 // 255))
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        cx = (bx0 + bx1) / 2 + mx * cw; cy = (by0 + by1) / 2 + my * ch
        px, py = int(cx - piece_img.width / 2), int(cy - piece_img.height / 2)
        out.alpha_composite(sh, (px + 12, py + 20)); out.alpha_composite(piece_img, (px, py))
    out.convert('RGB').resize((W, H), Image.LANCZOS).save(dst, quality=86, optimize=True, progressive=True)

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(__file__), '..'))
    faces = json.load(open('tools/puzzle-faces.json'))
    for f in sorted(glob.glob('img/*-yapboz.jpg')):
        bid = os.path.basename(f)[:-len('-yapboz.jpg')]; src = f'img/{bid}-temiz.jpg'
        if not os.path.exists(src): print('skip', bid); continue
        build(src, f, seed=sum(map(ord, bid)), faces=faces.get(bid, []))
        print('ok', bid)
