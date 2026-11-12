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
const code = fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8') + '\n;this.__cat = { SELL, PRODUCTS, AUDIENCES, TYPES, OCCASIONS, PRICES, ALL_SETS, GIFT_BOX_PRICE, FORMATS, PAIR_DEAL };';
const ctx = { document: { addEventListener() {} }, location: {}, addEventListener() {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { SELL, PRODUCTS, AUDIENCES, TYPES, OCCASIONS, PRICES, ALL_SETS, GIFT_BOX_PRICE, FORMATS, PAIR_DEAL } = ctx.__cat;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)) + '…');

// the product page template; the campaign end date in its head follows PAIR_DEAL (read below, used further down)
let template = fs.readFileSync(path.join(ROOT, 'urun.html'), 'utf8');
const written = [];
{
  const { PAIR_DEAL: deal } = ctx.__cat;
  template = template.replace(/Date\.parse\('[^']*'\)\) document\.documentElement\.classList\.add\('deal-on'\)/, `Date.parse('${deal ? deal.until : '1970-01-01T00:00:00Z'}')) document.documentElement.classList.add('deal-on')`);
}

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
const pages = ['', 'urunler', 'kizlar', 'erkekler', ...(AUDIENCES.yetiskin.hidden ? [] : ['yetiskinler']), 'nasil', 'sss', 'gizlilik', 'mesafeli-satis', 'kvkk', ...PRODUCTS.filter(p => !p.hidden && !(p.book && PRODUCTS.find(x => x.id === p.book).hidden) && (p.type !== 'boyama' || SELL.boyama)).map(p => p.id)];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(u => `  <url><loc>${SITE}/${u}</loc></url>`).join('\n')}\n</urlset>\n`);

// the campaign end date, also used in the page heads to keep room for the running line before it is drawn
for (const f of ['index.html', 'kizlar.html', 'erkekler.html', 'urunler.html', 'urun.html']) {
  const file = path.join(ROOT, f), t = fs.readFileSync(file, 'utf8');
  const t2 = t.replace(/Date\.parse\('[^']*'\)\) (document\.documentElement|d)\.classList\.add\('deal-on'\)/, (m, who) => `Date.parse('${PAIR_DEAL ? PAIR_DEAL.until : '1970-01-01T00:00:00Z'}')) ${who}.classList.add('deal-on')`);
  if (t2 === t && !t.includes(PAIR_DEAL ? PAIR_DEAL.until : '1970-01-01')) throw new Error('deal date marker not found in ' + f);
  fs.writeFileSync(file, t2);
}

// the order server prices orders itself: give it the same catalogue
const WORKER = path.join(ROOT, 'worker', 'masaliya-siparis.js');
const catalog = {
  books: Object.fromEntries(PRODUCTS.filter(p => p.type === 'kitap' && p.status === 'hazir').map(p => [p.id, { title: p.title, hero: p.hero }])),
  prices: PRICES,
  // every set, also the ones switched off on the site: switching them back on then needs no new server code
  sets: ALL_SETS.map(({ id, name, items, discount }) => ({ id, name, items, discount })),
  giftBox: GIFT_BOX_PRICE,
  // every two hardcover books in one order: this much off, until this moment
  pairDeal: PAIR_DEAL ? { off: PAIR_DEAL.off, until: PAIR_DEAL.until } : null,
  covers: Object.fromEntries(FORMATS.kitap.map(([k, name]) => [k, k === 'digital' ? 'Dijital kitap (PDF)' : name.charAt(0) + name.slice(1).toLocaleLowerCase('tr-TR')]))
};
const w = fs.readFileSync(WORKER, 'utf8');
if (!/\/\* CATALOG:START \*\/[\s\S]*?\/\* CATALOG:END \*\//.test(w)) throw new Error('worker catalogue markers not found');
const w2 = w.replace(/\/\* CATALOG:START \*\/[\s\S]*?\/\* CATALOG:END \*\//, `/* CATALOG:START */\nconst CATALOG = ${JSON.stringify(catalog)};\n/* CATALOG:END */`);
// the owner pastes this file into Cloudflare by hand, and a text editor may read it in the wrong encoding
// (TextEdit on a Mac turns "ş" into "≈ü"): keep the file pure ASCII, Turkish letters written as \uXXXX escapes
const ascii = s => s.replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(WORKER, ascii(w2));

console.log(`wrote ${written.length} product pages, sitemap.xml and the order server catalogue`);
