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
  const nWalks = () => page.evaluate(() => new Promise(r => { const q = indexedDB.open('wander'); q.onsuccess = () => { const t = q.result.transaction('walks').objectStore('walks').getAll(); t.onsuccess = () => r(t.result.length); }; }));
  for (let i = 0; i < 2; i++) {
    await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 }); await page.waitForTimeout(400);
    await page.tap('#startBtn'); await page.waitForSelector('#endHereBtn'); await page.waitForTimeout(500);
    page.once('dialog', d => d.accept()); await page.tap('#endHereBtn');
    await page.waitForSelector('#newBtn'); await page.waitForTimeout(300);
    if (i === 0) await page.tap('#newBtn');
  }
  ok('two walks saved', (await nWalks()) === 2);
  await page.tap('[data-tab=journal]'); await page.waitForTimeout(800);
  ok('journal lists 2 walk rows', (await page.$$('.wrow')).length === 2);
  page.once('dialog', d => d.accept('Park loop')); await page.tap('[data-wname]'); await page.waitForTimeout(500);
  ok('rename shows new name', /Park loop/.test(await page.textContent('#v-journal')));
  await shot('r1-journal');
  page.once('dialog', d => d.dismiss()); await page.tap('[data-wdel]'); await page.waitForTimeout(300);
  ok('dismissed confirm keeps walk', (await nWalks()) === 2);
  page.once('dialog', d => d.accept()); await page.tap('[data-wdel]'); await page.waitForTimeout(600);
  ok('walk removed', (await nWalks()) === 1 && (await page.$$('.wrow')).length === 1);
  page.once('dialog', d => d.accept()); await page.tap('[data-wdel]'); await page.waitForTimeout(600);
  ok('all walks removed', (await nWalks()) === 0);
  await page.tap('[data-tab=today]'); await page.waitForTimeout(500);
  ok('today back to GO', !!(await page.$('#goBtn')));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})();
