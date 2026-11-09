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
const CATALOG = {"books":{"buz-satosunun-sirri":{"title":"ve Buz Şatosunun Sırrı","hero":"Asya"},"gokkusagi-unicornu":{"title":"ve Gökkuşağı Unicornu","hero":"Ada"},"sihirli-firca":{"title":"ve Sihirli Fırça","hero":"Duru"},"minik-pandalar":{"title":"ve Minik Pandalar","hero":"Ela"},"sihirli-kutuphane":{"title":"ve Sihirli Kütüphane","hero":"Zeynep"},"deniz-kizi-kralligi":{"title":"ve Deniz Kızı Krallığı","hero":"Elif"},"dinozorlarin-dogum-gunu":{"title":"ve Dinozorların Doğum Günü","hero":"Kerem"},"kayip-ay-isigi":{"title":"ve Kayıp Ay Işığı","hero":"Ege"},"buyuk-yaris":{"title":"ve Büyük Yarış","hero":"Poyraz"},"denizi-kurtariyor":{"title":"Denizi Kurtarıyor","hero":"Mert"},"kaybolan-minik-aslan":{"title":"ve Kaybolan Minik Aslan","hero":"Emir"}},"prices":{"kitap":{"hard":2900,"digital":900},"boyama":{"print":590,"digital":null},"yapboz":{"std":640}},"sets":[{"id":"tek","name":"Yalnızca kitap","items":[],"discount":0},{"id":"masal-seti","name":"Masal Seti","items":[["boyama","print"]],"discount":0},{"id":"yapboz-seti","name":"Puzzle Seti","items":[["yapboz","std"]],"discount":0},{"id":"super-set","name":"Süper Set","items":[["boyama","print"],["yapboz","std"]],"discount":0}],"giftBox":300,"covers":{"hard":"Sert kapak","digital":"Dijital kitap (PDF)"}};
/* CATALOG:END */

const PART_NAMES = { boyama: 'boyama kitabı', yapboz: 'ahşap puzzle' };
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
const stageLabel = o => o.cancelled ? 'İptal edildi' : o.status === 'odendi' ? STAGES[o.stage || 'tasarim'].admin : 'Ödeme bekleniyor';
const refundBadge = o => !o.cancelled ? '' : o.refund && o.refund.state === 'yapildi'
  ? '<span class="badge ok">İade yapıldı</span>' : '<span class="badge no">İade yapılmadı</span>';
