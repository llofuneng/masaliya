/* Masaliya order server: a Cloudflare Worker.
   The site puts each book in the cart here (book, options and three photos, kept in a private R2
   bucket), then sends the whole cart with the contacts for payment. The price is worked out here,
   and the customer goes to a Stripe payment page. When Stripe reports the payment, the order is
   marked paid and the owner gets an e-mail with the order and links to the photos. Cart items and
   orders that are not paid within 3 days are deleted with their photos.

   Settings (Cloudflare \u2192 Worker \u2192 Settings \u2192 Variables and Secrets), see worker/KURULUM.md:
     STRIPE_SECRET_KEY      Stripe secret key (sk_live_\u2026 or sk_test_\u2026)
     STRIPE_WEBHOOK_SECRET  signing secret of the Stripe webhook (whsec_\u2026)
     RESEND_API_KEY         Resend key for the order e-mails (re_\u2026)
     OWNER_EMAIL            where order e-mails go
     ADMIN_KEY              a long password for the order list page (/admin?key=\u2026)
     SITE_URL               https://masaliya.com
   Binding: R2 bucket as PHOTOS. Cron trigger: once a day, for the clean-up.

   The catalogue below is written by tools/build-pages.js from site.js: don't edit it by hand. */

/* CATALOG:START */
const CATALOG = {"books":{"noel-babaya-surpriz-kiz":{"title":"ve Noel Baba'ya S\u00fcrpriz","hero":"Lina"},"ataturkten-yeni-yil-dilegi-kiz":{"title":"\u0130\u00e7in Yeni Y\u0131l Dile\u011fi","hero":"Deniz","pre":"Atat\u00fcrk'ten"},"dunyada-yilbasi-kiz":{"title":"ile D\u00fcnyada Y\u0131lba\u015f\u0131","hero":"Melis"},"kari-hic-gormemis-flamingo":{"title":"ve Kar\u0131 Hi\u00e7 G\u00f6rmemi\u015f Flamingo","hero":"Azra"},"buz-satosunun-sirri":{"title":"ve Buz \u015eatosunun S\u0131rr\u0131","hero":"Asya"},"gokkusagi-unicornu":{"title":"ve G\u00f6kku\u015fa\u011f\u0131 Unicornu","hero":"Ada"},"sihirli-firca":{"title":"ve Sihirli F\u0131r\u00e7a","hero":"Duru"},"minik-pandalar":{"title":"ve Minik Pandalar","hero":"Ela"},"sihirli-kutuphane":{"title":"ve Sihirli K\u00fct\u00fcphane","hero":"Zeynep"},"deniz-kizi-kralligi":{"title":"ve Deniz K\u0131z\u0131 Krall\u0131\u011f\u0131","hero":"Elif"},"noel-babaya-hediye":{"title":"ve Noel Baba'ya S\u00fcrpriz","hero":"Edis"},"ataturkten-yeni-yil-dilegi":{"title":"\u0130\u00e7in Yeni Y\u0131l Dile\u011fi","hero":"Atlas","pre":"Atat\u00fcrk'ten"},"dunyada-yilbasi":{"title":"ile D\u00fcnyada Y\u0131lba\u015f\u0131","hero":"Can"},"karla-oynayan-fil-yavrusu":{"title":"ve Karla Oynayan Fil Yavrusu","hero":"Batu"},"dinozorlarin-dogum-gunu":{"title":"ve Dinozorlar\u0131n Do\u011fum G\u00fcn\u00fc","hero":"Kerem"},"kayip-ay-isigi":{"title":"ve Kay\u0131p Ay I\u015f\u0131\u011f\u0131","hero":"Ege"},"buyuk-yaris":{"title":"ve B\u00fcy\u00fck Yar\u0131\u015f","hero":"Poyraz"},"denizi-kurtariyor":{"title":"Denizi Kurtar\u0131yor","hero":"Mert"},"kaybolan-minik-aslan":{"title":"ve Kaybolan Minik Aslan","hero":"Emir"}},"prices":{"kitap":{"hard":2900,"digital":900},"boyama":{"print":590,"digital":null},"yapboz":{"std":640}},"sets":[{"id":"tek","name":"Yaln\u0131zca kitap","items":[],"discount":0},{"id":"masal-seti","name":"Masal Seti","items":[["boyama","print"]],"discount":0},{"id":"yapboz-seti","name":"Puzzle Seti","items":[["yapboz","std"]],"discount":0},{"id":"super-set","name":"S\u00fcper Set","items":[["boyama","print"],["yapboz","std"]],"discount":0}],"giftBox":300,"pairDeal":{"off":900,"until":"2026-12-15T23:59:59+03:00"},"covers":{"hard":"Sert kapak","digital":"Dijital kitap (PDF)"}};
/* CATALOG:END */

const PART_NAMES = { boyama: 'boyama kitab\u0131', yapboz: 'ah\u015fap puzzle' };
const UNPAID_DAYS = 3;
const MAX_PHOTO = 12 * 1024 * 1024;
const MAX_ITEMS = 10;
const PHOTO_DAYS = 30;   // photos are deleted this many days after the order is marked delivered

/* the steps of a paid order. Payment moves it to the first one by itself; the owner moves it on
   with the buttons on the order page (/admin/MSL-\u2026). */
const STAGES = {
  tasarim:  { admin: 'Tasar\u0131mda', title: 'Tasar\u0131mda', text: 'Resimleriniz haz\u0131rlan\u0131yor. \u00d6demeden sonra 3 i\u015f g\u00fcn\u00fc i\u00e7inde b\u00fct\u00fcn sayfalar\u0131n \u00f6nizlemesini g\u00f6nderece\u011fiz.' },
  onizleme: { admin: '\u00d6nizleme g\u00f6nderildi', title: '\u00d6nizleme onay\u0131n\u0131z\u0131 bekliyor', text: 'B\u00fct\u00fcn sayfalar\u0131 size g\u00f6nderdik. De\u011fi\u015ftirmek istedi\u011finiz bir \u015fey varsa bize yaz\u0131n; onay\u0131n\u0131zla devam ediyoruz.' },
  baski:    { admin: 'Bask\u0131da', title: 'Bask\u0131da', text: 'Onay\u0131n\u0131z i\u00e7in te\u015fekk\u00fcrler. Kitab\u0131n\u0131z 5 i\u015f g\u00fcn\u00fc i\u00e7inde bas\u0131l\u0131p kargoya verilir.' },
  kargo:    { admin: 'Kargoda', title: 'Kargoda', text: 'Kitab\u0131n\u0131z yola \u00e7\u0131kt\u0131.' },
  teslim:   { admin: 'Teslim edildi', title: 'Teslim edildi', text: `\u0130yi okumalar! Foto\u011fraflar\u0131n\u0131z ${PHOTO_DAYS} g\u00fcn i\u00e7inde sistemlerimizden silinir.` }
};
const stageLabel = o => o.cancelled ? '\u0130ptal edildi' : o.status === 'odendi' ? STAGES[o.stage || 'tasarim'].admin : '\u00d6deme bekleniyor';
const refundBadge = o => !o.cancelled ? '' : o.refund && o.refund.state === 'yapildi'
  ? '<span class="badge ok">\u0130ade yap\u0131ld\u0131</span>' : o.refund && o.refund.state === 'gerekmiyor' ? '<span class="badge ok">\u0130ade gerekmiyor</span>' : '<span class="badge no">\u0130ade yap\u0131lmad\u0131</span>';
// what the customer paid: 0 with a 100 % promotion code (17.11; 'amountPaid || total' showed the full price then)
const paidSum = o => typeof o.amountPaid === 'number' ? o.amountPaid : o.price.total;
const promoNote = o => o.promoCode ? ' \u00b7 promosyon kodu ' + esc(o.promoCode) + (o.discountUsed ? ' (\u2212' + o.discountUsed.toLocaleString('tr-TR') + ' TL)' : '') : '';
const stagesFor = o => o.ships ? ['tasarim', 'onizleme', 'baski', 'kargo', 'teslim'] : ['tasarim', 'onizleme', 'teslim'];
const MAX_PREVIEW = 25 * 1024 * 1024, PREVIEW_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// each part of a book's set gets its own preview: the book, the coloring book, the puzzle
const PART_LABELS = { kitap: 'Kitap', boyama: 'Boyama kitab\u0131', yapboz: 'Ah\u015fap puzzle' };
const partsOf = it => ['kitap', ...((CATALOG.sets.find(s => s.id === it.set) || { items: [] }).items.map(([p]) => p))];
const partFiles = (o, it, part) => ((o.previews || {})[it.id] || []).filter(f => (f.part || 'kitap') === part);
const stageTitle = (o, k) => !o.ships && k === 'teslim' ? 'E-postan\u0131za g\u00f6nderildi' : STAGES[k].title;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (req.method === 'OPTIONS') return cors(env, new Response(null, { status: 204 }));
      if (req.method === 'POST' && url.pathname === '/api/item') return cors(env, await addItem(req, env));
      if (req.method === 'POST' && url.pathname === '/api/order') return cors(env, await createOrder(req, env));
      if (req.method === 'POST' && url.pathname === '/api/kod') return cors(env, await checkCode(req, env));
      if (req.method === 'POST' && url.pathname === '/api/stripe') return await stripeEvent(req, env);
      if (req.method === 'GET' && url.pathname === '/api/status') return cors(env, await orderStatus(url, env));
      if (req.method === 'POST' && url.pathname === '/api/onay') return cors(env, await customerReview(req, url, env));
      if (req.method === 'POST' && url.pathname === '/api/iptal') return cors(env, await customerCancel(req, env));
      const pv = url.pathname.match(/^\/api\/onizleme\/(MSL-[A-Z0-9]{6})\/([A-Za-z0-9-]+\.(?:jpg|png|webp|pdf))$/);
      if (req.method === 'GET' && pv) return await previewFile(pv[1], pv[2], url, env);
      if (req.method === 'GET' && url.pathname === '/admin') return await adminList(url, env, req);
      if (req.method === 'GET' && url.pathname === '/admin/istatistik') return await adminStats(url, env, req);
      if (req.method === 'GET' && url.pathname === '/admin/eposta') return await adminMail(url, env, req);
      const m = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})(?:\/(KTP-[A-Z0-9]{8})\/((?:ek[12]-)?foto-[123])\.jpg)?$/);
      if (req.method === 'GET' && m) {
        const res = await adminOrder(m[1], m[2], m[3], url, env);
        // an open order page lets "\u2190 Sipari\u015fler" lead straight to the whole order list on this browser
        if (res.status !== 200 || m[3]) return res;
        const h = new Headers(res.headers); h.append('set-cookie', `mk=${await ownerCookie(env)}; Path=/admin; Max-Age=${60 * 60 * 24 * 60}; HttpOnly; Secure; SameSite=Lax`);
        return new Response(res.body, { status: 200, headers: h });
      }
      const s = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})\/asama$/);
      if (req.method === 'POST' && s) return await setStage(s[1], req, url, env);
      const cx = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})\/(iptal|iade-yapildi)$/);
      if (req.method === 'POST' && cx) return await cancelOrder(cx[1], cx[2], url, env);
      const up = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})\/onizleme$/);
      if (req.method === 'POST' && up) return await uploadPreview(up[1], req, url, env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.log('error', err && err.stack || err);
      return cors(env, json({ error: 'Bir sorun olu\u015ftu, l\u00fctfen tekrar deneyin.' }, 500));
    }
  },
  async scheduled(event, env) { await removeUnpaid(env); await putJson(env, 'sistem/temizlik.json', { cron: new Date().toISOString() }); }   // unpaid orders, and photos after delivery; the time of the last nightly run for the mail page
};

