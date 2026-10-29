// Render GLB -> PNG kartu carousel. Pemakaian: node render_png.mjs <id> <file.glb> [rotY] [fit]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const [id, glb, rot = '0', fit = '1'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const p = await b.newPage({ viewport: { width: 560, height: 680 } });
p.on('console', (m) => console.log('[page]', m.text()));
await p.goto(`http://localhost:${port}/tools/render.html?file=/${encodeURI(glb)}&rot=${rot}&fit=${fit}`);
await p.waitForFunction('window.READY || window.ERR', null, { timeout: 120000 });
const err = await p.evaluate('window.ERR');
if (err) throw new Error(err);
const out = path.join(ROOT, 'mascots', 'png', `${id}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const url = await p.evaluate('window.PNG');
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('ok', out);
await b.close(); srv.close();
