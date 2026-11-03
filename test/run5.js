const { chromium, devices } = require('playwright');
const fs = require('fs');
const hav=(a,b)=>{const R=6371000,r=x=>x*Math.PI/180;const dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const x=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
// fake "map" tile: pale cream with faint grid + road lines, so the pastel treatment can be judged
const tile = require('child_process').execSync(`python3 -c "
from PIL import Image, ImageDraw; import io,sys
im=Image.new('RGB',(256,256),(238,236,228)); d=ImageDraw.Draw(im)
d.rectangle([0,120,255,136],fill=(255,255,255)); d.rectangle([120,0,136,255],fill=(255,255,255))
d.rectangle([150,150,240,240],fill=(200,230,190)); d.rectangle([10,10,100,100],fill=(222,218,208))
b=io.BytesIO(); im.save(b,'PNG'); sys.stdout.buffer.write(b.getvalue())"`);
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ['geolocation', 'microphone'] });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  await ctx.route('**/tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: tile }));
  await ctx.route('**/routing.openstreetmap.de/**', r => {
    const m = r.request().url().match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    const a = [+m[2], +m[1]], b = [+m[4], +m[3]]; const d = hav(a, b) * 1.3;
    const coords = [[a[1], a[0]], [(a[1] + b[1]) / 2 + 0.0008, (a[0] + b[0]) / 2], [b[1], b[0]]];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: d, duration: d / 1.4, geometry: { type: 'LineString', coordinates: coords } }], waypoints: [{ location: coords[0] }, { location: coords[2] }] }) });
  });
  fs.mkdirSync('s', { recursive: true });
  const shot = n => page.screenshot({ path: `s/${n}.png` });
  const ok = (n, v) => console.log((v ? 'PASS ' : 'FAIL ') + n);
  const clearToast = () => page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#goBtn'); await page.waitForTimeout(900);
  // 1. cancel a planned quest -> back to GO
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 }); await page.waitForTimeout(500); await shot('c1-planned');
  await clearToast(); await page.tap('#cancelBtn'); await page.waitForSelector('#goBtn'); await page.waitForTimeout(300);
  ok('planned cancel returns to GO', !(await page.$('#startBtn')));
  ok('walk removed from db', await page.evaluate(() => new Promise(r => { const q = indexedDB.open('wander'); q.onsuccess = () => { const t = q.result.transaction('walks').objectStore('walks').getAll(); t.onsuccess = () => r(t.result.length === 0); }; })));
  // 2. start, take a photo, cancel mid-walk (dialog accepted) -> GO, photo kept
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 }); await page.waitForTimeout(400);
  await page.tap('#startBtn'); await page.waitForSelector('#hereBtn'); await page.waitForTimeout(500);
  await page.setInputFiles('#camInput', { name: 'a.png', mimeType: 'image/png', buffer: fs.readFileSync('/home/claude/wander/app/node_modules/leaflet/dist/images/layers.png') });
  await page.waitForFunction(() => /Photo saved/.test(document.querySelector('#toast').textContent));
  await shot('c2-active');
  page.once('dialog', d => d.accept());
  await clearToast(); await page.tap('#cancelBtn'); await page.waitForFunction(() => /Walk cancelled/.test(document.querySelector('#toast').textContent));
  await page.waitForSelector('#goBtn'); await shot('c3-after-cancel');
  const media = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('wander'); q.onsuccess = () => { const t = q.result.transaction('media').objectStore('media').getAll(); t.onsuccess = () => r(t.result.map(m => m.walkId)); }; }));
  ok('photo kept, unlinked from walk', media.length === 1 && media[0] === null);
  ok('HUD still 00', (await page.textContent('#hudL')).includes('00'));
  // 3. declined dialog keeps the walk
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 }); await page.tap('#startBtn'); await page.waitForSelector('#hereBtn'); await page.waitForTimeout(400);
  page.once('dialog', d => d.dismiss()); await page.tap('#cancelBtn'); await page.waitForTimeout(600);
  ok('dismissed dialog keeps walk', !!(await page.$('#hereBtn')));
  // 4. cancel at the checkpoint
  await page.tap('#hereBtn'); await page.waitForSelector('#endBtn'); await shot('c4-arrived');
  page.once('dialog', d => d.accept()); await page.tap('#cancelBtn'); await page.waitForSelector('#goBtn');
  ok('arrived cancel returns to GO', true);
  console.log('ERRORS', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
