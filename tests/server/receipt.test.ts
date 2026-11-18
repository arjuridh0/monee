// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createWorker, type Env } from '../../server/index'
import { PNG_BASE64, JPEG_BASE64, WEBP_BASE64, imageBytes } from '../ocr/fixtures'
import { createTestDatabase, seedTestSession, TEST_ACCOUNT_ID } from './test-database'

const domain = 'https://receipt-test.cloudflareaccess.com', audience = 'b'.repeat(64), origin = 'https://monee.example'
const png = imageBytes(PNG_BASE64)
let sessionToken: string
const result = { merchant: ' Toko ', items: [{ label: ' Roti ', amount: 8000 }], total: 8000 }
const envelope = (value: unknown = result, finishReason = 'STOP') => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] })
const vendor = vi.fn<typeof fetch>(), limit = vi.fn(async () => ({ success: true }))
const transport: typeof fetch = async (url, init) => vendor(url, init)
let db: Awaited<ReturnType<typeof createTestDatabase>>
let env: Env & { GEMINI_API_KEY: string }
function request(options: { token?: string; headers?: Record<string, string>; file?: Blob; body?: BodyInit; signal?: AbortSignal } = {}) {
  const body = new FormData(); body.set('file', options.file ?? new Blob([png], { type: 'image/png' }), 'private-name.png')
  return new Request(`${origin}/api/receipt`, { method: 'POST', headers: { Origin: origin, Cookie: `__Host-monee_session=${options.token ?? sessionToken}`, ...options.headers }, body: options.body ?? body, ...(options.signal ? { signal: options.signal } : {}) })
}
beforeAll(async () => { db = await createTestDatabase() })
afterAll(() => db.close())
beforeEach(async () => {
  vi.clearAllMocks(); db.reset(); vendor.mockImplementation(async () => Response.json(envelope())); limit.mockResolvedValue({ success: true })
  const cookie = await seedTestSession(db.binding)
  sessionToken = cookie.split('=')[1]!
  env = { ASSETS: { fetch: async () => new Response('app') }, DB: db.binding, GEMINI_API_KEY: 'test-runtime-only-secret', ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: audience, AI_RATE_LIMIT: { limit }, AUTH_RATE_LIMIT: { limit } }
})
afterEach(() => vi.useRealTimers())
it('authenticates and sends only fixed inline-image JSON, schema and runtime key to Gemini', async () => {
  const response = await createWorker(transport).fetch(request(), env)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ merchant: 'Toko', items: [{ label: 'Roti', amount: 8000 }], total: 8000 })
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('access-control-allow-origin')).toBeNull()
  expect(limit).toHaveBeenCalledWith({ key: `receipt:${TEST_ACCOUNT_ID}` })
  const [url, init] = vendor.mock.calls[0]!
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
  expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(env.GEMINI_API_KEY)
  expect(init?.redirect).toBe('manual')
  const body = JSON.parse(String(init?.body))
  expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, maxOutputTokens: 8192 })
  expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/png', data: Buffer.from(png).toString('base64') })
  expect(init?.body).not.toMatch(/private-name|test@example|verified-user|test-runtime-only-secret/)
})
it('fails closed for missing configuration independently from Groq', async () => {
  for (const changes of [{ GEMINI_API_KEY: '' }, { ACCESS_TEAM_DOMAIN: 'https://evil.example' }, { ACCESS_AUD: '' }, { AI_RATE_LIMIT: undefined }]) {
    expect((await createWorker(transport).fetch(request(), { ...env, ...changes })).status).toBe(503)
  }
  expect(vendor).not.toHaveBeenCalled()
})
it.each([302, 307, 308])('rejects Gemini redirect %s without forwarding the image or runtime key', async status => {
  vendor.mockResolvedValueOnce(new Response(null, { status, headers: { Location: 'https://untrusted.example/collect' } }))
  const response = await createWorker(transport).fetch(request(), env)
  expect(response.status).toBe(502)
  expect(response.headers.get('location')).toBeNull()
  expect(await response.text()).not.toMatch(/test-runtime-only-secret|untrusted\.example/)
  expect(vendor).toHaveBeenCalledOnce()
  expect(vendor.mock.calls[0]?.[1]?.redirect).toBe('manual')
})
it('returns only authenticated OCR readiness, independent of Groq and without provider or quota use', async () => {
  for (const [key, ready] of [[env.GEMINI_API_KEY, true], ['', false]] as const) {
    const response = await createWorker(transport).fetch(new Request(`${origin}/api/receipt?check=ready`, {
      headers: { Origin: origin, Cookie: `__Host-monee_session=${sessionToken}` },
    }), { ...env, GEMINI_API_KEY: key })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ready })
    expect(response.headers.get('cache-control')).toBe('no-store')
  }
  expect(vendor).not.toHaveBeenCalled()
  expect(limit).not.toHaveBeenCalled()
})
it('accepts Google AI Studio authorization keys containing a period', async () => {
  const aiStudioKey = `AQ.${'a'.repeat(40)}`
  const response = await createWorker(transport).fetch(new Request(`${origin}/api/receipt?check=ready`, {
    headers: { Origin: origin, Cookie: `__Host-monee_session=${sessionToken}` },
  }), { ...env, GEMINI_API_KEY: aiStudioKey })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ready: true })
  expect(vendor).not.toHaveBeenCalled()
})
it('marks missing OCR setup with a safe code and never exposes key values', async () => {
  const response = await createWorker(transport).fetch(request(), { ...env, GEMINI_API_KEY: '' })
  expect(response.status).toBe(503)
  expect(response.headers.get('X-Monee-Error')).toBe('service-not-configured')
  expect(await response.text()).not.toContain('GEMINI_API_KEY')
})
it('rejects an unrecognized or malformed Monee session before rate limiting', async () => {
  for (const token of ['', 'forged', 'unregistered-session-token-0123456789abcdefghijk']) expect((await createWorker(transport).fetch(request({ token }), env)).status).toBe(401)
  expect(limit).not.toHaveBeenCalled(); expect(vendor).not.toHaveBeenCalled()
})
it('rejects CSRF and cross-site requests', async () => {
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) expect((await createWorker(transport).fetch(request({ headers }), env)).status).toBe(403)
  expect(limit).not.toHaveBeenCalled(); expect(vendor).not.toHaveBeenCalled()
})
it('fails closed when rate limiting rejects or fails', async () => {
  limit.mockResolvedValueOnce({ success: false })
  const response = await createWorker(transport).fetch(request(), env)
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60')
  limit.mockRejectedValueOnce(new Error('private'))
  expect((await createWorker(transport).fetch(request(), env)).status).toBe(503)
  expect(vendor).not.toHaveBeenCalled()
})
it('omits unenforced string length keywords from the wire schema', async () => {
  expect((await createWorker(transport).fetch(request(), env)).status).toBe(200)
  const schema = JSON.parse(String(vendor.mock.calls[0]![1]?.body)).generationConfig.responseJsonSchema
  for (const field of [schema.properties.merchant, schema.properties.items.items.properties.label]) {
    expect(field.type).toBe('string')
    expect(field).not.toHaveProperty('minLength')
    expect(field).not.toHaveProperty('maxLength')
  }
})
it.each([
  { merchant: 'x'.repeat(121), items: result.items },
  { merchant: '   ', items: result.items },
  { items: [{ label: 'x'.repeat(121), amount: 8000 }] },
  { items: [{ label: '   ', amount: 8000 }] },
])('enforces text length and nonempty values at runtime independently of provider schema %#', async value => {
  vendor.mockResolvedValueOnce(Response.json(envelope(value)))
  expect((await createWorker(transport).fetch(request(), env)).status).toBe(502)
})
it('accepts exactly 120 characters for merchant and item labels', async () => {
  const value = { merchant: 'x'.repeat(120), items: [{ label: 'y'.repeat(120), amount: 8000 }] }
  vendor.mockResolvedValueOnce(Response.json(envelope(value)))
  const response = await createWorker(transport).fetch(request(), env)
  expect(response.status).toBe(200); expect(await response.json()).toEqual(value)
})
it('rates the authenticated account, ignoring caller supplied identity headers', async () => {
  const accountId = `acct_${'d'.repeat(64)}`
  const token = (await seedTestSession(db.binding, accountId, '9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA987654')).split('=')[1]!
  expect((await createWorker(transport).fetch(request({ token, headers: { 'Cf-Access-Authenticated-User-Email': 'attacker@example.com', 'X-User-Id': 'attacker' } }), env)).status).toBe(200)
  expect(limit).toHaveBeenCalledWith({ key: `receipt:${accountId}` })
})
it.each([
  new Blob([], { type: 'image/png' }), new Blob(['fake'], { type: 'image/png' }),
  new Blob([png], { type: 'image/jpeg' }), new Blob([png], { type: 'image/svg+xml' }),
  new Blob(['RIFFxxxxWEBP'], { type: 'image/webp' }),
])('rejects empty, unsupported or spoofed image signatures %#', async file => {
  expect((await createWorker(transport).fetch(request({ file }), env)).status).toBe(400); expect(vendor).not.toHaveBeenCalled()
})
it.each([
  { type: 'image/jpeg', bytes: imageBytes(JPEG_BASE64) },
  { type: 'image/webp', bytes: imageBytes(WEBP_BASE64) },
])('accepts matching $type signatures', async ({ type, bytes }) => {
  expect((await createWorker(transport).fetch(request({ file: new Blob([bytes], { type }) }), env)).status).toBe(200)
})
it('bounds declared, actual image and multipart stream bytes', async () => {
  for (const options of [{ headers: { 'Content-Length': '99999999' } }, { file: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }) }, { body: new Uint8Array(11 * 1024 * 1024), headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '1' } }]) {
    expect((await createWorker(transport).fetch(request(options), env)).status).toBe(413)
  }
  expect(vendor).not.toHaveBeenCalled()
})
it('rejects extra fields, duplicate files and malformed multipart', async () => {
  for (const duplicate of [false, true]) {
    const body = new FormData(); body.append('file', new Blob([png], { type: 'image/png' }), 'x.png')
    if (duplicate) body.append('file', new Blob([png], { type: 'image/png' }), 'y.png'); else body.append('model', 'evil')
    expect((await createWorker(transport).fetch(request({ body }), env)).status).toBe(400)
  }
  expect((await createWorker(transport).fetch(request({ body: 'broken', headers: { 'Content-Type': 'multipart/form-data; boundary=x' } }), env)).status).toBe(400)
  expect(vendor).not.toHaveBeenCalled()
})
it.each([{}, { items: [] }, { items: [{ label: 'x', amount: 1.5 }] }, { items: Array.from({ length: 51 }, () => ({ label: 'x', amount: 1 })) }, { date: '2026-02-30', items: result.items }])('validates provider receipt semantics %#', async value => {
  vendor.mockResolvedValueOnce(Response.json(envelope(value)))
  expect((await createWorker(transport).fetch(request(), env)).status).toBe(502)
})
it('rejects oversized, blocked, truncated and non-JSON provider responses', async () => {
  for (const response of [new Response('x'.repeat(128 * 1024 + 1)), Response.json(envelope(result, 'MAX_TOKENS')), Response.json({ promptFeedback: { blockReason: 'SAFETY' } }), new Response('<html>private</html>')]) {
    vendor.mockResolvedValueOnce(response)
    const output = await createWorker(transport).fetch(request(), env)
    expect(output.status).toBe(502); expect((await output.text()).length).toBeLessThan(300)
  }
})
it('accepts text parts carrying Gemini metadata without leaking that metadata', async () => {
  vendor.mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
    { text: 'private reasoning', thought: true },
    { text: JSON.stringify(result), thoughtSignature: 'opaque-provider-metadata' },
  ] } }], usageMetadata: { totalTokenCount: 100 } }))
  const response = await createWorker(transport).fetch(request(), env)
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(JSON.parse(body)).toEqual({ merchant: 'Toko', items: [{ label: 'Roti', amount: 8000 }], total: 8000 })
  expect(body).not.toMatch(/private reasoning|opaque-provider|usageMetadata/)
})
it.each([
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'evil' } }] } }] },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 123 }] } }] },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}', thoughtSignature: {} }] } }] },
])('rejects malformed provider parts %#', async value => {
  vendor.mockResolvedValueOnce(Response.json(value))
  expect((await createWorker(transport).fetch(request(), env)).status).toBe(502)
})
it.each([401, 403, 429, 500])('sanitizes upstream HTTP %i', async status => {
  vendor.mockResolvedValueOnce(new Response(env.GEMINI_API_KEY, { status }))
  const output = await createWorker(transport).fetch(request(), env)
  expect(output.status).toBe(status === 429 ? 429 : 502); expect(await output.text()).not.toContain(env.GEMINI_API_KEY)
})
it('cancels before upload and during fetch', async () => {
  expect((await createWorker(transport).fetch(request({ signal: AbortSignal.abort() }), env)).status).toBe(408)
  expect(vendor).not.toHaveBeenCalled()
  const controller = new AbortController()
  vendor.mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
  const pending = createWorker(transport).fetch(request({ signal: controller.signal }), env)
  await vi.waitFor(() => expect(vendor).toHaveBeenCalled()); controller.abort()
  expect((await pending).status).toBe(408)
})
it('times out provider fetch and a stalled response body', async () => {
  vi.useFakeTimers()
  for (const stallBody of [false, true]) {
    vendor.mockImplementationOnce(async (_url, init) => stallBody ? new Response(new ReadableStream()) : new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    const pending = createWorker(transport).fetch(request(), env)
    await vi.waitFor(() => expect(vendor).toHaveBeenCalledTimes(stallBody ? 2 : 1))
    await vi.advanceTimersByTimeAsync(30_001)
    expect((await pending).status).toBe(504)
  }
})
it('bounds a slow upload stream and cancels it before contacting Gemini', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  const input = new Request(`${origin}/api/receipt`, {
    method: 'POST', headers: { Origin: origin, Cookie: `__Host-monee_session=${sessionToken}`, 'Content-Type': 'multipart/form-data; boundary=x' },
    body: new ReadableStream({ cancel }), duplex: 'half',
  } as RequestInit)
  const pending = createWorker(transport).fetch(input, env)
  await vi.waitFor(() => expect(limit).toHaveBeenCalled())
  await vi.advanceTimersByTimeAsync(30_001)
  expect((await pending).status).toBe(504); expect(cancel).toHaveBeenCalled(); expect(vendor).not.toHaveBeenCalled()
})
it('handles receipt methods without SPA fallback', async () => {
  const output = await createWorker(transport).fetch(new Request(`${origin}/api/receipt`), env)
  expect(output.status).toBe(405); expect(output.headers.get('allow')).toBe('POST')
})