const stagesFor = o => o.ships ? ['tasarim', 'onizleme', 'baski', 'kargo', 'teslim'] : ['tasarim', 'onizleme', 'teslim'];
const MAX_PREVIEW = 25 * 1024 * 1024, PREVIEW_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// each part of a book's set gets its own preview: the book, the coloring book, the puzzle
const PART_LABELS = { kitap: 'Kitap', boyama: 'Boyama kitabı', yapboz: 'Ahşap puzzle' };
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
      if (req.method === 'POST' && url.pathname === '/api/iptal') return cors(env, await customerCancel(req, env));
      const pv = url.pathname.match(/^\/api\/onizleme\/(MSL-[A-Z0-9]{6})\/([A-Za-z0-9-]+\.(?:jpg|png|webp|pdf))$/);
      if (req.method === 'GET' && pv) return await previewFile(pv[1], pv[2], url, env);
      if (req.method === 'GET' && url.pathname === '/admin') return await adminList(url, env, req);
      if (req.method === 'GET' && url.pathname === '/admin/istatistik') return await adminStats(url, env, req);
      const m = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})(?:\/(KTP-[A-Z0-9]{8})\/foto-([123])\.jpg)?$/);
      if (req.method === 'GET' && m) {
        const res = await adminOrder(m[1], m[2], m[3], url, env);
        // an open order page lets "← Siparişler" lead straight to the whole order list on this browser
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
  const about = String(o.about || '').trim().slice(0, 400);
  if (!book || !set || !coverPrice) return json({ error: 'Seçtiğiniz kitap ya da seçenek bulunamadı.' }, 400);
  if (o.cover === 'digital' && set.items.length) return json({ error: 'Dijital kitap setle birlikte sipariş edilemez.' }, 400);
  if (!hero) return json({ error: 'Kahramanın adı eksik.' }, 400);
  if (o.consentKvkk !== true) return json({ error: 'Fotoğraflar için açık rıza gerekiyor.' }, 400);
  const photos = [1, 2, 3].map(n => form.get('photo' + n));
  if (photos.some(f => !f || typeof f === 'string' || !/^image\//.test(f.type) || f.size > MAX_PHOTO || f.size < 1000)) return json({ error: 'Üç fotoğrafın üçü de gerekli (en fazla 12 MB).' }, 400);

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
    return json({ error: 'Bu bilgilerle bir sipariş bulunamadı.' }, 404);
  const h = order.history || {}, k = await ctoken(env, order.id), api = new URL(url.origin);
  const stages = order.status === 'odendi' ? stagesFor(order).map(st => ({ key: st, title: stageTitle(order, st), text: STAGES[st].text, date: h[st] || null })) : [];
  const previews = order.items.flatMap(it => { const parts = partsOf(it); return parts.map(part => ({ part, files: partFiles(order, it, part) })).filter(x => x.files.length).map(({ part, files }) => ({
    title: parts.length > 1 ? `${it.title} · ${PART_LABELS[part]}` : it.title,
    files: files.map(f => ({ name: f.name, pdf: f.type === 'pdf', url: `${api.origin}/api/onizleme/${order.id}/${f.file}?k=${k}` })) })); });
  return json({
    id: order.id, status: order.status, stage: order.stage || null, ships: !!order.ships,
    books: order.items.map(it => ({ title: it.title, contents: `${it.setName} · ${it.contents}` })), stages,
    cargo: order.cargo || null, created: order.created, paid: order.paid || null,
    k, previews: order.cancelled ? [] : previews, review: order.review || null, revisions: order.revisions || [],
    cancelled: order.cancelled || null, refunded: !!(order.refund && order.refund.state === 'yapildi'),
    cancelUntil: customerCanCancel(order) ? new Date(Date.parse(order.paid) + REFUND_HOURS * 36e5).toISOString() : null
  });
}

/* ---------- the customer looks at the preview and approves it or asks for changes ---------- */
async function customerReview(req, url, env) {
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: 'İstek okunamadı.' }, 400); }
  const o = await loadOrder(env, String(b.siparis || '').toUpperCase());
  if (!o || !o.items || b.k !== await ctoken(env, o.id)) return json({ error: 'Sipariş bulunamadı.' }, 404);
  if (o.cancelled || o.stage !== 'onizleme' || !o.previews || !o.review || o.review.state !== 'bekliyor') return json({ error: 'Bu önizleme için yanıtınız zaten alındı.' }, 409);
  const now = new Date().toISOString();
  if (b.karar === 'onay') {
    o.review = { state: 'onay', date: now, round: o.previewRound };
    o.approved = now;
  } else if (b.karar === 'duzeltme') {
    const text = String(b.not || '').trim().slice(0, 2000);
    if (text.length < 3) return json({ error: 'Lütfen neyi değiştirmemizi istediğinizi yazın.' }, 400);
    o.review = { state: 'duzeltme', date: now, round: o.previewRound };
    o.revisions = [...(o.revisions || []), { date: now, round: o.previewRound, text }];
  } else return json({ error: 'İstek okunamadı.' }, 400);
  await saveOrder(env, o);
  const t = await token(env, o.id);
  await mailOwnerNote(env, o.review.state === 'onay' ? `${o.id} · müşteri önizlemeyi onayladı` : `${o.id} · müşteri düzeltme istedi`,
    `<p>${o.review.state === 'onay' ? `Müşteri önizlemeyi onayladı.${o.ships ? ' Siparişi “Baskıya gönder” ile matbaaya gönderebilirsiniz.' : ' Dijital kitabı gönderip “Dijital kitabı gönderdim”e basın.'}` : `Müşterinin düzeltme isteği:</p><blockquote style="border-left:3px solid #7a2434;margin:0;padding:4px 12px">${esc(o.revisions.at(-1).text).replace(/\n/g, '<br>')}</blockquote><p>`}</p><p><a href="${url.origin}/admin/${o.id}?t=${t}">Siparişi aç</a></p>`);
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
  return Response.redirect(`${url.origin}/admin/${id}?t=${t}&adim=onizleme&gonderildi=${added}`, 303);
}

