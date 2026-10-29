#!/usr/bin/env python3
"""Make small copies of every image in img/ for thumbnails (img/t/), so strips of pages load fast.
Run after adding images:   python3 tools/build-thumbs.py"""
import os
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