/* ---------- one book into the cart: options and three photos ---------- */
async function addItem(req, env) {
  const form = await req.formData();
  let o;
  try { o = JSON.parse(form.get('item') || '{}'); } catch (e) { return json({ error: 'Kitap bilgileri okunamad\u0131.' }, 400); }
  const book = CATALOG.books[o.product];
  const set = CATALOG.sets.find(s => s.id === o.set);
  const coverPrice = CATALOG.prices.kitap[o.cover];
  const hero = String(o.hero || '').trim().slice(0, 32);
  const about = String(o.about || '').trim().slice(0, 400);
  if (!book || !set || !coverPrice) return json({ error: 'Se\u00e7ti\u011finiz kitap ya da se\u00e7enek bulunamad\u0131.' }, 400);
  if (o.cover === 'digital' && set.items.length) return json({ error: 'Dijital kitap setle birlikte sipari\u015f edilemez.' }, 400);
  if (!hero) return json({ error: 'Kahraman\u0131n ad\u0131 eksik.' }, 400);
  if (o.consentKvkk !== true) return json({ error: 'Foto\u011fraflar i\u00e7in a\u00e7\u0131k r\u0131za gerekiyor.' }, 400);
  const photos = [1, 2, 3].map(n => form.get('photo' + n));
  const badPhoto = f => !f || typeof f === 'string' || !/^image\//.test(f.type) || f.size > MAX_PHOTO || f.size < 1000;
  if (photos.some(badPhoto)) return json({ error: '\u00dc\u00e7 foto\u011fraf\u0131n \u00fc\u00e7\u00fc de gerekli (en fazla 12 MB).' }, 400);
  // 18.11: up to two more heroes in the same book (a sibling, a parent, a friend, a pet), free; each with a name, who they are to
  // the hero (written by the customer) and three photos of their own, kept as items/<id>/ek1-foto-1.jpg \u2026
  const extras = (Array.isArray(o.extras) ? o.extras : []).slice(0, MAX_EXTRA).map(x => ({ name: String((x && x.name) || '').trim().slice(0, 32), relation: String((x && x.relation) || '').trim().slice(0, 40) }));
  if (extras.some(x => !x.name)) return json({ error: `${extras.findIndex(x => !x.name) + 2}. kahraman\u0131n ad\u0131 eksik.` }, 400);
  const extraPhotos = extras.map((x, k) => [1, 2, 3].map(n => form.get(`ek${k + 1}photo${n}`)));
  if (extraPhotos.some(ph => ph.some(badPhoto))) return json({ error: `${extraPhotos.findIndex(ph => ph.some(badPhoto)) + 2}. kahraman i\u00e7in de \u00fc\u00e7 foto\u011fraf gerekli (en fazla 12 MB).` }, 400);

  // the price is worked out here, never taken from the browser
  const parts = set.items.map(([t, f]) => CATALOG.prices[t][f]);
  // the printed book can come with its PDF too (both chosen on the page)
  const pdf = o.pdf === true && o.cover === 'hard' && !!CATALOG.prices.kitap.digital;
  const setPrice = Math.round((coverPrice + parts.reduce((a, b) => a + b, 0)) * (1 - set.discount)) + (pdf ? CATALOG.prices.kitap.digital : 0);
  const ships = o.cover !== 'digital' || set.items.length > 0;
  const giftBox = !!o.giftBox && ships;
  const item = {
    id: newId('KTP-', 8), status: 'sepette', created: new Date().toISOString(),
    product: o.product, title: `${book.pre ? book.pre + ' ' : ''}${hero} ${book.title}`, hero, about, cover: o.cover, pdf, set: set.id, setName: set.name,
    contents: [CATALOG.covers[o.cover], ...(pdf ? [CATALOG.covers.digital] : []), ...set.items.map(([t]) => PART_NAMES[t])].join(' + ') + (extras.length ? ' \u00b7 ' + extraLine(extras) : ''),
    extras,
    giftBox, giftNote: giftBox ? String(o.giftNote || '').slice(0, 240) : '', ships,
    price: { set: setPrice, giftBox: giftBox ? CATALOG.giftBox : 0, total: setPrice + (giftBox ? CATALOG.giftBox : 0) }
  };
  await Promise.all([[photos, ''], ...extraPhotos.map((ph, k) => [ph, `ek${k + 1}-`])].flatMap(([ph, pre]) => ph.map((f, i) => env.PHOTOS.put(`items/${item.id}/${pre}foto-${i + 1}.jpg`, f.stream(), { httpMetadata: { contentType: f.type } }))));
  await putJson(env, `items/${item.id}/kitap.json`, item);
  await countDay(env, 'sepet', item.product);
  return json(publicItem(item));
}
const publicItem = it => ({ id: it.id, product: it.product, title: it.title, contents: it.contents, setName: it.setName, cover: it.cover, giftBox: it.giftBox, giftNote: it.giftNote, price: it.price, extras: it.extras || [] });
const MAX_EXTRA = 2;
// «2. kahraman: Ali (kardeşi) · 3. kahraman: Pamuk (kedisi)» — in the cart, on the payment page, in the mails (her words: not «extra», the 2nd and the 3rd hero)
const extraLine = xs => xs.map((x, k) => `${k + 2}. kahraman: ${x.name}${x.relation ? ` (${x.relation})` : ''}`).join(' \u00b7 ');
// every photo kept for a book: the hero's three and the extra heroes' (deleting a key that is not there does nothing)
const itemPhotos = dir => ['', ...Array.from({ length: MAX_EXTRA }, (_, k) => `ek${k + 1}-`)].flatMap(pre => [1, 2, 3].map(n => `${dir}/${pre}foto-${n}.jpg`));

/* ---------- the cart to the payment page ---------- */
// a promotion code for this cart (17.11): exists, active, not used up, not expired; one product only. The discount is worked out
// the way Stripe will apply it, so the cart shows the real total before the payment page.
async function findPromo(env, raw, items, total) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: 'Bu promosyon kodu ge\u00e7ersiz. Kodu Latin harfleri ve rakamlarla yaz\u0131n.' };
  if (items.length !== 1) return { error: 'Promosyon kodu yaln\u0131zca tek \u00fcr\u00fcnl\u00fck sipari\u015flerde ge\u00e7erli. Sepette bir masal b\u0131rak\u0131n.' };
  let list;
  try { list = await stripe(env, `promotion_codes?code=${encodeURIComponent(code)}&active=true&limit=1`); } catch (e) { return { error: 'Kod \u015fu anda kontrol edilemedi. L\u00fctfen biraz sonra tekrar deneyin.' }; }
  const pc = list.data && list.data[0];
  if (!pc) return { error: 'Bu promosyon kodu bulunamad\u0131 ya da art\u0131k ge\u00e7erli de\u011fil.' };
  if (pc.max_redemptions && pc.times_redeemed >= pc.max_redemptions) return { error: 'Bu promosyon kodu daha \u00f6nce kullan\u0131lm\u0131\u015f.' };
  if (pc.expires_at && pc.expires_at * 1000 < Date.now()) return { error: 'Bu promosyon kodunun s\u00fcresi dolmu\u015f.' };
  let cp = pc.coupon || (pc.promotion && pc.promotion.coupon);
  if (typeof cp === 'string') { try { cp = await stripe(env, `coupons/${cp}`); } catch (e) { cp = null; } }
  if (!cp || cp.valid === false) return { error: 'Bu promosyon kodu art\u0131k ge\u00e7erli de\u011fil.' };
  const r = pc.restrictions || {};
  if (r.minimum_amount && (!r.minimum_amount_currency || r.minimum_amount_currency === 'try') && total * 100 < r.minimum_amount) return { error: `Bu kod ${(r.minimum_amount / 100).toLocaleString('tr-TR')} TL ve \u00fczeri sipari\u015flerde ge\u00e7erli.` };
  const off = cp.percent_off ? Math.round(total * cp.percent_off) / 100 : cp.amount_off && (!cp.currency || cp.currency === 'try') ? Math.min(total, cp.amount_off / 100) : 0;
  if (!off) return { error: 'Bu promosyon kodu bu sipari\u015fe uygulanam\u0131yor.' };
  return { pc, cp, code: pc.code, off, total: Math.max(0, total - off) };
}
// the cart asks before the payment page: { code, items } -> the discount and the new total
async function checkCode(req, env) {
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: '\u0130stek okunamad\u0131.' }, 400); }
  const ids = [...new Set(Array.isArray(b.items) ? b.items : [])].slice(0, MAX_ITEMS + 1);
  const items = await Promise.all(ids.map(id => /^KTP-[A-Z0-9]{8}$/.test(id) ? getJson(env, `items/${id}/kitap.json`) : null));
  if (!items.length || items.some(it => !it || it.status === 'odendi')) return json({ error: 'Sepetinizdeki kitaplar bulunamad\u0131. Sayfay\u0131 yenileyip tekrar deneyin.' }, 409);
  const total = items.reduce((a, it) => a + it.price.total, 0);   // one product: no two-book discount here
  const pr = await findPromo(env, b.code, items, total);
  if (pr.error) return json({ error: pr.error }, 400);
  return json({ ok: true, code: pr.code, off: pr.off, total: pr.total });
}

async function createOrder(req, env) {
  let o;
  try { o = await req.json(); } catch (e) { return json({ error: 'Sipari\u015f bilgileri okunamad\u0131.' }, 400); }
  const ids = [...new Set(Array.isArray(o.items) ? o.items : [])].slice(0, MAX_ITEMS + 1);
  const phone = String(o.phone || '').trim(), email = String(o.email || '').trim();
  if (!ids.length) return json({ error: 'Sepetiniz bo\u015f.' }, 400);
  if (ids.length > MAX_ITEMS) return json({ error: `Bir sipari\u015fte en fazla ${MAX_ITEMS} kitap olabilir.` }, 400);
  if (!/^[\d\s()+-]{10,20}$/.test(phone)) return json({ error: 'Telefon numaras\u0131 ge\u00e7ersiz.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-posta adresi ge\u00e7ersiz.' }, 400);
  if (o.consentTerms !== true) return json({ error: '\u00d6n Bilgilendirme Formu ve Mesafeli Sat\u0131\u015f S\u00f6zle\u015fmesi onay\u0131 eksik.' }, 400);
  const name = String(o.name || '').trim().slice(0, 80);
  if (name.length < 3) return json({ error: 'Ad soyad eksik.' }, 400);
  const items = await Promise.all(ids.map(id => /^KTP-[A-Z0-9]{8}$/.test(id) ? getJson(env, `items/${id}/kitap.json`) : null));
  const missing = ids.filter((id, i) => !items[i] || items[i].status === 'odendi');
  if (missing.length) return json({ error: 'Sepetinizdeki baz\u0131 kitaplar\u0131n s\u00fcresi dolmu\u015f. L\u00fctfen onlar\u0131 yeniden ekleyin.', missing }, 409);

  const ships = items.some(it => it.ships);
  let shipping = null;
  if (ships) {
    // the delivery address is written on our site; the payment page only asks for the card
    const a = o.address || {}, f = k => String(a[k] || '').trim();
    shipping = { name, line1: f('adres').slice(0, 300), city: f('ilce').slice(0, 40), state: f('il').slice(0, 40), postal_code: f('posta').slice(0, 5), country: 'TR' };
    if (shipping.line1.length < 10 || shipping.city.length < 2 || shipping.state.length < 3) return json({ error: 'Teslimat adresi eksik: il, il\u00e7e ve a\u00e7\u0131k adres gerekli.' }, 400);
    if (shipping.postal_code && !/^\d{5}$/.test(shipping.postal_code)) return json({ error: 'Posta kodu 5 rakamdan olu\u015fur.' }, 400);
  }
  // campaign: the second of every two hardcover books costs less (until the date in the catalogue)
  const deal = CATALOG.pairDeal && Date.now() <= Date.parse(CATALOG.pairDeal.until) ? CATALOG.pairDeal.off : 0;
  const cut = new Map();
  if (deal) items.filter(it => it.cover === 'hard').forEach((it, i) => { if (i % 2 === 1) cut.set(it.id, deal); });
  const discount = [...cut.values()].reduce((a, b) => a + b, 0);
  const total = items.reduce((a, it) => a + it.price.total, 0) - discount;
  const boxes = items.filter(it => it.giftBox).length;
  const order = {
    id: newId('MSL-', 6), status: 'odeme-bekleniyor', created: new Date().toISOString(),
    items, ships, shipping, price: { total, discount }, contact: { name, phone, email }
  };
  await saveOrder(env, order);

  const site = env.SITE_URL || 'https://masaliya.com';
  const summary = items.map(it => `${it.title} (${it.setName})`).join('; ');
  const p = new URLSearchParams({
    mode: 'payment', locale: 'tr', client_reference_id: order.id, customer_email: email,
    success_url: `${site}/tesekkurler.html?siparis=${order.id}`,
    cancel_url: `${site}/sepet.html?odeme=iptal`,
    'metadata[siparis]': order.id, 'metadata[kitaplar]': summary.slice(0, 480), 'metadata[telefon]': phone,
    'payment_intent_data[description]': `${order.id} \u00b7 ${items.length} kitap \u00b7 ${summary}`.slice(0, 990),
    'payment_intent_data[metadata][siparis]': order.id
  });
  let n = 0;
  for (const it of items) {
    p.set(`line_items[${n}][quantity]`, '1');
    p.set(`line_items[${n}][price_data][currency]`, 'try');
    p.set(`line_items[${n}][price_data][unit_amount]`, String((it.price.set - (cut.get(it.id) || 0)) * 100));
    p.set(`line_items[${n}][price_data][product_data][name]`, `${it.title} \u00b7 ${it.setName}${cut.has(it.id) ? ` \u00b7 ikinci kitap ${(it.price.set - cut.get(it.id)).toLocaleString('tr-TR')} TL` : ''}`);
    p.set(`line_items[${n}][price_data][product_data][description]`, it.contents);
    n++;
  }
  if (boxes) {
    p.set(`line_items[${n}][quantity]`, String(boxes));
    p.set(`line_items[${n}][price_data][currency]`, 'try');
    p.set(`line_items[${n}][price_data][unit_amount]`, String(CATALOG.giftBox * 100));
    p.set(`line_items[${n}][price_data][product_data][name]`, 'Hediye kutusu');
  }
  if (shipping) {
    // shown with the payment in Stripe too
    p.set('payment_intent_data[shipping][name]', shipping.name);
    p.set('payment_intent_data[shipping][phone]', phone);
    for (const k of ['line1', 'city', 'state', 'postal_code', 'country']) if (shipping[k]) p.set(`payment_intent_data[shipping][address][${k}]`, shipping[k]);
  }
  // promotion codes (17.11: a free book for a blogger, any product but only one). A code written in our cart comes with the order,
  // is checked again here and goes to Stripe already applied; without one, a one-product order still gets the code field on the
  // payment page (Stripe allows one or the other). A cart of two or more books pays as usual; every line is quantity 1.
  if (o.promo) {
    const pr = await findPromo(env, o.promo, items, total);
    if (pr.error) return json({ error: pr.error, promo: true }, 400);
    p.set('discounts[0][promotion_code]', pr.pc.id);
    order.promoCode = pr.pc.code; await saveOrder(env, order);
  } else if (items.length === 1) p.set('allow_promotion_codes', 'true');
  const session = await stripe(env, 'checkout/sessions', p);
  order.stripeSession = session.id;
  await saveOrder(env, order);
  await countDay(env, 'odemeye', null, items.length);
  return json({ id: order.id, url: session.url });
}

