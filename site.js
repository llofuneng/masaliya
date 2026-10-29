/* Masaliya shared script: header, footer, menu, product catalogue and page renderers.
   To add a product, add one entry to PRODUCTS below; it appears in its collection and gets its own page. */

const AUDIENCES = {
  kiz:      { page: 'kizlar.html',      name: 'Kız Çocukları',   short: 'Kızlar' },
  erkek:    { page: 'erkekler.html',    name: 'Erkek Çocukları', short: 'Erkekler' },
  yetiskin: { page: 'yetiskinler.html', name: 'Yetişkinler',     short: 'Yetişkinler' }
};

/* Product types for the children's collections */
const TYPES = {
  kitap:  { tab: 'kitaplar', name: 'Kitaplar',         one: 'Masal kitabı' },
  boyama: { tab: 'boyama',   name: 'Boyama Kitapları', one: 'Boyama kitabı' },
  yapboz: { tab: 'yapboz',   name: 'Yapbozlar',        one: 'Yapboz' }
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
  kitap:  { hard: 2500, soft: 1500, digital: null },
  boyama: { print: null, digital: null },
  yapboz: { s: null, m: null, l: null }
};
const GIFT_BOX_PRICE = null;   // gift box add-on, TL; null shows "Fiyat yakında"
const PDF_ADDON_PRICE = null;  // digital copy added to a printed book, TL
/* Masal Seti: the same hero across several products, priced together.
   The set price is the sum of the parts (printed coloring book, medium puzzle) minus the discount. */
const SETS = [
  { id: 'tek', name: 'Yalnızca kitap', items: [], discount: 0 },
  { id: 'masal-seti', name: 'Masal Seti', note: 'Kitap + boyama kitabı, aynı kahramanla', items: [['boyama', 'print']], discount: .10 },
  { id: 'buyuk-masal-seti', name: 'Büyük Masal Seti', note: 'Kitap + boyama kitabı + yapboz', items: [['boyama', 'print'], ['yapboz', 'm']], discount: .15 }
];
/* Formats per product type, in the order shown: [key, name, note]. A 'digital' format never gets a gift box. */
const FORMATS = {
  kitap: [
    ['hard', 'Sert Kapak', 'A4 · hediye için önerilir'],
    ['soft', 'Yumuşak Kapak', 'A4 · 21 × 29,7 cm'],
    ['digital', 'Dijital Kitap', 'PDF · e-postanıza gelir']
  ],
  boyama: [
    ['print', 'Basılı Boyama Kitabı', 'Kalın, boyamaya uygun kâğıt'],
    ['digital', 'Dijital Boyama', 'PDF · evde dilediğiniz kadar yazdırın']
  ],
  yapboz: [   // sizes to be announced
    ['s', 'Küçük Boy', 'Ölçü yakında'],
    ['m', 'Orta Boy', 'Ölçü yakında'],
    ['l', 'Büyük Boy', 'Ölçü yakında']
  ]
};

/* WhatsApp concierge: put the number here in international format without "+", e.g. '905321234567'. */
const WHATSAPP = '';

