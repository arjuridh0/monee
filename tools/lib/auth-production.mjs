/** Isolated local QA host: real Worker/workerd + D1 + built UI, signed test Access identity.
 * Never deployed or imported by application code. No production secrets or data are used.
 */
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

export async function serveAuthProduction() {
  const team = 'https://auth-qa.cloudflareaccess.com', audience = 'd'.repeat(64)
  const keys = await generateKeyPair('RS256', { extractable: true })
  const jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'qa', alg: 'RS256' }] }
  const bundle = await build({ entryPoints: ['server/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' })
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'monee-auth-qa', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-29', compatibilityFlags: ['enable_request_signal'],
    bindings: { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: audience, AUTH_PIN_PEPPER: 'isolated-qa-pepper-not-a-production-secret' },
    d1Databases: ['DB'],
    ratelimits: { AUTH_RATE_LIMIT: { namespace_id: '1002', simple: { limit: 1000, period: 60 } } },
    serviceBindings: { ASSETS: async request => {
      const root = resolve('dist'), pathname = decodeURIComponent(new URL(request.url).pathname)
      const path = resolve(root, `.${pathname}`)
      if (path !== root && !path.startsWith(`${root}${sep}`)) return new Response(null, { status: 404 })
      const file = extname(path) ? path : resolve(root, 'index.html')
      const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' })[extname(file)] ?? 'application/octet-stream'
      try { return new Response(await readFile(file), { headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" } }) }
      catch { return new Response(null, { status: 404 }) }
    } },
    outboundService: async request => {
      if (request.url === `${team}/cdn-cgi/access/certs`) return Response.json(jwks)
      return new Response('External calls disabled in isolated QA', { status: 503 })
    },
  }))
  const db = await mf.getD1Database('DB')
  for (const migration of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
    for (const statement of (await readFile(`migrations/${migration}`, 'utf8')).split(';').map(sql => sql.trim()).filter(Boolean)) await db.exec(statement.replace(/\s+/g, ' '))
  }
  let subject = 'one', origin
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk)
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      headers.delete('cf-access-jwt-assertion')
      if (incoming.url?.split('?')[0] === '/auth/bootstrap') {
        headers.set('cf-access-jwt-assertion', await new SignJWT({ sub: subject, email: `${subject}@qa.invalid` })
          .setProtectedHeader({ alg: 'RS256', kid: 'qa' }).setIssuer(team).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey))
      }
      const response = await mf.dispatchFetch(`${origin}${incoming.url}`, { method: incoming.method, headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}), redirect: 'manual' })
      outgoing.statusCode = response.status
      for (const [name, value] of response.headers) if (name !== 'set-cookie') outgoing.setHeader(name, value)
      if (response.headers.getSetCookie().length) outgoing.setHeader('set-cookie', response.headers.getSetCookie())
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) { outgoing.statusCode = 500; outgoing.end('Isolated QA host failed'); console.error(error) }
  })
  do {
    if (server.listening) await new Promise(resolve => server.close(resolve))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  } while (server.address().port < 10000 || server.address().port === 10080)
  origin = `http://localhost:${server.address().port}`
  return { origin, db, setIdentity(next) { subject = next }, async close() { await new Promise(resolve => server.close(resolve)); await mf.dispose() } }
}
