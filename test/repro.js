const { chromium, webkit, devices } = require('playwright');
(async () => {
  for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    let browser; try { browser = await type.launch(); } catch (e) { console.log(name, 'not available'); continue; }
    const ctx = await browser.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await ctx.route('**/tile.openstreetmap.org/**', r => r.abort());
    await page.goto('http://localhost:8765/'); await page.waitForSelector('#goBtn');
    for (const tab of ['journal', 'settings', 'today', 'settings', 'journal']) {
      await page.tap(`[data-tab=${tab}]`).catch(e => errs.push('TAPFAIL ' + tab + ' ' + e.message.split('\n')[0]));
      await page.waitForTimeout(500);
      const info = await page.evaluate(t => ({ on: [...document.querySelectorAll('.view.on')].map(v => v.id), h: document.querySelector('#v-' + t).getBoundingClientRect().height, jl: document.querySelector('#jlist').innerText.slice(0, 40), st: document.querySelector('#settings').innerText.slice(0, 30) }), tab);
      console.log(name, tab, JSON.stringify(info));
    }
    console.log(name, 'errors', errs);
    await browser.close();
  }
})();
