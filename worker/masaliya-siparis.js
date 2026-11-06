/* Masaliya order server: a Cloudflare Worker.
   The site puts each book in the cart here (book, options and three photos, kept in a private R2
   bucket), then sends the whole cart with the contacts for payment. The price is worked out here,
   and the customer goes to a Stripe payment page. When Stripe reports the payment, the order is
   marked paid and the owner gets an e-mail with the order and links to the photos. Cart items and
   orders that are not paid within 3 days are deleted with their photos.

   Settings (Cloudflare → Worker → Settings → Variables and Secrets), see worker/KURULUM.md:
     STRIPE_SECRET_KEY      Stripe secret key (sk_live_… or sk_test_…)
     STRIPE_WEBHOOK_SECRET  signing secret of the Stripe webhook (whsec_…)
     RESEND_API_KEY         Resend key for the order e-mails (re_…)
     OWNER_EMAIL            where order e-mails go
     ADMIN_KEY              a long password for the order list page (/admin?key=…)
     SITE_URL               https://masaliya.com
   Binding: R2 bucket as PHOTOS. Cron trigger: once a day, for the clean-up.

   The catalogue below is written by tools/build-pages.js from site.js: don't edit it by hand. */

/* CATALOG:START */
const CATALOG = {"books":{"sihirli-kutuphane":{"title":"ve Sihirli Kütüphane","hero":"Dua"},"deniz-kizi-kralligi":{"title":"ve Deniz Kızı Krallığı","hero":"Lavin"},"buz-satosunun-sirri":{"title":"ve Buz Şatosunun Sırrı","hero":"Erva Ülkü"},"dinozorlarin-dogum-gunu":{"title":"ve Dinozorların Doğum Günü","hero":"Hızır Ali"}},"prices":{"kitap":{"hard":2900,"digital":900},"boyama":{"print":590,"digital":null},"yapboz":{"std":640}},"sets":[{"id":"tek","name":"Yalnızca kitap","items":[],"discount":0},{"id":"masal-seti","name":"Masal Seti","items":[["boyama","print"]],"discount":0},{"id":"yapboz-seti","name":"Yapboz Seti","items":[["yapboz","std"]],"discount":0},{"id":"super-set","name":"Süper Set","items":[["boyama","print"],["yapboz","std"]],"discount":0}],"giftBox":300,"covers":{"hard":"Sert kapak","digital":"Dijital kitap (PDF)"}};
/* CATALOG:END */

const PART_NAMES = { boyama: 'boyama kitabı', yapboz: 'ahşap yapboz' };
const UNPAID_DAYS = 3;
const MAX_PHOTO = 12 * 1024 * 1024;
const MAX_ITEMS = 10;
const PHOTO_DAYS = 30;   // photos are deleted this many days after the order is marked delivered

/* the steps of a paid order. Payment moves it to the first one by itself; the owner moves it on
   with the buttons on the order page (/admin/MSL-…). */