/* ---------- Stripe tells us about the payment ---------- */
async function stripeEvent(req, env) {
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET))) return new Response('bad signature', { status: 400 });
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return new Response('ok');   // 0 TL with a 100 % code: no_payment_required (17.11)
    const order = await loadOrder(env, s.client_reference_id);
    if (!order || order.status === 'odendi') return new Response('ok');
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
    const cust = s.customer_details || {};
    order.status = 'odendi';
    order.paid = new Date().toISOString();
    order.amountPaid = s.amount_total / 100;
    order.paymentIntent = s.payment_intent || null;
    // a promotion code: how much it took off and which code it was (so the order list shows which blogger's code was used)
    order.discountUsed = s.total_details && s.total_details.amount_discount ? s.total_details.amount_discount / 100 : 0;
    if (order.discountUsed) {
      try {
        const full = await stripe(env, `checkout/sessions/${s.id}?expand%5B%5D=total_details.breakdown`);
        const d = (((full.total_details || {}).breakdown || {}).discounts || [])[0], pc = d && d.discount && d.discount.promotion_code;
        if (pc) order.promoCode = typeof pc === 'string' ? (await stripe(env, `promotion_codes/${pc}`)).code : pc.code;
      } catch (e) { order.promoCode = order.promoCode || '?'; }
    }
    order.stage = 'tasarim';
    order.history = { tasarim: order.paid };
    order.contact = { ...order.contact, name: order.contact.name || cust.name || '', email: order.contact.email || cust.email || '' };
    if (!order.shipping && ship) order.shipping = { name: ship.name, ...ship.address };
    await saveOrder(env, order);
    await countDay(env, 'odendi', null, order.items.length);
    // the books in this order are paid: the clean-up leaves them alone
    await Promise.all(order.items.map(async it => {
      const cur = await getJson(env, `items/${it.id}/kitap.json`);
      if (cur) await putJson(env, `items/${it.id}/kitap.json`, { ...cur, status: 'odendi', order: order.id });
    }));
    await mailOwner(env, order, new URL(req.url).origin);
    await mailCustomer(env, order, 'tasarim');
  }
  return new Response('ok');
}

/* ---------- order tracking on the site: order number + e-mail or phone ---------- */
async function orderStatus(url, env) {
  const order = await loadOrder(env, (url.searchParams.get('siparis') || '').toUpperCase());
  const who = (url.searchParams.get('iletisim') || '').trim().toLowerCase(), key = url.searchParams.get('k') || '';
  const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
  if (!order || !order.items || !((key && key === await ctoken(env, order.id)) || (who && (who === order.contact.email.toLowerCase() || (digits(who).length === 10 && digits(who) === digits(order.contact.phone))))))
    return json({ error: 'Bu bilgilerle bir sipari\u015f bulunamad\u0131.' }, 404);
  const h = order.history || {}, k = await ctoken(env, order.id), api = new URL(url.origin);
  const stages = order.status === 'odendi' ? stagesFor(order).map(st => ({ key: st, title: stageTitle(order, st), text: STAGES[st].text, date: h[st] || null })) : [];
  const previews = order.items.flatMap(it => { const parts = partsOf(it); return parts.map(part => ({ part, files: partFiles(order, it, part) })).filter(x => x.files.length).map(({ part, files }) => ({
    title: parts.length > 1 ? `${it.title} \u00b7 ${PART_LABELS[part]}` : it.title,
    files: files.map(f => ({ name: f.name, pdf: f.type === 'pdf', url: `${api.origin}/api/onizleme/${order.id}/${f.file}?k=${k}` })) })); });
  return json({
    id: order.id, status: order.status, stage: order.stage || null, ships: !!order.ships,
    books: order.items.map(it => ({ title: it.title, contents: `${it.setName} \u00b7 ${it.contents}` })), stages,
    cargo: order.cargo || null, created: order.created, paid: order.paid || null,
    k, previews: order.cancelled ? [] : previews, review: order.review || null, revisions: order.revisions || [],
    cancelled: order.cancelled || null, refunded: !!(order.refund && order.refund.state === 'yapildi'),
    cancelUntil: customerCanCancel(order) ? new Date(Date.parse(order.paid) + REFUND_HOURS * 36e5).toISOString() : null
  });
}

/* ---------- the customer looks at the preview and approves it or asks for changes ---------- */
async function customerReview(req, url, env) {
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: '\u0130stek okunamad\u0131.' }, 400); }
  const o = await loadOrder(env, String(b.siparis || '').toUpperCase());
  if (!o || !o.items || b.k !== await ctoken(env, o.id)) return json({ error: 'Sipari\u015f bulunamad\u0131.' }, 404);
  if (o.cancelled || o.stage !== 'onizleme' || !o.previews || !o.review || o.review.state !== 'bekliyor') return json({ error: 'Bu \u00f6nizleme i\u00e7in yan\u0131t\u0131n\u0131z zaten al\u0131nd\u0131.' }, 409);
  const now = new Date().toISOString();
  if (b.karar === 'onay') {
    o.review = { state: 'onay', date: now, round: o.previewRound };
    o.approved = now;
  } else if (b.karar === 'duzeltme') {
    const text = String(b.not || '').trim().slice(0, 2000);
    if (text.length < 3) return json({ error: 'L\u00fctfen neyi de\u011fi\u015ftirmemizi istedi\u011finizi yaz\u0131n.' }, 400);
    o.review = { state: 'duzeltme', date: now, round: o.previewRound };
    o.revisions = [...(o.revisions || []), { date: now, round: o.previewRound, text }];
  } else return json({ error: '\u0130stek okunamad\u0131.' }, 400);
  await saveOrder(env, o);
  const t = await token(env, o.id);
  await mailOwnerNote(env, o.review.state === 'onay' ? `${o.id} \u00b7 m\u00fc\u015fteri \u00f6nizlemeyi onaylad\u0131` : `${o.id} \u00b7 m\u00fc\u015fteri d\u00fczeltme istedi`,
    `<p>${o.review.state === 'onay' ? `M\u00fc\u015fteri \u00f6nizlemeyi onaylad\u0131.${o.ships ? ' Sipari\u015fi \u201cBask\u0131ya g\u00f6nder\u201d ile matbaaya g\u00f6nderebilirsiniz.' : ' Dijital kitab\u0131 g\u00f6nderip \u201cDijital kitab\u0131 g\u00f6nderdim\u201de bas\u0131n.'}` : `M\u00fc\u015fterinin d\u00fczeltme iste\u011fi:</p><blockquote style="border-left:3px solid #7a2434;margin:0;padding:4px 12px">${esc(o.revisions.at(-1).text).replace(/\n/g, '<br>')}</blockquote><p>`}</p><p><a href="${url.origin}/admin/${o.id}?t=${t}">Sipari\u015fi a\u00e7</a></p>`);
  return json({ ok: true, review: o.review, stage: o.stage });
}

async function previewFile(id, file, url, env) {
  const o = await loadOrder(env, id);
  const k = url.searchParams.get('k'), t = url.searchParams.get('t');
  if (!o || !((k && k === await ctoken(env, id)) || (t && t === await token(env, id)))) return new Response('Bulunamad\u0131', { status: 404 });
  const f = Object.values(o.previews || {}).flat().find(x => x.file === file);
  const obj = f && await env.PHOTOS.get(`orders/${id}/onizleme/${file}`);
  if (!obj) return new Response('Bulunamad\u0131', { status: 404 });
  const type = Object.keys(PREVIEW_TYPES).find(m => PREVIEW_TYPES[m] === f.type);
  return new Response(obj.body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'content-disposition': `inline; filename="${id}-${file}"`, 'access-control-allow-origin': env.SITE_URL || 'https://masaliya.com' } });
}

/* the owner uploads the preview pages of each book: a new upload for a book replaces its earlier pages */
async function uploadPreview(id, req, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giri\u015f yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items || o.status !== 'odendi') return new Response('Sipari\u015f bulunamad\u0131', { status: 404 });
  const back = note => Response.redirect(`${url.origin}/admin/${id}?t=${t}${note ? '&not=' + encodeURIComponent(note) : ''}`, 303);
  const form = await req.formData();
  const round = (o.previewRound || 0) + 1;
  const previews = { ...(o.previews || {}) };
  let added = 0;
  for (const it of o.items) for (const part of partsOf(it)) {
    const files = form.getAll(`f-${it.id}-${part}`).filter(f => f && typeof f !== 'string' && f.size > 0);
    if (!files.length) continue;
    if (files.some(f => !PREVIEW_TYPES[f.type] || f.size > MAX_PREVIEW)) return back('Yaln\u0131zca JPG, PNG, WEBP ya da PDF; her dosya en fazla 25 MB.');
    files.sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
    // a new upload for a part replaces that part's earlier pages only
    const old = partFiles({ previews }, it, part);
    if (old.length) await env.PHOTOS.delete(old.map(f => `orders/${id}/onizleme/${f.file}`));
    const kept = (previews[it.id] || []).filter(f => (f.part || 'kitap') !== part);
    for (const [n, f] of files.entries()) {
      const file = `${it.id}-${part}-${round}-${n + 1}.${PREVIEW_TYPES[f.type]}`;
      await env.PHOTOS.put(`orders/${id}/onizleme/${file}`, f.stream(), { httpMetadata: { contentType: f.type } });
      kept.push({ file, part, name: f.name.slice(0, 80), type: PREVIEW_TYPES[f.type] });
    }
    // book first, then coloring book, then puzzle
    previews[it.id] = kept.sort((a, b) => partsOf(it).indexOf(a.part || 'kitap') - partsOf(it).indexOf(b.part || 'kitap'));
    added += files.length;
  }
  if (!added) return back('Dosya se\u00e7ilmedi.');
  const now = new Date().toISOString();
  o.previews = previews; o.previewRound = round;
  o.review = { state: 'bekliyor', date: now, round };
  o.stage = 'onizleme'; o.history = { ...(o.history || {}), onizleme: now };
  await saveOrder(env, o);
  await mailCustomer(env, o, 'onizleme');
  return Response.redirect(`${url.origin}/admin/${id}?t=${t}&adim=onizleme&gonderildi=${added}`, 303);
}

