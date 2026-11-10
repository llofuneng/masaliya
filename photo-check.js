/* Photo checks for the order form. They run on the visitor's own device: the photos are not sent
   anywhere to be checked. Face finding uses Google's MediaPipe Face Landmarker; the model file is
   served from our own site (models/face_landmarker.task), the library from jsDelivr. */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
const MAX_UPLOAD = 2400;   // long side of the copy we upload, px

let ready = null;
function landmarker() {
  if (!ready) ready = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import(MP + '/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(MP + '/wasm');
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL('models/face_landmarker.task', document.baseURI).href },
      runningMode: 'IMAGE', numFaces: 3, outputFaceBlendshapes: true
    });
  })().catch(err => { ready = null; throw err; });
  return ready;
}
// start loading early (on the first photo tap) so the first check is quick
export const warmUp = () => { landmarker().catch(() => {}); };

async function open(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    const img = new Image(); img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  }
}

function canvasOf(src, maxSide) {
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// mean brightness and sharpness (variance of the Laplacian) of one region, on a small grey copy
function lightAndSharpness(canvas, box) {
  const x = Math.max(0, Math.floor(box.x0 * canvas.width)), y = Math.max(0, Math.floor(box.y0 * canvas.height));
  const w = Math.max(8, Math.min(canvas.width - x, Math.ceil((box.x1 - box.x0) * canvas.width)));
  const h = Math.max(8, Math.min(canvas.height - y, Math.ceil((box.y1 - box.y0) * canvas.height)));
  const s = document.createElement('canvas'); s.width = 160; s.height = Math.max(8, Math.round(160 * h / w));
  const g = s.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, x, y, w, h, 0, 0, s.width, s.height);
  const d = g.getImageData(0, 0, s.width, s.height).data, W = s.width, H = s.height;
  const lum = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) { lum[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]; sum += lum[i]; }
  let n = 0, m = 0, m2 = 0;
  for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
    const i = yy * W + xx, v = lum[i - 1] + lum[i + 1] + lum[i - W] + lum[i + W] - 4 * lum[i];
    n++; m += v; m2 += v * v;
  }
  m /= n;
  return { light: sum / (W * H), sharp: m2 / n - m * m };
}

function upload(src) {
  const c = canvasOf(src, MAX_UPLOAD);
  return new Promise(res => c.toBlob(res, 'image/jpeg', .9));
}

const score = (shapes, name) => (shapes.find(c => c.categoryName === name) || {}).score || 0;

/* slot: 0 = from the front, 1 = slightly from the side, 2 = smiling.
   Returns { level: 'ok' | 'warn' | 'bad', messages: [...], blob } */
export async function checkPhoto(file, slot) {
  const bad = [], warn = [];
  let src;
  try { src = await open(file); }
  catch (e) { return { level: 'bad', messages: ['Bu dosya açılamadı. Lütfen JPG ya da PNG bir fotoğraf seçin.'] }; }
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
  if (Math.min(W, H) < 600) bad.push('Fotoğrafın çözünürlüğü düşük. Telefonla çekilmiş orijinal fotoğrafı seçin.');

  const look = canvasOf(src, 1024);
  let found;
  // the face finder comes from a CDN: if it has not loaded in 15 s, go on without it rather than block the order
  try { found = (await Promise.race([landmarker(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 15000))])).detect(look); }
  catch (e) {
    // no face check on this device: take the photo, we look at every photo ourselves anyway
    return { level: bad.length ? 'bad' : 'ok', messages: bad.length ? bad : ['Otomatik kontrol bu cihazda çalışmadı; fotoğrafı biz kontrol edeceğiz.'], blob: bad.length ? null : await upload(src) };
  }

  const faces = (found.faceLandmarks || []).map((pts, i) => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const size = Math.max((x1 - x0) * W, (y1 - y0) * H) / Math.min(W, H);
    return { pts, shapes: (found.faceBlendshapes[i] || {}).categories || [], box: { x0, y0, x1, y1 }, size };
  }).sort((a, b) => b.size - a.size);

  if (!faces.length) {
    bad.push('Fotoğrafta yüz bulunamadı ya da yüz çok uzakta kaldı. Yüzün yakından ve net göründüğü bir fotoğraf seçin.');
  } else {
    const f = faces[0], b = f.box;
    if (b.x0 < .005 || b.y0 < .005 || b.x1 > .995 || b.y1 > .995) bad.push('Yüzün bir kısmı fotoğrafın dışında kalmış. Yüzün tamamen göründüğü bir fotoğraf seçin.');
    if (f.size < .12) bad.push('Yüz çok küçük, çocuk uzakta kalmış. Daha yakından çekilmiş bir fotoğraf seçin.');
    else if (f.size < .2) warn.push('Yüz biraz küçük. Daha yakından çekilmiş bir fotoğraf daha iyi sonuç verir.');
    if (faces[1] && faces[1].size > f.size * .5) warn.push('Fotoğrafta birden fazla kişi var. Mümkünse yalnızca kahramanın olduğu bir fotoğraf seçin.');

    const { light, sharp } = lightAndSharpness(look, b);
    if (light < 55) bad.push('Yüz çok karanlık. Daha aydınlık bir fotoğraf seçin.');
    else if (light > 225) bad.push('Yüz çok parlak, ayrıntılar kaybolmuş. Başka bir fotoğraf seçin.');
    else if (light < 75) warn.push('Fotoğraf biraz karanlık. Daha aydınlık bir fotoğraf daha iyi sonuç verir.');
    if (light < 55 || light > 225) { /* too dark or bright to judge sharpness */ }
    else if (sharp < 8) bad.push('Fotoğraf bulanık. Yüzün net olduğu bir fotoğraf seçin.');
    else if (sharp < 25) warn.push('Fotoğraf biraz bulanık görünüyor. Daha net bir fotoğraf daha iyi sonuç verir.');

    // how far the head is turned: where the nose tip sits between the two cheeks (0.5 = straight on)
    const P = f.pts, turn = Math.abs((P[1].x - P[234].x) / ((P[454].x - P[234].x) || 1e-6) - .5);
    if (slot === 0 && turn > .15) warn.push('Bu fotoğrafta yüz yana dönük. Bu kutu için önden çekilmiş bir fotoğraf daha iyi olur.');
    if (slot === 1 && turn < .06) warn.push('Bu fotoğraf önden çekilmiş. Bu kutu için yüzün biraz yana döndüğü bir fotoğraf daha iyi olur.');
    if (turn > .4) warn.push('Yüz neredeyse tamamen yandan görünüyor.');
    const smile = (score(f.shapes, 'mouthSmileLeft') + score(f.shapes, 'mouthSmileRight')) / 2;
    if (slot === 2 && smile < .3) warn.push('Bu fotoğrafta gülümseme pek görünmüyor. Bu kutu için gülümsediği bir fotoğraf daha iyi olur.');
    if (score(f.shapes, 'eyeBlinkLeft') > .55 && score(f.shapes, 'eyeBlinkRight') > .55) warn.push('Gözler kapalı görünüyor.');
  }

  if (bad.length) return { level: 'bad', messages: bad };
  return { level: warn.length ? 'warn' : 'ok', messages: warn, blob: await upload(src) };
}
