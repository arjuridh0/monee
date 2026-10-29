// Render mockup PNG 2.5D maskot dari engine prosedural (mascots/core/mascot_canvas.js).
//
// PENTING: output ini hanya untuk MOCKUP DESAIN (pen.dev / Figma).
// Aset produksi aplikasi adalah engine canvas 2.5D yang digambar live di device
// Jangan pakai PNG ini sebagai pengganti engine canvas di app.
//
// Output: mascots/png2_5d/{id}-{state}.png  (transparent)
// Pakai   : node tools/render-2_5d.cjs
// Butuh  : playwright (npm i -D playwright) + chromium
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'mascots', 'png2_5d');

const JOBS = [
  { id: 'mochi', state: 'idle' },
  { id: 'mochi', state: 'greeting' },
  { id: 'mochi', state: 'listening' },
  { id: 'mochi', state: 'thinking' },
  { id: 'mochi', state: 'happy' },
  { id: 'mochi', state: 'celebrate' },
  { id: 'mochi', state: 'sad' },
  { id: 'luna', state: 'idle' },
  { id: 'luna', state: 'greeting' },
  { id: 'luna', state: 'listening' },
  { id: 'luna', state: 'happy' },
  { id: 'bumi', state: 'idle' },
  { id: 'bumi', state: 'greeting' },
  { id: 'bumi', state: 'listening' },
  { id: 'bumi', state: 'happy' }
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

// ES module butuh HTTP (file:// diblokir CORS Chromium).
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/tools/render-2_5d.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  for (const job of JOBS) {
    await page.goto(`${base}?id=${job.id}&state=${job.state}&size=320&dpr=2`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RENDER_DONE === true, { timeout: 15000 });
    const file = path.join(OUT, `${job.id}-${job.state}.png`);
    await page.locator('#stage').screenshot({ path: file, omitBackground: true });
    console.log('rendered', path.basename(file));
  }

  await browser.close();
  srv.close();
  console.log('DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
