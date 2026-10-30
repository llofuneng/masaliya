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
  boyama: { print: 600, digital: null },
  yapboz: { std: 900 }
};
const GIFT_BOX_PRICE = 300;   // gift box add-on, TL; null shows "Fiyat yakında"
const PDF_ADDON_PRICE = null;  // digital copy added to a printed book, TL
/* Masal Seti: the same hero across several products, priced together.
   The set price is the sum of the parts (printed coloring book, medium puzzle) minus the discount. */
const SETS = [
  { id: 'tek', name: 'Yalnızca kitap', items: [], discount: 0 },
  { id: 'masal-seti', name: 'Masal Seti', note: 'Kitap + boyama kitabı, aynı kahramanla', items: [['boyama', 'print']], discount: .10 },
  { id: 'buyuk-masal-seti', name: 'Büyük Masal Seti', note: 'Kitap + boyama kitabı + yapboz', items: [['boyama', 'print'], ['yapboz', 'std']], discount: .15 }
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
  yapboz: []   // one size only: nothing to choose
};

/* WhatsApp concierge: put the number here in international format without "+", e.g. '905321234567'. */
const WHATSAPP = '';

const SPREADS_DUA = [
  ['img/sihirli-kutuphane-s1.jpg', 'Dua tozlu Masallar Kitabı’nı buluyor'],
  ['img/sihirli-kutuphane-s2.jpg', 'Masal Diyarı’nda konuşan kedi Mürekkep'],
  ['img/sihirli-kutuphane-s3.jpg', 'Bulutların üstündeki ip köprüde küçük şövalye Aras'],
  ['img/sihirli-kutuphane-s4.jpg', 'Yalnız dev Toprak ile paylaşılan simit'],
  ['img/sihirli-kutuphane-s5.jpg', 'Yüz yıldır kapıyı bekleyen taş aslan'],
  ['img/sihirli-kutuphane-s6.jpg', 'Sihirli Kütüphane’de altın sayfalar'],
  ['img/sihirli-kutuphane-s7.jpg', 'Dua okul kütüphanesinde ilk cümleyi yazıyor']
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
  ['img/deniz-kizi-kralligi-s1.jpg', 'Lavin kumsalda deniz kabuğunu kulağına tutuyor'],
  ['img/deniz-kizi-kralligi-s2.jpg', 'Deniz kızı Mira dalgaların arasından çıkıyor'],
  ['img/deniz-kizi-kralligi-s3.jpg', 'Yan yan yürüyen yengeç ilk inciyi veriyor'],
  ['img/deniz-kizi-kralligi-s4.jpg', 'Bilge kaplumbağa ikinci inciyi sırtında taşıyor'],
  ['img/deniz-kizi-kralligi-s5.jpg', 'Parlayan balıklar mağaranın yolunu gösteriyor'],
  ['img/deniz-kizi-kralligi-s6.jpg', 'Lavin ve Mira el ele üçüncü inciyi buluyor'],
  ['img/deniz-kizi-kralligi-s7.jpg', 'Deniz Kızı Krallığı’nda şenlik']
];

const SPREADS_DINO = [
  ['img/dinozorlarin-dogum-gunu-s1.jpg', 'Hızır Ali dinozor kitabını açıyor, küçük yeşil dinozor göz kırpıyor'],
  ['img/dinozorlarin-dogum-gunu-s2.jpg', 'Yemyeşil ormanda küçük dinozor Fıstık ile tanışma'],
  ['img/dinozorlarin-dogum-gunu-s3.jpg', 'Sırtı dikenli dinozorun üstünden meyve toplamak'],
  ['img/dinozorlarin-dogum-gunu-s4.jpg', 'Kanatlı dinozor Rüzgâr ile vadinin üstünde uçuş'],
  ['img/dinozorlarin-dogum-gunu-s5.jpg', 'En küçük dinozor Minik ile yapraktan bir hediye'],
  ['img/dinozorlarin-dogum-gunu-s6.jpg', 'Koca Dede’ye sürpriz doğum günü partisi'],
  ['img/dinozorlarin-dogum-gunu-s7.jpg', 'Evde, elinde ışıl ışıl parlayan yaprak']
];