const SPREADS_DUA = [
  ['img/dua-s1.jpg', 'Dua tozlu Masallar Kitabı’nı buluyor'],
  ['img/dua-s2.jpg', 'Masal Diyarı’nda konuşan kedi Mürekkep'],
  ['img/dua-s3.jpg', 'Bulutların üstündeki ip köprüde küçük şövalye Aras'],
  ['img/dua-s4.jpg', 'Yalnız dev Toprak ile paylaşılan simit'],
  ['img/dua-s5.jpg', 'Yüz yıldır kapıyı bekleyen taş aslan'],
  ['img/dua-s6.jpg', 'Sihirli Kütüphane’de altın sayfalar'],
  ['img/dua-s7.jpg', 'Dua okul kütüphanesinde ilk cümleyi yazıyor']
];
// coloring books: single portrait pages
const PAGES_BOYAMA_LAVIN = [
  ['img/boyama-lavin-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/boyama-lavin-p02.jpg', 'Dalgaları çiz'],
  ['img/boyama-lavin-p03.jpg', 'Kumsalda deniz kabuğu'],
  ['img/boyama-lavin-p04.jpg', 'Labirent'],
  ['img/boyama-lavin-p05.jpg', 'Mira ile ilk karşılaşma'],
  ['img/boyama-lavin-p06.jpg', 'Kaç tane?'],
  ['img/boyama-lavin-p07.jpg', 'Yengeç ve ilk inci'],
  ['img/boyama-lavin-p08.jpg', 'Eşini bul'],
  ['img/boyama-lavin-p09.jpg', 'Bilge kaplumbağa'],
  ['img/boyama-lavin-p10.jpg', 'Hangisi farklı?'],
  ['img/boyama-lavin-p11.jpg', 'Parlayan balıklar'],
  ['img/boyama-lavin-p12.jpg', 'Noktaları birleştir'],
  ['img/boyama-lavin-p13.jpg', 'Mağarada üçüncü inci'],
  ['img/boyama-lavin-p14.jpg', 'Kendi resmini çiz'],
  ['img/boyama-lavin-p15.jpg', 'Deniz Kızı Krallığı’nda şenlik']
];
const PAGES_BOYAMA_DUA = [
  ['img/boyama-dua-p01.jpg', 'Kapaktaki sahne, boyanmayı bekliyor'],
  ['img/boyama-dua-p02.jpg', 'Şifreli mesaj'],
  ['img/boyama-dua-p03.jpg', 'Masallar Kitabı açılıyor'],
  ['img/boyama-dua-p04.jpg', 'Kelime avı'],
  ['img/boyama-dua-p05.jpg', 'Konuşan kedi Mürekkep'],
  ['img/boyama-dua-p06.jpg', 'Harfli labirent'],
  ['img/boyama-dua-p07.jpg', 'Bulutların üstündeki köprü'],
  ['img/boyama-dua-p08.jpg', 'Bilmeceler'],
  ['img/boyama-dua-p09.jpg', 'Dev Toprak'],
  ['img/boyama-dua-p10.jpg', 'Sihirli kareler'],
  ['img/boyama-dua-p11.jpg', 'Taş aslan'],
  ['img/boyama-dua-p12.jpg', 'Masal bulmacası'],
  ['img/boyama-dua-p13.jpg', 'Sihirli Kütüphane'],
  ['img/boyama-dua-p14.jpg', 'Bir sonraki masalı sen yaz'],
  ['img/boyama-dua-p15.jpg', 'Cevaplar']
];
const SPREADS_LAVIN = [
  ['img/lavin-s1.jpg', 'Lavin kumsalda deniz kabuğunu kulağına tutuyor'],
  ['img/lavin-s2.jpg', 'Deniz kızı Mira dalgaların arasından çıkıyor'],
  ['img/lavin-s3.jpg', 'Yan yan yürüyen yengeç ilk inciyi veriyor'],
  ['img/lavin-s4.jpg', 'Bilge kaplumbağa ikinci inciyi sırtında taşıyor'],
  ['img/lavin-s5.jpg', 'Parlayan balıklar mağaranın yolunu gösteriyor'],
  ['img/lavin-s6.jpg', 'Lavin ve Mira el ele üçüncü inciyi buluyor'],
  ['img/lavin-s7.jpg', 'Deniz Kızı Krallığı’nda şenlik']
];

/* Line icons for products without artwork yet (adults' collection) */
const ICONS = {
  ciftler: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="19" cy="26" r="10"/><circle cx="29" cy="26" r="10"/><path d="M24 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" stroke="none"/></svg>',
  buyukler: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="15" cy="27" r="7"/><circle cx="33" cy="27" r="7"/><path d="M22 27q2-3 4 0M8 25l-3-5M40 25l3-5"/></svg>',
  aile: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 42V22a14 14 0 0 1 28 0v20"/><path d="M6 42h36"/><circle cx="20" cy="30" r="2.5"/><circle cx="28" cy="30" r="2.5"/><circle cx="24" cy="36" r="1.8"/></svg>',
  'dogum-gunu': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="18" y="20" width="12" height="20" rx="1"/><path d="M24 20v-4"/><path d="M24 8c3 3 3 6 0 8-3-2-3-5 0-8z" fill="currentColor" stroke="none"/><path d="M10 42h28"/></svg>',
  yapboz: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 10h11a4 4 0 1 1 6 0h11v11a4 4 0 1 0 0 6v11H27a4 4 0 1 0-6 0H10V27a4 4 0 1 1 0-6z"/></svg>'
};

