#!/usr/bin/env python3
"""Make small copies of every image in img/ for thumbnails (img/t/) and medium copies of book pages
(img/m/) for phones, so strips of pages and the page viewer load fast.
Run after adding images:   python3 tools/build-thumbs.py"""
import os
import re
import sys
from PIL import Image, ImageFilter, ImageEnhance

ONLY_BLUR = '--blur' in sys.argv or '--cards' in sys.argv   # python3 tools/build-thumbs.py --cards : only the cards' covers (img/b, c, w)

ROOT = os.path.join(os.path.dirname(__file__), '..', 'img')
OUT = os.path.join(ROOT, 't')
os.makedirs(OUT, exist_ok=True)
made = 0
for name in ([] if ONLY_BLUR else sorted(os.listdir(ROOT))):
    if not name.endswith('.jpg') or name in ('og.jpg', 'library-blur.jpg'):
        continue
    im = Image.open(os.path.join(ROOT, name)).convert('RGB')
    w = 280 if im.width > im.height else 180   # spreads are wide, pages and covers are tall
    im.thumbnail((w, w * 2))
    im.save(os.path.join(OUT, name), quality=78, optimize=True, progressive=True)
    made += 1
print(f'{made} thumbnails in img/t/')

# medium copies of the book pages for phone screens (img/m/); the full size is kept for zooming in
MID = os.path.join(ROOT, 'm')
os.makedirs(MID, exist_ok=True)
mids = 0
for name in ([] if ONLY_BLUR else sorted(os.listdir(ROOT))):
    if not re.search(r'-(s|boyama-p)\d+\.jpg$', name):   # story spreads and coloring pages only
        continue
    im = Image.open(os.path.join(ROOT, name)).convert('RGB')
    w = 900 if im.width > im.height else 520
    if im.width <= w:
        continue
    im.thumbnail((w, w * 2))
    im.save(os.path.join(MID, name), quality=76, optimize=True, progressive=True)
    mids += 1
print(f'{mids} medium copies in img/m/')

# the book cards' ground (17.11): each cover, small and already blurred, brighter in colour (img/b/). The page used to blur the
# cover itself (CSS filter: blur on every card); on an iPhone so many live blurs ran out of graphics memory and some covers
# turned black after scrolling. A 90 px picture, blurred here, costs the phone nothing.
BLUR = os.path.join(ROOT, 'b')
os.makedirs(BLUR, exist_ok=True)
blurs = 0
for name in sorted(os.listdir(ROOT)):
    if not name.endswith('-kapak.jpg'):
        continue
    im = Image.open(os.path.join(ROOT, name)).convert('RGB')
    im.thumbnail((90, 180), Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(7))
    im = ImageEnhance.Color(im).enhance(1.5)
    im = ImageEnhance.Brightness(im).enhance(.95)
    im.save(os.path.join(BLUR, name), quality=72, optimize=True, progressive=False)
    blurs += 1
print(f'{blurs} blurred card grounds in img/b/')

# the covers of the book cards in WebP (17.11, «hızlandırma»): the home rows and «Diğer masallarımız» show a cover 133-200 px wide —
# 450 px is enough for a 3× phone screen (img/c/, ~37 KB instead of 168); the big collection cards and the book page's cover get
# 800 px (img/w/, ~85 KB). The original JPEGs stay for zooming in, the cart and the old phones without WebP (onerror falls back).
for sub, w in (('c', 450), ('w', 800)):
    out = os.path.join(ROOT, sub)
    os.makedirs(out, exist_ok=True)
    n = 0
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith('-kapak.jpg'):
            continue
        im = Image.open(os.path.join(ROOT, name)).convert('RGB')
        im.thumbnail((w, w * 2), Image.LANCZOS)
        im.save(os.path.join(out, name[:-4] + '.webp'), 'WEBP', quality=78, method=6)
        n += 1
    print(f'{n} WebP covers in img/{sub}/')
