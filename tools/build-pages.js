#!/usr/bin/env node
/* Builds one page per product (dua.html, lavin.html, …) from urun.html, each with its own
   title, description and link-preview (Open Graph) tags, so every product has a real address.
   Run after adding or changing a product in site.js:   node tools/build-pages.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://masaliya.com';

// read the catalogue straight from site.js
const code = fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8') + '\n;this.__cat = { PRODUCTS, AUDIENCES, TYPES, OCCASIONS };';
const ctx = { document: { addEventListener() {} }, location: {}, addEventListener() {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { PRODUCTS, AUDIENCES, TYPES, OCCASIONS } = ctx.__cat;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)) + '…');

const template = fs.readFileSync(path.join(ROOT, 'urun.html'), 'utf8');
const written = [];

for (const p of PRODUCTS) {
  const kind = p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one;
  const name = `${p.hero ? p.hero + ' ' : ''}${p.title}`;
  const title = `${name} · ${kind} · Masaliya`;
  const desc = clip(`${kind}, ${AUDIENCES[p.aud].name.toLocaleLowerCase('tr-TR')}. ${p.desc}`, 158);
  const image = `${SITE}/${p.img || 'img/og.jpg'}`;
  const url = `${SITE}/${p.id}`;

  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Masaliya">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">`)
    .replace('<body data-page="urun">', `<body data-page="urun" data-product="${p.id}">`);
  if (!html.includes(`data-product="${p.id}"`)) throw new Error('urun.html template changed: body tag not found');
  fs.writeFileSync(path.join(ROOT, `${p.id}.html`), html);
  written.push(`${p.id}.html`);
}

// sitemap for search engines
const pages = ['', 'urunler', 'kizlar', 'erkekler', 'yetiskinler', 'nasil', 'sss', 'gizlilik', ...PRODUCTS.map(p => p.id)];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(u => `  <url><loc>${SITE}/${u}</loc></url>`).join('\n')}\n</urlset>\n`);

console.log(`wrote ${written.length} product pages and sitemap.xml`);