/* status: 'hazir' = can be ordered now, 'yakinda' = coming soon (interest list) */
const PRODUCTS = [
  { id: 'dua', aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Dua', title: 've Sihirli Kütüphane', age: '7–12 yaş',
    img: 'img/dua-cover.jpg', alt: 'Dua ve Sihirli Kütüphane kapağı: parlayan bir kitap tutan kız ve kedi',
    desc: 'Yağmurlu bir öğleden sonra, okul kütüphanesinde tozlu bir kitap açılır ve kahramanımız kendini sonları kaybolmuş masalların içinde bulur. Korkan küçük bir şövalye, yalnız bir dev ve yüz yıldır bekleyen bir taş aslan: hepsinin masalı onun yardımını bekliyor. Cesaretin, iyiliğin, dürüstlüğün ve kendine inanmanın masalı.',
    extra: [['img/dua-ithaf.jpg', 'Kişisel ithaf sayfası'], ['img/dua-son.jpg', 'Hediye sayfası'], ['img/dua-arka.jpg', 'Arka kapak']], spreads: SPREADS_DUA },
  { id: 'lavin', aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Lavin', title: 've Deniz Kızı Krallığı', age: '2–7 yaş',
    img: 'img/lavin-cover.jpg', alt: 'Lavin ve Deniz Kızı Krallığı kapağı: parlayan deniz kabuğu tutan kız ve deniz kızı',
    desc: 'Bir yaz sabahı kumsalda şarkı söyleyen bir deniz kabuğu. Küçük deniz kızı Mira ile kaybolan üç inciyi aramak için denizin derinliklerine bir yolculuk.',
    extra: [['img/lavin-ithaf.jpg', 'Kişisel ithaf sayfası'], ['img/lavin-son.jpg', 'Hediye sayfası']], spreads: SPREADS_LAVIN },
  { id: 'efe', aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Efe', title: 've Kayıp Ay Işığı', age: '4–9 yaş',
    img: 'img/efe-cover.jpg', alt: 'Efe ve Kayıp Ay Işığı kapağı: astronot kaskıyla gülümseyen çocuk',
    desc: 'Bir gece Ay’ın ışığı kaybolur. Kahramanımız kaskını takar, yıldızların arasından geçerek Ay ışığını yeniden yakmaya gider.' },

  { id: 'boyama-lavin', aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Lavin', title: 've Deniz Kızı Krallığı', age: '3–7 yaş',
    img: 'img/boyama-lavin-kapak.jpg', alt: 'Lavin ve Deniz Kızı Krallığı boyama ve etkinlik kitabının kapağı',
    desc: 'Masalın kahramanı sensin, renkleri de sen seç! 8 boyama sayfası ve 7 etkinlik: dalgalar, labirent, sayma, eşini bulma, farklı olanı bulma, noktaları birleştirme ve kendi resmin.',
    extra: [['img/boyama-lavin-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/boyama-lavin-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_LAVIN },
  { id: 'boyama-dua', aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Dua', title: 've Sihirli Kütüphane', age: '7–12 yaş',
    img: 'img/boyama-dua-kapak.jpg', alt: 'Dua ve Sihirli Kütüphane boyama ve etkinlik kitabının kapağı',
    desc: 'Masalın kahramanı sensin, renkleri de sen seç! 7 boyama sayfası ve 7 etkinlik: şifreli mesaj, kelime avı, harfli labirent, bilmeceler, sihirli kareler, masal bulmacası ve kendi masalını yazacağın bir sayfa.',
    extra: [['img/boyama-dua-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/boyama-dua-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_DUA },
  { id: 'boyama-efe', aud: 'erkek', type: 'boyama', status: 'yakinda', title: 'Kayıp Ay Işığı Boyama Kitabı', age: '4–9 yaş',
    img: 'img/boyama-efe.jpg', alt: 'Kayıp Ay Işığı kapağının boyama sayfası hâli', paper: true,
    desc: 'Yıldızlar, Ay ve astronot kaskı. Kendi uzay yolculuğunu kendi renkleriyle boyar.' },

  { id: 'yapboz-dua', aud: 'kiz', type: 'yapboz', status: 'yakinda', title: 'Sihirli Kütüphane Yapbozu', age: '6+ yaş',
    img: 'img/yapboz-dua.jpg', alt: 'Sihirli Kütüphane kapağından yapılmış yapboz örneği',
    desc: 'Kitabın kapağı, parça parça birleştirilen bir yapboza dönüşür. Tamamlandığında karşısında kendi yüzü vardır.' },
  { id: 'yapboz-efe', aud: 'erkek', type: 'yapboz', status: 'yakinda', title: 'Kayıp Ay Işığı Yapbozu', age: '5+ yaş',
    img: 'img/yapboz-efe.jpg', alt: 'Kayıp Ay Işığı kapağından yapılmış yapboz örneği',
    desc: 'Astronot kahramanımızın kapağı, birlikte kurulan bir yapboz olur.' },

  { id: 'bizim-masalimiz', aud: 'yetiskin', occ: 'ciftler', type: 'kitap', status: 'yakinda', icon: 'ciftler', title: 'Bizim Masalımız',
    desc: 'Tanıştığınız günden bugüne, ikinizin hikâyesi resimli bir masal kitabında. Yıl dönümü, sevgililer günü ya da evlilik teklifi için.' },
  { id: 'cift-yapbozu', aud: 'yetiskin', occ: 'ciftler', type: 'yapboz', status: 'yakinda', icon: 'yapboz', title: 'İkimizin Yapbozu',
    desc: 'Birlikte resmedildiğiniz masal sahnesi, birlikte kurulacak bir yapboz.' },
  { id: 'buyukanne', aud: 'yetiskin', occ: 'buyukler', type: 'kitap', status: 'yakinda', icon: 'buyukler', title: 'Anneannem, Babaannem',
    desc: 'Torunların gözünden büyükannenin masalı. Bayramda, doğum gününde ya da sadece “seni seviyoruz” demek için.' },
  { id: 'dede', aud: 'yetiskin', occ: 'buyukler', type: 'kitap', status: 'yakinda', icon: 'buyukler', title: 'Dedemin Masalı',
    desc: 'Dedenin anlattığı hikâyeler, bu kez onun kahraman olduğu bir kitapta.' },
  { id: 'aile-masali', aud: 'yetiskin', occ: 'aile', type: 'kitap', status: 'yakinda', icon: 'aile', title: 'Bizim Ailemizin Masalı',
    desc: 'Anne, baba, kardeşler ve evin kedisi: bütün aile aynı masalda.' },
  { id: 'dogum-gunu', aud: 'yetiskin', occ: 'dogum-gunu', type: 'kitap', status: 'yakinda', icon: 'dogum-gunu', title: 'Doğum Günü Masalı',
    desc: 'Sevdiğiniz kişinin yaşı kadar mum, hayatı kadar hikâye. Her yaşa uygun bir doğum günü hediyesi.' }
];

const GIFT_SVG = '<svg viewBox="0 0 64 64"><rect x="10" y="26" width="44" height="30" rx="2" fill="#6b1d2a" stroke="#e2b56b" stroke-width="1.2"/><rect x="7" y="19" width="50" height="9" rx="1.5" fill="#7d2534" stroke="#e2b56b" stroke-width="1.2"/><rect x="29" y="19" width="6" height="37" fill="#e2b56b"/><path d="M32 19c-6-9-15-8-13-2 1 3 7 3 13 2zM32 19c6-9 15-8 13-2-1 3-7 3-13 2z" fill="none" stroke="#e2b56b" stroke-width="1.6"/><circle cx="32" cy="40" r="6" fill="#8d2e3d" stroke="#f4dfb3" stroke-width="1"/><path d="M29.6 42.6V39a2.4 2.4 0 0 1 4.8 0v3.6" fill="none" stroke="#f4dfb3" stroke-width=".9"/></svg>';
const ARCH_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 58 V28 a14 14 0 0 1 28 0 V58" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M32 26 l1.3 5.2 5.2 1.3 -5.2 1.3 -1.3 5.2 -1.3 -5.2 -5.2 -1.3 5.2 -1.3z" fill="currentColor"/><path d="M12 58 H52" stroke="currentColor" stroke-width="2.2"/></svg>';

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

const fmt = n => n.toLocaleString('tr-TR') + ' TL';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s;
const here = () => location.pathname.split('/').pop() || 'index.html';

function fullTitle(p, name) {
  if (!p.hero) return esc(p.title);
  return `<span class="ad">${esc(cap(name) || p.hero)}</span> ${esc(p.title)}`;
}
function priceLine(p) {
  if (p.status !== 'hazir') return 'Yakında';
  const pr = PRICES[p.type];
  const known = pr ? Object.values(pr).filter(Boolean) : [];
  return known.length ? `${fmt(Math.min(...known))}’den başlayan fiyatlarla` : 'Fiyat yakında';
}

/* ---------- Gold paper-cut heroes: girls, boys, adults (home page 3D scene, Ürünlerimiz page) ---------- */
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
  { href: 'yetiskinler.html', jewel: ['#3a6458', '#1f3f37', '#0a1a17'], parts: [
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
const currentProduct = () => PRODUCTS.find(x => x.id === productId());
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
  }
  document.addEventListener('click', e => {
    const w = e.target.closest('a[href="#whatsapp"]');
    if (!w) return;
    e.preventDefault();
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
  menu.innerHTML = `<button class="btn ghost close" type="button" data-close-menu>Kapat</button>
    <nav><a href="./"><small>Masaliya</small>Ana Sayfa</a>${NAV_ALL.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>`;
  document.body.appendChild(menu);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-menu]')) { menu.hidden = false; menu.querySelector('a').focus(); }
    if (e.target.closest('[data-close-menu]') || (e.target.closest('#menu a'))) menu.hidden = true;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true; });

  const foot = document.getElementById('site-foot');
  if (foot) {
    foot.className = 'site-foot';
    foot.innerHTML = `<div class="wrap">
      <a class="brand" href="./">${ARCH_SVG}<span>MASALİYA</span></a>
      <nav aria-label="Alt menü">${NAV_ALL.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
      <a class="foot-wa" href="${waLink()}"${WHATSAPP ? ' target="_blank" rel="noopener"' : ''}>${WA_SVG} WhatsApp’tan özel danışmanınıza yazın</a>
      <p>Kişiye özel masal kitapları, boyama kitapları ve yapbozlar · masaliya.com</p>
      <p>© 2026 Masaliya</p>
    </div>`;
  }
}

/* ---------- Product card ---------- */
function card(p) {
  const visualClass = p.icon ? 'visual icon' : p.paper ? 'visual paper' : 'visual';
  const visual = p.icon ? ICONS[p.icon] : `<img src="${p.img}" alt="${esc(p.alt)}" loading="lazy">`;
  const kind = p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one;
  return `<a class="card${p.type === 'kitap' && !p.icon ? ' book' : ''}" href="${productHref(p)}">
    <div class="${visualClass}">${p.status === 'yakinda' ? '<span class="badge">Yakında</span>' : ''}${visual}</div>
    <div class="meta"><span>${kind}</span>${p.age ? `<span>${p.age}</span>` : ''}</div>
    <h3>${fullTitle(p)}</h3>
    <p>${esc(p.desc)}</p>
    <p class="price">${priceLine(p)}</p>
  </a>`;
}

/* ---------- Collection page (kizlar / erkekler / yetiskinler) ---------- */
function renderCollection(aud) {
  const tabsEl = document.getElementById('tabs'), grid = document.getElementById('grid');
  const isAdult = aud === 'yetiskin';
  const filters = isAdult
    ? [['hepsi', 'Hepsi'], ...Object.entries(OCCASIONS)]
    : Object.values(TYPES).map(t => [t.tab, t.name]);
  const items = PRODUCTS.filter(p => p.aud === aud);
  function show() {
    let key = location.hash.slice(1);
    if (!filters.some(([k]) => k === key)) key = filters[0][0];
    tabsEl.innerHTML = filters.map(([k, t]) => `<a class="tab" href="#${k}" aria-current="${k === key}">${t}</a>`).join('');
    const list = isAdult
      ? items.filter(p => key === 'hepsi' || p.occ === key)
      : items.filter(p => TYPES[p.type].tab === key);
    grid.className = `grid${list.length === 1 ? ' n1' : list.length === 2 ? ' n2' : ''}`;
    grid.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">Bu bölüm için yeni ürünler hazırlanıyor.</p>';
  }
  addEventListener('hashchange', show);
  show();
}

/* ---------- Product page ---------- */
function renderProduct() {
  const root = document.getElementById('product');
  function show() {
    const p = currentProduct();
    if (!p) {
      // an address we don't know: say so instead of quietly showing another book
      document.title = 'Bulunamadı · Masaliya';
      root.innerHTML = `<div class="notfound"><p class="eyebrow">Sayfa bulunamadı</p><h1>Bu masal rafta yok</h1><p class="lede">Aradığınız ürün kaldırılmış ya da adresi değişmiş olabilir.</p><a class="btn" href="urunler.html">Ürünlerimize göz atın</a></div>`;
      document.getElementById('inside').hidden = true; document.getElementById('related').innerHTML = '';
      return;
    }
    const a = AUDIENCES[p.aud];
    if (!document.body.dataset.product) document.title = `${p.hero ? p.hero + ' ' : ''}${p.title} · Masaliya`;
    const crumbs = document.getElementById('crumbs');
    crumbs.innerHTML = `<a href="${a.page}">${a.name}</a> · ${p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].name}`;

    const shots = p.img ? [[p.img, p.alt], ...(p.extra || [])] : [];
    const gallery = p.icon
      ? `<div class="gallery"><div class="main" style="display:grid;place-items:center;background:radial-gradient(80% 60% at 50% 35%, rgba(141,46,61,.75), #24090f 75%);border-radius:200px 200px 8px 8px"><span style="width:34%;color:var(--gold)">${ICONS[p.icon]}</span></div></div>`
      : `<div class="gallery"><div class="main"${p.paper ? ' style="background:#f6f1e6"' : ''}><img id="g-main" src="${shots[0][0]}" alt="${esc(shots[0][1])}"></div>
         ${shots.length > 1 ? `<div class="thumbs">${shots.map((s, i) => `<button type="button" data-shot="${i}" aria-current="${i === 0}" aria-label="${esc(s[1])}"><img src="${s[0]}" alt=""></button>`).join('')}</div>` : ''}</div>`;

    const pr = PRICES[p.type] || {};
    const formats = FORMATS[p.type] || [];
    const orderable = p.status === 'hazir';
    // options without a price can't be chosen yet; the first priced one starts selected
    const firstPriced = (formats.find(([k]) => pr[k]) || [])[0];
    const options = formats.length ? `
        <div class="covers" role="radiogroup" aria-label="Seçenekler" style="--n:${formats.length}">
          ${formats.map(([k, name, note]) => `<label class="cover-opt${pr[k] ? '' : ' off'}"><input type="radio" name="cover" value="${k}" data-price="${pr[k] || ''}"${pr[k] ? '' : ' disabled'}${k === firstPriced ? ' checked' : ''}><b>${name}</b><span>${pr[k] ? fmt(pr[k]) : 'Fiyat yakında'}</span><small>${note}</small></label>`).join('')}
        </div>` : '';
    const buy = orderable ? `
      <form id="buy" class="info" style="gap:18px">
        ${p.hero ? `<label class="field" for="hero-name"><span class="step">1 · Kahramanın adı</span><input id="hero-name" class="script" type="text" maxlength="16" placeholder="${p.hero}" autocomplete="off"></label>` : ''}
        <div class="field"><span class="step">2 · Üç fotoğraf</span>
          <div class="slots">
            ${['Önden', 'Hafif yandan', 'Gülümserken'].map((t, i) => `<label class="slot" for="ph-${i + 1}"><input id="ph-${i + 1}" type="file" accept="image/*"><span class="slot-img"></span><span class="slot-plus" aria-hidden="true">+</span><b>${i + 1} · ${t}</b></label>`).join('')}
          </div>
          <span class="slot-hint">Yüzün net göründüğü 3 fotoğraf seçin. Fotoğraflar yalnızca bu kitap için kullanılır.</span>
        </div>
        <span class="step">3 · Seçenekler</span>
        ${options}
        ${p.type === 'kitap' ? `
        <div class="sets" role="radiogroup" aria-label="Set">
          ${SETS.map((st, i) => {
            const parts = st.items.map(([t, f]) => (PRICES[t] || {})[f]);
            const ready = parts.every(Boolean);
            return `<label class="set-opt${ready ? '' : ' off'}"><input type="radio" name="set" value="${st.id}" data-discount="${st.discount}" data-extra="${ready ? parts.reduce((a, b) => a + b, 0) : ''}"${i === 0 ? ' checked' : ''}${ready ? '' : ' disabled'}>
              <b>${st.name}</b>${st.note ? `<small>${st.note}</small>` : ''}<span>${st.discount ? `%${Math.round(st.discount * 100)} avantajlı` : ''}${ready || !st.items.length ? '' : ' · fiyat yakında'}</span></label>`;
          }).join('')}
        </div>
        <label class="pdf-opt${PDF_ADDON_PRICE ? '' : ' off'}" for="pdf-addon" id="pdf-wrap"><input type="checkbox" id="pdf-addon"${PDF_ADDON_PRICE ? '' : ' disabled'}><span><b>+ Dijital kopya (PDF)</b><small>Basılı kitabın yanında tablet ve telefon için</small></span><em>${PDF_ADDON_PRICE ? '+ ' + fmt(PDF_ADDON_PRICE) : 'Fiyat yakında'}</em></label>` : ''}
        <label class="gift-opt" for="gift-box" id="gift-wrap">
          <input type="checkbox" id="gift-box">
          <span class="gift-art" aria-hidden="true">${GIFT_SVG}</span>
          <span class="gift-text"><b>Hediye kutusu</b><small>Hediye kutusu, kurdele, Masaliya mührü ve el yazısıyla not kartı</small></span>
          <span class="gift-price">${GIFT_BOX_PRICE ? '+ ' + fmt(GIFT_BOX_PRICE) : 'Fiyat yakında'}</span>
        </label>
        <label class="field" for="gift-note" id="gift-note-wrap" hidden>Not kartına ne yazalım?<textarea id="gift-note" rows="3" maxlength="240" placeholder="Sevgili Elif’e, ilk masalı olsun diye…"></textarea></label>
        <div class="total"><span>Toplam</span><strong id="total"></strong></div>
        <span class="step">4 · İletişim</span>
        <div class="contact">
          <label class="field" for="c-phone">Telefon<input id="c-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx"></label>
          <label class="field" for="c-email">E-posta<input id="c-email" type="email" autocomplete="email" placeholder="ornek@mail.com"></label>
        </div>
        <button class="btn" type="submit">Siparişi Başlat</button>
        <p class="form-note" id="buy-note" aria-live="polite"></p>
      </form>`
      : `
      <form id="interest" class="info" style="gap:14px">
        ${options}
        <p class="desc">Bu ürün şu an atölyede hazırlanıyor. Hazır olduğunda ilk size haber verelim.</p>
        <div class="inline-form"><label for="int-email" hidden>E-posta</label><input id="int-email" type="email" required placeholder="E-posta adresiniz"><button class="btn ghost" type="submit">Haber Ver</button></div>
        <p class="form-note" id="int-note" aria-live="polite"></p>
      </form>`;

    root.innerHTML = `<div class="product">
      ${gallery}
      <div class="info">
        <p class="eyebrow" id="crumbs-inline">${a.name}</p>
        <h1 id="p-title">${fullTitle(p)}</h1>
        <div class="meta"><span>${p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one}</span>${p.age ? `<span>${p.age}</span>` : ''}<span>${p.status === 'hazir' ? 'A4' : 'Yakında'}</span></div>
        <p class="desc">${esc(p.desc)}</p>
        ${buy}
        <div class="assure"><ul>
          <li>${p.type === 'yapboz' ? 'En geç 3 gün içinde tasarımı size gönderir' : 'En geç 3 gün içinde bütün sayfaları size gönderir'}, onayınızı bekleriz.</li>
          <li>Dijital sürüm onayınızın hemen ardından gönderilir; basılı ürün en geç bir hafta içinde kargoda.</li>
          <li>Fotoğraflar yalnızca bu ürün için kullanılır, teslimden sonra silinir.</li>
          ${p.type === 'kitap' ? '<li>Sesli masal: kitaptaki QR kodu okutun, masalı anlatıcımızın sesinden dinleyin.</li>' : ''}
          <li><a href="gizlilik.html">Gizlilik sözümüzü okuyun</a></li>
        </ul></div>
      </div>
    </div>`;

    // Gallery thumbs
    root.querySelectorAll('[data-shot]').forEach(b => b.addEventListener('click', () => {
      const s = shots[+b.dataset.shot], m = document.getElementById('g-main');
      m.src = s[0]; m.alt = s[1];
      root.querySelectorAll('[data-shot]').forEach(x => x.setAttribute('aria-current', String(x === b)));
    }));
    // Live name
    const nameIn = document.getElementById('hero-name');
    if (nameIn) {
      const sync = () => { document.getElementById('p-title').innerHTML = fullTitle(p, nameIn.value.trim()); try { sessionStorage.setItem('masaliya-hero', cap(nameIn.value.trim())); } catch (e) {} };
      try { const saved = sessionStorage.getItem('masaliya-hero'); if (saved) { nameIn.value = saved; sync(); } } catch (e) {}
      nameIn.addEventListener('input', sync);
    }
    // Gift box and total
    const giftBox = document.getElementById('gift-box');
    let giftWanted = false;   // what the customer chose, kept while a digital format hides the box
    function total() {
      const c = root.querySelector('input[name="cover"]:checked'), t = document.getElementById('total');
      if (!t || !giftBox) return;
      // the e-book has nothing to put in a box
      const digital = !!c && c.value === 'digital';
      document.getElementById('gift-wrap').hidden = digital;
      giftBox.checked = !digital && giftWanted;
      document.getElementById('gift-note-wrap').hidden = !giftBox.checked;
      // a set adds its parts and takes the discount off the whole; the PDF copy goes with printed books only
      const set = root.querySelector('input[name="set"]:checked'), pdf = document.getElementById('pdf-addon');
      if (pdf) { document.getElementById('pdf-wrap').hidden = digital; if (digital) pdf.checked = false; }
      if (!c || !c.dataset.price) { t.textContent = 'Fiyat yakında'; return; }
      let sum = +c.dataset.price;
      if (set && set.dataset.extra) sum = Math.round((sum + +set.dataset.extra) * (1 - +set.dataset.discount));
      if (pdf && pdf.checked) sum += PDF_ADDON_PRICE || 0;
      sum += giftBox.checked ? (GIFT_BOX_PRICE || 0) : 0;
      t.textContent = fmt(sum) + (giftBox.checked && !GIFT_BOX_PRICE ? ' + hediye kutusu' : '');
    }
    if (giftBox) giftBox.addEventListener('change', () => { giftWanted = giftBox.checked; total(); });
    root.querySelectorAll('input[name="cover"], input[name="set"], #pdf-addon').forEach(r => r.addEventListener('change', total));
    total();
    // three photo slots: preview each chosen photo
    const slots = [...root.querySelectorAll('.slot')];
    slots.forEach(slot => {
      const input = slot.querySelector('input'), img = slot.querySelector('.slot-img');
      input.addEventListener('change', () => {
        const f = input.files[0];
        const ok = !!f && f.type.startsWith('image/');
        slot.classList.toggle('filled', ok);
        img.style.backgroundImage = ok ? `url("${URL.createObjectURL(f)}")` : '';
      });
    });
    const buyF = document.getElementById('buy');
    if (buyF) buyF.addEventListener('submit', e => {
      e.preventDefault();
      const note = document.getElementById('buy-note');
      const c = root.querySelector('input[name="cover"]:checked');
      const name = nameIn ? nameIn.value.trim() : 'x';
      const rawPhone = document.getElementById('c-phone').value.trim(), phone = rawPhone.replace(/\D/g, '');
      const mail = document.getElementById('c-email').value.trim();
      if (!c || !c.dataset.price) { note.textContent = 'Bu ürünün fiyatı yakında açıklanacak; şimdilik sipariş alamıyoruz.'; return; }
      if (!name) { note.textContent = 'Lütfen kahramanın adını yazın.'; nameIn.focus(); return; }
      const photos = slots.filter(sl => sl.classList.contains('filled')).length;
      if (photos < 3) { note.textContent = `Lütfen 3 fotoğrafın hepsini ekleyin (${photos}/3).`; return; }
      if (!/^[\d\s()+-]+$/.test(rawPhone) || phone.length < 10 || phone.length > 13) { note.textContent = 'Lütfen telefon numaranızı yalnızca rakamlarla yazın, örneğin 0532 123 45 67.'; document.getElementById('c-phone').focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { note.textContent = 'Lütfen geçerli bir e-posta adresi yazın.'; document.getElementById('c-email').focus(); return; }
      note.textContent = 'Önizleme sürümü: telefon doğrulama, fotoğraf yükleme ve ödeme adımı site yayına alınırken bağlanacak.';
    });
    const intF = document.getElementById('interest');
    if (intF) intF.addEventListener('submit', e => { e.preventDefault(); document.getElementById('int-note').textContent = 'Önizleme sürümü: haber listesi site yayına alınırken bağlanacak.'; });

    // Spreads
    // inside the book: spreads for story books, single pages for coloring books
    const viewer = document.getElementById('inside'), inner = p.spreads || p.pages;
    viewer.hidden = !inner;
    if (inner) { viewer.querySelector('.spread').classList.toggle('portrait', !p.spreads); setupViewer(inner); }

    // Related
    const rel = PRODUCTS.filter(x => x.aud === p.aud && x.id !== p.id).slice(0, 3);
    document.getElementById('related').innerHTML = rel.map(card).join('');
    scrollTo(0, 0);
  }
  addEventListener('hashchange', () => { if (document.body.dataset.product) return; show(); const b = document.getElementById('back'); if (b) b.href = backHref(); });
  show();
}

function setupViewer(spreads) {
  let cur = 0;
  const img = document.getElementById('spread-img'), counter = document.getElementById('counter'), strip = document.getElementById('vthumbs');
  // every page as a thumbnail, so the whole book can be seen at a glance
  strip.classList.toggle('portrait', document.querySelector('#inside .spread').classList.contains('portrait'));
  strip.innerHTML = spreads.map(([src, alt], i) => `<button type="button" data-i="${i}" aria-label="Sayfa ${i + 1}: ${esc(alt)}"><img src="${src}" alt="" loading="lazy"></button>`).join('');
  function go(i) {
    cur = (i + spreads.length) % spreads.length;
    img.style.opacity = 0;
    setTimeout(() => { img.src = spreads[cur][0]; img.alt = spreads[cur][1]; img.style.opacity = 1; }, 250);
    counter.textContent = `${cur + 1} / ${spreads.length}`;
    strip.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === cur)));
    const active = strip.children[cur]; if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  img.src = spreads[0][0]; img.alt = spreads[0][1]; counter.textContent = `1 / ${spreads.length}`;
  strip.querySelectorAll('button').forEach((b, k) => { b.setAttribute('aria-current', String(k === 0)); b.onclick = () => go(k); });
  document.getElementById('prev').onclick = () => go(cur - 1);
  document.getElementById('next').onclick = () => go(cur + 1);
}

document.addEventListener('DOMContentLoaded', () => {
  renderChrome();
  const page = document.body.dataset.page;
  if (AUDIENCES[page]) renderCollection(page);
  if (page === 'urun') {
    // old urun.html#id links forward to the product's own page
    const p = currentProduct();
    if (!document.body.dataset.product && p) { location.replace(productHref(p)); return; }
    renderProduct();
  }
});
