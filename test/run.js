const { chromium, devices } = require('playwright');
const fs = require('fs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const hav=(a,b)=>{const R=6371000,r=x=>x*Math.PI/180;const dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const x=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ['geolocation', 'microphone'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push('PAGEERR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  let routeCalls = 0, offline = false;
  await ctx.route('**/tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG }));
  await ctx.route('**/routing.openstreetmap.de/**', r => {
    routeCalls++;
    const m = r.request().url().match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    const a = [+m[2], +m[1]], b = [+m[4], +m[3]];
    const d = hav(a, b) * 1.3;
    const coords = [[a[1], a[0]], [(a[1] + b[1]) / 2 + 0.0008, (a[0] + b[0]) / 2], [b[1], b[0]]];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: d, duration: d / 1.4, geometry: { type: 'LineString', coordinates: coords } }], waypoints: [{ location: coords[0] }, { location: coords[2] }] }) });
  });
  await page.goto('http://localhost:8765/');
  await page.waitForSelector('#goBtn');
  await page.screenshot({ path: 'test/1-home.png' });
  await page.click('#goBtn');
  await page.waitForSelector('#startBtn', { timeout: 15000 });
  const w1 = await page.evaluate(() => window.__wander.today);
  console.log('route calls', routeCalls, 'dist', Math.round(w1.distM), 'durMin', w1.durMin.toFixed(1), 'approx', w1.approx);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test/2-planned.png' });
  // re-roll
  await page.click('#rerollBtn'); await page.waitForFunction(() => { const b=document.querySelector('#rerollBtn'); return b && !b.disabled; });
  const w2 = await page.evaluate(() => window.__wander.today);
  console.log('rerolled differs:', JSON.stringify(w1.dest) !== JSON.stringify(w2.dest));
  await page.click('#startBtn'); await page.waitForSelector('#hereBtn');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test/3-active.png' });
  // photo
  const img = fs.readFileSync('/home/claude/wander/build/package/dist/images/layers-2x.png');
  await page.setInputFiles('#camInput', { name: 'a.png', mimeType: 'image/png', buffer: img });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Photo saved'));
  // voice
  await page.click('#micBtn'); await page.waitForSelector('#recbar.on'); await page.waitForTimeout(2300);
  await page.screenshot({ path: 'test/4-recording.png' });
  await page.click('#recstop'); await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Voice note saved'));
  await page.click('#hereBtn'); await page.waitForSelector('#endBtn');
  await page.screenshot({ path: 'test/5-arrived.png' });
  await page.click('#endBtn'); await page.waitForSelector('#jBtn');
  await page.click('#jBtn'); await page.waitForSelector('.day');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test/6-journal.png' });
  console.log('items in journal', await page.$$eval('.items button', b => b.length), 'pair', await page.$$eval('.item.pair', b => b.length));
  await page.click('.thumb'); await page.waitForSelector('#viewer.on');
  await page.fill('#vcap', 'Cool wall'); await page.screenshot({ path: 'test/7-viewer.png' });
  await page.click('#vclose'); await page.waitForTimeout(300);
  console.log('caption shown', await page.$eval('.cap', e => e.textContent));
  // settings
  await page.click('[data-tab=settings]'); await page.waitForSelector('#prepBank'); await page.screenshot({ path: 'test/8-settings.png', fullPage: false });
  // bank + tiles
  await page.click('#prepBank'); await page.waitForFunction(() => /ready/.test(document.querySelector('#prog').textContent) && !/Preparing/.test(document.querySelector('#prog').textContent) && /14 spots/.test(document.querySelector('#prog').textContent), null, { timeout: 60000 });
  console.log('prog:', await page.$eval('#prog', e => e.textContent));
  await page.click('#saveArea'); await page.waitForFunction(() => /tiles saved/.test(document.querySelector('#prog').textContent) && !/Saving/.test(document.querySelector('#prog').textContent), null, { timeout: 60000 });
  console.log('prog:', await page.$eval('#prog', e => e.textContent));
  // export
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('#exp')]);
  if (dl) { await dl.saveAs('test/backup.json'); console.log('backup bytes', fs.statSync('test/backup.json').size); } else console.log('no download event (share path?)');
  // next-day simulation: clear today walk, go OFFLINE, use bank
  await page.evaluate(() => new Promise(res => { const r = indexedDB.open('wander'); r.onsuccess = () => { const d = r.result; const t = d.transaction('walks', 'readwrite'); t.objectStore('walks').clear(); t.oncomplete = res; }; }));
  await page.reload(); await page.waitForSelector('#goBtn');
  await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const before = routeCalls;
  await page.click('#goBtn'); await page.waitForSelector('#startBtn', { timeout: 15000 });
  const w3 = await page.evaluate(() => window.__wander.today);
  console.log('offline Go -> fromBank', w3.fromBank, 'approx', w3.approx, 'extra route calls', routeCalls - before);
  await page.screenshot({ path: 'test/9-offline.png' });
  console.log('ERRORS', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
