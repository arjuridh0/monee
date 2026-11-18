// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createWorker, type Env } from '../../server/index'
import { createTestDatabase } from './test-database'

const origin = 'https://monee.example', team = 'https://test.cloudflareaccess.com', audience = 'a'.repeat(64)
let db: Awaited<ReturnType<typeof createTestDatabase>>, worker: ReturnType<typeof createWorker>, env: Env
let keys: Awaited<ReturnType<typeof generateKeyPair>>
const cookie = (response: Response, name: string) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0] ?? ''
function post(path: string, body: object = {}, cookies = '', extra: HeadersInit = {}) {
  return new Request(`${origin}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookies, ...extra }, body: JSON.stringify(body) })
}
async function verified(intent = 'register', subject = 'one') {
  const start = await worker.fetch(post('/api/auth/verify', { intent }), env)
  expect(start.status).toBe(200)
  const pending = cookie(start, '__Host-monee_verify')
  const jwt = await new SignJWT({ sub: subject, email: `${subject}@example.com` }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(team).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey)
  const response = await worker.fetch(new Request(`${origin}/auth/bootstrap`, { headers: { Cookie: pending, 'Cf-Access-Jwt-Assertion': jwt } }), env)
  expect(response.status).toBe(302)
  return pending
}
async function register(subject = 'one') {
  return worker.fetch(post('/api/auth/complete', { pin: '582916', confirmPin: '582916' }, await verified('register', subject)), env)
}
beforeAll(async () => {
  db = await createTestDatabase(); keys = await generateKeyPair('RS256', { extractable: true })
  const jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' }] }
  worker = createWorker(async () => Response.json(jwks))
  env = { ASSETS: { fetch: async () => new Response('app') }, DB: db.binding, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: audience,
    AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) }, AUTH_PIN_PEPPER: 'test-pepper-with-at-least-32-characters' } as Env
})
beforeEach(() => { vi.useRealTimers(); db.reset() })
afterAll(() => db.close())
it('fails closed when the PIN secret is absent', async () => {
  expect((await worker.fetch(post('/api/auth/login', { email: 'one@example.com', pin: '582916' }), { ...env, AUTH_PIN_PEPPER: undefined } as Env)).status).toBe(503)
})
it('registers a verified email, logs in from another device, and keeps credentials private', async () => {
  const registered = await register()
  expect(registered.status).toBe(200)
  const first = await registered.json() as { accountId: string }
  const login = await worker.fetch(post('/api/auth/login', { email: 'ONE@example.com', pin: '582916' }), env)
  expect(login.status).toBe(200)
  expect(await login.json()).toMatchObject({ accountId: first.accountId })
  expect(cookie(login, '__Host-monee_session')).not.toBe(cookie(registered, '__Host-monee_session'))
  expect(login.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Strict/)
  const stored = await db.binding.prepare('SELECT * FROM account_credentials').first()
  expect(JSON.stringify(stored)).not.toContain('582916')
  expect(JSON.stringify(stored)).not.toContain('test-pepper')
})
it('requires verified email and rejects CSRF, expired proof, and reused proof', async () => {
  expect((await worker.fetch(post('/api/auth/complete', { pin: '582916', confirmPin: '582916' }), env)).status).toBe(401)
  expect((await worker.fetch(post('/api/auth/verify', { intent: 'register' }, '', { Origin: 'https://evil.example' }), env)).status).toBe(403)
  const proof = await verified()
  expect((await worker.fetch(post('/api/auth/complete', { pin: '582916', confirmPin: '582916' }, proof), env)).status).toBe(200)
  expect((await worker.fetch(post('/api/auth/complete', { pin: '582916', confirmPin: '582916' }, proof), env)).status).toBe(401)
  const expired = await verified('register', 'two')
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000)
  expect((await worker.fetch(post('/api/auth/complete', { pin: '582916', confirmPin: '582916' }, expired), env)).status).toBe(401)
  vi.restoreAllMocks()
})
it('locks the account after five failures across Worker instances', async () => {
  await register()
  for (let i = 0; i < 5; i++) expect((await createWorker().fetch(post('/api/auth/login', { email: 'one@example.com', pin: '000001' }), env)).status).toBe(401)
  expect((await createWorker().fetch(post('/api/auth/login', { email: 'one@example.com', pin: '582916' }), env)).status).toBe(429)
})
it('preserves the account ID when activating an existing Access account', async () => {
  const jwt = await new SignJWT({ sub: 'legacy', email: 'legacy@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(team).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey)
  const old = await worker.fetch(new Request(`${origin}/auth/bootstrap`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), { ...env, AUTH_PIN_PEPPER: undefined } as Env)
  const oldCookie = cookie(old, '__Host-monee_session')
  const oldSession = await worker.fetch(new Request(`${origin}/api/session`, { headers: { Cookie: oldCookie } }), env)
  const data = await oldSession.json() as { accountId: string }
  const activated = await register('legacy')
  expect(await activated.json()).toMatchObject({ accountId: data.accountId })
  expect((await db.binding.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>())?.n).toBe(1)
})
it('changes an account PIN, revokes other devices, and keeps login independent of Access configuration', async () => {
  const first = await register(), active = cookie(first, '__Host-monee_session')
  const second = await worker.fetch(post('/api/auth/login', { email: 'one@example.com', pin: '582916' }), env)
  const changed = await worker.fetch(post('/api/auth/change-pin', { currentPin: '582916', pin: '739152', confirmPin: '739152' }, active), env)
  expect(changed.status).toBe(200)
  expect((await worker.fetch(new Request(`${origin}/api/session`, { headers: { Cookie: cookie(second, '__Host-monee_session') } }), env)).status).toBe(401)
  expect((await worker.fetch(post('/api/auth/login', { email: 'one@example.com', pin: '582916' }), env)).status).toBe(401)
  expect((await worker.fetch(post('/api/auth/login', { email: 'one@example.com', pin: '739152' }), { ...env, ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined } as Env)).status).toBe(200)
})
it('rejects verification from a different identity during activation and stale Access proofs', async () => {
  const registered = await register(), active = cookie(registered, '__Host-monee_session')
  const start = await worker.fetch(post('/api/auth/verify', { intent: 'activate' }, active), env)
  const other = await new SignJWT({ sub: 'other', email: 'other@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(team).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey)
  const response = await worker.fetch(new Request(`${origin}/auth/bootstrap`, { headers: { Cookie: cookie(start, '__Host-monee_verify'), 'Cf-Access-Jwt-Assertion': other } }), env)
  expect(response.status).toBe(403)
  const stale = await new SignJWT({ sub: 'one', email: 'one@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(team).setAudience(audience).setIssuedAt(Math.floor(Date.now() / 1000) - 1200).setExpirationTime('5m').sign(keys.privateKey)
  expect((await worker.fetch(new Request(`${origin}/auth/bootstrap`, { headers: { Cookie: cookie(start, '__Host-monee_verify'), 'Cf-Access-Jwt-Assertion': stale } }), env)).status).toBe(401)
})
it('renews only explicit activity, expires after 30 days, and revokes on reset', async () => {
  const registered = await register(), session = cookie(registered, '__Host-monee_session')
  const initial = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(initial + 29 * 86400_000)
  expect((await worker.fetch(new Request(`${origin}/api/session`, { headers: { Cookie: session } }), env)).status).toBe(200)
  vi.spyOn(Date, 'now').mockReturnValue(initial + 31 * 86400_000)
  expect((await worker.fetch(new Request(`${origin}/api/session`, { headers: { Cookie: session } }), env)).status).toBe(401)
  vi.restoreAllMocks()
  const login = await worker.fetch(post('/api/auth/login', { email: 'one@example.com', pin: '582916' }), env)
  const active = cookie(login, '__Host-monee_session')
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 29 * 86400_000)
  expect((await worker.fetch(post('/api/session/activity', {}, active), env)).status).toBe(204)
  vi.restoreAllMocks()
  const reset = await worker.fetch(post('/api/auth/complete', { pin: '739152', confirmPin: '739152' }, await verified('recover')), env)
  expect(reset.status).toBe(200)
  expect((await worker.fetch(new Request(`${origin}/api/session`, { headers: { Cookie: active } }), env)).status).toBe(401)
  expect((await worker.fetch(post('/api/auth/login', { email: 'one@example.com', pin: '739152' }), env)).status).toBe(200)
})
