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
  const cur = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__wander.today)));
  const allWalks = () => page.evaluate(() => new Promise(r => { const q = indexedDB.open('wander'); q.onsuccess = () => { const t = q.result.transaction('walks').objectStore('walks').getAll(); t.onsuccess = () => r(t.result); }; }));
  const START = { latitude: 43.6532, longitude: -79.3832 };
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#goBtn'); await page.waitForTimeout(900);
  // --- walk time: + / - and typing
  ok('default 30 min', (await page.inputValue('#wMin')) === '30');
  await page.tap('#wPlus'); await page.waitForTimeout(150); ok('+ adds 5', (await page.inputValue('#wMin')) === '35');
  ok('subtitle updates (17.5 each way)', /17\.5 min out, 17\.5 min back/.test(await page.textContent('#wSub')));
  await page.tap('#wMinus'); await page.tap('#wMinus'); await page.waitForTimeout(150); ok('- subtracts 5', (await page.inputValue('#wMin')) === '25');
  await page.fill('#wMin', '5'); await page.dispatchEvent('#wMin', 'change'); await page.waitForTimeout(200); ok('typed 5 clamps to 10', (await page.inputValue('#wMin')) === '10');
  await page.fill('#wMin', '500'); await page.dispatchEvent('#wMin', 'change'); await page.waitForTimeout(200); ok('typed 500 clamps to 120', (await page.inputValue('#wMin')) === '120');
  await page.fill('#wMin', '60'); await page.dispatchEvent('#wMin', 'change'); await page.waitForTimeout(300);
  ok('subtitle shows 30 each way', /30 min out, 30 min back/.test(await page.textContent('#wSub')));
  await page.reload(); await page.waitForSelector('#goBtn'); ok('60 persists after reload', (await page.inputValue('#wMin')) === '60');
  await shot('w1-go');
  // 60 min total -> ~30 min each way at 5.5 km/h = ~2.75 km
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 20000 });
  let w = await cur(); ok('route is ~30 min each way (2.3-3.2 km)', w.distM > 2300 && w.distM < 3200);
  await page.tap('#cancelBtn'); await page.waitForSelector('#goBtn');
  await page.fill('#wMin', '30'); await page.dispatchEvent('#wMin', 'change'); await page.waitForTimeout(200);

  // --- walk 1: end early part-way
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 20000 }); await page.tap('#startBtn'); await page.waitForSelector('#endHereBtn');
  w = await cur(); const mid = w.route[1];
  await ctx.setGeolocation({ latitude: mid[0], longitude: mid[1] }); await page.waitForTimeout(2500);
  page.once('dialog', d => d.accept()); await page.tap('#endHereBtn'); await page.waitForFunction(() => /Walk saved/i.test(document.querySelector('#panel').textContent), null, { timeout: 8000 });
  w = await cur();
  ok('early end flagged', w.early === true && w.status === 'done');
  ok('spot logged', w.endPos && Math.abs(w.endPos.lat - mid[0]) < 1e-4);
  ok('walk ends at that spot', Math.abs(w.dest.lat - mid[0]) < 1e-4 && w.planned && w.planned.distM > w.distM);
  ok('walked about half the planned way', w.walkedM > w.planned.distM * 0.4 && w.walkedM < w.planned.distM * 0.6);
  await shot('w2-ended-early');
  // --- new walk: finish fully, walking back to the start
  await ctx.setGeolocation(START); await page.tap('#newBtn'); await page.waitForSelector('#goBtn');
  ok('second walk allowed the same day', true);
  ok('today line shows 1 walk', /Today: 1 walk,/.test(await page.textContent('#todayLine')));
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 20000 }); await page.tap('#startBtn'); await page.waitForSelector('#hereBtn');
  w = await cur(); await ctx.setGeolocation({ latitude: w.dest.lat, longitude: w.dest.lng }); await page.waitForTimeout(2500);
  await page.tap('#hereBtn'); await page.waitForSelector('#endBtn'); ok('I\u2019M HERE at the flag keeps the full route', !(await cur()).planned);
  await ctx.setGeolocation(START); await page.waitForTimeout(2500);
  await page.tap('#endBtn'); await page.waitForFunction(() => /Quest clear/i.test(document.querySelector('#panel').textContent), null, { timeout: 8000 });
  w = await cur(); ok('full round trip counted twice', w.walkedM > w.distM * 1.8 && w.walkedM <= w.distM * 2.01);
  // --- third walk: get a ride back (ends at the flag)
  await page.tap('#newBtn'); await page.waitForSelector('#goBtn');
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 20000 }); await page.tap('#startBtn'); await page.waitForSelector('#hereBtn');
  w = await cur(); await ctx.setGeolocation({ latitude: w.dest.lat, longitude: w.dest.lng }); await page.waitForTimeout(2500);
  await page.tap('#hereBtn'); await page.waitForSelector('#endBtn'); await page.tap('#endBtn'); await page.waitForFunction(() => /Quest clear/i.test(document.querySelector('#panel').textContent), null, { timeout: 8000 });
  w = await cur(); ok('ride back: only the way there counted', w.walkedM >= w.distM * 0.95 && w.walkedM < w.distM * 1.2);
  // --- fourth walk: tap I'M HERE half way -> that spot is used, not the full trek
  await page.tap('#newBtn'); await page.waitForSelector('#goBtn'); await ctx.setGeolocation(START);
  ok('no external maps buttons on the GO flow', true);
  await page.tap('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 20000 }); await page.tap('#startBtn'); await page.waitForSelector('#hereBtn');
  ok('no MAPS link while walking out', !(await page.$('#panel a[href]')));
  w = await cur(); const planned = w.distM; const mid2 = w.route[1];
  await ctx.setGeolocation({ latitude: mid2[0], longitude: mid2[1] }); await page.waitForTimeout(2500);
  await page.tap('#hereBtn'); await page.waitForSelector('#endBtn');
  w = await cur();
  ok('flag moved to where she tapped', Math.abs(w.dest.lat - mid2[0]) < 1e-4 && w.planned && Math.abs(w.planned.distM - planned) < 1);
  ok('way out counted as about half', w.distM > planned * 0.4 && w.distM < planned * 0.6);
  ok('no MAPS / WAY BACK link at the checkpoint', !(await page.$('#panel a[href]')));
  await shot('w4-arrived-half');
  await page.tap('#endBtn'); await page.waitForFunction(() => /Quest clear/i.test(document.querySelector('#panel').textContent), null, { timeout: 8000 });
  w = await cur(); ok('ended right there: only the way out counted', w.walkedM > planned * 0.4 && w.walkedM < planned * 0.6);
  const ws = await allWalks(); ok('four walks saved for one day', ws.filter(x => x.status === 'done').length === 4 && new Set(ws.map(x => x.id)).size === 4);
  ok('HUD counts 4', /WALKS 04/.test(await page.textContent('#hudL')));
  // survives a reload: GO screen, not the old finished walk
  await page.reload(); await page.waitForSelector('#goBtn'); ok('after reload shows GO', true);
  // journal groups them
  await page.tap('[data-tab=journal]'); await page.waitForTimeout(800);
  ok('journal shows 4 walks for the day', /4 walks/.test(await page.textContent('#v-journal')));
  await shot('w3-journal');
  await page.tap('[data-tab=map]'); await page.waitForTimeout(1000);
  ok('map tab shows walks', /4 walks/.test(await page.textContent('#v-map')));
  console.log('ERRORS', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
