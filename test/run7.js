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
  let nomCalls = 0;
  await ctx.route('**/nominatim.openstreetmap.org/**', r => {
    nomCalls++;
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([
      { lat: '43.6544', lon: '-79.3807', name: 'CF Toronto Eaton Centre', display_name: 'CF Toronto Eaton Centre, 220, Yonge Street, Toronto', address: { house_number: '220', road: 'Yonge Street', suburb: 'Old Toronto', city: 'Toronto', state: 'Ontario' } },
      { lat: '43.6560', lon: '-79.3800', name: '', display_name: '1, Dundas Street East, Toronto', address: { house_number: '1', road: 'Dundas Street East', city: 'Toronto', state: 'Ontario' } }
    ]) });
  });
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#goBtn'); await page.waitForTimeout(900);
  ok('GO and the small address button both show', !!(await page.$('#goBtn')) && !!(await page.$('#addrChip')));
  await shot('a1-go');
  // open the picker, type: debounced, one request
  await page.tap('#addrChip'); await page.waitForSelector('#destIn');
  ok('address box opens', await page.isVisible('#destIn'));
  await page.fill('#destIn', 'Ea'); await page.waitForTimeout(900); ok('no search under 4 letters', nomCalls === 0);
  await page.type('#destIn', 'ton', { delay: 60 }); await page.waitForSelector('.sug', { timeout: 5000 });
  ok('suggestions appear', (await page.$$('.sug')).length === 2); ok('one debounced request', nomCalls === 1);
  ok('house address named from number + road', /1 Dundas Street East/.test(await page.textContent('#sugs')));
  await shot('a2-suggestions');
  // pick -> preview on the same page
  await page.tap('.sug[data-i="0"]'); await page.waitForSelector('#startBtn', { timeout: 10000 }); await page.waitForTimeout(500);
  ok('button says GO TO ADDRESS', /GO TO ADDRESS/.test(await page.textContent('#startBtn')));
  ok('destination named in panel', /Eaton Centre/.test(await page.textContent('#panel')));
  ok('no re-roll for an address', !(await page.$('#rerollBtn')));
  ok('route + flag drawn', (await page.$$('.leaflet-overlay-pane path')).length > 0);
  await shot('a3-preview');
  // cancel -> GO; recents list the place
  await page.tap('#cancelBtn'); await page.waitForSelector('#goBtn');
  await page.tap('#addrChip'); await page.waitForSelector('#destIn');
  ok('recent place listed', (await page.$$('.sug.rec')).length === 1);
  await shot('a4-recent');
  await page.tap('#addrBack'); await page.waitForSelector('#goBtn'); ok('BACK returns to GO', true);
  // offline: recent still works (estimate), new lookup explains itself
  await ctx.setOffline(true); await page.waitForTimeout(300);
  await page.tap('#addrChip'); await page.waitForSelector('#destIn'); await page.type('#destIn', 'Union', { delay: 40 }); await page.waitForFunction(() => /Needs internet/.test(document.querySelector('#addrMsg').textContent), null, { timeout: 5000 });
  ok('offline lookup explains itself', true);
  await page.fill('#destIn', ''); await page.dispatchEvent('#destIn', 'input'); await page.waitForSelector('.sug.rec');
  await page.tap('.sug.rec'); await page.waitForSelector('#startBtn', { timeout: 10000 });
  ok('offline recent gives an estimate', /Offline estimate/.test(await page.textContent('#panel')));
  await ctx.setOffline(false); await page.tap('#cancelBtn'); await page.waitForSelector('#goBtn');
  // full flow back online
  await page.tap('#addrChip'); await page.waitForSelector('.sug.rec'); await page.tap('.sug.rec'); await page.waitForSelector('#startBtn', { timeout: 10000 });
  await page.tap('#startBtn'); await page.waitForSelector('#hereBtn'); ok('on the way', /On the way/.test(await page.textContent('#panel')));
  await page.tap('#hereBtn'); await page.waitForSelector('#endBtn'); ok('arrival text', /You’re here/.test(await page.textContent('#panel')));
  await page.tap('#endBtn'); await page.waitForFunction(() => /Quest clear/i.test(document.querySelector('#panel').textContent));
  ok('walk completes', true);
  await page.tap('#jBtn'); await page.waitForTimeout(600);
  ok('journal shows the destination', /CF Toronto Eaton Centre/.test(await page.textContent('#view-journal, body')));
  console.log('ERRORS', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