/* status: 'hazir' = can be ordered now, 'yakinda' = coming soon (interest list) */
const PRODUCTS = [
  { id: 'sihirli-kutuphane', coverTitle: { box: [.015, .235], sub: 've Sihirli Kütüphane' }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Dua', title: 've Sihirli Kütüphane', age: '7–12 yaş',
    img: 'img/sihirli-kutuphane-kapak.jpg', alt: 'Dua ve Sihirli Kütüphane kapağı: parlayan bir kitap tutan kız ve kedi',
    desc: 'Yağmurlu bir öğleden sonra, okul kütüphanesinde tozlu bir kitap açılır ve kahramanımız kendini sonları kaybolmuş masalların içinde bulur. Korkan küçük bir şövalye, yalnız bir dev ve yüz yıldır bekleyen bir taş aslan: hepsinin masalı onun yardımını bekliyor. Cesaretin, iyiliğin, dürüstlüğün ve kendine inanmanın masalı.',
    extra: [['img/sihirli-kutuphane-ithaf.jpg', 'Kişisel ithaf sayfası'], ['img/sihirli-kutuphane-son.jpg', 'Hediye eden kişinin sayfası'], ['img/sihirli-kutuphane-arka.jpg', 'Arka kapak']], spreads: SPREADS_DUA },
  { id: 'deniz-kizi-kralligi', coverTitle: { box: [0, .215], sub: 've Deniz Kızı Krallığı' }, aud: 'kiz', type: 'kitap', status: 'hazir', hero: 'Lavin', title: 've Deniz Kızı Krallığı', age: '2–7 yaş',
    img: 'img/deniz-kizi-kralligi-kapak.jpg', alt: 'Lavin ve Deniz Kızı Krallığı kapağı: parlayan deniz kabuğu tutan kız ve deniz kızı',
    desc: 'Bir yaz sabahı kumsalda şarkı söyleyen bir deniz kabuğu. Küçük deniz kızı Mira ile kaybolan üç inciyi aramak için denizin derinliklerine bir yolculuk.',
    extra: [['img/deniz-kizi-kralligi-ithaf.jpg', 'Kişisel ithaf sayfası'], ['img/deniz-kizi-kralligi-son.jpg', 'Hediye eden kişinin sayfası'], ['img/deniz-kizi-kralligi-arka.jpg', 'Arka kapak']], spreads: SPREADS_LAVIN },
  { id: 'dinozorlarin-dogum-gunu', coverTitle: { box: [0, .215], sub: 've Dinozorların Doğum Günü' }, aud: 'erkek', type: 'kitap', status: 'hazir', hero: 'Hızır Ali', title: 've Dinozorların Doğum Günü', age: '2–7 yaş',
    img: 'img/dinozorlarin-dogum-gunu-kapak.jpg', alt: 'Hızır Ali ve Dinozorların Doğum Günü kapağı: pasta tutan çocuk ve yavru dinozorlar',
    desc: 'Bir akşam dinozor kitabının sayfasındaki küçük dinozor göz kırpar ve kahramanımız kendini yemyeşil bir ormanda bulur. Koca Dede yüz yaşına giriyor; Fıstık, Rüzgâr ve Minik ile birlikte ona sürpriz bir parti hazırlanır. Paylaşınca büyüyen mutluluğun masalı.',
    extra: [['img/dinozorlarin-dogum-gunu-ithaf.jpg', 'Kişisel ithaf sayfası'], ['img/dinozorlarin-dogum-gunu-son.jpg', 'Hediye eden kişinin sayfası'], ['img/dinozorlarin-dogum-gunu-arka.jpg', 'Arka kapak']], spreads: SPREADS_DINO },

  { id: 'deniz-kizi-kralligi-boyama', coverTitle: { box: [0, .215], sub: 've Deniz Kızı Krallığı' }, aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Lavin', title: 've Deniz Kızı Krallığı', age: '3–7 yaş',
    img: 'img/deniz-kizi-kralligi-boyama-kapak.jpg', alt: 'Lavin ve Deniz Kızı Krallığı boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 8 boyama sayfası ve 7 etkinlik: dalgalar, labirent, sayma, eşini bulma, farklı olanı bulma, noktaları birleştirme ve kendi resmin.',
    extra: [['img/deniz-kizi-kralligi-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/deniz-kizi-kralligi-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_LAVIN },
  { id: 'sihirli-kutuphane-boyama', coverTitle: { box: [.015, .235], sub: 've Sihirli Kütüphane' }, aud: 'kiz', type: 'boyama', status: 'hazir', hero: 'Dua', title: 've Sihirli Kütüphane', age: '7–12 yaş',
    img: 'img/sihirli-kutuphane-boyama-kapak.jpg', alt: 'Dua ve Sihirli Kütüphane boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 7 boyama sayfası ve 7 etkinlik: şifreli mesaj, kelime avı, harfli labirent, bilmeceler, sihirli kareler, masal bulmacası ve kendi masalını yazacağın bir sayfa.',
    extra: [['img/sihirli-kutuphane-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/sihirli-kutuphane-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_DUA },
  { id: 'dinozorlarin-dogum-gunu-boyama', coverTitle: { box: [0, .215], sub: 've Dinozorların Doğum Günü' }, aud: 'erkek', type: 'boyama', status: 'hazir', hero: 'Hızır Ali', title: 've Dinozorların Doğum Günü', age: '3–7 yaş',
    img: 'img/dinozorlarin-dogum-gunu-boyama-kapak.jpg', alt: 'Hızır Ali ve Dinozorların Doğum Günü boyama ve etkinlik kitabının kapağı',
    desc: '«Masalın kahramanı sensin, renkleri de sen seç!» 8 boyama sayfası ve 7 etkinlik: yollar, labirent, sayma, eşini bulma, farklı olanı bulma, noktaları birleştirme ve kendi resmin.',
    extra: [['img/dinozorlarin-dogum-gunu-boyama-ornek.jpg', 'Örnek sayfalar: renkli kitaptan sahneler'], ['img/dinozorlarin-dogum-gunu-boyama-arka.jpg', 'Arka kapak']], pages: PAGES_BOYAMA_DINO },

  { id: 'sihirli-kutuphane-yapboz', aud: 'kiz', type: 'yapboz', status: 'hazir', title: 'Sihirli Kütüphane Yapbozu', age: '6+ yaş',
    img: 'img/sihirli-kutuphane-yapboz.jpg', alt: 'Sihirli Kütüphane yapbozu: kütüphanede parlayan kitap tutan kız ve kedi, parça çizgileriyle',
    desc: 'Kitabın kapağındaki sahne yazısız hâliyle yapboz olur: uçan sayfalar, kedi Mürekkep ve ışık saçan kitap. Son parça yerine oturduğunda karşısında kendi yüzü vardır.',
    extra: [['img/sihirli-kutuphane-yapboz-resim.jpg', 'Yapbozun resmi, bütün hâliyle']] },
  { id: 'deniz-kizi-kralligi-yapboz', aud: 'kiz', type: 'yapboz', status: 'hazir', title: 'Deniz Kızı Krallığı Yapbozu', age: '3+ yaş',
    img: 'img/deniz-kizi-kralligi-yapboz.jpg', alt: 'Deniz Kızı Krallığı yapbozu: parlayan deniz kabuğu tutan kız ve deniz kızı, parça çizgileriyle',
    desc: 'Kitabın kapağındaki sahne yazısız hâliyle yapboz olur: pembe şato, deniz kızı Mira ve ışıl ışıl deniz kabuğu. Son parça yerine oturduğunda karşısında kendi yüzü vardır.',
    extra: [['img/deniz-kizi-kralligi-yapboz-resim.jpg', 'Yapbozun resmi, bütün hâliyle']] },
  { id: 'dinozorlarin-dogum-gunu-yapboz', aud: 'erkek', type: 'yapboz', status: 'hazir', title: 'Dinozorların Doğum Günü Yapbozu', age: '4+ yaş',
    img: 'img/dinozorlarin-dogum-gunu-yapboz.jpg', alt: 'Dinozorların Doğum Günü yapbozu: pasta tutan çocuk ve yavru dinozorlar, parça çizgileriyle',
    desc: 'Kitabın kapağındaki sahne yazısız hâliyle yapboz olur: Koca Dede, yavru dinozorlar ve meyveli pasta. Son parça yerine oturduğunda karşısında kendi yüzü vardır.',
    extra: [['img/dinozorlarin-dogum-gunu-yapboz-resim.jpg', 'Yapbozun resmi, bütün hâliyle']] }
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

const thumb = src => src.replace('img/', 'img/t/');
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
  const pr = PRICES[p.type];
  if (p.type === 'kitap' && pr && pr.hard) return `Sert kapak ${fmt(pr.hard)}${pr.soft ? ` · yumuşak kapak ${fmt(pr.soft)}` : ''}`;
  const known = pr ? Object.values(pr).filter(Boolean) : [];
  return known.length ? fmt(Math.min(...known)) : 'Fiyat yakında';
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
// addresses used before products were named after their stories
const OLD_IDS = { dua: 'sihirli-kutuphane', lavin: 'deniz-kizi-kralligi', 'boyama-lavin': 'deniz-kizi-kralligi-boyama', 'boyama-dua': 'sihirli-kutuphane-boyama', 'yapboz-dua': 'sihirli-kutuphane-yapboz' };
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
  const mark = h => (isCurrent(h, cur) && h !== 'urunler.html') || h === cur ? ' aria-current="page"' : '';
  menu.innerHTML = `<button class="btn ghost close" type="button" data-close-menu>Kapat</button>
    <nav><a href="./"${cur === 'index.html' || cur === '' ? ' aria-current="page"' : ''}>Ana Sayfa</a>
      <a href="urunler.html"${mark('urunler.html')}>Ürünlerimiz</a>
      <div class="menu-sub">${Object.values(AUDIENCES).map(a => `<a href="${a.page}"${a.page === cur ? ' aria-current="page"' : ''}>${a.name}</a>`).join('')}</div>
      ${NAV_ALL.slice(1).map(([h, t]) => `<a href="${h}"${mark(h)}>${t}</a>`).join('')}</nav>`;
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
      <nav aria-label="Alt menü">${NAV_ALL.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
      <a class="foot-wa" href="${waLink()}"${WHATSAPP ? ' target="_blank" rel="noopener"' : ''}>${WA_SVG} WhatsApp’tan özel danışmanınıza yazın</a>
      <p>Kişiye özel masal kitapları, boyama kitapları ve yapbozlar · masaliya.com</p>
      <p>© 2026 Masaliya</p>
    </div>`;
  }
}

/* ---------- Product card ---------- */
function card(p) {
  const visual = `<img src="${p.img}" alt="${esc(p.alt)}" loading="lazy">`;
  const kind = p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one;
  return `<a class="card${p.type === 'kitap' ? ' book' : ''}" href="${productHref(p)}">
    <div class="visual">${p.status === 'yakinda' ? '<span class="badge">Yakında</span>' : ''}${visual}</div>
    <div class="meta"><span>${kind}</span>${p.age ? `<span>${p.age}</span>` : ''}</div>
    <h3>${fullTitle(p)}${p.type !== 'kitap' && p.aud !== 'yetiskin' ? `<small class="t-kind">${TYPES[p.type].one}</small>` : ''}</h3>
    <p>${esc(p.desc)}</p>
    <p class="price">${priceLine(p)}</p>
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
        <p class="lede">Çiftler, büyükanne ve büyükbabalar, bütün aile ve doğum günleri için kişiye özel kitaplar ve yapbozlar hazırlıyoruz. İlk kitaplar hazır olduğunda size haber verelim.</p>
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

/* ---------- Product page helpers ---------- */
const trDate = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

// a cover with the visitor's name set in place of the sample hero's name
function drawCoverName(canvas, img, p, name) {
  const W = img.naturalWidth, H = img.naturalHeight, [y0, y1] = p.coverTitle.box;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.drawImage(img, 0, 0, W, H);
  // soften the painted title away, then set the new one
  c.save(); c.beginPath(); c.rect(0, y0 * H, W, (y1 - y0) * H); c.clip();
  c.filter = 'blur(22px)'; c.drawImage(img, -40, -40, W + 80, H + 80); c.filter = 'none';
  const fade = c.createLinearGradient(0, y0 * H, 0, y1 * H);
  fade.addColorStop(0, 'rgba(20,10,8,.10)'); fade.addColorStop(.5, 'rgba(20,10,8,.22)'); fade.addColorStop(1, 'rgba(20,10,8,.06)');
  c.fillStyle = fade; c.fillRect(0, y0 * H, W, (y1 - y0) * H);
  c.restore();
  const mid = (y0 + (y1 - y0) * .58) * H;
  let size = W * .2;
  c.textAlign = 'center'; c.shadowColor = 'rgba(30,10,4,.55)'; c.shadowBlur = W * .02;
  do { c.font = `italic 500 ${size}px "Cormorant Garamond", Garamond, serif`; size -= 2; } while (c.measureText(name).width > W * .8 && size > W * .07);
  const g = c.createLinearGradient(0, mid - size, 0, mid);
  g.addColorStop(0, '#fff6dc'); g.addColorStop(.6, '#f1d08e'); g.addColorStop(1, '#c9974a');
  c.fillStyle = g; c.fillText(name, W / 2, mid);
  c.font = `italic 500 ${W * .052}px "Cormorant Garamond", Garamond, serif`; c.fillStyle = '#fff2d6';
  c.fillText(p.coverTitle.sub, W / 2, mid + W * .075);
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
    const gallery = `<div class="gallery"><div class="main${p.type === 'yapboz' ? ' puzzle' : ''}"><img id="g-main" src="${shots[0][0]}" alt="${esc(shots[0][1])}"></div>
         ${shots.length > 1 ? `<div class="thumbs">${shots.map((s, i) => `<button type="button" data-shot="${i}" aria-current="${i === 0}" aria-label="${esc(s[1])}"><img src="${thumb(s[0])}" alt=""></button>`).join('')}</div>` : ''}</div>`;

    const pr = PRICES[p.type] || {};
    const formats = FORMATS[p.type] || [];
    const orderable = p.status === 'hazir';
    // options without a price can't be chosen yet; the first priced one starts selected
    const firstPriced = (formats.find(([k]) => pr[k]) || [])[0];
    const singlePrice = formats.length ? null : Object.values(pr).find(Boolean) || null;
    const options = formats.length ? `
        <div class="covers" role="radiogroup" aria-label="Seçenekler" style="--n:${formats.length}">
          ${formats.map(([k, name, note]) => `<label class="cover-opt${pr[k] ? '' : ' off'}"><input type="radio" name="cover" value="${k}" data-price="${pr[k] || ''}"${pr[k] ? '' : ' disabled'}${k === firstPriced ? ' checked' : ''}><b>${name}</b><span>${pr[k] ? fmt(pr[k]) : 'Fiyat yakında'}</span><small>${note}</small></label>`).join('')}
        </div>` : '';
    const buy = orderable ? `
      <form id="buy" class="info" style="gap:18px">
        ${p.hero ? `<label class="field" for="hero-name"><span class="step">1 · Kahramanın adı</span><input id="hero-name" class="script" type="text" maxlength="16" placeholder="${p.hero}" autocomplete="off"><small class="hint">Bu isim kapakta ve her sayfada yer alır.</small></label>` : ''}
        ${p.type === 'kitap' ? `
        <label class="field" for="ithaf">İthaf · isteğe bağlı<textarea id="ithaf" rows="2" maxlength="160" placeholder="Bu kitap, cesur ve iyi kalpli ${p.hero} için yazıldı."></textarea><small class="hint">Kitabın ilk sayfasına yazılır. Boş bırakırsanız bu cümleyi kullanırız.</small></label>
        <label class="field" for="giver">Hediye eden · isteğe bağlı<input id="giver" type="text" maxlength="60" autocomplete="off" placeholder="Anneannen ve deden"><small class="hint">Kitabın son sayfasındaki hediye sayfasına yazılır.</small></label>` : ''}
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
        <button class="btn" type="submit">Siparişi gönder</button>
        <p class="form-note" id="buy-note" aria-live="polite"></p>
      </form>`
      : `
      <form id="interest" class="info" style="gap:14px">
        ${options}
        <p class="desc">Bu ürün şu an atölyede hazırlanıyor. Hazır olduğunda ilk size haber verelim.</p>
        <div class="inline-form"><label for="int-email" hidden>E-posta</label><input id="int-email" type="email" required placeholder="E-posta adresiniz"><button class="btn ghost" type="submit">Haber Ver</button></div>
        <p class="form-note" id="int-note" aria-live="polite"></p>
      </form>`;

    const inner = p.spreads || p.pages;
    // what is in it, and when it arrives if ordered today
    const content = p.spreads ? `${p.spreads.length} çift sayfa masal, ithaf ve hediye sayfası`
      : p.pages ? `${p.pages.length} sayfa boyama ve etkinlik` : p.type === 'yapboz' ? 'Kapaktaki sahne, yapboz olarak' : '';
    const specs = orderable ? `<dl class="specs">
        <div><dt>Boyut</dt><dd>${p.type === 'yapboz' ? 'Tek boy' : 'A4 · 21 × 29,7 cm'}</dd></div>
        ${content ? `<div><dt>İçerik</dt><dd>${content}</dd></div>` : ''}
        <div><dt>Önizleme</dt><dd>bugün sipariş verirseniz en geç ${trDate(inDays(3))}</dd></div>
        <div><dt>Teslim</dt><dd>${p.type === 'yapboz' ? 'onayınızdan sonra en geç 7 günde kargoda' : 'dijital onayınızla hemen, basılı onaydan sonra en geç 7 günde kargoda'}</dd></div>
      </dl>` : '';
    root.innerHTML = `<div class="product">
      <div class="p-gallery">${gallery}</div>
      <div class="p-head">
        <p class="eyebrow" id="crumbs-inline">${a.name}</p>
        <h1 id="p-title">${fullTitle(p)}</h1>
        <div class="meta"><span>${p.aud === 'yetiskin' ? OCCASIONS[p.occ] : TYPES[p.type].one}</span>${p.age ? `<span>${p.age}</span>` : ''}<span>${p.status === 'hazir' ? (p.type === 'yapboz' ? 'Tek boy' : 'A4') : 'Yakında'}</span></div>
        <p class="desc">${esc(p.desc)}</p>
        ${specs}
      </div>
      ${inner ? `<section class="p-viewer" id="inside" aria-label="Kitabın içinden">
        <p class="eyebrow">Kitabın içinden · bütün sayfalar</p>
        <div class="spread${p.spreads ? '' : ' portrait'}" id="spread" tabindex="0" role="button" aria-label="Sayfayı büyüt"><img id="spread-img" src="" alt=""></div>
        <div class="viewer-bar"><button class="arrow" id="prev" type="button" aria-label="Önceki sayfa">←</button><span class="counter" id="counter" aria-live="polite"></span><button class="arrow" id="next" type="button" aria-label="Sonraki sayfa">→</button><button class="zoom" id="zoom" type="button">Büyüt</button></div>
        <div class="vthumbs${p.spreads ? '' : ' portrait'}" id="vthumbs" aria-label="Bütün sayfalar"></div>
        <p class="sample-note">Örnek kitap. Sizin kitabınızda kahramanın yüzü ve adı her sayfada yer alır.</p>
      </section>` : ''}
      <div class="p-buy info">
        ${buy}
        <div class="assure"><ul>
          <li>${p.type === 'yapboz' ? 'En geç 3 gün içinde tasarımı size gönderir' : 'En geç 3 gün içinde bütün sayfaları size gönderir'}, onayınızı bekleriz.</li>
          <li>Dijital sürüm onayınızın hemen ardından gönderilir; basılı ürün en geç bir hafta içinde kargoda.</li>
          <li>Fotoğraflar yalnızca bu ürün için kullanılır, teslimden sonra silinir.</li>
          ${p.type === 'kitap' ? '<li>Sesli masal: kitaptaki QR kodu okutun, masalı anlatıcımızın sesinden dinleyin.</li>' : ''}
          <li><a href="gizlilik.html">Gizlilik sözümüzü okuyun</a></li>
        </ul></div>
      </div>
    </div>
    ${orderable ? `<div class="buybar" id="buybar"><span><small>Toplam</small><b id="buybar-total"></b></span><a class="btn" href="#buy">Masalını oluştur</a></div>` : ''}`;

    // Gallery thumbs
    root.querySelectorAll('[data-shot]').forEach(b => b.addEventListener('click', () => {
      const s = shots[+b.dataset.shot], m = document.getElementById('g-main');
      m.src = s[0]; m.alt = s[1]; coverShown = +b.dataset.shot === 0; paintCover();
      root.querySelectorAll('[data-shot]').forEach(x => x.setAttribute('aria-current', String(x === b)));
    }));
    // Live name: in the title, on the cover, in the dedication suggestion
    const nameIn = document.getElementById('hero-name');
    let coverShown = true, coverTimer = 0;
    const mainBox = root.querySelector('.gallery .main'), coverCanvas = document.createElement('canvas');
    coverCanvas.className = 'cover-name-canvas'; coverCanvas.setAttribute('aria-hidden', 'true');
    if (mainBox && p.coverTitle) mainBox.appendChild(coverCanvas);
    function paintCover() {
      const n = nameIn ? cap(nameIn.value.trim()) : '';
      const on = !!(p.coverTitle && coverShown && n && n !== p.hero);
      coverCanvas.hidden = !on;
      if (!on) return;
      const img = new Image(); img.src = p.img;
      Promise.all([img.decode(), document.fonts.load('italic 500 40px "Cormorant Garamond"', n)]).then(() => drawCoverName(coverCanvas, img, p, n)).catch(() => {});
    }
    if (nameIn) {
      const ithaf = document.getElementById('ithaf');
      const sync = () => {
        const n = cap(nameIn.value.trim());
        document.getElementById('p-title').innerHTML = fullTitle(p, nameIn.value.trim());
        if (ithaf) ithaf.placeholder = `Bu kitap, cesur ve iyi kalpli ${n || p.hero} için yazıldı.`;
        clearTimeout(coverTimer); coverTimer = setTimeout(paintCover, 200);
        try { sessionStorage.setItem('masaliya-hero', n); } catch (e) {}
      };
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
      const base = c ? +c.dataset.price : singlePrice;
      if (!base) { t.textContent = 'Fiyat yakında'; const bt = document.getElementById('buybar-total'); if (bt) bt.textContent = 'Fiyat yakında'; return; }
      let sum = base;
      if (set && set.dataset.extra) sum = Math.round((sum + +set.dataset.extra) * (1 - +set.dataset.discount));
      if (pdf && pdf.checked) sum += PDF_ADDON_PRICE || 0;
      sum += giftBox.checked ? (GIFT_BOX_PRICE || 0) : 0;
      t.textContent = fmt(sum) + (giftBox.checked && !GIFT_BOX_PRICE ? ' + hediye kutusu' : '');
      const bt = document.getElementById('buybar-total'); if (bt) bt.textContent = fmt(sum);
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
      if (!(c ? c.dataset.price : singlePrice)) { note.textContent = 'Bu ürünün fiyatı yakında açıklanacak; şimdilik sipariş alamıyoruz.'; return; }
      if (!name) { note.textContent = 'Lütfen kahramanın adını yazın.'; nameIn.focus(); return; }
      const photos = slots.filter(sl => sl.classList.contains('filled')).length;
      if (photos < 3) { note.textContent = `Lütfen 3 fotoğrafın hepsini ekleyin (${photos}/3).`; return; }
      if (!/^[\d\s()+-]+$/.test(rawPhone) || phone.length < 10 || phone.length > 13) { note.textContent = 'Lütfen telefon numaranızı yalnızca rakamlarla yazın, örneğin 0532 123 45 67.'; document.getElementById('c-phone').focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { note.textContent = 'Lütfen geçerli bir e-posta adresi yazın.'; document.getElementById('c-email').focus(); return; }
      note.textContent = 'Önizleme sürümü: telefon doğrulama, fotoğraf yükleme ve ödeme adımı site yayına alınırken bağlanacak.';
    });
    const intF = document.getElementById('interest');
    if (intF) intF.addEventListener('submit', e => { e.preventDefault(); document.getElementById('int-note').textContent = 'Önizleme sürümü: haber listesi site yayına alınırken bağlanacak.'; });

    // inside the book: spreads for story books, single pages for coloring books
    if (inner) setupViewer(inner);
    // phone: a slim bar with the total stays at hand until the order form is on screen
    const bar = document.getElementById('buybar');
    if (bar && buyF && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => bar.classList.toggle('away', en.isIntersecting), { rootMargin: '0px 0px -20% 0px' }).observe(buyF);
      bar.querySelector('a').addEventListener('click', e => { e.preventDefault(); buyF.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }

    // Related
    const rel = PRODUCTS.filter(x => x.aud === p.aud && x.id !== p.id).slice(0, 3);
    document.getElementById('related').innerHTML = rel.map(card).join('');
    if (location.hash === '#inside' && document.getElementById('inside')) requestAnimationFrame(() => document.getElementById('inside').scrollIntoView());
    else scrollTo(0, 0);
  }
  addEventListener('hashchange', () => { if (document.body.dataset.product) return; show(); const b = document.getElementById('back'); if (b) b.href = backHref(); });
  show();
}

function setupViewer(spreads) {
  let cur = 0;
  const img = document.getElementById('spread-img'), counter = document.getElementById('counter'), strip = document.getElementById('vthumbs');
  const frame = document.getElementById('spread');
  // every page as a thumbnail, so the whole book can be seen at a glance
  strip.innerHTML = spreads.map(([src, alt], i) => `<button type="button" data-i="${i}" aria-label="Sayfa ${i + 1}: ${esc(alt)}"><img src="${thumb(src)}" alt="" loading="lazy"></button>`).join('');
  function go(i) {
    cur = (i + spreads.length) % spreads.length;
    img.style.opacity = 0;
    setTimeout(() => { img.src = spreads[cur][0]; img.alt = spreads[cur][1]; img.style.opacity = 1; }, 220);
    counter.textContent = `${cur + 1} / ${spreads.length}`;
    strip.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === cur)));
    const active = strip.children[cur];
    if (active) strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
  }
  img.src = spreads[0][0]; img.alt = spreads[0][1]; counter.textContent = `1 / ${spreads.length}`;
  strip.querySelectorAll('button').forEach((b, k) => { b.setAttribute('aria-current', String(k === 0)); b.onclick = () => go(k); });
  document.getElementById('prev').onclick = () => go(cur - 1);
  document.getElementById('next').onclick = () => go(cur + 1);
  document.getElementById('zoom').onclick = () => openLightbox(spreads, cur);
  swipe(frame, () => go(cur + 1), () => go(cur - 1));
  frame.addEventListener('click', () => { if (frame.dataset.swiped) { delete frame.dataset.swiped; return; } openLightbox(spreads, cur); });
  frame.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') go(cur - 1);
    if (e.key === 'ArrowRight') go(cur + 1);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(spreads, cur); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderChrome();
  const page = document.body.dataset.page;
  if (AUDIENCES[page]) renderCollection(page);
  if (page === 'home') {
    // the story books, with their prices, just below the opening scene
    const books = PRODUCTS.filter(p => p.type === 'kitap' && p.status === 'hazir');
    const g = document.getElementById('home-grid');
    if (g) {
      g.innerHTML = books.map(card).join('');
      if (books.length === 4) g.classList.add('n2');   // two by two, so no book is left alone on a row
    }
  }
  if (page === 'urun') {
    // old urun.html#id links forward to the product's own page
    const p = currentProduct();
    if (!document.body.dataset.product && p) { location.replace(productHref(p)); return; }
    renderProduct();
  }
});