/* ---------- owner pages: all orders, and one order with its photos ---------- */
/* ---------- the order funnel: books put in a cart \u2192 taken to payment \u2192 paid ---------- */
// one small file per day with counts; it stays when the 3-day clean-up deletes unpaid carts
async function countDay(env, what, product, n = 1) {
  try {
    const key = `istatistik/${new Date().toISOString().slice(0, 10)}.json`;
    const d = (await getJson(env, key)) || { sepet: 0, odemeye: 0, odendi: 0, kitaplar: {} };
    d[what] = (d[what] || 0) + n;
    if (product) d.kitaplar[product] = (d.kitaplar[product] || 0) + 1;
    await putJson(env, key, d);
  } catch (e) { console.log('count failed', e); }
}
// the mail check (17.11): what is set (never the values of secrets), how the last orders stand, and a test letter on request
async function adminMail(url, env, req) {
  const cookie = ((req && req.headers.get('cookie')) || '').match(/(?:^|;\s*)mk=([0-9a-f]+)/);
  if (!env.ADMIN_KEY || !((url.searchParams.get('key') === env.ADMIN_KEY) || (cookie && cookie[1] === await ownerCookie(env)))) return new Response('\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430. \u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0441\u043f\u0438\u0441\u043e\u043a \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0441 ADMIN_KEY: /admin?key=\u2026', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const ok = t => `<b style="color:#2e7d32">\u2713 ${t}</b>`, bad = t => `<b style="color:#b0412e">\u2717 ${t}</b>`;
  const mask = m => { const [a, d] = String(m).split('@'); return d ? `${a.slice(0, 2)}\u2026@${d}` : m; };
  const from = env.MAIL_FROM || '';
  const fromOk = /^[\x20-\x7e]+$/.test(from) && /<[^<>@\s]+@[^<>@\s]+\.[a-z]{2,}>$|^[^<>@\s]+@[^<>@\s]+\.[a-z]{2,}$/i.test(from.trim());
  const rows = [
    ['RESEND_API_KEY (\u043a\u043b\u044e\u0447 Resend)', env.RESEND_API_KEY ? ok('\u0437\u0430\u0434\u0430\u043d') : bad('\u041d\u0415 \u0437\u0430\u0434\u0430\u043d \u2014 \u043f\u0438\u0441\u044c\u043c\u0430 \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u0432\u043e\u043e\u0431\u0449\u0435')],
    ['OWNER_EMAIL (\u043a\u0443\u0434\u0430 \u043f\u0440\u0438\u0445\u043e\u0434\u044f\u0442 \u0437\u0430\u043a\u0430\u0437\u044b)', env.OWNER_EMAIL ? ok(esc(mask(env.OWNER_EMAIL))) : bad('\u041d\u0415 \u0437\u0430\u0434\u0430\u043d \u2014 \u043f\u0438\u0441\u044c\u043c\u0430 \u043e \u0437\u0430\u043a\u0430\u0437\u0430\u0445 \u0432\u0430\u043c \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f')],
    ['MAIL_FROM (\u043e\u0442 \u043a\u043e\u0433\u043e \u043f\u0438\u0441\u044c\u043c\u0430)', !from ? bad('\u043d\u0435 \u0437\u0430\u0434\u0430\u043d \u2014 \u043f\u0438\u0441\u044c\u043c\u0430 \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044f\u043c \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f; \u0432\u0430\u043c \u043f\u0438\u0441\u044c\u043c\u0430 \u0438\u0434\u0443\u0442 \u043e\u0442 onboarding@resend.dev') : fromOk ? ok(esc(from)) : bad(`\u00ab${esc(from)}\u00bb \u2014 \u0430\u0434\u0440\u0435\u0441 \u0437\u0430\u043f\u0438\u0441\u0430\u043d \u043d\u0435\u0432\u0435\u0440\u043d\u043e (\u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e, \u0448\u0438\u0440\u043e\u043a\u0438\u0439 \uff20 \u0438\u043b\u0438 \u043b\u0438\u0448\u043d\u0438\u0435 \u043a\u0430\u0432\u044b\u0447\u043a\u0438). \u041d\u0430\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043d\u043e\u0432\u043e: Masaliya &lt;siparis@masaliya.com&gt;`)],
    ['STRIPE_WEBHOOK_SECRET (Stripe \u0441\u043e\u043e\u0431\u0449\u0430\u0435\u0442 \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435)', env.STRIPE_WEBHOOK_SECRET ? ok('\u0437\u0430\u0434\u0430\u043d') : bad('\u041d\u0415 \u0437\u0430\u0434\u0430\u043d \u2014 \u0437\u0430\u043a\u0430\u0437\u044b \u043d\u0435 \u043e\u0442\u043c\u0435\u0447\u0430\u044e\u0442\u0441\u044f \u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043d\u044b\u043c\u0438 \u0438 \u043f\u0438\u0441\u0435\u043c \u043d\u0435\u0442')],
    ['\u041d\u043e\u0447\u043d\u0430\u044f \u0447\u0438\u0441\u0442\u043a\u0430 (Cron trigger)', (await getJson(env, 'sistem/temizlik.json').catch(() => null) || {}).cron ? ok('\u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0437\u0430\u043f\u0443\u0441\u043a ' + date((await getJson(env, 'sistem/temizlik.json')).cron)) : bad('\u043d\u0438 \u0440\u0430\u0437\u0443 \u043d\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u043b\u0430\u0441\u044c \u2014 \u0432 Cloudflare: Worker \u2192 Settings \u2192 Trigger events \u2192 Add \u2192 Cron trigger, 0 3 * * *. \u041f\u043e\u043a\u0430 \u0435\u0451 \u043d\u0435\u0442, \u043d\u0435\u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b \u0443\u0434\u0430\u043b\u044f\u044e\u0442\u0441\u044f, \u043a\u043e\u0433\u0434\u0430 \u0432\u044b \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442\u0435 \u0441\u043f\u0438\u0441\u043e\u043a \u0437\u0430\u043a\u0430\u0437\u043e\u0432')],
  ];
  // the last orders: paid ones mean Stripe reaches the program; \u00ab\u00f6deme bekleniyor\u00bb after a payment means it does not
  const keys = []; let cursor;
  do { const pg = await env.PHOTOS.list({ prefix: 'orders/', cursor }); keys.push(...pg.objects.map(o => o.key).filter(k => k.endsWith('/siparis.json'))); cursor = pg.truncated ? pg.cursor : null; } while (cursor);
  const orders = (await Promise.all(keys.map(k => getJson(env, k)))).filter(o => o && o.items).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 8);
  const list = orders.map(o => `<tr><td>${o.id}</td><td>${date(o.created)}</td><td>${o.status === 'odendi' ? ok('\u043e\u043f\u043b\u0430\u0447\u0435\u043d') : '\u0436\u0434\u0451\u0442 \u043e\u043f\u043b\u0430\u0442\u044b'}</td><td>${paidSum(o).toLocaleString('tr-TR')} TL${o.promoCode ? ' \u00b7 \u043a\u043e\u0434 ' + esc(o.promoCode) : ''}</td></tr>`).join('');
  // a test letter to OWNER_EMAIL: first from MAIL_FROM, and if that fails, from Resend's own test address
  let test = '';
  if (url.searchParams.get('gonder') === '1') {
    const send = async f => {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: f, to: [env.OWNER_EMAIL], subject: 'Masaliya \u00b7 \u0442\u0435\u0441\u0442\u043e\u0432\u043e\u0435 \u043f\u0438\u0441\u044c\u043c\u043e', html: '<p>\u042d\u0442\u043e \u0442\u0435\u0441\u0442\u043e\u0432\u043e\u0435 \u043f\u0438\u0441\u044c\u043c\u043e \u0438\u0437 \u0441\u043f\u0438\u0441\u043a\u0430 \u0437\u0430\u043a\u0430\u0437\u043e\u0432 Masaliya. \u0415\u0441\u043b\u0438 \u0432\u044b \u0435\u0433\u043e \u0432\u0438\u0434\u0438\u0442\u0435, \u043f\u0438\u0441\u044c\u043c\u0430 \u043e \u0437\u0430\u043a\u0430\u0437\u0430\u0445 \u0434\u043e\u0445\u043e\u0434\u044f\u0442.</p>' }) });
      const t = await r.text(); let m = ''; try { m = JSON.parse(t).message || ''; } catch (e) { m = t.slice(0, 200); }
      return { ok: r.ok, status: r.status, m };
    };
    if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) test = bad('\u041d\u0435 \u043c\u043e\u0433\u0443 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c: \u043d\u0435\u0442 \u043a\u043b\u044e\u0447\u0430 Resend \u0438\u043b\u0438 \u0430\u0434\u0440\u0435\u0441\u0430 OWNER_EMAIL.');
    else {
      const a = await send(from || 'Masaliya <onboarding@resend.dev>');
      test = a.ok ? ok(`\u041f\u0438\u0441\u044c\u043c\u043e \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e \u043e\u0442 \u00ab${esc(from || 'onboarding@resend.dev')}\u00bb \u043d\u0430 ${esc(mask(env.OWNER_EMAIL))}. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u0447\u0442\u0443 \u0438 \u043f\u0430\u043f\u043a\u0443 \u00ab\u0421\u043f\u0430\u043c\u00bb.`) : bad(`Resend \u043d\u0435 \u043f\u0440\u0438\u043d\u044f\u043b \u043f\u0438\u0441\u044c\u043c\u043e \u043e\u0442 \u00ab${esc(from || 'onboarding@resend.dev')}\u00bb (\u043a\u043e\u0434 ${a.status}): ${esc(a.m)}`);
      if (!a.ok && from) {
        const b = await send('Masaliya <onboarding@resend.dev>');
        test += '<br>' + (b.ok ? ok('\u0410 \u043e\u0442 \u0442\u0435\u0441\u0442\u043e\u0432\u043e\u0433\u043e \u0430\u0434\u0440\u0435\u0441\u0430 Resend (onboarding@resend.dev) \u043f\u0438\u0441\u044c\u043c\u043e \u0443\u0448\u043b\u043e \u2014 \u0437\u043d\u0430\u0447\u0438\u0442, \u043a\u043b\u044e\u0447 \u0440\u0430\u0431\u043e\u0447\u0438\u0439, \u0430 \u043d\u0435\u0432\u0435\u0440\u0435\u043d \u0430\u0434\u0440\u0435\u0441 MAIL_FROM \u0438\u043b\u0438 \u0434\u043e\u043c\u0435\u043d.') : bad(`\u0418 \u043e\u0442 \u0442\u0435\u0441\u0442\u043e\u0432\u043e\u0433\u043e \u0430\u0434\u0440\u0435\u0441\u0430 Resend \u043d\u0435 \u0443\u0448\u043b\u043e (\u043a\u043e\u0434 ${b.status}): ${esc(b.m)} \u2014 \u0437\u043d\u0430\u0447\u0438\u0442, \u0434\u0435\u043b\u043e \u0432 \u043a\u043b\u044e\u0447\u0435 Resend \u0438\u043b\u0438 \u0432 \u0430\u0434\u0440\u0435\u0441\u0435 OWNER_EMAIL.`));
      }
    }
  }
  return page('\u041f\u043e\u0447\u0442\u0430', `<h1>\u041f\u043e\u0447\u0442\u0430 <small style="font-size:14px;font-weight:400"><a href="/admin">\u2190 \u0417\u0430\u043a\u0430\u0437\u044b</a></small></h1>
    <table>${rows.map(([k, v]) => `<tr><th style="text-align:left">${k}</th><td>${v}</td></tr>`).join('')}</table>
    <p><a class="next" href="/admin/eposta?gonder=1" style="display:inline-block;padding:10px 16px;background:#6b1d2a;color:#fff;border-radius:6px;text-decoration:none">\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0442\u0435\u0441\u0442\u043e\u0432\u043e\u0435 \u043f\u0438\u0441\u044c\u043c\u043e \u043d\u0430 OWNER_EMAIL</a></p>
    ${test ? `<p class="flash">${test}</p>` : ''}
    <h2>\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u044b</h2><table><tr><th>\u041d\u043e\u043c\u0435\u0440</th><th>\u0421\u043e\u0437\u0434\u0430\u043d</th><th>\u0421\u0442\u0430\u0442\u0443\u0441</th><th>\u0421\u0443\u043c\u043c\u0430</th></tr>${list || '<tr><td colspan="4">\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043d\u0435\u0442</td></tr>'}</table>
    <p style="color:#777">\u0415\u0441\u043b\u0438 \u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u043b\u0430\u0442\u044b \u0437\u0430\u043a\u0430\u0437 \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f \u00ab\u0436\u0434\u0451\u0442 \u043e\u043f\u043b\u0430\u0442\u044b\u00bb, Stripe \u043d\u0435 \u0434\u043e\u0441\u0442\u0443\u0447\u0430\u043b\u0441\u044f \u0434\u043e \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u044b: Stripe \u2192 Developers \u2192 Webhooks \u2192 \u0432\u0430\u0448 \u0430\u0434\u0440\u0435\u0441 \u2192 \u0441\u043e\u0431\u044b\u0442\u0438\u044f.</p>`);
}

