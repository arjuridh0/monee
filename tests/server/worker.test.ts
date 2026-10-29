// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createWorker, type Env } from '../../server/index'

const domain = 'https://monee-test.cloudflareaccess.com'
const audience = 'a'.repeat(64)
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let jwks: object
let token: string
const origin = 'https://monee.example'
const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])
const limit = vi.fn(async () => ({ success: true }))
const assets = vi.fn(async () => new Response('app'))
const env: Env = {
  GROQ_API_KEY: 'gsk_server_secret_example', ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: audience,
  AI_RATE_LIMIT: { limit }, ASSETS: { fetch: assets },
}
const vendor = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ text: 'makan 25rb' }))
const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === `${domain}/cdn-cgi/access/certs`) return Response.json(jwks)
  return vendor(input, init)
})
const worker = () => createWorker(transport)
async function jwt(overrides: Record<string, unknown> = {}, secret = keys.privateKey) {
  return new SignJWT({ sub: 'user-1', email: 'user@example.com', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(domain).setAudience(audience)
    .setIssuedAt().setExpirationTime('5m').sign(secret)
}
function request(options: { token?: string; origin?: string; file?: Blob; fields?: Record<string, string>; body?: BodyInit; headers?: Record<string, string>; method?: string; path?: string } = {}) {
  const form = new FormData()
  form.set('file', options.file ?? new Blob([audio], { type: 'audio/webm' }), 'voice.webm')
  for (const [key, value] of Object.entries(options.fields ?? {})) form.append(key, value)
  const method = options.method ?? 'POST'
  return new Request(`${origin}${options.path ?? '/api/transcribe'}`, {
    method, headers: { Origin: options.origin ?? origin, 'Cf-Access-Jwt-Assertion': options.token ?? token, ...options.headers },
    ...(method === 'GET' ? {} : { body: options.body ?? form }),
  })
}
beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true })
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256', use: 'sig' }] }
  token = await jwt()
})
beforeEach(() => { vi.clearAllMocks(); limit.mockResolvedValue({ success: true }); vendor.mockResolvedValue(Response.json({ text: 'makan 25rb' })) })

