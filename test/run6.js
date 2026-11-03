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
  const onVal = (attr) => page.evaluate(a => { const e = document.querySelector(`#cedit [data-${a}].on`); return e ? e.dataset[a] : null; }, attr);
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#goBtn'); await page.waitForTimeout(800);
  await page.tap('[data-tab=profile]'); await page.waitForSelector('#cedit .pre'); await page.waitForTimeout(400);
  ok('8 presets shown', (await page.$$('#cedit .pre')).length === 8);
  ok('default body is female', (await onVal('body')) === 'f');
  await page.evaluate(() => document.querySelector('#cstage').scrollIntoView()); await shot('p1-creator');
  // preset: default look is not a preset, so a confirm appears
  page.once('dialog', d => { ok('confirm names the preset', /BOOKWORM/.test(d.message())); d.accept(); });
  const before = await page.innerHTML('#cprev'); await page.tap('#cedit .pre[data-preset="0"]'); await page.waitForTimeout(500);
  ok('preview changed', (await page.innerHTML('#cprev')) !== before);
  await page.evaluate(() => document.querySelector('#cedit').scrollIntoView()); await shot('p2-bookworm');
  // switching presets from a preset needs no confirm
  await page.tap('#cedit .pre[data-preset="7"]'); await page.waitForTimeout(400);
  ok('SKY preset is male', (await onVal('body')) === 'm');
  await page.tap('#cedit [data-body=f]'); await page.waitForTimeout(300); ok('body switch to female', (await onVal('body')) === 'f');
  // hair styles
  await page.tap('#cedit [data-part=hair]'); await page.waitForSelector('#cedit [data-style="9"]'); ok('10 hair styles', (await page.$$('#cedit [data-style]')).length === 10);
  await page.tap('#cedit [data-style="6"]'); await page.waitForTimeout(300); ok('braids selected', (await onVal('style')) === '6');
  // top + bottom
  await page.tap('#cedit [data-part=shirt]'); await page.tap('#cedit [data-top=hoodie]'); await page.waitForTimeout(300); ok('hoodie selected', (await onVal('top')) === 'hoodie');
  await page.tap('#cedit [data-part=bottom]'); await page.tap('#cedit [data-outfit=shorts]'); await page.waitForTimeout(300); ok('shorts selected', (await onVal('outfit')) === 'shorts');
  // glasses auto-on when the part is opened, can be turned off
  await page.tap('#cedit [data-part=glassCol]'); await page.waitForTimeout(300); ok('glasses on when opened', (await onVal('glasses')) === '1');
  await page.tap('#cedit .swatches .sw:nth-child(3)'); await page.waitForTimeout(300);
  await page.tap('#cedit [data-glasses="0"]'); await page.waitForTimeout(300); ok('glasses off', (await onVal('glasses')) === '0');
  await page.tap('#cedit [data-part=hatCol]'); await page.waitForTimeout(300); ok('hat defaults to beanie', (await onVal('hat')) === 'beanie');
  await page.tap('#cedit [data-hat=cap]'); await page.waitForTimeout(300); ok('cap selected', (await onVal('hat')) === 'cap');
  await page.evaluate(() => document.querySelector('#cedit').scrollIntoView()); await shot('p3-custom');
  // persists across reload; custom look + preset tap asks first, declining keeps it
  await page.reload(); await page.waitForSelector('#goBtn'); await page.tap('[data-tab=profile]'); await page.waitForSelector('#cedit .pre');
  await page.tap('#cedit [data-part=hatCol]'); await page.waitForTimeout(200); ok('hat persisted', (await onVal('hat')) === 'cap');
  page.once('dialog', d => d.dismiss()); await page.tap('#cedit .pre[data-preset="3"]'); await page.waitForTimeout(300);
  ok('declining keeps custom look', (await onVal('hat')) === 'cap');
  // map/today sprite still renders
  await page.tap('[data-tab=today]'); await page.waitForTimeout(500);
  ok('map character present', (await page.$$('.walker svg')).length > 0);
  console.log('ERRORS', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