async function adminStats(url, env, req) {
  const cookie = ((req && req.headers.get('cookie')) || '').match(/(?:^|;\s*)mk=([0-9a-f]+)/);
  if (!env.ADMIN_KEY || !((url.searchParams.get('key') === env.ADMIN_KEY) || (cookie && cookie[1] === await ownerCookie(env)))) return new Response('Giri\u015f yetkisi yok. \u00d6nce sipari\u015f listesini ADMIN_KEY ile a\u00e7\u0131n.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  let resetNote = null; try { resetNote = await resetOnce(env); } catch (e) { console.log('reset failed', e); }   // one time only (17.11)
  const all = async prefix => { const out = []; let cursor; do { const pg = await env.PHOTOS.list({ prefix, cursor }); out.push(...pg.objects.map(o => o.key)); cursor = pg.truncated ? pg.cursor : null; } while (cursor); return out; };
  const items = (await Promise.all((await all('items/')).filter(k => k.endsWith('/kitap.json')).map(k => getJson(env, k)))).filter(Boolean);
  const orders = (await Promise.all((await all('orders/')).filter(k => k.endsWith('/siparis.json')).map(k => getJson(env, k)))).filter(o => o && o.items);
  const days = (await Promise.all((await all('istatistik/')).map(async k => [k.slice(11, 21), await getJson(env, k)]))).filter(([, d]) => d).sort((a, b) => b[0].localeCompare(a[0]));
  const inOrder = new Set(orders.flatMap(o => o.items.map(it => it.id)));
  const paid = orders.filter(o => o.status === 'odendi' && !o.cancelled), waiting = orders.filter(o => o.status !== 'odendi');
  const cartOnly = items.filter(it => it.status !== 'odendi' && !inOrder.has(it.id));
  const by = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const prodName = id => (CATALOG.books[id] ? (CATALOG.books[id].pre ? CATALOG.books[id].pre + ' ' : '') + CATALOG.books[id].hero + ' ' + CATALOG.books[id].title : id);
  const rows = (m, label = x => x) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(label(k))}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2">\u2014</td></tr>';
  const tot = days.reduce((t, [, d]) => ({ sepet: t.sepet + (d.sepet || 0), odemeye: t.odemeye + (d.odemeye || 0), odendi: t.odendi + (d.odendi || 0) }), { sepet: 0, odemeye: 0, odendi: 0 });
  const kit = days.reduce((m, [, d]) => { for (const [k, n] of Object.entries(d.kitaplar || {})) m[k] = (m[k] || 0) + n; return m; }, {});
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '\u2014';
  const opts = items.reduce((m, it) => { m[it.cover === 'digital' ? 'Dijital' : it.pdf ? 'Sert kapak + PDF' : 'Sert kapak'] = (m[it.cover === 'digital' ? 'Dijital' : it.pdf ? 'Sert kapak + PDF' : 'Sert kapak'] || 0) + 1; if (it.set && it.set !== 'tek') m[it.setName] = (m[it.setName] || 0) + 1; if (it.giftBox) m['Hediye kutusu'] = (m['Hediye kutusu'] || 0) + 1; if (it.about) m['\u201cKahraman hakk\u0131nda\u201d dolu'] = (m['\u201cKahraman hakk\u0131nda\u201d dolu'] || 0) + 1; if ((it.extras || []).length) m['2.\u20133. kahramanl\u0131'] = (m['2.\u20133. kahramanl\u0131'] || 0) + 1; return m; }, {});
  return page('\u0130statistik', `<p><a href="/admin">\u2190 Sipari\u015fler</a></p>${resetNote ? `<p class="flash">${esc(resetNote)}</p>` : ''}<h1>Sipari\u015f hunisi</h1>
    <h2>\u015eu an kay\u0131tl\u0131 olanlar (\u00f6denmeyenler ${UNPAID_DAYS} g\u00fcn tutulur)</h2>
    <table><tr><th>Sepete eklenen kitap</th><td>${items.length}</td></tr>
      <tr><th>Sepette kalan, \u00f6demeye ge\u00e7meyen</th><td>${cartOnly.length}</td></tr>
      <tr><th>\u00d6deme sayfas\u0131na giden sipari\u015f</th><td>${orders.length} (${orders.reduce((a, o) => a + o.items.length, 0)} kitap)</td></tr>
      <tr><th>\u00d6deme sayfas\u0131nda b\u0131rak\u0131lan</th><td>${waiting.length}</td></tr>
      <tr><th>\u00d6denen sipari\u015f</th><td>${paid.length} (${paid.reduce((a, o) => a + (o.amountPaid || 0), 0).toLocaleString('tr-TR')} TL)</td></tr>
      <tr><th>\u0130ptal edilen</th><td>${orders.filter(o => o.cancelled).length}</td></tr></table>
    <h2>Sepete en \u00e7ok eklenen kitaplar (\u015fu an kay\u0131tl\u0131)</h2><table>${rows(by(items, it => it.product), prodName)}</table>
    <h2>Se\u00e7enekler (\u015fu an kay\u0131tl\u0131)</h2><table>${rows(opts)}</table>
    <h2>G\u00fcnl\u00fck saya\u00e7 (bu s\u00fcr\u00fcmden itibaren, silinmez)</h2>
    <table><tr><th>Toplam</th><td>Sepete: ${tot.sepet} \u00b7 \u00d6demeye ge\u00e7en kitap: ${tot.odemeye} (${pct(tot.odemeye, tot.sepet)}) \u00b7 \u00d6denen kitap: ${tot.odendi} (${pct(tot.odendi, tot.sepet)})</td></tr>
    ${days.slice(0, 30).map(([d, x]) => `<tr><td>${d}</td><td>Sepete ${x.sepet || 0} \u00b7 \u00d6demeye ${x.odemeye || 0} \u00b7 \u00d6dendi ${x.odendi || 0}</td></tr>`).join('')}</table>
    <h2>Sepete eklenen kitaplar (g\u00fcnl\u00fck saya\u00e7tan)</h2><table>${rows(kit, prodName)}</table>`);
}
const ownerCookie = async env => (await hmac(env.ADMIN_KEY || 'masaliya', 'sahip')).slice(0, 32);
async function adminList(url, env, req) {
  const cookie = ((req && req.headers.get('cookie')) || '').match(/(?:^|;\s*)mk=([0-9a-f]+)/);
  const byKey = env.ADMIN_KEY && url.searchParams.get('key') === env.ADMIN_KEY, byCookie = env.ADMIN_KEY && cookie && cookie[1] === await ownerCookie(env);
  if (!byKey && !byCookie) return new Response('Giri\u015f yetkisi yok. Sipari\u015f listesini bir kez ADMIN_KEY ile a\u00e7\u0131n: /admin?key=\u2026', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  try { await removeUnpaid(env); } catch (e) { console.log('clean-up failed', e); }   // unpaid orders older than 3 days go even without the Cron trigger (17.11)
  try { const r = await resetOnce(env); if (r) url.searchParams.set('not', r); } catch (e) { console.log('reset failed', e); }   // one time only (17.11)
  const res = await adminListPage(url, env);
  const h = new Headers(res.headers);
  if (byKey) h.append('set-cookie', `mk=${await ownerCookie(env)}; Path=/admin; Max-Age=${60 * 60 * 24 * 60}; HttpOnly; Secure; SameSite=Lax`);
  return new Response(res.body, { status: res.status, headers: h });
}
async function adminListPage(url, env) {
  const orders = [];
  let cursor;
  do {
    const page = await env.PHOTOS.list({ prefix: 'orders/', cursor });
    for (const o of page.objects) if (o.key.endsWith('/siparis.json')) { const x = await getJson(env, o.key); if (x && x.items) orders.push(x); }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  orders.sort((a, b) => b.created.localeCompare(a.created));
  const rows = await Promise.all(orders.map(async o => `<tr class="${o.cancelled ? 'iptal' : o.status}"><td><a href="/admin/${o.id}?t=${await token(env, o.id)}">${o.id}</a></td><td>${date(o.created)}</td><td>${o.items.map(it => `${esc(it.title)}<br><small>${esc(it.setName)} \u00b7 ${esc(it.contents)}${it.giftBox ? ' \u00b7 hediye kutusu' : ''}</small>`).join('<br>')}</td><td>${paidSum(o).toLocaleString('tr-TR')} TL${o.promoCode ? '<br><small>kod ' + esc(o.promoCode) + '</small>' : ''}</td><td><b>${stageLabel(o)}</b> ${refundBadge(o)}${!o.cancelled && o.review && o.review.state === 'duzeltme' ? '<br><b style="color:#b0412e">D\u00fczeltme istendi</b>' : !o.cancelled && o.review && o.review.state === 'bekliyor' ? '<br><small>Onay bekleniyor</small>' : ''}</td><td>${esc(o.contact.name || '')}<br>${esc(o.contact.phone)}<br>${esc(o.contact.email)}</td><td>${await cancelButton(env, o, '/admin')}</td></tr>`));
  const note = url.searchParams.get('not');
  return page('Sipari\u015fler', `<h1>Sipari\u015fler <small style="font-size:14px;font-weight:400"><a href="/admin/istatistik">\u0130statistik \u2192</a> \u00b7 <a href="/admin/eposta">\u041f\u043e\u0447\u0442\u0430 \u2192</a></small></h1>${note ? `<p class="flash">${esc(note)}</p>` : ''}<p>${orders.filter(o => o.status === 'odendi').length} \u00f6denmi\u015f sipari\u015f. \u00d6denmeyenler ${UNPAID_DAYS} g\u00fcn sonra silinir.</p>
    <table><tr><th>No</th><th>Tarih</th><th>Kitaplar</th><th>Tutar</th><th>A\u015fama</th><th>M\u00fc\u015fteri</th><th></th></tr>${rows.join('')}</table>`);
}

async function adminOrder(id, itemId, photo, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giri\u015f yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items) return new Response('Sipari\u015f bulunamad\u0131', { status: 404 });
  if (photo) {
    if (!o.items.some(it => it.id === itemId)) return new Response('Foto\u011fraf bulunamad\u0131', { status: 404 });
    const obj = await env.PHOTOS.get(`items/${itemId}/${photo}.jpg`);
    if (!obj) return new Response('Foto\u011fraf bulunamad\u0131', { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${id}-${itemId}-${photo}.jpg"` } });
  }
  const note = url.searchParams.get('not'), sent = +url.searchParams.get('gonderildi') || 0;
  const modal = sent ? `<div class="modal" id="sent" role="dialog" aria-modal="true" aria-labelledby="sent-t"><div class="box">
      <div class="tick">\u2713</div><h2 id="sent-t">Ba\u015far\u0131yla g\u00f6nderildi</h2>
      <p>\u00d6nizleme (${sent} dosya) m\u00fc\u015fteriye g\u00f6nderildi. M\u00fc\u015fterinin yan\u0131t\u0131n\u0131 bu sayfada ve sipari\u015f listesinde g\u00f6receksiniz.</p>
      <div class="acts"><button type="button" onclick="document.getElementById('sent').remove(); history.replaceState(null, '', location.href.replace(/&gonderildi=\\d+/, ''))">Geri d\u00f6n</button><a href="/admin">Sipari\u015flere git</a></div>
    </div></div>` : '';
  if (o.cancelled) return page(o.id, cancelledPanel(o, t, note) + orderHtml(o, url.origin, t));
  return page(o.id, modal + `<div class="top"><a href="/admin">\u2190 Sipari\u015fler</a>${await cancelButton(env, o, `/admin/${o.id}?t=${t}`)}</div>` + await workflow(o, t, url.origin, env, url.searchParams.get('adim'), note) + orderHtml(o, url.origin, t));
}

// the owner's buttons that move a paid order to its next step
/* the owner's work on a paid order, one step at a time: a row of steps at the top, and under it
   only what belongs to the step being looked at (?adim=\u2026; by default the current step) */
const STEP_NAMES = { tasarim: 'Tasar\u0131m', onizleme: '\u00d6nizleme', baski: 'Bask\u0131', kargo: 'Kargo', teslim: 'Teslim' };
async function workflow(o, t, origin, env, view, note) {
  if (o.status !== 'odendi') return '';
  const steps = stagesFor(o), cur = o.stage || 'tasarim', h = o.history || {};
  if (!steps.includes(view)) view = cur;
  const ci = steps.indexOf(cur), href = k => `/admin/${o.id}?t=${t}&adim=${k}`;
  const bar = `<nav class="flow">${steps.map((k, i) => `<a href="${href(k)}" class="${i < ci ? 'done' : i === ci ? 'cur' : ''}${k === view ? ' view' : ''}"><span>${i < ci ? '\u2713' : i + 1}</span>${!o.ships && k === 'teslim' ? 'G\u00f6nderildi' : STEP_NAMES[k]}</a>`).join('')}</nav>`;
  const go = (k, label, extra = '') => `<form method="post" action="/admin/${o.id}/asama?t=${t}"${extra}><input type="hidden" name="asama" value="${k}"><button class="next">${label}</button></form>`;
  const r = o.review, c = o.cargo || {};
  let body = '';
  if (view === 'tasarim') {
    body = `<p class="lead">M\u00fc\u015fterinin g\u00f6nderdikleri a\u015fa\u011f\u0131da: kahraman\u0131n ad\u0131, \u201cKahraman hakk\u0131nda\u201d notu, foto\u011fraflar ve varsa 2. ve 3. kahraman. Resimleri haz\u0131rlad\u0131\u011f\u0131n\u0131zda \u00f6nizlemeye ge\u00e7in.</p>
      <a class="next" href="${href('onizleme')}">\u00d6nizlemeyi haz\u0131rla \u2192</a>`;
  } else if (view === 'onizleme') {
    const link = `${env.SITE_URL || 'https://masaliya.com'}/siparis.html?siparis=${o.id}&k=${await ctoken(env, o.id)}`;
    const state = !r ? '<span class="pill">Hen\u00fcz g\u00f6nderilmedi</span>'
      : r.state === 'bekliyor' ? `<span class="pill wait">M\u00fc\u015fterinin yan\u0131t\u0131 bekleniyor</span> <small>${r.round}. \u00f6nizleme \u00b7 ${date(r.date)}</small>`
      : r.state === 'onay' ? `<span class="pill ok">M\u00fc\u015fteri onaylad\u0131 \u2713</span> <small>${date(r.date)}</small>`
      : `<span class="pill no">M\u00fc\u015fteri d\u00fczeltme istedi</span> <small>${date(r.date)}</small>`;
    const revs = (o.revisions || []).slice().reverse().map(v => `<li><small>${date(v.date)} \u00b7 ${v.round}. \u00f6nizleme i\u00e7in</small><br>${esc(v.text).replace(/\n/g, '<br>')}</li>`).join('');
    const books = o.items.map(it => `<div class="pv-book"><b>${esc(it.title)}</b> <small>${esc(it.setName)}</small>${partsOf(it).map(part => {
      const files = partFiles(o, it, part);
      return `<div class="pv-part"><i>${PART_LABELS[part]}</i>
        ${files.length ? `<div class="pv-files">${files.map(f => { const src = `${origin}/api/onizleme/${o.id}/${f.file}?t=${t}`; return f.type === 'pdf' ? `<a class="pdf" href="${src}" target="_blank">PDF \u00b7 ${esc(f.name)}</a>` : `<a href="${src}" target="_blank"><img src="${src}" alt="${esc(f.name)}" loading="lazy"></a>`; }).join('')}</div>` : ''}
        <label>${files.length ? 'Yeni s\u00fcr\u00fcm\u00fc se\u00e7in (eskisinin yerine ge\u00e7er)' : 'Sayfalar\u0131 se\u00e7in'} \u00b7 JPG, PNG ya da PDF, birden fazla dosya<input type="file" name="f-${it.id}-${part}" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></label></div>`;
    }).join('')}</div>`).join('');
    const approved = r && r.state === 'onay';
    body = `<div class="review"><p>M\u00fc\u015fterinin yan\u0131t\u0131: ${state}</p>${revs ? `<p class="sub">M\u00fc\u015fterinin d\u00fczeltme istekleri</p><ul class="revs">${revs}</ul>` : ''}</div>
      <form method="post" enctype="multipart/form-data" action="/admin/${o.id}/onizleme?t=${t}" class="pv-form">
        ${books}
        <button class="next">${r ? 'Yeni \u00f6nizlemeyi m\u00fc\u015fteriye g\u00f6nder' : '\u00d6nizlemeyi m\u00fc\u015fteriye g\u00f6nder'}</button>
        <small>G\u00f6nderince sipari\u015f \u201c\u00d6nizleme\u201d a\u015famas\u0131na ge\u00e7er, m\u00fc\u015fteri sayfalar\u0131n\u0131 g\u00f6r\u00fcr ve onaylar ya da d\u00fczeltme ister. Kitap, boyama kitab\u0131 ve yapboz ayr\u0131 ayr\u0131 y\u00fcklenebilir; dosyalar ad s\u0131ras\u0131yla g\u00f6sterilir (01-kapak.jpg, 02-sayfa.jpg \u2026).</small>
      </form>
      ${r ? `<label class="link">M\u00fc\u015fterinin \u00f6nizleme linki (WhatsApp\u2019tan da g\u00f6nderebilirsiniz)<input readonly value="${link}" onclick="this.select()"></label>` : ''}
      ${r ? (o.ships
        ? go('baski', 'Bask\u0131ya g\u00f6nder \u2192', approved ? '' : ` onsubmit="return confirm('M\u00fc\u015fteri \u00f6nizlemeyi hen\u00fcz onaylamad\u0131. Yine de bask\u0131ya g\u00f6nderilsin mi?')"`)
        : go('teslim', 'Dijital kitab\u0131 g\u00f6nderdim \u2192', approved ? '' : ` onsubmit="return confirm('M\u00fc\u015fteri \u00f6nizlemeyi hen\u00fcz onaylamad\u0131. Yine de g\u00f6nderildi olarak i\u015faretlensin mi?')"`)) : ''}`;
  } else if (view === 'baski') {
    body = cur === 'baski' || ci > steps.indexOf('baski')
      ? `<p class="lead">Bask\u0131da${h.baski ? ` \u00b7 ${date(h.baski)}` : ''}. Kitap matbaadan \u00e7\u0131k\u0131nca kargoya verin.</p><a class="next" href="${href('kargo')}">Kargoya ver \u2192</a>`
      : `<p class="lead">M\u00fc\u015fteri \u00f6nizlemeyi onaylay\u0131nca \u201c\u00d6nizleme\u201d ad\u0131m\u0131ndan bask\u0131ya g\u00f6nderin.</p>`;
  } else if (view === 'kargo') {
    body = `<form method="post" action="/admin/${o.id}/asama?t=${t}" class="cargo">
        <div class="two"><label>Kargo firmas\u0131<input name="firma" value="${esc(c.firm || 'Aras Kargo')}"></label><label>Takip numaras\u0131<input name="takip" value="${esc(c.no || '')}" required></label></div>
        <input type="hidden" name="asama" value="kargo"><button class="next">${cur === 'kargo' || ci > steps.indexOf('kargo') ? 'Takip bilgisini kaydet' : 'Kargoya verildi olarak kaydet \u2192'}</button>
        <small>M\u00fc\u015fteri takip numaras\u0131n\u0131 sipari\u015f takibi sayfas\u0131nda g\u00f6r\u00fcr.</small></form>
      ${cur === 'kargo' ? go('teslim', 'Teslim edildi \u2192') : ''}`;
  } else if (view === 'teslim') {
    body = cur === 'teslim'
      ? `<p class="lead">${o.ships ? 'Teslim edildi' : 'Dijital kitap g\u00f6nderildi'}${h.teslim ? ` \u00b7 ${date(h.teslim)}` : ''}. ${o.photosDeleted ? `Foto\u011fraflar ${date(o.photosDeleted)} tarihinde silindi.` : `Foto\u011fraflar ${PHOTO_DAYS} g\u00fcn sonra kendili\u011finden silinir.`}</p>`
      : `<p class="lead">${o.ships ? 'Kargo teslim edilince buradan i\u015faretleyin.' : 'M\u00fc\u015fteri onaylay\u0131nca \u201c\u00d6nizleme\u201d ad\u0131m\u0131ndan i\u015faretleyin.'}</p>${cur === 'kargo' ? go('teslim', 'Teslim edildi \u2192') : ''}`;
  }
  return `<section class="work">${bar}${note ? `<p class="note">${esc(note)}</p>` : ''}<div class="panel-in"><h2>${STEP_NAMES[view]}${view === cur ? ' <small>\u00b7 \u015fu anki a\u015fama</small>' : ''}</h2>${body}</div></section>`;
}

/* ---------- cancelling an order: the payment goes back to the card through Stripe ---------- */
// cancelling with a refund is possible only in the first 24 hours after payment (as in the contract)
const REFUND_HOURS = 24;
const refundOpen = o => o.status !== 'odendi' || Date.now() - Date.parse(o.paid) < REFUND_HOURS * 36e5;
async function cancelButton(env, o, back) {
  if (o.cancelled) return '';
  const paid = o.status === 'odendi';
  if (!refundOpen(o)) return `<span class="closed" title="\u0130ptal ve iade yaln\u0131zca \u00f6demeden sonraki ${REFUND_HOURS} saat i\u00e7inde yap\u0131labilir">\u0130ptal s\u00fcresi doldu</span>`;
  const left = paid ? Math.max(1, Math.ceil((REFUND_HOURS * 36e5 - (Date.now() - Date.parse(o.paid))) / 36e5)) : 0;
  const q = paid ? `${o.id} sipari\u015fini iptal etmek istedi\u011finizden emin misiniz?\n\n${paidSum(o).toLocaleString('tr-TR')} TL m\u00fc\u015fterinin kart\u0131na iade edilecek. Bu i\u015flem geri al\u0131namaz.` : `${o.id} sipari\u015fini iptal etmek istedi\u011finizden emin misiniz?`;
  return `<form method="post" action="/admin/${o.id}/iptal?t=${await token(env, o.id)}&geri=${encodeURIComponent(back)}" onsubmit="return confirm(${esc(JSON.stringify(q))})"><button class="cancel">${paid ? 'Sipari\u015fi iptal et ve iade et' : 'Sipari\u015fi iptal et'}</button>${paid ? `<small class="left">${left} saat kald\u0131</small>` : ''}</form>`;
}
function cancelledPanel(o, t, note) {
  const r = o.refund || {};
  return `<div class="stage cancelled"><p><b>Sipari\u015f iptal edildi</b> \u00b7 ${date(o.cancelled)} ${refundBadge(o)}${note ? ` <span class="note">${esc(note)}</span>` : ''}</p>
    ${r.state === 'gerekmiyor' ? '<p>\u00dccretsiz sipari\u015f (promosyon kodu); iade gerekmiyor.</p>' : r.state === 'yapildi' ? `<p>${(r.amount || o.amountPaid || 0).toLocaleString('tr-TR')} TL m\u00fc\u015fterinin kart\u0131na iade edildi${r.id ? ` (Stripe: ${esc(r.id)})` : ''}. Kartta g\u00f6r\u00fcnmesi bankaya g\u00f6re 5\u201310 i\u015f g\u00fcn\u00fc s\u00fcrebilir.</p>`
      : o.status === 'odendi' ? `<p>\u0130ade yap\u0131lamad\u0131${r.error ? `: ${esc(r.error)}` : ''}. Tekrar deneyin ya da iadeyi Stripe\u2019ta (Payments \u2192 bu \u00f6deme \u2192 Refund) yap\u0131p a\u015fa\u011f\u0131dan i\u015faretleyin.</p>
        <div class="steps"><form method="post" action="/admin/${o.id}/iptal?t=${t}"><button>\u0130adeyi tekrar dene</button></form>
        <form method="post" action="/admin/${o.id}/iade-yapildi?t=${t}" onsubmit="return confirm('\u0130adeyi Stripe\u2019ta kendiniz yapt\u0131n\u0131z m\u0131?')"><button>Stripe\u2019ta iade ettim</button></form></div>`
      : '<p>Bu sipari\u015f \u00f6denmemi\u015fti; iade gerekmiyor.</p>'}
  </div>`;
}
// marks the order cancelled and sends the payment back to the card; who: 'satici' or 'musteri'
async function cancelAndRefund(env, o, who) {
  const now = new Date().toISOString();
  if (!o.cancelled) { o.cancelled = now; o.cancelledBy = who; o.history = { ...(o.history || {}), iptal: now }; }
  if (o.status === 'odendi' && paidSum(o) === 0) o.refund = { state: 'gerekmiyor', date: now };   // a free order (promotion code): nothing to refund
  else if (o.status === 'odendi') {
    try {
      let pi = o.paymentIntent;
      if (!pi && o.stripeSession) pi = (await stripe(env, `checkout/sessions/${o.stripeSession}`)).payment_intent;
      if (!pi) throw new Error('\u00f6deme bulunamad\u0131');
      const r = await stripe(env, 'refunds', new URLSearchParams({ payment_intent: pi, 'metadata[siparis]': o.id }));
      o.refund = { state: r.status === 'failed' || r.status === 'canceled' ? 'yapilmadi' : 'yapildi', id: r.id, amount: r.amount / 100, date: now, stripeStatus: r.status };
    } catch (e) {
      o.refund = { state: 'yapilmadi', error: String(e.message || e).replace(/^Stripe: /, '').slice(0, 200), date: now };
    }
  }
  await saveOrder(env, o);
  if (o.status === 'odendi') await mailCustomer(env, o, 'iptal');
}

/* the customer cancels on the tracking page: only in the first 24 hours after payment and before the preview */
async function customerCancel(req, env) {
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: '\u0130stek okunamad\u0131.' }, 400); }
  const o = await loadOrder(env, String(b.siparis || '').toUpperCase());
  const who = String(b.iletisim || '').trim().toLowerCase(), key = String(b.k || '');
  const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
  if (!o || !o.items || !((key && key === await ctoken(env, o.id)) || (who && (who === o.contact.email.toLowerCase() || (digits(who).length === 10 && digits(who) === digits(o.contact.phone))))))
    return json({ error: 'Sipari\u015f bulunamad\u0131.' }, 404);
  if (o.cancelled) return json({ error: 'Bu sipari\u015f zaten iptal edildi.' }, 409);
  if (!customerCanCancel(o)) return json({ error: `\u0130ptal yaln\u0131zca \u00f6demeden sonraki ${REFUND_HOURS} saat i\u00e7inde, \u00f6nizleme g\u00f6nderilmeden \u00f6nce yap\u0131labilir.` }, 409);
  await cancelAndRefund(env, o, 'musteri');
  await mailOwnerNote(env, `${o.id} \u00b7 m\u00fc\u015fteri sipari\u015fi iptal etti`, `<p>M\u00fc\u015fteri sipari\u015fi ${REFUND_HOURS} saat i\u00e7inde iptal etti.</p><p>${o.refund && o.refund.state === 'yapildi' ? `${(o.refund.amount || o.amountPaid).toLocaleString('tr-TR')} TL kart\u0131na iade edildi.` : `\u0130ade yap\u0131lamad\u0131${o.refund && o.refund.error ? `: ${esc(o.refund.error)}` : ''}. L\u00fctfen Stripe\u2019ta iade edip y\u00f6netim sayfas\u0131nda i\u015faretleyin.`}</p>`);
  return json({ ok: true, refunded: !!(o.refund && o.refund.state === 'yapildi') });
}
const customerCanCancel = o => o.status === 'odendi' && !o.cancelled && (o.stage || 'tasarim') === 'tasarim' && refundOpen(o);

