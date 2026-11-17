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

def wood(size, base=None, seed=0, vertical=False):
    """17.11, her words «karton gibi… ahşap hissi vermiyor»: oak — long fibres along the board, soft wavy growth rings that drift and
    meet, a slow change of tone across the board; numpy for the texture"""
    import numpy as np
    full = size
    w, h = max(2, size[0] // 2), max(2, size[1] // 2)   # drawn at half size, then enlarged: wider, calmer grain
    if vertical: w, h = h, w
    rng = np.random.default_rng(seed)
    def field(cw, ch):   # smooth noise, -0.5 … 0.5, with features about cw × ch pixels
        g = rng.random((max(2, int(h / ch) + 2), max(2, int(w / cw) + 2)))
        return np.asarray(Image.fromarray((g * 255).astype('uint8')).resize((w, h), Image.BICUBIC), float) / 255 - .5
    yy = np.arange(h, dtype=float)[:, None] * np.ones((1, w))
    warp = field(w * .45, h * .35) * 140 + field(w * .18, h * .12) * 34 + field(w * .06, 18) * 6
    period = 26 + rng.random() * 8
    ph = (yy + warp) / period
    ring = (np.sin(ph * 2 * np.pi) + 1) / 2
    ring = ring ** 3.2                                                   # thin dark latewood lines, wide light earlywood
    fib = np.asarray(Image.fromarray((rng.random((h, max(2, w // 40))) * 255).astype('uint8')).resize((w, h), Image.BICUBIC), float) / 255 - .5
    fib = np.asarray(Image.fromarray(((fib + .5) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(.7)), float) / 255 - .5
    tone = field(w * .7, h * .5)
    base_c = np.array([190, 142, 92.]) if base is None else np.array(base, float)
    dark_c = base_c * np.array([.66, .58, .52])
    t = np.clip(ring * .55 + fib * .22 + tone * .35 + .08, 0, 1)[..., None]
    rgb = base_c * (1 - t) + dark_c * t
    img = Image.fromarray(np.clip(rgb, 0, 255).astype('uint8'), 'RGB')
    if vertical: img = img.transpose(Image.ROTATE_90)
    return img.resize(full, Image.BICUBIC).convert('RGBA')

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
    # 17.11, her words «çok siyah çizgi gibi… tahta efekti vermiyor»: the seams as real laser cuts in a wooden board — a hairline gap in
    # warm burnt wood (not black), each piece's edge bevelled: lit on the upper-left side, in shade on the lower-right
    seams = [hseam(r, c) for r in range(1, ROWS) for c in range(COLS)] + [vseam(r, c) for r in range(ROWS) for c in range(1, COLS)]
    cut = Image.new('L', im.size, 0); d = ImageDraw.Draw(cut)
    for sm in seams: d.line(sm, fill=255, width=3, joint='curve')
    # soft clearing over each face (with a margin), where the cuts nearly vanish
    fade = Image.new('L', im.size, 255); fd = ImageDraw.Draw(fade)
    for x0, y0, x1, y1 in faces:
        mx_, my_ = (x1 - x0) * .28, (y1 - y0) * .28
        fd.ellipse(((x0 - mx_) * W * S, (y0 - my_) * H * S, (x1 + mx_) * W * S, (y1 + my_) * H * S), fill=40)
    fade = fade.filter(ImageFilter.GaussianBlur(40))
    soft = cut.filter(ImageFilter.GaussianBlur(2.2))
    lit = ImageChops.subtract(soft.transform(im.size, Image.AFFINE, (1, 0, 2.5, 0, 1, 2.5)), soft)      # the edge facing the light
    shade = ImageChops.subtract(soft.transform(im.size, Image.AFFINE, (1, 0, -2.5, 0, 1, -2.5)), soft)  # the edge turned away
    art = im.copy()
    def layer(rgb, mask, k): art.alpha_composite(Image.merge('RGBA', (*[Image.new('L', im.size, v) for v in rgb], ImageChops.multiply(mask.point(lambda v: min(255, int(v * k))), fade))))
    layer((255, 236, 200), lit, 1.6)          # a warm light on the bevel
    layer((60, 34, 18), shade, 1.5)           # its shadow
    layer((92, 58, 34), cut.filter(ImageFilter.GaussianBlur(.6)), .78)   # the cut itself: burnt wood brown, slightly see-through
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
        board = wood(im.size, seed=r * 7 + c)
        out.paste(board, (0, 0), m)
        rim = Image.new('L', im.size, 0); ImageDraw.Draw(rim).line(poly + poly[:1], fill=170, width=14)
        rim = ImageChops.multiply(rim.filter(ImageFilter.GaussianBlur(8)), m)
        out.paste((70, 44, 24, 255), (0, 0), rim)
    for (r, c), ((mx, my), ang) in zip(picks, moves):   # the loose pieces, picture up
        poly = piece(r, c)
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]; bx0, by0, bx1, by1 = int(min(xs)) - 8, int(min(ys)) - 8, int(max(xs)) + 8, int(max(ys)) + 8
        m = Image.new('L', im.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
        pc = Image.new('RGBA', im.size, (0, 0, 0, 0)); pc.paste(art, (0, 0), m)
        pc = pc.crop((bx0, by0, bx1, by1)); pm = m.crop((bx0, by0, bx1, by1))
        rimm = Image.new('L', pc.size, 0); ImageDraw.Draw(rimm).line([(x - bx0, y - by0) for x, y in poly + poly[:1]], fill=255, width=5)
        rimm = ImageChops.multiply(rimm.filter(ImageFilter.GaussianBlur(2)), pm)
        pc.alpha_composite(Image.merge('RGBA', (*[Image.new('L', pc.size, v) for v in (255, 238, 205)], rimm.point(lambda v: v * 3 // 5))))
        # the wooden thickness under the piece
        side = wood(pc.size, (206, 166, 116), seed=c + 11); side.putalpha(pm)
        ply = Image.new('RGBA', pc.size, (0, 0, 0, 0)); pd_ = ImageDraw.Draw(ply)   # plywood layers along the edge
        for k_, a_ in ((4, 70), (8, 60)): pd_.line([(x - bx0 + k_ * .6, y - by0 + k_) for x, y in poly + poly[:1]], fill=(110, 70, 38, a_), width=2)
        side.alpha_composite(ply)
        piece_img = Image.new('RGBA', (pc.width + 16, pc.height + 18), (0, 0, 0, 0))
        for k_ in range(1, 12): piece_img.alpha_composite(side, (int(k_ * .55), k_))   # a solid wooden thickness
        piece_img.alpha_composite(side, (6, 12)); piece_img.alpha_composite(pc, (0, 0))
        piece_img = piece_img.rotate(ang, resample=Image.BICUBIC, expand=True)
        sh = Image.new('RGBA', piece_img.size, (0, 0, 0, 0)); sh.putalpha(piece_img.getchannel('A').point(lambda v: v * 150 // 255))
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        cx = (bx0 + bx1) / 2 + mx * cw; cy = (by0 + by1) / 2 + my * ch
        px, py = int(cx - piece_img.width / 2), int(cy - piece_img.height / 2)
        out.alpha_composite(sh, (px + 12, py + 20)); out.alpha_composite(piece_img, (px, py))
    # the wooden tray the puzzle lies in: an oak frame round the picture, with a shadow falling inward (the picture sits lower)
    F = 34 * S
    # the frame's four sides, each with its grain along it, mitred at the corners
    framed = wood(im.size, (176, 124, 74), seed=seed + 3)
    side_v = wood(im.size, (172, 120, 72), seed=seed + 5, vertical=True)
    mv = Image.new('L', im.size, 0); md = ImageDraw.Draw(mv)
    md.polygon([(0, 0), (F, F), (F, H * S - F), (0, H * S)], fill=255); md.polygon([(W * S, 0), (W * S - F, F), (W * S - F, H * S - F), (W * S, H * S)], fill=255)
    framed.paste(side_v, (0, 0), mv)
    mitre = Image.new('RGBA', im.size, (0, 0, 0, 0)); mt = ImageDraw.Draw(mitre)
    for a_, b_ in (((0, 0), (F, F)), ((W * S, 0), (W * S - F, F)), ((0, H * S), (F, H * S - F)), ((W * S, H * S), (W * S - F, H * S - F))): mt.line((a_, b_), fill=(80, 48, 24, 160), width=2)
    framed.alpha_composite(mitre)
    inner = out.resize((W * S - 2 * F, H * S - 2 * F), Image.LANCZOS)
    framed.alpha_composite(inner, (F, F))
    sh = Image.new('L', im.size, 0); sd = ImageDraw.Draw(sh)
    sd.rectangle((F, F, W * S - F, F + 22), fill=150); sd.rectangle((F, F, F + 22, H * S - F), fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(10)); hole = Image.new('L', im.size, 0); ImageDraw.Draw(hole).rectangle((F, F, W * S - F, H * S - F), fill=255)
    framed.paste((30, 18, 10), (0, 0), ImageChops.multiply(sh, hole))
    lip = Image.new('RGBA', im.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(lip)
    ld.line((F - 2, H * S - F + 1, W * S - F + 1, H * S - F + 1, W * S - F + 1, F - 2), fill=(255, 226, 180, 120), width=3)   # light on the frame's inner edge
    ld.rectangle((1, 1, W * S - 2, H * S - 2), outline=(90, 56, 30, 255), width=3)
    framed.alpha_composite(lip)
    framed.convert('RGB').resize((W, H), Image.LANCZOS).save(dst, quality=86, optimize=True, progressive=True)

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(__file__), '..'))
    faces = json.load(open('tools/puzzle-faces.json'))
    for f in sorted(glob.glob('img/*-yapboz.jpg')):
        bid = os.path.basename(f)[:-len('-yapboz.jpg')]; src = f'img/{bid}-temiz.jpg'
        if not os.path.exists(src): print('skip', bid); continue
        build(src, f, seed=sum(map(ord, bid)), faces=faces.get(bid, []))
        print('ok', bid)