describe('managed transcription Worker', () => {
  it('fails closed with missing configuration and never contacts Groq', async () => {
    const response = await worker().fetch(request(), { ...env, GROQ_API_KEY: '' })
    expect(response.status).toBe(503); expect(transport).not.toHaveBeenCalled()
  })
  it('rejects invalid issuer configuration before any outbound request', async () => {
    for (const domain of ['https://attacker.example', 'http://test.cloudflareaccess.com', 'https://test.cloudflareaccess.com@attacker.example', 'https://test.cloudflareaccess.com/path']) {
      expect((await worker().fetch(request(), { ...env, ACCESS_TEAM_DOMAIN: domain })).status).toBe(503)
    }
    expect(transport).not.toHaveBeenCalled()
  })
  it('verifies Access JWT and forwards only fixed server model and key', async () => {
    const response = await worker().fetch(request(), env)
    expect(response.status).toBe(200)
    const output = await response.text()
    expect(JSON.parse(output)).toEqual({ text: 'makan 25rb' })
    expect(output).not.toContain('gsk_')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(limit).toHaveBeenCalledWith({ key: expect.stringContaining('user-1') })
    const [url, init] = vendor.mock.calls[0]!
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer gsk_server_secret_example')
    const body = init?.body as FormData
    expect(body.get('model')).toBe('whisper-large-v3'); expect(body.get('language')).toBe('id')
    expect(body.get('file')).toBeInstanceOf(File)
    expect(init?.redirect).toBe('error')
  })
  it.each(['', 'forged-token'])('rejects absent or forged tokens: %s', async value => {
    const response = await worker().fetch(request({ token: value }), env)
    expect(response.status).toBe(401); expect(vendor).not.toHaveBeenCalled()
  })
  it('rejects signed JWT with wrong audience, issuer, expiry, missing sub or wrong signature', async () => {
    const base = { email: 'user@example.com', sub: 'user-1', iss: domain, aud: audience, exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000) }
    const other = await generateKeyPair('RS256')
    for (const [changes, key] of [
      [{ aud: 'b'.repeat(64) }, keys.privateKey], [{ iss: 'https://evil.example' }, keys.privateKey],
      [{ exp: 1 }, keys.privateKey], [{ exp: undefined }, keys.privateKey], [{ iat: undefined }, keys.privateKey],
      [{ sub: undefined }, keys.privateKey], [{}, other.privateKey],
    ] as const) {
      const invalid = await new SignJWT({ ...base, ...changes }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(key)
      expect((await worker().fetch(request({ token: invalid }), env)).status).toBe(401)
    }
    expect(vendor).not.toHaveBeenCalled()
  })
  it('rejects cross-origin requests even with a valid token', async () => {
    expect((await worker().fetch(request({ origin: 'https://evil.example' }), env)).status).toBe(403)
    expect(transport).not.toHaveBeenCalled()
  })
  it('limits authenticated users and fails closed if the limiter is unavailable', async () => {
    limit.mockResolvedValueOnce({ success: false })
    const response = await worker().fetch(request(), env)
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60')
    limit.mockRejectedValueOnce(new Error('unavailable'))
    expect((await worker().fetch(request(), env)).status).toBe(503)
    expect((await worker().fetch(request(), { ...env, AI_RATE_LIMIT: undefined })).status).toBe(503)
    expect(vendor).not.toHaveBeenCalled()
  })
  it.each([
    { file: new Blob([], { type: 'audio/webm' }) },
    { file: new Blob(['fake audio'], { type: 'audio/webm' }) },
    { file: new Blob([audio], { type: 'text/html' }) },
    { fields: { model: 'attacker-model', url: 'https://evil.example', apiKey: 'leak' } },
    { body: 'broken', headers: { 'content-type': 'multipart/form-data; boundary=missing' } },
  ])('rejects malformed or unsupported uploads %#', async options => {
    expect((await worker().fetch(request(options), env)).status).toBe(400)
    expect(vendor).not.toHaveBeenCalled()
  })
  it('caps upload size from headers and actual streamed bytes', async () => {
    expect((await worker().fetch(request({ headers: { 'content-length': String(12 * 1024 * 1024) } }), env)).status).toBe(413)
    const huge = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/webm' })
    expect((await worker().fetch(request({ file: huge }), env)).status).toBe(413)
    expect((await worker().fetch(request({ body: new Uint8Array(11 * 1024 * 1024), headers: {
      'content-type': 'multipart/form-data; boundary=test', 'content-length': '10',
    } }), env)).status).toBe(413)
    expect(vendor).not.toHaveBeenCalled()
  })
  it('rejects duplicate file parts', async () => {
    const body = new FormData()
    body.append('file', new Blob([audio], { type: 'audio/webm' }), 'one.webm')
    body.append('file', new Blob([audio], { type: 'audio/webm' }), 'two.webm')
    expect((await worker().fetch(request({ body }), env)).status).toBe(400)
    expect(vendor).not.toHaveBeenCalled()
  })
  it('does not contact the provider when a caller already cancelled', async () => {
    const cancelled = new Request(request(), { signal: AbortSignal.abort() })
    expect((await worker().fetch(cancelled, env)).status).toBe(408)
    expect(vendor).not.toHaveBeenCalled()
  })
  it('caps provider response bytes and never returns oversized error bodies', async () => {
    vendor.mockResolvedValueOnce(new Response('gsk_secret'.repeat(9000)))
    const response = await worker().fetch(request(), env)
    expect(response.status).toBe(502); expect((await response.text()).length).toBeLessThan(300)
  })
  it.each([401, 403, 429, 500])('sanitizes upstream failure %i', async status => {
    vendor.mockResolvedValueOnce(new Response('gsk_server_secret_example private vendor error', { status }))
    const response = await worker().fetch(request(), env)
    expect(response.status).toBe(status === 429 ? 429 : 502)
    expect(await response.text()).not.toMatch(/gsk_|private vendor/)
  })
  it.each([{}, { text: '' }, { text: 'x'.repeat(4001) }, { text: 1 }])('rejects invalid provider responses %#', async body => {
    vendor.mockResolvedValueOnce(Response.json(body))
    expect((await worker().fetch(request(), env)).status).toBe(502)
  })
  it('aborts an upstream request on timeout', async () => {
    vi.useFakeTimers()
    vendor.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    try {
      const result = worker().fetch(request(), env)
      await vi.waitFor(() => expect(vendor).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(30_001)
      expect((await result).status).toBe(504)
    } finally { vi.useRealTimers() }
  })
  it('never turns unknown API routes/methods into the SPA', async () => {
    expect((await worker().fetch(request({ path: '/api', method: 'GET' }), env)).status).toBe(404)
    expect((await worker().fetch(request({ path: '/api/missing', method: 'GET' }), env)).status).toBe(404)
    expect((await worker().fetch(request({ method: 'GET' }), env)).status).toBe(405)
    expect(assets).not.toHaveBeenCalled()
    expect(await (await worker().fetch(new Request(`${origin}/riwayat`), env)).text()).toBe('app')
  })
  it('serves a network-only sign-in return path without forwarding to the SPA', async () => {
    const response = await worker().fetch(new Request(`${origin}/auth/refresh`), env)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(assets).not.toHaveBeenCalled()
  })
})