async function cancelOrder(id, action, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giri\u015f yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items) return new Response('Sipari\u015f bulunamad\u0131', { status: 404 });
  const geri = url.searchParams.get('geri');
  const back = note => Response.redirect(`${url.origin}${geri && /^\/admin/.test(geri) ? geri : `/admin/${id}?t=${t}`}${note ? (geri && geri.includes('?') || !geri ? '&' : '?') + 'not=' + encodeURIComponent(note) : ''}`, 303);
  const now = new Date().toISOString();
  if (action === 'iade-yapildi') {
    if (!o.cancelled) return back('');
    o.refund = { ...(o.refund || {}), state: 'yapildi', manual: true, date: now }; await saveOrder(env, o); return back('\u0130ade yap\u0131ld\u0131 olarak i\u015faretlendi.');
  }
  if (o.refund && o.refund.state === 'yapildi') return back('Bu sipari\u015fin iadesi zaten yap\u0131ld\u0131.');
  if (!o.cancelled && !refundOpen(o)) return back(`\u0130ptal ve iade yaln\u0131zca \u00f6demeden sonraki ${REFUND_HOURS} saat i\u00e7inde yap\u0131labilir.`);
  await cancelAndRefund(env, o, 'satici');
  return back(o.status !== 'odendi' ? 'Sipari\u015f iptal edildi.' : o.refund.state === 'yapildi' ? 'Sipari\u015f iptal edildi, \u00f6deme iade edildi.' : 'Sipari\u015f iptal edildi ama iade yap\u0131lamad\u0131.');
}

async function setStage(id, req, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giri\u015f yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items || o.status !== 'odendi' || o.cancelled) return new Response('Sipari\u015f bulunamad\u0131', { status: 404 });
  const f = await req.formData(), stage = String(f.get('asama') || '');
  const back = note => Response.redirect(`${url.origin}/admin/${id}?t=${t}${note ? '&not=' + encodeURIComponent(note) : ''}`, 303);
  if (o.ships && f.has('takip')) {
    const firm = String(f.get('firma') || '').trim().slice(0, 40), no = String(f.get('takip') || '').trim().slice(0, 40);
    o.cargo = firm || no ? { firm, no } : null;
  }
  if (!stagesFor(o).includes(stage)) { await saveOrder(env, o); return back('Kaydedildi.'); }
  if (stage === 'kargo' && !(o.cargo && o.cargo.no)) return back('\u00d6nce takip numaras\u0131n\u0131 yaz\u0131n.');
  // the customer can only answer a preview that has pages: upload them below, that moves the order on by itself
  if (stage === 'onizleme' && !Object.values(o.previews || {}).flat().length) return back('\u00d6nce \u00f6nizleme sayfalar\u0131n\u0131 y\u00fckleyip g\u00f6nderin.');
  if (stage === 'onizleme' && (!o.review || o.review.state !== 'bekliyor')) o.review = { state: 'bekliyor', date: new Date().toISOString(), round: o.previewRound || 1 };
  const changed = stage !== o.stage;
  o.stage = stage;
  if (changed) o.history = { ...(o.history || {}), [stage]: new Date().toISOString() };
  await saveOrder(env, o);
  if (changed) await mailCustomer(env, o, stage);
  return Response.redirect(`${url.origin}/admin/${id}?t=${t}&adim=${stage}${changed ? '' : '&not=' + encodeURIComponent('Kaydedildi.')}`, 303);
}

