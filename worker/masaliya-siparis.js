/* Masaliya order server: a Cloudflare Worker.
   It takes an order from the site (book, options, contacts and three photos), keeps the photos in a
   private R2 bucket, works out the price itself and sends the customer to a Stripe payment page.
   When Stripe reports the payment, the order is marked paid and the owner gets an e-mail with the
   order and links to the photos. Unpaid orders and their photos are deleted after 3 days.

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
const CATALOG = {"books":{"sihirli-kutuphane":{"title":"ve Sihirli Kütüphane","hero":"Dua"},"deniz-kizi-kralligi":{"title":"ve Deniz Kızı Krallığı","hero":"Lavin"},"buz-satosunun-sirri":{"title":"ve Buz Şatosunun Sırrı","hero":"Erva Ülkü"},"dinozorlarin-dogum-gunu":{"title":"ve Dinozorların Doğum Günü","hero":"Hızır Ali"}},"prices":{"kitap":{"hard":2900,"digital":900},"boyama":{"print":1000,"digital":null},"yapboz":{"std":900}},"sets":[{"id":"tek","name":"Yalnızca kitap","items":[],"discount":0},{"id":"masal-seti","name":"Masal Seti","items":[["boyama","print"]],"discount":0.1},{"id":"yapboz-seti","name":"Yapboz Seti","items":[["yapboz","std"]],"discount":0.1},{"id":"super-set","name":"Süper Set","items":[["boyama","print"],["yapboz","std"]],"discount":0.15}],"giftBox":300,"covers":{"hard":"Sert kapak","digital":"Dijital kitap (PDF)"}};
/* CATALOG:END */

const PART_NAMES = { boyama: 'boyama kitabı', yapboz: 'ahşap yapboz' };
const UNPAID_DAYS = 3;
const MAX_PHOTO = 12 * 1024 * 1024;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (req.method === 'OPTIONS') return cors(env, new Response(null, { status: 204 }));
      if (req.method === 'POST' && url.pathname === '/api/order') return cors(env, await createOrder(req, env));
      if (req.method === 'POST' && url.pathname === '/api/stripe') return await stripeEvent(req, env);
      if (req.method === 'GET' && url.pathname === '/api/status') return cors(env, await orderStatus(url, env));
      if (req.method === 'GET' && url.pathname === '/admin') return await adminList(url, env);
      const m = url.pathname.match(/^\/admin\/(MSL-[A-Z0-9]{6})(?:\/foto-([123])\.jpg)?$/);
      if (req.method === 'GET' && m) return await adminOrder(m[1], m[2], url, env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.log('error', err && err.stack || err);
      return cors(env, json({ error: 'Bir sorun oluştu, lütfen tekrar deneyin.' }, 500));
    }
  },
  async scheduled(event, env) { await removeUnpaid(env); }
};

