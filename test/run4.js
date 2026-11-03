// Phase 3 test: character creator (parts, swatches, hex, colour wheel), walking character on the map, progress strip.
// Run from a scratch dir with the built app served on :8765 (cd app/public && python3 -m http.server 8765).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const hav = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180; const dl = r(b[0] - a[0]), dn = r(b[1] - a[1]); const x = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const URL0 = 'http://localhost:8765/', START = { latitude: 43.6532, longitude: -79.3832 };
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], geolocation: START, permissions: ['geolocation', 'microphone'] });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  const tile = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'icon-192.png'));
  await ctx.route('**/tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: tile }));
  await ctx.route('**/routing.openstreetmap.de/**', r => {
    const m = r.request().url().match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    const a = [+m[2], +m[1]], b = [+m[4], +m[3]]; const d = hav(a, b) * 1.3;
    const coords = [[a[1], a[0]], [(a[1] + b[1]) / 2 + 0.0008, (a[0] + b[0]) / 2], [b[1], b[0]]];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: d, duration: d / 1.4, geometry: { type: 'LineString', coordinates: coords } }], waypoints: [{ location: coords[0] }, { location: coords[2] }] }) });
  });
  fs.mkdirSync('s4', { recursive: true });
  const shot = n => page.screenshot({ path: `s4/${n}.png` });
  const chr = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('wander'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('settings'); q.onsuccess = () => { r.result.close(); res(q.result && q.result.character); }; }; }));
  const clearToast = () => page.evaluate(() => { document.querySelector('#toast').textContent = ''; });

  await page.goto(URL0); await page.waitForSelector('#goBtn'); await page.waitForTimeout(800);
  ok(await page.locator('#map .walker').count() === 1, 'character shows on the Today map instead of the heart');
  ok(!(await page.locator('#map .walker.walk').count()), 'static pose (not animated) when there is no walk');
  await page.tap('[data-tab=map]'); await page.waitForTimeout(700);
  ok(await page.locator('#bmap .walker').count() === 1, 'character shows on the Map tab too');

  // ---- creator ----
  await page.tap('[data-tab=profile]'); await page.waitForSelector('#cprev svg'); await page.waitForTimeout(300);
  const frames = new Set(); for (let i = 0; i < 12; i++) { frames.add(await page.innerHTML('#cprev')); await page.waitForTimeout(90); }
  ok(frames.size >= 4, 'preview animates through the walk cycle (' + frames.size + ' distinct frames)');
  await shot('1-creator-skin');
  await page.tap('[data-part=hair]'); await page.tap('[data-style="2"]'); await page.waitForTimeout(250);
  let c = await chr(); ok(c && c.hairStyle === 2, 'hair style saved: ' + (c && c.hairStyle));
  for (const i of [0, 1, 3]) { await page.tap(`[data-style="${i}"]`); await page.waitForTimeout(120); await shot('hair-' + i); }
  await page.tap('[data-style="3"]');
  await page.tap('#cedit .sw[data-c="#e6c25e"]'); await page.waitForTimeout(200);
  c = await chr(); ok(c.hair === '#e6c25e', 'hair swatch saved');
  await page.tap('[data-part=bottom]'); await page.tap('[data-outfit="skirt"]'); await page.waitForTimeout(250); await shot('2-skirt');
  c = await chr(); ok(c.outfit === 'skirt', 'outfit type saved');
  await page.tap('[data-outfit="dress"]'); await page.waitForTimeout(250); await shot('3-dress');
  await page.tap('[data-part=shirt]'); await page.fill('#hex', '#ff00aa'); await page.waitForTimeout(250);
  c = await chr(); ok(c.shirt === '#ff00aa', 'typed hex colour saved: ' + c.shirt);
  // colour wheel: tap the hue ring at the top, then the saturation/brightness square
  await page.tap('#wheel', { position: { x: 96, y: 16 } }); await page.waitForTimeout(250);
  const c2 = await chr(); ok(c2.shirt !== '#ff00aa' && /^#[0-9a-f]{6}$/.test(c2.shirt), 'wheel ring changes the colour: ' + c2.shirt);
  await page.tap('#wheel', { position: { x: 96 + 28, y: 96 - 28 } }); await page.waitForTimeout(250);
  const c3 = await chr(); ok(c3.shirt !== c2.shirt && /^#[0-9a-f]{6}$/.test(c3.shirt), 'wheel square changes the colour: ' + c3.shirt);
  ok((await page.inputValue('#hex')) === c3.shirt, 'hex field follows the wheel');
  await shot('4-wheel');
  await page.tap('[data-part=skin]'); await page.tap('#cedit .sw[data-c="#5e3b27"]'); await page.waitForTimeout(250);
  ok((await chr()).skin === '#5e3b27', 'skin swatch saved');
  ok((await page.innerHTML('#map .walker').catch(() => '')) === '' || true, 'noop');
  await page.tap('[data-tab=today]'); await page.waitForTimeout(400);
  const mk = await page.innerHTML('#map .walker');
  ok(mk.includes('#5e3b27') && mk.includes('#e6c25e'), 'map character picked up the new colours');
  await page.reload(); await page.waitForSelector('#panel h1'); await page.waitForTimeout(500);
  ok((await page.innerHTML('#map .walker')).includes('#5e3b27'), 'character survives a reload');

  // ---- walking ----
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 });
  ok(!(await page.locator('#map .walker.walk').count()), 'still a static pose while the quest is only planned');
  await page.tap('#startBtn'); await page.waitForSelector('#hereBtn');
  const t = await page.evaluate(() => window.__wander.today);
  const route = t.route;
  ok(await page.locator('#pstrip, .pstrip').count() === 1, 'progress strip shown while walking');
  const setGeo = (lat, lng) => ctx.setGeolocation({ latitude: lat, longitude: lng, accuracy: 10 });
  // walk east along the first stretch, then jump 40 m to check the glide
  const east = (m) => [START.latitude, START.longitude + m / (111320 * Math.cos(START.latitude * Math.PI / 180))];
  for (const m of [10, 20, 30]) { await setGeo(...east(m)); await page.waitForTimeout(500); }
  ok(await page.locator('#map .walker.walk').count() === 1, 'walk animation runs once she is moving');
  ok(await page.locator('#map .walker.flip').count() === 0, 'faces right when heading east');
  const tf = () => page.evaluate(() => document.querySelector('#map .leaflet-marker-icon.leaflet-zoom-animated:not(.leaflet-interactive) , #map .leaflet-marker-pane .leaflet-marker-icon:has(.walker)').style.transform);
  const seen = new Set(); await setGeo(...east(80));
  for (let i = 0; i < 16; i++) { seen.add(await tf()); await page.waitForTimeout(60); }
  ok(seen.size >= 4, 'position glides between GPS fixes (' + seen.size + ' distinct positions)');
  for (const m of [70, 60, 50]) { await setGeo(...east(m)); await page.waitForTimeout(450); }
  ok(await page.locator('#map .walker.flip').count() === 1, 'faces left when heading west');
  await shot('5-walking');
  // progress strip follows the route: stand on the middle of the route
  const mid = route[Math.floor(route.length / 2)];
  await setGeo(mid[0], mid[1]); await page.waitForTimeout(1500);
  const line = await page.textContent('#pline'), w = await page.$eval('#pfill', e => parseInt(e.style.width));
  console.log('strip:', line, w + '%');
  ok(/left · \d+ min to go/.test(line) && w >= 35 && w <= 65, 'strip shows distance + time left and ~half progress at the route middle');
  await shot('6-strip');
  await page.tap('#hereBtn'); await page.waitForSelector('#endBtn'); await page.waitForTimeout(600);
  const line2 = await page.textContent('#pline'); console.log('back strip:', line2);
  ok(/min back/.test(line2), 'strip switches to "back" after arriving');
  // she stops moving: animation falls back to the standing pose
  await page.waitForTimeout(10500);
  ok(await page.locator('#map .walker.walk').count() === 0, 'back to a standing pose after she stops');
  await page.tap('#endBtn'); await page.waitForSelector('#jBtn'); await page.waitForTimeout(400);
  ok(await page.locator('#map .walker.walk').count() === 0, 'static pose after the walk ends');

  // ---- backup restores the character ----
  const backup = { v: 2, settings: { pace: 5.5, startMode: 'gps', address: null, name: 'Restored', character: { skin: '#ffe3cf', hairStyle: 0, hair: '#7fbcf5', shirt: '#a9d4ff', outfit: 'dress', bottom: '#d9c2ff', shoes: '#1b1630' } }, walks: [], entries: [], media: [] };
  fs.writeFileSync('backup.json', JSON.stringify(backup));
  await clearToast(); await page.setInputFiles('#importInput', 'backup.json'); await page.waitForFunction(() => /Imported/.test(document.querySelector('#toast').textContent));
  const rc = await chr(); ok(rc && rc.outfit === 'dress' && rc.hair === '#7fbcf5', 'importing a backup restores the character');
  ok((await page.innerHTML('#map .walker')).includes('#d9c2ff'), 'map character updates after restore');

  console.log('ERRORS', errors); ok(errors.length === 0, 'no page errors');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
