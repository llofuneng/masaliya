/* Masaliya shared script: header, footer, menu, product catalogue and page renderers.
   To add a product, add one entry to PRODUCTS below; it appears in its collection and gets its own page. */

// the ?v= stamp this file was loaded with, passed on to the files it loads itself
const VER = (document.currentScript && new URL(document.currentScript.src).searchParams.get('v')) || '';

const AUDIENCES = {
  kiz:      { page: 'kizlar.html',      name: 'Kız Çocukları',   short: 'Kızlar' },
  erkek:    { page: 'erkekler.html',    name: 'Erkek Çocukları', short: 'Erkekler' },
  // hidden: kept but not shown anywhere until there are books for adults; set to false to bring it back
  yetiskin: { page: 'yetiskinler.html', name: 'Yetişkinler',     short: 'Yetişkinler', hidden: true }
};

/* Product types for the children's collections */
const TYPES = {
  kitap:  { tab: 'kitaplar', name: 'Kitaplar',         one: 'Masal kitabı' },
  boyama: { tab: 'boyama',   name: 'Boyama Kitapları', one: 'Boyama kitabı' }
};

/* Occasions for the adults' collection */
const OCCASIONS = {
  ciftler:     'Çiftler',
  buyukler:    'Büyükanne & Büyükbaba',
  aile:        'Aile',
  'dogum-gunu': 'Doğum Günü'
};

/* Prices in TL. null = not announced yet. */
const PRICES = {
  kitap:  { hard: 2900, digital: 900 },
  boyama: { print: 590, digital: null },   // only with a book
  yapboz: { std: 640 }    // wooden, 35 pieces; only with a book
};
/* Campaign: in one order, the second of every two hardcover books costs 2.000 TL (2.900 + 2.000 = 4.900 TL), until the end of
   15 Aralık 2026, Türkiye time. The order server gets the same rule from tools/build-pages.js and prices it itself;
   after the date both sides stop on their own. Set to null to stop it earlier (then rebuild and paste the worker). */
const PAIR_DEAL = { off: 900, until: '2026-12-15T23:59:59+03:00', untilText: '15 Aralık' };
const pairOn = () => !!PAIR_DEAL && Date.now() <= Date.parse(PAIR_DEAL.until);
const pairOff = items => pairOn() ? Math.floor(items.filter(it => it.cover === 'hard').length / 2) * PAIR_DEAL.off : 0;
const PAIR_LINE = () => pairOn() ? `<b>İkinci kitapta ${fmt(PAIR_DEAL.off)} indirim</b> · 2 sert kapak kitap birlikte ${fmt(2 * PRICES.kitap.hard - PAIR_DEAL.off)} · ${PAIR_DEAL.untilText}’a kadar` : '';
/* the home page: a running gold line along the top of the first screen */
function dealRun() {
  const intro = document.getElementById('intro');
  if (!pairOn() || !intro || intro.querySelector('.deal-run')) return;
  const one = `<span>İkinci kitapta <b>${fmt(PAIR_DEAL.off)} indirim</b></span><i>✦</i><span>${PAIR_DEAL.untilText}’a kadar</span><i>✦</i><span>Kaçırmayın!</span><i>✦</i>`;
  const a = document.createElement('a');
  a.className = 'deal-run'; a.href = 'urunler.html';
  a.setAttribute('aria-label', `İkinci kitapta ${fmt(PAIR_DEAL.off)} indirim, ${PAIR_DEAL.untilText}’a kadar. Kitapları gör`);
  a.innerHTML = `<span class="deal-track" aria-hidden="true">${one.repeat(4)}${one.repeat(4)}</span>`;
  intro.prepend(a); intro.classList.add('has-deal');
}
const GIFT_BOX_PRICE = 300;   // gift box add-on, TL; null shows "Fiyat yakında"
const PDF_ADDON_PRICE = null;  // digital copy added to a printed book, TL
/* ON SALE NOW. Only the story books are ready. Switch boyama (coloring books) or yapboz (wooden
   puzzle) to true and they come back by themselves: the sets on the book pages, the coloring pages,
   the lists, the price table and the texts that mention them. After switching, run
   node tools/build-pages.js (the order server already knows every set, so Cloudflare needs nothing). */
const SELL = { boyama: false, yapboz: true };
// a product with hidden: true is off the site for now (its pages stay, its address leads to the collection)
const onSale = p => !p.hidden && !(p.book && (PRODUCTS.find(b => b.id === p.book) || {}).hidden) && (p.type !== 'boyama' || SELL.boyama);

/* Sets: the same hero across several products, priced together.
   The set price is the book plus its parts (coloring book, wooden puzzle), minus the discount if any.
   Sets go with the printed book only. */
const ALL_SETS = [
  { id: 'tek', name: 'Yalnızca kitap', items: [], discount: 0 },
  { id: 'masal-seti', name: 'Masal Seti', note: 'Kitap + boyama kitabı, aynı kahramanla', items: [['boyama', 'print']], discount: 0 },
  { id: 'yapboz-seti', name: 'Puzzle Seti', note: 'Kitap + ahşap puzzle, 35 parça', items: [['yapboz', 'std']], discount: 0 },
  { id: 'super-set', name: 'Süper Set', note: 'Kitap + boyama kitabı + ahşap puzzle', items: [['boyama', 'print'], ['yapboz', 'std']], discount: 0 }
];
const SETS = ALL_SETS.filter(st => st.items.every(([t]) => SELL[t]));   // only sets whose parts are on sale
const setTotal = st => Math.round((PRICES.kitap.hard + st.items.reduce((a, [t, f]) => a + PRICES[t][f], 0)) * (1 - st.discount));
const PHOTO_SLOTS = ['Önden', 'Hafif yandan', 'Gülümserken'];
const PUZZLE = { pieces: 35, desc: '35 parça. Kitaptan bir sahne; son parça yerine oturduğunda karşısında kendi yüzü vardır.' };
const puzzleImg = p => `img/${p.id}-yapboz.jpg`;
/* Formats per product type, in the order shown: [key, name, note]. A 'digital' format never gets a gift box. */
const FORMATS = {
  kitap: [
    ['hard', 'Sert Kapak', '21 × 28 cm · sayfalar düz açılır'],
    ['digital', 'Dijital Kitap', 'PDF · e-postanıza gelir']
  ],
  boyama: [
    ['print', 'Basılı Boyama Kitabı', 'Kalın, boyamaya uygun kâğıt'],
    ['digital', 'Dijital Boyama', 'PDF · evde dilediğiniz kadar yazdırın']
  ]
};

/* WhatsApp concierge: put the number here in international format without "+", e.g. '905321234567'. */
const WHATSAPP = '905306233782';

/* The cart: the books put in it, kept in this browser (localStorage). The photos are already on the
   order server; here we keep only what the cart page shows. Books not paid within 3 days are deleted
   there, so they are dropped here too. */
// what every book order comes with, shown on the book page at once and again by the order buttons
const PROMISE = `<ul class="promise"><li>Baskıdan önce bütün sayfaları görüp onaylarsınız</li><li>Gerekirse düzeltme yaparız</li><li>Ücretsiz kargo</li></ul>`;
// simple acceptance marks for the cards Stripe takes
const CARD_MARKS = [
  '<svg viewBox="0 0 48 30" role="img" aria-label="Visa"><rect width="48" height="30" rx="4" fill="#fff"/><text x="24" y="20" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" font-style="italic" fill="#1a1f71">VISA</text></svg>',
  '<svg viewBox="0 0 48 30" role="img" aria-label="Mastercard"><rect width="48" height="30" rx="4" fill="#fff"/><circle cx="19.5" cy="15" r="8" fill="#eb001b"/><circle cx="28.5" cy="15" r="8" fill="#f79e1b"/><path d="M24 8.4a8 8 0 0 1 0 13.2a8 8 0 0 1 0-13.2z" fill="#ff5f00"/></svg>',
  '<svg viewBox="0 0 48 30" role="img" aria-label="Apple Pay"><rect width="48" height="30" rx="4" fill="#000"/><path d="M14.2 10.6c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.3-.8 2.1.8.1 1.6-.4 2.2-1zm.7 1.2c-1.2-.1-2.2.7-2.7.7-.6 0-1.4-.6-2.3-.6-1.2 0-2.3.7-2.9 1.8-1.3 2.2-.3 5.4.9 7.2.6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.6c1 0 1.6-.9 2.1-1.8.7-1 1-1.9 1-2-.1 0-1.9-.7-1.9-2.8 0-1.7 1.4-2.6 1.5-2.6-.8-1.2-2.1-1.4-2.5-1.4z" fill="#fff"/><text x="31" y="19.5" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="10" font-weight="600" fill="#fff">Pay</text></svg>',
  '<svg viewBox="0 0 48 30" role="img" aria-label="Google Pay"><rect width="48" height="30" rx="4" fill="#fff"/><text x="14.5" y="19.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700"><tspan fill="#4285f4">G</tspan></text><text x="30" y="19.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="500" fill="#5f6368">Pay</text></svg>'
].join('');
const CART_KEY = 'masaliya-sepet', CART_DAYS = 3;
const cart = {
  all() {
    let items = [];
    try { items = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) {}
    const fresh = items.filter(it => Date.now() - it.added < CART_DAYS * 864e5 - 36e5);
    if (fresh.length !== items.length) cart.save(fresh);
    return fresh;
  },
  save(items) { let ok = true; try { localStorage.setItem(CART_KEY, JSON.stringify(items)); ok = localStorage.getItem(CART_KEY) === JSON.stringify(items); } catch (e) { ok = false; } cart.badge(); return ok; },
  add(item) { return cart.save([...cart.all(), { ...item, added: Date.now() }]); },
  remove(id) { cart.save(cart.all().filter(it => it.id !== id)); },
  clear() { cart.save([]); },
  badge() {
    const n = cart.all().length;
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = n; el.hidden = !n; });
  }
};

/* The order server (Cloudflare Worker, see worker/). Empty = orders can't be sent yet. */
const ORDER_API = 'https://masaliya-siparis.llo-fun-eng.workers.dev';

