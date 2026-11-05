#!/usr/bin/env python3
"""Stamp site.css and site.js links in every page with a fresh version (?v=...), so browsers
fetch the new files after each publish instead of showing a cached copy.
Run before committing a change to site.css or site.js:   python3 tools/bump-version.py"""
import glob, os, re, time

ROOT = os.path.join(os.path.dirname(__file__), '..')
v = time.strftime('%Y%m%d%H%M')
n = 0
for path in glob.glob(os.path.join(ROOT, '*.html')):
    s = open(path, encoding='utf-8').read()
    t = re.sub(r'(href="site\.css|src="site\.js)(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={v}"', s)
    if t != s:
        open(path, 'w', encoding='utf-8').write(t)
        n += 1
print(f'version {v} in {n} pages')
