const { chromium, devices } = require('playwright');
const tile = require('child_process').execSync(`python3 -c "
from PIL import Image, ImageDraw; import io,sys
im=Image.new('RGB',(256,256),(242,239,233)); d=ImageDraw.Draw(im)
d.rectangle([0,118,255,138],fill=(255,255,255)); d.rectangle([118,0,138,255],fill=(255,255,255))
d.rectangle([150,150,240,240],fill=(190,225,170)); d.rectangle([10,10,100,100],fill=(224,220,210)); d.rectangle([160,10,240,60],fill=(170,211,223)); d.rectangle([0,138,10,255],fill=(252,214,164))
b=io.BytesIO(); im.save(b,'PNG'); sys.stdout.buffer.write(b.getvalue())"`);
const variants0 = {
  A: 'grayscale(1) contrast(1.15) sepia(1) hue-rotate(170deg) saturate(.7) brightness(1.1)',
  B: 'grayscale(1) contrast(1.3) sepia(1) hue-rotate(175deg) saturate(.55) brightness(1.12)',
  C: 'saturate(.2) sepia(.6) hue-rotate(160deg) saturate(1.8) brightness(1.08) contrast(.95)'
};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  await ctx.route('**/tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: tile }));
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#goBtn'); await page.waitForTimeout(800);
  for (const [k, f] of Object.entries({D:'url(#pastel)'})) {
    await page.evaluate(f => { let s = document.getElementById('tt'); if (!s) { s = document.createElement('style'); s.id = 'tt'; document.head.appendChild(s); } s.textContent = ''; }, f);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `s/tint-${k}.png`, clip: { x: 0, y: 0, width: 390, height: 300 } });
  }
  await browser.close();
})();
