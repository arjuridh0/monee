import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Same static artifacts and header rules that are uploaded to the host. */
export async function serveProduction() {
  let workerRevision = ''
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url))
  const rules = []
  for (const line of (await readFile(resolve(dist, '_headers'), 'utf8')).split(/\r?\n/)) {
    if (line.startsWith('/')) rules.push({ pattern: new RegExp('^' + line.trim().split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'), headers: {} })
    else if (/^\s+\S/.test(line)) { const at = line.indexOf(':'); if (at > 0) rules.at(-1).headers[line.slice(0, at).trim()] = line.slice(at + 1).trim() }
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' }
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      // Mirror API/auth routing for browser cache tests; real server auth is tested separately.
      if (path === '/api' || path.startsWith('/api/')) { response.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"error":"QA endpoint not configured"}'); return }
      if (path === '/auth/refresh') { response.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' }).end(); return }
      if (path.startsWith('/cdn-cgi/')) { response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Access is supplied by the production edge'); return }
      const target = resolve(dist, `.${path === '/' ? '/index.html' : path}`)
      if (!target.startsWith(dist.endsWith(sep) ? dist : dist + sep)) { response.writeHead(403).end(); return }
      let body
      try { body = await readFile(target) } catch {
        if (extname(path)) { response.writeHead(404).end(); return }
        body = await readFile(resolve(dist, 'index.html'))
      }
      const headers = Object.assign({}, ...rules.filter(rule => rule.pattern.test(path)).map(rule => rule.headers))
      if (path === '/sw.js' && workerRevision) body = Buffer.concat([body, Buffer.from(`\n// QA revision ${workerRevision}\n`)])
      response.writeHead(200, { ...headers, 'Content-Type': mime[extname(path)] ?? 'text/html' }); response.end(body)
    } catch { response.writeHead(500).end() }
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  return { base: `http://127.0.0.1:${server.address().port}`, reviseWorker: value => { workerRevision = value },
    close: () => new Promise(done => server.close(done)) }
}

export async function outputFolder(name) {
  const output = fileURLToPath(new URL(`../../artifacts/qa/${name}/browser/`, import.meta.url))
  await mkdir(output, { recursive: true }); return output
}