const STAGES = {
  tasarim:  { admin: 'Tasarımda', title: 'Tasarımda', text: 'Resimleriniz hazırlanıyor. Ödemeden sonra 5 iş günü içinde bütün sayfaların önizlemesini göndereceğiz.' },
  onizleme: { admin: 'Önizleme gönderildi', title: 'Önizleme onayınızı bekliyor', text: 'Bütün sayfaları size gönderdik. Değiştirmek istediğiniz bir şey varsa bize yazın; onayınızla devam ediyoruz.' },
  baski:    { admin: 'Baskıda', title: 'Baskıda', text: 'Onayınız için teşekkürler. Kitabınız 5 iş günü içinde basılıp kargoya verilir.' },
  kargo:    { admin: 'Kargoda', title: 'Kargoda', text: 'Kitabınız yola çıktı.' },
  teslim:   { admin: 'Teslim edildi', title: 'Teslim edildi', text: `İyi okumalar! Fotoğraflarınız ${PHOTO_DAYS} gün içinde sistemlerimizden silinir.` }
};
const stagesFor = o => o.ships ? ['tasarim', 'onizleme', 'baski', 'kargo', 'teslim'] : ['tasarim', 'onizleme', 'teslim'];
const MAX_PREVIEW = 25 * 1024 * 1024, PREVIEW_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// each part of a book's set gets its own preview: the book, the coloring book, the puzzle
const PART_LABELS = { kitap: 'Kitap', boyama: 'Boyama kitabı', yapboz: 'Ahşap yapboz' };
const partsOf = it => ['kitap', ...((CATALOG.sets.find(s => s.id === it.set) || { items: [] }).items.map(([p]) => p))];
const partFiles = (o, it, part) => ((o.previews || {})[it.id] || []).filter(f => (f.part || 'kitap') === part);
const stageTitle = (o, k) => !o.ships && k === 'teslim' ? 'E-postanıza gönderildi' : STAGES[k].title;

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
      const pv = url.pathname.match(/^\/api\/onizleme\/(MSL-[A-Z0-9]{6})\/([A-Za-z0-9-]+\.(?:jpg|png|webp|pdf))$/);
      if (req.method === 'GET' && pv) return await previewFile(pv[1], pv[2], url, env);
      if (req.method === 'GET' && url.pathname === '/admin') return await adminList(url, env);
      const m = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})(?:\/(KTP-[A-Z0-9]{8})\/foto-([123])\.jpg)?$/);
      if (req.method === 'GET' && m) return await adminOrder(m[1], m[2], m[3], url, env);
      const s = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})\/asama$/);
      if (req.method === 'POST' && s) return await setStage(s[1], req, url, env);
      const up = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})\/onizleme$/);
      if (req.method === 'POST' && up) return await uploadPreview(up[1], req, url, env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.log('error', err && err.stack || err);
      return cors(env, json({ error: 'Bir sorun oluştu, lütfen tekrar deneyin.' }, 500));
    }
  },
  async scheduled(event, env) { await removeUnpaid(env); }   // unpaid orders, and photos after delivery
};

