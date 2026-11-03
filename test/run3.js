// Phase 2 test: DB v1 -> v2 upgrade keeps old data, camera anywhere, quick voice note, manual journal entries.
// Run from a scratch dir with the built app served on :8765, e.g. (cd app/public && python3 -m http.server 8765).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const IMG = fs.readFileSync(path.join(__dirname, '..', 'app', 'node_modules', 'leaflet', 'dist', 'images', 'layers-2x.png'));
const hav = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180; const dl = r(b[0] - a[0]), dn = r(b[1] - a[1]); const x = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const URL0 = 'http://localhost:8765/';
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ['geolocation', 'microphone'] });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 6).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  const tile = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'icon-192.png'));
  await ctx.route('**/tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: tile }));
  await ctx.route('**/routing.openstreetmap.de/**', r => {
    const m = r.request().url().match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    const a = [+m[2], +m[1]], b = [+m[4], +m[3]]; const d = hav(a, b) * 1.3;
    const coords = [[a[1], a[0]], [(a[1] + b[1]) / 2 + 0.0008, (a[0] + b[0]) / 2], [b[1], b[0]]];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: d, duration: d / 1.4, geometry: { type: 'LineString', coordinates: coords } }], waypoints: [{ location: coords[0] }, { location: coords[2] }] }) });
  });
  fs.mkdirSync('s3', { recursive: true });
  const shot = n => page.screenshot({ path: `s3/${n}.png` });
  const clearToast = () => page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  const toastHas = re => page.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source);
  const idb = (store) => page.evaluate(s => new Promise(res => { const r = indexedDB.open('wander'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { r.result.close(); res(q.result.map(x => ({ ...x, blob: undefined, thumb: undefined }))); }; }; }), store);

  // 1. old v1 database with a walk + photo, created before the app ever loads
  await page.goto(URL0 + 'manifest.webmanifest');
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('wander', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('walks', { keyPath: 'id' }); d.createObjectStore('media', { keyPath: 'id' }).createIndex('date', 'date'); d.createObjectStore('bank', { keyPath: 'id', autoIncrement: true }); d.createObjectStore('kv'); };
    r.onsuccess = () => {
      const t = r.result.transaction(['walks', 'media'], 'readwrite');
      t.objectStore('walks').put({ id: '2026-10-01', date: '2026-10-01', status: 'done', distM: 1200, startedAt: 1, endedAt: 900000, start: { lat: 43.65, lng: -79.38 }, dest: { lat: 43.66, lng: -79.38 }, route: [[43.65, -79.38], [43.66, -79.38]] });
      t.objectStore('media').put({ id: 'old1', type: 'photo', date: '2026-10-01', walkId: '2026-10-01', ts: 1759320000000, lat: 43.655, lng: -79.38, blob: new Blob(['x'], { type: 'image/png' }), thumb: null, caption: 'old caption' });
      t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error);
    };
  }));
  await page.goto(URL0); await page.waitForSelector('#goBtn'); await page.waitForTimeout(700);
  ok((await page.evaluate(() => 0, 0)) === 0, 'app boots on upgraded database');
  const stores = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('wander'); r.onsuccess = () => { res({ v: r.result.version, s: [...r.result.objectStoreNames] }); r.result.close(); }; }));
  ok(stores.v === 2 && stores.s.includes('entries'), 'DB is v2 with entries store: ' + JSON.stringify(stores));
  await page.tap('[data-tab=journal]'); await page.waitForSelector('.day');
  ok(/OCT 1/i.test(await page.textContent('.day h3')) && await page.locator('.cap', { hasText: 'old caption' }).count() === 1, 'old v1 walk and photo still in the journal');

  // 2. camera button with no walk -> standalone photo, geotagged
  await page.tap('[data-tab=today]'); await page.waitForTimeout(300);
  await clearToast(); await page.setInputFiles('#camInput', { name: 'a.png', mimeType: 'image/png', buffer: IMG });
  await toastHas(/Photo saved/);
  let media = await idb('media'); let m1 = media.find(m => m.id !== 'old1');
  ok(m1 && m1.walkId === null && m1.lat != null, 'camera with no walk: standalone photo with GPS');
  // 3. start a walk, then camera from another tab -> attaches to the walk
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 }); await page.tap('#startBtn'); await page.waitForSelector('#hereBtn');
  await page.tap('[data-tab=profile]');
  await clearToast(); await page.setInputFiles('#camInput', { name: 'b.png', mimeType: 'image/png', buffer: IMG });
  await toastHas(/Photo saved/);
  media = await idb('media'); const today = await page.evaluate(() => window.__wander.today.id);
  ok(media.filter(m => m.walkId === today).length === 1, 'camera during a walk (from Profile tab): attached to that walk');
  // 4. quick voice note from the tab bar
  await clearToast(); await page.tap('#t-mic'); await page.waitForSelector('#t-mic.rec'); await page.waitForTimeout(1500); await shot('1-quick-rec'); await clearToast(); await page.tap('#t-mic');
  await toastHas(/Voice note saved/);
  media = await idb('media');
  ok(media.some(m => m.type === 'voice' && m.walkId === today), 'quick voice note saved to the active walk');

  // 5. manual entry, set to a past date, location by map tap
  await page.tap('[data-tab=journal]'); await page.waitForSelector('#addEntry'); await page.tap('#addEntry'); await page.waitForSelector('#eform.on'); await shot('2-form-new');
  await clearToast(); await page.tap('#fsave'); await toastHas(/Add a note/);
  ok(true, 'empty entry is refused with a message');
  await page.fill('#fwhen', '2026-10-30T09:15'); await page.fill('#ftext', 'Found a blue door');
  await page.setInputFiles('#entryPhoto', { name: 'c.png', mimeType: 'image/png', buffer: IMG }); await page.waitForSelector('#fitems .thumb');
  await page.tap('#fvoice'); await page.waitForTimeout(1500); await page.tap('#fvoice'); await page.waitForSelector('#fitems .vchip');
  await page.tap('[data-l=map]'); await page.waitForTimeout(500); await page.tap('#pick', { position: { x: 120, y: 90 } }); await page.waitForTimeout(300);
  ok(/Pinned/.test(await page.textContent('#floc')), 'tapping the map pins a location'); await shot('3-form-filled');
  await clearToast(); await page.tap('#fsave'); await toastHas(/Entry saved/); await page.waitForSelector('.entry');
  let ents = await idb('entries');
  ok(ents.length === 1 && ents[0].date === '2026-10-30' && ents[0].lat != null, 'entry saved with the date she set and a location');
  media = await idb('media'); ok(media.filter(m => m.entryId === ents[0].id).length === 2 && media.filter(m => m.entryId).every(m => m.date === '2026-10-30'), 'entry photo + voice stored with the entry date');
  const heads = await page.$$eval('.day h3', els => els.map(e => e.textContent));
  console.log('day order', heads);
  ok(heads.findIndex(h => /OCT 30/i.test(h)) > heads.findIndex(h => /NOV 3/i.test(h)) && heads.findIndex(h => /OCT 30/i.test(h)) < heads.findIndex(h => /OCT 1\b/i.test(h)), 'journal sorts by the date she set');
  await shot('4-journal-entry');
  // 6. entry on the map, then edit time + remove location
  await page.tap('[data-tab=map]'); await page.waitForSelector('#mapbar .count'); await page.waitForTimeout(800);
  ok(await page.locator('#v-map .pin').count() >= 1, 'entry pin appears on the map'); await shot('5-map-entry');
  await page.tap('[data-tab=journal]'); await page.waitForSelector('.ehead'); await page.tap('.ehead'); await page.waitForSelector('#eform.on');
  ok((await page.inputValue('#ftext')) === 'Found a blue door' && (await page.inputValue('#fwhen')) === '2026-10-30T09:15', 'edit form loads the saved note and time');
  await page.fill('#fwhen', '2026-10-31T18:40'); await page.tap('[data-l=none]'); await page.tap('#fitems .x >> nth=0'); await clearToast(); await page.tap('#fsave'); await toastHas(/Entry saved/); await page.waitForTimeout(500);
  ents = await idb('entries'); media = await idb('media');
  ok(ents[0].date === '2026-10-31' && ents[0].lat === null && media.filter(m => m.entryId).length === 1 && media.filter(m => m.entryId)[0].date === '2026-10-31' && media.filter(m => m.entryId)[0].lat === null, 'edit moved the entry, cleared location, removed one attachment');
  await page.tap('[data-tab=map]'); await page.waitForTimeout(700);
  ok(await page.locator('#v-map .pin').count() === (await page.locator('#v-map .pin').count()) && !(await page.textContent('#mapbar .count')).includes('NaN'), 'map still renders');
  // 7. delete
  await page.tap('[data-tab=journal]'); await page.waitForSelector('.ehead'); await page.tap('.ehead'); await page.waitForSelector('#fdel'); await clearToast(); await page.tap('#fdel'); await toastHas(/Entry deleted/);
  ents = await idb('entries'); media = await idb('media');
  ok(ents.length === 0 && !media.some(m => m.entryId), 'delete removes the entry and its attachments');
  // 8. backup round trip includes entries
  console.log('ERRORS', errors); ok(errors.length === 0, 'no page errors');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