const SPREADS_DUA = [
  ['img/sihirli-kutuphane-s1.jpg', 'Zeynep tozlu Masallar Kitabı’nı buluyor'],
  ['img/sihirli-kutuphane-s2.jpg', 'Masal Diyarı’nda konuşan kedi Mürekkep'],
  ['img/sihirli-kutuphane-s3.jpg', 'Bulutların üstündeki ip köprüde küçük şövalye Aras'],
  ['img/sihirli-kutuphane-s4.jpg', 'Yalnız dev Toprak ile paylaşılan simit'],
  ['img/sihirli-kutuphane-s5.jpg', 'Yüz yıldır kapıyı bekleyen taş aslan'],
  ['img/sihirli-kutuphane-s6.jpg', 'Sihirli Kütüphane’de altın sayfalar'],
  ['img/sihirli-kutuphane-s7.jpg', 'Zeynep okul kütüphanesinde ilk cümleyi yazıyor']
];
// coloring books: single portrait pages
const PAGES_BOYAMA_LAVIN = [
  ['img/deniz-kizi-kralligi-boyama-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/deniz-kizi-kralligi-boyama-p02.jpg', 'Dalgaları çiz'],
  ['img/deniz-kizi-kralligi-boyama-p03.jpg', 'Kumsalda deniz kabuğu'],
  ['img/deniz-kizi-kralligi-boyama-p04.jpg', 'Labirent'],
  ['img/deniz-kizi-kralligi-boyama-p05.jpg', 'Mira ile ilk karşılaşma'],
  ['img/deniz-kizi-kralligi-boyama-p06.jpg', 'Kaç tane?'],
  ['img/deniz-kizi-kralligi-boyama-p07.jpg', 'Yengeç ve ilk inci'],
  ['img/deniz-kizi-kralligi-boyama-p08.jpg', 'Eşini bul'],
  ['img/deniz-kizi-kralligi-boyama-p09.jpg', 'Bilge kaplumbağa'],
  ['img/deniz-kizi-kralligi-boyama-p10.jpg', 'Hangisi farklı?'],
  ['img/deniz-kizi-kralligi-boyama-p11.jpg', 'Parlayan balıklar'],
  ['img/deniz-kizi-kralligi-boyama-p12.jpg', 'Noktaları birleştir'],
  ['img/deniz-kizi-kralligi-boyama-p13.jpg', 'Mağarada üçüncü inci'],
  ['img/deniz-kizi-kralligi-boyama-p14.jpg', 'Kendi resmini çiz'],
  ['img/deniz-kizi-kralligi-boyama-p15.jpg', 'Deniz Kızı Krallığı’nda şenlik']
];
const PAGES_BOYAMA_DINO = [
  ['img/dinozorlarin-dogum-gunu-boyama-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/dinozorlarin-dogum-gunu-boyama-p02.jpg', 'Yolları çiz'],
  ['img/dinozorlarin-dogum-gunu-boyama-p03.jpg', 'Kitaptan çıkan küçük dinozor'],
  ['img/dinozorlarin-dogum-gunu-boyama-p04.jpg', 'Labirent'],
  ['img/dinozorlarin-dogum-gunu-boyama-p05.jpg', 'Fıstık ile ilk karşılaşma'],
  ['img/dinozorlarin-dogum-gunu-boyama-p06.jpg', 'Kaç tane?'],
  ['img/dinozorlarin-dogum-gunu-boyama-p07.jpg', 'Ağacın tepesindeki meyveler'],
  ['img/dinozorlarin-dogum-gunu-boyama-p08.jpg', 'Eşini bul'],
  ['img/dinozorlarin-dogum-gunu-boyama-p09.jpg', 'Kanatlı dinozor Rüzgâr ile uçuş'],
  ['img/dinozorlarin-dogum-gunu-boyama-p10.jpg', 'Hangisi farklı?'],
  ['img/dinozorlarin-dogum-gunu-boyama-p11.jpg', 'Minik ile yapraktan bir hediye'],
  ['img/dinozorlarin-dogum-gunu-boyama-p12.jpg', 'Noktaları birleştir'],
  ['img/dinozorlarin-dogum-gunu-boyama-p13.jpg', 'Koca Dede’nin doğum günü'],
  ['img/dinozorlarin-dogum-gunu-boyama-p14.jpg', 'Kendi resmini çiz'],
  ['img/dinozorlarin-dogum-gunu-boyama-p15.jpg', 'Evde, elinde parlayan yaprak']
];
const PAGES_BOYAMA_PANDA = [
  ['img/minik-pandalar-boyama-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/minik-pandalar-boyama-p02.jpg', 'Yolları çiz'],
  ['img/minik-pandalar-boyama-p03.jpg', 'Hep birlikte, hooop!'],
  ['img/minik-pandalar-boyama-p04.jpg', 'Labirent'],
  ['img/minik-pandalar-boyama-p05.jpg', 'Yokuş aşağı kaçan karpuz'],
  ['img/minik-pandalar-boyama-p06.jpg', 'Kaç tane?'],
  ['img/minik-pandalar-boyama-p07.jpg', 'Taştan taşa, hop hop hop'],
  ['img/minik-pandalar-boyama-p08.jpg', 'Eşini bul'],
  ['img/minik-pandalar-boyama-p09.jpg', 'Kütüğün içinde'],
  ['img/minik-pandalar-boyama-p10.jpg', 'Hangisi farklı?'],
  ['img/minik-pandalar-boyama-p11.jpg', 'Su birikintisinin ortasında'],
  ['img/minik-pandalar-boyama-p12.jpg', 'Noktaları birleştir'],
  ['img/minik-pandalar-boyama-p13.jpg', 'Ağacın altındaki kirpiler'],
  ['img/minik-pandalar-boyama-p14.jpg', 'Kendi resmini çiz'],
  ['img/minik-pandalar-boyama-p15.jpg', 'Herkesle paylaşılan karpuz']
];
const SPREADS_PANDA = [
  ['img/minik-pandalar-s1.jpg', 'Ela ve üç minik panda kocaman karpuzu kaldırıyor'],
  ['img/minik-pandalar-s2.jpg', 'Karpuz yokuş aşağı yuvarlanıyor: güm, güm, güm!'],
  ['img/minik-pandalar-s3.jpg', 'Derenin taşlarından hop hop hop'],
  ['img/minik-pandalar-s4.jpg', 'Kütüğün içinde: «Karpuz, neredesiiin?»'],
  ['img/minik-pandalar-s5.jpg', 'Karpuz su birikintisine dalıyor: cup!'],
  ['img/minik-pandalar-s6.jpg', 'Ağacın altındaki üç aç kirpi'],
  ['img/minik-pandalar-s7.jpg', 'Paylaşınca büyüyen şenlik']
];
const SPREADS_AY = [
  ['img/kayip-ay-isigi-s1.jpg', 'Ege her gece penceresinden Ay’a bakıyor'],
  ['img/kayip-ay-isigi-s2.jpg', 'Oyuncak roket gerçek bir uzay gemisine dönüşüyor'],
  ['img/kayip-ay-isigi-s3.jpg', 'Yıldızların arasında küçük yıldızla tanışma'],
  ['img/kayip-ay-isigi-s4.jpg', 'Ay’ın karanlık tarafında cesur adımlar'],
  ['img/kayip-ay-isigi-s5.jpg', 'Gözünde bir damla yaşla yalnız Ay'],
  ['img/kayip-ay-isigi-s6.jpg', 'Ay’a bir masal: «Artık yalnız değilsin»'],
  ['img/kayip-ay-isigi-s7.jpg', 'Evde, göz kırpan Ay’a iyi geceler']
];
const SPREADS_YARIS = [
  ['img/buyuk-yaris-s1.jpg', 'Oyuncak kırmızı araba parlıyor ve büyüyor'],
  ['img/buyuk-yaris-s2.jpg', 'Neon şehirde start çizgisi: Kıvılcım’ın sırrı'],
  ['img/buyuk-yaris-s3.jpg', 'Yağ birikintisinde dönen Vida’ya yardım'],
  ['img/buyuk-yaris-s4.jpg', 'Karanlık tünelin önünde minik Bip'],
  ['img/buyuk-yaris-s5.jpg', 'Usta Robot’un saçılan somunları'],
  ['img/buyuk-yaris-s6.jpg', 'Altın turbo: yıkık köprünün üstünden uçuş'],
  ['img/buyuk-yaris-s7.jpg', 'Sabah: rafta minicik altın bir kupa']
];
const SPREADS_BALINA = [
  ['img/denizi-kurtariyor-s1.jpg', 'Oyuncak sarı denizaltı mavi mavi parlıyor'],
  ['img/denizi-kurtariyor-s2.jpg', 'Derinlerde ağlayan küçücük bir yavru balina'],
  ['img/denizi-kurtariyor-s3.jpg', 'Lombozun iki yanında yeni bir dostluk'],
  ['img/denizi-kurtariyor-s4.jpg', '«Dur, o yemek değil!»: kaplumbağa ve poşet'],
  ['img/denizi-kurtariyor-s5.jpg', 'Mavi Koy’da büyük temizlik başlıyor'],
  ['img/denizi-kurtariyor-s6.jpg', 'Köpük annesine kavuşuyor, gökyüzünde gökkuşağı'],
  ['img/denizi-kurtariyor-s7.jpg', 'Sabah: kulağa tutulan, gülen bir deniz kabuğu']
];
const SPREADS_ASLAN = [
  ['img/kaybolan-minik-aslan-s1.jpg', 'Fırtınadan sonra top sepetinde ağlayan minik bir aslan'],
  ['img/kaybolan-minik-aslan-s2.jpg', 'Gelincik yapraklarının izinde ilk paslar'],
  ['img/kaybolan-minik-aslan-s3.jpg', 'Mısır tarlasında korkuluğun omzundan yol aramak'],
  ['img/kaybolan-minik-aslan-s4.jpg', 'Rüzgârlı tepede atkıyla birbirine bağlı iki dost'],
  ['img/kaybolan-minik-aslan-s5.jpg', '«Seni yarı yolda bırakmam. Atla sırtıma!»'],
  ['img/kaybolan-minik-aslan-s6.jpg', 'Akşam maçı: aslan yavruları ve kaplan yavruları'],
  ['img/kaybolan-minik-aslan-s7.jpg', 'Sabah: sepette altın bir başak ve minicik bir pati izi']
];
const SPREADS_ADA = [
  ['img/gokkusagi-unicornu-s1.jpg', 'Yağmurlu balkonda ıslak bir yavru unicorn: kırmızı yandı'],
  ['img/gokkusagi-unicornu-s2.jpg', 'Kuş yavrusu yuvasına dönüyor: turuncu yandı'],
  ['img/gokkusagi-unicornu-s3.jpg', 'Taştan taşa zıplayan dostlar: sarı yandı'],
  ['img/gokkusagi-unicornu-s4.jpg', 'Son elma kirpiye: yeşil yandı'],
  ['img/gokkusagi-unicornu-s5.jpg', 'Siste bir ninni, ateş böceği yeniden parlıyor: mavi yandı'],
  ['img/gokkusagi-unicornu-s6.jpg', 'Gülen bulut ve gökkuşağına uçuş'],
  ['img/gokkusagi-unicornu-s7.jpg', 'Sabah: camda yedi renkli minicik bir pırıltı']
];
const SPREADS_FIRCA = [
  ['img/sihirli-firca-s1.jpg', 'Penceredeki gri kelebek sihirli fırçayla rengârenk oluyor'],
  ['img/sihirli-firca-s2.jpg', 'Duvara çizilen kapıdan Gri Kasaba\'ya: tavşanın havucu turuncu'],
  ['img/sihirli-firca-s3.jpg', 'Yaprak kayık coşkun nehirde: kirpi yelkeni sarıya boyuyor'],
  ['img/sihirli-firca-s4.jpg', 'Ayıcık balonu boyuyor, beş arkadaş havalanıyor'],
  ['img/sihirli-firca-s5.jpg', 'Upuzun kaydırak: gri gölgenin peşinde'],
  ['img/sihirli-firca-s6.jpg', 'Renksiz bukalemun kendini boyuyor, renkler kelebek olup uçuyor'],
  ['img/sihirli-firca-s7.jpg', 'Rengârenk kasabada şenlik: altı arkadaş bir arada']
];
const PAGES_BOYAMA_BUZ = [
  ['img/buz-satosunun-sirri-boyama-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/buz-satosunun-sirri-boyama-p02.jpg', 'Şifreli mesaj'],
  ['img/buz-satosunun-sirri-boyama-p03.jpg', 'Kartopu ve Fındık ile tanışma'],
  ['img/buz-satosunun-sirri-boyama-p04.jpg', 'Kelime avı'],
  ['img/buz-satosunun-sirri-boyama-p05.jpg', 'Şatonun avlusunda'],
  ['img/buz-satosunun-sirri-boyama-p06.jpg', 'Harfli labirent'],
  ['img/buz-satosunun-sirri-boyama-p07.jpg', 'Donmuş bahçedeki minik kuş'],
  ['img/buz-satosunun-sirri-boyama-p08.jpg', 'Bilmeceler'],
  ['img/buz-satosunun-sirri-boyama-p09.jpg', 'Buz Kraliçesi’nin taht salonu'],
  ['img/buz-satosunun-sirri-boyama-p10.jpg', 'Sihirli kareler'],
  ['img/buz-satosunun-sirri-boyama-p11.jpg', 'Kuzey ışıkları altında şenlik'],
  ['img/buz-satosunun-sirri-boyama-p12.jpg', 'Masal bulmacası'],
  ['img/buz-satosunun-sirri-boyama-p13.jpg', 'Evde, elinde kar küresi'],
  ['img/buz-satosunun-sirri-boyama-p14.jpg', 'Bir sonraki masalı sen yaz'],
  ['img/buz-satosunun-sirri-boyama-p15.jpg', 'Cevaplar']
];
const PAGES_BOYAMA_DUA = [
  ['img/sihirli-kutuphane-boyama-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/sihirli-kutuphane-boyama-p02.jpg', 'Şifreli mesaj'],
  ['img/sihirli-kutuphane-boyama-p03.jpg', 'Masallar Kitabı açılıyor'],
  ['img/sihirli-kutuphane-boyama-p04.jpg', 'Kelime avı'],
  ['img/sihirli-kutuphane-boyama-p05.jpg', 'Konuşan kedi Mürekkep'],
  ['img/sihirli-kutuphane-boyama-p06.jpg', 'Harfli labirent'],
  ['img/sihirli-kutuphane-boyama-p07.jpg', 'Bulutların üstündeki köprü'],
  ['img/sihirli-kutuphane-boyama-p08.jpg', 'Bilmeceler'],
  ['img/sihirli-kutuphane-boyama-p09.jpg', 'Dev Toprak'],
  ['img/sihirli-kutuphane-boyama-p10.jpg', 'Sihirli kareler'],
  ['img/sihirli-kutuphane-boyama-p11.jpg', 'Taş aslan'],
  ['img/sihirli-kutuphane-boyama-p12.jpg', 'Masal bulmacası'],
  ['img/sihirli-kutuphane-boyama-p13.jpg', 'Sihirli Kütüphane'],
  ['img/sihirli-kutuphane-boyama-p14.jpg', 'Bir sonraki masalı sen yaz'],
  ['img/sihirli-kutuphane-boyama-p15.jpg', 'Cevaplar']
];
const SPREADS_LAVIN = [
  ['img/deniz-kizi-kralligi-s1.jpg', 'Elif kumsalda deniz kabuğunu kulağına tutuyor'],
  ['img/deniz-kizi-kralligi-s2.jpg', 'Deniz kızı Mira dalgaların arasından çıkıyor'],
  ['img/deniz-kizi-kralligi-s3.jpg', 'Yan yan yürüyen yengeç ilk inciyi veriyor'],
  ['img/deniz-kizi-kralligi-s4.jpg', 'Bilge kaplumbağa ikinci inciyi sırtında taşıyor'],
  ['img/deniz-kizi-kralligi-s5.jpg', 'Parlayan balıklar mağaranın yolunu gösteriyor'],
  ['img/deniz-kizi-kralligi-s6.jpg', 'Elif ve Mira el ele üçüncü inciyi buluyor'],
  ['img/deniz-kizi-kralligi-s7.jpg', 'Deniz Kızı Krallığı’nda şenlik']
];

const SPREADS_BUZ = [
  ['img/buz-satosunun-sirri-s1.jpg', 'Asya kar küresini sallıyor, oda kar taneleriyle doluyor'],
  ['img/buz-satosunun-sirri-s2.jpg', 'Burnunu kaybeden kardan adam Kartopu ve geyik yavrusu Fındık'],
  ['img/buz-satosunun-sirri-s3.jpg', 'Fındık’a uzatılan elma ve açılan ikinci kapı'],
  ['img/buz-satosunun-sirri-s4.jpg', 'Donmuş bahçede atkıya sarılan minik kuş'],
  ['img/buz-satosunun-sirri-s5.jpg', 'Buz Kraliçesi’nin taht salonunda parlayan buz taşları'],
  ['img/buz-satosunun-sirri-s6.jpg', 'Kuzey ışıkları altında şatoda şenlik'],
  ['img/buz-satosunun-sirri-s7.jpg', 'Evde, kar küresindeki minik şato']
];
const SPREADS_DINO = [
  ['img/dinozorlarin-dogum-gunu-s1.jpg', 'Kerem dinozor kitabını açıyor, küçük yeşil dinozor göz kırpıyor'],
  ['img/dinozorlarin-dogum-gunu-s2.jpg', 'Yemyeşil ormanda küçük dinozor Fıstık ile tanışma'],
  ['img/dinozorlarin-dogum-gunu-s3.jpg', 'Sırtı dikenli dinozorun üstünden meyve toplamak'],
  ['img/dinozorlarin-dogum-gunu-s4.jpg', 'Kanatlı dinozor Rüzgâr ile vadinin üstünde uçuş'],
  ['img/dinozorlarin-dogum-gunu-s5.jpg', 'En küçük dinozor Minik ile yapraktan bir hediye'],
  ['img/dinozorlarin-dogum-gunu-s6.jpg', 'Koca Dede’ye sürpriz doğum günü partisi'],
  ['img/dinozorlarin-dogum-gunu-s7.jpg', 'Evde, elinde ışıl ışıl parlayan yaprak']
];

/* status: 'hazir' = can be ordered now, 'yakinda' = coming soon (interest list).
   book: a coloring book is sold only with its story book, as a Masal Seti */