function orderHtml(o, origin, t) {
  const a = o.shipping;
  const items = o.items.map((it, k) => `
    <h2>${k + 1}. ${esc(it.title)}</h2>
    <table>
      <tr><th>Set</th><td>${esc(it.setName)} \u00b7 ${esc(it.contents)}</td></tr>
      ${it.about ? `<tr><th>Kahraman hakk\u0131nda</th><td>${esc(it.about)}</td></tr>` : ''}
      ${(it.extras || []).length ? `<tr><th>2. ve 3. kahraman</th><td>${it.extras.map((x, k) => `${k + 2}. <b>${esc(x.name)}</b>${x.relation ? ` \u00b7 ${esc(x.relation)}` : ''}`).join('<br>')}</td></tr>` : ''}
      <tr><th>Hediye kutusu</th><td>${it.giftBox ? 'Evet' + (it.giftNote ? ` \u00b7 not: \u201c${esc(it.giftNote)}\u201d` : '') : 'Hay\u0131r'}</td></tr>
      <tr><th>Tutar</th><td>${it.price.total.toLocaleString('tr-TR')} TL</td></tr>
    </table>
    ${(it.extras || []).length ? `<h3>1. kahraman: ${esc(it.hero)}</h3>` : ''}
    <div class="photos">${[1, 2, 3].map(n => { const src = `${origin}/admin/${o.id}/${it.id}/foto-${n}.jpg?t=${t}`; return `<a href="${src}"><img src="${src}" alt="${esc(it.hero)} \u00b7 foto\u011fraf ${n}"></a>`; }).join('')}</div>
    ${(it.extras || []).map((x, k) => `<h3>${k + 2}. kahraman: ${esc(x.name)}${x.relation ? ` \u00b7 ${esc(x.relation)}` : ''}</h3>
    <div class="photos">${[1, 2, 3].map(n => { const src = `${origin}/admin/${o.id}/${it.id}/ek${k + 1}-foto-${n}.jpg?t=${t}`; return `<a href="${src}"><img src="${src}" alt="${esc(x.name)} \u00b7 foto\u011fraf ${n}"></a>`; }).join('')}</div>`).join('')}`).join('');
  return `<h1>${o.id} \u00b7 ${stageLabel(o)} ${refundBadge(o)}</h1>
    <table>
      <tr><th>Tutar</th><td>${paidSum(o).toLocaleString('tr-TR')} TL${promoNote(o)} \u00b7 ${o.items.length} kitap${o.price.discount ? ` \u00b7 2 kitap indirimi \u2212${o.price.discount.toLocaleString('tr-TR')} TL` : ''}</td></tr>
      <tr><th>Tarih</th><td>${date(o.created)}${o.paid ? ` \u00b7 \u00f6dendi ${date(o.paid)}` : ''}</td></tr>
      <tr><th>\u0130leti\u015fim</th><td>${esc(o.contact.name || '')} ${esc(o.contact.phone)} \u00b7 ${esc(o.contact.email)}</td></tr>
      ${o.cargo && o.cargo.no ? `<tr><th>Kargo</th><td>${esc(o.cargo.firm)} \u00b7 ${esc(o.cargo.no)}</td></tr>` : ''}
      <tr><th>Adres</th><td>${a ? esc([a.name, a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`, a.state, a.country].filter(Boolean).join(', ')) : (o.ships ? '\u2014' : 'Dijital, kargo yok')}</td></tr>
    </table>${items}`;
}

async function mailOwner(env, o, origin) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;
  const t = await token(env, o.id);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
    <p>${paidSum(o) > 0 ? 'Yeni sipari\u015f \u00f6dendi.' : 'Yeni sipari\u015f: promosyon koduyla \u00fccretsiz.'}</p>${orderHtml(o, origin, t).replace(/<img /g, '<img style="height:200px;margin:4px" ')}
    <p><a href="${origin}/admin/${o.id}?t=${t}">Sipari\u015fi ve foto\u011fraflar\u0131 a\u00e7</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Masaliya <onboarding@resend.dev>', to: [env.OWNER_EMAIL], subject: `Yeni sipari\u015f ${o.id} \u00b7 ${o.items.length} kitap \u00b7 ${paidSum(o).toLocaleString('tr-TR')} TL${o.promoCode ? ' \u00b7 kod ' + o.promoCode : ''}`, html })
  });
  if (!res.ok) console.log('mail failed', res.status, await res.text());
}

// short notes to the owner (the customer approved the preview or asked for changes)
async function mailOwnerNote(env, subject, body) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Masaliya <onboarding@resend.dev>', to: [env.OWNER_EMAIL], subject, html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">${body}</div>` })
  });
  if (!res.ok) console.log('mail failed', res.status, await res.text());
}

/* ---------- e-mails to the customer: only once our own domain is verified in Resend and
   MAIL_FROM (e.g. "Masaliya <siparis@masaliya.com>") is set; until then nothing is sent ---------- */
async function mailCustomer(env, o, stage) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !o.contact.email) return;
  const site = env.SITE_URL || 'https://masaliya.com';
  const { subject, html } = await customerMail(env, o, stage, site);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [o.contact.email], reply_to: env.OWNER_EMAIL || undefined, subject, html })
  });
  if (!res.ok) console.log('customer mail failed', res.status, await res.text());
}
// the customer e-mail in the site's look (17.11): tables and inline styles only, as mail programs want them
async function customerMail(env, o, stage, site) {
  const link = `${site}/siparis.html?siparis=${o.id}&k=${await ctoken(env, o.id)}`, c = o.cargo || {}, paid = paidSum(o);
  const SERIF = "Georgia,'Times New Roman',serif", SANS = 'Arial,Helvetica,sans-serif';
  const P = t => `<p style="margin:0 0 14px;font:15px/1.65 ${SANS};color:#4a3a33">${t}</p>`;
  const books = o.items.map(it => `<tr>
      <td width="72" valign="top" style="padding:12px 14px 12px 0"><img src="${site}/img/t/${esc(it.product)}-temiz.jpg" width="64" alt="" style="display:block;width:64px;height:auto;border-radius:6px;border:1px solid #e6d3b3"></td>
      <td valign="middle" style="padding:12px 0;font:15px/1.4 ${SANS};color:#4a3a33"><div style="font:600 17px/1.3 ${SERIF};color:#6b1d2a">${esc(it.title)}</div><div style="margin-top:4px;font-size:13px;color:#8a7468">${esc(it.setName)} \u00b7 ${esc(it.contents)}${it.giftBox ? ' \u00b7 hediye kutusu' : ''}</div></td></tr>`).join('');
  const box = inner => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 18px;background:#fbf3e6;border:1px solid #ecdcc0;border-radius:10px"><tr><td style="padding:6px 18px">${inner}</td></tr></table>`;
  const order = box(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${books}</table>
      <div style="border-top:1px solid #ecdcc0;padding:12px 0 10px;font:15px/1.4 ${SANS};color:#4a3a33">Toplam <b style="float:right;font:600 18px/1.2 ${SERIF};color:#6b1d2a">${paid.toLocaleString('tr-TR')} TL</b></div>`);
  const address = o.shipping ? P(`<span style="color:#8a7468">Teslimat adresi:</span> ${esc([o.shipping.name, o.shipping.line1, o.shipping.city, o.shipping.state].filter(Boolean).join(', '))}`) : '';
  const fee = paid > 0 ? `<p style="margin:0 0 14px;font:12px/1.55 ${SANS};color:#9a8679">Bankan\u0131z ek i\u015flem komisyonu uygulad\u0131ysa kart\u0131n\u0131zdan biraz fazlas\u0131 g\u00f6r\u00fcnebilir. Bu bizim ald\u0131\u011f\u0131m\u0131z bir \u00fccret de\u011fildir \u2014 fark\u0131 ayn\u0131 g\u00fcn iade ediyoruz.</p>` : '';
  const refund = o.refund && o.refund.state === 'gerekmiyor' ? '' : o.refund && o.refund.state === 'yapildi' ? P(`${(o.refund.amount || o.amountPaid).toLocaleString('tr-TR')} TL kart\u0131n\u0131za iade edildi; bankan\u0131za g\u00f6re hesab\u0131n\u0131zda g\u00f6r\u00fcnmesi 5\u201310 i\u015f g\u00fcn\u00fc s\u00fcrebilir.`) : P('\u00d6demenizin iadesiyle ilgili size ayr\u0131ca bilgi verece\u011fiz.');
  const M = {
    tasarim: { s: 'Sipari\u015finiz al\u0131nd\u0131', t: 'Sipari\u015finiz al\u0131nd\u0131', pre: 'Te\u015fekk\u00fcr ederiz! Masal\u0131n\u0131z at\u00f6lyemizde haz\u0131rlanmaya ba\u015flad\u0131.',
      body: P('Te\u015fekk\u00fcr ederiz! Masal\u0131n\u0131z at\u00f6lyemizde haz\u0131rlanmaya ba\u015flad\u0131.') + order + address + P(`${paid > 0 ? '\u00d6demeden sonra 3' : '3'} i\u015f g\u00fcn\u00fc i\u00e7inde b\u00fct\u00fcn sayfalar\u0131n \u00f6nizlemesini size g\u00f6nderece\u011fiz.`) + fee, cta: 'Sipari\u015finizi takip edin' },
    onizleme: { s: '\u00d6nizlemeniz haz\u0131r', t: '\u00d6nizlemeniz haz\u0131r', pre: 'Kitab\u0131n\u0131z\u0131n b\u00fct\u00fcn sayfalar\u0131 sizi bekliyor.',
      body: P('Kitab\u0131n\u0131z\u0131n b\u00fct\u00fcn sayfalar\u0131 haz\u0131r. L\u00fctfen her sayfay\u0131 inceleyin: her \u015fey yolundaysa \u201cOnayl\u0131yorum\u201da, de\u011fi\u015ftirmek istedi\u011finiz bir \u015fey varsa \u201cD\u00fczeltme istiyorum\u201da bas\u0131n.'), cta: '\u00d6nizlemeyi a\u00e7\u0131n' },
    baski: { s: 'Kitab\u0131n\u0131z bask\u0131da', t: 'Kitab\u0131n\u0131z bask\u0131da', pre: 'Onay\u0131n\u0131z i\u00e7in te\u015fekk\u00fcrler, kitab\u0131n\u0131z bas\u0131l\u0131yor.',
      body: P('Onay\u0131n\u0131z i\u00e7in te\u015fekk\u00fcrler. Kitab\u0131n\u0131z bask\u0131da; 5 i\u015f g\u00fcn\u00fc i\u00e7inde kargoya verilecek.'), cta: 'Sipari\u015finizi takip edin' },
    kargo: { s: 'Kitab\u0131n\u0131z kargoda', t: 'Kitab\u0131n\u0131z yola \u00e7\u0131kt\u0131', pre: `${c.firm || 'Kargo'} \u00b7 takip numaras\u0131 ${c.no || ''}`,
      body: P('Masal\u0131n\u0131z kargoya verildi, yak\u0131nda kap\u0131n\u0131zda.') + box(`<div style="padding:12px 0;font:15px/1.5 ${SANS};color:#4a3a33">${esc(c.firm)}<br><span style="color:#8a7468">Takip numaras\u0131:</span> <b style="font:600 18px/1.3 ${SERIF};color:#6b1d2a;letter-spacing:.04em">${esc(c.no)}</b></div>`), cta: 'Sipari\u015finizi takip edin' },
    teslim: { s: 'Masal\u0131n\u0131z size ula\u015ft\u0131', t: 'Masal\u0131n\u0131z size ula\u015ft\u0131', pre: '\u0130yi okumalar!',
      body: P(o.ships ? 'Kitab\u0131n\u0131z teslim edildi. \u0130yi okumalar! Masal\u0131n\u0131z\u0131 okurken \u00e7ekti\u011finiz bir foto\u011fraf\u0131 bizimle payla\u015f\u0131rsan\u0131z \u00e7ok seviniriz.' : 'Dijital kitab\u0131n\u0131z e-postan\u0131za g\u00f6nderildi. \u0130yi okumalar!'), cta: 'Sipari\u015finizi g\u00f6r\u00fcn' },
    iptal: { s: 'Sipari\u015finiz iptal edildi', t: 'Sipari\u015finiz iptal edildi', pre: 'Sipari\u015finiz iptal edildi.',
      body: P('Sipari\u015finiz iptal edildi.') + refund, cta: 'Sipari\u015finizi g\u00f6r\u00fcn' }
  }[stage];
  // the steps of the order, the current one in gold
  const steps = stagesFor(o), cur = steps.indexOf(stage), NAMES = { tasarim: 'Tasar\u0131m', onizleme: '\u00d6nizleme', baski: 'Bask\u0131', kargo: 'Kargo', teslim: 'Teslim' };
  const track = cur < 0 ? '' : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 22px"><tr>${steps.map((k, i) => `<td align="center" valign="top" width="${Math.floor(100 / steps.length)}%" style="font:11px/1.3 ${SANS};color:${i <= cur ? '#6b1d2a' : '#b8a596'}"><div style="width:26px;height:26px;margin:0 auto 6px;border-radius:13px;background:${i < cur ? '#6b1d2a' : i === cur ? '#c99a52' : '#efe3d0'};color:${i <= cur ? '#fff8ec' : '#b8a596'};font:600 12px/26px ${SANS};text-align:center">${i < cur ? '\u2713' : i + 1}</div>${NAMES[k]}</td>`).join('')}</tr></table>`;
  const first = o.contact.name ? esc(o.contact.name.split(' ')[0]) : '';
  const button = `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:8px auto 20px"><tr><td style="border-radius:8px;background:#6b1d2a"><a href="${link}" style="display:inline-block;padding:14px 30px;font:600 15px/1 ${SANS};color:#f6e2b5;text-decoration:none;letter-spacing:.03em;border-radius:8px">${M.cta}</a></td></tr></table>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${M.s}</title></head>
<body style="margin:0;padding:0;background:#f3e9da">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3e9da">${esc(M.pre)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3e9da"><tr><td align="center" style="padding:24px 10px 30px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffaf2;border:1px solid #e6d3b3;border-radius:14px;overflow:hidden">
  <tr><td align="center" style="background:#6b1d2a;padding:14px 20px 10px"><a href="${site}"><img src="${site}/img/logo/masaliya-logo-koyu.png" width="176" alt="Masaliya" style="display:block;width:176px;height:auto;border:0"></a></td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:#c99a52;background-image:linear-gradient(90deg,#b98a3e,#f1d9a4,#b98a3e)">&nbsp;</td></tr>
  <tr><td style="padding:30px 30px 6px">
    <div style="margin:0 0 6px;text-align:center;font:12px/1 ${SANS};letter-spacing:.18em;text-transform:uppercase;color:#b98a3e">Sipari\u015f ${o.id}</div>
    <h1 style="margin:0 0 20px;text-align:center;font:600 26px/1.25 ${SERIF};color:#6b1d2a">${M.t}</h1>
    ${track}
    ${P(`Merhaba${first ? ' ' + first : ''},`)}
    ${M.body}
    ${button}
  </td></tr>
  <tr><td style="padding:18px 30px 24px;background:#fbf3e6;border-top:1px solid #ecdcc0;text-align:center;font:12px/1.6 ${SANS};color:#8a7468">
    Sorunuz olursa bu e-postay\u0131 yan\u0131tlaman\u0131z yeterli.<br>
    <a href="${site}" style="color:#6b1d2a;text-decoration:none;font:600 13px/1.6 ${SERIF};letter-spacing:.12em">MASAL\u0130YA</a> \u00b7 Foto\u011fraftan ki\u015fiye \u00f6zel masal kitaplar\u0131<br>
    <a href="${site}/mesafeli-satis.html" style="color:#8a7468">\u00d6n Bilgilendirme Formu ve Mesafeli Sat\u0131\u015f S\u00f6zle\u015fmesi</a>
  </td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `${M.s} \u00b7 ${o.id}`, html };
}

/* ---------- a one-time reset of the test data (17.11, her \u00abthese are all tests, reset it once\u00bb) ----------
   everything created before RESET_BEFORE goes: orders (with photos and previews), cart books, the daily counter up to that day;
   anything that came later stays. It runs once \u2014 the marker sistem/sifirlama-1711.json stops it for good. */
const RESET_BEFORE = '2026-11-17T19:20:00Z', RESET_MARK = 'sistem/sifirlama-1711.json';
async function resetOnce(env) {
  if (await env.PHOTOS.get(RESET_MARK)) return null;
  const cut = Date.parse(RESET_BEFORE), del = [], n = { siparis: 0, kitap: 0, gun: 0 };
  const all = async prefix => { const out = []; let cursor; do { const pg = await env.PHOTOS.list({ prefix, cursor }); out.push(...pg.objects.map(o => o.key)); cursor = pg.truncated ? pg.cursor : null; } while (cursor); return out; };
  for (const [prefix, file, what] of [['orders/', '/siparis.json', 'siparis'], ['items/', '/kitap.json', 'kitap']]) {
    const dirs = {};
    for (const k of await all(prefix)) (dirs[k.split('/')[1]] = dirs[k.split('/')[1]] || []).push(k);
    for (const ks of Object.values(dirs)) {
      const meta = ks.find(k => k.endsWith(file)), x = meta ? await getJson(env, meta) : null;
      if (!(x && Date.parse(x.created) >= cut)) { del.push(...ks); if (meta) n[what]++; }
    }
  }
  const day = RESET_BEFORE.slice(0, 10);
  for (const k of await all('istatistik/')) if (k.slice(11, 21) <= day) { del.push(k); n.gun++; }
  for (let i = 0; i < del.length; i += 1000) await env.PHOTOS.delete(del.slice(i, i + 1000));
  await putJson(env, RESET_MARK, { date: new Date().toISOString(), before: RESET_BEFORE, ...n });
  return `\u2713 \u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0443\u0434\u0430\u043b\u0435\u043d\u044b (\u043e\u0434\u0438\u043d \u0440\u0430\u0437): \u0437\u0430\u043a\u0430\u0437\u043e\u0432 ${n.siparis}, \u043a\u043d\u0438\u0433 \u0438\u0437 \u043a\u043e\u0440\u0437\u0438\u043d ${n.kitap}, \u0434\u043d\u0435\u0439 \u0441\u0447\u0451\u0442\u0447\u0438\u043a\u0430 ${n.gun}. \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u043d\u0430\u0447\u0438\u043d\u0430\u0435\u0442\u0441\u044f \u0441 \u043d\u0443\u043b\u044f.`;
}

/* ---------- clean-up (cron): unpaid orders and cart books older than 3 days ---------- */
async function removeUnpaid(env) {
  const limit = Date.now() - UNPAID_DAYS * 864e5;
  for (const [prefix, file] of [['orders/', '/siparis.json'], ['items/', '/kitap.json']]) {
    let cursor;
    do {
      const page = await env.PHOTOS.list({ prefix, cursor });
      for (const obj of page.objects) {
        if (!obj.key.endsWith(file)) continue;
        const x = await getJson(env, obj.key);
        if (!x) continue;
        const dir = obj.key.slice(0, -file.length), photos = itemPhotos;
        if (x.status !== 'odendi' && Date.parse(x.created) < limit) {
          await env.PHOTOS.delete(photos(dir).concat(obj.key));
        } else if (file === '/siparis.json' && x.items && !x.photosDeleted && x.history && (x.cancelled ? Date.parse(x.history.iptal) : x.stage === 'teslim' ? Date.parse(x.history.teslim) : Infinity) < Date.now() - PHOTO_DAYS * 864e5) {
          await env.PHOTOS.delete(x.items.flatMap(it => photos(`items/${it.id}`)).concat(Object.values(x.previews || {}).flat().map(f => `${dir}/onizleme/${f.file}`)));
          x.photosDeleted = new Date().toISOString();
          await putJson(env, obj.key, x);
        }
      }
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
  }
}

/* ---------- helpers ---------- */
async function stripe(env, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET', body: params || undefined,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }
  });
  const out = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${out.error && out.error.message}`);
  return out;
}