/* ---------- the order from the site ---------- */
async function createOrder(req, env) {
  const form = await req.formData();
  let o;
  try { o = JSON.parse(form.get('order') || '{}'); } catch (e) { return json({ error: 'Sipariş bilgileri okunamadı.' }, 400); }
  const book = CATALOG.books[o.product];
  const set = CATALOG.sets.find(s => s.id === o.set);
  const coverPrice = CATALOG.prices.kitap[o.cover];
  const hero = String(o.hero || '').trim().slice(0, 32);
  const phone = String(o.phone || '').trim(), email = String(o.email || '').trim();
  if (!book || !set || !coverPrice) return json({ error: 'Seçtiğiniz kitap ya da seçenek bulunamadı.' }, 400);
  if (!hero) return json({ error: 'Kahramanın adı eksik.' }, 400);
  if (!/^[\d\s()+-]{10,20}$/.test(phone)) return json({ error: 'Telefon numarası geçersiz.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-posta adresi geçersiz.' }, 400);
  if (o.consentTerms !== true || o.consentKvkk !== true) return json({ error: 'Sözleşme ve açık rıza onayı eksik.' }, 400);
  const photos = [1, 2, 3].map(n => form.get('photo' + n));
  if (photos.some(f => !f || typeof f === 'string' || !/^image\//.test(f.type) || f.size > MAX_PHOTO || f.size < 1000)) return json({ error: 'Üç fotoğrafın üçü de gerekli (en fazla 12 MB).' }, 400);

  // the price is worked out here, never taken from the browser
  const parts = set.items.map(([t, f]) => CATALOG.prices[t][f]);
  const setPrice = Math.round((coverPrice + parts.reduce((a, b) => a + b, 0)) * (1 - set.discount));
  const ships = o.cover !== 'digital' || set.items.length > 0;
  const giftBox = !!o.giftBox && ships;
  const total = setPrice + (giftBox ? CATALOG.giftBox : 0);

  const id = newId();
  const title = `${hero} ${book.title}`;
  const what = [CATALOG.covers[o.cover], ...set.items.map(([t]) => PART_NAMES[t])].join(' + ');
  const order = {
    id, status: 'odeme-bekleniyor', created: new Date().toISOString(),
    product: o.product, title, hero, cover: o.cover, set: set.id, setName: set.name, contents: what,
    giftBox, giftNote: giftBox ? String(o.giftNote || '').slice(0, 240) : '',
    price: { set: setPrice, giftBox: giftBox ? CATALOG.giftBox : 0, total },
    contact: { phone, email }, ships
  };
  await Promise.all(photos.map((f, i) => env.PHOTOS.put(`orders/${id}/foto-${i + 1}.jpg`, f.stream(), { httpMetadata: { contentType: f.type } })));
  await save(env, order);

  // Stripe payment page
  const site = env.SITE_URL || 'https://masaliya.com';
  const p = new URLSearchParams({
    mode: 'payment', locale: 'tr', client_reference_id: id, customer_email: email,
    success_url: `${site}/tesekkurler.html?siparis=${id}`,
    cancel_url: `${site}/${o.product}.html?odeme=iptal`,
    'phone_number_collection[enabled]': 'true',
    'metadata[siparis]': id, 'metadata[kitap]': title, 'metadata[icerik]': what, 'metadata[set]': set.name,
    'metadata[hediye_kutusu]': giftBox ? 'evet' : 'hayır', 'metadata[telefon]': phone,
    'payment_intent_data[description]': `${id} · ${title} · ${set.name}`,
    'payment_intent_data[metadata][siparis]': id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'try',
    'line_items[0][price_data][unit_amount]': String(setPrice * 100),
    'line_items[0][price_data][product_data][name]': `${title} · ${set.name}`,
    'line_items[0][price_data][product_data][description]': what
  });
  if (giftBox) {
    p.set('line_items[1][quantity]', '1');
    p.set('line_items[1][price_data][currency]', 'try');
    p.set('line_items[1][price_data][unit_amount]', String(CATALOG.giftBox * 100));
    p.set('line_items[1][price_data][product_data][name]', 'Hediye kutusu');
  }
  if (ships) p.set('shipping_address_collection[allowed_countries][0]', 'TR');
  const session = await stripe(env, 'checkout/sessions', p);
  order.stripeSession = session.id;
  await save(env, order);
  return json({ id, url: session.url });
}

/* ---------- Stripe tells us about the payment ---------- */
async function stripeEvent(req, env) {
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET))) return new Response('bad signature', { status: 400 });
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.payment_status !== 'paid') return new Response('ok');
    const order = await load(env, s.client_reference_id);
    if (!order || order.status === 'odendi') return new Response('ok');
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
    const cust = s.customer_details || {};
    order.status = 'odendi';
    order.paid = new Date().toISOString();
    order.amountPaid = s.amount_total / 100;
    order.contact = { ...order.contact, name: cust.name || '', email: cust.email || order.contact.email, phone: cust.phone || order.contact.phone };
    order.shipping = ship ? { name: ship.name, ...ship.address } : null;
    await save(env, order);
    await mailOwner(env, order, new URL(req.url).origin);
  }
  return new Response('ok');
}

/* ---------- order tracking on the site: order number + e-mail or phone ---------- */
async function orderStatus(url, env) {
  const order = await load(env, (url.searchParams.get('siparis') || '').toUpperCase());
  const who = (url.searchParams.get('iletisim') || '').trim().toLowerCase();
  const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
  if (!order || !who || !(who === order.contact.email.toLowerCase() || (digits(who).length === 10 && digits(who) === digits(order.contact.phone))))
    return json({ error: 'Bu bilgilerle bir sipariş bulunamadı.' }, 404);
  return json({ id: order.id, status: order.status, title: order.title, contents: order.contents, created: order.created, paid: order.paid || null });
}