/* ---------- one book into the cart: options and three photos ---------- */
async function addItem(req, env) {
  const form = await req.formData();
  let o;
  try { o = JSON.parse(form.get('item') || '{}'); } catch (e) { return json({ error: 'Kitap bilgileri okunamadı.' }, 400); }
  const book = CATALOG.books[o.product];
  const set = CATALOG.sets.find(s => s.id === o.set);
  const coverPrice = CATALOG.prices.kitap[o.cover];
  const hero = String(o.hero || '').trim().slice(0, 32);
  if (!book || !set || !coverPrice) return json({ error: 'Seçtiğiniz kitap ya da seçenek bulunamadı.' }, 400);
  if (o.cover === 'digital' && set.items.length) return json({ error: 'Dijital kitap setle birlikte sipariş edilemez.' }, 400);
  if (!hero) return json({ error: 'Kahramanın adı eksik.' }, 400);
  if (o.consentKvkk !== true) return json({ error: 'Fotoğraflar için açık rıza gerekiyor.' }, 400);
  const photos = [1, 2, 3].map(n => form.get('photo' + n));
  if (photos.some(f => !f || typeof f === 'string' || !/^image\//.test(f.type) || f.size > MAX_PHOTO || f.size < 1000)) return json({ error: 'Üç fotoğrafın üçü de gerekli (en fazla 12 MB).' }, 400);

  // the price is worked out here, never taken from the browser
  const parts = set.items.map(([t, f]) => CATALOG.prices[t][f]);
  const setPrice = Math.round((coverPrice + parts.reduce((a, b) => a + b, 0)) * (1 - set.discount));
  const ships = o.cover !== 'digital' || set.items.length > 0;
  const giftBox = !!o.giftBox && ships;
  const item = {
    id: newId('KTP-', 8), status: 'sepette', created: new Date().toISOString(),
    product: o.product, title: `${hero} ${book.title}`, hero, cover: o.cover, set: set.id, setName: set.name,
    contents: [CATALOG.covers[o.cover], ...set.items.map(([t]) => PART_NAMES[t])].join(' + '),
    giftBox, giftNote: giftBox ? String(o.giftNote || '').slice(0, 240) : '', ships,
    price: { set: setPrice, giftBox: giftBox ? CATALOG.giftBox : 0, total: setPrice + (giftBox ? CATALOG.giftBox : 0) }
  };
  await Promise.all(photos.map((f, i) => env.PHOTOS.put(`items/${item.id}/foto-${i + 1}.jpg`, f.stream(), { httpMetadata: { contentType: f.type } })));
  await putJson(env, `items/${item.id}/kitap.json`, item);
  return json(publicItem(item));
}
const publicItem = it => ({ id: it.id, product: it.product, title: it.title, contents: it.contents, setName: it.setName, cover: it.cover, giftBox: it.giftBox, giftNote: it.giftNote, price: it.price });

/* ---------- the cart to the payment page ---------- */
async function createOrder(req, env) {
  let o;
  try { o = await req.json(); } catch (e) { return json({ error: 'Sipariş bilgileri okunamadı.' }, 400); }
  const ids = [...new Set(Array.isArray(o.items) ? o.items : [])].slice(0, MAX_ITEMS + 1);
  const phone = String(o.phone || '').trim(), email = String(o.email || '').trim();
  if (!ids.length) return json({ error: 'Sepetiniz boş.' }, 400);
  if (ids.length > MAX_ITEMS) return json({ error: `Bir siparişte en fazla ${MAX_ITEMS} kitap olabilir.` }, 400);
  if (!/^[\d\s()+-]{10,20}$/.test(phone)) return json({ error: 'Telefon numarası geçersiz.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-posta adresi geçersiz.' }, 400);
  if (o.consentTerms !== true) return json({ error: 'Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayı eksik.' }, 400);
  const name = String(o.name || '').trim().slice(0, 80);
  if (name.length < 3) return json({ error: 'Ad soyad eksik.' }, 400);
  const items = await Promise.all(ids.map(id => /^KTP-[A-Z0-9]{8}$/.test(id) ? getJson(env, `items/${id}/kitap.json`) : null));
  const missing = ids.filter((id, i) => !items[i] || items[i].status === 'odendi');
  if (missing.length) return json({ error: 'Sepetinizdeki bazı kitapların süresi dolmuş. Lütfen onları yeniden ekleyin.', missing }, 409);

  const ships = items.some(it => it.ships);
  let shipping = null;
  if (ships) {
    // the delivery address is written on our site; the payment page only asks for the card
    const a = o.address || {}, f = k => String(a[k] || '').trim();
    shipping = { name, line1: f('adres').slice(0, 300), city: f('ilce').slice(0, 40), state: f('il').slice(0, 40), postal_code: f('posta').slice(0, 5), country: 'TR' };
    if (shipping.line1.length < 10 || shipping.city.length < 2 || shipping.state.length < 3) return json({ error: 'Teslimat adresi eksik: il, ilçe ve açık adres gerekli.' }, 400);
    if (shipping.postal_code && !/^\d{5}$/.test(shipping.postal_code)) return json({ error: 'Posta kodu 5 rakamdan oluşur.' }, 400);
  }
  const total = items.reduce((a, it) => a + it.price.total, 0);
  const boxes = items.filter(it => it.giftBox).length;
  const order = {
    id: newId('MSL-', 6), status: 'odeme-bekleniyor', created: new Date().toISOString(),
    items, ships, shipping, price: { total }, contact: { name, phone, email }
  };
  await saveOrder(env, order);

  const site = env.SITE_URL || 'https://masaliya.com';
  const summary = items.map(it => `${it.title} (${it.setName})`).join('; ');
  const p = new URLSearchParams({
    mode: 'payment', locale: 'tr', client_reference_id: order.id, customer_email: email,
    success_url: `${site}/tesekkurler.html?siparis=${order.id}`,
    cancel_url: `${site}/sepet.html?odeme=iptal`,
    'metadata[siparis]': order.id, 'metadata[kitaplar]': summary.slice(0, 480), 'metadata[telefon]': phone,
    'payment_intent_data[description]': `${order.id} · ${items.length} kitap · ${summary}`.slice(0, 990),
    'payment_intent_data[metadata][siparis]': order.id
  });
  let n = 0;
  for (const it of items) {
    p.set(`line_items[${n}][quantity]`, '1');
    p.set(`line_items[${n}][price_data][currency]`, 'try');
    p.set(`line_items[${n}][price_data][unit_amount]`, String(it.price.set * 100));
    p.set(`line_items[${n}][price_data][product_data][name]`, `${it.title} · ${it.setName}`);
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
    order.stage = 'tasarim';
    order.history = { tasarim: order.paid };
    order.contact = { ...order.contact, name: order.contact.name || cust.name || '', email: order.contact.email || cust.email || '' };
    if (!order.shipping && ship) order.shipping = { name: ship.name, ...ship.address };
    await saveOrder(env, order);
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
    return json({ error: 'Bu bilgilerle bir sipariş bulunamadı.' }, 404);
  const h = order.history || {}, k = await ctoken(env, order.id), api = new URL(url.origin);
  const previews = order.items.flatMap(it => { const parts = partsOf(it); return parts.map(part => ({ part, files: partFiles(order, it, part) })).filter(x => x.files.length).map(({ part, files }) => ({
    title: parts.length > 1 ? `${it.title} · ${PART_LABELS[part]}` : it.title,
    files: files.map(f => ({ name: f.name, pdf: f.type === 'pdf', url: `${api.origin}/api/onizleme/${order.id}/${f.file}?k=${k}` })) })); });
  return json({
    id: order.id, status: order.status, stage: order.stage || null, ships: !!order.ships,
    books: order.items.map(it => ({ title: it.title, contents: `${it.setName} · ${it.contents}` })),
    stages: order.status === 'odendi' ? stagesFor(order).map(k => ({ key: k, title: stageTitle(order, k), text: STAGES[k].text, date: h[k] || null })) : [],
    cargo: order.cargo || null, created: order.created, paid: order.paid || null,
    k, previews, review: order.review || null, revisions: order.revisions || []
  });
}

/* ---------- the customer looks at the preview and approves it or asks for changes ---------- */
async function customerReview(req, url, env) {
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: 'İstek okunamadı.' }, 400); }
  const o = await loadOrder(env, String(b.siparis || '').toUpperCase());
  if (!o || !o.items || b.k !== await ctoken(env, o.id)) return json({ error: 'Sipariş bulunamadı.' }, 404);
  if (o.stage !== 'onizleme' || !o.previews || !o.review || o.review.state !== 'bekliyor') return json({ error: 'Bu önizleme için yanıtınız zaten alındı.' }, 409);
  const now = new Date().toISOString();
  if (b.karar === 'onay') {
    o.review = { state: 'onay', date: now, round: o.previewRound };
    o.approved = now;
    if (o.ships) { o.stage = 'baski'; o.history = { ...(o.history || {}), baski: now }; }
  } else if (b.karar === 'duzeltme') {
    const text = String(b.not || '').trim().slice(0, 2000);
    if (text.length < 3) return json({ error: 'Lütfen neyi değiştirmemizi istediğinizi yazın.' }, 400);
    o.review = { state: 'duzeltme', date: now, round: o.previewRound };
    o.revisions = [...(o.revisions || []), { date: now, round: o.previewRound, text }];
  } else return json({ error: 'İstek okunamadı.' }, 400);
  await saveOrder(env, o);
  const t = await token(env, o.id);
  await mailOwnerNote(env, o.review.state === 'onay' ? `${o.id} · müşteri önizlemeyi onayladı` : `${o.id} · müşteri düzeltme istedi`,
    `<p>${o.review.state === 'onay' ? `Müşteri önizlemeyi onayladı.${o.ships ? ' Sipariş “Baskıda” aşamasına geçti.' : ' Dijital kitabı gönderip “Gönderildi”ye basın.'}` : `Müşterinin düzeltme isteği:</p><blockquote style="border-left:3px solid #7a2434;margin:0;padding:4px 12px">${esc(o.revisions.at(-1).text).replace(/\n/g, '<br>')}</blockquote><p>`}</p><p><a href="${url.origin}/admin/${o.id}?t=${t}">Siparişi aç</a></p>`);
  return json({ ok: true, review: o.review, stage: o.stage });
}