async function validSignature(body, header, secret) {
  if (!secret) return false;
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = header.split(',').filter(x => x.trim().startsWith('v1=')).map(x => x.trim().slice(3));
  if (!parts.t || !sigs.length || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const mac = await hmac(secret, `${parts.t}.${body}`);
  return sigs.some(s => s === mac);
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// a per-order key for the owner's links, so photos can't be opened by guessing the order number
const token = async (env, id) => (await hmac(env.ADMIN_KEY || env.STRIPE_WEBHOOK_SECRET || 'masaliya', 'order:' + id)).slice(0, 24);
// the customer's key for their own order page (preview and approval), sent in their links
const ctoken = async (env, id) => (await hmac(env.ADMIN_KEY || env.STRIPE_WEBHOOK_SECRET || 'masaliya', 'musteri:' + id)).slice(0, 20);

function newId(prefix, n) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(n));
  return prefix + [...r].map(b => abc[b % abc.length]).join('');
}
const putJson = (env, key, o) => env.PHOTOS.put(key, JSON.stringify(o, null, 1), { httpMetadata: { contentType: 'application/json' } });
async function getJson(env, key) { const obj = await env.PHOTOS.get(key); return obj ? JSON.parse(await obj.text()) : null; }
const saveOrder = (env, o) => putJson(env, `orders/${o.id}/siparis.json`, o);
const loadOrder = (env, id) => /^MSL-[A-Z0-9]{6}$/.test(id || '') ? getJson(env, `orders/${id}/siparis.json`) : null;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
function cors(env, res) {
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', env.SITE_URL || 'https://masaliya.com');
  h.set('access-control-allow-methods', 'POST, GET, OPTIONS');
  h.set('access-control-allow-headers', 'content-type');
  h.set('vary', 'origin');
  return new Response(res.body, { status: res.status, headers: h });
}
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const date = iso => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const page = (title, body) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} \u00b7 Masaliya</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#faf6f0;color:#2a1a16}h1{font-size:22px}h2{font-size:18px;margin:28px 0 8px;color:#7a2434}table{border-collapse:collapse;width:100%;max-width:1100px;background:#fff}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid #eadfd3}th{font-weight:600;color:#7a2434;width:130px}small{color:#7a6a60}tr.odeme-bekleniyor{opacity:.55}.photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.photos img{height:240px;border:1px solid #eadfd3}a{color:#7a2434}.stage{max-width:1100px;background:#fff;border:2px solid #7a2434;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:grid;gap:12px}.stage p{margin:0}.steps{display:flex;flex-wrap:wrap;gap:8px}.steps button{font:inherit;padding:10px 14px;border:1px solid #7a2434;background:#fff;color:#7a2434;border-radius:6px;cursor:pointer}.steps button.cur{background:#7a2434;color:#fff;cursor:default}.stage label{display:grid;gap:4px;font-size:13px;color:#7a6a60}.stage input{font:inherit;padding:8px 10px;border:1px solid #d9cbbd;border-radius:6px}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.note{color:#b0412e}.pv-book{display:grid;gap:8px;padding:10px 0;border-top:1px solid #eadfd3}.pv-part{display:grid;gap:6px;padding-left:12px;border-left:3px solid #eadfd3}.pv-part i{font-style:normal;font-weight:600;color:#7a2434}.pv-files{display:flex;flex-wrap:wrap;gap:8px}.pv-files img{height:120px;border:1px solid #eadfd3}.pv-files .pdf{padding:10px;border:1px solid #eadfd3;border-radius:6px}.upload{font:inherit;padding:12px 16px;background:#7a2434;color:#fff;border:0;border-radius:6px;cursor:pointer;justify-self:start}.revs{margin:0;padding-left:18px;display:grid;gap:8px}
.top{max-width:1100px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.top form{display:flex;align-items:center;gap:8px}.top small.left{margin:0}.work{max-width:1100px;margin-bottom:22px}.modal{position:fixed;inset:0;background:rgba(30,10,14,.55);display:grid;place-items:center;z-index:10;padding:16px}.modal .box{background:#fff;border-radius:12px;padding:26px 24px;max-width:420px;width:100%;text-align:center;display:grid;gap:12px;box-shadow:0 30px 60px rgba(0,0,0,.35)}.modal .tick{width:56px;height:56px;margin:0 auto;border-radius:50%;background:#e3f2e5;color:#2e7d32;display:grid;place-items:center;font-size:28px;font-weight:700}.modal h2{margin:0;color:#2e7d32}.modal p{margin:0;color:#5a4a42}.modal .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px}.modal .acts button,.modal .acts a{font:inherit;font-weight:600;padding:11px 16px;border-radius:6px;cursor:pointer;text-decoration:none}.modal .acts button{background:#fff;border:1px solid #7a2434;color:#7a2434}.modal .acts a{background:#7a2434;color:#fff;border:1px solid #7a2434}.flow{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.flow a{flex:1;min-width:110px;display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #d9cbbd;border-radius:8px;background:#fff;color:#7a6a60;text-decoration:none}.flow a span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid currentColor;font-size:12px}.flow a.done{color:#2e7d32;border-color:#b9dcbc}.flow a.cur{color:#fff;background:#7a2434;border-color:#7a2434}.flow a.view{box-shadow:0 0 0 3px #e2b56b}
.panel-in{background:#fff;border:2px solid #7a2434;border-radius:8px;padding:16px;display:grid;gap:14px}.panel-in h2{margin:0;color:#7a2434}.panel-in h2 small{font-weight:400;color:#9a8a80;font-size:14px}.lead{margin:0}
.next{justify-self:start;display:inline-block;font:inherit;font-weight:600;padding:11px 16px;background:#7a2434;color:#fff;border:0;border-radius:6px;cursor:pointer;text-decoration:none}
.pill{display:inline-block;padding:3px 10px;border-radius:20px;background:#eee;font-weight:600;font-size:13px}.pill.wait{background:#fff4dc;color:#8a5a00}.pill.ok{background:#e3f2e5;color:#2e7d32}.pill.no{background:#fbe6e3;color:#b0412e}
.review{background:#faf6f0;border-radius:6px;padding:10px 12px}.review p{margin:0}.review .sub{margin-top:8px;font-weight:600;color:#7a2434}.pv-form,.cargo{display:grid;gap:10px}.link{display:grid;gap:4px;font-size:13px;color:#7a6a60}.link input,.cargo input{font:inherit;padding:8px 10px;border:1px solid #d9cbbd;border-radius:6px}.cargo label{display:grid;gap:4px;font-size:13px;color:#7a6a60}button.cancel{font:inherit;font-size:13px;padding:7px 10px;border:1px solid #b0412e;background:#fff;color:#b0412e;border-radius:6px;cursor:pointer;white-space:nowrap}button.cancel:hover{background:#b0412e;color:#fff}.stage.cancelled{border-color:#b0412e}.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:20px;vertical-align:middle}.badge.ok{background:#e3f2e5;color:#2e7d32}.badge.no{background:#fbe6e3;color:#b0412e}tr.iptal{opacity:.7}.closed{font-size:12px;color:#9a8a80;white-space:nowrap}small.left{display:block;font-size:11px;color:#9a8a80;margin-top:3px}.flash{background:#fff;border-left:4px solid #7a2434;padding:10px 14px;max-width:1100px}</style></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
