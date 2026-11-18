// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorker, type Env } from '../../server/index'
import { createTestDatabase, seedTestSession, TEST_ACCOUNT_ID } from './test-database'

const domain = 'https://monee-test.cloudflareaccess.com'
const audience = 'a'.repeat(64)
const origin = 'https://monee.example'
const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])
const limit = vi.fn(async () => ({ success: true }))
const assets = vi.fn(async () => new Response('app'))
let env: Env
let db: Awaited<ReturnType<typeof createTestDatabase>>
let sessionCookie = ''
const vendor = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ text: 'makan 25rb' }))
const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => vendor(input, init))
const worker = () => createWorker(transport)
function request(options: { token?: string; origin?: string; file?: Blob; fields?: Record<string, string>; body?: BodyInit; headers?: Record<string, string>; method?: string; path?: string } = {}) {
  const form = new FormData()
  form.set('file', options.file ?? new Blob([audio], { type: 'audio/webm' }), 'voice.webm')
  for (const [key, value] of Object.entries(options.fields ?? {})) form.append(key, value)
  const method = options.method ?? 'POST'
  return new Request(`${origin}${options.path ?? '/api/transcribe'}`, {
    method, headers: { Origin: options.origin ?? origin, Cookie: options.token !== undefined ? `__Host-monee_session=${options.token}` : sessionCookie, ...options.headers },
    ...(method === 'GET' ? {} : { body: options.body ?? form }),
  })
}
beforeAll(async () => { db = await createTestDatabase() })
afterAll(() => db.close())
beforeEach(async () => {
  vi.clearAllMocks(); db.reset(); limit.mockResolvedValue({ success: true }); vendor.mockResolvedValue(Response.json({ text: 'makan 25rb' }))
  sessionCookie = await seedTestSession(db.binding)
  env = { GROQ_API_KEY: 'gsk_server_secret_example', ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: audience,
    AI_RATE_LIMIT: { limit }, AUTH_RATE_LIMIT: { limit }, DB: db.binding, ASSETS: { fetch: assets } }
})

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
  it('verifies the Monee session and forwards only fixed server model and key', async () => {
    const response = await worker().fetch(request(), env)
    expect(response.status).toBe(200)
    const output = await response.text()
    expect(JSON.parse(output)).toEqual({ text: 'makan 25rb' })
    expect(output).not.toContain('gsk_')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(limit).toHaveBeenCalledWith({ key: `voice:${TEST_ACCOUNT_ID}` })
    const [url, init] = vendor.mock.calls[0]!
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer gsk_server_secret_example')
    const body = init?.body as FormData
    expect(body.get('model')).toBe('whisper-large-v3'); expect(body.get('language')).toBe('id')
    expect(body.get('file')).toBeInstanceOf(File)
    expect(init?.redirect).toBe('manual')
  })
  it.each(['', 'forged-token'])('rejects absent or forged tokens: %s', async value => {
    const response = await worker().fetch(request({ token: value }), env)
    expect(response.status).toBe(401); expect(vendor).not.toHaveBeenCalled()
  })
  it.each([302, 307, 308])('rejects provider redirect %s without forwarding audio or credentials', async status => {
    vendor.mockResolvedValueOnce(new Response(null, { status, headers: { Location: 'https://untrusted.example/collect' } }))
    const response = await worker().fetch(request(), env)
    expect(response.status).toBe(502)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.text()).not.toMatch(/gsk_|untrusted\.example/)
    expect(vendor).toHaveBeenCalledOnce()
    expect(vendor.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })
  it('rejects unknown or expired Monee session cookies before calling Groq', async () => {
    expect((await worker().fetch(request({ token: 'forged-session-token-12345678901234567890' }), env)).status).toBe(401)
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
  it('sends expired service sessions through the protected bootstrap route', async () => {
    const response = await worker().fetch(new Request(`${origin}/auth/refresh`), env)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/bootstrap')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(assets).not.toHaveBeenCalled()
  })
  it('uses one fixed authentication destination and ignores redirect parameters', async () => {
    const receipt = await worker().fetch(new Request(`${origin}/auth/refresh?service=receipt&return=https://evil.example`), env)
    expect(receipt.headers.get('location')).toBe('/auth/bootstrap')
    const unknown = await worker().fetch(new Request(`${origin}/auth/refresh?service=https://evil.example`), env)
    expect(unknown.headers.get('location')).toBe('/auth/bootstrap')
  })
  it.each(['/api/transcribe', '/api/receipt'])('redirects %s recovery to bootstrap without provider calls or quota use', async path => {
    const response = await worker().fetch(new Request(`${origin}${path}?auth=refresh`, {
      headers: { Cookie: sessionCookie, 'Sec-Fetch-Site': 'same-origin' },
    }), env)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/bootstrap')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(vendor).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
    expect(assets).not.toHaveBeenCalled()
  })
  it.each(['', 'forged-token'])('does not expose readiness to an invalid session token: %s', async session => {
    const response = await worker().fetch(new Request(`${origin}/api/transcribe?check=ready`, {
      headers: { Cookie: `__Host-monee_session=${session}` },
    }), env)
    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    expect(vendor).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
  })
  it('never treats an upload as an authentication-only GET when a recovery query is supplied', async () => {
    const response = await worker().fetch(request({ path: '/api/transcribe?auth=refresh', origin: 'https://evil.example' }), env)
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
    expect(vendor).not.toHaveBeenCalled()
  })
  it('separates temporary service failure from missing setup without returning secrets', async () => {
    limit.mockRejectedValueOnce(new Error('secret infrastructure failure'))
    const transient = await worker().fetch(request(), env)
    expect(transient.headers.get('X-Monee-Error')).toBe('service-unavailable')
    const missing = await worker().fetch(request(), { ...env, GROQ_API_KEY: '' })
    expect(missing.headers.get('X-Monee-Error')).toBe('service-not-configured')
    expect(await transient.text()).not.toContain('secret')
  })
  it('checks voice readiness using authenticated GET without uploading or consuming quota', async () => {
    for (const [key, ready] of [[env.GROQ_API_KEY, true], ['', false]] as const) {
      const response = await worker().fetch(request({ method: 'GET', path: '/api/transcribe?check=ready' }), { ...env, GROQ_API_KEY: key })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ready })
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(limit).not.toHaveBeenCalled()
    expect(vendor).not.toHaveBeenCalled()
  })
  it('does not expose readiness to invalid assertions or cross-site callers', async () => {
    expect((await worker().fetch(request({ method: 'GET', token: 'forged', path: '/api/transcribe?check=ready' }), env)).status).toBe(401)
    expect((await worker().fetch(request({ method: 'GET', headers: { 'Sec-Fetch-Site': 'cross-site' }, path: '/api/transcribe?check=ready' }), env)).status).toBe(403)
  })
})