/* ---------- owner pages: all orders, and one order with its photos ---------- */
async function adminList(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return new Response('Giriş yetkisi yok', { status: 401 });
  const orders = [];
  let cursor;
  do {
    const page = await env.PHOTOS.list({ prefix: 'orders/', cursor });
    for (const o of page.objects) if (o.key.endsWith('/siparis.json')) orders.push(JSON.parse(await (await env.PHOTOS.get(o.key)).text()));
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  orders.sort((a, b) => b.created.localeCompare(a.created));
  const rows = await Promise.all(orders.map(async o => `<tr class="${o.status}"><td><a href="/admin/${o.id}?t=${await token(env, o.id)}">${o.id}</a></td><td>${date(o.created)}</td><td>${esc(o.title)}<br><small>${esc(o.setName)} · ${esc(o.contents)}${o.giftBox ? ' · hediye kutusu' : ''}</small></td><td>${o.price.total.toLocaleString('tr-TR')} TL</td><td>${o.status === 'odendi' ? 'Ödendi' : 'Ödeme bekleniyor'}</td><td>${esc(o.contact.phone)}<br>${esc(o.contact.email)}</td></tr>`));
  return page('Siparişler', `<h1>Siparişler</h1><p>${orders.filter(o => o.status === 'odendi').length} ödenmiş sipariş. Ödenmeyenler ${UNPAID_DAYS} gün sonra silinir.</p>
    <table><tr><th>No</th><th>Tarih</th><th>Kitap</th><th>Tutar</th><th>Durum</th><th>İletişim</th></tr>${rows.join('')}</table>`);
}

async function adminOrder(id, photo, url, env) {
  if (url.searchParams.get('t') !== await token(env, id)) return new Response('Giriş yetkisi yok', { status: 401 });
  if (photo) {
    const obj = await env.PHOTOS.get(`orders/${id}/foto-${photo}.jpg`);
    if (!obj) return new Response('Fotoğraf bulunamadı', { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${id}-foto-${photo}.jpg"` } });
  }
  const o = await load(env, id);
  if (!o) return new Response('Sipariş bulunamadı', { status: 404 });
  return page(o.id, orderHtml(o, url.origin, url.searchParams.get('t')));
}

function orderHtml(o, origin, t) {
  const a = o.shipping;
  return `<h1>${o.id} · ${o.status === 'odendi' ? 'Ödendi' : 'Ödeme bekleniyor'}</h1>
    <table>
      <tr><th>Kitap</th><td>${esc(o.title)}</td></tr>
      <tr><th>Set</th><td>${esc(o.setName)} · ${esc(o.contents)}</td></tr>
      <tr><th>Hediye kutusu</th><td>${o.giftBox ? 'Evet' + (o.giftNote ? ` · not: “${esc(o.giftNote)}”` : '') : 'Hayır'}</td></tr>
      <tr><th>Tutar</th><td>${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL</td></tr>
      <tr><th>Tarih</th><td>${date(o.created)}${o.paid ? ` · ödendi ${date(o.paid)}` : ''}</td></tr>
      <tr><th>İletişim</th><td>${esc(o.contact.name || '')} ${esc(o.contact.phone)} · ${esc(o.contact.email)}</td></tr>
      <tr><th>Adres</th><td>${a ? esc([a.name, a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`, a.state, a.country].filter(Boolean).join(', ')) : (o.ships ? '—' : 'Dijital, kargo yok')}</td></tr>
    </table>
    <div class="photos">${[1, 2, 3].map(n => `<a href="${origin}/admin/${o.id}/foto-${n}.jpg?t=${t}"><img src="${origin}/admin/${o.id}/foto-${n}.jpg?t=${t}" alt="Fotoğraf ${n}"></a>`).join('')}</div>`;
}

async function mailOwner(env, o, origin) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;
  const t = await token(env, o.id);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
    <p>Yeni sipariş ödendi.</p>${orderHtml(o, origin, t)}
    <p><a href="${origin}/admin/${o.id}?t=${t}">Siparişi ve fotoğrafları aç</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Masaliya <onboarding@resend.dev>', to: [env.OWNER_EMAIL], subject: `Yeni sipariş ${o.id} · ${o.title} · ${(o.amountPaid || o.price.total).toLocaleString('tr-TR')} TL`, html })
  });
  if (!res.ok) console.log('mail failed', res.status, await res.text());
}

/* ---------- clean-up of unpaid orders (cron) ---------- */
async function removeUnpaid(env) {
  const limit = Date.now() - UNPAID_DAYS * 864e5;
  let cursor;
  do {
    const page = await env.PHOTOS.list({ prefix: 'orders/', cursor });
    for (const obj of page.objects) {
      if (!obj.key.endsWith('/siparis.json')) continue;
      const o = JSON.parse(await (await env.PHOTOS.get(obj.key)).text());
      if (o.status !== 'odendi' && Date.parse(o.created) < limit) {
        const id = o.id;
        await env.PHOTOS.delete([1, 2, 3].map(n => `orders/${id}/foto-${n}.jpg`).concat(`orders/${id}/siparis.json`));
      }
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
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

function newId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(6));
  return 'MSL-' + [...r].map(b => abc[b % abc.length]).join('');
}
const save = (env, o) => env.PHOTOS.put(`orders/${o.id}/siparis.json`, JSON.stringify(o, null, 1), { httpMetadata: { contentType: 'application/json' } });
async function load(env, id) {
  if (!/^MSL-[A-Z0-9]{6}$/.test(id || '')) return null;
  const obj = await env.PHOTOS.get(`orders/${id}/siparis.json`);
  return obj ? JSON.parse(await obj.text()) : null;
}
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
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#faf6f0;color:#2a1a16}h1{font-size:22px}table{border-collapse:collapse;width:100%;max-width:1100px;background:#fff}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid #eadfd3}th{font-weight:600;color:#7a2434}small{color:#7a6a60}tr.odeme-bekleniyor{opacity:.55}.photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.photos img{height:260px;border:1px solid #eadfd3}a{color:#7a2434}</style></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