/* ---------- owner pages: all orders, and one order with its photos ---------- */
/* ---------- the order funnel: books put in a cart → taken to payment → paid ---------- */
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
  if (!env.ADMIN_KEY || !((url.searchParams.get('key') === env.ADMIN_KEY) || (cookie && cookie[1] === await ownerCookie(env)))) return new Response('Giriş yetkisi yok. Önce sipariş listesini ADMIN_KEY ile açın.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const all = async prefix => { const out = []; let cursor; do { const pg = await env.PHOTOS.list({ prefix, cursor }); out.push(...pg.objects.map(o => o.key)); cursor = pg.truncated ? pg.cursor : null; } while (cursor); return out; };
  const items = (await Promise.all((await all('items/')).filter(k => k.endsWith('/kitap.json')).map(k => getJson(env, k)))).filter(Boolean);
  const orders = (await Promise.all((await all('orders/')).filter(k => k.endsWith('/siparis.json')).map(k => getJson(env, k)))).filter(o => o && o.items);
  const days = (await Promise.all((await all('istatistik/')).map(async k => [k.slice(11, 21), await getJson(env, k)]))).filter(([, d]) => d).sort((a, b) => b[0].localeCompare(a[0]));
  const inOrder = new Set(orders.flatMap(o => o.items.map(it => it.id)));
  const paid = orders.filter(o => o.status === 'odendi' && !o.cancelled), waiting = orders.filter(o => o.status !== 'odendi');
  const cartOnly = items.filter(it => it.status !== 'odendi' && !inOrder.has(it.id));
  const by = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const prodName = id => (CATALOG.books[id] ? CATALOG.books[id].hero + ' ' + CATALOG.books[id].title : id);
  const rows = (m, label = x => x) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(label(k))}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2">—</td></tr>';
  const tot = days.reduce((t, [, d]) => ({ sepet: t.sepet + (d.sepet || 0), odemeye: t.odemeye + (d.odemeye || 0), odendi: t.odendi + (d.odendi || 0) }), { sepet: 0, odemeye: 0, odendi: 0 });
  const kit = days.reduce((m, [, d]) => { for (const [k, n] of Object.entries(d.kitaplar || {})) m[k] = (m[k] || 0) + n; return m; }, {});
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const opts = items.reduce((m, it) => { m[it.cover === 'digital' ? 'Dijital' : it.pdf ? 'Sert kapak + PDF' : 'Sert kapak'] = (m[it.cover === 'digital' ? 'Dijital' : it.pdf ? 'Sert kapak + PDF' : 'Sert kapak'] || 0) + 1; if (it.set && it.set !== 'tek') m[it.setName] = (m[it.setName] || 0) + 1; if (it.giftBox) m['Hediye kutusu'] = (m['Hediye kutusu'] || 0) + 1; if (it.about) m['“Kahraman hakkında” dolu'] = (m['“Kahraman hakkında” dolu'] || 0) + 1; return m; }, {});
  return page('İstatistik', `<p><a href="/admin">← Siparişler</a></p><h1>Sipariş hunisi</h1>
    <h2>Şu an kayıtlı olanlar (ödenmeyenler ${UNPAID_DAYS} gün tutulur)</h2>
    <table><tr><th>Sepete eklenen kitap</th><td>${items.length}</td></tr>
      <tr><th>Sepette kalan, ödemeye geçmeyen</th><td>${cartOnly.length}</td></tr>
      <tr><th>Ödeme sayfasına giden sipariş</th><td>${orders.length} (${orders.reduce((a, o) => a + o.items.length, 0)} kitap)</td></tr>
      <tr><th>Ödeme sayfasında bırakılan</th><td>${waiting.length}</td></tr>
      <tr><th>Ödenen sipariş</th><td>${paid.length} (${paid.reduce((a, o) => a + (o.amountPaid || 0), 0).toLocaleString('tr-TR')} TL)</td></tr>
      <tr><th>İptal edilen</th><td>${orders.filter(o => o.cancelled).length}</td></tr></table>
    <h2>Sepete en çok eklenen kitaplar (şu an kayıtlı)</h2><table>${rows(by(items, it => it.product), prodName)}</table>
    <h2>Seçenekler (şu an kayıtlı)</h2><table>${rows(opts)}</table>
    <h2>Günlük sayaç (bu sürümden itibaren, silinmez)</h2>
    <table><tr><th>Toplam</th><td>Sepete: ${tot.sepet} · Ödemeye geçen kitap: ${tot.odemeye} (${pct(tot.odemeye, tot.sepet)}) · Ödenen kitap: ${tot.odendi} (${pct(tot.odendi, tot.sepet)})</td></tr>
    ${days.slice(0, 30).map(([d, x]) => `<tr><td>${d}</td><td>Sepete ${x.sepet || 0} · Ödemeye ${x.odemeye || 0} · Ödendi ${x.odendi || 0}</td></tr>`).join('')}</table>
    <h2>Sepete eklenen kitaplar (günlük sayaçtan)</h2><table>${rows(kit, prodName)}</table>`);
}
const ownerCookie = async env => (await hmac(env.ADMIN_KEY || 'masaliya', 'sahip')).slice(0, 32);
async function adminList(url, env, req) {
  const cookie = ((req && req.headers.get('cookie')) || '').match(/(?:^|;\s*)mk=([0-9a-f]+)/);
  const byKey = env.ADMIN_KEY && url.searchParams.get('key') === env.ADMIN_KEY, byCookie = env.ADMIN_KEY && cookie && cookie[1] === await ownerCookie(env);
  if (!byKey && !byCookie) return new Response('Giriş yetkisi yok. Sipariş listesini bir kez ADMIN_KEY ile açın: /admin?key=…', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
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
  const rows = await Promise.all(orders.map(async o => `<tr class="${o.cancelled ? 'iptal' : o.status}"><td><a href="/admin/${o.id}?t=${await token(env, o.id)}">${o.id}</a></td><td>${date(o.created)}</td><td>${o.items.map(it => `${esc(it.title)}<br><small>${esc(it.setName)} · ${esc(it.contents)}${it.giftBox ? ' · hediye kutusu' : ''}</small>`).join('<br>')}</td><td>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL</td><td><b>${stageLabel(o)}</b> ${refundBadge(o)}${!o.cancelled && o.review && o.review.state === 'duzeltme' ? '<br><b style="color:#b0412e">Düzeltme istendi</b>' : !o.cancelled && o.review && o.review.state === 'bekliyor' ? '<br><small>Onay bekleniyor</small>' : ''}</td><td>${esc(o.contact.name || '')}<br>${esc(o.contact.phone)}<br>${esc(o.contact.email)}</td><td>${await cancelButton(env, o, '/admin')}</td></tr>`));
  const note = url.searchParams.get('not');
  return page('Siparişler', `<h1>Siparişler <small style="font-size:14px;font-weight:400"><a href="/admin/istatistik">İstatistik →</a></small></h1>${note ? `<p class="flash">${esc(note)}</p>` : ''}<p>${orders.filter(o => o.status === 'odendi').length} ödenmiş sipariş. Ödenmeyenler ${UNPAID_DAYS} gün sonra silinir.</p>
    <table><tr><th>No</th><th>Tarih</th><th>Kitaplar</th><th>Tutar</th><th>Aşama</th><th>Müşteri</th><th></th></tr>${rows.join('')}</table>`);
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
  const note = url.searchParams.get('not'), sent = +url.searchParams.get('gonderildi') || 0;
  const modal = sent ? `<div class="modal" id="sent" role="dialog" aria-modal="true" aria-labelledby="sent-t"><div class="box">
      <div class="tick">✓</div><h2 id="sent-t">Başarıyla gönderildi</h2>
      <p>Önizleme (${sent} dosya) müşteriye gönderildi. Müşterinin yanıtını bu sayfada ve sipariş listesinde göreceksiniz.</p>
      <div class="acts"><button type="button" onclick="document.getElementById('sent').remove(); history.replaceState(null, '', location.href.replace(/&gonderildi=\\d+/, ''))">Geri dön</button><a href="/admin">Siparişlere git</a></div>
    </div></div>` : '';
  if (o.cancelled) return page(o.id, cancelledPanel(o, t, note) + orderHtml(o, url.origin, t));
  return page(o.id, modal + `<div class="top"><a href="/admin">← Siparişler</a>${await cancelButton(env, o, `/admin/${o.id}?t=${t}`)}</div>` + await workflow(o, t, url.origin, env, url.searchParams.get('adim'), note) + orderHtml(o, url.origin, t));
}

// the owner's buttons that move a paid order to its next step
/* the owner's work on a paid order, one step at a time: a row of steps at the top, and under it
   only what belongs to the step being looked at (?adim=…; by default the current step) */
const STEP_NAMES = { tasarim: 'Tasarım', onizleme: 'Önizleme', baski: 'Baskı', kargo: 'Kargo', teslim: 'Teslim' };
async function workflow(o, t, origin, env, view, note) {
  if (o.status !== 'odendi') return '';
  const steps = stagesFor(o), cur = o.stage || 'tasarim', h = o.history || {};
  if (!steps.includes(view)) view = cur;
  const ci = steps.indexOf(cur), href = k => `/admin/${o.id}?t=${t}&adim=${k}`;
  const bar = `<nav class="flow">${steps.map((k, i) => `<a href="${href(k)}" class="${i < ci ? 'done' : i === ci ? 'cur' : ''}${k === view ? ' view' : ''}"><span>${i < ci ? '✓' : i + 1}</span>${!o.ships && k === 'teslim' ? 'Gönderildi' : STEP_NAMES[k]}</a>`).join('')}</nav>`;
  const go = (k, label, extra = '') => `<form method="post" action="/admin/${o.id}/asama?t=${t}"${extra}><input type="hidden" name="asama" value="${k}"><button class="next">${label}</button></form>`;
  const r = o.review, c = o.cargo || {};
  let body = '';
  if (view === 'tasarim') {
    body = `<p class="lead">Müşterinin gönderdikleri aşağıda: kahramanın adı, “Kahraman hakkında” notu ve fotoğraflar. Resimleri hazırladığınızda önizlemeye geçin.</p>
      <a class="next" href="${href('onizleme')}">Önizlemeyi hazırla →</a>`;
  } else if (view === 'onizleme') {
    const link = `${env.SITE_URL || 'https://masaliya.com'}/siparis.html?siparis=${o.id}&k=${await ctoken(env, o.id)}`;
    const state = !r ? '<span class="pill">Henüz gönderilmedi</span>'
      : r.state === 'bekliyor' ? `<span class="pill wait">Müşterinin yanıtı bekleniyor</span> <small>${r.round}. önizleme · ${date(r.date)}</small>`
      : r.state === 'onay' ? `<span class="pill ok">Müşteri onayladı ✓</span> <small>${date(r.date)}</small>`
      : `<span class="pill no">Müşteri düzeltme istedi</span> <small>${date(r.date)}</small>`;
    const revs = (o.revisions || []).slice().reverse().map(v => `<li><small>${date(v.date)} · ${v.round}. önizleme için</small><br>${esc(v.text).replace(/\n/g, '<br>')}</li>`).join('');
    const books = o.items.map(it => `<div class="pv-book"><b>${esc(it.title)}</b> <small>${esc(it.setName)}</small>${partsOf(it).map(part => {
      const files = partFiles(o, it, part);
      return `<div class="pv-part"><i>${PART_LABELS[part]}</i>
        ${files.length ? `<div class="pv-files">${files.map(f => { const src = `${origin}/api/onizleme/${o.id}/${f.file}?t=${t}`; return f.type === 'pdf' ? `<a class="pdf" href="${src}" target="_blank">PDF · ${esc(f.name)}</a>` : `<a href="${src}" target="_blank"><img src="${src}" alt="${esc(f.name)}" loading="lazy"></a>`; }).join('')}</div>` : ''}
        <label>${files.length ? 'Yeni sürümü seçin (eskisinin yerine geçer)' : 'Sayfaları seçin'} · JPG, PNG ya da PDF, birden fazla dosya<input type="file" name="f-${it.id}-${part}" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></label></div>`;
    }).join('')}</div>`).join('');
    const approved = r && r.state === 'onay';
    body = `<div class="review"><p>Müşterinin yanıtı: ${state}</p>${revs ? `<p class="sub">Müşterinin düzeltme istekleri</p><ul class="revs">${revs}</ul>` : ''}</div>
      <form method="post" enctype="multipart/form-data" action="/admin/${o.id}/onizleme?t=${t}" class="pv-form">
        ${books}
        <button class="next">${r ? 'Yeni önizlemeyi müşteriye gönder' : 'Önizlemeyi müşteriye gönder'}</button>
        <small>Gönderince sipariş “Önizleme” aşamasına geçer, müşteri sayfalarını görür ve onaylar ya da düzeltme ister. Kitap, boyama kitabı ve yapboz ayrı ayrı yüklenebilir; dosyalar ad sırasıyla gösterilir (01-kapak.jpg, 02-sayfa.jpg …).</small>
      </form>
      ${r ? `<label class="link">Müşterinin önizleme linki (WhatsApp’tan da gönderebilirsiniz)<input readonly value="${link}" onclick="this.select()"></label>` : ''}
      ${r ? (o.ships
        ? go('baski', 'Baskıya gönder →', approved ? '' : ` onsubmit="return confirm('Müşteri önizlemeyi henüz onaylamadı. Yine de baskıya gönderilsin mi?')"`)
        : go('teslim', 'Dijital kitabı gönderdim →', approved ? '' : ` onsubmit="return confirm('Müşteri önizlemeyi henüz onaylamadı. Yine de gönderildi olarak işaretlensin mi?')"`)) : ''}`;
  } else if (view === 'baski') {
    body = cur === 'baski' || ci > steps.indexOf('baski')
      ? `<p class="lead">Baskıda${h.baski ? ` · ${date(h.baski)}` : ''}. Kitap matbaadan çıkınca kargoya verin.</p><a class="next" href="${href('kargo')}">Kargoya ver →</a>`
      : `<p class="lead">Müşteri önizlemeyi onaylayınca “Önizleme” adımından baskıya gönderin.</p>`;
  } else if (view === 'kargo') {
    body = `<form method="post" action="/admin/${o.id}/asama?t=${t}" class="cargo">
        <div class="two"><label>Kargo firması<input name="firma" value="${esc(c.firm || 'Aras Kargo')}"></label><label>Takip numarası<input name="takip" value="${esc(c.no || '')}" required></label></div>
        <input type="hidden" name="asama" value="kargo"><button class="next">${cur === 'kargo' || ci > steps.indexOf('kargo') ? 'Takip bilgisini kaydet' : 'Kargoya verildi olarak kaydet →'}</button>
        <small>Müşteri takip numarasını sipariş takibi sayfasında görür.</small></form>
      ${cur === 'kargo' ? go('teslim', 'Teslim edildi →') : ''}`;
  } else if (view === 'teslim') {
    body = cur === 'teslim'
      ? `<p class="lead">${o.ships ? 'Teslim edildi' : 'Dijital kitap gönderildi'}${h.teslim ? ` · ${date(h.teslim)}` : ''}. ${o.photosDeleted ? `Fotoğraflar ${date(o.photosDeleted)} tarihinde silindi.` : `Fotoğraflar ${PHOTO_DAYS} gün sonra kendiliğinden silinir.`}</p>`
      : `<p class="lead">${o.ships ? 'Kargo teslim edilince buradan işaretleyin.' : 'Müşteri onaylayınca “Önizleme” adımından işaretleyin.'}</p>${cur === 'kargo' ? go('teslim', 'Teslim edildi →') : ''}`;
  }
  return `<section class="work">${bar}${note ? `<p class="note">${esc(note)}</p>` : ''}<div class="panel-in"><h2>${STEP_NAMES[view]}${view === cur ? ' <small>· şu anki aşama</small>' : ''}</h2>${body}</div></section>`;
}

/* ---------- cancelling an order: the payment goes back to the card through Stripe ---------- */
// cancelling with a refund is possible only in the first 24 hours after payment (as in the contract)
const REFUND_HOURS = 24;
const refundOpen = o => o.status !== 'odendi' || Date.now() - Date.parse(o.paid) < REFUND_HOURS * 36e5;
async function cancelButton(env, o, back) {
  if (o.cancelled) return '';
  const paid = o.status === 'odendi';
  if (!refundOpen(o)) return `<span class="closed" title="İptal ve iade yalnızca ödemeden sonraki ${REFUND_HOURS} saat içinde yapılabilir">İptal süresi doldu</span>`;
  const left = paid ? Math.max(1, Math.ceil((REFUND_HOURS * 36e5 - (Date.now() - Date.parse(o.paid))) / 36e5)) : 0;
  const q = paid ? `${o.id} siparişini iptal etmek istediğinizden emin misiniz?\n\n${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL müşterinin kartına iade edilecek. Bu işlem geri alınamaz.` : `${o.id} siparişini iptal etmek istediğinizden emin misiniz?`;
  return `<form method="post" action="/admin/${o.id}/iptal?t=${await token(env, o.id)}&geri=${encodeURIComponent(back)}" onsubmit="return confirm(${esc(JSON.stringify(q))})"><button class="cancel">${paid ? 'Siparişi iptal et ve iade et' : 'Siparişi iptal et'}</button>${paid ? `<small class="left">${left} saat kaldı</small>` : ''}</form>`;
}
function cancelledPanel(o, t, note) {
  const r = o.refund || {};
  return `<div class="stage cancelled"><p><b>Sipariş iptal edildi</b> · ${date(o.cancelled)} ${refundBadge(o)}${note ? ` <span class="note">${esc(note)}</span>` : ''}</p>
    ${r.state === 'yapildi' ? `<p>${(r.amount || o.amountPaid || 0).toLocaleString('tr-TR')} TL müşterinin kartına iade edildi${r.id ? ` (Stripe: ${esc(r.id)})` : ''}. Kartta görünmesi bankaya göre 5–10 iş günü sürebilir.</p>`
      : o.status === 'odendi' ? `<p>İade yapılamadı${r.error ? `: ${esc(r.error)}` : ''}. Tekrar deneyin ya da iadeyi Stripe’ta (Payments → bu ödeme → Refund) yapıp aşağıdan işaretleyin.</p>
        <div class="steps"><form method="post" action="/admin/${o.id}/iptal?t=${t}"><button>İadeyi tekrar dene</button></form>
        <form method="post" action="/admin/${o.id}/iade-yapildi?t=${t}" onsubmit="return confirm('İadeyi Stripe’ta kendiniz yaptınız mı?')"><button>Stripe’ta iade ettim</button></form></div>`
      : '<p>Bu sipariş ödenmemişti; iade gerekmiyor.</p>'}
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
      if (!pi) throw new Error('ödeme bulunamadı');
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
  try { b = await req.json(); } catch (e) { return json({ error: 'İstek okunamadı.' }, 400); }
  const o = await loadOrder(env, String(b.siparis || '').toUpperCase());
  const who = String(b.iletisim || '').trim().toLowerCase(), key = String(b.k || '');
  const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
  if (!o || !o.items || !((key && key === await ctoken(env, o.id)) || (who && (who === o.contact.email.toLowerCase() || (digits(who).length === 10 && digits(who) === digits(o.contact.phone))))))
    return json({ error: 'Sipariş bulunamadı.' }, 404);
  if (o.cancelled) return json({ error: 'Bu sipariş zaten iptal edildi.' }, 409);
  if (!customerCanCancel(o)) return json({ error: `İptal yalnızca ödemeden sonraki ${REFUND_HOURS} saat içinde, önizleme gönderilmeden önce yapılabilir.` }, 409);
  await cancelAndRefund(env, o, 'musteri');
  await mailOwnerNote(env, `${o.id} · müşteri siparişi iptal etti`, `<p>Müşteri siparişi ${REFUND_HOURS} saat içinde iptal etti.</p><p>${o.refund && o.refund.state === 'yapildi' ? `${(o.refund.amount || o.amountPaid).toLocaleString('tr-TR')} TL kartına iade edildi.` : `İade yapılamadı${o.refund && o.refund.error ? `: ${esc(o.refund.error)}` : ''}. Lütfen Stripe’ta iade edip yönetim sayfasında işaretleyin.`}</p>`);
  return json({ ok: true, refunded: !!(o.refund && o.refund.state === 'yapildi') });
}
const customerCanCancel = o => o.status === 'odendi' && !o.cancelled && (o.stage || 'tasarim') === 'tasarim' && refundOpen(o);

async function cancelOrder(id, action, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giriş yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items) return new Response('Sipariş bulunamadı', { status: 404 });
  const geri = url.searchParams.get('geri');
  const back = note => Response.redirect(`${url.origin}${geri && /^\/admin/.test(geri) ? geri : `/admin/${id}?t=${t}`}${note ? (geri && geri.includes('?') || !geri ? '&' : '?') + 'not=' + encodeURIComponent(note) : ''}`, 303);
  const now = new Date().toISOString();
  if (action === 'iade-yapildi') {
    if (!o.cancelled) return back('');
    o.refund = { ...(o.refund || {}), state: 'yapildi', manual: true, date: now }; await saveOrder(env, o); return back('İade yapıldı olarak işaretlendi.');
  }
  if (o.refund && o.refund.state === 'yapildi') return back('Bu siparişin iadesi zaten yapıldı.');
  if (!o.cancelled && !refundOpen(o)) return back(`İptal ve iade yalnızca ödemeden sonraki ${REFUND_HOURS} saat içinde yapılabilir.`);
  await cancelAndRefund(env, o, 'satici');
  return back(o.status !== 'odendi' ? 'Sipariş iptal edildi.' : o.refund.state === 'yapildi' ? 'Sipariş iptal edildi, ödeme iade edildi.' : 'Sipariş iptal edildi ama iade yapılamadı.');
}

async function setStage(id, req, url, env) {
  const t = url.searchParams.get('t');
  if (t !== await token(env, id)) return new Response('Giriş yetkisi yok', { status: 401 });
  const o = await loadOrder(env, id);
  if (!o || !o.items || o.status !== 'odendi' || o.cancelled) return new Response('Sipariş bulunamadı', { status: 404 });
  const f = await req.formData(), stage = String(f.get('asama') || '');
  const back = note => Response.redirect(`${url.origin}/admin/${id}?t=${t}${note ? '&not=' + encodeURIComponent(note) : ''}`, 303);
  if (o.ships && f.has('takip')) {
    const firm = String(f.get('firma') || '').trim().slice(0, 40), no = String(f.get('takip') || '').trim().slice(0, 40);
    o.cargo = firm || no ? { firm, no } : null;
  }
  if (!stagesFor(o).includes(stage)) { await saveOrder(env, o); return back('Kaydedildi.'); }
  if (stage === 'kargo' && !(o.cargo && o.cargo.no)) return back('Önce takip numarasını yazın.');
  // the customer can only answer a preview that has pages: upload them below, that moves the order on by itself
  if (stage === 'onizleme' && !Object.values(o.previews || {}).flat().length) return back('Önce önizleme sayfalarını yükleyip gönderin.');
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
      <tr><th>Set</th><td>${esc(it.setName)} · ${esc(it.contents)}</td></tr>
      ${it.about ? `<tr><th>Kahraman hakkında</th><td>${esc(it.about)}</td></tr>` : ''}
      <tr><th>Hediye kutusu</th><td>${it.giftBox ? 'Evet' + (it.giftNote ? ` · not: “${esc(it.giftNote)}”` : '') : 'Hayır'}</td></tr>
      <tr><th>Tutar</th><td>${it.price.total.toLocaleString('tr-TR')} TL</td></tr>
    </table>
    <div class="photos">${[1, 2, 3].map(n => { const src = `${origin}/admin/${o.id}/${it.id}/foto-${n}.jpg?t=${t}`; return `<a href="${src}"><img src="${src}" alt="${esc(it.hero)} · fotoğraf ${n}"></a>`; }).join('')}</div>`).join('');
  return `<h1>${o.id} · ${stageLabel(o)} ${refundBadge(o)}</h1>
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
    teslim: o.ships ? `<p>Kitabınız teslim edildi. İyi okumalar!</p>` : `<p>Dijital kitabınız e-postanıza gönderildi. İyi okumalar!</p>`,
    iptal: `<p>Siparişiniz iptal edildi.</p>${o.refund && o.refund.state === 'yapildi' ? `<p>${(o.refund.amount || o.amountPaid).toLocaleString('tr-TR')} TL kartınıza iade edildi; bankanıza göre hesabınızda görünmesi 5–10 iş günü sürebilir.</p>` : '<p>Ödemenizin iadesiyle ilgili size ayrıca bilgi vereceğiz.</p>'}`
  };
  const subject = { tasarim: `Siparişiniz alındı · ${o.id}`, onizleme: `Önizlemeniz hazır · ${o.id}`, baski: `Kitabınız baskıda · ${o.id}`, kargo: `Kitabınız kargoda · ${o.id}`, teslim: `Masalınız size ulaştı · ${o.id}`, iptal: `Siparişiniz iptal edildi · ${o.id}` }[stage];
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
const page = (title, body) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Masaliya</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#faf6f0;color:#2a1a16}h1{font-size:22px}h2{font-size:18px;margin:28px 0 8px;color:#7a2434}table{border-collapse:collapse;width:100%;max-width:1100px;background:#fff}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid #eadfd3}th{font-weight:600;color:#7a2434;width:130px}small{color:#7a6a60}tr.odeme-bekleniyor{opacity:.55}.photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.photos img{height:240px;border:1px solid #eadfd3}a{color:#7a2434}.stage{max-width:1100px;background:#fff;border:2px solid #7a2434;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:grid;gap:12px}.stage p{margin:0}.steps{display:flex;flex-wrap:wrap;gap:8px}.steps button{font:inherit;padding:10px 14px;border:1px solid #7a2434;background:#fff;color:#7a2434;border-radius:6px;cursor:pointer}.steps button.cur{background:#7a2434;color:#fff;cursor:default}.stage label{display:grid;gap:4px;font-size:13px;color:#7a6a60}.stage input{font:inherit;padding:8px 10px;border:1px solid #d9cbbd;border-radius:6px}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.note{color:#b0412e}.pv-book{display:grid;gap:8px;padding:10px 0;border-top:1px solid #eadfd3}.pv-part{display:grid;gap:6px;padding-left:12px;border-left:3px solid #eadfd3}.pv-part i{font-style:normal;font-weight:600;color:#7a2434}.pv-files{display:flex;flex-wrap:wrap;gap:8px}.pv-files img{height:120px;border:1px solid #eadfd3}.pv-files .pdf{padding:10px;border:1px solid #eadfd3;border-radius:6px}.upload{font:inherit;padding:12px 16px;background:#7a2434;color:#fff;border:0;border-radius:6px;cursor:pointer;justify-self:start}.revs{margin:0;padding-left:18px;display:grid;gap:8px}
.top{max-width:1100px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.top form{display:flex;align-items:center;gap:8px}.top small.left{margin:0}.work{max-width:1100px;margin-bottom:22px}.modal{position:fixed;inset:0;background:rgba(30,10,14,.55);display:grid;place-items:center;z-index:10;padding:16px}.modal .box{background:#fff;border-radius:12px;padding:26px 24px;max-width:420px;width:100%;text-align:center;display:grid;gap:12px;box-shadow:0 30px 60px rgba(0,0,0,.35)}.modal .tick{width:56px;height:56px;margin:0 auto;border-radius:50%;background:#e3f2e5;color:#2e7d32;display:grid;place-items:center;font-size:28px;font-weight:700}.modal h2{margin:0;color:#2e7d32}.modal p{margin:0;color:#5a4a42}.modal .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px}.modal .acts button,.modal .acts a{font:inherit;font-weight:600;padding:11px 16px;border-radius:6px;cursor:pointer;text-decoration:none}.modal .acts button{background:#fff;border:1px solid #7a2434;color:#7a2434}.modal .acts a{background:#7a2434;color:#fff;border:1px solid #7a2434}.flow{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.flow a{flex:1;min-width:110px;display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #d9cbbd;border-radius:8px;background:#fff;color:#7a6a60;text-decoration:none}.flow a span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid currentColor;font-size:12px}.flow a.done{color:#2e7d32;border-color:#b9dcbc}.flow a.cur{color:#fff;background:#7a2434;border-color:#7a2434}.flow a.view{box-shadow:0 0 0 3px #e2b56b}
.panel-in{background:#fff;border:2px solid #7a2434;border-radius:8px;padding:16px;display:grid;gap:14px}.panel-in h2{margin:0;color:#7a2434}.panel-in h2 small{font-weight:400;color:#9a8a80;font-size:14px}.lead{margin:0}
.next{justify-self:start;display:inline-block;font:inherit;font-weight:600;padding:11px 16px;background:#7a2434;color:#fff;border:0;border-radius:6px;cursor:pointer;text-decoration:none}
.pill{display:inline-block;padding:3px 10px;border-radius:20px;background:#eee;font-weight:600;font-size:13px}.pill.wait{background:#fff4dc;color:#8a5a00}.pill.ok{background:#e3f2e5;color:#2e7d32}.pill.no{background:#fbe6e3;color:#b0412e}
.review{background:#faf6f0;border-radius:6px;padding:10px 12px}.review p{margin:0}.review .sub{margin-top:8px;font-weight:600;color:#7a2434}.pv-form,.cargo{display:grid;gap:10px}.link{display:grid;gap:4px;font-size:13px;color:#7a6a60}.link input,.cargo input{font:inherit;padding:8px 10px;border:1px solid #d9cbbd;border-radius:6px}.cargo label{display:grid;gap:4px;font-size:13px;color:#7a6a60}button.cancel{font:inherit;font-size:13px;padding:7px 10px;border:1px solid #b0412e;background:#fff;color:#b0412e;border-radius:6px;cursor:pointer;white-space:nowrap}button.cancel:hover{background:#b0412e;color:#fff}.stage.cancelled{border-color:#b0412e}.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:20px;vertical-align:middle}.badge.ok{background:#e3f2e5;color:#2e7d32}.badge.no{background:#fbe6e3;color:#b0412e}tr.iptal{opacity:.7}.closed{font-size:12px;color:#9a8a80;white-space:nowrap}small.left{display:block;font-size:11px;color:#9a8a80;margin-top:3px}.flash{background:#fff;border-left:4px solid #7a2434;padding:10px 14px;max-width:1100px}</style></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