async function previewFile(id, file, url, env) {
  const o = await loadOrder(env, id);
  const k = url.searchParams.get('k'), t = url.searchParams.get('t');
  if (!o || !((k && k === await ctoken(env, id)) || (t && t === await token(env, id)))) return new Response('Bulunamadı', { status: 404 });
  const f = Object.values(o.previews || {}).flat().find(x => x.file === file);
  const obj = f && await env.PHOTOS.get(`orders/${id}/onizleme/${file}`);
  if (!obj) return new Response('Bulunamadı', { status: 404 });
  const type = Object.keys(PREVIEW_TYPES).find(m => PREVIEW_TYPES[m] === f.type);
  return new Response(obj.body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'content-disposition': `inline; filename="${id}-${file}"`, 'access-control-allow-origin': env.SITE_URL || 'https://masaliya.com' } });
}

/* the owner uploads the preview pages of each book: a new upload for a book replaces its earlier pages */
async function uploadPreview(id, req, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giriş yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items || o.status !== 'odendi') return new Response('Sipariş bulunamadı', { status: 404 });
  const back = note => Response.redirect(`${url.origin}/admin/${id}?t=${t}${note ? '&not=' + encodeURIComponent(note) : ''}`, 303);
  const form = await req.formData();
  const round = (o.previewRound || 0) + 1;
  const previews = { ...(o.previews || {}) };
  let added = 0;
  for (const it of o.items) for (const part of partsOf(it)) {
    const files = form.getAll(`f-${it.id}-${part}`).filter(f => f && typeof f !== 'string' && f.size > 0);
    if (!files.length) continue;
    if (files.some(f => !PREVIEW_TYPES[f.type] || f.size > MAX_PREVIEW)) return back('Yalnızca JPG, PNG, WEBP ya da PDF; her dosya en fazla 25 MB.');
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
  if (!added) return back('Dosya seçilmedi.');
  const now = new Date().toISOString();
  o.previews = previews; o.previewRound = round;
  o.review = { state: 'bekliyor', date: now, round };
  o.stage = 'onizleme'; o.history = { ...(o.history || {}), onizleme: now };
  await saveOrder(env, o);
  await mailCustomer(env, o, 'onizleme');
  return back(`Önizleme yüklendi (${added} dosya). Müşteri sayfasında görüyor.`);
}

