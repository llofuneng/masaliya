#!/usr/bin/env python3
"""Make small copies of every image in img/ for thumbnails (img/t/) and medium copies of book pages
(img/m/) for phones, so strips of pages and the page viewer load fast.
Run after adding images:   python3 tools/build-thumbs.py"""
import os
import re
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'img')
OUT = os.path.join(ROOT, 't')
os.makedirs(OUT, exist_ok=True)
made = 0
for name in sorted(os.listdir(ROOT)):
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
for name in sorted(os.listdir(ROOT)):
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