const PRODUCTS = [
  { id: 'buz-satosunun-sirri', coverTitle: { box: [0, .25], sub: 've Buz Şatosunun Sırrı', font: 'sans', nameSize: 140, subSize: 41, block: 190, top: 14 }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Asya', title: 've Buz Şatosunun Sırrı',
    img: 'img/buz-satosunun-sirri-kapak.jpg', clean: 'img/buz-satosunun-sirri-temiz.jpg', alt: 'Asya ve Buz Şatosunun Sırrı kapağı: geyik yavrusu, kardan adam ve buz şatosu önünde gülümseyen kız',
    desc: 'Karlı bir akşam, masadaki kar küresi sallanınca kahramanımız kendini kapıları anahtarla açılmayan bir buz şatosunun önünde bulur. Burnunu kaybeden kardan adam Kartopu ve hep aç geyik yavrusu Fındık ile her kapının ardında bir sır bekler. Karşılık beklemeden yapılan küçük iyiliklerin büyük gücünü anlatan sıcacık bir kış masalı.',
    extra: [['img/buz-satosunun-sirri-arka.jpg', 'Arka kapak']], spreads: SPREADS_BUZ },
  { id: 'gokkusagi-unicornu', coverTitle: { box: [0, .2], sub: 've Gökkuşağı Unicornu', font: 'sans', nameSize: 122, subSize: 36, block: 165, top: 12, fx: .87 }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Ada', title: 've Gökkuşağı Unicornu',
    img: 'img/gokkusagi-unicornu-kapak.jpg', clean: 'img/gokkusagi-unicornu-temiz.jpg', alt: 'Ada ve Gökkuşağı Unicornu kapağı: gökkuşağı yeleli yavru unicorna yanak yanağa sarılan kız',
    desc: 'Yağmurlu bir akşam kahramanımız balkonda ıslak bir yavru unicorn bulur. Fırtına onu gökkuşağından düşürmüş, boynuzu sönmüş, gökkuşağı kaybolmuş. Ama unicornun boynuzu iyilikle yanar: her iyilik bir renk! Kırmızı, turuncu, sarı... Gökkuşağı geri gelecek mi? İyiliğin, dostluğun ve renklerin masalı.',
    extra: [['img/gokkusagi-unicornu-arka.jpg', 'Arka kapak']], spreads: SPREADS_ADA },
  { id: 'sihirli-firca', coverTitle: { box: [0, .2], sub: 've Sihirli Fırça', font: 'sans', nameSize: 122, subSize: 40, block: 165, top: 12, fx: .87 }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Duru', title: 've Sihirli Fırça',
    img: 'img/sihirli-firca-kapak.jpg', clean: 'img/sihirli-firca-temiz.jpg', alt: 'Duru ve Sihirli Fırça kapağı: altın saplı fırçadan renkli boya kurdelesi akıtan kız ve kucağında tavşan',
    desc: 'Bir akşam kahramanımız penceresinde ağlayan gri bir kelebek bulur: ülkesinin bütün renkleri kaybolmuş! Altın saplı sihirli fırçayla ne çizerse canlanır: bir kapı, bir kayık, bir balon, upuzun bir kaydırak... Yolda bir tavşan, bir kirpi ve bir ayıcık da onlara katılır. Renkleri kim aldı? Paylaşmanın, dostluğun ve renklerin masalı.',
    extra: [['img/sihirli-firca-arka.jpg', 'Arka kapak']], spreads: SPREADS_FIRCA },
  { id: 'minik-pandalar', coverTitle: { box: [0, .27], sub: 've Minik Pandalar', font: 'sans', nameSize: 140, subSize: 46, block: 190, top: 14 }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Ela', title: 've Minik Pandalar',
    img: 'img/minik-pandalar-kapak.jpg', clean: 'img/minik-pandalar-temiz.jpg', alt: 'Ela ve Minik Pandalar kapağı: bambu ormanında kocaman bir karpuza sarılan kız ve üç minik panda',
    desc: 'Bambu ormanında şenlik var: kahramanımız ve üç minik panda, herkes yesin diye kocaman bir karpuz götürüyor. Ama karpuz kaçıyor! Yokuş aşağı, taştan taşa, kütüğün içinden... Bir kovalamaca, bir sürü kahkaha ve paylaşınca büyüyen bir şenliğin masalı.',
    extra: [['img/minik-pandalar-arka.jpg', 'Arka kapak']], spreads: SPREADS_PANDA },
  { id: 'sihirli-kutuphane', coverTitle: { box: [0, .27], sub: 've Sihirli Kütüphane', font: 'script', nameSize: 141, subSize: 29, block: 166, top: 10, glow: 4.3, gold: 1.5 }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Zeynep', title: 've Sihirli Kütüphane',
    img: 'img/sihirli-kutuphane-kapak.jpg', clean: 'img/sihirli-kutuphane-temiz.jpg', alt: 'Zeynep ve Sihirli Kütüphane kapağı: parlayan bir kitap tutan kız ve kedi',
    desc: 'Yağmurlu bir öğleden sonra, okul kütüphanesinde tozlu bir kitap açılır ve kahramanımız kendini sonları kaybolmuş masalların içinde bulur. Korkan küçük bir şövalye, yalnız bir dev ve yüz yıldır bekleyen bir taş aslan: hepsinin masalı onun yardımını bekliyor. Cesaretin, iyiliğin, dürüstlüğün ve kendine inanmanın masalı.',
    extra: [['img/sihirli-kutuphane-arka.jpg', 'Arka kapak']], spreads: SPREADS_DUA },
  { id: 'deniz-kizi-kralligi', coverTitle: { box: [0, .25], sub: 've Deniz Kızı Krallığı', font: 'script', nameSize: 116, subSize: 24, block: 136, top: 11, glow: 3.5, gold: 1.2 }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Elif', title: 've Deniz Kızı Krallığı',
    img: 'img/deniz-kizi-kralligi-kapak.jpg', clean: 'img/deniz-kizi-kralligi-temiz.jpg', alt: 'Elif ve Deniz Kızı Krallığı kapağı: parlayan deniz kabuğu tutan kız ve deniz kızı',
    desc: 'Bir yaz sabahı kumsalda bulunan deniz kabuğu kulağa bir şarkı fısıldar ve kahramanımız kendini dalgaların altında bulur. Küçük deniz kızı Mira, yan yan yürüyen yengeç ve bilge kaplumbağayla birlikte, krallığın kaybolan üç incisini aramak için denizin derinliklerine yolculuk başlar. Dostluğun ve cesaretin parıl parıl bir deniz masalı.',
    extra: [['img/deniz-kizi-kralligi-arka.jpg', 'Arka kapak']], spreads: SPREADS_LAVIN },
  { id: 'dinozorlarin-dogum-gunu', coverTitle: { box: [0, .23], sub: 've Dinozorların Doğum Günü', font: 'sans', nameSize: 140, subSize: 31, block: 190, top: 14 }, aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Kerem', title: 've Dinozorların Doğum Günü',
    img: 'img/dinozorlarin-dogum-gunu-kapak.jpg', clean: 'img/dinozorlarin-dogum-gunu-temiz.jpg', alt: 'Kerem ve Dinozorların Doğum Günü kapağı: pasta tutan çocuk ve yavru dinozorlar',
    desc: 'Bir akşam dinozor kitabının sayfasındaki küçük dinozor göz kırpar ve kahramanımız kendini yemyeşil bir ormanda bulur. Koca Dede yüz yaşına giriyor; Fıstık, Rüzgâr ve Minik ile birlikte ona sürpriz bir parti hazırlanır. Paylaşınca büyüyen mutluluğun masalı.',
    extra: [['img/dinozorlarin-dogum-gunu-arka.jpg', 'Arka kapak']], spreads: SPREADS_DINO },
  { id: 'kayip-ay-isigi', coverTitle: { box: [0, .17], sub: 've Kayıp Ay Işığı', font: 'sans', nameSize: 122, subSize: 40, block: 165, top: 12, fx: .87 }, aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Ege', title: 've Kayıp Ay Işığı',
    img: 'img/kayip-ay-isigi-kapak.jpg', clean: 'img/kayip-ay-isigi-temiz.jpg', alt: 'Ege ve Kayıp Ay Işığı kapağı: astronot kıyafetli çocuk, gülümseyen Ay ve küçük yıldız',
    desc: 'Bir gece Ay kaybolur ve dünyanın her yerinde çocuklar korkulu rüyalar görmeye başlar. Penceredeki oyuncak roket gerçek bir uzay gemisine dönüşünce kahramanımız, küçük bir yıldızla birlikte Ay’ın karanlık tarafına cesur bir yolculuğa çıkar. Cesaretin, iyiliğin ve kendine inanmanın masalı.',
    extra: [['img/kayip-ay-isigi-arka.jpg', 'Arka kapak']], spreads: SPREADS_AY },
  { id: 'buyuk-yaris', coverTitle: { box: [0, .26], sub: 've Büyük Yarış', font: 'sans', nameSize: 123, subSize: 43, block: 180, top: 13, fx: .87 }, aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Poyraz', title: 've Büyük Yarış',
    img: 'img/buyuk-yaris-kapak.jpg', clean: 'img/buyuk-yaris-temiz.jpg', alt: 'Poyraz ve Büyük Yarış kapağı: yarış tulumlu çocuk, kırmızı spor araba ve start çizgisindeki robotlar',
    desc: 'Bir akşam raftaki oyuncak kırmızı araba vınlar, farları yanıp söner ve kocaman, gerçek bir spor arabaya dönüşür. Kahramanımız, neon ışıklı bir şehirde robotlarla Büyük Yarış’a katılır. Ama bu yarışta en hızlı olmak yetmez: Kıvılcım’ın altın turbosu yalnızca iyiliklerle dolar. İyiliğin, dostluğun ve cesaretin masalı.',
    extra: [['img/buyuk-yaris-arka.jpg', 'Arka kapak']], spreads: SPREADS_YARIS },
  { id: 'denizi-kurtariyor', coverTitle: { box: [0, .23], sub: 'Denizi Kurtarıyor', font: 'sans', nameSize: 125, subSize: 41, block: 170, top: 13, fx: .87 }, aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Mert', title: 'Denizi Kurtarıyor',
    img: 'img/denizi-kurtariyor-kapak.jpg', clean: 'img/denizi-kurtariyor-temiz.jpg', alt: 'Mert Denizi Kurtarıyor kapağı: sarı denizaltının lombozundan sarkan çocuk yavru balinaya sarılıyor',
    desc: 'Bir akşam raftaki oyuncak sarı denizaltı mavi mavi parlar ve büyür. Kahramanımız denizin altında, evinin yolunu kaybetmiş yavru balina Köpük’ü bulur. Ama Köpük’ün evi Mavi Koy çöple dolmuştur. Birlikte temizlerlerse anne balina yavrusunu bulabilir mi? Doğayı korumanın, iyiliğin ve dostluğun masalı.',
    extra: [['img/denizi-kurtariyor-arka.jpg', 'Arka kapak']], spreads: SPREADS_BALINA },
  { id: 'kaybolan-minik-aslan', coverTitle: { box: [0, .22], sub: 've Kaybolan Minik Aslan', font: 'sans', nameSize: 124, subSize: 34, block: 168, top: 12.4, fx: .87 }, aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Emir', title: 've Kaybolan Minik Aslan',
    img: 'img/kaybolan-minik-aslan-kapak.jpg', clean: 'img/kaybolan-minik-aslan-temiz.jpg', alt: 'Emir ve Kaybolan Minik Aslan kapağı: futbol kalesinin önünde topuyla oturan çocuk ve yanağını ona yaslayan minik aslan',
    desc: 'Bütün gece süren fırtınanın sabahında kahramanımız, top sepetinde ağlayan minik bir aslan bulur. Akşam aslancığın takımının büyük maçı vardır, ama köyü çok uzaktadır. Gelincik yollarından, mısır tarlalarından ve rüzgârlı tepelerden geçen bir yolculuk: arkadaşını asla yarı yolda bırakmamanın masalı.',
    extra: [['img/kaybolan-minik-aslan-arka.jpg', 'Arka kapak']], spreads: SPREADS_ASLAN },

  { id: 'deniz-kizi-kralligi-boyama', book: 'deniz-kizi-kralligi', coverTitle: { box: [0, .215], sub: 've Deniz Kızı Krallığı' }, aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Elif', title: 've Deniz Kızı Krallığı',
    img: 'img/deniz-kizi-kralligi-boyama-kapak.jpg', alt: 'Elif ve Deniz Kızı Krallığı boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 8 boyama sayfası ve 7 etkinlik: dalgalar, labirent, sayma, eşini bulma, farklı olanı bulma, noktaları birleştirme ve kendi resmin.',
    extra: [['img/deniz-kizi-kralligi-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/deniz-kizi-kralligi-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_LAVIN },
  { id: 'sihirli-kutuphane-boyama', book: 'sihirli-kutuphane', coverTitle: { box: [.015, .235], sub: 've Sihirli Kütüphane' }, aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Zeynep', title: 've Sihirli Kütüphane',
    img: 'img/sihirli-kutuphane-boyama-kapak.jpg', alt: 'Zeynep ve Sihirli Kütüphane boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 7 boyama sayfası ve 7 etkinlik: şifreli mesaj, kelime avı, harfli labirent, bilmeceler, sihirli kareler, masal bulmacası ve kendi masalını yazacağın bir sayfa.',
    extra: [['img/sihirli-kutuphane-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/sihirli-kutuphane-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_DUA },
  { id: 'buz-satosunun-sirri-boyama', book: 'buz-satosunun-sirri', coverTitle: { box: [0, .29], sub: 've Buz Şatosunun Sırrı' }, aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Asya', title: 've Buz Şatosunun Sırrı',
    img: 'img/buz-satosunun-sirri-boyama-kapak.jpg', alt: 'Asya ve Buz Şatosunun Sırrı boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 7 boyama sayfası ve 7 etkinlik: şifreli mesaj, kelime avı, harfli labirent, bilmeceler, sihirli kareler, masal bulmacası ve kendi masalını yazacağın bir sayfa.',
    extra: [['img/buz-satosunun-sirri-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/buz-satosunun-sirri-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_BUZ },
  { id: 'minik-pandalar-boyama', book: 'minik-pandalar', coverTitle: { box: [0, .27], sub: 've Minik Pandalar' }, aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Ela', title: 've Minik Pandalar',
    img: 'img/minik-pandalar-boyama-kapak.jpg', alt: 'Ela ve Minik Pandalar boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 8 boyama sayfası ve 7 etkinlik: yollar, labirent, sayma, eşini bulma, farklı olanı bulma, noktaları birleştirme ve kendi resmin.',
    extra: [['img/minik-pandalar-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/minik-pandalar-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_PANDA },
  { id: 'dinozorlarin-dogum-gunu-boyama', book: 'dinozorlarin-dogum-gunu', coverTitle: { box: [0, .215], sub: 've Dinozorların Doğum Günü' }, aud: 'erkek', type: 'boyama', status: 'hazir', hero: 'Kerem', title: 've Dinozorların Doğum Günü',
    img: 'img/dinozorlarin-dogum-gunu-boyama-kapak.jpg', alt: 'Kerem ve Dinozorların Doğum Günü boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 8 boyama sayfası ve 7 etkinlik: yollar, labirent, sayma, eşini bulma, farklı olanı bulma, noktaları birleştirme ve kendi resmin.',
    extra: [['img/dinozorlarin-dogum-gunu-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/dinozorlarin-dogum-gunu-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_DINO }
];

const GIFT_SVG = '<svg viewBox="0 0 64 64"><rect x="10" y="26" width="44" height="30" rx="2" fill="#6b1d2a" stroke="#e2b56b" stroke-width="1.2"/><rect x="7" y="19" width="50" height="9" rx="1.5" fill="#7d2534" stroke="#e2b56b" stroke-width="1.2"/><rect x="29" y="19" width="6" height="37" fill="#e2b56b"/><path d="M32 19c-6-9-15-8-13-2 1 3 7 3 13 2zM32 19c6-9 15-8 13-2-1 3-7 3-13 2z" fill="none" stroke="#e2b56b" stroke-width="1.6"/><circle cx="32" cy="40" r="6" fill="#8d2e3d" stroke="#f4dfb3" stroke-width="1"/><path d="M32 43.4c-1.9-1.6-3.3-2.7-3.3-4a1.7 1.7 0 0 1 3.3-.6 1.7 1.7 0 0 1 3.3.6c0 1.3-1.4 2.4-3.3 4z" fill="#f4dfb3"/></svg>';
const CART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
const ARCH_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M3 26 V52 C15 49 26 50 32 55 C38 50 49 49 61 52 V26 Z" fill="var(--gold, #e2b56b)" opacity=".6"/><path d="M6 23 V48 C15 45 26 46 32 51 C38 46 49 45 58 48 V23 Z" fill="var(--gold-pale, #f4dfb3)" stroke="var(--ink, #160a0c)" stroke-width="1.2"/><path d="M32 26 C26 12 9 11 8 23 C8 33 22 40 32 49 C42 40 56 33 56 23 C55 11 38 12 32 26 Z" fill="var(--gold, #e2b56b)" stroke="var(--ink, #160a0c)" stroke-width="1.6" stroke-linejoin="round"/><path d="M32 26 V48 M14 22 C18 20 23 21 27 24 M14 27.5 C18 25.5 23 26.5 27 29.5 M50 22 C46 20 41 21 37 24 M50 27.5 C46 25.5 41 26.5 37 29.5" fill="none" stroke="var(--ink, #160a0c)" stroke-width="1.4" stroke-linecap="round"/></svg>';   // the Masaliya mark: an open book whose pages make a heart

const NAV = [
  ['urunler.html', 'Ürünlerimiz'],
  ['nasil.html', 'Nasıl Hazırlanır'],
  ['siparis.html', 'Sipariş Takibi']
];
const NAV_ALL = [...NAV, ['gizlilik.html', 'Gizlilik'], ['sss.html', 'SSS']];
// pages that count as "Ürünlerimiz" in the menu
const IN_PRODUCTS = ['urunler.html', 'kizlar.html', 'erkekler.html', 'yetiskinler.html', 'urun.html'];
const isCurrent = (h, cur) => h === cur || (h === 'urunler.html' && IN_PRODUCTS.includes(cur));
const WA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/><path d="M9 8.6c.3 2.6 2.4 4.9 5.2 5.6l1-1.1 1.7.8-.4 1.6c-3.8.2-7.5-3.4-7.6-7.4l1.6-.4.8 1.7z" fill="currentColor" stroke="none"/></svg>';
function waLink(text) { return WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text || 'Merhaba Masaliya, bilgi almak istiyorum.')}` : '#whatsapp'; }

const thumb = src => src.replace('img/', 'img/t/');
// phones get the medium copy of a page (img/m/); zooming in always shows the full size
const pageSrc = src => matchMedia('(max-width: 760px)').matches ? src.replace('img/', 'img/m/') : src;
const fmt = n => n.toLocaleString('tr-TR') + ' TL';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s ? s.split(' ').map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join(' ') : s;
const here = () => location.pathname.split('/').pop() || 'index.html';

function fullTitle(p, name) {
  if (!p.hero) return esc(p.title);
  return `<span class="ad">${esc(cap(name) || p.hero)}</span> ${esc(p.title)}`;
}
function priceLine(p) {
  if (p.status !== 'hazir') return 'Yakında';
  if (p.book) return 'Yalnızca masal kitabıyla, Masal Seti içinde';
  const pr = PRICES[p.type];
  if (p.type === 'kitap' && pr && pr.hard) return `Sert Kapak ${fmt(pr.hard)}${pr.digital ? ` · Dijital ${fmt(pr.digital)}` : ''}`;
  const known = pr ? Object.values(pr).filter(Boolean) : [];
  return known.length ? fmt(Math.min(...known)) : 'Fiyat yakında';
}

/* ---------- Gold paper-cut heroes: girls, boys, adults (home page 3D scene, Ürünlerimiz page) ---------- */
// the heroes on the home page and on Ürünlerimiz, without hidden collections
const shownHeroes = () => HEROES.filter(h => !(h.aud && AUDIENCES[h.aud].hidden));
const HEROES = [
  { href: 'kizlar.html', jewel: ['#7d3442', '#521a26', '#24090f'], parts: [
    ['c', 60, 31, 7.5], ['p', 'M66 27 l-5 -3.5 v7z M66 27 l5 -3.5 v7z'], ['c', 60, 47, 14],
    ['p', 'M46 44 q-5 18 3 28 q3 -8 5 -18z M74 44 q5 18 -3 28 q-3 -8 -5 -18z'], ['r', 56, 58, 8, 8],
    ['p', 'M47 66 h26 l16 58 q-29 8 -58 0z'], ['p', 'M48 70 q-10 14 -12 30 l5 1 q4 -14 11 -24z'], ['p', 'M72 70 l18 -16 4 4 -16 18z'],
    ['s', 'M91 55 l7 -17', 2.4], ['p', 'M99 30 l2.4 5.6 6 .6 -4.6 4 1.4 6 -5.2 -3.2 -5.2 3.2 1.4 -6 -4.6 -4 6 -.6z'],
    ['r', 51, 124, 6, 18], ['r', 63, 124, 6, 18], ['e', 53, 143, 6, 3], ['e', 67, 143, 6, 3]] },
  { href: 'erkekler.html', jewel: ['#3c4a73', '#232c4d', '#0d1020'], parts: [
    ['p', 'M49 66 q-22 26 -30 66 q18 -6 40 -8z'], ['c', 60, 46, 14],
    ['p', 'M45 42 q2 -14 16 -15 q4 -6 9 -2 q-1 3 -3 4 q8 3 8 13 q-6 -6 -14 -6 q-8 0 -16 6z'], ['r', 56, 57, 8, 8],
    ['p', 'M47 65 h26 l3 50 h-32z'], ['p', 'M44 112 h32 v5 h-32z'], ['p', 'M48 70 q-8 14 -8 30 l5 0 q1 -14 8 -24z'],
    ['p', 'M72 70 l16 -12 4 4 -15 15z'], ['s', 'M89 59 l14 -30', 3.2], ['p', 'M84 56 l12 6 -1.6 3 -12 -6z'],
    ['r', 50, 117, 7, 25], ['r', 63, 117, 7, 25], ['e', 52, 143, 6.5, 3], ['e', 68, 143, 6.5, 3]] },
  { href: 'yetiskinler.html', aud: 'yetiskin', jewel: ['#3a6458', '#1f3f37', '#0a1a17'], parts: [
    // a family: two grown-ups with a child between them, hand in hand, a star above
    ['p', 'M61 18 l2.4 5.6 6 .6 -4.6 4 1.4 6 -5.2 -3.2 -5.2 3.2 1.4 -6 -4.6 -4 6 -.6z'],
    ['c', 33, 37, 4.5], ['c', 33, 50, 10], ['p', 'M23 48 q-4 14 3 22 q2 -8 3 -14z M43 48 q4 14 -3 22 q-2 -8 -3 -14z'], ['r', 30.5, 59, 5, 6],
    ['p', 'M24 65 h18 l10 60 q-19 6 -38 0z'], ['p', 'M25 70 q-7 13 -7 26 l4 0 q1 -11 7 -20z'],
    ['p', 'M41 69 l12 33 -4 2 -12 -32z'],
    ['r', 29, 125, 4, 16], ['r', 36, 125, 4, 16], ['e', 31, 142, 4.5, 2.5], ['e', 39, 142, 4.5, 2.5],
    ['c', 89, 48, 11], ['p', 'M78 46 q0 -13 11 -13 q11 0 11 12 q-5 -5 -11 -5 q-6 0 -11 6z'], ['r', 86, 58, 6, 6],
    ['p', 'M76 64 h26 l2 50 h-30z'], ['p', 'M101 69 q7 13 6 28 l-5 0 q0 -13 -5 -22z'],
    ['p', 'M77 69 l-7 34 4 1 8 -33z'],
    ['r', 79, 114, 8, 28], ['r', 91, 114, 8, 28], ['e', 82, 143, 6.5, 3], ['e', 96, 143, 6.5, 3],
    ['c', 61, 92, 8], ['p', 'M53 89 q1 -10 8 -10 q8 0 8 9 q-4 -3 -8 -3 q-4 0 -8 4z'],
    ['p', 'M54 101 h14 l5 26 h-24z'], ['p', 'M55 104 l-6 2 1 3 6 -2z M67 104 l6 2 -1 3 -6 -2z'],
    ['r', 56, 127, 4, 14], ['r', 62, 127, 4, 14], ['e', 58, 142, 4, 2.3], ['e', 64, 142, 4, 2.3]] }
];
function drawHeroCard(h, W = 512, H = 704) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), m = 14, R = (W - 2 * m) / 2;
  const arch = new Path2D(); arch.moveTo(m, H - m); arch.lineTo(m, m + R); arch.arc(W / 2, m + R, R, Math.PI, 0); arch.lineTo(W - m, H - m); arch.closePath();
  x.save(); x.clip(arch);
  const g = x.createRadialGradient(W / 2, H * .42, 10, W / 2, H * .45, H * .7);
  g.addColorStop(0, h.jewel[0]); g.addColorStop(.45, h.jewel[1]); g.addColorStop(1, h.jewel[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // velvet nap: fine dark and light fibres, a few faint stars
  for (let i = 0; i < 2600; i++) { x.fillStyle = r() < .5 ? 'rgba(255,240,220,.025)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1); }
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(240,215,170,${.15 + r() * .3})`; x.beginPath(); x.arc(r() * W, r() * H * .6, .5 + r() * 1.1, 0, 6.283); x.fill(); }
  const vign = x.createRadialGradient(W / 2, H * .5, W * .2, W / 2, H * .5, H * .75);
  vign.addColorStop(0, 'rgba(0,0,0,0)'); vign.addColorStop(1, 'rgba(0,0,0,.45)');
  x.fillStyle = vign; x.fillRect(0, 0, W, H);
  // the figure in gold
  const k = 3.15, ox = W / 2 - 60 * k, oy = H - m - 160 * k - 18;
  x.translate(ox, oy); x.scale(k, k);
  const gold = x.createLinearGradient(0, 10, 0, 150); gold.addColorStop(0, '#f1dcae'); gold.addColorStop(.5, '#d4a960'); gold.addColorStop(1, '#a1742f');
  x.fillStyle = gold; x.strokeStyle = gold; x.lineCap = 'round';
  x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 3; x.shadowOffsetY = 1.5;   // pressed foil, not a glow
  for (const p of h.parts) {
    if (p[0] === 'c') { x.beginPath(); x.arc(p[1], p[2], p[3], 0, 6.283); x.fill(); }
    else if (p[0] === 'e') { x.beginPath(); x.ellipse(p[1], p[2], p[3], p[4], 0, 0, 6.283); x.fill(); }
    else if (p[0] === 'r') { x.fillRect(p[1], p[2], p[3], p[4]); }
    else if (p[0] === 's') { x.lineWidth = p[2]; x.stroke(new Path2D(p[1])); }
    else x.fill(new Path2D(p[1]));
  }
  x.restore();
  // double gold frame
  x.strokeStyle = '#cfa461'; x.lineWidth = 4; x.stroke(arch);
  const inner = new Path2D(); const m2 = m + 16, R2 = (W - 2 * m2) / 2;
  inner.moveTo(m2, H - m2); inner.lineTo(m2, m2 + R2); inner.arc(W / 2, m2 + R2, R2, Math.PI, 0); inner.lineTo(W - m2, H - m2); inner.closePath();
  x.lineWidth = 1.5; x.strokeStyle = 'rgba(207,164,97,.55)'; x.stroke(inner);
  return c;
}


/* ---------- Which product this page shows ----------
   Each product has its own page (e.g. dua.html, built by tools/build-pages.js) that names it in
   <body data-product>. The old urun.html#id addresses still work and forward to the new page. */
const productId = () => document.body.dataset.product || location.hash.slice(1);
// addresses used before products were named after their stories
const OLD_IDS = { dua: 'sihirli-kutuphane', lavin: 'deniz-kizi-kralligi', 'boyama-lavin': 'deniz-kizi-kralligi-boyama', 'boyama-dua': 'sihirli-kutuphane-boyama' };
const currentProduct = () => { const id = productId(); return PRODUCTS.find(x => x.id === (OLD_IDS[id] || id)); };
const productHref = p => `${p.id}.html`;

/* ---------- Back button target ---------- */
function backHref() {
  if (document.body.dataset.page === 'urun') {
    const p = currentProduct() || PRODUCTS[0];
    return `${AUDIENCES[p.aud].page}#${p.aud === 'yetiskin' ? p.occ : TYPES[p.type].tab}`;
  }
  if (AUDIENCES[document.body.dataset.page]) return 'urunler.html';   // a collection: back to the three choices
  return './#sec';   // home, with the book already open on the three collections
}

/* ---------- Header, menu, footer ---------- */
function renderChrome() {
  const cur = here();
  const head = document.getElementById('site-head');
  if (head) {
    head.className = 'site-head';
    head.innerHTML = `<div class="wrap">
      <div class="head-left">
        <a class="back" id="back" href="${backHref()}"><span aria-hidden="true">←</span> Geri dön</a>
        <a class="brand" href="./" aria-label="Masaliya ana sayfa">${ARCH_SVG}<span>MASALİYA</span></a>
      </div>
      <nav class="nav" aria-label="Ana menü">${NAV.map(([h, t]) => `<a href="${h}"${isCurrent(h, cur) ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
      <div class="head-right">
        <a class="cart-link" href="sepet.html" aria-label="Sepetim">${CART_SVG}<span class="cart-count" data-cart-count hidden></span></a>
        <a class="btn head-cta" href="urunler.html">Masalını Seç</a>
        <button class="menu-btn" type="button" data-open-menu>Menü</button>
      </div>
    </div>`;
    // WhatsApp concierge, always at hand on inner pages
    const wa = document.createElement('a');
    wa.className = 'wa'; wa.href = waLink(); wa.target = WHATSAPP ? '_blank' : ''; wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'WhatsApp’tan danışmanınıza yazın'); wa.title = 'WhatsApp’tan danışmanınıza yazın';
    wa.innerHTML = WA_SVG;
    document.body.appendChild(wa);
    let waTick = 0;
    const waPlace = () => {
      waTick = 0;
      const bar = document.getElementById('buybar'), barUp = bar && !bar.classList.contains('away') && getComputedStyle(bar).display !== 'none';
      wa.style.bottom = barUp ? `${bar.offsetHeight + 14}px` : '';
      const r = wa.getBoundingClientRect();
      const hit = [...document.querySelectorAll('.buy-actions, #pay-btn')].some(el => { const b = el.getBoundingClientRect(); return b.height && b.left < r.right + 8 && b.right > r.left - 8 && b.top < r.bottom + 8 && b.bottom > r.top - 8; });
      wa.classList.toggle('wa-off', hit);
    };
    const waSoon = () => { if (!waTick) waTick = requestAnimationFrame(waPlace); };
    addEventListener('scroll', waSoon, { passive: true }); addEventListener('resize', waSoon);
    document.addEventListener('transitionend', e => { if (e.target.id === 'buybar') waSoon(); });
    setTimeout(waPlace, 300);
  }
  document.addEventListener('click', e => {
    const w = e.target.closest('a[href="#whatsapp"]');
    if (!w) return;
    e.preventDefault();
    if (WHATSAPP) { window.open(waLink(), '_blank', 'noopener'); return; }
    let t = document.getElementById('wa-toast');
    if (!t) { t = document.createElement('div'); t.id = 'wa-toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = 'WhatsApp hattımız çok yakında burada olacak.';
    t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 3200);
  });
  // "Geri dön" returns to the page the visitor actually came from on this site
  const back = document.getElementById('back');
  if (back) back.addEventListener('click', e => {
    let fromHere = false;
    try { fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (err) {}
    if (fromHere && history.length > 1) { e.preventDefault(); history.back(); }
  });
  const menu = document.createElement('div');
  menu.className = 'menu'; menu.id = 'menu'; menu.hidden = true;
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Menü');
  const mark = h => (isCurrent(h, cur) && h !== 'urunler.html') || h === cur ? ' aria-current="page"' : '';
  menu.innerHTML = `<button class="btn ghost close" type="button" data-close-menu>Kapat</button>
    <nav><a href="./"${cur === 'index.html' || cur === '' ? ' aria-current="page"' : ''}>Ana Sayfa</a>
      <a href="urunler.html"${mark('urunler.html')}>Ürünlerimiz</a>
      <div class="menu-sub">${Object.values(AUDIENCES).filter(a => !a.hidden).map(a => `<a href="${a.page}"${a.page === cur ? ' aria-current="page"' : ''}>${a.name}</a>`).join('')}</div>
      ${NAV_ALL.slice(1).map(([h, t]) => `<a href="${h}"${mark(h)}>${t}</a>`).join('')}
      <a href="sepet.html"${cur === 'sepet.html' ? ' aria-current="page"' : ''}>Sepetim <span class="cart-count" data-cart-count hidden></span></a></nav>`;
  document.body.appendChild(menu);
  let opener = null;
  const closeMenu = () => { if (menu.hidden) return; menu.hidden = true; document.body.style.overflow = ''; if (opener) opener.focus(); };
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open-menu]');
    if (o) { opener = o; menu.hidden = false; document.body.style.overflow = 'hidden'; menu.querySelector('nav a').focus(); }
    if (e.target.closest('[data-close-menu]') || (e.target.closest('#menu a'))) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'Escape') closeMenu();
    if (e.key === 'Tab') {   // keep keyboard focus inside the open menu
      const f = [...menu.querySelectorAll('a, button')], first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  const foot = document.getElementById('site-foot');
  if (foot) {
    foot.className = 'site-foot';
    foot.innerHTML = `<div class="wrap">
      <a class="brand" href="./">${ARCH_SVG}<span>MASALİYA</span></a>
      <nav aria-label="Alt menü">${[...NAV_ALL, ['mesafeli-satis.html', 'Satış Sözleşmesi'], ['kvkk.html', 'KVKK']].map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
      <a class="foot-wa" href="${waLink()}"${WHATSAPP ? ' target="_blank" rel="noopener"' : ''}>${WA_SVG} WhatsApp’tan özel danışmanınıza yazın</a>
      <p>Kişiye özel masal kitapları · masaliya.com</p>
      <p>© 2026 Masaliya</p>
    </div>`;
  }
}

/* ---------- Product card ---------- */
function card(p, withPrice = false) {
  const visual = `<img src="${p.img}" alt="${esc(p.alt)}" loading="lazy">`;
  const kind = p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one;
  return `<a class="card${p.type === 'kitap' ? ' book' : ''}" href="${productHref(p)}">
    <div class="visual">${p.status === 'yakinda' ? '<span class="badge">Yakında</span>' : ''}${visual}</div>
    <div class="meta"><span>${kind}</span></div>
    <h3>${fullTitle(p)}${p.type !== 'kitap' && p.aud !== 'yetiskin' ? `<small class="t-kind">${TYPES[p.type].one}</small>` : ''}</h3>
    <p>${esc(p.desc)}</p>
    ${withPrice && p.type === 'kitap' && p.status === 'hazir' ? `<span class="card-from">${fmt(Math.min(...Object.values(PRICES.kitap).filter(Boolean)))}’den başlayan</span>` : ''}
    ${p.status === 'hazir' && !p.book ? '<span class="btn card-cta">İncele</span>' : ''}
  </a>`;
}

/* ---------- Collection page (kizlar / erkekler / yetiskinler) ---------- */
function renderCollection(aud) {
  const tabsEl = document.getElementById('tabs'), grid = document.getElementById('grid');
  if (!PRODUCTS.some(p => p.aud === aud && p.status === 'hazir')) {
    tabsEl.hidden = true;
    grid.className = 'waitlist';
    grid.innerHTML = `<div class="panel">
        <p class="eyebrow">Atölyede hazırlanıyor</p>
        <h2>Yetişkinler için masallar çok yakında</h2>
        <p class="lede">Çiftler, büyükanne ve büyükbabalar, bütün aile ve doğum günleri için kişiye özel kitaplar hazırlıyoruz. İlk kitaplar hazır olduğunda size haber verelim.</p>
        <ul class="chips">${Object.values(OCCASIONS).map(o => `<li>${o}</li>`).join('')}</ul>
        <form class="inline-form" id="wait"><label for="wait-email" hidden>E-posta</label><input id="wait-email" type="email" required placeholder="E-posta adresiniz"><button class="btn" type="submit">Haber Ver</button></form>
        <p class="form-note" id="wait-note" aria-live="polite"></p>
      </div>`;
    document.getElementById('wait').addEventListener('submit', e => { e.preventDefault(); document.getElementById('wait-note').textContent = 'Önizleme sürümü: haber listesi site yayına alınırken bağlanacak.'; });
    return;
  }
  const isAdult = aud === 'yetiskin';
  const filters = isAdult
    ? [['hepsi', 'Hepsi'], ...Object.entries(OCCASIONS)]
    : Object.entries(TYPES).filter(([k]) => k !== 'boyama' || SELL.boyama).map(([, t]) => [t.tab, t.name]);
  const items = PRODUCTS.filter(p => p.aud === aud && onSale(p));
  if (!isAdult && PRICES.kitap.hard && !document.getElementById('price-note')) {
    const pn = document.createElement('p'); pn.id = 'price-note'; pn.className = 'price-note';
    pn.innerHTML = `<span>Sert Kapak <b>${fmt(PRICES.kitap.hard)}</b></span><span>Dijital <b>${fmt(PRICES.kitap.digital)}</b></span><span>Ücretsiz kargo</span>`;
    tabsEl.after(pn);
    // the campaign, large, right under the collection's title
    if (pairOn()) { const dl = document.createElement('p'); dl.className = 'deal-banner'; dl.innerHTML = `<b>İkinci kitapta ${fmt(PAIR_DEAL.off)} indirim</b><span>2 sert kapak kitap birlikte <em>${fmt(2 * PRICES.kitap.hard - PAIR_DEAL.off)}</em> · ${PAIR_DEAL.untilText}’a kadar</span>`; tabsEl.before(dl); }
  }
  function show() {
    let key = location.hash.slice(1);
    if (!filters.some(([k]) => k === key)) key = filters[0][0];
    tabsEl.innerHTML = filters.map(([k, t]) => `<a class="tab" href="#${k}" aria-current="${k === key}">${t}</a>`).join('');
    const list = isAdult
      ? items.filter(p => key === 'hepsi' || p.occ === key)
      : items.filter(p => TYPES[p.type].tab === key);
    grid.className = `grid${list.length === 1 ? ' n1' : list.length === 2 ? ' n2' : ''}`;
    grid.innerHTML = list.length ? list.map(p => card(p)).join('') : '<p class="empty">Bu bölüm için yeni ürünler hazırlanıyor.</p>';
  }
  addEventListener('hashchange', show);
  show();
}

/* ---------- Cart page ---------- */
const ILLER = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];
const DRAFT_KEY = 'masaliya-teslimat', FIELDS = ['c-name', 'c-il', 'c-ilce', 'c-adres', 'c-posta', 'c-phone', 'c-email'];

function renderCart() {
  const root = document.getElementById('cart');
  if (!root) return;
  let draft = {};
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch (e) {}
  function show(msg) {
    const items = cart.all();
    if (!items.length) {
      root.innerHTML = `<div class="panel cart-empty"><p class="lede">Sepetiniz boş.</p><a class="btn" href="urunler.html">Masalını seç</a></div>`;
      return;
    }
    const off = pairOff(items), total = items.reduce((a, it) => a + it.price.total, 0) - off;
    const ships = items.some(it => it.cover !== 'digital');
    const hardN = items.filter(it => it.cover === 'hard').length;
    // the campaign: what was taken off, or how to get it with one more book
    const deal = !pairOn() ? '' : off
      ? `<div class="deal-line"><span>2 kitap indirimi <small>İkinci sert kapak kitapta ${fmt(PAIR_DEAL.off)} · ${PAIR_DEAL.untilText}’a kadar</small></span><strong>−${fmt(off)}</strong></div>`
      : hardN % 2 === 1 ? `<p class="deal-hint">Bir sert kapak kitap daha ekleyin: ikinci kitapta <b>${fmt(PAIR_DEAL.off)} indirim</b>, ikisi birlikte ${fmt(2 * PRICES.kitap.hard - PAIR_DEAL.off)}. <a href="urunler.html">Kitapları gör</a></p>` : '';
    root.innerHTML = `<div class="cart-grid">
      <ul class="cart-items">${items.map(it => `<li>
        <img src="${thumb(it.img)}" alt="">
        <div><b>${esc(it.title)}</b><small>${esc(it.setName)} · ${esc(it.contents)}${it.giftBox ? ' · hediye kutusu' : ''}</small>
          <button type="button" class="cart-remove" data-remove="${it.id}" aria-label="${esc(it.title)} sepetten çıkar"><span aria-hidden="true">✕</span> Sepetten çıkar</button></div>
        <span class="cart-price">${fmt(it.price.total)}</span></li>`).join('')}
      </ul>
      <form class="panel cart-pay" id="pay">
        ${deal}
        <div class="total"><span>Toplam <small>${items.length} kitap · Kargo ücretsiz · Yalnızca Türkiye içine gönderim</small></span><strong>${fmt(total)}</strong></div>
        ${ships ? ETA() : ''}
        ${ships ? `<span class="step">Teslimat adresi</span>
        <label class="field" for="c-name">Alıcının adı soyadı<input id="c-name" autocomplete="shipping name" maxlength="80"></label>
        <div class="field-row">
          <label class="field" for="c-il">İl<input id="c-il" list="iller" autocomplete="shipping address-level1" maxlength="40"></label>
          <label class="field" for="c-ilce">İlçe<input id="c-ilce" autocomplete="shipping address-level2" maxlength="40"></label>
        </div>
        <datalist id="iller">${ILLER.map(i => `<option value="${i}">`).join('')}</datalist>
        <label class="field" for="c-adres">Açık adres<textarea id="c-adres" rows="3" autocomplete="shipping street-address" maxlength="300" placeholder="Mahalle, sokak, bina ve daire numarası"></textarea></label>
        <label class="field" for="c-posta">Posta kodu (isteğe bağlı)<input id="c-posta" inputmode="numeric" autocomplete="shipping postal-code" maxlength="5"></label>` : `<span class="step">Ad soyad</span>
        <label class="field" for="c-name">Adınız soyadınız<input id="c-name" autocomplete="name" maxlength="80"></label>`}
        <span class="step">İletişim</span>
        <label class="field" for="c-phone">Telefon<input id="c-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx"></label>
        <label class="field" for="c-email">E-posta<input id="c-email" type="email" autocomplete="email" placeholder="ornek@mail.com"></label>
        <label class="consent" for="ok-terms"><input type="checkbox" id="ok-terms"><span><a href="mesafeli-satis.html" target="_blank">Ön Bilgilendirme Formu</a>’nu ve <a href="mesafeli-satis.html#sozlesme" target="_blank">Mesafeli Satış Sözleşmesi</a>’ni okudum, onaylıyorum.</span></label>
        <button class="btn" type="submit" id="pay-btn">Ödemeye geç</button>
        <div class="secure-pay">
          <span class="cards" aria-label="Visa, Mastercard, Apple Pay, Google Pay">${CARD_MARKS}</span>
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4.5" y="10" width="15" height="11" rx="2" fill="currentColor"/></svg>Stripe ile güvenli ödeme · 3D Secure · Kart bilgileriniz bizde saklanmaz · Ödeme Türk lirası ile alınır</span>
        </div>
        <p class="form-note" id="pay-note" aria-live="polite">${msg || ''}</p>
        <a class="link" href="urunler.html">+ Başka bir masal ekle</a>
      </form>
    </div>`;
    const form = document.getElementById('pay');
    FIELDS.forEach(k => { const el = document.getElementById(k); if (el && draft[k]) el.value = draft[k]; });
    form.addEventListener('input', e => { if (FIELDS.includes(e.target.id)) { draft[e.target.id] = e.target.value; try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (err) {} } });
    root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { cart.remove(b.dataset.remove); show(); }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const note = document.getElementById('pay-note'), btn = document.getElementById('pay-btn');
      const rawPhone = document.getElementById('c-phone').value.trim(), phone = rawPhone.replace(/\D/g, '');
      const mail = document.getElementById('c-email').value.trim();
      const say = (t, focus) => { note.textContent = t; if (focus) focus.focus(); };
      const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const name = val('c-name'), address = ships ? { il: val('c-il'), ilce: val('c-ilce'), adres: val('c-adres'), posta: val('c-posta') } : null;
      if (name.length < 3 || !/\s/.test(name)) return say(ships ? 'Lütfen alıcının adını ve soyadını yazın.' : 'Lütfen adınızı ve soyadınızı yazın.', document.getElementById('c-name'));
      if (ships) {
        if (address.il.length < 3) return say('Lütfen ili yazın.', document.getElementById('c-il'));
        if (address.ilce.length < 2) return say('Lütfen ilçeyi yazın.', document.getElementById('c-ilce'));
        if (address.adres.length < 10) return say('Lütfen açık adresi mahalle, sokak, bina ve daire numarasıyla yazın.', document.getElementById('c-adres'));
        if (address.posta && !/^\d{5}$/.test(address.posta)) return say('Posta kodu 5 rakamdan oluşur. Bilmiyorsanız boş bırakabilirsiniz.', document.getElementById('c-posta'));
      }
      // Turkish numbers in any common form (0532…, +90 532…, 0090 532…, with dots, dashes or brackets) become 0532 123 45 67
      const tr = phone.replace(/^(?:00)?90(?=0?\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      const cleanPhone = tr.length === 10 ? `0${tr.slice(0, 3)} ${tr.slice(3, 6)} ${tr.slice(6, 8)} ${tr.slice(8)}` : /^\s*(\+|00)/.test(rawPhone) && phone.length >= 10 && phone.length <= 15 ? '+' + phone.replace(/^00/, '') : '';
      if (!/^[\d\s().+\-\u00a0]+$/.test(rawPhone) || !cleanPhone) return say('Lütfen telefon numaranızı yalnızca rakamlarla yazın, örneğin 0532 123 45 67.', document.getElementById('c-phone'));
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return say('Lütfen geçerli bir e-posta adresi yazın.', document.getElementById('c-email'));
      if (!document.getElementById('ok-terms').checked) return say('Devam etmek için Ön Bilgilendirme Formu’nu ve Mesafeli Satış Sözleşmesi’ni onaylayın.', document.getElementById('ok-terms'));
      btn.disabled = true; say('Ödeme sayfası hazırlanıyor…');
      try {
        const res = await fetch(ORDER_API + '/api/order', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: items.map(it => it.id), name, address, phone: cleanPhone, email: mail, consentTerms: true }) });
        const out = await res.json().catch(() => ({}));
        if (res.status === 409 && out.missing) { out.missing.forEach(id => cart.remove(id)); show(out.error); return; }
        if (!res.ok || !out.url) throw new Error(out.error || 'Sipariş oluşturulamadı.');
        location.href = out.url;
      } catch (err) {
        btn.disabled = false; say(`${err.message} Lütfen tekrar deneyin; sorun sürerse bize yazın.`);
      }
    });
  }
  show(new URLSearchParams(location.search).get('odeme') === 'iptal' ? 'Ödeme tamamlanmadı. Kitaplarınız sepette duruyor; istediğiniz zaman tekrar deneyebilirsiniz.' : '');
  if (location.hash === '#odeme') { const f = document.getElementById('pay'); if (f) { f.scrollIntoView({ block: 'center' }); document.getElementById('c-phone').focus({ preventScroll: true }); } }
}

/* ---------- Product page helpers ---------- */
const trDate = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
// n working days from today, skipping Saturdays and Sundays
const inWorkDays = n => { const d = new Date(); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return d; };
// printed book at the door: 3 working days design + 5 printing, then 2–4 calendar days with the courier
const etaRange = () => {
  const ship = inWorkDays(8), a = new Date(ship), b = new Date(ship);
  a.setDate(a.getDate() + 2); b.setDate(b.getDate() + 4);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${trDate(b)}` : `${trDate(a)} – ${trDate(b)}`;
};
const ETA = () => `<p class="eta">Sert kapak tahmini teslim: <b>${etaRange()}</b><small>Kargo süresi ortalama 2–4 gün · tarih, önizlemeyi onayladığınız güne göre değişebilir</small></p>`;

// a cover with the visitor's name set in place of the sample hero's name
const COVER_FONTS = { sans: '"Nunito", "Arial Rounded MT Bold", sans-serif', script: '"Great Vibes", "Snell Roundhand", cursive', sub: '"Lora", Georgia, serif' };
// the lettering of the printed covers, redrawn with the visitor's name: same fonts, sizes, colours, glow and place
function drawCoverName(canvas, img, p, name) {
  const W = img.naturalWidth, H = img.naturalHeight, ct = p.coverTitle, [y0, y1] = ct.box;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.drawImage(img, 0, 0, W, H);
  if (!img.dataset.clean) {
    // no clean cover: soften the painted title away first
    c.save(); c.beginPath(); c.rect(0, y0 * H, W, (y1 - y0) * H); c.clip();
    c.filter = 'blur(22px)'; c.drawImage(img, -40, -40, W + 80, H + 80); c.filter = 'none';
    const fade = c.createLinearGradient(0, y0 * H, 0, y1 * H);
    fade.addColorStop(0, 'rgba(20,10,8,.10)'); fade.addColorStop(.5, 'rgba(20,10,8,.22)'); fade.addColorStop(1, 'rgba(20,10,8,.06)');
    c.fillStyle = fade; c.fillRect(0, y0 * H, W, (y1 - y0) * H);
    c.restore();
  }
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (ct.font === 'sans' || ct.font === 'script') {
    const mm = W / 213.9, pt = .3528 * mm, block = ct.block * mm;
    const nameFont = s => ct.font === 'sans' ? `900 ${s}px ${COVER_FONTS.sans}` : `400 ${s}px ${COVER_FONTS.script}`;
    const subFont = s => ct.font === 'sans' ? `900 ${s}px ${COVER_FONTS.sans}` : `italic 600 ${s}px ${COVER_FONTS.sub}`;
    // the size shrinks only when the text is wider than its block
    const fitTo = (font, size, text) => { c.font = font(size); const w = c.measureText(text).width; if (w > block) { size *= block / w; c.font = font(size); } return c.measureText(text); };
    const nm = fitTo(nameFont, ct.nameSize * pt, name), nameFontNow = c.font;
    const sm = fitTo(subFont, ct.subSize * pt, ct.sub), subFontNow = c.font;
    const nameBase = ct.top * mm + nm.actualBoundingBoxAscent;
    const subBase = nameBase + nm.actualBoundingBoxDescent + 1 * mm + sm.actualBoundingBoxAscent;
    const away = W * 4;
    const glow = (color, blur, dy = 0, times = 1) => {
      c.save(); c.fillStyle = '#000'; c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = away; c.shadowOffsetY = dy;
      for (let k = 0; k < times; k++) { c.font = nameFontNow; c.fillText(name, W / 2 - away, nameBase); c.font = subFontNow; c.fillText(ct.sub, W / 2 - away, subBase); }
      c.restore();
    };
    const letters = color => { c.save(); c.fillStyle = color; c.font = nameFontNow; c.fillText(name, W / 2, nameBase); c.font = subFontNow; c.fillText(ct.sub, W / 2, subBase); c.restore(); };
    if (ct.font === 'sans') {
      const f = ct.fx || 1;
      // wide soft dark-brown halo, a shadow below, then near-white letters
      glow('rgba(40,28,18,.7)', 7 * mm * f, 0, 2);
      glow('rgba(50,32,20,.75)', 1.2 * mm * f, 1.7 * mm * f);
      letters('#FFFFFC');
    } else {
      // wide plum glow, a narrow gold halo over it, then warm white letters
      glow('rgba(92,46,110,1)', ct.glow * mm, 0, 3);
      glow('rgba(240,190,70,1)', ct.gold * mm, 0, 2);
      letters('#FFFDF5');
    }
    return;
  }
  const mid = (y0 + (y1 - y0) * .58) * H;
  let size = W * .2;
  c.shadowColor = 'rgba(30,10,4,.55)'; c.shadowBlur = W * .02;
  do { c.font = `italic 500 ${size}px "Cormorant Garamond", Garamond, serif`; size -= 2; } while (c.measureText(name).width > W * .8 && size > W * .07);
  const g = c.createLinearGradient(0, mid - size, 0, mid);
  g.addColorStop(0, '#fff6dc'); g.addColorStop(.6, '#f1d08e'); g.addColorStop(1, '#c9974a');
  c.fillStyle = g; c.fillText(name, W / 2, mid);
  c.font = `italic 500 ${W * .052}px "Cormorant Garamond", Garamond, serif`; c.fillStyle = '#fff2d6';
  c.fillText(ct.sub, W / 2, mid + W * .075);
}

// full-screen page viewer, shared by every product page
function openLightbox(pages, start) {
  let box = document.getElementById('lightbox');
  if (!box) {
    box = document.createElement('div'); box.id = 'lightbox'; box.className = 'lightbox'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Sayfa');
    box.innerHTML = `<img alt=""><button class="lb-close" type="button" aria-label="Kapat">✕</button>
      <button class="lb-prev" type="button" aria-label="Önceki sayfa">←</button><button class="lb-next" type="button" aria-label="Sonraki sayfa">→</button><span class="lb-count"></span>`;
    document.body.appendChild(box);
  }
  let cur = start;
  const img = box.querySelector('img'), count = box.querySelector('.lb-count');
  const go = i => { cur = (i + pages.length) % pages.length; img.src = pages[cur][0]; img.alt = pages[cur][1]; count.textContent = `${cur + 1} / ${pages.length}`; };
  const close = () => { box.hidden = true; document.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') go(cur - 1); if (e.key === 'ArrowRight') go(cur + 1); };
  box.querySelector('.lb-close').onclick = close;
  box.querySelector('.lb-prev').onclick = () => go(cur - 1);
  box.querySelector('.lb-next').onclick = () => go(cur + 1);
  box.onclick = e => { if (e.target === box) close(); };
  swipe(img, () => go(cur + 1), () => go(cur - 1));
  document.addEventListener('keydown', key);
  go(start); box.hidden = false; document.body.style.overflow = 'hidden';
  box.querySelector('.lb-close').focus();
}
function swipe(el, next, prev) {
  let x0 = null;
  el.onpointerdown = e => { x0 = e.clientX; };
  el.onpointerup = e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); el.dataset.swiped = '1'; } };
}

/* ---------- Product page ---------- */
function renderProduct() {
  const root = document.getElementById('product');
  function show() {
    const p = currentProduct();
    if (p && !onSale(p)) { const b = PRODUCTS.find(x => x.id === p.book); location.replace(b && onSale(b) ? productHref(b) : (AUDIENCES[p.aud] || {}).page || 'urunler.html'); return; }
    if (!p) {
      // an address we don't know: say so instead of quietly showing another book
      document.title = 'Bulunamadı · Masaliya';
      root.innerHTML = `<div class="notfound"><p class="eyebrow">Sayfa bulunamadı</p><h1>Bu masal rafta yok</h1><p class="lede">Aradığınız ürün kaldırılmış ya da adresi değişmiş olabilir.</p><a class="btn" href="urunler.html">Ürünlerimize göz atın</a></div>`;
      document.getElementById('related').innerHTML = '';
      return;
    }
    const a = AUDIENCES[p.aud];
    if (!document.body.dataset.product) document.title = `${p.hero ? p.hero + ' ' : ''}${p.title} · Masaliya`;
    const crumbs = document.getElementById('crumbs');
    crumbs.innerHTML = `<a href="${a.page}">${a.name}</a> · ${p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].name}`;

    const shots = p.img ? [[p.img, p.alt], ...(p.extra || [])] : [];
    const gallery = `<div class="gallery"><div class="main"><img id="g-main" src="${shots[0][0]}" alt="${esc(shots[0][1])}"></div>
         ${shots.length > 1 ? `<div class="thumbs">${shots.map((s, i) => `<button type="button" data-shot="${i}" aria-current="${i === 0}" aria-label="${esc(s[1])}"><img src="${thumb(s[0])}" alt=""></button>`).join('')}</div>` : ''}</div>`;

    const pr = PRICES[p.type] || {};
    const formats = FORMATS[p.type] || [];
    const book = p.book && PRODUCTS.find(x => x.id === p.book);
    const orderable = p.status === 'hazir' && !book;
    // options without a price can't be chosen yet; the first priced one starts selected
    const firstPriced = (formats.find(([k]) => pr[k]) || [])[0];
    const singlePrice = formats.length ? null : Object.values(pr).find(Boolean) || null;
    const options = formats.length ? `
        <div class="covers" role="radiogroup" aria-label="Seçenekler" style="--n:${formats.length}">
          ${formats.map(([k, name, note]) => `<label class="cover-opt${pr[k] ? '' : ' off'}"><input type="${p.spreads ? 'checkbox' : 'radio'}" name="cover" value="${k}" data-price="${pr[k] || ''}"${pr[k] ? '' : ' disabled'}${k === firstPriced && !p.spreads ? ' checked' : ''}><b>${name}</b><span>${pr[k] ? fmt(pr[k]) : 'Fiyat yakında'}</span><small>${note}</small></label>`).join('')}
        </div>` : '';
    const coloring = PRODUCTS.find(x => x.book === p.id && onSale(x));
    // the add-ons as "+" choices; together they pick the set (none = the book alone)
    const EXTRAS = { boyama: ['Boyama Kitabı', 'Aynı kahramanla boyama ve etkinlik', coloring && coloring.img], yapboz: ['Ahşap Puzzle Ekle', '35 parça · Kitaptan bir sahne', puzzleImg(p)] };
    const extraParts = Object.keys(EXTRAS).filter(k => SELL[k] && SETS.some(st => st.items.some(([t]) => t === k)));
    const askedParts = ((SETS.find(st => st.id === new URLSearchParams(location.search).get('set')) || {}).items || []).map(([t]) => t);
    const extrasHtml = p.type === 'kitap' && extraParts.length ? `<div class="extras" id="extras">${extraParts.map(k => {
      const f = Object.keys(PRICES[k]).find(x => PRICES[k][x]);
      const pic = EXTRAS[k][2];
      return `<label class="extra-opt"><input type="checkbox" data-part="${k}"${askedParts.includes(k) ? ' checked' : ''}><b class="ex-title">${EXTRAS[k][0]}</b>${pic ? `<span class="ex-pic"><img src="${thumb(pic)}" alt="" loading="lazy"></span>` : ''}<span class="ex-text"><span class="ex-price">+ ${fmt(PRICES[k][f])}</span><small>${EXTRAS[k][1]}</small></span></label>`;
    }).join('')}</div>` : '';
    const askedSet = new URLSearchParams(location.search).get('set');
    const wantSet = SETS.some(st => st.id === askedSet) ? askedSet : SETS[0].id;
    const buy = orderable ? `
      <form id="buy" class="info" style="gap:18px" autocomplete="off">
        ${p.hero ? `<label class="field" for="hero-name"><span class="step">1 · Kahramanın adı</span><input id="hero-name" class="script" type="text" maxlength="16" placeholder="Adı" autocomplete="off"><small class="hint">Bu isim kapakta ve her sayfada yer alır.</small></label>` : ''}
        <label class="field" for="hero-about"><span class="step">2 · Kahraman hakkında <span class="opt">(opsiyonel<sup>*</sup>)</span></span><textarea id="hero-about" rows="1" maxlength="400" placeholder="Örneğin: 5 yaşında, kıvırcık saçlı, dinozor sever"></textarea></label>
        <div class="field"><span class="step">3 · Üç fotoğraf</span>
          <div class="slots">
            ${PHOTO_SLOTS.map((t, i) => `<label class="slot" for="ph-${i + 1}"><input id="ph-${i + 1}" type="file" accept="image/*"><span class="slot-img"></span><span class="slot-plus" aria-hidden="true">+</span><span class="slot-state" aria-hidden="true"></span><b>${i + 1} · ${t}</b></label>`).join('')}
          </div>
          <ul class="slot-msgs" id="slot-msgs" aria-live="polite"></ul>
          <span class="slot-hint">Yüzün net göründüğü, yakından çekilmiş 3 fotoğraf seçin: önden, biraz yandan ve gülümserken. Fotoğrafları seçtiğiniz anda cihazınızda kontrol ediyoruz; uygun olmayanları size söyleriz. Fotoğraflar yalnızca bu kitap için kullanılır.</span>
        </div>
        <span class="step">4 · Seçenekler</span>
        ${options}
        ${p.type === 'kitap' ? `
        ${extrasHtml}
        <div class="sets" role="radiogroup" aria-label="Set" hidden>
          ${SETS.map(st => {
            const parts = st.items.map(([t, f]) => (PRICES[t] || {})[f]);
            const ready = parts.every(Boolean);
            return `<label class="set-opt${ready ? '' : ' off'}"><input type="radio" name="set" value="${st.id}" data-discount="${st.discount}" data-extra="${ready ? parts.reduce((a, b) => a + b, 0) : ''}"${st.id === wantSet ? ' checked' : ''}${ready ? '' : ' disabled'}>
              <b>${st.name}</b>${st.note ? `<small>${st.note}</small>` : ''}<span>${st.discount ? `%${Math.round(st.discount * 100)} avantajlı` : ready && st.items.length ? `+ ${fmt(parts.reduce((a, b) => a + b, 0))}` : ''}${ready || !st.items.length ? '' : ' · fiyat yakında'}</span></label>`;
          }).join('')}
        </div>
        ${coloring ? `<div class="addons">
          ${coloring ? `<a class="addon-card" href="${productHref(coloring)}"><img src="${thumb(coloring.img)}" alt="" loading="lazy"><span><b>Boyama kitabı</b><small>${coloring.pages.length} sayfa boyama ve etkinlik, aynı kahramanla · sayfalarına bakın</small></span></a>` : ''}
        </div>` : ''}
        ${PDF_ADDON_PRICE ? `<label class="pdf-opt${PDF_ADDON_PRICE ? '' : ' off'}" for="pdf-addon" id="pdf-wrap"><input type="checkbox" id="pdf-addon"${PDF_ADDON_PRICE ? '' : ' disabled'}><span><b>+ Dijital kopya (PDF)</b><small>Basılı kitabın yanında tablet ve telefon için</small></span><em>${PDF_ADDON_PRICE ? '+ ' + fmt(PDF_ADDON_PRICE) : 'Fiyat yakında'}</em></label>` : ''}` : ''}
        <label class="gift-opt" for="gift-box" id="gift-wrap">
          <input type="checkbox" id="gift-box">
          <span class="gift-art" aria-hidden="true">${GIFT_SVG}</span>
          <span class="gift-text"><b>Hediye Kutusu</b><small>Hediye kutusu, kurdele, Masaliya mührü ve el yazısıyla not kartı</small></span>
          <span class="gift-price">${GIFT_BOX_PRICE ? '+ ' + fmt(GIFT_BOX_PRICE) : 'Fiyat yakında'}</span>
        </label>
        <label class="field" for="gift-note" id="gift-note-wrap" hidden>Not kartına ne yazalım?<textarea id="gift-note" rows="3" maxlength="240" placeholder="Sevgili Elif’e, ilk masalı olsun diye…"></textarea></label>
        <div class="total"><span>Toplam <small>Kargo ücretsiz · Yalnızca Türkiye içine gönderim</small></span><strong id="total"></strong></div>
        ${p.type === 'kitap' && pairOn() ? `<p class="deal-hint" id="deal-book">${PAIR_LINE()}<small>Aynı siparişte her 2 sert kapak kitapta geçerli · farklı kitaplar ya da aynı kitap iki çocuk için · <a href="sss.html#kampanya">Koşullar</a></small></p>` : ''}
        ${p.type === 'kitap' ? `<div id="eta-hard">${ETA()}</div><p class="eta" id="eta-digital" hidden>Dijital kitap: <b>3 iş günü içinde</b> e-postanıza gelir<small>Önizlemeyi onayladığınızda PDF hemen gönderilir</small></p>` : ''}
        <label class="consent" for="ok-kvkk"><input type="checkbox" id="ok-kvkk"><span>Fotoğrafların yalnızca bu kitabın hazırlanması için, <a href="kvkk.html#acik-riza" target="_blank">KVKK Aydınlatma Metni</a>’nde açıklandığı şekilde işlenmesine ve aktarılmasına açık rıza veriyorum.</span></label>
        <div class="buy-actions">
          <button class="btn ghost" type="submit" value="sepet" id="cart-btn">Sepete ekle</button>
          <button class="btn" type="submit" value="ode" id="pay-btn">Ödemeye geç</button>
        </div>
        <div class="secure-pay"><span class="cards" aria-label="Visa, Mastercard, Apple Pay, Google Pay">${CARD_MARKS}</span></div>
        <p class="form-note" id="buy-note" aria-live="polite"></p>
      </form>`
      : book ? (() => {
        const set = SETS.find(st => st.id === 'masal-seti'), sup = SETS.find(st => st.id === 'super-set');
        const setPrice = st => fmt(setTotal(st));
        return `
      <div class="info addon">
        <p class="eyebrow">${set.name}</p>
        <p class="desc">Bu boyama kitabı tek başına satılmaz. <a href="${productHref(book)}">${fullTitle(book)}</a> kitabıyla birlikte, aynı kahramanla hazırlanır.</p>
        <p class="set-price">${set.name}: kitap + boyama kitabı · ${setPrice(set)}${sup ? `<br>${sup.name}: kitap + boyama kitabı + ahşap puzzle · ${setPrice(sup)}` : ''}</p>
        <a class="btn" href="${productHref(book)}?set=${set.id}#buy">${set.name}’ni oluştur</a>
      </div>`; })()
      : `
      <form id="interest" class="info" style="gap:14px">
        ${options}
        <p class="desc">Bu ürün şu an atölyede hazırlanıyor. Hazır olduğunda ilk size haber verelim.</p>
        <div class="inline-form"><label for="int-email" hidden>E-posta</label><input id="int-email" type="email" required placeholder="E-posta adresiniz"><button class="btn ghost" type="submit">Haber Ver</button></div>
        <p class="form-note" id="int-note" aria-live="polite"></p>
      </form>`;

    const inner = p.spreads || p.pages;
    // one viewer at the top: the cover first, then every page, then the back cover
    const viewerHtml = inner ? `<section class="p-viewer" id="inside" aria-label="Kitabın içinden">
        <div class="spread${p.spreads ? '' : ' portrait'} on-cover" id="spread" tabindex="0" role="button" aria-label="Sayfayı büyüt">
          <div class="cover-box main" id="cover-box"><img id="g-main" src="${shots[0][0]}" alt="${esc(shots[0][1])}"></div>
          <img id="spread-img" src="" alt="" hidden>
          <button class="arrow ov ov-prev" id="prev" type="button" aria-label="Önceki sayfa">←</button><button class="arrow ov ov-next" id="next" type="button" aria-label="Sonraki sayfa">→</button>
        </div>
        <div class="viewer-bar"><span class="counter" id="counter" aria-live="polite"></span><button class="zoom" id="zoom" type="button" aria-label="Büyüt">Büyüt</button></div>
        <div class="vthumbs${p.spreads ? '' : ' portrait'}" id="vthumbs" aria-label="Bütün sayfalar"></div>
        <p class="sample-note">Örnek kitap. Sizin kitabınızda kahramanın yüzü ve adı her sayfada yer alır.</p>
      </section>` : '';
    // what is in it, and when it arrives if ordered today
    const content = p.spreads ? `${p.spreads.length * 2} iç sayfa ve kapak`
      : p.pages ? `${p.pages.length} sayfa boyama ve etkinlik` : '';
    const specs = orderable ? `<dl class="specs">
        <div><dt>Boyut</dt><dd>${p.type === 'kitap' ? '21 × 28 cm' : 'A4 · 21 × 29,7 cm'}</dd></div>
        ${content ? `<div><dt>İçerik</dt><dd>${content}</dd></div>` : ''}
        ${p.type === 'kitap' ? '<div><dt>Cilt</dt><dd>Sert kapak, sayfalar düz açılır</dd></div><div><dt>Kâğıt</dt><dd>Fujifilm fotoğraf kâğıdı</dd></div>' : ''}
        <div><dt>Tasarım</dt><dd>3 iş günü · Önizleme en geç ${trDate(inWorkDays(3))}</dd></div>
        <div><dt>Baskı</dt><dd>Onayınızdan sonra 5 iş günü · Ücretsiz kargo</dd></div>
        ${p.type === 'kitap' ? `<div><dt>Teslim</dt><dd>Tahmini ${etaRange()} · kargo ortalama 2–4 gün</dd></div>` : ''}
        <div><dt>Gönderim</dt><dd>Yalnızca Türkiye içi</dd></div>
      </dl>` : '';
    root.innerHTML = `<div class="product">
      <div class="p-gallery">${inner ? viewerHtml : gallery}</div>
      <div class="p-head">
        <p class="eyebrow" id="crumbs-inline">${a.name}</p>
        <h1 id="p-title">${fullTitle(p)}</h1>
        <div class="meta"><span>${p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one}</span><span>${p.status === 'hazir' ? (p.type === 'kitap' ? '21 × 28 cm' : 'A4') : 'Yakında'}</span></div>
        <p class="desc clamp" id="p-desc">${esc(p.desc)}</p>
        <button type="button" class="more" id="desc-more" hidden>Devamını oku</button>
        ${orderable && p.type === 'kitap' ? PROMISE : ''}
      </div>

      <div class="p-buy info">
        ${buy}
        ${specs ? `<div class="about"><p class="eyebrow">Kitap hakkında</p>${specs}</div>` : ''}
      </div>
    </div>
    ${orderable ? `<div class="buybar" id="buybar"><span><small>Toplam</small><b id="buybar-total"></b></span><a class="btn" href="#buy">Masalını oluştur</a></div>` : ''}`;

    // the description shows three lines; the rest opens on request
    const desc = document.getElementById('p-desc'), more = document.getElementById('desc-more');
    if (desc && more) {
      more.hidden = desc.scrollHeight <= desc.clientHeight + 2;
      more.addEventListener('click', () => { const open = desc.classList.toggle('clamp'); more.textContent = open ? 'Devamını oku' : 'Daha az'; });
    }
    // Gallery thumbs
    root.querySelectorAll('[data-shot]').forEach(b => b.addEventListener('click', () => {
      const s = shots[+b.dataset.shot], m = document.getElementById('g-main');
      m.src = s[0]; m.alt = s[1]; coverShown = +b.dataset.shot === 0; paintCover();
      root.querySelectorAll('[data-shot]').forEach(x => x.setAttribute('aria-current', String(x === b)));
    }));
    // Live name: in the title, on the cover, in the dedication suggestion
    const nameIn = document.getElementById('hero-name');
    let coverShown = true, coverTimer = 0;
    const mainBox = root.querySelector('.gallery .main, #cover-box'), coverCanvas = document.createElement('canvas');
    coverCanvas.className = 'cover-name-canvas'; coverCanvas.setAttribute('aria-hidden', 'true');
    if (mainBox && p.coverTitle) mainBox.appendChild(coverCanvas);
    function paintCover() {
      const n = nameIn ? cap(nameIn.value.trim()) : '';
      const on = !!(p.coverTitle && coverShown && n && n !== p.hero);
      coverCanvas.hidden = !on;
      if (!on) return;
      const img = new Image(); img.src = p.clean || p.img; if (p.clean) img.dataset.clean = '1';
      const f = p.coverTitle.font, faces = f === 'sans' ? ['900 40px "Nunito"', '800 40px "Nunito"'] : f === 'script' ? ['400 40px "Great Vibes"', 'italic 600 40px "Lora"'] : ['italic 500 40px "Cormorant Garamond"'];
      Promise.all([img.decode(), ...faces.map(x => document.fonts.load(x, n + p.coverTitle.sub))]).then(() => drawCoverName(coverCanvas, img, p, n)).catch(() => {});
    }
    if (nameIn) {
      const sync = () => {
        const n = cap(nameIn.value.trim());
        document.getElementById('p-title').innerHTML = fullTitle(p, nameIn.value.trim());
        clearTimeout(coverTimer); coverTimer = setTimeout(paintCover, 200);
      };
      nameIn.value = '';   // every visit starts empty, also after a reload
      nameIn.addEventListener('input', sync);
    }
    // Gift box and total
    const giftBox = document.getElementById('gift-box');
    // Sert Kapak and Dijital can both be chosen: then the printed book comes with its PDF as well
    const coverChoice = () => {
      const h = root.querySelector('input[name="cover"][value="hard"]:checked'), d = root.querySelector('input[name="cover"][value="digital"]:checked');
      return { c: h || d || root.querySelector('input[name="cover"]:checked'), both: !!(h && d), digitalPrice: d ? +d.dataset.price : 0 };
    };
    let giftWanted = false;   // what the customer chose, kept while a digital format hides the box
    function total() {
      const { c, both, digitalPrice } = coverChoice(), t = document.getElementById('total');
      if (!t || !giftBox) return;
      // the e-book has nothing to put in a box
      const digital = !!c && c.value === 'digital';
      const eh = document.getElementById('eta-hard'), ed = document.getElementById('eta-digital');
      if (eh && ed) { eh.hidden = digital; ed.hidden = !digital; }
      const db = document.getElementById('deal-book'); if (db) db.hidden = digital;
      // the e-book comes alone: sets go with the printed book only
      const setsBox = root.querySelector('.sets'), addons = root.querySelector('.addons'), extras = document.getElementById('extras');
      if (setsBox) {
        if (addons) addons.hidden = digital;
        if (extras) extras.hidden = digital;
        const tek = setsBox.querySelector('input[value="tek"]');
        if (digital && tek && !tek.checked) { tek.checked = true; if (extras) extras.querySelectorAll('input').forEach(x => { x.checked = false; }); }
      }
      // a set adds its parts (and takes off any discount); the PDF copy goes with printed books only
      const set = root.querySelector('input[name="set"]:checked'), pdf = document.getElementById('pdf-addon');
      const nothingToShip = digital && !(set && +set.dataset.extra > 0);
      document.getElementById('gift-wrap').hidden = nothingToShip;
      giftBox.checked = !nothingToShip && giftWanted;
      document.getElementById('gift-note-wrap').hidden = !giftBox.checked;
      if (pdf) { document.getElementById('pdf-wrap').hidden = digital; if (digital) pdf.checked = false; }
      const base = c ? +c.dataset.price : singlePrice;
      if (!c && formats.length) {
        // nothing chosen yet: the gift box and puzzle add to the hard cover's price once it is chosen
        const sel = 'Seçim yapın'; t.textContent = sel; const bt = document.getElementById('buybar-total'); if (bt) bt.textContent = sel; return;
      }
      if (!base) { t.textContent = 'Fiyat yakında'; const bt = document.getElementById('buybar-total'); if (bt) bt.textContent = 'Fiyat yakında'; return; }
      let sum = base;
      if (set && set.dataset.extra) sum = Math.round((sum + +set.dataset.extra) * (1 - +set.dataset.discount));
      if (pdf && pdf.checked) sum += PDF_ADDON_PRICE || 0;
      if (both) sum += digitalPrice;
      sum += giftBox.checked ? (GIFT_BOX_PRICE || 0) : 0;
      t.textContent = fmt(sum) + (giftBox.checked && !GIFT_BOX_PRICE ? ' + hediye kutusu' : '');
      const bt = document.getElementById('buybar-total'); if (bt) bt.textContent = fmt(sum);
    }
    if (p.spreads) {
      root.querySelectorAll('input[name="cover"]').forEach(r => { r.checked = false; });
      if (giftBox) giftBox.checked = false;
      root.querySelectorAll('#extras input').forEach(x => { x.checked = false; });
    }
    const about = document.getElementById('hero-about');
    if (about) { const grow = () => { about.style.height = ''; about.style.height = Math.max(about.offsetHeight, about.scrollHeight + 2) + 'px'; }; about.addEventListener('input', grow); }
    const needHard = () => { if (!root.querySelector('input[name="cover"]:checked')) { const h = root.querySelector('input[name="cover"][value="hard"]'); if (h) h.checked = true; } };
    if (giftBox) giftBox.addEventListener('change', () => { if (giftBox.checked) needHard(); giftWanted = giftBox.checked; total(); });
    root.querySelectorAll('input[name="cover"], input[name="set"], #pdf-addon').forEach(r => r.addEventListener('change', total));
    // the "+" add-ons choose the matching set
    const extrasBox = document.getElementById('extras');
    if (extrasBox) {
      const pick = () => {
        if (extrasBox.querySelector('input:checked')) needHard();
        const parts = [...extrasBox.querySelectorAll('input:checked')].map(x => x.dataset.part).sort().join(',');
        const st = SETS.find(x => x.items.map(([t]) => t).sort().join(',') === parts) || SETS[0];
        const r = root.querySelector(`input[name="set"][value="${st.id}"]`); if (r) r.checked = true;
        total();
      };
      extrasBox.addEventListener('change', pick); pick();
    }
    total();
    // three photo slots: each photo is checked on the visitor's device as soon as it is chosen
    const slots = [...root.querySelectorAll('.slot')];
    const checked = [];   // per slot: { level, messages, blob, accepted }
    const msgs = document.getElementById('slot-msgs');
    let checker = null;
    const loadChecker = () => (checker = checker || import(`./photo-check.js?v=${VER}`));
    function showMessages() {
      if (!msgs) return;
      msgs.innerHTML = slots.map((sl, i) => {
        const r = checked[i];
        if (!r || !r.messages.length) return '';
        const buttons = r.level === 'warn' && !r.accepted ? `<span class="msg-actions"><button type="button" data-use="${i}">Yine de bu fotoğrafı kullan</button><button type="button" data-pick="${i}">Başka fotoğraf seç</button></span>`
          : r.level === 'bad' ? `<span class="msg-actions"><button type="button" data-pick="${i}">Başka fotoğraf seç</button></span>` : '';
        return `<li class="${r.level}${r.accepted ? ' accepted' : ''}"><b>${i + 1} · ${PHOTO_SLOTS[i]}</b> ${r.messages.map(esc).join(' ')}${r.accepted ? ' <em>Bu fotoğraf kullanılacak.</em>' : ''}${buttons}</li>`;
      }).join('');
    }
    if (msgs) msgs.addEventListener('click', e => {
      const use = e.target.closest('[data-use]'), pick = e.target.closest('[data-pick]');
      if (use) { const i = +use.dataset.use; checked[i].accepted = true; slots[i].dataset.state = 'ok'; showMessages(); }
      if (pick) slots[+pick.dataset.pick].querySelector('input').click();
    });
    if (slots.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(en => { if (en.some(x => x.isIntersecting)) { io.disconnect(); loadChecker().then(m => m.warmUp()).catch(() => {}); } }, { rootMargin: '600px 0px' });
      io.observe(slots[0]);
    }
    slots.forEach((slot, i) => {
      const input = slot.querySelector('input'), img = slot.querySelector('.slot-img');
      // start loading the face checker as soon as someone reaches for a photo
      ['pointerdown', 'focus'].forEach(ev => input.addEventListener(ev, () => loadChecker().then(m => m.warmUp()).catch(() => {}), { once: true }));
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        slot.classList.add('filled');
        img.style.backgroundImage = `url("${URL.createObjectURL(f)}")`;
        slot.dataset.state = 'checking';
        checked[i] = { level: 'checking', messages: ['Fotoğraf kontrol ediliyor…'] };
        showMessages();
        let r;
        try { r = await (await loadChecker()).checkPhoto(f, i); }
        catch (err) { r = { level: 'ok', messages: ['Otomatik kontrol yapılamadı; fotoğrafı biz kontrol edeceğiz.'], blob: f }; }
        if (input.files[0] !== f) return;   // another photo was chosen meanwhile
        checked[i] = r;
        slot.dataset.state = r.level;
        if (r.level === 'bad') input.value = '';
        showMessages();
      });
    });
    const buyF = document.getElementById('buy');
    if (buyF) buyF.addEventListener('submit', async e => {
      e.preventDefault();
      const goPay = !e.submitter || e.submitter.value !== 'sepet';
      const note = document.getElementById('buy-note'), btns = [...buyF.querySelectorAll('.buy-actions button')];
      const { c, both } = coverChoice(), set = root.querySelector('input[name="set"]:checked');
      const name = nameIn ? nameIn.value.trim() : '';
      const say = (html, focus) => { note.innerHTML = html; if (focus) focus.focus(); };
      if (!c && formats.length) { const first = root.querySelector('.covers'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return say('Lütfen önce Sert Kapak ya da Dijital Kitap seçin.'); }
      if (!(c ? c.dataset.price : singlePrice)) return say('Bu ürünün fiyatı yakında açıklanacak; şimdilik sipariş alamıyoruz.');
      if (nameIn && !name) return say('Lütfen kahramanın adını yazın.', nameIn);
      if (checked.some(r => r && r.level === 'checking')) return say('Fotoğraflar kontrol ediliyor, birkaç saniye bekleyin.');
      const missing = slots.map((sl, k) => k).filter(k => !checked[k] || !(checked[k].level === 'ok' || checked[k].accepted));
      if (missing.length) return say(`Lütfen 3 fotoğrafın hepsini uygun fotoğraflarla tamamlayın: ${missing.map(k => `${k + 1} · ${PHOTO_SLOTS[k]}`).join(', ')}.`, slots[missing[0]].querySelector('input'));
      if (!document.getElementById('ok-kvkk').checked) return say('Fotoğrafları kitabınız için kullanabilmemiz için açık rızanız gerekiyor.', document.getElementById('ok-kvkk'));
      if (!ORDER_API) return say('Ödeme sistemi birkaç gün içinde açılıyor. Şimdilik sipariş alamıyoruz.');

      const gift = document.getElementById('gift-box');
      const item = {
        product: p.id, hero: cap(name), cover: c ? c.value : '', pdf: both, set: set ? set.value : 'tek',
        giftBox: !!(gift && gift.checked && !document.getElementById('gift-wrap').hidden),
        giftNote: (document.getElementById('gift-note') || {}).value || '', about: (document.getElementById('hero-about') || {}).value || '', consentKvkk: true
      };
      const data = new FormData();
      data.append('item', JSON.stringify(item));
      checked.forEach((r, k) => data.append(`photo${k + 1}`, r.blob, `foto-${k + 1}.jpg`));
      btns.forEach(b => { b.disabled = true; }); say('Fotoğraflarınız yükleniyor…');
      try {
        const { status, out } = await new Promise((done, fail) => {
          const x = new XMLHttpRequest();
          x.open('POST', ORDER_API + '/api/item'); x.timeout = 180000;
          x.upload.onprogress = ev => { if (ev.lengthComputable) say(`Fotoğraflarınız yükleniyor… %${Math.min(99, Math.round(ev.loaded / ev.total * 100))}`); };
          x.onload = () => { let o = {}; try { o = JSON.parse(x.responseText); } catch (err) {} done({ status: x.status, out: o }); };
          x.onerror = () => fail(new Error('Bağlantı kesildi.'));
          x.ontimeout = () => fail(new Error('Yükleme çok uzun sürdü.'));
          x.send(data);
        });
        if (status !== 200 || !out.id) throw new Error(out.error || 'Kitap sepete eklenemedi.');
        if (!cart.add({ ...out, img: p.img })) {
          // the browser (often a private tab) does not let the site keep a cart: the book is saved with us, finish over WhatsApp
          btns.forEach(b => { b.disabled = false; });
          return say(`Kitabınız kaydedildi (no: ${esc(out.id)}), ancak tarayıcınız sepeti saklamaya izin vermiyor. Siparişi tamamlamak için <a href="${waLink(`Merhaba, sepete eklenemeyen kitabım: ${out.id}`)}" target="_blank" rel="noopener">WhatsApp’tan yazın</a> ya da sayfayı Safari veya Chrome’da açın.`);
        }
        // both buttons open the cart; "Ödemeye geç" goes straight to the payment form there
        location.href = goPay ? 'sepet.html#odeme' : 'sepet.html';
      } catch (err) {
        btns.forEach(b => { b.disabled = false; });
        say(`${esc(err.message)} Lütfen tekrar deneyin; sorun sürerse bize yazın.`);
      }
    });
    const intF = document.getElementById('interest');
    if (intF) intF.addEventListener('submit', e => { e.preventDefault(); document.getElementById('int-note').textContent = 'Önizleme sürümü: haber listesi site yayına alınırken bağlanacak.'; });

    // inside the book: spreads for story books, single pages for coloring books
    if (inner) setupViewer([[shots[0][0], shots[0][1], 'cover'], ...inner, ...shots.slice(1).map(([src, alt]) => [src, alt, 'back'])], on => { coverShown = on; paintCover(); });
    // phone: a slim bar with the total stays at hand until the order form is on screen
    const bar = document.getElementById('buybar');
    if (bar && buyF && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => bar.classList.toggle('away', en.isIntersecting), { rootMargin: '0px 0px -20% 0px' }).observe(buyF);
      bar.querySelector('a').addEventListener('click', e => { e.preventDefault(); buyF.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }

    // Related
    // all our other stories: this collection first, then the others
    const others = PRODUCTS.filter(x => x.id !== p.id && x.type === p.type && x.status === 'hazir' && onSale(x) && !(x.aud && AUDIENCES[x.aud] && AUDIENCES[x.aud].hidden));
    const rel = [...others.filter(x => x.aud === p.aud), ...others.filter(x => x.aud !== p.aud)];
    document.getElementById('related').innerHTML = rel.map(p => card(p)).join('');
    const rh = document.getElementById('related-head'); if (rh) rh.hidden = !rel.length;
    if (location.hash === '#inside' && document.getElementById('inside')) requestAnimationFrame(() => document.getElementById('inside').scrollIntoView());
    else scrollTo(0, 0);
  }
  addEventListener('hashchange', () => { if (document.body.dataset.product) return; show(); const b = document.getElementById('back'); if (b) b.href = backHref(); });
  show();
}

// slides: [src, alt, kind]; kind 'cover' / 'back' show in the upright cover frame, the rest are the pages
function setupViewer(slides, onCover) {
  let cur = 0;
  const img = document.getElementById('spread-img'), counter = document.getElementById('counter'), strip = document.getElementById('vthumbs');
  const frame = document.getElementById('spread'), box = document.getElementById('cover-box'), coverImg = document.getElementById('g-main');
  const pages = slides.filter(s => !s[2]).length;
  const label = i => slides[i][2] === 'cover' ? 'Kapak' : slides[i][2] === 'back' ? 'Arka kapak' : `${slides.slice(0, i).filter(s => !s[2]).length + 1} / ${pages}`;
  // every page as a thumbnail, so the whole book can be seen at a glance
  strip.innerHTML = slides.map(([src, alt, kind], i) => `<button type="button" data-i="${i}"${kind ? ' class="pt"' : ''} aria-label="${esc(label(i))}: ${esc(alt)}"><img src="${thumb(src)}" alt="" loading="lazy"></button>`).join('');
  function show(i, fade) {
    cur = (i + slides.length) % slides.length;
    const [src, alt, kind] = slides[cur];
    const apply = () => {
      frame.classList.toggle('on-cover', !!kind);
      box.hidden = !kind; img.hidden = !!kind;
      if (kind) { coverImg.src = src; coverImg.alt = alt; } else { img.src = pageSrc(src); img.alt = alt; }
      onCover && onCover(kind === 'cover');
      frame.style.opacity = 1;
    };
    if (fade) { frame.style.opacity = .35; setTimeout(apply, 180); } else apply();
    counter.textContent = label(cur);
    strip.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === cur)));
    const active = strip.children[cur];
    if (active && fade) strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
  }
  const go = i => show(i, true);
  show(0, false);
  strip.querySelectorAll('button').forEach((b, k) => { b.onclick = () => go(k); });
  document.getElementById('prev').onclick = e => { e.stopPropagation(); go(cur - 1); };
  document.getElementById('next').onclick = e => { e.stopPropagation(); go(cur + 1); };
  const all = slides.map(([src, alt]) => [src, alt]);
  document.getElementById('zoom').onclick = () => openLightbox(all, cur);
  swipe(frame, () => go(cur + 1), () => go(cur - 1));
  frame.addEventListener('click', () => { if (frame.dataset.swiped) { delete frame.dataset.swiped; return; } openLightbox(all, cur); });
  frame.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') go(cur - 1);
    if (e.key === 'ArrowRight') go(cur + 1);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(all, cur); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'sepet') renderCart();
  if (document.body.dataset.page === 'tesekkurler' && /siparis=MSL-/.test(location.search)) { cart.clear(); try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  document.querySelectorAll('[data-aud]').forEach(el => { if (AUDIENCES[el.dataset.aud] && AUDIENCES[el.dataset.aud].hidden) el.remove(); });
  // data-sell="boyama yapboz": shown while at least one of them is on sale
  document.querySelectorAll('[data-sell]').forEach(el => { if (!el.dataset.sell.split(' ').some(k => SELL[k])) el.remove(); });
  const setRows = document.querySelector('tr[data-set-rows]');
  if (setRows) {
    const sets = SETS.filter(st => st.items.length);
    setRows.outerHTML = sets.map((st, i) => `<tr${i ? '' : ' class="first"'}>${i ? '' : `<td rowspan="${sets.length}">Setler<br><small>sert kapaklı kitapla</small></td>`}<td class="opt">${st.name}: ${st.note.replace(/^Kitap/, 'kitap')}</td><td class="num">${fmt(setTotal(st))}</td></tr>`).join('');
  }
  renderChrome();
  cart.badge();
  const page = document.body.dataset.page;
  if (AUDIENCES[page]) renderCollection(page);
  if (page === 'home') {
    // the story books, with their prices, just below the opening scene
    const books = PRODUCTS.filter(p => p.type === 'kitap' && p.status === 'hazir' && onSale(p));
    const g = document.getElementById('home-grid');
    if (g) {
      g.innerHTML = books.map(b => card(b, true)).join('');
      if (books.length === 4) g.classList.add('n2');   // two by two, so no book is left alone on a row
      dealRun();
    }
  }
  if (page === 'urun') {
    // old urun.html#id links forward to the product's own page
    const p = currentProduct();
    if (!document.body.dataset.product && p) { location.replace(productHref(p)); return; }
    renderProduct();
  }
});