/* ---------- owner pages: all orders, and one order with its photos ---------- */
async function adminList(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return new Response('Giriş yetkisi yok', { status: 401 });
  const orders = [];
  let cursor;
  do {
    const page = await env.PHOTOS.list({ prefix: 'orders/', cursor });
    for (const o of page.objects) if (o.key.endsWith('/siparis.json')) { const x = await getJson(env, o.key); if (x && x.items) orders.push(x); }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  orders.sort((a, b) => b.created.localeCompare(a.created));
  const rows = await Promise.all(orders.map(async o => `<tr class="${o.status}"><td><a href="/admin/${o.id}?t=${await token(env, o.id)}">${o.id}</a></td><td>${date(o.created)}</td><td>${o.items.map(it => `${esc(it.title)}<br><small>${esc(it.setName)} · ${esc(it.contents)}${it.giftBox ? ' · hediye kutusu' : ''}</small>`).join('<br>')}</td><td>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL</td><td>${o.status === 'odendi' ? `<b>${STAGES[o.stage || 'tasarim'].admin}</b>${o.review && o.review.state === 'duzeltme' ? '<br><b style="color:#b0412e">Düzeltme istendi</b>' : o.review && o.review.state === 'bekliyor' ? '<br><small>Onay bekleniyor</small>' : ''}` : 'Ödeme bekleniyor'}</td><td>${esc(o.contact.name || '')}<br>${esc(o.contact.phone)}<br>${esc(o.contact.email)}</td></tr>`));
  return page('Siparişler', `<h1>Siparişler</h1><p>${orders.filter(o => o.status === 'odendi').length} ödenmiş sipariş. Ödenmeyenler ${UNPAID_DAYS} gün sonra silinir.</p>
    <table><tr><th>No</th><th>Tarih</th><th>Kitaplar</th><th>Tutar</th><th>Aşama</th><th>Müşteri</th></tr>${rows.join('')}</table>`);
}

async function adminOrder(id, itemId, photo, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giriş yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items) return new Response('Sipariş bulunamadı', { status: 404 });
  if (photo) {
    if (!o.items.some(it => it.id === itemId)) return new Response('Fotoğraf bulunamadı', { status: 404 });
    const obj = await env.PHOTOS.get(`items/${itemId}/foto-${photo}.jpg`);
    if (!obj) return new Response('Fotoğraf bulunamadı', { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${id}-${itemId}-foto-${photo}.jpg"` } });
  }
  return page(o.id, stagePanel(o, t, url.searchParams.get('not')) + await previewPanel(o, t, url.origin, env) + orderHtml(o, url.origin, t));
}

// the owner's buttons that move a paid order to its next step
function stagePanel(o, t, note) {
  if (o.status !== 'odendi') return '';
  const cur = o.stage || 'tasarim', h = o.history || {}, c = o.cargo || {};
  return `<form class="stage" method="post" action="/admin/${o.id}/asama?t=${t}">
    <p>Şu anki aşama: <b>${STAGES[cur].admin}</b>${h[cur] ? ` · ${date(h[cur])}` : ''}${note ? ` <span class="note">${esc(note)}</span>` : ''}</p>
    <div class="steps">${stagesFor(o).map(k => `<button name="asama" value="${k}"${k === cur ? ' class="cur" disabled' : ''}>${!o.ships && k === 'teslim' ? 'Gönderildi' : STAGES[k].admin}${h[k] && k !== cur ? ' ✓' : ''}</button>`).join('')}</div>
    ${o.ships ? `<div class="two"><label>Kargo firması<input name="firma" value="${esc(c.firm || '')}" placeholder="Yurtiçi Kargo"></label><label>Takip numarası<input name="takip" value="${esc(c.no || '')}"></label></div>` : ''}
    <small>“Kargoda” için takip numarası gerekli. Yanlış bir düğmeye bastıysanız doğru aşamaya basmanız yeterli.${o.photosDeleted ? ` Fotoğraflar ${date(o.photosDeleted)} tarihinde silindi.` : (h.teslim ? ` Fotoğraflar teslimden ${PHOTO_DAYS} gün sonra kendiliğinden silinir.` : '')}</small>
  </form>`;
}

async function previewPanel(o, t, origin, env) {
  if (o.status !== 'odendi') return '';
  const r = o.review, link = `${env.SITE_URL || 'https://masaliya.com'}/siparis.html?siparis=${o.id}&k=${await ctoken(env, o.id)}`;
  const state = !r ? 'Henüz önizleme yüklenmedi.'
    : r.state === 'bekliyor' ? `<b>Müşterinin yanıtı bekleniyor</b> · ${r.round}. önizleme, ${date(r.date)}`
    : r.state === 'onay' ? `<b style="color:#2e7d32">Müşteri onayladı ✓</b> · ${date(r.date)}`
    : `<b style="color:#b0412e">Müşteri düzeltme istedi</b> · ${date(r.date)}`;
  const revs = (o.revisions || []).slice().reverse().map(v => `<li><small>${date(v.date)} · ${v.round}. önizleme için</small><br>${esc(v.text).replace(/\n/g, '<br>')}</li>`).join('');
  const books = o.items.map(it => `<div class="pv-book"><b>${esc(it.title)}</b> <small>${esc(it.setName)}</small>${partsOf(it).map(part => {
    const files = partFiles(o, it, part);
    return `<div class="pv-part"><i>${PART_LABELS[part]}</i>
      ${files.length ? `<div class="pv-files">${files.map(f => { const src = `${origin}/api/onizleme/${o.id}/${f.file}?t=${t}`; return f.type === 'pdf' ? `<a class="pdf" href="${src}" target="_blank">PDF · ${esc(f.name)}</a>` : `<a href="${src}" target="_blank"><img src="${src}" alt="${esc(f.name)}" loading="lazy"></a>`; }).join('')}</div>` : ''}
      <label>${files.length ? 'Yeni sürümü yükle (eskisinin yerine geçer)' : 'Dosyaları seçin'} · JPG, PNG ya da PDF, birden fazla dosya seçilebilir<input type="file" name="f-${it.id}-${part}" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></label></div>`;
  }).join('')}</div>`).join('');
  return `<form class="stage preview" method="post" enctype="multipart/form-data" action="/admin/${o.id}/onizleme?t=${t}">
    <p>Önizleme: ${state}</p>
    ${revs ? `<ul class="revs">${revs}</ul>` : ''}
    ${books}
    <button class="upload">Önizlemeyi yükle ve müşteriye göster</button>
    <label>Müşterinin önizleme linki (WhatsApp’tan gönderebilirsiniz)<input readonly value="${link}" onclick="this.select()"></label>
    <small>Kitap, boyama kitabı ve yapboz için ayrı ayrı yükleyebilirsiniz; yalnızca seçtiğiniz bölüm yenilenir. Dosyalar ad sırasına göre gösterilir (01-kapak.jpg, 02-sayfa.jpg …). Yükleyince sipariş “Önizleme gönderildi” aşamasına geçer; müşteri onaylayınca basılı siparişler kendiliğinden “Baskıda”ya geçer.</small>
  </form>`;
}

async function setStage(id, req, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giriş yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items || o.status !== 'odendi') return new Response('Sipariş bulunamadı', { status: 404 });
  const f = await req.formData(), stage = String(f.get('asama') || '');
  const back = note => Response.redirect(`${url.origin}/admin/${id}?t=${t}${note ? '&not=' + encodeURIComponent(note) : ''}`, 303);
  if (o.ships) {
    const firm = String(f.get('firma') || '').trim().slice(0, 40), no = String(f.get('takip') || '').trim().slice(0, 40);
    o.cargo = firm || no ? { firm, no } : null;
  }
  if (!stagesFor(o).includes(stage)) { await saveOrder(env, o); return back('Kaydedildi.'); }
  if (stage === 'kargo' && !(o.cargo && o.cargo.no)) return back('Önce takip numarasını yazın.');
  const changed = stage !== o.stage;
  o.stage = stage;
  o.history = { ...(o.history || {}), [stage]: new Date().toISOString() };
  await saveOrder(env, o);
  if (changed) await mailCustomer(env, o, stage);
  return back('');
}

function orderHtml(o, origin, t) {
  const a = o.shipping;
  const items = o.items.map((it, k) => `
    <h2>${k + 1}. ${esc(it.title)}</h2>
    <table>
      <tr><th>Set</th><td>${esc(it.setName)} · ${esc(it.contents)}</td></tr>
      <tr><th>Hediye kutusu</th><td>${it.giftBox ? 'Evet' + (it.giftNote ? ` · not: “${esc(it.giftNote)}”` : '') : 'Hayır'}</td></tr>
      <tr><th>Tutar</th><td>${it.price.total.toLocaleString('tr-TR')} TL</td></tr>
    </table>
    <div class="photos">${[1, 2, 3].map(n => { const src = `${origin}/admin/${o.id}/${it.id}/foto-${n}.jpg?t=${t}`; return `<a href="${src}"><img src="${src}" alt="${esc(it.hero)} · fotoğraf ${n}"></a>`; }).join('')}</div>`).join('');
  return `<h1>${o.id} · ${o.status === 'odendi' ? STAGES[o.stage || 'tasarim'].admin : 'Ödeme bekleniyor'}</h1>
    <table>
      <tr><th>Tutar</th><td>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL · ${o.items.length} kitap</td></tr>
      <tr><th>Tarih</th><td>${date(o.created)}${o.paid ? ` · ödendi ${date(o.paid)}` : ''}</td></tr>
      <tr><th>İletişim</th><td>${esc(o.contact.name || '')} ${esc(o.contact.phone)} · ${esc(o.contact.email)}</td></tr>
      ${o.cargo && o.cargo.no ? `<tr><th>Kargo</th><td>${esc(o.cargo.firm)} · ${esc(o.cargo.no)}</td></tr>` : ''}
      <tr><th>Adres</th><td>${a ? esc([a.name, a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`, a.state, a.country].filter(Boolean).join(', ')) : (o.ships ? '—' : 'Dijital, kargo yok')}</td></tr>
    </table>${items}`;
}

async function mailOwner(env, o, origin) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;
  const t = await token(env, o.id);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
    <p>Yeni sipariş ödendi.</p>${orderHtml(o, origin, t).replace(/<img /g, '<img style="height:200px;margin:4px" ')}
    <p><a href="${origin}/admin/${o.id}?t=${t}">Siparişi ve fotoğrafları aç</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Masaliya <onboarding@resend.dev>', to: [env.OWNER_EMAIL], subject: `Yeni sipariş ${o.id} · ${o.items.length} kitap · ${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL`, html })
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
  const books = o.items.map(it => `<li>${esc(it.title)} <small>(${esc(it.setName)} · ${esc(it.contents)}${it.giftBox ? ' · hediye kutusu' : ''})</small></li>`).join('');
  const c = o.cargo || {}, link = `${site}/siparis.html?siparis=${o.id}&k=${await ctoken(env, o.id)}`;
  const lines = {
    tasarim: `<p>Siparişiniz alındı, teşekkür ederiz. Masalınız atölyemizde hazırlanmaya başladı.</p><ul>${books}</ul><p>Toplam: <b>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL</b></p>${o.shipping ? `<p>Teslimat adresi: ${esc([o.shipping.name, o.shipping.line1, o.shipping.city, o.shipping.state].filter(Boolean).join(', '))}</p>` : ''}<p>Ödemeden sonra 5 iş günü içinde bütün sayfaların önizlemesini göndereceğiz.</p><p><a href="${site}/mesafeli-satis.html">Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi</a></p>`,
    onizleme: `<p>Kitabınızın önizlemesi hazır.</p><p><a href="${link}">Önizlemeyi açın</a></p><p>Bütün sayfaları inceleyin; her şey yolundaysa “Onaylıyorum”a, değiştirmek istediğiniz bir şey varsa “Düzeltme istiyorum”a basın.</p>`,
    baski: `<p>Onayınız için teşekkürler. Kitabınız baskıda; 5 iş günü içinde kargoya verilecek.</p>`,
    kargo: `<p>Kitabınız yola çıktı.</p><p>${esc(c.firm)} · takip numarası: <b>${esc(c.no)}</b></p>`,
    teslim: o.ships ? `<p>Kitabınız teslim edildi. İyi okumalar!</p>` : `<p>Dijital kitabınız e-postanıza gönderildi. İyi okumalar!</p>`
  };
  const subject = { tasarim: `Siparişiniz alındı · ${o.id}`, onizleme: `Önizlemeniz hazır · ${o.id}`, baski: `Kitabınız baskıda · ${o.id}`, kargo: `Kitabınız kargoda · ${o.id}`, teslim: `Masalınız size ulaştı · ${o.id}` }[stage];
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2a1a16;max-width:560px">
    <p>Merhaba${o.contact.name ? ' ' + esc(o.contact.name.split(' ')[0]) : ''},</p>${lines[stage]}
    <p><a href="${link}">Siparişinizi takip edin</a> · sipariş numaranız ${o.id}</p><p>Masaliya</p></div>`;
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
        } else if (file === '/siparis.json' && x.items && x.stage === 'teslim' && !x.photosDeleted && x.history && Date.parse(x.history.teslim) < Date.now() - PHOTO_DAYS * 864e5) {
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
    method: 'POST', body: params,
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
const page = (title, body) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Masaliya</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#faf6f0;color:#2a1a16}h1{font-size:22px}h2{font-size:18px;margin:28px 0 8px;color:#7a2434}table{border-collapse:collapse;width:100%;max-width:1100px;background:#fff}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid #eadfd3}th{font-weight:600;color:#7a2434;width:130px}small{color:#7a6a60}tr.odeme-bekleniyor{opacity:.55}.photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.photos img{height:240px;border:1px solid #eadfd3}a{color:#7a2434}.stage{max-width:1100px;background:#fff;border:2px solid #7a2434;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:grid;gap:12px}.stage p{margin:0}.steps{display:flex;flex-wrap:wrap;gap:8px}.steps button{font:inherit;padding:10px 14px;border:1px solid #7a2434;background:#fff;color:#7a2434;border-radius:6px;cursor:pointer}.steps button.cur{background:#7a2434;color:#fff;cursor:default}.stage label{display:grid;gap:4px;font-size:13px;color:#7a6a60}.stage input{font:inherit;padding:8px 10px;border:1px solid #d9cbbd;border-radius:6px}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.note{color:#b0412e}.pv-book{display:grid;gap:8px;padding:10px 0;border-top:1px solid #eadfd3}.pv-part{display:grid;gap:6px;padding-left:12px;border-left:3px solid #eadfd3}.pv-part i{font-style:normal;font-weight:600;color:#7a2434}.pv-files{display:flex;flex-wrap:wrap;gap:8px}.pv-files img{height:120px;border:1px solid #eadfd3}.pv-files .pdf{padding:10px;border:1px solid #eadfd3;border-radius:6px}.upload{font:inherit;padding:12px 16px;background:#7a2434;color:#fff;border:0;border-radius:6px;cursor:pointer;justify-self:start}.revs{margin:0;padding-left:18px;display:grid;gap:8px}</style></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
