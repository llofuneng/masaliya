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
const CATALOG = {"books":{"buz-satosunun-sirri":{"title":"ve Buz \u015eatosunun S\u0131rr\u0131","hero":"Asya"},"gokkusagi-unicornu":{"title":"ve G\u00f6kku\u015fa\u011f\u0131 Unicornu","hero":"Ada"},"sihirli-firca":{"title":"ve Sihirli F\u0131r\u00e7a","hero":"Duru"},"minik-pandalar":{"title":"ve Minik Pandalar","hero":"Ela"},"sihirli-kutuphane":{"title":"ve Sihirli K\u00fct\u00fcphane","hero":"Zeynep"},"deniz-kizi-kralligi":{"title":"ve Deniz K\u0131z\u0131 Krall\u0131\u011f\u0131","hero":"Elif"},"dinozorlarin-dogum-gunu":{"title":"ve Dinozorlar\u0131n Do\u011fum G\u00fcn\u00fc","hero":"Kerem"},"kayip-ay-isigi":{"title":"ve Kay\u0131p Ay I\u015f\u0131\u011f\u0131","hero":"Ege"},"buyuk-yaris":{"title":"ve B\u00fcy\u00fck Yar\u0131\u015f","hero":"Poyraz"},"denizi-kurtariyor":{"title":"Denizi Kurtar\u0131yor","hero":"Mert"},"kaybolan-minik-aslan":{"title":"ve Kaybolan Minik Aslan","hero":"Emir"}},"prices":{"kitap":{"hard":2900,"digital":900},"boyama":{"print":590,"digital":null},"yapboz":{"std":640}},"sets":[{"id":"tek","name":"Yaln\u0131zca kitap","items":[],"discount":0},{"id":"masal-seti","name":"Masal Seti","items":[["boyama","print"]],"discount":0},{"id":"yapboz-seti","name":"Puzzle Seti","items":[["yapboz","std"]],"discount":0},{"id":"super-set","name":"S\u00fcper Set","items":[["boyama","print"],["yapboz","std"]],"discount":0}],"giftBox":300,"pairDeal":{"off":900,"until":"2026-12-15T23:59:59+03:00"},"covers":{"hard":"Sert kapak","digital":"Dijital kitap (PDF)"}};
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
  ? '<span class="badge ok">\u0130ade yap\u0131ld\u0131</span>' : '<span class="badge no">\u0130ade yap\u0131lmad\u0131</span>';
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
      if (req.method === 'POST' && url.pathname === '/api/stripe') return await stripeEvent(req, env);
      if (req.method === 'GET' && url.pathname === '/api/status') return cors(env, await orderStatus(url, env));
      if (req.method === 'POST' && url.pathname === '/api/onay') return cors(env, await customerReview(req, url, env));
      if (req.method === 'POST' && url.pathname === '/api/iptal') return cors(env, await customerCancel(req, env));
      const pv = url.pathname.match(/^\/api\/onizleme\/(MSL-[A-Z0-9]{6})\/([A-Za-z0-9-]+\.(?:jpg|png|webp|pdf))$/);
      if (req.method === 'GET' && pv) return await previewFile(pv[1], pv[2], url, env);
      if (req.method === 'GET' && url.pathname === '/admin') return await adminList(url, env, req);
      if (req.method === 'GET' && url.pathname === '/admin/istatistik') return await adminStats(url, env, req);
      const m = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})(?:\/(KTP-[A-Z0-9]{8})\/foto-([123])\.jpg)?$/);
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
  async scheduled(event, env) { await removeUnpaid(env); }   // unpaid orders, and photos after delivery
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
  if (photos.some(f => !f || typeof f === 'string' || !/^image\//.test(f.type) || f.size > MAX_PHOTO || f.size < 1000)) return json({ error: '\u00dc\u00e7 foto\u011fraf\u0131n \u00fc\u00e7\u00fc de gerekli (en fazla 12 MB).' }, 400);

  // the price is worked out here, never taken from the browser
  const parts = set.items.map(([t, f]) => CATALOG.prices[t][f]);
  // the printed book can come with its PDF too (both chosen on the page)
  const pdf = o.pdf === true && o.cover === 'hard' && !!CATALOG.prices.kitap.digital;
  const setPrice = Math.round((coverPrice + parts.reduce((a, b) => a + b, 0)) * (1 - set.discount)) + (pdf ? CATALOG.prices.kitap.digital : 0);
  const ships = o.cover !== 'digital' || set.items.length > 0;
  const giftBox = !!o.giftBox && ships;
  const item = {
    id: newId('KTP-', 8), status: 'sepette', created: new Date().toISOString(),
    product: o.product, title: `${hero} ${book.title}`, hero, about, cover: o.cover, pdf, set: set.id, setName: set.name,
    contents: [CATALOG.covers[o.cover], ...(pdf ? [CATALOG.covers.digital] : []), ...set.items.map(([t]) => PART_NAMES[t])].join(' + '),
    giftBox, giftNote: giftBox ? String(o.giftNote || '').slice(0, 240) : '', ships,
    price: { set: setPrice, giftBox: giftBox ? CATALOG.giftBox : 0, total: setPrice + (giftBox ? CATALOG.giftBox : 0) }
  };
  await Promise.all(photos.map((f, i) => env.PHOTOS.put(`items/${item.id}/foto-${i + 1}.jpg`, f.stream(), { httpMetadata: { contentType: f.type } })));
  await putJson(env, `items/${item.id}/kitap.json`, item);
  await countDay(env, 'sepet', item.product);
  return json(publicItem(item));
}
const publicItem = it => ({ id: it.id, product: it.product, title: it.title, contents: it.contents, setName: it.setName, cover: it.cover, giftBox: it.giftBox, giftNote: it.giftNote, price: it.price });

/* ---------- the cart to the payment page ---------- */
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
    if (s.payment_status !== 'paid') return new Response('ok');
    const order = await loadOrder(env, s.client_reference_id);
    if (!order || order.status === 'odendi') return new Response('ok');
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
    const cust = s.customer_details || {};
    order.status = 'odendi';
    order.paid = new Date().toISOString();
    order.amountPaid = s.amount_total / 100;
    order.paymentIntent = s.payment_intent || null;
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
async function adminStats(url, env, req) {
  const cookie = ((req && req.headers.get('cookie')) || '').match(/(?:^|;\s*)mk=([0-9a-f]+)/);
  if (!env.ADMIN_KEY || !((url.searchParams.get('key') === env.ADMIN_KEY) || (cookie && cookie[1] === await ownerCookie(env)))) return new Response('Giri\u015f yetkisi yok. \u00d6nce sipari\u015f listesini ADMIN_KEY ile a\u00e7\u0131n.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const all = async prefix => { const out = []; let cursor; do { const pg = await env.PHOTOS.list({ prefix, cursor }); out.push(...pg.objects.map(o => o.key)); cursor = pg.truncated ? pg.cursor : null; } while (cursor); return out; };
  const items = (await Promise.all((await all('items/')).filter(k => k.endsWith('/kitap.json')).map(k => getJson(env, k)))).filter(Boolean);
  const orders = (await Promise.all((await all('orders/')).filter(k => k.endsWith('/siparis.json')).map(k => getJson(env, k)))).filter(o => o && o.items);
  const days = (await Promise.all((await all('istatistik/')).map(async k => [k.slice(11, 21), await getJson(env, k)]))).filter(([, d]) => d).sort((a, b) => b[0].localeCompare(a[0]));
  const inOrder = new Set(orders.flatMap(o => o.items.map(it => it.id)));
  const paid = orders.filter(o => o.status === 'odendi' && !o.cancelled), waiting = orders.filter(o => o.status !== 'odendi');
  const cartOnly = items.filter(it => it.status !== 'odendi' && !inOrder.has(it.id));
  const by = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const prodName = id => (CATALOG.books[id] ? CATALOG.books[id].hero + ' ' + CATALOG.books[id].title : id);
  const rows = (m, label = x => x) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(label(k))}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2">\u2014</td></tr>';
  const tot = days.reduce((t, [, d]) => ({ sepet: t.sepet + (d.sepet || 0), odemeye: t.odemeye + (d.odemeye || 0), odendi: t.odendi + (d.odendi || 0) }), { sepet: 0, odemeye: 0, odendi: 0 });
  const kit = days.reduce((m, [, d]) => { for (const [k, n] of Object.entries(d.kitaplar || {})) m[k] = (m[k] || 0) + n; return m; }, {});
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '\u2014';
  const opts = items.reduce((m, it) => { m[it.cover === 'digital' ? 'Dijital' : it.pdf ? 'Sert kapak + PDF' : 'Sert kapak'] = (m[it.cover === 'digital' ? 'Dijital' : it.pdf ? 'Sert kapak + PDF' : 'Sert kapak'] || 0) + 1; if (it.set && it.set !== 'tek') m[it.setName] = (m[it.setName] || 0) + 1; if (it.giftBox) m['Hediye kutusu'] = (m['Hediye kutusu'] || 0) + 1; if (it.about) m['\u201cKahraman hakk\u0131nda\u201d dolu'] = (m['\u201cKahraman hakk\u0131nda\u201d dolu'] || 0) + 1; return m; }, {});
  return page('\u0130statistik', `<p><a href="/admin">\u2190 Sipari\u015fler</a></p><h1>Sipari\u015f hunisi</h1>
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
  const rows = await Promise.all(orders.map(async o => `<tr class="${o.cancelled ? 'iptal' : o.status}"><td><a href="/admin/${o.id}?t=${await token(env, o.id)}">${o.id}</a></td><td>${date(o.created)}</td><td>${o.items.map(it => `${esc(it.title)}<br><small>${esc(it.setName)} \u00b7 ${esc(it.contents)}${it.giftBox ? ' \u00b7 hediye kutusu' : ''}</small>`).join('<br>')}</td><td>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL</td><td><b>${stageLabel(o)}</b> ${refundBadge(o)}${!o.cancelled && o.review && o.review.state === 'duzeltme' ? '<br><b style="color:#b0412e">D\u00fczeltme istendi</b>' : !o.cancelled && o.review && o.review.state === 'bekliyor' ? '<br><small>Onay bekleniyor</small>' : ''}</td><td>${esc(o.contact.name || '')}<br>${esc(o.contact.phone)}<br>${esc(o.contact.email)}</td><td>${await cancelButton(env, o, '/admin')}</td></tr>`));
  const note = url.searchParams.get('not');
  return page('Sipari\u015fler', `<h1>Sipari\u015fler <small style="font-size:14px;font-weight:400"><a href="/admin/istatistik">\u0130statistik \u2192</a></small></h1>${note ? `<p class="flash">${esc(note)}</p>` : ''}<p>${orders.filter(o => o.status === 'odendi').length} \u00f6denmi\u015f sipari\u015f. \u00d6denmeyenler ${UNPAID_DAYS} g\u00fcn sonra silinir.</p>
    <table><tr><th>No</th><th>Tarih</th><th>Kitaplar</th><th>Tutar</th><th>A\u015fama</th><th>M\u00fc\u015fteri</th><th></th></tr>${rows.join('')}</table>`);
}

async function adminOrder(id, itemId, photo, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giri\u015f yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items) return new Response('Sipari\u015f bulunamad\u0131', { status: 404 });
  if (photo) {
    if (!o.items.some(it => it.id === itemId)) return new Response('Foto\u011fraf bulunamad\u0131', { status: 404 });
    const obj = await env.PHOTOS.get(`items/${itemId}/foto-${photo}.jpg`);
    if (!obj) return new Response('Foto\u011fraf bulunamad\u0131', { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${id}-${itemId}-foto-${photo}.jpg"` } });
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
    body = `<p class="lead">M\u00fc\u015fterinin g\u00f6nderdikleri a\u015fa\u011f\u0131da: kahraman\u0131n ad\u0131, \u201cKahraman hakk\u0131nda\u201d notu ve foto\u011fraflar. Resimleri haz\u0131rlad\u0131\u011f\u0131n\u0131zda \u00f6nizlemeye ge\u00e7in.</p>
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
  const q = paid ? `${o.id} sipari\u015fini iptal etmek istedi\u011finizden emin misiniz?\n\n${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL m\u00fc\u015fterinin kart\u0131na iade edilecek. Bu i\u015flem geri al\u0131namaz.` : `${o.id} sipari\u015fini iptal etmek istedi\u011finizden emin misiniz?`;
  return `<form method="post" action="/admin/${o.id}/iptal?t=${await token(env, o.id)}&geri=${encodeURIComponent(back)}" onsubmit="return confirm(${esc(JSON.stringify(q))})"><button class="cancel">${paid ? 'Sipari\u015fi iptal et ve iade et' : 'Sipari\u015fi iptal et'}</button>${paid ? `<small class="left">${left} saat kald\u0131</small>` : ''}</form>`;
}
function cancelledPanel(o, t, note) {
  const r = o.refund || {};
  return `<div class="stage cancelled"><p><b>Sipari\u015f iptal edildi</b> \u00b7 ${date(o.cancelled)} ${refundBadge(o)}${note ? ` <span class="note">${esc(note)}</span>` : ''}</p>
    ${r.state === 'yapildi' ? `<p>${(r.amount || o.amountPaid || 0).toLocaleString('tr-TR')} TL m\u00fc\u015fterinin kart\u0131na iade edildi${r.id ? ` (Stripe: ${esc(r.id)})` : ''}. Kartta g\u00f6r\u00fcnmesi bankaya g\u00f6re 5\u201310 i\u015f g\u00fcn\u00fc s\u00fcrebilir.</p>`
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
  if (o.status === 'odendi') {
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
      <tr><th>Hediye kutusu</th><td>${it.giftBox ? 'Evet' + (it.giftNote ? ` \u00b7 not: \u201c${esc(it.giftNote)}\u201d` : '') : 'Hay\u0131r'}</td></tr>
      <tr><th>Tutar</th><td>${it.price.total.toLocaleString('tr-TR')} TL</td></tr>
    </table>
    <div class="photos">${[1, 2, 3].map(n => { const src = `${origin}/admin/${o.id}/${it.id}/foto-${n}.jpg?t=${t}`; return `<a href="${src}"><img src="${src}" alt="${esc(it.hero)} \u00b7 foto\u011fraf ${n}"></a>`; }).join('')}</div>`).join('');
  return `<h1>${o.id} \u00b7 ${stageLabel(o)} ${refundBadge(o)}</h1>
    <table>
      <tr><th>Tutar</th><td>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL \u00b7 ${o.items.length} kitap${o.price.discount ? ` \u00b7 2 kitap indirimi \u2212${o.price.discount.toLocaleString('tr-TR')} TL` : ''}</td></tr>
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
    <p>Yeni sipari\u015f \u00f6dendi.</p>${orderHtml(o, origin, t).replace(/<img /g, '<img style="height:200px;margin:4px" ')}
    <p><a href="${origin}/admin/${o.id}?t=${t}">Sipari\u015fi ve foto\u011fraflar\u0131 a\u00e7</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Masaliya <onboarding@resend.dev>', to: [env.OWNER_EMAIL], subject: `Yeni sipari\u015f ${o.id} \u00b7 ${o.items.length} kitap \u00b7 ${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL`, html })
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
  const books = o.items.map(it => `<li>${esc(it.title)} <small>(${esc(it.setName)} \u00b7 ${esc(it.contents)}${it.giftBox ? ' \u00b7 hediye kutusu' : ''})</small></li>`).join('');
  const c = o.cargo || {}, link = `${site}/siparis.html?siparis=${o.id}&k=${await ctoken(env, o.id)}`;
  const lines = {
    tasarim: `<p>Sipari\u015finiz al\u0131nd\u0131, te\u015fekk\u00fcr ederiz. Masal\u0131n\u0131z at\u00f6lyemizde haz\u0131rlanmaya ba\u015flad\u0131.</p><ul>${books}</ul><p>Toplam: <b>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL</b></p>${o.shipping ? `<p>Teslimat adresi: ${esc([o.shipping.name, o.shipping.line1, o.shipping.city, o.shipping.state].filter(Boolean).join(', '))}</p>` : ''}<p>\u00d6demeden sonra 3 i\u015f g\u00fcn\u00fc i\u00e7inde b\u00fct\u00fcn sayfalar\u0131n \u00f6nizlemesini g\u00f6nderece\u011fiz.</p><p><a href="${site}/mesafeli-satis.html">\u00d6n Bilgilendirme Formu ve Mesafeli Sat\u0131\u015f S\u00f6zle\u015fmesi</a></p>`,
    onizleme: `<p>Kitab\u0131n\u0131z\u0131n \u00f6nizlemesi haz\u0131r.</p><p><a href="${link}">\u00d6nizlemeyi a\u00e7\u0131n</a></p><p>B\u00fct\u00fcn sayfalar\u0131 inceleyin; her \u015fey yolundaysa \u201cOnayl\u0131yorum\u201da, de\u011fi\u015ftirmek istedi\u011finiz bir \u015fey varsa \u201cD\u00fczeltme istiyorum\u201da bas\u0131n.</p>`,
    baski: `<p>Onay\u0131n\u0131z i\u00e7in te\u015fekk\u00fcrler. Kitab\u0131n\u0131z bask\u0131da; 5 i\u015f g\u00fcn\u00fc i\u00e7inde kargoya verilecek.</p>`,
    kargo: `<p>Kitab\u0131n\u0131z yola \u00e7\u0131kt\u0131.</p><p>${esc(c.firm)} \u00b7 takip numaras\u0131: <b>${esc(c.no)}</b></p>`,
    teslim: o.ships ? `<p>Kitab\u0131n\u0131z teslim edildi. \u0130yi okumalar!</p>` : `<p>Dijital kitab\u0131n\u0131z e-postan\u0131za g\u00f6nderildi. \u0130yi okumalar!</p>`,
    iptal: `<p>Sipari\u015finiz iptal edildi.</p>${o.refund && o.refund.state === 'yapildi' ? `<p>${(o.refund.amount || o.amountPaid).toLocaleString('tr-TR')} TL kart\u0131n\u0131za iade edildi; bankan\u0131za g\u00f6re hesab\u0131n\u0131zda g\u00f6r\u00fcnmesi 5\u201310 i\u015f g\u00fcn\u00fc s\u00fcrebilir.</p>` : '<p>\u00d6demenizin iadesiyle ilgili size ayr\u0131ca bilgi verece\u011fiz.</p>'}`
  };
  const subject = { tasarim: `Sipari\u015finiz al\u0131nd\u0131 \u00b7 ${o.id}`, onizleme: `\u00d6nizlemeniz haz\u0131r \u00b7 ${o.id}`, baski: `Kitab\u0131n\u0131z bask\u0131da \u00b7 ${o.id}`, kargo: `Kitab\u0131n\u0131z kargoda \u00b7 ${o.id}`, teslim: `Masal\u0131n\u0131z size ula\u015ft\u0131 \u00b7 ${o.id}`, iptal: `Sipari\u015finiz iptal edildi \u00b7 ${o.id}` }[stage];
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2a1a16;max-width:560px">
    <p>Merhaba${o.contact.name ? ' ' + esc(o.contact.name.split(' ')[0]) : ''},</p>${lines[stage]}
    <p><a href="${link}">Sipari\u015finizi takip edin</a> \u00b7 sipari\u015f numaran\u0131z ${o.id}</p><p>Masaliya</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [o.contact.email], reply_to: env.OWNER_EMAIL || undefined, subject, html })
  });
  if (!res.ok) console.log('customer mail failed', res.status, await res.text());
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
        const dir = obj.key.slice(0, -file.length), photos = d => [1, 2, 3].map(n => `${d}/foto-${n}.jpg`);
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
